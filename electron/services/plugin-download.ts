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
 */
export async function downloadPackage(
  url: string,
  onProgress?: (message: string, percent?: number) => void,
): Promise<{ zipPath: string; total: number }> {
  const name = downloadNameFromUrl(url);
  const tmp = downloadTmpDir();
  await fs.mkdir(tmp, { recursive: true });
  const partPath = path.join(tmp, `${name}${PART_SUFFIX}`);
  const zipPath = path.join(tmp, name);

  onProgress?.(`开始下载 ${url}`);
  const resp = await fetch(url, { redirect: "follow" });
  if (!resp.ok || !resp.body) {
    throw new Error(`下载失败 HTTP ${resp.status}${resp.statusText ? `: ${resp.statusText}` : ""}`);
  }
  const total = Number(resp.headers.get("content-length")) || 0;

  try {
    const handle = await fs.open(partPath, "w");
    try {
      const reader = resp.body.getReader();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          await handle.write(Buffer.from(value));
          received += value.byteLength;
          if (total > 0) {
            const pct = Math.round((received / total) * 100);
            onProgress?.(`下载中 ${pct}%`, pct);
          }
        }
      }
      if (total > 0 && received !== total) {
        throw new Error(`下载中断——已收 ${received}/${total} 字节`);
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
