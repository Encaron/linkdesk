/**
 * navigation 命令组——打开 / 定位 / 搜索 / 工作区（E6#87a 二次拆分）。
 */
import { dirname, normalizePath } from "../../../utils/pathUtils";
import { h, getOpenFileFn } from "../host-bridge";
import { placeholder, type FileMenuContext } from "./shared";

const lk = window.linkdesk;

export function registerNavigationCommands(): void {
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
    getOpenFileFn()?.(ctx.uri, name, "pin");
  });
  // ── E4V#29: openToSide —— 在侧边分屏打开文件 ──
  lk.commands.registerCommand("explorer.openToSide", async (...args) => {
    const ctx = args[0] as FileMenuContext | undefined;
    if (!ctx || ctx.isDirectory) return;
    const name = ctx.uri.split("/").pop() ?? ctx.uri;
    getOpenFileFn()?.(ctx.uri, name, "pin");
  });
  lk.commands.registerCommand("explorer.openWith", placeholder("explorer.openWith"));
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
      getOpenFileFn()?.(item.uri, item.name, "pin");
    }
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
}
