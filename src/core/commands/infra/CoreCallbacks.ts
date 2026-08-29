/**
 * CoreCallbacks —— 壳核心回调接口。
 * E5#44-1：从 coreCommands.ts 提取——类型 + 注册函数独立文件。
 *
 * MainContent 注册回调 → 本模块 → 壳快捷键/菜单命令 consume。
 * 对标 VS Code：workbench 回调注册模式。
 */

import type { WindowMode } from "../../types/windows"; // E5.8#45：WindowMode 单一真相源（core/types——壳策略层同源引用）

export interface CoreCallbacks {
  closeTab: (tabId: string) => void;
  closeOtherTabs: (groupId: string, exceptTabId: string) => void;
  closeRightTabs: (groupId: string, tabIndex: number) => void;
  splitTab: (tabId: string, direction: "horizontal" | "vertical") => void;
  findGroupByTabId: (tabId: string) => { groupId: string; tabs: Array<{ id: string }> } | null;
  openTab: (pluginId: string) => string;
  /** E5.8#46.8：按聚焦窗关闭 active tab——sourceWindowId 来自键盘转发载荷（脱出窗关本窗 tab）；主窗/未注为 undefined */
  closeActiveTab: (sourceWindowId?: string) => void;
  reopenClosedTab: () => string | null;
  focusNextTab: (shift: boolean) => void;
  toggleSplit: () => void;
  focusNthTab: (n: number) => void;
  closeAllEditors: () => void;
  /** E5.6#16.7k：池 GroupTabBar 右键菜单——关闭全部（指定 group） */
  closeAllTabs: (groupId: string) => void;
  /** E5.6#16.7k：池 GroupTabBar 右键菜单——复制标签页 */
  duplicateTab: (tabId: string) => void;
  /** E5.6#16.7k：池 GroupTabBar 右键菜单——固定/取消固定 */
  pinTab: (tabId: string) => void;
  /** E5.8#38（I8-3/IX-1 单一实例）：聚焦已有插件标签页——找到则聚焦（跨 group 切换）返回 true，无返回 false */
  focusTabByPluginId: (pluginId: string) => boolean;
  /** E5.8#44：拖出 tab 到新窗（右键「在新窗口中打开」） */
  detachTab: (tabId: string) => void;
  /** E5.8#44：并回主窗（右键「并回主窗口」——脱出窗专属） */
  mergeTabToMain: (tabId: string) => void;
  /** E5.8#44：找 tab 所在窗口——「并回主窗口」可见性判定（detached 才注入） */
  findTabWindow: (tabId: string) => { windowId: string; mode: WindowMode } | null;
}

let _callbacks: CoreCallbacks | null = null;
let _registered = false;

export function updateCoreCallbacks(cb: CoreCallbacks): void {
  _callbacks = cb;
}

export function getCallbacks(): CoreCallbacks | null {
  return _callbacks;
}

export function isRegistered(): boolean {
  return _registered;
}

export function setRegistered(): void {
  _registered = true;
}
