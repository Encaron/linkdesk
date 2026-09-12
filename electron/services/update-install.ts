/**
 * update-install——E6#57.7 安装腿（`install`）：**落盘「我正在装」→ 拉起安装器 → 退出**，
 * 外加**启动复位**（下次启动据盘上的记录决定落到哪个态）。
 *
 * 设计：[06-主软件更新/01-更新机制设计.md](../../docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/01-更新机制设计.md)
 * §2.5；契约见 [07-数据流通格式.md](../../docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/07-数据流通格式.md) §三/§四。
 *
 * 本模块产出两样东西：**#57.4 注入的那条腿**（`UpdateServiceDeps.install`）＋ **启动复位**
 * （`resolveStartupInstall`，接线在 #57.8 装配处，须排在 `cleanupUpdateResidue()` **之后**）。
 *
 * 🔴 **五条不出声的坑，各有一处防线**：
 * ① **`relaunch` 而非 `spawn`**：安装器在本进程**退出之后**才被拉起 ⇒ 它的
 *    `_CHECK_APP_RUNNING`（`app-builder-lib/templates/nsis/include/allowOnlyOneInstallerInstance.nsh`）
 *    查「LinkDesk.exe 还在吗」时**我们已经不在**了 ⇒ 既不会走到它那套「等 1 秒 → `taskkill /F`」，
 *    也没有「旧进程占着 exe 换不掉」的文件锁。**spawn 的代价正是那条路**：安装器起来 1.3 秒后就开始杀我们，
 *    而此刻我们可能还没退干净（落盘可能被中途打断）。⚠️ 这是**设计选择 + 单测钉住**，
 *    真机复核（安装器动手时旧进程在不在）在 #57.7c/#57.16。
 * ② **参数是 `/S`（静默），不是 `--updated`**：`--updated` 是安装器装完之后**发给 App / 旧卸载器**的参数
 *    （`common.nsh:125` StartApp、`installUtil.nsh:206`），**不是**喂给安装器的模式。我们起安装器只传 `/S`。
 * ③ **落盘必须先于拉起安装器，且走「临时文件 + rename」原子写**：下一秒就可能被安装器
 *    （或用户强杀）干掉，半截 JSON 会被读成「没有记录」= 下次启动不知道自己刚才在装。
 * ④ **成功路径本函数不返回**（契约，见 `InstallLeg`）：`app.quit()` 之后**必须**挂住——
 *    若返回，状态机会判「安装腿返回但进程未退出」并落回 `idle`，用户看到一次并不存在的失败。
 *    另配一条兜底出口：`quit` 被拦（例如标签页的关闭确认）时 `app.relaunch` **永远不会启动安装器**
 *    （它排在进程退出之后），于是必须有个兜底把人踢出去，否则永久停在 `updating` 且无出口。
 * ⑤ **复位判据以「盘上的事实」为准，不以记录为准**：记录是快照（[[snapshot-shadows-truth-bug-class]] ①），
 *    所以「装成功了吗」问**当前运行版本**、「安装器还在吗」问**文件名解析出的版本是否等于记录目标**
 *    ——只看记录自称、或只看「文件在不在」，都会把成功报成中断 / 把别的版本当目标装上去。
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import { loadProduct } from '../product.js';
import { updateDownloadDir, installerVersionFromName } from './update-download.js';
import { UpdateLegError, type InstallLeg, type StartupResume } from './update-service.js';
import type { UpdateError, UpdateInfo, UpdateState } from '../../src/core/types/ipc/update';

/** 记录文件名——落在 `{userData}/update/`（与安装器同目录，见 `updateDownloadDir`）。 */
const STATE_FILE = 'state.json';

/**
 * 静默开关——NSIS 的 `/S`（②）。⚠️ **不是** `--updated`：那个方向相反（安装器→App）。
 * 静默下安装器的弹窗**一律带 `/SD` 默认值**（`allowOnlyOneInstallerInstance.nsh:120/156`），
 * 不会卡在「请先关闭 LinkDesk」上等人点——这条是本腿敢用静默的前提。
 */
const SILENT_SWITCH = '/S';

/**
 * 「装完把 App 拉回来」开关（E6#57.8f，2026-09-12 实机试出）。
 *
 * 🔴 **不传它，静默安装装完 App 就再也不回来了**——assisted 安装器（我们 `oneClick: false`）的重启
 * 分支要求**两个**条件同时成立（`installSection.nsh:104-110`）：`${isForceRun}` **且** `${Silent}`。
 * 我们只传 `/S` ⇒ 前一个不成立 ⇒ 用户更新完面对一个空桌面。
 *
 * ⚠️ `${isForceRun}` **不是模板里的常量**——`NsisScriptGenerator.js:29-39` 的 `flags()` 依
 * `NsisTarget.js:579` 的开关清单**动态生成** `_isForceRun` 宏（`${StdUtils.TestParameter} $R9 "force-run"`）
 * ⇒ 它认的正是这条命令行开关。这台机器上「找不到 `!define isForceRun`」的谜团由此闭合。
 *
 * ⚠️ **不要顺手加 `--updated`**：那个方向相反（安装器 → App，由安装器自己加，见 `common.nsh:122-133`
 * 与 `installUtil.nsh:206`），我们自己传等于把「刚更新完」这件事提前说给旧进程听。
 */
const FORCE_RUN_SWITCH = '--force-run';

/**
 * `app.quit()` 被拦时的兜底预算（④）。正常退出在毫秒级完成、本定时器根本不会触发；
 * 真触发只说明「有窗口拦了关闭」——那时若不兜底，`relaunch` 永不启动安装器，用户永久卡在「正在安装」。
 */
const QUIT_FALLBACK_MS = 10_000;

/**
 * 落盘记录——**白名单：`type` 只可能是 `'updating'`**（清单 #57.7a 判据 2）。
 * `checking` / `downloading` 属瞬时态，**不进盘**（写进去 = 凭空造出下一条复活路径）。
 */
export interface PendingInstallRecord {
  type: 'updating';
  /** 目标更新全量描述——复位后要还原成完整 `ready` 态（发行说明链接等仍要能显示） */
  update: UpdateInfo;
  /** 安装器绝对路径（必须落在更新目录内——读侧强制，见 `readPendingInstall`） */
  installerPath: string;
  /** 记录时刻（ISO）——纯诊断，不参与判定 */
  startedAt: string;
  /** 降级放行的记账（如 `checksum-unavailable`）——跨重启传递，同 `downloaded.warning` */
  warning?: UpdateError;
}

/** 安装腿依赖——生产缺省即真值源；注入只为单测（临时目录 / 观测调用序 / 不真退出） */
export interface UpdateInstallDeps {
  /** 更新目录（缺省 `{userData}/update`） */
  getUpdateDir?: () => string;
  /** 拉起安装器——缺省 `app.relaunch({ execPath, args: ['/S', '--force-run'] })`（① 退出后才启动） */
  launchInstaller?: (installerPath: string) => void;
  /** 退出——缺省 `app.quit()`（优雅退出：先让 `before-quit` 收尾、布局落盘） */
  quit?: () => void;
  /** 兜底出口——缺省 `app.exit(0)`（跳过 `before-quit`，只在 `quit` 被拦时用） */
  forceExit?: () => void;
  /** 兜底预算（缺省 `QUIT_FALLBACK_MS`） */
  quitFallbackMs?: number;
  /** 记录时刻（缺省 `new Date().toISOString()`） */
  now?: () => string;
}

/** 造安装腿——返回 `(update, installerPath) => Promise<void>`，直接喂给 `new UpdateService({ install })` */
export function createUpdateInstaller(deps: UpdateInstallDeps = {}): InstallLeg {
  const getUpdateDir = deps.getUpdateDir ?? updateDownloadDir;
  const launch = deps.launchInstaller ?? defaultLaunch;
  const quit = deps.quit ?? (() => app.quit());
  const forceExit = deps.forceExit ?? (() => app.exit(0));
  const fallbackMs = deps.quitFallbackMs ?? QUIT_FALLBACK_MS;
  const now = deps.now ?? (() => new Date().toISOString());

  return async function install(update, installerPath, warning): Promise<void> {
    // 安装器不见了（被清理腿删了 / 被用户或杀软移走）——**不许**拉起一个不存在的文件（那会静默什么都不发生）。
    // 错误码取 `canceled`（= 本次安装没有发生；码集由 07 §三 固定，**不新造码**），区分信息在文案里。
    if (!(await isUsableInstaller(installerPath))) {
      throw err('canceled', '安装包已不在盘上（可能被清理或移走）——请重新下载后再试');
    }

    // ③ 先落盘再动手。写不进去 ⇒ **不装**（宁可不装，也不制造一个「下次启动不知道自己刚才在装」的重启）。
    // 这条是 fail-closed：磁盘满/无权限下，安装器大概率也装不成，早失败早出声。
    try {
      const record: PendingInstallRecord = { type: 'updating', update, installerPath, startedAt: now() };
      // `warning`（降级放行的记账，如 `checksum-unavailable`）**跟着记录过重启**——07 §三 要求它
      // `downloaded → ready` 一路传下去，而跨重启那一段只有记录能带（内存态在退出时就没了）。
      if (warning) record.warning = warning;
      await writePendingInstall(record, { getUpdateDir });
    } catch (e) {
      throw err('write-error', `无法记录待安装状态——${msg(e)}`);
    }

    try {
      launch(installerPath);
    } catch (e) {
      // 拉不起来 ⇒ 立刻销账（我们还活着，知道自己没在装），别让下次启动误报「上次更新中断」。
      await clearPendingInstall({ getUpdateDir });
      throw err('canceled', `无法启动安装程序——${msg(e)}`);
    }
    quit();

    // ④ 兜底：quit 被拦（有窗口拦住关闭）时 relaunch 永不启动安装器（它排在进程退出之后）。
    const guard = setTimeout(() => {
      console.warn('[update-install] app.quit() 未生效（有窗口拦了关闭）——兜底强制退出以启动安装器');
      forceExit();
    }, fallbackMs);
    guard.unref?.();

    // ⚠️ **永不 settle**：成功路径的唯一出口是「本进程消失」。返回/抛出都会让状态机把一次正常安装
    // 判成契约违反（见 `UpdateService.quitAndInstall`）。
    return new Promise<void>(() => {});
  };
}

/** 缺省拉起方式——`relaunch`：本进程退出后才启动安装器（①）；`args` 显式给全，不继承我们自己的命令行 */
function defaultLaunch(installerPath: string): void {
  app.relaunch({ execPath: installerPath, args: [SILENT_SWITCH, FORCE_RUN_SWITCH] });
}

// ───────────────────────────── 落盘 / 读盘 / 销账 ─────────────────────────────

/** 记录文件路径 */
export function pendingInstallPath(dir: string = updateDownloadDir()): string {
  return path.join(dir, STATE_FILE);
}

/** 记录读写依赖——注入只为单测换目录 */
export interface PendingInstallDeps {
  getUpdateDir?: () => string;
}

/**
 * 原子写：**先写 `state.json.tmp` 再 rename**（③）。`rename` 失败（目标被占）时退一步「先删再 rename」
 * ——两条路都保证：盘上要么是旧内容、要么是新内容，**不会出现半截 JSON**。
 */
export async function writePendingInstall(record: PendingInstallRecord, deps: PendingInstallDeps = {}): Promise<void> {
  const dir = (deps.getUpdateDir ?? updateDownloadDir)();
  const final = pendingInstallPath(dir);
  const tmp = `${final}.tmp`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(record, null, 2), 'utf8');
  try {
    await fs.rename(tmp, final);
  } catch {
    await fs.rm(final, { force: true });
    await fs.rename(tmp, final);
  }
}

/**
 * 读记录——**永不抛**：文件不在 / 坏 JSON / `type` 不是白名单 / 字段缺失 / 路径不在更新目录内，
 * 一律当「没有待续安装」（`null`）。启动路径上的判据不许因为一份脏文件把软件卡住。
 *
 * 🔴 路径必须在更新目录内（**读侧强制**）：记录只可能由本腿写、路径只可能出自 `installerPathFor()`；
 * 越界的记录是别人塞进来的，照它去 `rm` / 执行 = 拿一份外部 JSON 当命令用。
 */
export async function readPendingInstall(deps: PendingInstallDeps = {}): Promise<PendingInstallRecord | null> {
  const dir = (deps.getUpdateDir ?? updateDownloadDir)();
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.readFile(pendingInstallPath(dir), 'utf8'));
  } catch {
    return null;
  }
  if (!isPendingRecord(raw)) return null;
  if (path.dirname(path.resolve(raw.installerPath)) !== path.resolve(dir)) {
    console.warn('[update-install] 忽略越界的待安装记录（路径不在更新目录内）');
    return null;
  }
  return raw;
}

/** 销账——记录不存在时是 no-op，失败只留痕不抛（销账不该拖垮启动） */
export async function clearPendingInstall(deps: PendingInstallDeps = {}): Promise<void> {
  const dir = (deps.getUpdateDir ?? updateDownloadDir)();
  await fs.rm(pendingInstallPath(dir), { force: true }).catch((e: unknown) => {
    console.warn(`[update-install] 清除待安装记录失败（非致命）: ${msg(e)}`);
  });
}

// ───────────────────────────── 启动复位 ─────────────────────────────

/** 启动复位依赖——注入只为单测 */
export interface StartupInstallDeps extends PendingInstallDeps {
  /**
   * 当前运行版本——缺省 `loadProduct().version`（= `app.getVersion()`，02 §2.3 唯一运行时来源）。
   * ⚠️ 与 `cleanupUpdateResidue` **同一个来源**：两处若各取一个版本号，会出现「清理说删了、复位说还在」。
   */
  getCurrentVersion?: () => string;
}

/**
 * 本次启动的结论（日志 / 单测消费；`resume` 才是给状态机的）。
 *
 * ⚠️ **故意不导出**：它只在文件内当 `StartupInstallResolution.outcome` 的字段类型用，
 * 消费方（#57.8 装配处）按字面量收窄即可（`r.outcome === 'ready'`）——导出而没有导入方
 * 会被 `npm run check` 的 knip 判「未用导出」红灯。真要引用这个类型名时再开导出。
 */
type StartupInstallOutcome =
  /** 没有待续安装（从未装过 / 记录脏）——按 `disabled`/`idle` 正常初始化 */
  | 'none'
  /** 更新**成功**了（当前运行版本 == 记录目标）——销账，按正常初始化走 */
  | 'installed'
  /** 没装成，但安装器还在且正是记录里那个版本——落 `ready` 等用户再点 */
  | 'ready'
  /** 没装成，且安装器已不在 / 不是记录里那个版本——落 `idle + interrupted` */
  | 'interrupted';

export interface StartupInstallResolution {
  outcome: StartupInstallOutcome;
  /** 非 null = 强制落该态（喂 `UpdateServiceDeps.resume`）；null = 交回正常初始化 */
  resume: StartupResume | null;
}

/**
 * 启动复位——**必须在 `cleanupUpdateResidue()` 之后调用**（清理先按方向删掉失效安装器，复位再看盘上剩什么，
 * 两条结论才一致；清单 #57.7a 判据 3）。
 *
 * 三支判据（⑤：全部以盘上的事实为准，不拿记录自称当结论）：
 * | 盘上看到 | 结论 | 落态 |
 * |:--|:--|:--|
 * | 当前运行版本 **==** 记录目标版本 | 装成功了（正跑在目标版本上） | 销账 + 清那份安装器 → 正常初始化 |
 * | 版本不等 + 安装器在 + **文件名版本 == 记录目标** | 没装成，还能再试 | `ready`（带 installerPath，用户可再点） |
 * | 版本不等 + 其它（不在 / 版本对不上） | 没装成也没得试 | `idle + lastError{interrupted}` |
 *
 * 🔴 **为什么不能只看「安装器还在不在」**：装成功后那份安装器成了**同版残留**，会被清理腿按方向守卫删掉
 * ⇒「安装器没了」在**成功路径上同样成立**，只看它就会把一次成功的更新报成「更新被中断」。
 */
export async function resolveStartupInstall(deps: StartupInstallDeps = {}): Promise<StartupInstallResolution> {
  const record = await readPendingInstall(deps);
  if (!record) return { outcome: 'none', resume: null };

  const current = (deps.getCurrentVersion ?? (() => loadProduct().version))();
  if (record.update.version === current) {
    await clearPendingInstall(deps);
    // 顺手清掉这份「已经装进去的那份安装器」——它现在是同版残留，清理腿下次启动才会发现，
    // 而这一次启动正该销账（谁引入持久化谁负责销账，见清单 #57.7a 判据 1）。
    await fs.rm(record.installerPath, { force: true }).catch(() => {});
    return { outcome: 'installed', resume: null };
  }

  if (await isRecordedInstaller(record)) {
    const warning = record.warning;
    const state: UpdateState = warning
      ? { type: 'ready', update: record.update, warning }
      : { type: 'ready', update: record.update };
    return { outcome: 'ready', resume: { state, installerPath: record.installerPath } };
  }

  await clearPendingInstall(deps);
  return {
    outcome: 'interrupted',
    resume: {
      // `update` 保留（同 `quitAndInstall` 的失败路径：知道有哪个版本、但这次没装成）；
      // ⚠️ **不许**落成 `ready`/`downloaded`——那条路的终点是「点一下就装」，而盘上已经没有可装的东西了。
      state: {
        type: 'idle',
        update: record.update,
        lastError: { code: 'interrupted', message: '上次更新未完成（安装包已不在）——请重新下载后再试' },
      },
    },
  };
}

/** 盘上那份文件**正是**记录里那个版本，且可用（文件名版本一致 + 是文件 + 非空） */
async function isRecordedInstaller(record: PendingInstallRecord): Promise<boolean> {
  const onDisk = installerVersionFromName(path.basename(record.installerPath));
  if (onDisk === null || onDisk !== record.update.version) return false;
  return isUsableInstaller(record.installerPath);
}

/** 文件可用 = 是文件、非空。`stat` 读不动（锁/权限）也算不可用——**宁可不装** */
async function isUsableInstaller(p: string): Promise<boolean> {
  if (!p) return false;
  const st = await fs.stat(p).catch(() => null);
  return st !== null && st.isFile() && st.size > 0;
}

/** 记录形状校验（白名单在此强制：`type` 只能是 `'updating'`）——`checking`/`downloading` 一律当脏数据 */
function isPendingRecord(raw: unknown): raw is PendingInstallRecord {
  if (typeof raw !== 'object' || raw === null) return false;
  const r = raw as Record<string, unknown>;
  if (r.type !== 'updating') return false;
  if (typeof r.installerPath !== 'string' || !r.installerPath) return false;
  if (typeof r.startedAt !== 'string') return false;
  const u = r.update;
  if (typeof u !== 'object' || u === null) return false;
  const info = u as Record<string, unknown>;
  return typeof info.version === 'string' && typeof info.currentVersion === 'string';
}

/** 失败结果的唯一构造口（码集由 07 §三 固定，本文件不新造码） */
function err(code: UpdateError['code'], message: string): UpdateLegError {
  return new UpdateLegError({ code, message });
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
