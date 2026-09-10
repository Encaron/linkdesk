/**
 * plugin-download——E6#31a 壳侧下载服务：真网络段下载 + `.part` 临时文件生命周期（01 §四·五 B1 落地）。
 *
 * 原 #13a `plugins:download`/`plugins:stage-update` 共用的下载逻辑（fetch .linkdesk-plugin → {userData}/tmp）
 * 抽服务收单复本——handler 引用本服务，不重写 fetch/进度（#31a 定案，11-API §一·二）。
 * 生命周期（缝隙 B1「下载中关软件」不留垃圾）：
 *   写 `{userData}/tmp/<原包名>.linkdesk-plugin.part`（半截标记）→ 流式写完 rename 正式包 → 调用方消费。
 *   失败/中断 → 自清 .part（不留半截）；启动 cleanupStaleDownloads 扫 tmp/ 残留（单实例保证启动瞬间
 *   无在途下载 = 顶层 *.part / *.linkdesk-plugin 全是孤儿，可整批清）。
 *   `.stage-<id>`（段 B update 暂存目录）不在本服务生命周期内——update 流自有清理（#13b/c）；
 *   E6#73j（G8）补 boot 兜底：插件不再走一次更新时那份 stage 目录无人清（永远占磁盘），
 *   故 `cleanupStaleDownloads` 一并扫掉（STAGE_PREFIX 单复本 = 本文件的常量，handler 引用它，不另写字面量）。
 *
 * 纯服务零 IPC（进度经 onProgress 回调吐出，广播归调用方 #13d 通道）——可单测（fs + 注入 tmp 根）。
 * 铁律 19/20：本模块是启动 boot / handler 服务调用，无模块级 IPC 监听器。
 */

import * as fs from "fs/promises";
import * as path from "path";
import { envService } from "./env-service.js";
import { mainFetch } from "./main-fetch.js";
import { BUNDLE_EXT } from "../plugins/bundle-zip.js";

/** 半截标记后缀——下载进行中的落盘名（写满才 rename 去掉本后缀成正式包）。模块私有——消费方只见 rename 后正式包。 */
const PART_SUFFIX = ".part";

/**
 * 更新暂存目录前缀（段 B）——tmp/ 下 `<STAGE_PREFIX><pluginId>`。
 * E6#73j 单复本导出：`plugin-install-handlers` 的 stage-update 与 boot 清理共用同一个字面量，
 * 防两处各写一份 `.stage-` 后悄悄漂移（清理扫的不再是产出的那批）。
 */
export const STAGE_PREFIX = ".stage-";

/**
 * 下载**空闲**超时（E6#73e 机器一）：连续 N ms 没有任何新字节到达即判挂死。09-安装细节 承诺
 * 「fetch 30s 无响应 → 报网络错误」，此前全文件零超时实现（服务器半死不活 → 永远挂着，用户既看不到
 * 失败也没有 [重试]）。
 *
 * 用「空闲超时」而非「总时长超时」：大包在慢网上正常下载动辄数十秒，总时长阈值会把**健康下载**判死——
 * 那是把 10s 桥超时的老病换个门槛复活的同款错误。判据 = 「还在动吗」，不是「够快吗」。
 */
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000;

/** 可重试失败的自动重试预算（网络中断 / 5xx / 空闲超时）。4xx 是确定性拒绝——重试只会同样失败，不消耗预算。 */
const DOWNLOAD_RETRY_LIMIT = 2;

/**
 * 进度回调的最小间隔（E6#73i 机器四·F4）——网络分片来得极密（大包 + 快网 = 每个分片一条跨进程消息），
 * 节流归**洪峰的源头**（本函数），不是广播层：下载段是唯一的高频生产点，其余阶段都是低频状态跃迁。
 * 100ms ≈ 10 条/秒，肉眼追不上更快的刷新，多出来的只是白烧 IPC。
 */
const PROGRESS_THROTTLE_MS = 100;

/** 字节数 → 人类可读（F1 专用：服务器不给长度时，把「已经下了多少」如实报出来） */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} 字节`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** 下载失败——`retryable` 决定是否消耗重试预算（4xx 与用户取消恒 false）。消息文案是归因字典的输入，保持原格式。 */
class DownloadError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
    this.name = "DownloadError";
  }
}

/** 下载/解压临时区——{userData}/tmp（与 plugins 家同卷同根——rename 原子 + 启动清理不跨卷）。 */
export function downloadTmpDir(): string {
  return path.join(envService.appDataDir(), "tmp");
}

/**
 * URL 末段 → 落盘名：保留原作者包名（pluginId 裁决的 zipBase 回退依赖它——改名会破坏裁决，
 * 见 bundle-zip deriveBundlePluginId），路径/查询字符消毒。服务收单复本（原 handler 本地函数迁此）。
 */
export function downloadNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    if (last) {
      const safe = last.replace(/[^\w.\-]/g, "_");
      if (safe.endsWith(BUNDLE_EXT)) return safe;
      return `${safe}${BUNDLE_EXT}`;
    }
  } catch {
    /* 非 URL → 下面兜底 */
  }
  return `pkg-${Date.now()}${BUNDLE_EXT}`;
}

/** 唯一化后缀标记——`<原包名>.dl-<序号36>-<时间36>`（E6#73q） */
const UNIQ_SUFFIX_RE = /\.dl-[0-9a-z]+-[0-9a-z]+$/i;
let _dlSeq = 0;

/** 落盘名唯一化——并发下载（E6#73q 放开 N=3 后）不许共用同一个临时名：两个不同插件的下载 URL
 *  末段同名（第三方仓库常把包名固定成 `<插件名>.linkdesk-plugin` 之外的通用名）时，共用 `.part`
 *  会互相截断、共用正式名会在 rename→extract 的窗口里**把 A 的包换成 B 的**（装错插件）。
 *
 *  ⚠️ 唯一化**不加在插件 id 上、也不改包名本身**——`zipBase` 是 `deriveBundlePluginId` 的 pluginId
 *  回退来源（改名破坏裁决），故只是**在外层挂一个可剥的后缀**，剥法由本模块单一拥有
 *  （`stripDownloadUniq`）。后缀用下载服务自己的序号而非壳侧 jobId：下载腿被安装流与更新流共用，
 *  更新流没有 install jobId，挂在 jobId 上会让更新那条腿失去唯一化；且本服务在主进程、拿不到壳侧
 *  jobId（跨进程），自带序号零契约代价。 */
function uniqueDownloadStem(name: string): string {
  const base = name.replace(/\.linkdesk-plugin$/i, "");
  return `${base}.dl-${(++_dlSeq).toString(36)}-${Date.now().toString(36)}`;
}

/** 剥掉唯一化后缀——`zipBase` 裁决必须拿到**原包名**（消费方：plugin-install-handlers 的
 *  extract / stage-update 两处 `path.basename(zipPath)`）。非本服务产出的名字原样返回。 */
export function stripDownloadUniq(basenameNoExt: string): string {
  return basenameNoExt.replace(UNIQ_SUFFIX_RE, "");
}

/**
 * 真网络段共享下载：fetch .linkdesk-plugin → {userData}/tmp/<原包名>.<唯一后缀>.part（半截标记）→
 * 流式写完 rename 正式包（01 §四·五：完成才暴露正式名——下载中杀进程只留 .part 半截标记，不冒充完整包）。
 * 失败/中断 → 自清 .part（缝隙 B1：不留半截垃圾），rethrow。Content-Length 可得时经 onProgress 推 percent。
 * 返回 rename 后正式包路径——zipBase（pluginId 回退裁决）与原包名一致，extract 直读。
 *
 * E6#73e（机器一）：本函数自持**空闲超时**（`DOWNLOAD_IDLE_TIMEOUT_MS` + `opts.signal` 可外部取消）+
 * **重试预算**（`DOWNLOAD_RETRY_LIMIT`）。此前超时判断落在 `ipc-bridge` 那条与网络无关的 10s 桥计时器上
 * ——「装插件超 10 秒必判失败，而它其实还在装」，是用户「试五六次才成功一次」的根。
 *
 * `opts.idleTimeoutMs`：空闲超时预算（缺省 `DOWNLOAD_IDLE_TIMEOUT_MS`）。生产不传——唯一用途是让
 * 「下载挂死」这条最贵的失败模式能被**确定性单测**（30 秒真等的测试没人会跑），故留此显式入口。
 */
export async function downloadPackage(
  url: string,
  onProgress?: (message: string, percent?: number) => void,
  opts?: { signal?: AbortSignal; idleTimeoutMs?: number },
): Promise<{ zipPath: string; total: number }> {
  let lastErr: unknown;
  const idleMs = opts?.idleTimeoutMs ?? DOWNLOAD_IDLE_TIMEOUT_MS;
  for (let attempt = 0; attempt <= DOWNLOAD_RETRY_LIMIT; attempt += 1) {
    if (attempt > 0) onProgress?.(`下载失败，正在重试（${attempt}/${DOWNLOAD_RETRY_LIMIT}）`);
    try {
      return await downloadOnce(url, onProgress, opts?.signal, idleMs);
    } catch (e) {
      lastErr = e;
      if (opts?.signal?.aborted) throw e; // 用户取消——重试是违背意图
      if (e instanceof DownloadError && !e.retryable) throw e; // 4xx——确定性拒绝，重试无意义
      if (attempt === DOWNLOAD_RETRY_LIMIT) throw e;
    }
  }
  throw lastErr;
}

/**
 * 单次下载尝试——`downloadPackage` 的重试循环里跑；每次全新建 `.part`（截断打开）。
 * 三重取消来源汇到一个 `AbortController`：① 调用方 `opts.signal`（job 取消 / 槽级看门狗）
 * ② 本函数空闲看门狗（`DOWNLOAD_IDLE_TIMEOUT_MS` 无新字节）③ fetch/读取自身抛错。
 */
async function downloadOnce(
  url: string,
  onProgress: ((message: string, percent?: number) => void) | undefined,
  outer: AbortSignal | undefined,
  idleMs: number,
): Promise<{ zipPath: string; total: number }> {
  const name = downloadNameFromUrl(url);
  const tmp = downloadTmpDir();
  await fs.mkdir(tmp, { recursive: true });
  // E6#73q：并发下载各持唯一落盘名——`<原包名>.dl-<seq>-<ts>`（见 uniqueDownloadStem 注释）。
  // 剥离归 stripDownloadUniq，消费方（extract/stage-update）的 zipBase 裁决不受影响。
  const stem = uniqueDownloadStem(name);
  const partPath = path.join(tmp, `${stem}${PART_SUFFIX}`);
  const zipPath = path.join(tmp, `${stem}${BUNDLE_EXT}`);

  onProgress?.(`开始下载 ${url}`);

  const ac = new AbortController();
  let idledOut = false;
  let idle: ReturnType<typeof setTimeout> | undefined;
  /** 有字节到达 → 重置空闲看门狗（判据是「还在动吗」） */
  const bumpIdle = (): void => {
    if (idle) clearTimeout(idle);
    idle = setTimeout(() => {
      idledOut = true;
      ac.abort();
    }, idleMs);
  };
  const onOuterAbort = (): void => ac.abort();
  outer?.addEventListener("abort", onOuterAbort, { once: true });
  if (outer?.aborted) ac.abort();
  bumpIdle();

  /** 中断归因——用「是否已 abort / 谁 abort 的」判定，不靠错误类名（DOMException 跨环境形态不一） */
  const abortReason = (): DownloadError =>
    outer?.aborted
      ? new DownloadError("下载已取消", false)
      : idledOut
        ? new DownloadError(`下载超时——${idleMs / 1000} 秒无响应`, true)
        : new DownloadError("下载中断", true);

  try {
    let resp: Response;
    try {
      resp = await mainFetch(url, { redirect: "follow", signal: ac.signal });
    } catch (e) {
      if (ac.signal.aborted) throw abortReason();
      // 非主动 abort 的 fetch 失败（ECONNRESET / ENOTFOUND …）——瞬时网络问题，可重试
      throw new DownloadError(e instanceof Error ? e.message : String(e), true);
    }
    if (!resp.ok || !resp.body) {
      // 5xx / 408 / 429 是服务端瞬时状态，重试有意义；其余 4xx 是确定性拒绝（地址失效 / 无权限）
      const retryable = resp.status >= 500 || resp.status === 408 || resp.status === 429;
      throw new DownloadError(`下载失败 HTTP ${resp.status}${resp.statusText ? `: ${resp.statusText}` : ""}`, retryable);
    }
    const total = Number(resp.headers.get("content-length")) || 0;

    // E6#73i（F4）：分片进度节流——见 PROGRESS_THROTTLE_MS。收尾的「下载完成」在循环外单发、不受节流。
    let lastEmitAt = 0;
    const emitTick = (message: string, percent?: number): void => {
      const now = Date.now();
      if (now - lastEmitAt < PROGRESS_THROTTLE_MS) return;
      lastEmitAt = now;
      onProgress?.(message, percent);
    };

    try {
      const handle = await fs.open(partPath, "w");
      try {
        const reader = resp.body.getReader();
        let received = 0;
        for (;;) {
          let chunk: ReadableStreamReadResult<Uint8Array>;
          try {
            chunk = await reader.read();
          } catch (e) {
            if (ac.signal.aborted) throw abortReason();
            throw new DownloadError(e instanceof Error ? e.message : String(e), true);
          }
          if (chunk.done) break;
          const value = chunk.value;
          if (value && value.byteLength > 0) {
            await handle.write(Buffer.from(value));
            received += value.byteLength;
            bumpIdle();
            if (total > 0) {
              const pct = Math.round((received / total) * 100);
              emitTick(`下载中 ${pct}%`, pct);
            } else {
              // E6#73i（F1）：服务器不给包大小（chunked / CDN 代理）时**改显已下载字节数**。
              // 此前 total=0 一个 percent 都不发 → 面板只能落不定态扫动条来回滚，这正是用户
              // Q6「像来回滚的加载条，不像真百分比」的真机制——不是「装得太快」，是响应头没长度。
              emitTick(`下载中（已下载 ${formatBytes(received)}）`);
            }
          }
        }
        // E6#73i（F3）：判据 `received !== total` → `received < total`。服务器压缩传输（gzip/br）时
        // content-length 是**压缩后**字节数、received 统计的是**解压后**字节数 ⇒ 二者恒不相等，
        // 完整下载被误判「下载中断」；该文案又命中 NET_RE 的「下载中断」→ 归 network →
        // 「安装失败：网络连接不可用」⇒ 重试多少次都是同一个失败，这个包**永远装不上**。
        // 代价（如实登记）：压缩传输下的真截断可能漏检——用「收够压缩长度」当完成信号是当前能拿到的最强证据。
        if (total > 0 && received < total) {
          throw new DownloadError(`下载中断——已收 ${received}/${total} 字节`, true);
        }
        // 节流不得吞掉**终态**：最后一格恒发 100%（不受 PROGRESS_THROTTLE_MS 约束）。
        // 否则进度条会停在 87% 之类的中间值上，直到下一个阶段事件才收走——那是新的谎。
        if (total > 0 && received === total) onProgress?.(`下载中 100%`, 100);
      } finally {
        await handle.close().catch(() => {});
      }
      // 半截写满 → rename 正式包（同卷原子；防同名孤儿残留先清目标）
      await fs.rm(zipPath, { force: true }).catch(() => {});
      await fs.rename(partPath, zipPath);
    } catch (e) {
      // 缝隙 B1：下载失败/中断 → 自清半截 .part，不留垃圾
      await fs.rm(partPath, { force: true }).catch(() => {});
      throw e;
    }

    onProgress?.(`下载完成（${total || "未知"} 字节）`);
    return { zipPath, total };
  } finally {
    if (idle) clearTimeout(idle);
    outer?.removeEventListener("abort", onOuterAbort);
  }
}

/**
 * 启动扫描清理下载残留——main whenReady 调一次（单实例：启动瞬间 tmp/ 无在途下载 = 全孤儿）。
 * 清 tmp/ 顶层 `*.part`（中断下载半截）+ 孤立 `*.linkdesk-plugin`（下载完成 rename 后、调用方消费
 * remove 前的窗口被杀进程留下）+ `STAGE_PREFIX*` 暂存目录（E6#73j G8：段 B 只在**同一插件下次
 * stage 时**清自己那份，插件不再走一次更新就永远占磁盘——boot 是唯一的兜底时机）。
 * `.bak` 不在此处——它落在插件树里（`{userData}/plugins/<id>.bak`），且**不能盲删**
 * （可能是旧版唯一副本）；归 `plugin-tree-recovery` 按「目录在不在」复原或清理。
 * tmp 不存在/不可读 → 无可清理直接返回；单条清理失败不抛出（残留不拖垮启动，console.warn 留痕）。
 */
export async function cleanupStaleDownloads(): Promise<void> {
  const tmp = downloadTmpDir();
  let names: string[];
  try {
    names = await fs.readdir(tmp);
  } catch {
    return; // tmp 尚未创建/不可读 → 无可清理
  }
  const removed: string[] = [];
  for (const name of names) {
    const isStageDir = name.startsWith(STAGE_PREFIX);
    if (!isStageDir && !name.endsWith(PART_SUFFIX) && !name.endsWith(BUNDLE_EXT)) continue;
    try {
      // stage 是目录（递归删）；.part / 包是文件——recursive 对文件同样成立，统一一个分支
      await fs.rm(path.join(tmp, name), { recursive: isStageDir, force: true });
      removed.push(name);
    } catch (e) {
      console.warn(`[plugin-download] 清理残留失败（非致命）: ${name} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (removed.length > 0) {
    console.warn(`[plugin-download] 启动清理 ${removed.length} 个残留下载临时文件: ${removed.join(", ")}`);
  }
}
