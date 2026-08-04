/**
 * E4V#40s1 LSP spawn handler——main process 启动语言服务器，桥 stdin/stdout 到渲染进程。
 *
 * 渲染进程通过 lsp:spawn 请求启动语言服务器（如 pyright、clangd）。
 * 返回 channelId，后续通过 lsp:write / lsp:data 通道双向通信。
 */
import { ipcMain, BrowserWindow } from "electron";
import { spawn, type ChildProcess } from "child_process";
import type { WindowManager } from "../window-manager.js"; // E5#74c

interface LspChannel {
  process: ChildProcess;
  pluginId: string;
}

const channels = new Map<string, LspChannel>();
let _channelId = 0;

export function registerLspHandlers(mainWindow: BrowserWindow, windowManager?: WindowManager): void {
  ipcMain.handle("lsp:spawn", async (_event, { command, args, pluginId }: {
    command: string;
    args?: string[];
    pluginId: string;
  }) => {
    const channelId = `lsp-${++_channelId}`;

    const child = spawn(command, args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    // stdout → renderer
    child.stdout?.on("data", (data: Buffer) => {
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send("lsp:data", { channelId, data: data.toString("utf-8") });
      }
      // E5#74c：editor 独立 WebView 后路由 LSP 数据
      if (windowManager) {
        const editorView = windowManager.getPluginView(pluginId);
        if (editorView) {
          editorView.webContents.send("lsp:data", { channelId, data: data.toString("utf-8") });
        }
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      console.warn(`[lsp:${channelId}] stderr:`, data.toString("utf-8"));
    });

    child.on("close", (code) => {
      console.log(`[lsp:${channelId}] 进程退出, code:`, code);
      channels.delete(channelId);
    });

    child.on("error", (err) => {
      console.error(`[lsp:${channelId}] spawn 失败:`, err.message);
      channels.delete(channelId);
    });

    channels.set(channelId, { process: child, pluginId });
    console.log(`[lsp:${channelId}] 已启动:`, command, args ?? [], "plugin:", pluginId);
    return channelId;
  });

  // renderer → stdin
  ipcMain.on("lsp:write", (_event, { channelId, data }: { channelId: string; data: string }) => {
    const channel = channels.get(channelId);
    if (channel && !channel.process.stdin?.destroyed) {
      channel.process.stdin?.write(data);
    }
  });

  ipcMain.handle("lsp:dispose", async (_event, { channelId }: { channelId: string }) => {
    const channel = channels.get(channelId);
    if (channel) {
      channel.process.stdin?.end();
      channel.process.kill();
      channels.delete(channelId);
      console.log(`[lsp:${channelId}] 已销毁`);
    }
  });

  console.log("[lsp-handlers] 已注册 3 个 LSP IPC handler");
}
