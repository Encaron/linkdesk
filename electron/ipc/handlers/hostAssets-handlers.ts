/**
 * 宿主资产 IPC 处理器 —— 选图 / 入库 / 打开存储目录（2026-11-24 语义归属，替代 `appearance-handlers.ts`）。
 *
 * 为什么换文件：这三个动作的语义（起始目录、扩展名白名单、拷贝入库、路径解析）全部归宿主，
 * 由 `electron/services/hostAssets/**` 承载；本文件只做 IPC 边界（参数校验 / 父窗反查 / 通道注册）。
 * 旧 `appearance:importImage` / `appearance:reveal-storage` 通道名**不变**（契约兼容）。
 *
 * 🔴 新增宿主动作一律走域注册表（`resolveHostAssetPick`）：插件只传 schema 声明的
 *    `{domain,target}`，⛔ 不传路径、不传目录令牌；未注册的域 fail-loud。
 */

import { ipcMain } from "electron";
import { IPC } from "../channels.js";
import { fileService } from "../../services/file-service.js";
import {
  getAppearanceDefaults,
  importAppearanceImage,
  openAppearanceDirectory,
} from "../../services/hostAssets/appearance";
import { resolveHostAssetPick } from "../../services/hostAssets";
import type { WindowManager } from "../../windows/window-manager.js";

// E5.7#36：壳崩重建复用本函数——无状态 handler，IPC 通道只注册一次
let _registered = false;
// E5.8#62 审计#4：windowManager 引用每次调用刷新（dialog-handlers 同款）——壳崩重建后新实例跨重建存活
let _windowManager: WindowManager | undefined;

export function registerHostAssetsHandlers(windowManager?: WindowManager): void {
  _windowManager = windowManager;
  if (_registered) return;
  _registered = true;

  // 源路径 → userData/appearance/<名>（内容去重）→ 返回受控 URL（两步兼容路，选图与入库分开调用）
  ipcMain.handle(IPC.appearance.importImage, async (_event, sourcePath: string) => {
    const defaults = getAppearanceDefaults(fileService.appDataDir());
    const { url } = await importAppearanceImage(sourcePath, defaults.dir);
    return url;
  });

  // 背景图齿轮「打开存储位置」——主进程解析域根目录并 openPath（池内零路径知识）
  ipcMain.handle(IPC.appearance.revealStorage, async () => openAppearanceDirectory(
    getAppearanceDefaults(fileService.appDataDir()).dir,
  ));

  // 2026-11-24：选图＋入库一步——域驱动决定起始目录/过滤器/入库（插件只传 {domain,target}）
  ipcMain.handle(IPC.appearance.pickImage, async (event, options: unknown) => {
    const { driver, target } = resolveHostAssetPick(options);
    // sender 反查所属 Pool 宿主窗传 parent（脱出窗选图 modal 到脱出窗；未知/已销毁 ⇒ 无 parent，兜底不崩）
    const windowId = _windowManager?.getWindowIdByWebContents(event.sender) ?? "main";
    const hostWindow = _windowManager?.getHostWindow(windowId) ?? undefined;
    return driver.pick(driver.defaults(fileService.appDataDir()), target, hostWindow);
  });
}
