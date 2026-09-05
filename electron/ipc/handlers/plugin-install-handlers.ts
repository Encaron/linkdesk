/**
 * plugin-install-handlers——E6#11/#13（1.2-5）：装卸更主进程真 fs/net 段。
 *
 * 架构定案（#13a 折叠）：install/uninstall 无主进程独立入口——loader（loadPlugin/unloadPlugin）
 * 宿主在壳 renderer（IpcBridge plugins:call → IpcBridgeHandler → _pluginAPI = lifecycle-ops），
 * 主进程无 loader。主进程只做「真网络 + 真磁盘」里 renderer 做不了/不该做的：
 *   - plugins:download  —— fetch 包 → {userData}/tmp/<原包名>（保留原名——pluginId 无 manifest 字段时
 *                         回退 zip 基名裁决，改名会破坏裁决；见 bundle-zip deriveBundlePluginId）
 *   - plugins:extract   —— 共享 bundle-zip 语义解压 → {userData}/plugins/user/<id>/（zip-slip/wrapper/
 *                         pluginId 双源互验同 boot ingest）；目标已存在拒绝（更新走 update-* 段 B）
 *   - plugins:update-check / stage-update / commit-update —— 段 B（#13b/c）注册；通道常量段 A 已就位
 *
 * 进度（#13d）：主进程 download/extract 段逐阶段经 IpcBridge.broadcast（storeForReplay=false，
 * file-handlers.ts 惯例——流数据不入 lastBroadcasts）发既有 plugin:installProgress 通道，与壳
 * lifecycle 同通道同形状并流——消费方（marketplace SearchView/未来 installWithProgress 调用方）只认
 * 一个通道。禁 ipcMain.on + sender.send（E5.8#6.5 广播归一）。
 *
 * 日志（#13g）：全部走 loggedHandle（invoke-log.ts）——channel + args 摘要 + 耗时 + 错误堆栈落
 * protocol-debug.log（console.error 进不了该文件）。
 *
 * 铁律 19/20：自持 _registered once-guard（壳崩重建复用——IPC 通道只注册一次），无 ipcRenderer/on。
 */

import { app } from "electron";
import * as fs from "fs/promises";
import { existsSync } from "fs";
import * as path from "path";
import { IPC } from "../channels.js";
import { IpcBridge } from "../ipc-bridge.js";
import { loggedHandle } from "../invoke-log.js";
import { BUNDLE_EXT, deriveBundlePluginId, extractZip, isSafePluginId, openPluginZip } from "../../plugins/bundle-zip.js";
import type { PluginManifest } from "../../../src/core/api/types.js";

let _registered = false;

/** 下载/解压临时区——{userData}/tmp（与 plugins 家同卷同根——卸载/清理/原子换不跨卷） */
function tmpDir(): string {
  return path.join(app.getPath("userData"), "tmp");
}

/** 用户安装代码根——{userData}/plugins（解压目标 = <root>/user/<id>，market 只写 user/） */
function userPluginsRoot(): string {
  return path.join(app.getPath("userData"), "plugins");
}

/** 进度广播——#13d：主进程段经 IpcBridge.active 发既有 plugin:installProgress（同壳 lifecycle 通道同形状） */
function emitProgress(stage: string, payload: { pluginId?: string; message?: string; percent?: number } = {}): void {
  try {
    IpcBridge.active?.broadcast("plugin:installProgress", { stage, ...payload }, "shell", false);
  } catch {
    /* 广播失败不阻断安装 */
  }
}

/** URL 末段 → 落盘名：保留原作者包名（pluginId 裁决的 zipBase 回退依赖它），路径/查询字符消毒 */
function downloadNameFromUrl(url: string): string {
  try {
    const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
    if (last) {
      const safe = last.replace(/[^\w.\-]/g, "_");
      if (safe.endsWith(BUNDLE_EXT)) return safe;
      return `${safe}${BUNDLE_EXT}`;
    }
  } catch { /* 非 URL → 下面兜底 */ }
  return `pkg-${Date.now()}${BUNDLE_EXT}`;
}

/** 是否 http(s) 下载源（install 流路由前置） */
function isHttpSource(source: string): boolean {
  return /^https?:\/\//i.test(source.trim());
}

/** 解压后包内 pluginId 裁决——manifest.pluginId ?? zip 基名（bundle-zip 双源互验同款；zip 保留原名已由 download 保证） */
function deriveIdFromZip(zipBase: string, manifest: PluginManifest): string {
  const id = deriveBundlePluginId(manifest as unknown as Record<string, unknown>, zipBase);
  if (!id || !isSafePluginId(id)) {
    throw new Error(`包内 pluginId 非法（${id ?? "空"}）——拒绝落盘`);
  }
  return id;
}

/**
 * 注册装卸更主进程 handler——main.ts createWindow 显式调用（幂等 once-guard）。
 * 全部走 loggedHandle（#13g）。download/extract 段 A 即用；update-* 段 B（#13b/c）追加于本函数。
 */
export function registerPluginInstallHandlers(): void {
  if (_registered) return;
  _registered = true;

  // ── plugins:download(url) → { zipPath, sizeBytes } ──
  // 真网络段：fetch 包 → {userData}/tmp/<原包名>。流式写盘 + Content-Length 可得时推 percent。
  loggedHandle(IPC.plugins.download, async (_event, url: string) => {
    if (typeof url !== "string" || !isHttpSource(url)) {
      throw new Error("仅支持 http(s) 下载源（.linkdesk-plugin 包 URL）");
    }
    emitProgress("downloading", { message: `开始下载 ${url}` });
    const resp = await fetch(url, { redirect: "follow" });
    if (!resp.ok || !resp.body) {
      throw new Error(`下载失败 HTTP ${resp.status}${resp.statusText ? `: ${resp.statusText}` : ""}`);
    }
    const total = Number(resp.headers.get("content-length")) || 0;
    const zipPath = path.join(tmpDir(), downloadNameFromUrl(url));
    await fs.mkdir(tmpDir(), { recursive: true });
    const handle = await fs.open(zipPath, "w");
    try {
      const reader = resp.body.getReader();
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value && value.byteLength > 0) {
          await handle.write(Buffer.from(value));
          received += value.byteLength;
          if (total > 0) emitProgress("downloading", { message: `下载中 ${Math.round((received / total) * 100)}%`, percent: Math.round((received / total) * 100) });
        }
      }
      if (total > 0 && received !== total) {
        throw new Error(`下载中断——已收 ${received}/${total} 字节`);
      }
    } finally {
      await handle.close().catch(() => {});
    }
    emitProgress("downloading", { message: `下载完成（${total || "未知"} 字节）` });
    return { zipPath, sizeBytes: total || undefined };
  });

  // ── plugins:extract(zipPath, expectedPluginId?) → { pluginId, version, targetDir } ──
  // 真磁盘段：共享 bundle-zip 语义解压到 {userData}/plugins/user/<id>/；纯新建契约（目标已存在拒绝——
  // 更新/覆盖走 update 流或先卸）；包内 id 与 expectedPluginId 不符拒绝（防伪装）。
  loggedHandle(IPC.plugins.extract, async (_event, zipPath: string, expectedPluginId?: string) => {
    if (typeof zipPath !== "string" || !zipPath) throw new Error("缺少包路径");
    emitProgress("extracting", { message: "开始解压" });
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(zipPath);
    } catch (e) {
      throw new Error(`无法读取包文件 ${zipPath}: ${e instanceof Error ? e.message : String(e)}`);
    }
    const opened = await openPluginZip(buffer);
    if (!opened) {
      throw new Error("不是有效的 .linkdesk-plugin 包——顶层需含可解析的 plugin.json");
    }
    const { manifest, wrapperPrefix } = opened;
    const zipBase = path.basename(zipPath).replace(/\.linkdesk-plugin$/i, "");
    const pluginId = deriveIdFromZip(zipBase, manifest);
    if (expectedPluginId && expectedPluginId !== pluginId) {
      throw new Error(`包内 pluginId 与预期不符（${pluginId} ≠ ${expectedPluginId}）——拒绝解压`);
    }
    const target = path.join(userPluginsRoot(), "user", pluginId);
    if (existsSync(target)) {
      // E6#12 幂等语义：不静默覆盖（对齐 #30.9d 确认/通知非静默）；同/异版本均报——先卸或走更新流
      throw new Error(`插件 "${pluginId}" 已存在安装目录——如需覆盖请先卸载，版本升级请走更新流程`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    const ok = await extractZip(opened.zip, target, wrapperPrefix);
    if (!ok) {
      // zip-slip 命中——已拒绝危险条目，但 target 可能半落盘：整体清理（本包作废，防半装目录残留）
      await fs.rm(target, { recursive: true, force: true });
      throw new Error(`包内含非法条目（zip-slip）——已拒绝并清理`);
    }
    emitProgress("extracting", { pluginId, message: `解压完成 ${pluginId}@${manifest.version}` });
    return { pluginId, version: manifest.version, targetDir: target };
  });

  // ── 段 B（#13b/c）追加位：plugins:update-check / stage-update / commit-update ──
  // registerPluginUpdateHandlers() 在段 B 合并进本文件（同一 _registered 生命周期）。
}
