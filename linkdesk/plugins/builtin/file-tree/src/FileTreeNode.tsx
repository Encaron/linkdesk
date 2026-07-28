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
  /** 键盘焦点（不一定选中） */
  isFocused: boolean;
  /** 是否已展开（仅目录有效） */
  expanded: boolean;
  indent: number;
  onSelect: () => void;
  onOpen: (mode: "preview" | "pin") => void;
  onTwistieClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}

const ITEM_HEIGHT = 22;

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
  isFocused,
  expanded,
  indent,
  onSelect,
  onOpen,
  onTwistieClick,
  onContextMenu,
  style,
}) => {
  const rowClass = [
    "file-tree-node",
    isSelected && "file-tree-node--selected",
    isFocused && !isSelected && "file-tree-node--focused",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = (e: React.MouseEvent) => {
    onSelect();
    if (e.detail === 2) {
      onOpen("pin");
    }
  };

  // 在 mouseup 上处理单击打开（~250ms 后如果不是双击就触发 preview）
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <div
      className={rowClass}
      style={{
        display: "flex",
        alignItems: "center",
        height: ITEM_HEIGHT,
        paddingLeft: indent + (depth - 1) * 16,
        paddingRight: 8,
        cursor: "default",
        userSelect: "none",
        ...style,
      }}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      onContextMenu={onContextMenu}
    >
      {/* twistie */}
      {item.isDirectory ? (
        <span
          className={`codicon ${expanded ? "codicon-chevron-down" : "codicon-chevron-right"}`}
          style={{
            width: 16,
            height: 16,
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            cursor: "pointer",
            opacity: expanded ? 1 : 0.6,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onTwistieClick();
          }}
        />
      ) : (
        <span style={{ width: 16, flexShrink: 0 }} />
      )}

      {/* 图标 */}
      <span
        className={`codicon ${getFileIconClass(item, expanded)}`}
        style={{ width: 16, height: 16, fontSize: 14, flexShrink: 0, marginLeft: 6 }}
      />

      {/* 文件名 */}
      <span
        style={{
          marginLeft: 6,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          fontSize: 13,
          lineHeight: `${ITEM_HEIGHT}px`,
        }}
      >
        {item.name}
      </span>

      {/* 装饰器 badge */}
      {item.decoration?.badge && (
        <span
          title={item.decoration.tooltip}
          style={{
            marginLeft: 4,
            fontSize: 11,
            fontWeight: 600,
            color: item.decoration.color ?? "var(--accent)",
            flexShrink: 0,
          }}
        >
          {item.decoration.badge}
        </span>
      )}
    </div>
  );
};

export default React.memo(FileTreeNode);
