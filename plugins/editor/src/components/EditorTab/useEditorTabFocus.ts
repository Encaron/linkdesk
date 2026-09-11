/**
 * E5.7 fix（2026-08-16）：tab:focusRequested——点击标签页时该编辑器获焦（VS Code 语义，E6#87c 拆自 EditorTab.tsx）。
 *
 * 点已激活标签不翻转 isActive → EditorView 激活 focus effect 不触发 → 分屏下焦点留在
 * 另一组编辑器，Ctrl+S（Monaco 局部键位）打到错实例——保存错文件。事件源 =
 * GroupTabBar onClick（池内事件，直达本 WCV）。点未激活标签时事件早到（display:none
 * 中 focus 无害 no-op），随后 isActive 翻转的 effect 兜底。
 */
import { useEffect } from "react";
import type { RefObject } from "react";
import type { EditorViewHandle } from "../../views/EditorView";

const lk = window.linkdesk;

export function useEditorTabFocus(editorViewRef: RefObject<EditorViewHandle>, tabId?: string): void {
  useEffect(() => {
    if (!tabId) return;
    return lk.events.on<{ tabId: string }>("tab:focusRequested", ({ tabId: id }) => {
      if (id !== tabId) return;
      editorViewRef.current?.focus();
    });
  }, [tabId, editorViewRef]);
}
