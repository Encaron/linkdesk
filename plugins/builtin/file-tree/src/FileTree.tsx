/**
 * FileTree——虚拟滚动文件树组件。
 * E4a #89：对标 VS Code AsyncDataTree + explorerViewer。
 */

import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import FileTreeNode from "./FileTreeNode";
import type { ExplorerItem } from "./FileTreeModel";
import type { FileTreeModel } from "./FileTreeModel";
import { TREE_ITEM_HEIGHT, TREE_INDENT, OVERSCAN } from "./layoutTokens";
import { useFileTreeKeyboard } from "./FileTreeKeyboard";
import type { FlatItem } from "./FileTreeKeyboard";
import { useFileTreeDnD } from "./FileTreeDnD";
import { ContextKeyService } from "@src/core/ContextKeyService";

/* ── 类型 ── */

interface FileTreeProps {
  model: FileTreeModel;
  onOpenFile: (item: ExplorerItem, mode: "preview" | "pin") => void;
  onContextMenu?: (item: ExplorerItem, event: React.MouseEvent) => void;
}

/* ── 工具 ── */

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

const FileTree: React.FC<FileTreeProps> = ({ model, onOpenFile, onContextMenu }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(0); // 实时值，绕过 React setState 异步延迟
  const [containerHeight, setContainerHeight] = useState(0);
  const [sidePanelRect, setSidePanelRect] = useState({ top: 0, left: 0, width: 0 });
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
  const flatItemsRef = useRef<FlatItem[]>([]);
  const flatItems = useMemo(() => {
    void (version);
    const items = flattenTree(model);
    flatItemsRef.current = items;
    console.log("[file-tree] flatItems=%d roots=[%s] expanded=[%s]",
      items.length,
      model.roots.map(r => r.name).join(","),
      model.getExpandedUris().map(u => u.replace(/.*[\\/]/, "")).join(","));
    return items;
  }, [model, version]);
  const startIndex = Math.max(0, Math.floor(scrollTop / TREE_ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = containerHeight > 0 ? Math.ceil(containerHeight / TREE_ITEM_HEIGHT) + 2 * OVERSCAN : 50;
  const endIndex = Math.min(flatItems.length, startIndex + visibleCount);
  const totalHeight = flatItems.length * TREE_ITEM_HEIGHT;
  const renderedItems = useMemo(() => flatItems.slice(startIndex, endIndex), [flatItems, startIndex, endIndex]);

  // E4V#20+F2: sticky rows——根始终在最前，约束 ≤7 + ≤40% 视口
  const stickyRows = useMemo(() => {
    const st = scrollTopRef.current;
    if (st <= 0 || flatItems.length === 0) return [] as { item: ExplorerItem; depth: number }[];
    const idx = Math.floor((st + TREE_ITEM_HEIGHT / 2) / TREE_ITEM_HEIGHT);
    const first = flatItems[Math.min(idx, flatItems.length - 1)];
    const ancestors = model.getAncestors(first.item);
    const root = flatItems[0]?.item;
    if (root && root.isDirectory && ancestors[0]?.uri !== root.uri) ancestors.unshift(root);
    if (first.item.isDirectory && model.isExpanded(first.item.uri) && first.item.uri !== root?.uri) {
      ancestors.push(first.item);
    }
    const byHeight = containerHeight > 0 ? Math.floor(containerHeight * 0.4 / TREE_ITEM_HEIGHT) : 7;
    const maxCount = Math.min(7, Math.max(1, byHeight));
    const result = ancestors.slice(0, maxCount).map((item, i) => ({ item, depth: i + 1 }));
    const parts = result.map(r => `${r.item.name}(idx=[-,-] top=${-(st)}px)`);
    console.log("[sticky] st=%d idx=%d first='%s'(d=%d) flatTotal=%d → [%s]",
      st, idx, first.item.name, first.depth, flatItems.length, parts.join(" > ") || "(无)");
    return result;
  }, [flatItems, model, scrollTop, containerHeight]);

  /* ── 滚动检测——找真实滚动容器的 scrollTop ── */
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
    const handler = () => {
      const st = scrollEl.scrollTop;
      scrollTopRef.current = st; setScrollTop(st);
      // 打印视口顶部 3 行：item名 + 像素top(负=已滚出)
      const fi = flatItemsRef.current;
      if (fi.length > 0) {
        const i0 = Math.floor(st / TREE_ITEM_HEIGHT);
        const top3 = [fi[i0], fi[i0 + 1], fi[i0 + 2]].filter(Boolean).map((f, k) =>
          `${f.item.name}(d=${f.depth} top=${(i0 + k) * TREE_ITEM_HEIGHT - st}px)`);
        console.log("[scroll] st=%d top3=[%s]", st, top3.join(", "));
      }
    };
    scrollEl.addEventListener("scroll", handler, { passive: true });
    return () => scrollEl.removeEventListener("scroll", handler);
  }, []);

  // E4V#20+F1: 追踪 .side-panel-content 屏幕坐标
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrollEl = el.closest<HTMLElement>(".side-panel-content");
    if (!scrollEl) return;
    const update = () => { const r = scrollEl.getBoundingClientRect(); console.log("[sticky] rect: top=%d left=%d w=%d scrollTop=%d", r.top, r.left, r.width, scrollEl.scrollTop); setSidePanelRect({ top: r.top, left: r.left, width: r.width }); };
    update();
    scrollEl.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => { scrollEl.removeEventListener("scroll", update); window.removeEventListener("resize", update); };
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
        const children = await model.getChildren(item);
        console.log("[file-tree] expand: %s → %d children", item.name, children.length);
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
    <>
      {(() => {
        if (stickyRows.length > 0 && sidePanelRect.width > 0) {
          console.log("[sticky] portal render: rect=(%d,%d,%d) rows=%d",
            sidePanelRect.top, sidePanelRect.left, sidePanelRect.width, stickyRows.length);
          return true;
        }
        if (stickyRows.length > 0) console.log("[sticky] portal SKIP: width=0");
        return false;
      })() && createPortal(
        <div className="file-tree-sticky-overlay" style={{
          position: "fixed", top: sidePanelRect.top, left: sidePanelRect.left,
          width: sidePanelRect.width, zIndex: 10,
        }}>
          {stickyRows.map((row) => (
            <div key={row.item.uri} className="file-tree-sticky-row" style={{
              height: TREE_ITEM_HEIGHT, paddingLeft: (row.depth - 1) * TREE_INDENT,
            }}>
              <FileTreeNode item={row.item} depth={row.depth} indent={0}
                expanded={true} isSelected={false} isFocused={false}
                onSelect={handleSelect} onOpen={handleOpen}
                onTwistieClick={handleTwistie} onContextMenu={handleContextMenu} />
            </div>
          ))}
        </div>,
        document.body,
      )}
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
    </>
  );
};

export default FileTree;
