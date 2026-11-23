/**
 * 「最近文件夹」宿主读取面 —— 主进程侧（2026-11-24 A3 / F2）。
 *
 * 唯一写点仍是欢迎页（`app` 命名空间）；本模块只读同一份状态并按
 * `recentFolders.ts` 的规则归一化，供 `workspace.getRecentFolders` 下发。
 * 🔴 插件⛔ 不得跨属主直读 `pluginState("app", …)`——那会随宿主键名/结构改动静默断链。
 */

import { getPluginStateValue } from "../plugins/PluginStateService";
import {
  normalizeRecentFolders,
  RECENT_DISPLAY_CAP,
  RECENT_FOLDERS_KEY,
  RECENT_OWNER,
  type RecentFolder,
} from "./recentFolders";

/** 读宿主「最近文件夹」显示列表（已去重/截断；未写/坏值 = 空表） */
export function readRecentFolders(limit: number = RECENT_DISPLAY_CAP): RecentFolder[] {
  return normalizeRecentFolders(getPluginStateValue(RECENT_OWNER, RECENT_FOLDERS_KEY), limit);
}
