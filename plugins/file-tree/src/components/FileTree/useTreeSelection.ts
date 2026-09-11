/**
 * useTreeSelection——选中 / 焦点（E6#87a 从 FileTree.tsx 拆出；行内重命名见 useTreeRename）。
 *
 * 本 hook 自持 `flatItemsRef`：组件在渲染期调用 `setFlatItems()` 写入（与原实现同序），
 * 回调内通过 ref 读最新值，因此 `handleSelect` 保持 `[model]` 级稳定 deps——
 * React.memo(FileTreeNode) 不因选中变化而整树重渲染。
 */
import { useCallback, useRef, useState } from "react";
import type React from "react";
import type { ExplorerItem, FileTreeModel } from "../../services/FileTreeModel";
import type { FlatItem } from "../../services/FileTreeKeyboard";

const lk = window.linkdesk;

/* ── E4V#35d 归一化：工作区激活——所有交互入口走此函数 ── */

/** 点击任意节点→激活所属工作区根。handleSelect / handleContextMenu / 键盘等入口统一调用。 */
async function activateWorkspaceForUri(model: FileTreeModel, uri: string): Promise<void> {
  const root = model.findClosestRoot(uri);
  if (root) {
    const active = await lk.workspace.getActive();
    if (root.uri !== active) {
      lk.workspace.setActive(root.uri);
    }
  }
}

export interface UseTreeSelectionArgs {
  model: FileTreeModel;
  onContextMenu?: (item: ExplorerItem, event: React.MouseEvent) => void;
}

export function useTreeSelection({ model, onContextMenu }: UseTreeSelectionArgs) {
  /** E4V#21: 多选——Set<string> 替代 selectedUri 单选 */
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [lastClickedUri, setLastClickedUri] = useState<string | null>(null);
  const [focusedUri, setFocusedUri] = useState<string | null>(null);

  /** E4V#22: ref 桥接——handleSelect 读最新 flatItems/lastClickedUri 做范围选中，回调保持 [] deps 稳定 */
  const flatItemsRef = useRef<FlatItem[]>([]);
  const lastClickedUriRef = useRef<string | null>(null);

  /** 组件渲染期调用——把最新 flatItems 写进 ref（保持原实现的渲染期写序） */
  const setFlatItems = useCallback((items: FlatItem[]) => {
    flatItemsRef.current = items;
  }, []);

  /** E4V#21: 键盘/单击→单选（清 Set + 加一项）——键盘回调签名不变 */
  const selectSingle = useCallback((uri: string) => {
    setSelection(new Set([uri]));
    setLastClickedUri(uri);
  }, []);
  // E4V#22: 同步 lastClickedUri ref——handleSelect 读最新值，保持 [] deps 稳定
  lastClickedUriRef.current = lastClickedUri;

  /**
   * E4V#21: Ctrl/Meta+Click → toggle 单项进/出选中集合。
   * E4V#22: Shift+Click → 从 lastClickedUri 到当前项范围选中。
   * 普通 Click → 单选。
   * 🛡️ ref 桥接 + 稳定 deps——回调稳定，React.memo(FileTreeNode) 不重渲染。
   */
  const handleSelect = useCallback((uri: string, event: React.MouseEvent) => {
    // E4V#22: Shift+Click 范围选中
    if (event.shiftKey && lastClickedUriRef.current) {
      const items = flatItemsRef.current;
      const lastIdx = items.findIndex(f => f.item.uri === lastClickedUriRef.current);
      const currIdx = items.findIndex(f => f.item.uri === uri);
      if (lastIdx !== -1 && currIdx !== -1) {
        const [start, end] = lastIdx < currIdx ? [lastIdx, currIdx] : [currIdx, lastIdx];
        setSelection(new Set(items.slice(start, end + 1).map(f => f.item.uri)));
        setFocusedUri(uri);
        // 🔥 Shift+Click 不更新 lastClickedUri——对标 VS Code 行为
        return;
      }
      // lastClickedUri 不在 flatItems 中（已折叠/删除）→ 退化为单选
    }

    // E4V#21: Ctrl/Meta+Click → toggle
    if (event.ctrlKey || event.metaKey) {
      setSelection((prev) => {
        const next = new Set(prev);
        if (next.has(uri)) { next.delete(uri); } else { next.add(uri); }
        return next;
      });
    } else {
      setSelection(new Set([uri]));
    }
    setFocusedUri(uri);
    setLastClickedUri(uri);
    activateWorkspaceForUri(model, uri);
  }, [model]);

  /** E4V#21: 右键菜单前——右键项不在选中集合则自动切为单选（对标 VS Code）。
   *  🛡️ ref 桥接——避免 selection 进 useCallback deps 导致所有 React.memo 节点重渲染 */
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const handleContextMenu = useCallback((item: ExplorerItem, event: React.MouseEvent) => {
    if (!selectionRef.current.has(item.uri)) {
      setSelection(new Set([item.uri]));
    }
    activateWorkspaceForUri(model, item.uri);
    onContextMenu?.(item, event);
  }, [onContextMenu, model]);

  return {
    selection, setSelection, setFlatItems,
    focusedUri, setFocusedUri,
    selectSingle, handleSelect, handleContextMenu,
    flatItemsRef,
  };
}
