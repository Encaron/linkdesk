/**
 * update-download——E6#57.6 下载腿（`download`）：流式下载 + sha256 校验 + 启动残留清理/**方向守卫**。
 *
 * 设计：[06-主软件更新/01-更新机制设计.md](../../docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/01-更新机制设计.md)
 * §2.4（`.part` 临时文件 / 进度 / sha256 校验 / rename / 残留清理）+ §2.5；契约见
 * [07-数据流通格式.md](../../docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/07-数据流通格式.md) §三。
 *
 * 本模块产出两样东西：**#57.4 注入的那条腿**（`UpdateServiceDeps.download`）＋ **启动清理**
 * （`cleanupUpdateResidue`，main boot 调一次，对标 plugin-download 的 `cleanupStaleDownloads`）。
 * 与 `plugin-download.ts`（插件包那条腿）的分工：那条下 `.linkdesk-plugin` 走 `tmp/`、带重试与并发唯一化；
 * 本腿下**一个安装器 exe** 走 `{userData}/update/`、**腿内不重试**（④）。故不共用代码，但共用同一条出网
 * 出口（`main-fetch.ts`）与「空闲超时判挂死」的纪律。
 *
 * 🔴 **四个最容易复发、且都不出声的坑，各有一处防线**：
 * ① **`.part` 必须先写、校验通过才改正式名**——直接写正式名 = 半截文件冒充完整安装器，用户点
 *    「重启并更新」时装的正是这个坏包（同插件侧缝隙 B1）。
 * ② **校验值取自 `update.checksum`**（#57.5 已从 `asset.digest` 取出）；拿不到时**降级放行**
 *    ＋把 `checksum-unavailable` 记进 `downloaded.warning`，不拒装（01 §2.4 + 2026-09-12 拍板）。
 *    ⚠️ 这笔账**不许**塞 `idle.lastError`——用户直接点「重启并更新」根本不经过 `idle`，会在最短路径上丢。
 * ③ **启动扫盘要按版本方向删旧安装器**（`updateTargetDirection`，**复用插件侧锚①**，不另写判断）——
 *    用户升到新版后，磁盘里还躺着上一轮下好的**旧安装器** ⇒ 点「重启并更新」会**把自己降级**。
 * ④ **腿内不自动重试**（2026-09-12 定案）：没有断点续传时自动重下 = 悄悄重复下载几十 MB、还把失败吞掉。
 *    #57.6g 给用户的出口是「失败出声 ＋ [重试]」；自动重试若要，归调度层（#57.9）统一决定，不在这条腿里私藏。
 *
 * ⚠️ **本格不引入「更新状态持久化」**：内存态从 `uninitialized` 出发，启动后**本来就不可能**是
 * `downloading`（没有假状态可复活，#57.6f 因此由构造满足，判据见清单）。跨重启真要记住的是「我正在装」
 * ——那是 #57.7a 的事（01 §2.5「退出前把 `updating` 态落盘」）。
 */

import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { envService } from './env-service.js';
import { loadProduct } from '../product.js';
import { mainFetch } from './main-fetch.js';
import { updateTargetDirection } from '../../src/core/utils/plugin/semverUtils.js';
import { UpdateLegError, type DownloadLeg } from './update-service.js';
import { createIdleWatchdog } from './idle-watchdog.js';
import type { UpdateError, UpdateInfo } from '../../src/core/types/ipc/update';

/**
 * 下载**空闲**超时——连续 N ms 没有任何新字节到达即判失败。判据是「**还在动吗**」，不是「够快吗」：
 * 大安装器在慢网上正常下载动辄几十秒，按总时长掐会把**健康下载**判死（plugin-download 同款判据，
 * E6#73e 立的）。
 */
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000;

/** 下载目录名——`{userData}/update`（01 §2.4） */
const UPDATE_DIR_NAME = 'update';

/** 正式安装器前缀——`linkdesk-update-{version}.exe`（01 §2.4）。⚠️ 这是**本机制自己的**内部文件名，不与
 *  发布侧的 asset 名（`linkdesk-setup-{version}.exe`，#57.5 那份）共用契约：那个要在 Release 上逐字符对上，
 *  这个只要 **写名与扫名两处一致**即可——故两处共用下面这一组常量，不许各写一份字面量。 */
const INSTALLER_PREFIX = 'linkdesk-update-';
const INSTALLER_EXT = 'exe';
/** 半截标记——写满且校验通过才 rename 去掉它（`.part` 存在 = 这份文件不可信） */
const PART_SUFFIX = '.part';
/** 名字 → 版本 的解析（与 `installerFileName` 同一组常量，往返一致由单测钉住） */
const INSTALLER_NAME_RE = new RegExp(`^${INSTALLER_PREFIX}(.+)\\.${INSTALLER_EXT}$`);

/** 下载目录——`{userData}/update` */
export function updateDownloadDir(): string {
  return path.join(envService.appDataDir(), UPDATE_DIR_NAME);
}

/** 正式安装器文件名（唯一拼接口——写与扫都走它，见 `INSTALLER_PREFIX` 注释） */
export function installerFileName(version: string): string {
  return `${INSTALLER_PREFIX}${version}.${INSTALLER_EXT}`;
}

/** 正式安装器路径 */
export function installerPathFor(version: string, dir: string = updateDownloadDir()): string {
  return path.join(dir, installerFileName(version));
}

/** 文件名 → 版本（不认识的名字返回 `null` = 不是本机制的产物，**不碰**） */
export function installerVersionFromName(name: string): string | null {
  const m = INSTALLER_NAME_RE.exec(name);
  return m ? m[1] : null;
}

/**
 * 下载腿依赖——生产缺省即真值源；注入只为让单测落在临时目录 / 让「挂死」这条最贵的失败模式
 * 能被确定性单测（真等 30 秒的测试没人会跑）。
 */
export interface UpdateDownloadDeps {
  /** 下载目录（缺省 `{userData}/update`） */
  getUpdateDir?: () => string;
  /** 空闲超时预算（缺省 `DOWNLOAD_IDLE_TIMEOUT_MS`） */
  idleTimeoutMs?: number;
}

/** 造下载腿——返回 `(update, onProgress) => Promise<{installerPath, warning?}>`，直接喂给 `new UpdateService({ download })` */
export function createUpdateDownloader(deps: UpdateDownloadDeps = {}): DownloadLeg {
  const getUpdateDir = deps.getUpdateDir ?? updateDownloadDir;
  const idleMs = deps.idleTimeoutMs ?? DOWNLOAD_IDLE_TIMEOUT_MS;

  return async function download(update: UpdateInfo, onProgress): Promise<{ installerPath: string; warning?: UpdateError }> {
    const url = update.downloadUrl;
    // 状态机只在 `available` 态放行下载，而 `available` 由检查腿产出、必带直链 ⇒ 走到这里说明上游
    // 给了残缺的 UpdateInfo。**不许**拿空 URL 去 fetch（会抛成 network，把「发布侧没给包」说成网络不好）。
    if (!url) {
      throw new UpdateLegError({ code: 'asset-missing', message: '未拿到安装包直链——发布侧可能改过安装包文件名' });
    }

    const installerPath = installerPathFor(update.version, getUpdateDir());
    const partPath = `${installerPath}${PART_SUFFIX}`;

    // ④ 复用：盘上已有一份**同名且校验对得上**的安装器（上一轮下完没来得及用 / 进程在 rename 与落态之间被杀）
    //    ⇒ 直接交差，不再下几十 MB。⚠️ **只在有校验值时才敢复用**——没附校验值就无从证明它是完整的，
    //    宁可重下（少花几十兆 ≪ 装到坏包）。
    const reused = await tryReuse(installerPath, update.checksum);
    if (reused !== null) {
      onProgress({ transferred: reused, total: update.size ?? reused, percent: 100 });
      return { installerPath };
    }

    try {
      await fs.mkdir(path.dirname(installerPath), { recursive: true });
    } catch (e) {
      throw writeFailure('安装器目录创建失败——{{detail}}', e);
    }

    // 单一取消来源：本函数自持的空闲看门狗（契约里没有外部 signal——取消下载的入口由状态机与壳定，#57.7 起）。
    // 走**唯一实现** `idle-watchdog.ts`——插件包腿同款（2026-09-12 归一，防「两处各写一份、只改一处」）。
    const wd = createIdleWatchdog(idleMs);
    /** 中断归因——**用「谁 abort 的」判定，不靠错误类名**（DOMException 跨环境形态不一） */
    const interrupted = (): UpdateLegError => wd.timedOut()
      ? err('network', '下载超时——{{seconds}} 秒无数据（网络或代理不稳）', { seconds: idleMs / 1000 })
      : err('interrupted', '下载中断——连接被断开');

    const hash = createHash('sha256');
    let received = 0;
    let total = update.size ?? 0;

    try {
      let resp: Response;
      // 🔴 看门狗**必须在 fetch 之前就装上**：服务器「连上了但不回头」（收到了 TCP 连接、永远不回响应头）
      // 时 `mainFetch` 自己会挂到天荒地老——只有响应头到手后才装表 = 这条最贵的挂死模式没有出口。
      wd.bump();
      try {
        resp = await mainFetch(url, { redirect: 'follow', signal: wd.signal });
      } catch (e) {
        // 连接阶段就失败（DNS / 代理未生效 / ECONNRESET）——**这是 `network` 而不是 `interrupted`**，
        // 两者对用户与排查是两件事（见 wire 类型里 `interrupted` 的分界注释）
        if (wd.signal.aborted) throw interrupted();
        throw err('network', '下载连不上——{{detail}}（使用代理时确认系统代理已生效）', { detail: msg(e) });
      }
      if (!resp.ok || !resp.body) {
        // 404/403 = 直链失效或无权限（发布侧改过/删过包）⇒ 归 `asset-missing`，把矛头指向该指的地方；
        // 其余（5xx 等）是服务端瞬时状态 ⇒ `network`。**不许**一律报 network（第 3.5 层教训）。
        const code: UpdateError['code'] = resp.status === 404 || resp.status === 403 ? 'asset-missing' : 'network';
        // `statusText`（`Not Found`）是 HTTP 协议原文、无语言可言，与状态码一起当**不透明值**传。
        const status = resp.statusText ? `${resp.status} ${resp.statusText}` : resp.status;
        throw err(code, '下载失败 HTTP {{status}}', { status });
      }
      total = Number(resp.headers.get('content-length')) || total;

      // `.part` **截断打开**（`w`）：即便上一轮留下同名半截，也从零开始，不接在尾巴后面
      const handle = await fs
        .open(partPath, 'w')
        .catch((e: unknown) => {
          throw writeFailure('安装器临时文件打开失败——{{detail}}', e);
        });
      try {
        const reader = resp.body.getReader();
        for (;;) {
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try {
            chunk = await reader.read();
          } catch (e) {
            if (wd.signal.aborted) throw interrupted();
            throw err('interrupted', '下载中断——{{detail}}', { detail: msg(e) });
          }
          if (chunk.done) break;
          const value = chunk.value;
          if (!value || value.byteLength === 0) continue;
          const buf = Buffer.from(value);
          try {
            await handle.write(buf);
          } catch (e) {
            throw writeFailure('安装器写盘失败（磁盘满 / 无权限）——{{detail}}', e);
          }
          hash.update(buf);
          received += buf.byteLength;
          wd.bump();
          onProgress({ transferred: received, total, percent: percentOf(received, total) });
        }
      } finally {
        await handle.close().catch(() => {});
      }

      // 收够了吗——判据 `received < total`（**不是 `!==`**）：服务器压缩传输时 content-length 是**压缩后**
      // 字节数、实收是**解压后**字节数，二者恒不相等 ⇒ 用 `!==` 会把完整下载判成中断（plugin-download
      // E6#73i F3 同款教训）。代价（如实登记）：压缩传输下的真截断可能漏检——那时还有 sha256 兜底。
      if (total > 0 && received < total) {
        throw err('interrupted', '下载中断——已收 {{received}}/{{total}} 字节', { received, total });
      }

      const warning = verifyChecksum(hash.digest('hex'), update.checksum);

      // 半截写满 + 校验通过 → 改正式名（同卷原子）。防同名孤儿：换名前先清目标。
      try {
        await fs.rm(installerPath, { force: true });
        await fs.rename(partPath, installerPath);
      } catch (e) {
        throw writeFailure('安装器落盘失败——{{detail}}', e);
      }
      // 终态必发 100%（不是停在某个中间值上，否则进度条看着像卡死）
      onProgress({ transferred: received, total: total || received, percent: 100 });
      return warning ? { installerPath, warning } : { installerPath };
    } catch (e) {
      // 🔴 失败 / 中断一律自清 `.part`（成功 rename 后它已不存在，`force` 下是 no-op）——
      // 「下载中退出不留半截垃圾」，同插件侧缝隙 B1
      await fs.rm(partPath, { force: true }).catch(() => {});
      throw e;
    } finally {
      wd.dispose();
    }
  };
}

/**
 * sha256 校验——**不符即抛（装坏包比不装严重得多）**；未附校验值则**降级放行 + 记一笔**（01 §2.4 拍板：
 * 漏附是发布侧疏漏，不拿用户当惩罚）。
 *
 * ⚠️ 比对用小写：`update.checksum` 由 #57.5 从 `asset.digest` 正则取出，已是小写；此处 `toLowerCase()`
 * 是防将来换个来源时大小写漂移（`digest('hex')` 恒小写）。
 */
function verifyChecksum(actual: string, expected: string | undefined): UpdateError | undefined {
  if (expected) {
    if (actual !== expected.toLowerCase()) {
      throw err('checksum-mismatch', '安装包校验不通过——已删除、不会安装（下载损坏或发布侧换过包）');
    }
    return undefined;
  }
  // 🔴 这笔账落 `downloaded.warning`（2026-09-12 用户拍板选 (a)「给状态加 warning 槽」）——
  // 不许塞 `idle.lastError`：用户直接点「重启并更新」不经过 `idle`，账会在最短路径上丢。
  // ⚠️ 这里返回的是**记账数据**（`UpdateError` 结构），不是抛错——「成了，但有话要说」与
  // 「没成」是两条路（见 `DownloadLeg.warning` 注释）。
  return { code: 'checksum-unavailable', message: '本次更新未附校验值——已照常安装（发布侧漏附，请反馈）' };
}

/**
 * 复用已在盘上的同名安装器——`null` = 不能复用（没有校验值 / 文件不在 / 内容不符）。
 * 逐块读入 hash（大文件不进内存）。
 */
async function tryReuse(installerPath: string, expected: string | undefined): Promise<number | null> {
  if (!expected) return null;
  // 文件不在 = 常态（首次下载）；读不动（锁 / 权限 / 是目录）= 不复用，走正常下载
  const st = await fs.stat(installerPath).catch(() => null);
  if (!st || !st.isFile() || st.size === 0) return null;
  const hash = createHash('sha256');
  try {
    const handle = await fs.open(installerPath, 'r');
    try {
      const buf = Buffer.alloc(1 << 20);
      for (;;) {
        const { bytesRead } = await handle.read(buf, 0, buf.length, null);
        if (bytesRead === 0) break;
        hash.update(buf.subarray(0, bytesRead));
      }
    } finally {
      await handle.close().catch(() => {});
    }
  } catch {
    return null; // 读不动（锁/权限）⇒ 不复用，走正常下载
  }
  return hash.digest('hex') === expected.toLowerCase() ? st.size : null;
}

/**
 * 启动残留清理——main whenReady 调一次（对标 `cleanupStaleDownloads`）。单实例保证启动瞬间无在途下载，
 * 故顶层残留**全是孤儿**，可整批处置。
 *
 * | 扫什么 | 处置 | 为什么 |
 * |:--|:--|:--|
 * | `*.part` | 删除 | 下载中断/退出留下的半截——**不可信产物**，绝不进入可安装路径 |
 * | `linkdesk-update-*.exe` | **按版本方向三分支**：比当前运行版本**新** → 保留；**同版或更旧** → 删除；版本**解析不出** → 删除 | 🔴 防「点更新把自己降级」——用户升到新版后，磁盘里那份旧安装器就是一颗地雷（插件侧「装旧版覆盖新版」的主软件版） |
 * | 其它名字 | **不碰** | 不是本机制的产物——**不删别人的东西** |
 *
 * 判据复用插件侧锚①语义（**同版恒拒 / 旧版默认拒**）——由 `updateTargetDirection` 单一持有，
 * **不许各写一份判断**。⚠️ 清单 `#57.6e` 两条子项在「版本 == 当前运行版本」时字面相抵（一条说删、
 * 一条说保留）：**按「删」执行**——同版安装器装不出任何变化，留着只会变成「点了更新什么都没发生」的来源。
 *
 * 单条删除失败**不抛出**（残留拖垮启动是本末倒置，`console.warn` 留痕；同 plugin-download 口径）。
 */
export async function cleanupUpdateResidue(deps: UpdateResidueDeps = {}): Promise<UpdateResidueReport> {
  const dir = (deps.getUpdateDir ?? updateDownloadDir)();
  const current = (deps.getCurrentVersion ?? (() => loadProduct().version))();
  const report: UpdateResidueReport = { removedParts: [], removedInstallers: [], keptInstallers: [] };

  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return report; // 目录不存在 = 从未下载过更新（干净机器/首次装）——不是错误
  }

  for (const name of names) {
    const target = path.join(dir, name);
    if (name.endsWith(PART_SUFFIX)) {
      await remove(target, name, report.removedParts);
      continue;
    }
    const version = installerVersionFromName(name);
    if (version === null) continue; // 不是本机制的产物
    if (updateTargetDirection(version, current) === 'upgrade') {
      report.keptInstallers.push(name);
      continue;
    }
    await remove(target, name, report.removedInstallers);
  }

  if (report.removedParts.length > 0 || report.removedInstallers.length > 0) {
    console.warn(
      `[update-download] 启动清理更新残留：半截 ${report.removedParts.length} 个、失效安装器 ${report.removedInstallers.length} 个`,
    );
  }
  if (report.keptInstallers.length > 0) {
    // 留着的那份**不进状态机**（本格不持久化状态，见文件头 ⚠️）——下次检查到 available 后由下载腿
    // 的复用路径（`tryReuse`）认领，用户不会白下第二遍
    console.warn(`[update-download] 保留已在盘上的更新安装器: ${report.keptInstallers.join(', ')}`);
  }
  return report;
}

/** 残留清理依赖——注入只为单测（目录 / 当前版本） */
export interface UpdateResidueDeps {
  getUpdateDir?: () => string;
  getCurrentVersion?: () => string;
}

/** 清理结果——测试与启动日志消费 */
export interface UpdateResidueReport {
  /** 被删的半截下载 */
  removedParts: string[];
  /** 被删的失效安装器（同版 / 更旧 / 版本解析不出） */
  removedInstallers: string[];
  /** 保留的安装器（比当前运行版本新） */
  keptInstallers: string[];
}

/** 单条删除——失败只留痕不抛（残留不拖垮启动） */
async function remove(target: string, name: string, into: string[]): Promise<void> {
  try {
    await fs.rm(target, { force: true });
    into.push(name);
  } catch (e) {
    console.warn(`[update-download] 清理残留失败（非致命）: ${name} — ${msg(e)}`);
  }
}

/** 进度百分比——总长未知（服务器不给长度）时报 0：**不编一个假的百分数**（壳据 total>0 决定显不显示） */
function percentOf(received: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0;
}

/** 失败结果的唯一构造口（码集由 07 §三 固定，本文件不新造码） */
function err(code: UpdateError['code'], message: string, params?: UpdateError['params']): UpdateLegError {
  return new UpdateLegError({ code, message, params });
}

/**
 * 落盘类失败——统一归 `write-error`（磁盘满 / 无权限 / 目标被占）。
 *
 * 🔴 第一个参数是**完整词条**（骨架 + `{{detail}}`），不是在调用点拼出来的句子：拼出来的字符串
 * 整句一个字都不一样，永远成不了词条 ⇒ 那句话在所有语言下都是中文（见 `UpdateError.message` 注释）。
 * 4 个调用点的骨架互不相同，故各自是一个独立词条，`{{detail}}` 只装系统错误原文（不透明值）。
 */
function writeFailure(message: string, cause: unknown): UpdateLegError {
  return err('write-error', message, { detail: msg(cause) });
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
