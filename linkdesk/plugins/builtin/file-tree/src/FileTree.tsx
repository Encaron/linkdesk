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

/* ── 常量（从 layoutTokens.ts 导入） ── */

/* ── 工具 ── */

function flattenTree(model: FileTreeModel): FlatItem[] {
  const result: FlatItem[] = [];
  function walk(item: ExplorerItem, depth: number) {
    // 🔥 E4V#6: CompactFolder Bug A/B/C 三合一修复——走 CompactController
    if (item.isDirectory) {
      const compacted = model.compactController.getCompactedSegments(item);
      if (compacted) {
        const leaf = findLeaf(item);
        // Bug A: model.findClosest 获取当前活跃对象——防 stale 引用（同名目录）
        const currentLeaf = leaf ? (model.findClosest(leaf.uri) ?? leaf) : null;
        // Bug B: 文件末端——用父目录做 twistie 控制器（文件无 twistie）
        const twistieItem = (currentLeaf && !currentLeaf.isDirectory && currentLeaf.parent)
          ? currentLeaf.parent
          : currentLeaf;
        // Bug C: 展开后解压缩——判断 twistieItem 而非 leaf
        const shouldUnfold = twistieItem?.isDirectory === true
          && model.isExpanded(twistieItem.uri)
          && twistieItem.children !== null;
        if (!shouldUnfold) {
          result.push({ item: twistieItem ?? item, depth, compactedSegments: compacted });
          return;
        }
        // twistieItem 已展开 → fall through 到正常渲染
      }
    }
    result.push({ item, depth });
    // 展开后渲染子节点——目录或有嵌套文件的文件
    if (model.isExpanded(item.uri) && item.children !== null) {
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

/** 沿单子目录链找到最后一个节点 */
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

  const startIndex = Math.max(0, Math.floor(scrollTop / TREE_ITEM_HEIGHT) - OVERSCAN);
  const visibleCount = containerHeight > 0 ? Math.ceil(containerHeight / TREE_ITEM_HEIGHT) + 2 * OVERSCAN : 50;
  const endIndex = Math.min(flatItems.length, startIndex + visibleCount);
  const totalHeight = flatItems.length * TREE_ITEM_HEIGHT;

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
      // E4V#9: 目录或有嵌套子节点的文件可以展开/折叠
      if (!item.isDirectory && item.children === null) return;
      if (model.isExpanded(item.uri)) {
        model.collapse(item.uri);
        model.compactController.collapseCompact(item.uri);
        rerender();
      } else {
        model.expand(item.uri);
        model.compactController.expandCompact(item.uri);
        try {
          const children = await model.getChildren(item);
          console.log("[file-tree] expand done:", item.uri, "children:", children.length);
        } catch (e) {
          console.error("[file-tree] expand failed:", item.uri, e);
        }
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

  /* ── 上下文键（E4b #98——快捷键 when 条件） ── */

  /** 文件树获得/失去键盘焦点——设置 explorerFocus context key */
  const handleFocus = useCallback(() => {
    ContextKeyService.setValue("explorerFocus", true);
  }, []);

  const handleBlur = useCallback(() => {
    ContextKeyService.setValue("explorerFocus", false);
  }, []);

  /** focusedUri 变化时更新 isFile context key */
  useEffect(() => {
    if (focusedUri) {
      const fi = flatItems.find((f) => f.item.uri === focusedUri);
      ContextKeyService.setValue("explorerItemIsFile", fi?.item.isDirectory === false);
    } else {
      ContextKeyService.setValue("explorerItemIsFile", false);
    }
  }, [focusedUri, flatItems]);

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
      <div style={{ height: totalHeight, position: "relative" }}>
        <div style={{ height: startIndex * TREE_ITEM_HEIGHT }} />
        {renderedItems.map(({ item, depth, compactedSegments }, i) => (
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
            onDragStart={handleDragStart}
            onSelect={handleSelect}
            onOpen={handleOpen}
            onTwistieClick={handleTwistie}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>
    </div>
  );
};

export default FileTree;
