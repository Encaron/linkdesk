/**
 * FileTreeNode——单个树节点渲染。
 * E4a #89：缩进 + twistie + 图标 + 文件名 + 装饰器 badge。
 *
 * 对标 VS Code explorerViewer.ts 的 renderElement()。
 */

import React from "react";
import type { ExplorerItem } from "./FileTreeModel";
import { getIconResolver } from "./FileIconResolver";
import { useClickPreview } from "@src/hooks/useClickPreview";
import { InlineInput } from "@src/components/shared/InlineInput";

interface FileTreeNodeProps {
  item: ExplorerItem;
  depth: number;
  isSelected: boolean;
  /** E4b #97: 键盘焦点——与选中分离，聚焦时有 outline */
  isFocused: boolean;
  expanded: boolean;
  indent: number;
  /** E4a #95c: 紧凑文件夹——压缩路径段 */
  compactedSegments?: string[];
  /** E4V#16: CSS 引导线——本层还有后续兄弟 */
  guide?: boolean;
  /** E4b #99: 拖放——dragStart / dragOver 指示线 */
  isDragSource?: boolean;
  isDragHover?: boolean;
  /** E4b #99k + E4V#16: excluded 文件灰显 */
  isDimmed?: boolean;
  /** 🔥 Ctrl+X 剪切后灰显——对标 VS Code cut 标记 */
  isCut?: boolean;
  /** E4V#35e: 活跃工作区根节点——accent 色加粗 */
  isActiveRoot?: boolean;
  /** E4V#27: 行内重命名——true 时显示 input 替代文件名 */
  isRenaming?: boolean;
  onRenameConfirm?: (uri: string, newName: string) => void;
  onRenameCancel?: () => void;
  onDragStart?: (item: ExplorerItem, e: React.DragEvent) => void;
  /** E4a #95e: 回调传参数（非闭包）→引用稳定→React.memo 生效。
   *  E4V#21: 第二个参数 event——Ctrl+Click 多选 toggle */
  onSelect: (uri: string, event: React.MouseEvent) => void;
  onOpen: (item: ExplorerItem, mode: "preview" | "pin") => void;
  onTwistieClick: (item: ExplorerItem) => void;
  onContextMenu?: (item: ExplorerItem, e: React.MouseEvent) => void;
}

function getFileIconClass(item: ExplorerItem, expanded: boolean): string {
  const resolver = getIconResolver();
  if (item.isDirectory) {
    return expanded ? resolver.getFolderIconOpened() : resolver.getFolderIcon(item);
  }
  return resolver.getIcon(item);
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  item,
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
    // E4V#28b: 目录——每次单击=toggle，双击=两次翻转。无"双击"语义
    if (item.isDirectory) {
      onTwistieClick(item);
      return;
    }
    clickPreviewClick(e);
  };

  /* ── E5#19a: 行内重命名 —— InlineInput 归一化 ── */

  /* ── twistie ── */

  const twistieClass = [
    "file-tree-twistie",
    expanded ? "file-tree-twistie--expanded" : "file-tree-twistie--collapsed",
  ].join(" ");

  const chevron = expanded ? "codicon-chevron-down" : "codicon-chevron-right";

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
      {item.isDirectory || item.children !== null ? (
        <span
          className={`codicon ${chevron} ${twistieClass}`}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onTwistieClick(item);
          }}
        />
      ) : (
        <span className="file-tree-twistie-placeholder" />
      )}

      {/* 图标 */}
      <span className={`codicon ${getFileIconClass(item, expanded)} file-tree-icon`} />

      {/* 文件名 / E5#19a 行内重命名——InlineInput 归一化 */}
      {isRenaming ? (
        <span
          style={{ marginLeft: "var(--tree-icon-gap)", flex: 1, maxWidth: 200 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <InlineInput
            size="compact"
            selectMode={item.isDirectory ? "all" : "nameOnly"}
            value={item.name}
            onConfirm={(newName) => onRenameConfirm?.(item.uri, newName)}
            onCancel={() => onRenameCancel?.()}
            autoFocus
          />
        </span>
      ) : (
        <span className="file-tree-name">
          {compactedSegments
            ? compactedSegments.map((seg, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="file-tree-compact-sep"> / </span>}
                  {seg}
                </React.Fragment>
              ))
            : item.name}
        </span>
      )}

      {/* 装饰器 badge */}
      {item.decoration?.badge && (
        <span
          className="file-tree-badge"
          title={item.decoration.tooltip}
          style={{ color: item.decoration.color ?? undefined }}
        >
          {item.decoration.badge}
        </span>
      )}
    </div>
  );
};

export default React.memo(FileTreeNode);
