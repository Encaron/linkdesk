/**
 * CoreCallbacks —— 壳核心回调接口。
 * E5#44-1：从 coreCommands.ts 提取——类型 + 注册函数独立文件。
 *
 * MainContent 注册回调 → 本模块 → 壳快捷键/菜单命令 consume。
 * 对标 VS Code：workbench 回调注册模式。
 */

export interface CoreCallbacks {
  closeTab: (tabId: string) => void;
  closeOtherTabs: (groupId: string, exceptTabId: string) => void;
  closeRightTabs: (groupId: string, tabIndex: number) => void;
  splitTab: (tabId: string, direction: "horizontal" | "vertical") => void;
  findGroupByTabId: (tabId: string) => { groupId: string; tabs: Array<{ id: string }> } | null;
  openTab: (pluginId: string) => string;
  closeActiveTab: () => void;
  reopenClosedTab: () => string | null;
  focusNextTab: (shift: boolean) => void;
  toggleSplit: () => void;
  focusNthTab: (n: number) => void;
  closeAllEditors: () => void;
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
