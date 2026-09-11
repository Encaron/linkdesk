/**
 * FileIcon——双形态图标渲染（E6#87a 从 FileTreeNode.tsx 拆出）。
 */
import React from "react";
import type { ExplorerItem } from "../../services/FileTreeModel";
import { getIconResolver } from "../../services/fileIconRuntime"; // E6#69g：解析器已上移共享，本文件只持插件实例态

/** E5.8#133.3：双形态图标渲染——class → codicon span（可带每图标 color）/ imagePath → linkdesk:// img */
export function renderFileIcon(item: ExplorerItem, expanded: boolean): React.ReactNode {
  const resolver = getIconResolver();
  // E6#69g：共享解析器取元数据基元签名（文件名 / 是否根）——解析器不耦合插件类型 ExplorerItem
  const icon = item.isDirectory
    ? (expanded ? resolver.getFolderIconOpened(item.name, item.parent === null) : resolver.getFolderIcon(item.name, item.parent === null))
    : resolver.getFileIcon(item.name);
  if (icon.kind === "image") {
    return <img className="file-tree-icon file-tree-icon--image" src={icon.url} alt="" draggable={false} />;
  }
  return (
    <span
      className={`codicon ${icon.className} file-tree-icon`}
      style={icon.color ? { color: icon.color } : undefined}
    />
  );
}
