/**
 * FileTreeContextMenu——文件树右键菜单。
 * E4b #96：MenuRegistry 注册 15 项到 "FileContext" + ContextKeyService when 条件。
 *
 * 对标 VS Code explorerViewer.ts 的 explorerContextMenu。
 * 设计文档：docs/02-Electron架构/E4_文件树与编辑器_暂定/02-E4b-文件树交互.md §二 #96
 */

import React, { useEffect, type MutableRefObject } from "react";
import { ContextMenu } from "@linkdesk/ui"; // E6#54c：共享控件走 @linkdesk/ui
import type { ExplorerItem } from "../services/FileTreeModel";
import type { FileTreeHandle } from "./FileTree";
import { dirname, normalizePath, joinPath } from "../utils/pathUtils";

const lk = window.linkdesk;
import { fileTreeClipboard } from "../services/FileTreeClipboard";
import { executeSafeDrop } from "../services/FileTreeDnD";

/** 菜单传入的 command args */
interface FileMenuContext {
  uri: string;
  isDirectory: boolean;
}

/* ── 🔥 归一化桥接：存 ref 对象——每次 .current 拿最新 handle，非快照 ── */

let _handleRef: MutableRefObject<FileTreeHandle | null> | null = null;

/** 🔥 读最新 handle——解决 FoldersView 不重渲染时 _handle 快照过期的时序 bug */
function h(): FileTreeHandle | null {
  return _handleRef?.current ?? null;
}

/** FoldersView mount 时调用——注入 ref 本身（非 current 快照） */
export function setFileTreeHandleRef(ref: MutableRefObject<FileTreeHandle | null>): void {
  _handleRef = ref;
}

/** FoldersView unmount 时调用 */
export function clearFileTreeHandle(): void {
  _handleRef = null;
}

/* ── 工具函数 ── */

/**
 * E5#108c：写路径到系统剪贴板——原生 CF_HDROP 优先 + 纯文本 fallback。
 * E5.8#24.8.6：纯文本 fallback 从废弃 document.execCommand("copy") → linkdesk.clipboard.writeText——
 * Electron clipboard 多格式共存（writeText 只写 text/plain，不影响 CF_HDROP）；await 双写消除
 * 「text 先写、CF_HDROP 后到」的理论竞态；失败 console.error 出声（#24.6 静默链文化）。零新机制。
 */
async function writeSystemClipboard(uris: string[]): Promise<void> {
  try {
    // 原生：Windows 资源管理器可粘贴（CF_HDROP）
    await window.linkdesk?.clipboard?.writeFileList?.(uris);
    // 纯文本：编辑器/终端可粘贴
    await window.linkdesk?.clipboard?.writeText?.(uris.join("\n"));
  } catch (e) {
    console.error("[file-tree] 写系统剪贴板失败:", e);
  }
}

// E5.6#11.5g2：clipboardProviders 已删除——池是独立 WCV，壳 Ctrl+C/X/V 不到池。
// 文件树剪贴板由 FileTreeClipboard.ts（进程内 state）管理，通过 lk.commands.executeCommand("explorer.cut/copy/paste") 执行。

/* ── 🔥 打开文件桥接：命令 handler 通过此桥调 createTab ── */

type OpenFileFn = (filePath: string, name: string, mode: "preview" | "pin") => void;

let _openFileFn: OpenFileFn | null = null;

/** FoldersView mount 时注入——命令 handler 通过此桥调 createTab */
export function setOpenFileFn(fn: OpenFileFn | null): void {
  _openFileFn = fn;
}

// E4V#40m——Diff："选择以比较"存储的基准文件路径
let _selectedForCompare: string | null = null;

// 兼容旧调用方
export { setFileTreeHandleRef as setFileTreeHandle, setFileTreeHandleRef as setFileTreeRefs };
export { clearFileTreeHandle as clearFileTreeRefs };

// ── 已废弃的旧 API（保留导出避免编译错误，后续轮次删除）──
/** @deprecated 使用 h().getSelection() */
export function setSelectedUris(_uris: string[]): void {}
/** @deprecated 使用 h().getFocusedUri() */
export function setFocusedUriBridge(_uri: string | null): void {}

/* ── 模块级：注册命令 + 菜单项（对标 marketplace sidebar.tsx pattern） ── */

let _registered = false;

/** 注册 explorer 命令到 CommandRegistry + 右键菜单项到 "FileContext"。幂等。 */
export function activateFileTreeContextMenu(): void {
  if (_registered) return;
  _registered = true;

  // ── 注册命令（占位 handler——后续任务逐步替换） ──

  const placeholder = (id: string) => async () => {
    console.warn(`[file-tree] 命令 "${id}" 尚未实现`);
  };

  // 新增命令（不在 plugin.json contributes.commands 中——此处是唯一注册点）
  // ── E4V#17: copyPath + copyRelativePath ──
  lk.commands.registerCommand("explorer.copyPath", async (...args) => {
    const ctx = args[0] as FileMenuContext | undefined;
    if (!ctx) return;
    await navigator.clipboard.writeText(ctx.uri);
  });
  lk.commands.registerCommand("explorer.copyRelativePath", async (...args) => {
    const ctx = args[0] as FileMenuContext | undefined;
    if (!ctx) return;
    const folders = await lk.workspace.getFolders();
    const root = folders.find((f: { uri: string }) => ctx.uri.startsWith(normalizePath(f.uri)));
    if (!root) { await navigator.clipboard.writeText(ctx.uri); return; }
    const relative = ctx.uri.slice(normalizePath(root.uri).length).replace(/^[/\\]/, "");
    await navigator.clipboard.writeText(relative || ctx.uri);
  });

  // ── E4V#18: revealInOS ──
  lk.commands.registerCommand("explorer.revealInOS", async (...args) => {
    const ctx = args[0] as FileMenuContext | undefined;
    if (!ctx) return;
    window.linkdesk?.shell?.showItemInFolder(ctx.uri);
  });

  // ── E4V#19 + E5#22: openInTerminal——从配置读取终端类型，不再硬编码 PowerShell ──
  lk.commands.registerCommand("explorer.openInTerminal", async (...args) => {
    const ctx = args[0] as FileMenuContext | undefined;
    if (!ctx) return;
    const targetPath = ctx.isDirectory ? ctx.uri : dirname(ctx.uri);
    // 插件走 linkdesk.configuration API——禁止直接 import ConfigurationService
    const cfg = window.linkdesk?.configuration;
    const terminalExe = (await cfg?.get<string>("terminal.external.windowsExec")) || "powershell";
    const customCommand = (await cfg?.get<string>("terminal.external.customCommand")) || "";
    window.linkdesk?.shell?.openInTerminal(targetPath, terminalExe, customCommand);
  });

  // ── E4V#30: revealInExplorer——定位文件并展开目录链 ──
  lk.commands.registerCommand("explorer.revealInExplorer", async (...args) => {
    const hd = h(); if (!hd) return;
    // 兼容多种 arg 格式：string | { filePath } | { uri } | FileMenuContext
    let targetUri: string | null = null;
    const arg = args[0];
    if (typeof arg === "string") {
      targetUri = normalizePath(arg);
    } else if (arg && typeof arg === "object") {
      const obj = arg as Record<string, unknown>;
      targetUri = normalizePath((obj.filePath ?? obj.uri ?? "") as string);
    }
    if (!targetUri) {
      // 无参数→回退到 focused item
      targetUri = hd.getFocusedUri();
    }
    if (!targetUri) return;
    await hd.reveal(targetUri);
  });
  // ── E4V#28: openFile —— 扩展名→FileAssociation→createTab ──
  lk.commands.registerCommand("explorer.openFile", async (...args) => {
    const ctx = args[0] as FileMenuContext | undefined;
    if (!ctx || ctx.isDirectory) return;
    const name = ctx.uri.split("/").pop() ?? ctx.uri;
    _openFileFn?.(ctx.uri, name, "pin");
  });
  // ── E4V#29: openToSide —— 在侧边分屏打开文件 ──
  lk.commands.registerCommand("explorer.openToSide", async (...args) => {
    const ctx = args[0] as FileMenuContext | undefined;
    if (!ctx || ctx.isDirectory) return;
    const name = ctx.uri.split("/").pop() ?? ctx.uri;
    _openFileFn?.(ctx.uri, name, "pin");
  });
  lk.commands.registerCommand("explorer.openWith", placeholder("explorer.openWith"));
  // ── E4V#25: cut + copy（含系统剪贴板写入——桌面粘贴需要）──
  lk.commands.registerCommand("explorer.cut", async (...args) => {
    const hd = h(); if (!hd) return;
    const ctx = args[0] as FileMenuContext | undefined;
    const selection = hd.getSelection();
    const focused = hd.getFocusedUri();
    const uris: string[] = selection.length > 0 ? selection : ctx ? [ctx.uri] : focused ? [focused] : [];
    if (uris.length === 0) return;
    fileTreeClipboard.cut(uris);
    await writeSystemClipboard(uris);
    hd.rerender();
  });
  lk.commands.registerCommand("explorer.copy", async (...args) => {
    const hd = h(); if (!hd) return;
    const ctx = args[0] as FileMenuContext | undefined;
    const selection = hd.getSelection();
    const focused = hd.getFocusedUri();
    const uris: string[] = selection.length > 0 ? selection : ctx ? [ctx.uri] : focused ? [focused] : [];
    if (uris.length === 0) return;
    fileTreeClipboard.copy(uris);
    await writeSystemClipboard(uris);
  });
  // ── E4V#26: paste ──
  lk.commands.registerCommand("explorer.paste", async (...args) => {
    const hd = h(); if (!hd) return;
    const model = hd.getModel();
    const ctx = args[0] as FileMenuContext | undefined;
    let targetDir = ctx?.isDirectory ? ctx.uri : ctx ? dirname(ctx.uri) : "";
    if (!targetDir) {
      const focusedUri = hd.getFocusedUri();
      if (focusedUri) {
        const focused = model.findClosest(focusedUri);
        targetDir = focused?.isDirectory ? focused.uri : dirname(focusedUri);
      }
    }
    if (!targetDir) targetDir = model.roots[0]?.uri ?? "";
    if (!targetDir) return;
    const { uris, isCut } = fileTreeClipboard.pull();
    if (uris.length === 0) return;
    const sources = uris.map((u) => ({ path: u, name: u.split("/").pop() ?? "unnamed" }));
    await executeSafeDrop(sources, targetDir, isCut ? "move" : "copy");
    hd.rerender();
    await model.refresh(targetDir);
    const parent = model.findClosest(targetDir);
    if (parent && model.isExpanded(parent.uri)) await model.getChildren(parent).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
  });
  // ── E4V#27: F2 行内重命名 ──
  lk.commands.registerCommand("explorer.rename", async () => {
    h()?.startRename();
  });
  // ── E4V#24: delete ──
  lk.commands.registerCommand("explorer.delete", async (...args) => {
    const hd = h(); if (!hd) return;
    const model = hd.getModel();
    const ctx = args[0] as FileMenuContext | undefined;
    const selection = hd.getSelection();
    const focused = hd.getFocusedUri();
    const uris: string[] = selection.length > 0 ? selection : ctx ? [ctx.uri] : focused ? [focused] : [];
    if (uris.length === 0) return;
    const confirmDelete = await lk.configuration.get("explorer.confirmDelete") ?? true;
    if (confirmDelete) {
      const nameList = uris.map((u) => `"${u.split("/").pop() ?? u}"`).join(", ");
      const confirmed = await window.linkdesk?.dialog?.confirm?.(`确定删除 ${nameList}？`);
      if (!confirmed) return;
    }
    const parentUris = new Set<string>();
    for (const uri of uris) {
      await lk.filesystem.remove(uri);
      lk.events.emit("file:deleted", { filePath: uri });
      parentUris.add(dirname(uri));
    }
    for (const parentUri of parentUris) {
      await model.refresh(parentUri);
      const parent = model.findClosest(parentUri);
      if (parent && model.isExpanded(parent.uri)) await model.getChildren(parent).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
    }
  });
  lk.commands.registerCommand("explorer.findInFolder", placeholder("explorer.findInFolder"));
  // ── E4V#33: openFolder —— 打开工作区文件夹（MenuBar 文件菜单） ──
  lk.commands.registerCommand("explorer.openFolder", async () => {
    await lk.workspace.openFolder();
  });
  // ── E4V#29: openFocused —— 目录→展开/折叠，文件→打开 ──
  lk.commands.registerCommand("explorer.openFocused", async () => {
    const hd = h(); if (!hd) return;
    const focusedUri = hd.getFocusedUri();
    if (!focusedUri) return;
    const model = hd.getModel();
    const item = model.findClosest(focusedUri);
    if (!item) return;
    if (item.isDirectory) {
      if (model.isExpanded(item.uri)) {
        model.collapse(item.uri);
      } else {
        model.expand(item.uri);
        await model.getChildren(item).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
      }
    } else {
      _openFileFn?.(item.uri, item.name, "pin");
    }
  });

  // ── E4V#20a-d: 新建/刷新/收起 handler ──
  // 覆盖 loader 注册的 placeholder——plugin.json 已声明这些命令，但 handler 是空的

  // E4V#34 fix: 无 context（MenuBar 调用）→回退到 focused item/根目录
  const _resolveDirUri = (hd: ReturnType<typeof h>, ctx?: FileMenuContext): string => {
    const model = hd!.getModel();
    if (ctx?.isDirectory) return ctx.uri;
    if (ctx) return dirname(ctx.uri);
    // MenuBar 调用——无右键菜单 context→用 focused/selected item
    const focusedUri = hd!.getFocusedUri();
    if (focusedUri) {
      const focused = model.findClosest(focusedUri);
      return focused?.isDirectory ? focused.uri : dirname(focusedUri);
    }
    return model.roots[0]?.uri ?? "";
  };

  lk.commands.registerCommand("explorer.newFile", async (...args) => {
    const hd = h(); if (!hd) return;
    const model = hd.getModel();
    const dirUri = _resolveDirUri(hd, args[0] as FileMenuContext | undefined);
    if (!dirUri) return;
    // E4V#34j: explorer.incrementalNaming——"smart"=编号（默认），"disabled"=不编号
    const naming = await lk.configuration.get("explorer.incrementalNaming") ?? "smart";
    let name = "新建文件";
    let filePath = joinPath(dirUri, name);
    if (naming !== "disabled") {
      for (let i = 1; i < 100; i++) {
        if (!await lk.filesystem.exists(filePath)) break;
        name = `新建文件-${i}`;
        filePath = joinPath(dirUri, name);
      }
    }
    await lk.filesystem.writeTextFile(filePath, "");
    await model.refresh(dirUri);
    const parent = model.findClosest(dirUri);
    if (parent && model.isExpanded(parent.uri)) await model.getChildren(parent).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
  });

  lk.commands.registerCommand("explorer.newFolder", async (...args) => {
    const hd = h(); if (!hd) return;
    const model = hd.getModel();
    const dirUri = _resolveDirUri(hd, args[0] as FileMenuContext | undefined);
    if (!dirUri) return;
    // E4V#34j: explorer.incrementalNaming——"smart"=编号（默认），"disabled"=不编号
    const naming = await lk.configuration.get("explorer.incrementalNaming") ?? "smart";
    let name = "新建文件夹";
    let dirPath = joinPath(dirUri, name);
    if (naming !== "disabled") {
      for (let i = 1; i < 100; i++) {
        if (!await lk.filesystem.exists(dirPath)) break;
        name = `新建文件夹-${i}`;
        dirPath = joinPath(dirUri, name);
      }
    }
    await lk.filesystem.createDir(dirPath);
    await model.refresh(dirUri);
    const parent = model.findClosest(dirUri);
    if (parent && model.isExpanded(parent.uri)) await model.getChildren(parent).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
  });

  lk.commands.registerCommand("explorer.refresh", async () => {
    const hd = h(); if (!hd) return;
    const model = hd.getModel();
    await model.refresh();
    for (const uri of model.getExpandedUris()) {
      const item = model.findClosest(uri);
      if (item) await model.getChildren(item).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
    }
  });

  lk.commands.registerCommand("explorer.collapseAll", async () => {
    h()?.getModel().collapseAll();
  });

  // ── E4V#xx: removeFolder——关闭文件夹（从工作区移除根目录） ──
  lk.commands.registerCommand("explorer.removeFolder", async (...args) => {
    const ctx = args[0] as FileMenuContext | undefined;
    if (ctx?.uri) {
      // 右键菜单调用——关闭指定文件夹
      lk.workspace.removeFolder(ctx.uri);
    } else {
      // MenuBar 调用——关闭所有工作区文件夹
      const folders = await lk.workspace.getFolders();
      for (const f of folders) lk.workspace.removeFolder(f.uri);
    }
  });

  // ── E4V#xx: closeAllEditors——关闭所有编辑器标签页（委托 core.closeAllEditors） ──
  lk.commands.registerCommand("explorer.closeAllEditors", async () => {
    await lk.commands.executeCommand("core.closeAllEditors");
  });

  // ── E4V#38: search——聚焦搜索面板输入框 ──
  lk.commands.registerCommand("explorer.search", async () => {
    // 搜索面板始终可见（collapsed: false），只需聚焦
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(".search-input");
      input?.focus();
    });
  });

  // ── E4V#40m: Diff——选择以比较 / 与已选项比较 ──
  lk.commands.registerCommand("editor.selectForCompare", async (...args) => {
    const item = (args[0] as { uri?: string }) ?? {};
    if (item.uri) _selectedForCompare = item.uri;
  });
  lk.commands.registerCommand("editor.compareWithSelected", async (...args) => {
    const item = (args[0] as { uri?: string }) ?? {};
    const uri = item.uri;
    if (!uri || !_selectedForCompare || _selectedForCompare === uri) return;
    const orig = _selectedForCompare;
    _selectedForCompare = null;
    const origName = (orig.split("/").pop() || orig);
    const modName = (uri.split("/").pop() || uri);
    const sourceId = `${orig}|||${uri}`;
    _openFileFn?.(sourceId, `${origName} ↔ ${modName}`, "pin");
  });

  // ── 注册菜单项到 "FileContext" ──
  // 5 组：navigation / editing / creation / modify / search
  // when 条件由 ContextMenu 组件调用 ContextKeyService.matches() 求值

  window.linkdesk?.menu?.registerItems("FileContext", "file-tree", [
    // 第 1 组：导航/打开
    { command: "explorer.openFile",        group: "1_navigation", when: "explorerItemIsFile" },
    { command: "explorer.openToSide",      group: "1_navigation", when: "explorerItemIsFile" },
    // E5.6#11.5-bug5：这两命令未在 plugin.json contributes.commands 中声明，
    // menu:getItems 从核心 CommandRegistry 查不到 title → fallback 到 command ID 字符串 → t() 无法翻译。
    // 加 label 属性提供 i18n key（中文原文），ContextMenu.tsx 的 t(item.label) 映射到翻译文件。
    { command: "editor.selectForCompare",   group: "1_navigation", when: "explorerItemIsFile", label: "选择以比较" },
    { command: "editor.compareWithSelected", group: "1_navigation", when: "explorerItemIsFile", label: "与已选项比较" },
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

    // 第 6 组：工作区操作
    { command: "explorer.removeFolder",    group: "6_workspace", when: "explorerItemIsRoot", label: "关闭文件夹" },
  ]);

  // ── E4V#33: MenuBar 菜单栏贡献——[文件] 追加 + 新建 [编辑] 菜单 ──
  // pattern: 父项 command="" label="按钮名" children=[...]——对标 coreCommands.ts
  window.linkdesk?.menu?.registerItems("MenuBar", "file-tree", [
    // 追加到已有 [文件] 菜单
    { command: "explorer.newFile",        group: "file", label: "新建文件" },
    { command: "explorer.newFolder",      group: "file", label: "新建文件夹" },
    { command: "explorer.openFolder",     group: "file", label: "打开文件夹…" },
    { command: "explorer.closeAllEditors",group: "file", label: "关闭所有编辑器" },
    { command: "explorer.removeFolder",   group: "file", label: "关闭文件夹" },
    // 新建 [编辑] 菜单——父项 label="编辑" 给按钮名，子项是下拉菜单内容
    {
      command: "",
      label: "编辑",
      group: "edit",
      children: [
        { command: "explorer.cut",    group: "edit" },
        { command: "explorer.copy",   group: "edit" },
        { command: "explorer.paste",  group: "edit" },
        { command: "explorer.search", group: "edit", label: "搜索" },
      ],
    },
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
 * ContextMenu 内部从 MenuRegistry 读取 "FileContext" 的菜单项，
 * 通过 ContextKeyService 求值 when 条件。
 */
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
