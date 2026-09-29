/**
 * CoreCallbacks —— 壳核心回调接口。
 * E5#44-1：从 coreCommands.ts 提取——类型 + 注册函数独立文件。
 *
 * MainContent 注册回调 → 本模块 → 壳快捷键/菜单命令 consume。
 * 对标 VS Code：workbench 回调注册模式。
 */

import type { WindowMode } from "../../types/windows"; // E5.8#45：WindowMode 单一真相源（core/types——壳策略层同源引用）
import type { LayoutData, SplitResult, SplitSizesResult } from "../../../hooks/useTabManager"; // 04 工作区导入恢复：整表替换的入参形状（同 useTabManager.restoreLayout）／AI#55：分屏回执／AI#53：设比例回执

export interface CoreCallbacks {
  closeTab: (tabId: string) => void;
  closeOtherTabs: (groupId: string, exceptTabId: string) => void;
  closeRightTabs: (groupId: string, tabIndex: number) => void;
  /** M2 生长格 `AI#55`：分屏回执——树没变时必须回 `noop` ＋ `reason`（`ok:false` = 调用本身有问题）。
   *  唯一权威 = reducer（`attemptSplitTab`）；命令层只透出，⛔ 不重算深度/标签数。 */
  splitTab: (tabId: string, direction: "horizontal" | "vertical") => SplitResult;
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
  /**
   * 04「工作区导入导出-布局恢复断线」（2026-09-26 接线）：导入工作区时的**标签页布局恢复**——
   * 整表替换语义（同启动恢复 `restoreLayout`），含 `tab:focused` 补发与计数器同步（E5.7 Bug D 全流程）。
   * ⚠️ **可选成员**：只有 App 的 tabActions 作用域拿得到 `restoreLayout`（useTabManager），
   * 非组件代码（`lifecycle.ts` 的 RESTORE_WORKSPACE 监听器）经 `getCallbacks()?.` 调用。
   */
  restoreTabLayout?: (layout: LayoutData) => { pluginId: string; tabId: string } | null;
  /**
   * M2 `AI#21`：分屏比例整体复位（树里所有分支回 `[50, 50]`）——`workbench.action.resetSplitSizes`
   * 的落点。⚠️ **可选成员**：与 `restoreTabLayout` 同款理由——非组件代码经 `getCallbacks()?.` 调用，
   * 未注册（无 tab 管理器的宿主）时命令静默 no-op 而不是崩。
   */
  resetSplitSizes?: () => void;
  /**
   * M2 生长格 `AI#53`：分屏比例**精确设**（把某条分支设成 `[70, 30]`）——`workbench.action.setSplitSizes`
   * 的落点。定位两条路：`anchorGroupId`（该组所在分支）／`branchIndex`（1 起先序，鼠标拖拽那套）。
   * ⚠️ **可选成员**：与 `resetSplitSizes` 同款理由（非组件代码经 `getCallbacks()?.` 调用）。
   * 回执语义同 `splitTab`：`ok:true`＝改了 ／ `ok:true,noop,reason`＝没改 ／ `ok:false,noop,reason`＝这次调用有问题。
   */
  setSplitSizes?: (anchorGroupId: string, sizes: [number, number], branchIndex?: number) => SplitSizesResult;
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
