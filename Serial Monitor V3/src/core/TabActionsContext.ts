/**
 * TabActionsContext — 提供 createTab / openOrFocusTab 给插件使用。
 * Phase 4 P0-1：插件市场需要创建 PluginDetailView 标签页。
 *
 * 对标 VS Code：扩展可以调用 commands 打开编辑器。
 * V3 中插件通过此 context 获取标签页操作能力。
 */
import { createContext, useContext } from "react";
import type { CreateTabOptions } from "./types";

export interface TabActions {
  createTab: (type: string, opts?: CreateTabOptions) => string;
  openOrFocusTab: (type: string) => string | null;
}

const TabActionsContext = createContext<TabActions | null>(null);

/** 插件使用此 hook 获取标签页操作能力 */
export function useTabActions(): TabActions | null {
  return useContext(TabActionsContext);
}

export default TabActionsContext;
