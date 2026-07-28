/**
 * FileTreeNode——单个树节点渲染。
 * E4a #89：缩进 + twistie + 图标 + 文件名 + 装饰器 badge。
 *
 * 对标 VS Code explorerViewer.ts 的 renderElement()。
 */

import React from "react";
import type { ExplorerItem } from "./FileTreeModel";
import { defaultIconResolver } from "./FileIconResolver";

interface FileTreeNodeProps {
  item: ExplorerItem;
  depth: number;
  isSelected: boolean;
  expanded: boolean;
  indent: number;
  /** E4a #95c: 紧凑文件夹——压缩路径段 */
  compactedSegments?: string[];
  onSelect: () => void;
  onOpen: (mode: "preview" | "pin") => void;
  onTwistieClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

function getFileIconClass(item: ExplorerItem, expanded: boolean): string {
  if (item.isDirectory) {
    return expanded ? defaultIconResolver.getFolderIconOpened() : defaultIconResolver.getFolderIcon(item);
  }
  return defaultIconResolver.getIcon(item);
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  item,
  depth,
  isSelected,
  expanded,
  indent,
  compactedSegments,
  onSelect,
  onOpen,
  onTwistieClick,
  onContextMenu,
}) => {
  const rowClass = [
    "file-tree-node",
    isSelected && "file-tree-node--selected",
  ]
    .filter(Boolean)
    .join(" ");

  /* ── 双击检测 ── */

  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    onSelect();
    if (e.detail === 2) {
      onOpen("pin");
    }
  };

  const handleMouseDown = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    } else {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        onOpen("preview");
      }, 250);
    }
  };

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

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
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={onContextMenu}
    >
      {/* twistie */}
      {item.isDirectory ? (
        <span
          className={`codicon ${chevron} ${twistieClass}`}
          onClick={(e) => {
            e.stopPropagation();
            onTwistieClick();
          }}
        />
      ) : (
        <span className="file-tree-twistie-placeholder" />
      )}

      {/* 图标 */}
      <span className={`codicon ${getFileIconClass(item, expanded)} file-tree-icon`} />

      {/* 文件名（或紧凑路径） */}
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
