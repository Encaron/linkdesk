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
import { getWorkspaceFolders } from "@src/core/WorkspaceService";
import ContextMenu from "@src/components/shared/ContextMenu";
import type { ExplorerItem, FileTreeModel } from "./FileTreeModel";
import { dirname, normalizePath, joinPath } from "./pathUtils";
import { writeFile, mkdir, exists } from "@src/core/FileService";

/** 菜单传入的 command args */
interface FileMenuContext {
  uri: string;
  isDirectory: boolean;
}

/* ── E4V#20e: 模块级 ref 桥接——command handler 访问 model + rerender ── */

let _model: FileTreeModel | null = null;
let _rerender: (() => void) | null = null;

/** FoldersView mount 时调用——注入 model + rerender 供 command handler 使用 */
export function setFileTreeRefs(model: FileTreeModel, rerender: () => void): void {
  _model = model;
  _rerender = rerender;
}

/** FoldersView unmount 时调用——清除引用防泄漏 */
export function clearFileTreeRefs(): void {
  _model = null;
  _rerender = null;
}

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
  // ── E4V#17: copyPath + copyRelativePath ──
  registerCommand("file-tree", { id: "explorer.copyPath", title: "复制路径", handler: async (_token, ...args: unknown[]) => {
    const ctx = args[0] as FileMenuContext | undefined;
    if (!ctx) return;
    await navigator.clipboard.writeText(ctx.uri);
  }});
  registerCommand("file-tree", { id: "explorer.copyRelativePath", title: "复制相对路径", handler: async (_token, ...args: unknown[]) => {
    const ctx = args[0] as FileMenuContext | undefined;
    if (!ctx) return;
    const folders = getWorkspaceFolders();
    const root = folders.find((f) => ctx.uri.startsWith(normalizePath(f.uri)));
    if (!root) { await navigator.clipboard.writeText(ctx.uri); return; }
    const relative = ctx.uri.slice(normalizePath(root.uri).length).replace(/^[/\\]/, "");
    await navigator.clipboard.writeText(relative || ctx.uri);
  }});

  // ── E4V#18: revealInOS ──
  registerCommand("file-tree", { id: "explorer.revealInOS", title: "在文件管理器中显示", handler: async (_token, ...args: unknown[]) => {
    const ctx = args[0] as FileMenuContext | undefined;
    if (!ctx) return;
    (window as any).linkdesk?.shell?.showItemInFolder(ctx.uri);
  }});

  // ── E4V#19: openInTerminal ──
  registerCommand("file-tree", { id: "explorer.openInTerminal", title: "在终端中打开", handler: async (_token, ...args: unknown[]) => {
    const ctx = args[0] as FileMenuContext | undefined;
    if (!ctx) return;
    const targetPath = ctx.isDirectory ? ctx.uri : dirname(ctx.uri);
    (window as any).linkdesk?.shell?.openInTerminal(targetPath);
  }});

  // 其余占位——后续任务替换
  registerCommand("file-tree", { id: "explorer.openFile",        title: "打开",                 handler: placeholder("explorer.openFile") });
  registerCommand("file-tree", { id: "explorer.openToSide",      title: "在侧边打开",            handler: placeholder("explorer.openToSide") });
  registerCommand("file-tree", { id: "explorer.openWith",        title: "打开方式…",            handler: placeholder("explorer.openWith") });
  registerCommand("file-tree", { id: "explorer.cut",             title: "剪切",                 handler: placeholder("explorer.cut") });
  registerCommand("file-tree", { id: "explorer.copy",            title: "复制",                 handler: placeholder("explorer.copy") });
  registerCommand("file-tree", { id: "explorer.paste",           title: "粘贴",                 handler: placeholder("explorer.paste") });
  registerCommand("file-tree", { id: "explorer.rename",          title: "重命名",               handler: placeholder("explorer.rename") });
  registerCommand("file-tree", { id: "explorer.delete",          title: "删除",                 handler: placeholder("explorer.delete") });
  registerCommand("file-tree", { id: "explorer.findInFolder",    title: "在文件夹中查找…",        handler: placeholder("explorer.findInFolder") });
  registerCommand("file-tree", { id: "explorer.openFocused",    title: "打开聚焦项",              handler: placeholder("explorer.openFocused") });

  // ── E4V#20a-d: 新建/刷新/收起 handler ──
  // 覆盖 loader 注册的 placeholder——plugin.json 已声明这些命令，但 handler 是空的

  registerCommand("file-tree", { id: "explorer.newFile", title: "新建文件", handler: async (_token, ...args: unknown[]) => {
    const ctx = args[0] as FileMenuContext | undefined;
    const model = _model;
    if (!model) return;
    const dirUri = ctx?.isDirectory ? ctx.uri : ctx ? dirname(ctx.uri) : model.roots[0]?.uri;
    if (!dirUri) return;
    let name = "新建文件";
    let filePath = joinPath(dirUri, name);
    for (let i = 1; i < 100; i++) {
      if (!await exists(filePath)) break;
      name = `新建文件-${i}`;
      filePath = joinPath(dirUri, name);
    }
    await writeFile(filePath, "");
    await model.refresh(dirUri);
    // refresh 后重载父目录——立即显示新文件
    const parent = model.findClosest(dirUri);
    if (parent && model.isExpanded(parent.uri)) await model.getChildren(parent).catch(() => {});
    _rerender?.();
  }});

  registerCommand("file-tree", { id: "explorer.newFolder", title: "新建文件夹", handler: async (_token, ...args: unknown[]) => {
    const ctx = args[0] as FileMenuContext | undefined;
    const model = _model;
    if (!model) return;
    const dirUri = ctx?.isDirectory ? ctx.uri : ctx ? dirname(ctx.uri) : model.roots[0]?.uri;
    if (!dirUri) return;
    let name = "新建文件夹";
    let dirPath = joinPath(dirUri, name);
    for (let i = 1; i < 100; i++) {
      if (!await exists(dirPath)) break;
      name = `新建文件夹-${i}`;
      dirPath = joinPath(dirUri, name);
    }
    await mkdir(dirPath);
    await model.refresh(dirUri);
    const parent = model.findClosest(dirUri);
    if (parent && model.isExpanded(parent.uri)) await model.getChildren(parent).catch(() => {});
    _rerender?.();
  }});

  registerCommand("file-tree", { id: "explorer.refresh", title: "刷新资源管理器", handler: async () => {
    const model = _model;
    if (!model) return;
    await model.refresh();
    // refresh 后重载所有已展开目录 + 根
    for (const uri of model.getExpandedUris()) {
      const item = model.findClosest(uri);
      if (item) await model.getChildren(item).catch(() => {});
    }
    _rerender?.();
  }});

  registerCommand("file-tree", { id: "explorer.collapseAll", title: "收起所有文件夹", handler: async () => {
    _model?.collapseAll();
    _rerender?.();
  }});

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
  // E4V#12: 瞬态 context key——菜单渲染前注入，关闭时清除
  useEffect(() => {
    ContextKeyService.setValue("explorerItemIsFile", item?.isDirectory === false);
    ContextKeyService.setValue("explorerItemIsDir", item?.isDirectory === true);
    ContextKeyService.setValue("explorerItemIsRoot", item?.parent === null);
    ContextKeyService.setValue("explorerResourceReadonly", item?.isReadonly === true);

    return () => {
      ContextKeyService.setValue("explorerItemIsFile", false);
      ContextKeyService.setValue("explorerItemIsDir", false);
      ContextKeyService.setValue("explorerItemIsRoot", false);
      ContextKeyService.setValue("explorerResourceReadonly", false);
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
