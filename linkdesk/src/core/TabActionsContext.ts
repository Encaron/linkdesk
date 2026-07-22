/**
 * TabActionsContext — 提供 createTab / openOrFocusTab 给插件使用。
 * Phase 4 P0-1：插件市场需要创建 PluginDetailView 标签页。
 *
 * 对标 VS Code：扩展可以调用 commands 打开编辑器。
 * V3 中插件通过此 context 获取标签页操作能力。
 */
import { createContext, useContext } from "react";
import type { CreateTabOptions } from "./types";
import type { CloseTabResult } from "../hooks/useTabManager";

export interface TabActions {
  createTab: (type: string, opts?: CreateTabOptions) => string;
  /** Phase 5 rootfix：加 opts 参数——调用方可传 pinned 控制预览行为 */
  openOrFocusTab: (type: string, opts?: CreateTabOptions) => string | null;
  /** Phase 5.5c：侧栏点会话 → 聚焦该会话对应的标签页（按 tabId 精确聚焦，非按 type） */
  focusTab: (tabId: string) => void;
  /** Phase 5.5c：侧栏删会话 → 同步关闭对应标签页 */
  closeTab: (tabId: string) => CloseTabResult;
  /** 按 sourceId 找标签页并聚焦——通用 API。session/文件/数据库连接等
   *  插件维护自己的数据模型，通过 sourceId 链接到标签页。 */
  focusTabBySourceId: (sourceId: string) => void;
}

const TabActionsContext = createContext<TabActions | null>(null);

/** 插件使用此 hook 获取标签页操作能力 */
export function useTabActions(): TabActions | null {
  return useContext(TabActionsContext);
}

export default TabActionsContext;
