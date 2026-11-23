/**
 * 宿主资产域 · appearance —— 域门面。
 *
 * 三个动作（选图/入库/开目录）绑定到统一驱动接口；`defaults.ts` 是起始目录/过滤器的唯一源。
 * 消费方 = `electron/ipc/handlers/hostAssets-handlers.ts`（IPC）与旧 dialog 令牌兼容映射。
 */

import type { HostAssetDriver } from "../types";
import { APPEARANCE_DOMAIN, getAppearanceDefaults } from "./defaults";
import { importAppearanceImage } from "./importAsset";
import { openAppearanceDirectory } from "./openDir";
import { pickAppearanceImage } from "./pick";

export { APPEARANCE_DOMAIN, getAppearanceDefaults };
export { importAppearanceImage };
export { openAppearanceDirectory };

/** appearance 域驱动——注册进 `hostAssets/index.ts` 的域表 */
export const appearanceDriver: HostAssetDriver = {
  defaults: getAppearanceDefaults,
  importImage: (sourcePath, defaults) => importAppearanceImage(sourcePath, defaults.dir),
  openDirectory: (defaults) => openAppearanceDirectory(defaults.dir),
  pick: (defaults, target, hostWindow) => pickAppearanceImage(defaults, target, hostWindow),
};
