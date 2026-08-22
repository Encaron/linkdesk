/**
 * 壳侧窗口模式声明层——E5.8#43-2。纯数据（零 React 零副作用），useWindowHost hook 与
 * usePoolSync 布局组装共享同一策略表（单一真相源）。
 *
 * 三层架构（#43 定稿）：
 *   窗口层哑（主进程只登记/枚举窗口——#43-1 A2 poolWindows 注册表）；
 *   壳层策略（本模块——mode 声明层 → 初始布局组装/空窗行为/关窗×语义）；
 *   池按布局渲染（PoolLayout 子集——#43-2 B1b iconBar/sidebar/statusBar 可选化后脱出窗只推 titleBar+groups）。
 *
 * 「脱出」= mode 值，不是子系统——新增窗口类型 = WindowMode 加成员 + WINDOW_MODE_STRATEGIES
 * 加一行，零改他处（#43 架构内核「改一处不全身」的机制保证）。
 */

import type { TabState } from "../hooks/useTabManager";
import type { PoolWindowBoundsPayload } from "../core/types/ipc/poolActions";
// E5.8#45：WindowMode 下沉 core/types/windows.ts——core 回调契约（CoreCallbacks.findTabWindow）
// 与壳策略层共享单一真相源（core 不 import App）。re-export 保既有消费方 `./windows` 零改动。
import type { WindowMode } from "../core/types/windows";
export type { WindowMode };

/** PoolLayout 顶层 zone 字段——策略表 zones 声明用（布局组装按此表决定推哪些 zone） */
export type PoolZone =
  | "titleBar"
  | "iconBar"
  | "sidebar"
  | "rightSidebar"
  | "groups"
  | "panel"
  | "statusBar";

/** 窗口模式策略——mode → 初始布局组装 / 空窗行为 / 关窗×语义 / [+] 供给 */
export interface WindowModeStrategy {
  /** 该模式窗口推送的布局包含的 zone——不在此列的 zone 字段不推（池不渲染该 zone，零空列/空条） */
  zones: readonly PoolZone[];
  /** 空窗行为：main=欢迎页兜底（TabState 恒有 fallback 组）；detached=空窗自灭（最后 tab 关闭 → 壳关窗） */
  emptyBehavior: "fallback" | "autoClose";
  /** 关窗×语义：main=应用退出（主进程生命周期管）；detached=壳移除窗口状态（窗口内全部 tab 随窗关闭，非回归） */
  closeSemantics: "quitApp" | "closeTabs";
  /** [+] 创建标签菜单：main=提供（getTabCreatableViews 真实列表）；detached=不提供（I9-6——creatableViews 推空数组，池 [+] 按钮无创建菜单） */
  tabBarCreate: "provided" | "suppressed";
}

/** 窗口模式策略表——新增窗口类型 = 加一行，零改他处（#43 架构内核） */
export const WINDOW_MODE_STRATEGIES: Record<WindowMode, WindowModeStrategy> = {
  main: {
    zones: ["titleBar", "iconBar", "sidebar", "rightSidebar", "groups", "panel", "statusBar"],
    emptyBehavior: "fallback",
    closeSemantics: "quitApp",
    tabBarCreate: "provided",
  },
  detached: {
    zones: ["titleBar", "groups"],
    emptyBehavior: "autoClose",
    closeSemantics: "closeTabs",
    tabBarCreate: "suppressed",
  },
  // E5.8#45 漂移面板窗：zones = titleBar + groups（空=主区空占位，I9-13）+ panel。
  // 面板独占性 = 布局组装按 ctx.panelDetached 裁决（main 有 drift 窗时停推 panel——面板恒只在
  // 一个窗口渲染）。恒空 groups 零 tab 操作 → emptyBehavior/closeSemantics 实际不触发（无 tab）；
  // 关窗×语义 = 关闭面板（I9-13 拍板 A——windowHost onDriftWindowClosed 回调消费）。
  drift: {
    zones: ["titleBar", "groups", "panel"],
    emptyBehavior: "autoClose",
    closeSemantics: "closeTabs",
    tabBarCreate: "suppressed",
  },
};

/** 壳侧窗口状态——每窗口一个（main 活引用 useTabManager tabState；脱出窗自持 tabState） */
export interface WindowShellState {
  /** 壳生成（主池='main'，脱出窗壳自生成 id）——主进程不知「脱出」概念 */
  windowId: string;
  mode: WindowMode;
  /** 池 React 挂载完毕（onReady 到达）——就绪前壳仍可推（preload 缓冲回放），就绪后按窗定向推生效 */
  ready: boolean;
  /** 该窗口的标签页状态——tab 归属 windowId（脱出 = 组从主窗移入此窗） */
  tabState: TabState;
  /** E5.8#43-3：该窗最近一次 OS bounds（主进程 moved/resized 上报）——脱出窗重启恢复落盘源（I9-14）。主池缺省（不持久化）。 */
  bounds?: PoolWindowBoundsPayload["bounds"];
}
