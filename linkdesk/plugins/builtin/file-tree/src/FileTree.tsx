/**
 * FileTree——虚拟滚动文件树组件。
 * E4a #89：对标 VS Code AsyncDataTree + explorerViewer。
 *
 * 关键行为：
 *   onMouseDown 选中 → 250ms 后无双击触发 preview 打开
 *   双击 → pin 打开
 *   twistie 点击 → 展开/折叠（懒加载）
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

interface FileTreeProps {
  model: FileTreeModel;
  onOpenFile: (item: ExplorerItem, mode: "preview" | "pin") => void;
  onContextMenu?: (item: ExplorerItem, event: React.MouseEvent) => void;
}

/** E4V#20+iii: StickyRow——对标 VS Code StickyScrollNode */
interface StickyRow {
  item: ExplorerItem;
  depth: number;
  /** sticky 行在 overlay 中的 top 像素值（不是 CSS `top: i*22`） */
  position: number;
  height: number;
  /** 该祖先在 flatItems 中第一个后代的索引 */
  startIndex: number;
  /** 该祖先在 flatItems 中最后一个后代的索引 */
  endIndex: number;
}

/* ── 常量（从 layoutTokens.ts 导入） ── */

/* ── 工具 ── */

function flattenTree(model: FileTreeModel): FlatItem[] {
  const result: FlatItem[] = [];
  /** guide: 本层还有后续兄弟→CSS 引导线 */
  function walk(item: ExplorerItem, depth: number, guide: boolean) {
    // 🔥 E4V#6: CompactFolder Bug A/B/C 三合一修复——走 CompactController
    if (item.isDirectory) {
      const compacted = model.compactController.getCompactedSegments(item);
      if (compacted) {
        const leaf = findLeaf(item);
        const currentLeaf = leaf ? (model.findClosest(leaf.uri) ?? leaf) : null;
        const twistieItem = (currentLeaf && !currentLeaf.isDirectory && currentLeaf.parent)
          ? currentLeaf.parent
          : currentLeaf;
        const shouldUnfold = twistieItem?.isDirectory === true
          && model.isExpanded(twistieItem.uri)
          && twistieItem.children !== null;
        if (!shouldUnfold) {
          result.push({ item: twistieItem ?? item, depth, compactedSegments: compacted, guide });
          return;
        }
      }
    }
    result.push({ item, depth, guide });
    if (model.isExpanded(item.uri) && item.children !== null) {
      const len = item.children.length;
      for (let i = 0; i < len; i++) {
        walk(item.children[i], depth + 1, i < len - 1);
      }
    }
  }
  const roots = model.roots;
  const len = roots.length;
  for (let i = 0; i < len; i++) {
    walk(roots[i], 1, i < len - 1);
  }
  return result;
}

/** 沿单子目录链找到最后一个节点 */
function findLeaf(item: ExplorerItem): ExplorerItem | null {
  if (!item.isDirectory || item.children === null || item.children.length !== 1) return item;
  const child = item.children[0];
  if (!child.isDirectory) return child;
  return findLeaf(child);
}

/* ── E4V#20+iv: sticky scroll 算法——对标 VS Code StickyScrollController ── */

/** 查找祖先在 flatItems 中的索引区间（第一个到最后一个后代） */
function getNodeRange(
  ancestor: ExplorerItem,
  flatItems: FlatItem[],
): { startIndex: number; endIndex: number } | null {
  const ancUri = ancestor.uri;
  let startIndex = -1;
  let endIndex = -1;
  for (let i = 0; i < flatItems.length; i++) {
    const itemUri = flatItems[i].item.uri;
    if (itemUri === ancUri || (itemUri.startsWith(ancUri) && itemUri[ancUri.length] === "/")) {
      if (startIndex === -1) startIndex = i;
      endIndex = i;
    } else if (startIndex !== -1) {
      break;
    }
  }
  if (startIndex === -1) return null;
  return { startIndex, endIndex };
}

/**
 * 对标 VS Code calculateStickyNodePosition：
 * sticky 行被最后一个后代"推出"屏幕时才移动位置。
 */
function calculateStickyPosition(
  lastDescendantIndex: number,
  stickyHeight: number,
  scrollTop: number,
  containerHeight: number,
): number {
  if (containerHeight <= 0) return stickyHeight;
  const lastChildTop = lastDescendantIndex * TREE_ITEM_HEIGHT - scrollTop;
  const lastChildBottom = lastChildTop + TREE_ITEM_HEIGHT;
  const stickyBottom = stickyHeight + TREE_ITEM_HEIGHT;
  if (stickyBottom > lastChildBottom && stickyHeight <= lastChildBottom) {
    return lastChildBottom - TREE_ITEM_HEIGHT;
  }
  return stickyHeight;
}

/**
 * findStickyState——取视口第一个可见节点，沿 parent 链收集展开祖先。
 */
function findStickyState(
  flatItems: FlatItem[],
  model: FileTreeModel,
  scrollTop: number,
  containerHeight: number,
): StickyRow[] {
  if (scrollTop <= 0) return [];

  // 半行缓冲：超过 50% 可见才算"第一个可见"——减少目录边界振荡
  const firstVisibleIdx = Math.floor((scrollTop + TREE_ITEM_HEIGHT / 2) / TREE_ITEM_HEIGHT);
  const firstVisible = flatItems[firstVisibleIdx];
  if (!firstVisible) return [];

  const ancestors = model.getAncestors(firstVisible.item);
  // 根本身半滚出时 firstVisible 还是根，getAncestors 返回空——补上根
  if (ancestors.length === 0 && firstVisible.item.parent === null && firstVisible.item.isDirectory) {
    // 根部分滚出屏幕 → 粘根
    const range = getNodeRange(firstVisible.item, flatItems);
    if (!range) return [];
    return [{
      item: firstVisible.item, depth: 1, position: 0,
      height: TREE_ITEM_HEIGHT, startIndex: range.startIndex, endIndex: range.endIndex,
    }];
  }
  if (ancestors.length === 0) return [];

  const rows: StickyRow[] = [];
  let stickyHeight = 0;

  for (const ancestor of ancestors) {
    const range = getNodeRange(ancestor, flatItems);
    if (!range) continue;

    const position = calculateStickyPosition(
      range.endIndex, stickyHeight, scrollTop, containerHeight,
    );

    rows.push({
      item: ancestor,
      depth: model.getAncestors(ancestor).length + 1,
      position,
      height: TREE_ITEM_HEIGHT,
      startIndex: range.startIndex,
      endIndex: range.endIndex,
    });

    stickyHeight += TREE_ITEM_HEIGHT;

    if (rows.length >= 7) break;
    if (containerHeight > 0 && stickyHeight > containerHeight * 0.4) break;
  }

  return rows;
}

/* ── 组件 ── */

const FileTree: React.FC<FileTreeProps> = ({ model, onOpenFile, onContextMenu }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [selectedUri, setSelectedUri] = useState<string | null>(null);
  const [focusedUri, setFocusedUri] = useState<string | null>(null);
  // 版本号——model 变更后递增，驱动 useMemo 重算
  const [version, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  /* ── ResizeObserver ── */

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setContainerHeight(entries[0].contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── E4V#55b: 订阅模型变更——model 方法 fire 后自动重渲染 ── */

  useEffect(() => {
    return model.onDidChange.event(() => {
      rerender();
    });
  }, [model, rerender]);

  /* ── 虚拟列表计算 ── */

  const flatItems = useMemo(() => {
    void (version); // cache-bust: onDidChange 驱动 version 递增
    return flattenTree(model);
  }, [model, version]);

  const startIndex = Math.max(0, Math.floor(scrollTop / TREE_ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = containerHeight > 0 ? Math.ceil(containerHeight / TREE_ITEM_HEIGHT) + 2 * OVERSCAN : 50;
  const endIndex = Math.min(flatItems.length, startIndex + visibleCount);
  const totalHeight = flatItems.length * TREE_ITEM_HEIGHT;

  const renderedItems = useMemo(
    () => flatItems.slice(startIndex, endIndex),
    [flatItems, startIndex, endIndex],
  );

  /* ── E4V#20+iv: sticky state——对标 VS Code findStickyState ── */

  const _stickyIdRef = useRef("");
  const _stickyCachedRef = useRef<StickyRow[]>([]);

  const stickyState = useMemo(() => {
    const state = findStickyState(flatItems, model, scrollTop, containerHeight);
    // E4V#20+vi: 状态比较——对标 VS Code StickyScrollState.equal
    const id = state.map((r) => `${r.item.uri}@${r.position.toFixed(0)}`).join("|");
    if (id === _stickyIdRef.current) return _stickyCachedRef.current;
    _stickyIdRef.current = id;
    _stickyCachedRef.current = state;
    return state;
  }, [flatItems, model, scrollTop, containerHeight]);

  /* ── 滚动——E4V#20+ii: onScroll 保底 + DOM 遍历找滚动祖先 ── */

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let cleanup: (() => void) | undefined;
    const raf = requestAnimationFrame(() => {
      let scrollEl: HTMLElement | null = el.parentElement;
      while (scrollEl) {
        const s = window.getComputedStyle(scrollEl);
        if (s.overflowY === "auto" || s.overflowY === "scroll") break;
        scrollEl = scrollEl.parentElement;
      }
      if (!scrollEl) return;
      setScrollTop(scrollEl.scrollTop);
      const handler = () => setScrollTop(scrollEl.scrollTop);
      scrollEl.addEventListener("scroll", handler, { passive: true });
      cleanup = () => scrollEl!.removeEventListener("scroll", handler);
    });
    return () => {
      cancelAnimationFrame(raf);
      cleanup?.();
    };
  }, []);

  /* ── twistie 展开/折叠 ── */

  const handleTwistie = useCallback(
    async (item: ExplorerItem) => {
      if (!item.isDirectory && item.children === null) return;
      if (model.isExpanded(item.uri)) {
        model.collapse(item.uri);
        model.compactController.collapseCompact(item.uri);
        // collapse → onDidChange.fire → 自动 rerender
      } else {
        model.expand(item.uri);
        model.compactController.expandCompact(item.uri);
        // expand → onDidChange.fire; getChildren → onDidChange.fire
        try {
          const children = await model.getChildren(item);
          console.log("[file-tree] expand done:", item.uri, "children:", children.length);
        } catch (e) {
          console.error("[file-tree] expand failed:", item.uri, e);
        }
      }
    },
    [model],
  );

  /* ── 选中 + 打开 ── */

  const handleSelect = useCallback((uri: string) => {
    setSelectedUri(uri);
    setFocusedUri(uri);
  }, []);

  const handleOpen = useCallback(
    (item: ExplorerItem, mode: "preview" | "pin") => {
      onOpenFile(item, mode);
    },
    [onOpenFile],
  );

  /* ── 右键菜单 ── */

  const handleContextMenu = useCallback(
    (item: ExplorerItem, event: React.MouseEvent) => {
      setSelectedUri(item.uri);
      onContextMenu?.(item, event);
    },
    [onContextMenu],
  );

  /* ── 键盘导航（E4b #97——提取到 FileTreeKeyboard） ── */

  const handleKeyDown = useFileTreeKeyboard(
    { model, flatItems, focusedUri },
    {
      setFocusedUri,
      setSelectedUri,
      rerender,
      onOpenFile,
      onTwistie: handleTwistie,
      getContainerEl: () => containerRef.current,
    },
  );

  /* ── 拖放（E4b #99——useFileTreeDnD hook） ── */

  const { dndState, handleDragStart, handleDragOver, handleDragLeave, handleDrop } =
    useFileTreeDnD({
      flatItems,
      model,
      rerender,
      getContainerEl: () => containerRef.current,
    });

  /* ── 上下文键（E4b #98 + E4V#12-#13——快捷键 when 条件） ── */

  /** E4V#12: 平台级 context key——mount 时初始化 */
  useEffect(() => {
    // R5 FileTreeClipboard 会动态更新，此处初始化默认值
    ContextKeyService.setValue("explorerResourceCut", false);
    ContextKeyService.setValue("explorerClipboardEmpty", true);
    // Windows 可回收站→删除确认文案为"移至回收站"
    ContextKeyService.setValue("explorerResourceMoveableToTrash", navigator.platform.includes("Win"));
  }, []);

  /** 文件树获得/失去键盘焦点——设置 explorerFocus context key */
  const handleFocus = useCallback(() => {
    ContextKeyService.setValue("explorerFocus", true);
  }, []);

  const handleBlur = useCallback(() => {
    ContextKeyService.setValue("explorerFocus", false);
  }, []);

  /** focusedUri 变化时更新 context keys */
  useEffect(() => {
    if (focusedUri) {
      const fi = flatItems.find((f) => f.item.uri === focusedUri);
      ContextKeyService.setValue("explorerItemIsFile", fi?.item.isDirectory === false);
      // E4V#12 P0: 只读标记——重命名/删除 when 用 !explorerResourceReadonly
      ContextKeyService.setValue("explorerResourceReadonly", fi?.item.isReadonly === true);
      // E4V#13 P1: 压缩节点聚焦——键盘 ← → 段间导航
      ContextKeyService.setValue("explorerViewletCompressedFocus", (fi?.compactedSegments?.length ?? 0) > 0);
    } else {
      ContextKeyService.setValue("explorerItemIsFile", false);
      ContextKeyService.setValue("explorerResourceReadonly", false);
      ContextKeyService.setValue("explorerViewletCompressedFocus", false);
    }
    // E4V#13 P1: 有已展开项→"全部折叠"按钮可见
    ContextKeyService.setValue("viewHasSomeCollapsibleItem", model.getExpandedUris().length > 0);
  }, [focusedUri, flatItems, model]);

  /* ── 渲染 ── */

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="file-tree-scroll"
    >
      {/* E4V#20+v: sticky rows——flex item + position:sticky 穿透到 .side-panel-content */}
      {stickyState.map((row, i) => (
        <div
          key={`sticky-${row.item.uri}`}
          className="file-tree-sticky-row"
          style={{
            position: "sticky",
            top: i * TREE_ITEM_HEIGHT,
            height: TREE_ITEM_HEIGHT,
            zIndex: 2,
          }}
        >
          <FileTreeNode
            item={row.item}
            depth={row.depth}
            indent={0}
            expanded={true}
            isSelected={false}
            isFocused={false}
            onSelect={handleSelect}
            onOpen={handleOpen}
            onTwistieClick={handleTwistie}
            onContextMenu={handleContextMenu}
          />
        </div>
      ))}
      {/* 虚拟列表 clip——flex:1 填剩余高度，overflow:hidden 裁溢出 */}
      <div className="file-tree-scroll-clip">
        <div style={{ height: totalHeight, position: "relative" }}>
          <div style={{ height: startIndex * TREE_ITEM_HEIGHT }} />
          {renderedItems.map(({ item, depth, compactedSegments, guide, isDimmed }, i) => (
            <FileTreeNode
              key={item.uri}
              item={item}
              depth={depth}
              indent={0}
              expanded={item.isDirectory && model.isExpanded(item.uri)}
              isSelected={item.uri === selectedUri}
              isFocused={item.uri === focusedUri}
              isDragSource={dndState.sourceUri === item.uri}
              isDragHover={dndState.hoverIndex === startIndex + i}
              compactedSegments={compactedSegments}
              guide={guide}
              isDimmed={isDimmed}
              onDragStart={handleDragStart}
              onSelect={handleSelect}
              onOpen={handleOpen}
              onTwistieClick={handleTwistie}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default FileTree;
