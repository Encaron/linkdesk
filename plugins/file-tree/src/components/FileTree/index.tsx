/**
 * FileTree——虚拟滚动文件树组件（门面）。
 * E4a #89：对标 VS Code AsyncDataTree + explorerViewer。
 *
 * 原 463 行单文件按职责拆件（E6#87a）——本文件只留容器体：虚拟滚动窗口计算 +
 * JSX 组装 + 命令桥接（`useImperativeHandle`）。各子件：
 *   - `types.ts`            FileTreeHandle / FileTreeProps 契约
 *   - `flatten.ts`          扁平化 + compact 折叠链（`_compactFolders` 单一属主）
 *   - `useTreeSelection.ts` 选中 / 焦点 / 行内重命名
 *   - `useTreeConfig.ts`    四项外部配置订阅
 *   - `useTreeResize.ts`    容器高度 + 滚动容器探测
 *   - `useTreeExpansion.ts` twistie 展开/折叠
 *
 * 消费方（FoldersView / FileTreeContextMenu）import 路径零变更。
 */

import React, { useState, useCallback, useEffect, useMemo, useImperativeHandle, forwardRef } from "react";
import FileTreeNode from "../FileTreeNode";
import type { ExplorerItem } from "../../services/FileTreeModel";
import { OVERSCAN } from "../../utils/layoutTokens";
import { useFileTreeKeyboard } from "../../services/FileTreeKeyboard";
import { useFileTreeDnD } from "../../services/FileTreeDnD";
import { fileTreeClipboard } from "../../services/FileTreeClipboard";
import { flattenTree } from "./flatten";
import { useTreeConfig } from "./useTreeConfig";
import { useTreeResize } from "./useTreeResize";
import { useTreeExpansion } from "./useTreeExpansion";
import { useTreeSelection } from "./useTreeSelection";
import { useTreeRename } from "./useTreeRename";
import type { FileTreeHandle, FileTreeProps } from "./types";

const FileTree = forwardRef<FileTreeHandle, FileTreeProps>(function FileTree(
  { model, onOpenFile, onContextMenu }, ref,
) {
  const { containerRef, scrollElRef, scrollTop, containerHeight } = useTreeResize();
  const getContainerEl = useCallback(() => containerRef.current, [containerRef]);

  const [version, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  const { activeWorkspaceUri, iconThemeId, itemHeight, expandOnClick } = useTreeConfig(rerender);

  const {
    selection, setSelection, setFlatItems,
    focusedUri, setFocusedUri,
    selectSingle, handleSelect, handleContextMenu,
    flatItemsRef,
  } = useTreeSelection({ model, onContextMenu });

  const { renamingUri, startRename, finishRename, cancelRename } = useTreeRename({
    model, selection, focusedUri, setFocusedUri, setSelection, getContainerEl,
  });

  /* ── 🔥 归一化桥接：一个 ref 暴露全部实时状态——替代多个模块级变量 ── */
  const [revealTarget, setRevealTarget] = useState<string | null>(null);

  /* ── E4V#30: reveal 滚动——revealTarget 变更后等 React 渲染完再 scroll ── */
  useEffect(() => {
    if (!revealTarget) return;
    const timer = requestAnimationFrame(() => {
      const items = flatItemsRef.current;
      const idx = items.findIndex((f) => f.item.uri === revealTarget);
      if (idx === -1) { setRevealTarget(null); return; }
      const scrollEl = scrollElRef.current;
      if (!scrollEl) { setRevealTarget(null); return; }
      const itemTop = idx * itemHeight;
      const viewHalf = scrollEl.clientHeight / 2;
      // 居中显示——上限不超过 totalHeight（防空白）
      const target = Math.max(0, itemTop - viewHalf + itemHeight / 2);
      scrollEl.scrollTop = target;
      setRevealTarget(null);
    });
    return () => cancelAnimationFrame(timer);
  }, [revealTarget, itemHeight, flatItemsRef, scrollElRef]);

  useImperativeHandle(ref, () => ({
    getSelection: () => Array.from(selection),
    getFocusedUri: () => focusedUri,
    getModel: () => model,
    rerender: () => rerender(),
    startRename,
    reveal: async (uri: string) => {
      const item = await model.findAndExpandToBypassExclude(uri);
      if (!item) return;
      // 选中 + 聚焦目标
      setSelection(new Set([uri]));
      setFocusedUri(uri);
      setRevealTarget(uri);
      // rerender 后 scroll——useEffect 监测 revealTarget 变化后执行
      rerender();
    },
  }), [selection, focusedUri, model, rerender, startRename, setSelection, setFocusedUri]);

  /* ── 模型变更 → 重渲染 ── */
  useEffect(() => {
    return model.onDidChange.event(() => { rerender(); });
  }, [model, rerender]);

  /** 🔥 剪切中 URI 集合——render body 直读，FoldersView.rerender 驱动刷新 */
  const cutUris = fileTreeClipboard.isCut ? new Set(fileTreeClipboard.uris) : new Set<string>();
  const flatItems = useMemo(() => { void (version); return flattenTree(model); }, [model, version]);
  setFlatItems(flatItems); // E4V#22: handleSelect 通过 ref 读最新 flatItems
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - OVERSCAN);
  const visibleCount = containerHeight > 0 ? Math.ceil(containerHeight / itemHeight) + 2 * OVERSCAN : 50;
  const endIndex = Math.min(flatItems.length, startIndex + visibleCount);
  const totalHeight = flatItems.length * itemHeight;
  const renderedItems = useMemo(() => flatItems.slice(startIndex, endIndex), [flatItems, startIndex, endIndex]);

  /* ── twistie 展开/折叠 ── */
  const handleTwistie = useTreeExpansion(model);

  /* ── 选中 / 打开 / 右键 ── */
  const handleOpen = useCallback((item: ExplorerItem, mode: "preview" | "pin") => { onOpenFile(item, mode); }, [onOpenFile]);

  /* ── 键盘 / 拖放 ── */
  const rawKeyDown = useFileTreeKeyboard(
    { model, flatItems, focusedUri },
    { setFocusedUri, setSelectedUri: selectSingle, rerender, onOpenFile, onTwistie: handleTwistie, getContainerEl },
  );

  /** E4V#23: Ctrl+A 全选——拦截后走 ref 读最新 flatItems，其余键委托给键盘 hook */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "a") {
      e.preventDefault();
      const items = flatItemsRef.current;
      if (items.length > 0) {
        setSelection(new Set(items.map(f => f.item.uri)));
      }
      return;
    }
    rawKeyDown(e);
  }, [rawKeyDown, flatItemsRef, setSelection]);
  // E4V#34h2: OS 拖入文件后自动打开——回调传 (filePath, name)，构造最小 item 适配 onOpenFile
  const onAutoOpenDroppedFile = useCallback((filePath: string, name: string) => {
    onOpenFile({ uri: filePath, name, isDirectory: false, isSymlink: false, children: null, parent: null } as ExplorerItem, "preview");
  }, [onOpenFile]);

  const { dndState, handleDragStart, handleDragOver, handleDragLeave, handleDrop } = useFileTreeDnD({
    flatItems, model, rerender, getContainerEl, onAutoOpenDroppedFile,
  });

  /* ── context keys ── */
  useEffect(() => {
    window.linkdesk?.contextKey?.set("explorerResourceCut", false);
    window.linkdesk?.contextKey?.set("explorerClipboardEmpty", true);
    window.linkdesk?.contextKey?.set("explorerResourceMoveableToTrash", navigator.platform.includes("Win"));
  }, []);
  const handleFocus = useCallback(() => { window.linkdesk?.contextKey?.set("explorerFocus", true); }, []);
  const handleBlur = useCallback(() => { window.linkdesk?.contextKey?.set("explorerFocus", false); }, []);
  useEffect(() => {
    if (focusedUri) {
      const fi = flatItems.find((f) => f.item.uri === focusedUri);
      window.linkdesk?.contextKey?.set("explorerItemIsFile", fi?.item.isDirectory === false);
      window.linkdesk?.contextKey?.set("explorerResourceReadonly", fi?.item.isReadonly === true);
      window.linkdesk?.contextKey?.set("explorerViewletCompressedFocus", (fi?.compactedSegments?.length ?? 0) > 0);
    } else {
      window.linkdesk?.contextKey?.set("explorerItemIsFile", false);
      window.linkdesk?.contextKey?.set("explorerResourceReadonly", false);
      window.linkdesk?.contextKey?.set("explorerViewletCompressedFocus", false);
    }
    window.linkdesk?.contextKey?.set("viewHasSomeCollapsibleItem", model.getExpandedUris().length > 0);
  }, [focusedUri, flatItems, model]);

  /** 点文件树空白处→清空选中（对标 VS Code）。节点 onClick 已 stopPropagation 不冒泡到这里 */
  const handleClearSelection = useCallback(() => setSelection(new Set()), [setSelection]);

  /* ── 渲染 ── */
  return (
    <div ref={containerRef} tabIndex={0} onKeyDown={handleKeyDown}
      onFocus={handleFocus} onBlur={handleBlur}
      onClick={handleClearSelection}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      className="file-tree-scroll">
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ height: startIndex * itemHeight }} />
        {renderedItems.map(({ item, depth, compactedSegments, guide, isDimmed }, i) => (
          <FileTreeNode key={item.uri} item={item} decoration={item.decoration} depth={depth} indent={0}
            expanded={item.isDirectory && model.isExpanded(item.uri)}
            isSelected={selection.has(item.uri)} isFocused={item.uri === focusedUri}
            isDragSource={dndState.sourceUri === item.uri}
            isDragHover={dndState.hoverIndex === startIndex + i}
            isCut={cutUris.has(item.uri)}
            isRenaming={item.uri === renamingUri}
            isActiveRoot={item.parent === null && item.uri === activeWorkspaceUri}
            iconThemeId={iconThemeId}
            onRenameConfirm={finishRename}
            onRenameCancel={cancelRename}
            compactedSegments={compactedSegments} guide={guide} isDimmed={isDimmed}
            onDragStart={handleDragStart} onSelect={handleSelect} onOpen={handleOpen}
            onTwistieClick={handleTwistie} onContextMenu={handleContextMenu}
            expandOnClick={expandOnClick} />
        ))}
      </div>
    </div>
  );
});

export default FileTree;
export type { FileTreeHandle, FileTreeProps } from "./types";
