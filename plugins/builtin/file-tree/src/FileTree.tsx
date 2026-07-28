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

/* ── 类型 ── */

interface FileTreeProps {
  model: FileTreeModel;
  onOpenFile: (item: ExplorerItem, mode: "preview" | "pin") => void;
  onContextMenu?: (item: ExplorerItem, event: React.MouseEvent) => void;
}

interface FlatItem {
  item: ExplorerItem;
  depth: number;
}

/* ── 常量 ── */

/** 对齐 CSS token: --tree-item-height（file-tree.css） */
const ITEM_HEIGHT = 22;
const OVERSCAN = 10;

/* ── 工具 ── */

function flattenTree(model: FileTreeModel): FlatItem[] {
  const result: FlatItem[] = [];
  function walk(item: ExplorerItem, depth: number) {
    result.push({ item, depth });
    if (item.isDirectory && model.isExpanded(item.uri) && item.children !== null) {
      for (const child of item.children) {
        walk(child, depth + 1);
      }
    }
  }
  for (const root of model.roots) {
    walk(root, 1);
  }
  return result;
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

  /* ── 虚拟列表计算 ── */

  const flatItems = useMemo(() => {
    void (version); // cache-bust: model 内部 mutable state 变更后递增
    return flattenTree(model);
  }, [model, version]);

  const startIndex = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = containerHeight > 0 ? Math.ceil(containerHeight / ITEM_HEIGHT) + 2 * OVERSCAN : 50;
  const endIndex = Math.min(flatItems.length, startIndex + visibleCount);
  const totalHeight = flatItems.length * ITEM_HEIGHT;

  const renderedItems = useMemo(
    () => flatItems.slice(startIndex, endIndex),
    [flatItems, startIndex, endIndex],
  );

  /* ── 滚动 ── */

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);
  }, []);

  /* ── twistie 展开/折叠 ── */

  const handleTwistie = useCallback(
    async (item: ExplorerItem) => {
      if (!item.isDirectory) return;
      if (model.isExpanded(item.uri)) {
        model.collapse(item.uri);
        rerender();
      } else {
        model.expand(item.uri);
        await model.getChildren(item);
        rerender();
      }
    },
    [model, rerender],
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

  /* ── 键盘导航 ── */

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (flatItems.length === 0) return;
      const currentIdx = flatItems.findIndex((f) => f.item.uri === focusedUri);
      const idx = currentIdx === -1 ? 0 : currentIdx;

      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          const prev = Math.max(0, idx - 1);
          setFocusedUri(flatItems[prev].item.uri);
          scrollToItem(prev);
          break;
        }
        case "ArrowDown": {
          e.preventDefault();
          const next = Math.min(flatItems.length - 1, idx + 1);
          setFocusedUri(flatItems[next].item.uri);
          scrollToItem(next);
          break;
        }
        case "ArrowLeft": {
          e.preventDefault();
          const fi = flatItems[idx];
          if (fi.item.isDirectory && model.isExpanded(fi.item.uri)) {
            model.collapse(fi.item.uri);
            rerender();
          }
          break;
        }
        case "ArrowRight": {
          e.preventDefault();
          const fi = flatItems[idx];
          if (fi.item.isDirectory && !model.isExpanded(fi.item.uri)) {
            model.expand(fi.item.uri);
            model.getChildren(fi.item).then(() => rerender());
          }
          break;
        }
        case "Home": {
          e.preventDefault();
          setFocusedUri(flatItems[0].item.uri);
          scrollToItem(0);
          break;
        }
        case "End": {
          e.preventDefault();
          const last = flatItems.length - 1;
          setFocusedUri(flatItems[last].item.uri);
          scrollToItem(last);
          break;
        }
        case "Enter": {
          e.preventDefault();
          const fi = flatItems[idx];
          setSelectedUri(fi.item.uri);
          if (fi.item.isDirectory) {
            handleTwistie(fi.item);
          } else {
            onOpenFile(fi.item, "pin");
          }
          break;
        }
      }
    },
    [flatItems, focusedUri, model, onOpenFile, handleTwistie, rerender],
  );

  /** 滚动使指定 index 可见 */
  function scrollToItem(index: number) {
    const el = containerRef.current;
    if (!el) return;
    const targetTop = index * ITEM_HEIGHT;
    const { scrollTop: st, clientHeight: ch } = el;
    if (targetTop < st) {
      el.scrollTop = targetTop;
    } else if (targetTop + ITEM_HEIGHT > st + ch) {
      el.scrollTop = targetTop - ch + ITEM_HEIGHT;
    }
  }

  /* ── 渲染 ── */

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      className="file-tree-scroll"
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ height: startIndex * ITEM_HEIGHT }} />
        {renderedItems.map(({ item, depth }) => (
          <FileTreeNode
            key={item.uri}
            item={item}
            depth={depth}
            indent={0}
            expanded={item.isDirectory && model.isExpanded(item.uri)}
            isSelected={item.uri === selectedUri}
            onSelect={() => handleSelect(item.uri)}
            onOpen={(mode) => handleOpen(item, mode)}
            onTwistieClick={() => handleTwistie(item)}
            onContextMenu={(e) => handleContextMenu(item, e)}
          />
        ))}
      </div>
    </div>
  );
};

export default FileTree;
