/**
 * clipboard 命令组——剪切 / 复制 / 粘贴 / 复制路径（E6#87a 二次拆分）。
 */
import { dirname, normalizePath } from "../../../utils/pathUtils";
import { fileTreeClipboard } from "../../../services/FileTreeClipboard";
import { executeSafeDrop } from "../../../services/FileTreeDnD";
import { h } from "../host-bridge";
import { refreshDirSafe, type FileMenuContext } from "./shared";

const lk = window.linkdesk;

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

/** 解析命令的 uri 列表——选中集优先，其次右键目标，最后 focused */
function resolveUris(ctx: FileMenuContext | undefined): string[] {
  const hd = h(); if (!hd) return [];
  const selection = hd.getSelection();
  const focused = hd.getFocusedUri();
  return selection.length > 0 ? selection : ctx ? [ctx.uri] : focused ? [focused] : [];
}

export function registerClipboardCommands(): void {
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

  // ── E4V#25: cut + copy（含系统剪贴板写入——桌面粘贴需要）──
  lk.commands.registerCommand("explorer.cut", async (...args) => {
    const hd = h(); if (!hd) return;
    const uris = resolveUris(args[0] as FileMenuContext | undefined);
    if (uris.length === 0) return;
    fileTreeClipboard.cut(uris);
    await writeSystemClipboard(uris);
    hd.rerender();
  });
  lk.commands.registerCommand("explorer.copy", async (...args) => {
    const uris = resolveUris(args[0] as FileMenuContext | undefined);
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
    await refreshDirSafe(model, targetDir);
  });
}
