/**
 * plugin-download——E6#31a 壳侧下载服务：真网络段下载 + `.part` 临时文件生命周期（01 §四·五 B1 落地）。
 *
 * 原 #13a `plugins:download`/`plugins:stage-update` 共用的下载逻辑（fetch .linkdesk-plugin → {userData}/tmp）
 * 抽服务收单复本——handler 引用本服务，不重写 fetch/进度（#31a 定案，11-API §一·二）。
 * 生命周期（缝隙 B1「下载中关软件」不留垃圾）：
 *   写 `{userData}/tmp/<原包名>.linkdesk-plugin.part`（半截标记）→ 流式写完 rename 正式包 → 调用方消费。
 *   失败/中断 → 自清 .part（不留半截）；启动 cleanupStaleDownloads 扫 tmp/ 残留（单实例保证启动瞬间
 *   无在途下载 = 顶层 *.part / *.linkdesk-plugin 全是孤儿，可整批清）。
 *   `.stage-<id>`（段 B update 暂存目录）不在本服务生命周期内——update 流自有清理（#13b/c），boot 不越界。
 *
 * 纯服务零 IPC（进度经 onProgress 回调吐出，广播归调用方 #13d 通道）——可单测（fs + 注入 tmp 根）。
 * 铁律 19/20：本模块是启动 boot / handler 服务调用，无模块级 IPC 监听器。
 */

import * as fs from "fs/promises";
import * as path from "path";
import { envService } from "./env-service.js";
import { BUNDLE_EXT } from "../plugins/bundle-zip.js";

/** 半截标记后缀——下载进行中的落盘名（写满才 rename 去掉本后缀成正式包）。模块私有——消费方只见 rename 后正式包。 */
const PART_SUFFIX = ".part";

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

/**
 * 真网络段共享下载：fetch .linkdesk-plugin → {userData}/tmp/<原包名>.part（半截标记）→ 流式写完
 * rename 正式包（01 §四·五：完成才暴露正式名——下载中杀进程只留 .part 半截标记，不冒充完整包）。
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
  const partPath = path.join(tmp, `${name}${PART_SUFFIX}`);
  const zipPath = path.join(tmp, name);

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
      resp = await fetch(url, { redirect: "follow", signal: ac.signal });
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
              onProgress?.(`下载中 ${pct}%`, pct);
            }
          }
        }
        if (total > 0 && received !== total) {
          throw new DownloadError(`下载中断——已收 ${received}/${total} 字节`, true);
        }
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
 * remove 前的窗口被杀进程留下）。`.stage-*`/`.bak` 属段 B（#13b/c update 流）自清理域——boot 不越界。
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
    if (!name.endsWith(PART_SUFFIX) && !name.endsWith(BUNDLE_EXT)) continue;
    try {
      await fs.rm(path.join(tmp, name), { force: true });
      removed.push(name);
    } catch (e) {
      console.warn(`[plugin-download] 清理残留失败（非致命）: ${name} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (removed.length > 0) {
    console.warn(`[plugin-download] 启动清理 ${removed.length} 个残留下载临时文件: ${removed.join(", ")}`);
  }
}
