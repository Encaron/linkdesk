/**
 * FileTreeContextMenu——文件树右键菜单。
 * E4b #96：MenuRegistry 注册 15 项到 MenuId.FileContext + ContextKeyService when 条件。
 *
 * 对标 VS Code explorerViewer.ts 的 explorerContextMenu。
 * 设计文档：docs/02-Electron架构/E4_文件树与编辑器_暂定/02-E4b-文件树交互.md §二 #96
 */

import React, { useEffect } from "react";
import { registerCommand } from "@src/core/CommandRegistry";
import { registerMenuItems, MenuId } from "@src/core/MenuRegistry";
import { ContextKeyService } from "@src/core/ContextKeyService";
import ContextMenu from "@src/components/shared/ContextMenu";
import type { ExplorerItem } from "./FileTreeModel";

/* ── 模块级：注册命令 + 菜单项（对标 marketplace sidebar.tsx pattern） ── */

let _registered = false;

/** 注册 explorer 命令到 CommandRegistry + 右键菜单项到 MenuId.FileContext。幂等。 */
export function activateFileTreeContextMenu(): void {
  if (_registered) return;
  _registered = true;

  // ── 注册命令（占位 handler——后续任务逐步替换） ──

  const placeholder = (id: string) => async () => {
    console.warn(`[file-tree] 命令 "${id}" 尚未实现`);
  };

  // 新增命令（不在 plugin.json contributes.commands 中——此处是唯一注册点）
  registerCommand("file-tree", { id: "explorer.openFile",        title: "打开",                 handler: placeholder("explorer.openFile") });
  registerCommand("file-tree", { id: "explorer.openToSide",      title: "在侧边打开",            handler: placeholder("explorer.openToSide") });
  registerCommand("file-tree", { id: "explorer.openWith",        title: "打开方式…",            handler: placeholder("explorer.openWith") });
  registerCommand("file-tree", { id: "explorer.revealInOS",      title: "在文件管理器中显示",     handler: placeholder("explorer.revealInOS") });
  registerCommand("file-tree", { id: "explorer.openInTerminal",  title: "在终端中打开",           handler: placeholder("explorer.openInTerminal") });
  registerCommand("file-tree", { id: "explorer.cut",             title: "剪切",                 handler: placeholder("explorer.cut") });
  registerCommand("file-tree", { id: "explorer.copy",            title: "复制",                 handler: placeholder("explorer.copy") });
  registerCommand("file-tree", { id: "explorer.copyPath",        title: "复制路径",              handler: placeholder("explorer.copyPath") });
  registerCommand("file-tree", { id: "explorer.copyRelativePath",title: "复制相对路径",          handler: placeholder("explorer.copyRelativePath") });
  registerCommand("file-tree", { id: "explorer.paste",           title: "粘贴",                 handler: placeholder("explorer.paste") });
  registerCommand("file-tree", { id: "explorer.rename",          title: "重命名",               handler: placeholder("explorer.rename") });
  registerCommand("file-tree", { id: "explorer.delete",          title: "删除",                 handler: placeholder("explorer.delete") });
  registerCommand("file-tree", { id: "explorer.findInFolder",    title: "在文件夹中查找…",        handler: placeholder("explorer.findInFolder") });

  // 覆盖 loader 注册的 placeholder——plugin.json 已声明这些命令，但 handler 是空的
  registerCommand("file-tree", { id: "explorer.newFile",         title: "新建文件",              handler: placeholder("explorer.newFile") });
  registerCommand("file-tree", { id: "explorer.newFolder",       title: "新建文件夹",            handler: placeholder("explorer.newFolder") });

  // ── 注册菜单项到 MenuId.FileContext ──
  // 5 组：navigation / editing / creation / modify / search
  // when 条件由 ContextMenu 组件调用 ContextKeyService.matches() 求值

  registerMenuItems(MenuId.FileContext, "file-tree", [
    // 第 1 组：导航/打开
    { command: "explorer.openFile",        group: "1_navigation", when: "explorerItemIsFile" },
    { command: "explorer.openToSide",      group: "1_navigation", when: "explorerItemIsFile" },
    { command: "explorer.openWith",        group: "1_navigation", when: "explorerItemIsFile" },
    { command: "explorer.revealInOS",      group: "1_navigation" },
    { command: "explorer.openInTerminal",  group: "1_navigation", when: "explorerItemIsDir" },

    // 第 2 组：编辑
    { command: "explorer.cut",             group: "2_editing", when: "!explorerItemIsRoot" },
    { command: "explorer.copy",            group: "2_editing", when: "!explorerItemIsRoot" },
    { command: "explorer.copyPath",        group: "2_editing" },
    { command: "explorer.copyRelativePath",group: "2_editing" },
    { command: "explorer.paste",           group: "2_editing", when: "explorerItemIsDir && !explorerClipboardEmpty" },

    // 第 3 组：新建
    { command: "explorer.newFile",         group: "3_creation", when: "explorerItemIsDir || explorerItemIsRoot" },
    { command: "explorer.newFolder",       group: "3_creation", when: "explorerItemIsDir || explorerItemIsRoot" },

    // 第 4 组：重命名/删除
    { command: "explorer.rename",          group: "4_modify", when: "!explorerItemIsRoot" },
    { command: "explorer.delete",          group: "4_modify", when: "!explorerItemIsRoot" },

    // 第 5 组：搜索
    { command: "explorer.findInFolder",    group: "5_search", when: "explorerItemIsDir" },
  ]);
}

/* ── 组件 ── */

interface FileTreeContextMenuProps {
  /** 右键的目标节点——null = 空白处右键（仅新建） */
  item: ExplorerItem | null;
  /** 菜单锚点（clientX/clientY） */
  anchor: { x: number; y: number };
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 文件树右键菜单消费组件。
 * 对标 VS Code：右键之前先选中（sidebar.tsx 在调用前处理）。
 * ContextMenu 内部从 MenuRegistry 读取 MenuId.FileContext 的菜单项，
 * 通过 ContextKeyService 求值 when 条件。
 */
const FileTreeContextMenu: React.FC<FileTreeContextMenuProps> = ({ item, anchor, onClose }) => {
  // 设置瞬态 context key——菜单渲染前注入，关闭时清除
  useEffect(() => {
    ContextKeyService.setValue("explorerItemIsFile", item?.isDirectory === false);
    ContextKeyService.setValue("explorerItemIsDir", item?.isDirectory === true);
    ContextKeyService.setValue("explorerItemIsRoot", item?.parent === null);
    // explorerClipboardEmpty 待 #102 剪贴板服务实现后接入

    return () => {
      // 对标 VS Code——context key 是瞬时状态，关闭即清除
      ContextKeyService.setValue("explorerItemIsFile", false);
      ContextKeyService.setValue("explorerItemIsDir", false);
      ContextKeyService.setValue("explorerItemIsRoot", false);
    };
  }, [item]);

  // 传给命令的上下文（handler 通过 args[0] 接收）
  const context = item ? { uri: item.uri, isDirectory: item.isDirectory } : undefined;

  return (
    <ContextMenu
      menuId={MenuId.FileContext}
      anchor={anchor}
      context={context}
      onClose={onClose}
    />
  );
};

export default FileTreeContextMenu;
