/**
 * Twistie——展开/折叠箭头（E6#87a 从 FileTreeNode.tsx 拆出）。
 */
import type { ExplorerItem } from "../../services/FileTreeModel";

interface TwistieProps {
  item: ExplorerItem;
  expanded: boolean;
  onTwistieClick: (item: ExplorerItem) => void;
}

/** twistie——目录或有嵌套子节点的文件 */
export function Twistie({ item, expanded, onTwistieClick }: TwistieProps) {
  if (!item.isDirectory && item.children === null) {
    return <span className="file-tree-twistie-placeholder" />;
  }
  const twistieClass = [
    "file-tree-twistie",
    expanded ? "file-tree-twistie--expanded" : "file-tree-twistie--collapsed",
  ].join(" ");
  const chevron = expanded ? "codicon-chevron-down" : "codicon-chevron-right";
  return (
    <span
      className={`codicon ${chevron} ${twistieClass}`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (e.button !== 0) return; // 右键归 contextmenu——不展开/折叠
        onTwistieClick(item);
      }}
    />
  );
}
