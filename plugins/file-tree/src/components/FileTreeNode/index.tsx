/**
 * FileTreeNode——单个树节点渲染（门面）。
 * E4a #89：缩进 + twistie + 图标 + 文件名 + 装饰器 badge。
 *
 * 对标 VS Code explorerViewer.ts 的 renderElement()。
 *
 * 原 215 行单文件按件拆出（E6#87a）：`types.ts` / `FileIcon.tsx` / `Twistie.tsx` / `NameCell.tsx`。
 */

import React from "react";
import { useClickPreview } from "@linkdesk/ui"; // E6#15h：useClickPreview 收 @linkdesk/ui 零件（08-共享hook归位.md）
import { renderFileIcon } from "./FileIcon";
import { Twistie } from "./Twistie";
import { NameCell } from "./NameCell";
import type { FileTreeNodeProps } from "./types";

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  item,
  decoration,
  depth,
  isSelected,
  isFocused,
  expanded,
  indent,
  compactedSegments,
  guide,
  isDragSource,
  isDragHover,
  isDimmed,
  isCut,
  isActiveRoot,
  isRenaming,
  onRenameConfirm,
  onRenameCancel,
  onDragStart,
  onSelect,
  onOpen,
  onTwistieClick,
  onContextMenu,
  expandOnClick,
}) => {
  const rowClass = [
    "file-tree-node",
    isSelected && "file-tree-node--selected",
    isFocused && !isSelected && "file-tree-node--focused",
    isDragSource && "file-tree-node--dragging",
    isDragHover && "file-tree-node--drop-target",
    guide && "file-tree-node--guide",
    isDimmed && "file-tree-node--dimmed",
    isCut && "file-tree-node--cut",
    isActiveRoot && "file-tree-node--active-root",
  ]
    .filter(Boolean)
    .join(" ");

  /* ── 双击检测——归一化到 useClickPreview hook（E4V#28e）── */

  const { handleMouseDown: clickPreviewMouseDown, handleClick: clickPreviewClick } = useClickPreview({
    onPreview: () => onOpen(item, "preview"),
    onPin: () => onOpen(item, "pin"),
    disabled: item.isDirectory,
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡到容器——容器 onClick 负责清空选中
    // E4V#21: 传 event 给父组件——检测 ctrlKey/metaKey 做多选 toggle
    onSelect(item.uri, e);
    // 右键/中键只选中不打开/不展开——打开归左键，菜单归 contextmenu（对标 VS Code）
    if (e.button !== 0) return;
    if (item.isDirectory) {
      // E5: expandOnClick 控制单击目录行是否 toggle 展开/折叠
      if (expandOnClick) onTwistieClick(item);
      return;
    }
    clickPreviewClick(e);
  };

  return (
    <div
      className={rowClass}
      style={{ paddingLeft: `calc(${indent}px + (${depth} - 1) * var(--tree-indent))` }}
      draggable={!isRenaming}
      onDragStart={isRenaming ? (e) => e.preventDefault() : onDragStart ? (e: React.DragEvent) => onDragStart(item, e) : undefined}
      onClick={handleClick}
      onMouseDown={clickPreviewMouseDown}
      onContextMenu={onContextMenu ? (e: React.MouseEvent) => onContextMenu(item, e) : undefined}
    >
      {/* twistie——目录或有嵌套子节点的文件 */}
      <Twistie item={item} expanded={expanded} onTwistieClick={onTwistieClick} />

      {/* 图标——双形态（class → span / imagePath → img），E5.8#133.3 */}
      {renderFileIcon(item, expanded)}

      {/* 文件名 / E5#19a 行内重命名——InlineInput 归一化 */}
      <NameCell
        item={item}
        isRenaming={isRenaming}
        compactedSegments={compactedSegments}
        onRenameConfirm={onRenameConfirm}
        onRenameCancel={onRenameCancel}
      />

      {/* 装饰器 badge */}
      {decoration?.badge && (
        <span
          className="file-tree-badge"
          title={decoration.tooltip}
          style={{ color: decoration.color ?? undefined }}
        >
          {decoration.badge}
        </span>
      )}
    </div>
  );
};

export default React.memo(FileTreeNode);
export type { FileTreeNodeProps } from "./types";
