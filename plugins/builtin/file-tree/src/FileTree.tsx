/**
 * FileTree——虚拟滚动文件树组件。
 * E4a #89：对标 VS Code AsyncDataTree + explorerViewer。
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import FileTreeNode from "./FileTreeNode";
import type { ExplorerItem } from "./FileTreeModel";
import type { FileTreeModel } from "./FileTreeModel";
import { TREE_ITEM_HEIGHT, OVERSCAN } from "./layoutTokens";
import { useFileTreeKeyboard } from "./FileTreeKeyboard";
import type { FlatItem } from "./FileTreeKeyboard";
import { useFileTreeDnD } from "./FileTreeDnD";
import { ContextKeyService } from "@src/core/ContextKeyService";

/* ── 类型 ── */

export interface StickyRow { item: ExplorerItem; depth: number; _push?: number }

interface FileTreeProps {
  model: FileTreeModel;
  onOpenFile: (item: ExplorerItem, mode: "preview" | "pin") => void;
  onContextMenu?: (item: ExplorerItem, event: React.MouseEvent) => void;
  /** PinnedSlot——FileTree 把当前 stickyRows 写入此 ref，外部 pinnedContent 读取 */
  stickyRowsRef?: React.MutableRefObject<StickyRow[]>;
}

/* ── 工具 ── */

/** S1: 在 flatItems 中找目录最后一个后代的索引。反向扫描——第一个匹配即停。 */
function findLastDescendant(dirUri: string, flatItems: FlatItem[]): number {
  for (let i = flatItems.length - 1; i >= 0; i--) {
    const uri = flatItems[i].item.uri;
    if (uri === dirUri || uri.startsWith(dirUri + "/")) return i;
  }
  return -1;
}

function flattenTree(model: FileTreeModel): FlatItem[] {
  const result: FlatItem[] = [];
  function walk(item: ExplorerItem, depth: number, guide: boolean) {
    if (item.isDirectory) {
      const compacted = model.compactController.getCompactedSegments(item);
      if (compacted) {
        const leaf = findLeaf(item);
        const currentLeaf = leaf ? (model.findClosest(leaf.uri) ?? leaf) : null;
        const twistieItem = (currentLeaf && !currentLeaf.isDirectory && currentLeaf.parent)
          ? currentLeaf.parent : currentLeaf;
        const shouldUnfold = twistieItem?.isDirectory === true
          && model.isExpanded(twistieItem.uri) && twistieItem.children !== null;
        if (!shouldUnfold) {
          result.push({ item: twistieItem ?? item, depth, compactedSegments: compacted, guide });
          return;
        }
      }
    }
    result.push({ item, depth, guide });
    if (model.isExpanded(item.uri) && item.children !== null) {
      const len = item.children.length;
      for (let i = 0; i < len; i++) walk(item.children[i], depth + 1, i < len - 1);
    }
  }
  const roots = model.roots;
  for (let i = 0; i < roots.length; i++) walk(roots[i], 1, i < roots.length - 1);
  return result;
}

function findLeaf(item: ExplorerItem): ExplorerItem | null {
  if (!item.isDirectory || item.children === null || item.children.length !== 1) return item;
  const child = item.children[0];
  if (!child.isDirectory) return child;
  return findLeaf(child);
}

/* ── 组件 ── */

const FileTree: React.FC<FileTreeProps> = ({ model, onOpenFile, onContextMenu, stickyRowsRef }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [focusedUri, setFocusedUri] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  /* ── ResizeObserver ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => { setContainerHeight(entries[0].contentRect.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── 模型变更 → 重渲染 ── */
  useEffect(() => {
    return model.onDidChange.event(() => { rerender(); });
  }, [model, rerender]);

  /* ── 虚拟列表 ── */
  const flatItems = useMemo(() => { void (version); return flattenTree(model); }, [model, version]);
  const startIndex = Math.max(0, Math.floor(scrollTop / TREE_ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = containerHeight > 0 ? Math.ceil(containerHeight / TREE_ITEM_HEIGHT) + 2 * OVERSCAN : 50;
  const endIndex = Math.min(flatItems.length, startIndex + visibleCount);
  const totalHeight = flatItems.length * TREE_ITEM_HEIGHT;
  const renderedItems = useMemo(() => flatItems.slice(startIndex, endIndex), [flatItems, startIndex, endIndex]);

  /* ── sticky rows——VS Code calculateStickyNodePosition，约束 ≤7 + ≤40% 视口 ── */
  const stickyRows = useMemo(() => {
    const st = scrollTopRef.current;
    if (st <= 0 || flatItems.length === 0) return [] as StickyRow[];
    // 取视口第一行的祖先链
    const idx = Math.floor(st / TREE_ITEM_HEIGHT);
    const first = flatItems[Math.min(idx, flatItems.length - 1)];
    const ancestors = model.getAncestors(first.item);
    const root = flatItems[0]?.item;
    if (root && root.isDirectory && ancestors[0]?.uri !== root.uri) ancestors.unshift(root);
    if (first.item.isDirectory && model.isExpanded(first.item.uri) && first.item.uri !== root?.uri) {
      ancestors.push(first.item);
    }
    // 约束数量
    const byHeight = containerHeight > 0 ? Math.floor(containerHeight * 0.4 / TREE_ITEM_HEIGHT) : 7;
    const maxCount = Math.min(7, Math.max(1, byHeight));
    const constrained = ancestors.slice(0, maxCount);
    // VS Code calculateStickyNodePosition——每行独立算位置
    const rows: StickyRow[] = [];
    let stickyH = 0;
    for (let i = 0; i < constrained.length; i++) {
      const item = constrained[i];
      const endIdx = findLastDescendant(item.uri, flatItems);
      let position = stickyH;
      if (endIdx >= 0) {
        const bottomOfLast = (endIdx * TREE_ITEM_HEIGHT - st) + TREE_ITEM_HEIGHT;
        if (stickyH + TREE_ITEM_HEIGHT > bottomOfLast && stickyH <= bottomOfLast) {
          position = bottomOfLast - TREE_ITEM_HEIGHT;
        }
      }
      rows.push({ item, depth: i + 1, _push: stickyH - position });
      stickyH += TREE_ITEM_HEIGHT;
    }
    return rows;
  }, [flatItems, model, scrollTop, containerHeight]);
  // 对外暴露——PinnedSlot 的 pinnedContent 从这里读
  if (stickyRowsRef) stickyRowsRef.current = stickyRows;

  /* ── 滚动检测 ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let scrollEl: HTMLElement | null = el.parentElement;
    while (scrollEl) {
      if (/(auto|scroll)/.test(window.getComputedStyle(scrollEl).overflowY)) break;
      scrollEl = scrollEl.parentElement;
    }
    if (!scrollEl) return;
    scrollTopRef.current = scrollEl.scrollTop;
    setScrollTop(scrollEl.scrollTop);
    const handler = () => { scrollTopRef.current = scrollEl.scrollTop; setScrollTop(scrollEl.scrollTop); };
    scrollEl.addEventListener("scroll", handler, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handler);
  }, []);

  /* ── twistie 展开/折叠 ── */
  const handleTwistie = useCallback(async (item: ExplorerItem) => {
    if (!item.isDirectory && item.children === null) return;
    if (model.isExpanded(item.uri)) {
      model.collapse(item.uri);
      model.compactController.collapseCompact(item.uri);
    } else {
      model.expand(item.uri);
      model.compactController.expandCompact(item.uri);
      try {
        await model.getChildren(item);
        // 🔥 递归展开单子目录链——一次点击展开整条 compact chain
        let next = item;
        while (next.children?.length === 1 && next.children[0].isDirectory) {
          const child = next.children[0];
          model.expand(child.uri);
          model.compactController.expandCompact(child.uri);
          await model.getChildren(child);
          next = child;
        }
      } catch (e) { console.error("[file-tree] expand failed:", item.name, e); }
    }
  }, [model]);

  /* ── 选中 / 打开 / 右键 ── */
  const handleSelect = useCallback((uri: string) => { setSelectedUri(uri); setFocusedUri(uri); }, []);
  const handleOpen = useCallback((item: ExplorerItem, mode: "preview" | "pin") => { onOpenFile(item, mode); }, [onOpenFile]);
  const handleContextMenu = useCallback((item: ExplorerItem, event: React.MouseEvent) => {
    setSelectedUri(item.uri);
    onContextMenu?.(item, event);
  }, [onContextMenu]);

  /* ── 键盘 / 拖放 ── */
  const handleKeyDown = useFileTreeKeyboard(
    { model, flatItems, focusedUri },
    { setFocusedUri, setSelectedUri, rerender, onOpenFile, onTwistie: handleTwistie, getContainerEl: () => containerRef.current },
  );
  const { dndState, handleDragStart, handleDragOver, handleDragLeave, handleDrop } = useFileTreeDnD({
    flatItems, model, rerender, getContainerEl: () => containerRef.current,
  });

  /* ── context keys ── */
  useEffect(() => {
    ContextKeyService.setValue("explorerResourceCut", false);
    ContextKeyService.setValue("explorerClipboardEmpty", true);
    ContextKeyService.setValue("explorerResourceMoveableToTrash", navigator.platform.includes("Win"));
  }, []);
  const handleFocus = useCallback(() => { ContextKeyService.setValue("explorerFocus", true); }, []);
  const handleBlur = useCallback(() => { ContextKeyService.setValue("explorerFocus", false); }, []);
  useEffect(() => {
    if (focusedUri) {
      const fi = flatItems.find((f) => f.item.uri === focusedUri);
      ContextKeyService.setValue("explorerItemIsFile", fi?.item.isDirectory === false);
      ContextKeyService.setValue("explorerResourceReadonly", fi?.item.isReadonly === true);
      ContextKeyService.setValue("explorerViewletCompressedFocus", (fi?.compactedSegments?.length ?? 0) > 0);
    } else {
      ContextKeyService.setValue("explorerItemIsFile", false);
      ContextKeyService.setValue("explorerResourceReadonly", false);
      ContextKeyService.setValue("explorerViewletCompressedFocus", false);
    }
    ContextKeyService.setValue("viewHasSomeCollapsibleItem", model.getExpandedUris().length > 0);
  }, [focusedUri, flatItems, model]);

  /* ── 渲染 ── */
  return (
    <div ref={containerRef} tabIndex={0} onKeyDown={handleKeyDown}
      onFocus={handleFocus} onBlur={handleBlur}
      onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
      className="file-tree-scroll">
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ height: startIndex * TREE_ITEM_HEIGHT }} />
        {renderedItems.map(({ item, depth, compactedSegments, guide, isDimmed }, i) => (
          <FileTreeNode key={item.uri} item={item} depth={depth} indent={0}
            expanded={item.isDirectory && model.isExpanded(item.uri)}
            isSelected={item.uri === selectedUri} isFocused={item.uri === focusedUri}
            isDragSource={dndState.sourceUri === item.uri}
            isDragHover={dndState.hoverIndex === startIndex + i}
            compactedSegments={compactedSegments} guide={guide} isDimmed={isDimmed}
            onDragStart={handleDragStart} onSelect={handleSelect} onOpen={handleOpen}
            onTwistieClick={handleTwistie} onContextMenu={handleContextMenu} />
        ))}
      </div>
    </div>
  );
};

export default FileTree;
