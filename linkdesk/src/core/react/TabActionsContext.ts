/**
 * TabActions — 插件标签页操作 API。
 * E5#7g：消灭 React Context Provider——useTabActions 直接 emit ShellEvents。
 *
 * 对标 VS Code：插件通过 commands 操作标签页。
 * 任何组件调用 useTabActions() 拿到相同行为——不依赖组件树作用域。
 */
import { useMemo } from "react";
import { shellEvents } from "./ShellEvents";
import type { CreateTabOptions } from "../types";
import type { CloseTabResult } from "../../hooks/useTabManager";

export interface TabActions {
  createTab: (type: string, opts?: CreateTabOptions) => string;
  openOrFocusTab: (type: string, opts?: CreateTabOptions) => string | null;
  focusTab: (tabId: string) => void;
  closeTab: (tabId: string) => CloseTabResult;
  focusTabBySourceId: (sourceId: string) => void;
  updateTabLabelBySourceId: (sourceId: string, label: string) => void;
  closeTabBySourceId: (sourceId: string) => CloseTabResult;
}

const STUB_CLOSE_RESULT: CloseTabResult = { closed: true, tabId: "" };

export function useTabActions(): TabActions | null {
  return useMemo(() => ({
    createTab: (type, opts) => {
      shellEvents.emit("tab:create", { type, opts: opts as Record<string, unknown> | undefined });
      return "";
    },
    openOrFocusTab: (type, opts) => {
      shellEvents.emit("tab:openOrFocus", { type, opts: opts as Record<string, unknown> | undefined });
      return null;
    },
    focusTab: (tabId) => { shellEvents.emit("tab:focus", { tabId }); },
    closeTab: (tabId) => {
      shellEvents.emit("tab:close", { tabId });
      return STUB_CLOSE_RESULT;
    },
    focusTabBySourceId: (sourceId: string) => { shellEvents.emit("tab:focusBySourceId", { sourceId }); },
    updateTabLabelBySourceId: (sourceId: string, label: string) => { shellEvents.emit("tab:updateLabelBySourceId", { sourceId, label }); },
    closeTabBySourceId: (sourceId: string) => {
      shellEvents.emit("tab:closeBySourceId", { sourceId });
      return STUB_CLOSE_RESULT;
    },
  }), []);
}
