/**
 * Menu——文件树右键菜单消费组件本体。
 *
 * 对标 VS Code：右键之前先选中（sidebar.tsx 在调用前处理）。
 * ContextMenu 内部从 MenuRegistry 读取 "FileContext" 的菜单项，
 * 通过 ContextKeyService 求值 when 条件。
 */
import React, { useEffect } from "react";
import { ContextMenu } from "@linkdesk/ui"; // E6#54c：共享控件走 @linkdesk/ui
import type { ExplorerItem } from "../../services/FileTreeModel";

interface FileTreeContextMenuProps {
  /** 右键的目标节点——null = 空白处右键（仅新建） */
  item: ExplorerItem | null;
  /** 菜单锚点（clientX/clientY） */
  anchor: { x: number; y: number };
  /** 关闭回调 */
  onClose: () => void;
}

const FileTreeContextMenu: React.FC<FileTreeContextMenuProps> = ({ item, anchor, onClose }) => {
  // E4V#12: 瞬态 context key——菜单渲染前注入，关闭时清除
  useEffect(() => {
    const lk = window.linkdesk;
    lk?.contextKey?.set("explorerItemIsFile", item?.isDirectory === false);
    lk?.contextKey?.set("explorerItemIsDir", item?.isDirectory === true);
    lk?.contextKey?.set("explorerItemIsRoot", item?.parent === null);
    lk?.contextKey?.set("explorerResourceReadonly", item?.isReadonly === true);
    return () => {
      lk?.contextKey?.set("explorerItemIsFile", false);
      lk?.contextKey?.set("explorerItemIsDir", false);
      lk?.contextKey?.set("explorerItemIsRoot", false);
      lk?.contextKey?.set("explorerResourceReadonly", false);
    };
  }, [item]);

  // 传给命令的上下文（handler 通过 args[0] 接收）
  // when 条件优先读此上下文——菜单渲染不等 IPC 异步的 contextKey.set
  const context = item ? {
    uri: item.uri,
    isDirectory: item.isDirectory,
    explorerItemIsFile: item.isDirectory === false,
    explorerItemIsDir: item.isDirectory === true,
    explorerItemIsRoot: item.parent === null,
    explorerResourceReadonly: item.isReadonly === true,
  } : undefined;

  return (
    <ContextMenu
      menuId={"FileContext"}
      anchor={anchor}
      context={context}
      onClose={onClose}
    />
  );
};

export default FileTreeContextMenu;
