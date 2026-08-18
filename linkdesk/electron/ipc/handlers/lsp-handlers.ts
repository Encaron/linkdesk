/**
 * E4V#40s1 LSP spawn handler——main process 启动语言服务器，桥 stdin/stdout 到渲染进程。
 *
 * 渲染进程通过 lsp:spawn 请求启动语言服务器（如 pyright、clangd）。
 * 返回 channelId，后续通过 lsp:write / lsp:data 通道双向通信。
 */
import { ipcMain, BrowserWindow, app } from "electron";
import { spawn, type ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { IPC } from '../channels.js';

interface LspChannel {
  process: ChildProcess;
  pluginId: string;
}

const channels = new Map<string, LspChannel>();
let _channelId = 0;

/**
 * E5#114d：resolve LSP 文件路径——ASAR 安全网。
 * 安装版 node_modules 在 app.asar 内部，外部 child_process.spawn() 不认识 ASAR。
 * 策略：JS 文件检测到在 ASAR 内 → 提取所在 package 到临时目录 → 返回临时路径。
 * 非 JS / 非 ASAR 路径原样返回。
 */
function resolveLspArg(arg: string): string {
  // 绝对路径——直接查
  let resolved: string;
  if (path.isAbsolute(arg)) {
    resolved = arg;
  } else {
    // 相对路径 → 对 app 根 resolve（安装版指向 app.asar）
    resolved = path.resolve(app.getAppPath(), arg);
  }

  // 不在 ASAR 中 → 原样返回（dev 模式或已是文件系统路径）
  if (!resolved.includes(".asar")) {
    return arg;
  }

  // 🔥 在 ASAR 内 → 先查 process.resourcesPath（extraResources 落地处）
  // pyright 等 LSP 包通过 electron-builder extraResources 放在 ASAR 外的 resources/ 目录
  const asarIdx = resolved.indexOf(".asar");
  const relPath = resolved.slice(asarIdx + ".asar".length + 1); // "node_modules/pyright/dist/..." or "node_modules/pyright/..."
  const resourcesFallback = process.resourcesPath
    ? path.resolve(process.resourcesPath, relPath)
    : null;
  if (resourcesFallback && fs.existsSync(resourcesFallback)) {
    console.log(`[lsp-handlers] extraResources hit: ${relPath} → ${resourcesFallback}`);
    return resourcesFallback;
  }

  // 非 JS 文件 → 无法提取，返回原路径（让 spawn 报错）
  if (!resolved.endsWith(".js") && !resolved.endsWith(".mjs")) {
    console.warn(`[lsp-handlers] 非 JS 文件在 ASAR 中，spawn 可能失败: ${resolved}`);
    return arg;
  }

  // JS 文件在 ASAR → 提取所在整个 package 到 temp（兜底：没有配 extraResources 的 LSP）
  return extractPackageFromAsar(resolved);
}

/** ASAR 内 node_modules 缓存——按 package 路径缓存 temp 目录 */
const _asarPkgCache = new Map<string, string>();

function extractPackageFromAsar(asarPath: string): string {
  // 从 ASAR 路径中找到 package 根（node_modules/<pkg>）
  const normalized = asarPath.replace(/\\/g, "/");
  const nmIdx = normalized.indexOf("node_modules/");
  if (nmIdx < 0) {
    // 不在 node_modules 中——提取单个文件
    const cacheKey = asarPath;
    const cached = _asarPkgCache.get(cacheKey);
    if (cached) return cached;
    try {
      const content = fs.readFileSync(asarPath, "utf-8");
      const tmpFile = path.join(app.getPath("temp"), "ld-lsp", path.basename(asarPath));
      fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
      fs.writeFileSync(tmpFile, content);
      _asarPkgCache.set(cacheKey, tmpFile);
      console.log(`[lsp-handlers] ASAR extract (single): ${asarPath} → ${tmpFile}`);
      return tmpFile;
    } catch (e) {
      console.error(`[lsp-handlers] ASAR extract failed: ${asarPath}`, e);
      return asarPath;
    }
  }

  // 在 node_modules 中——提取整个 package
  const afterNm = normalized.slice(nmIdx + "node_modules/".length);
  const pkgName = afterNm.split("/")[0]; // pyright
  const pkgRoot = normalized.slice(0, nmIdx + "node_modules/".length + pkgName.length);
  // pkgRoot: e.g. ".../app.asar/node_modules/pyright"

  const cacheKey = pkgRoot;
  const cached = _asarPkgCache.get(cacheKey);
  if (cached) {
    // 已提取过——重新拼目标文件路径
    const relativeEntry = afterNm.slice(pkgName.length + 1); // dist/pyright-langserver.js
    return path.join(cached, relativeEntry);
  }

  // 复制整个 package 到 temp
  const tmpPkg = path.join(app.getPath("temp"), "ld-lsp", "node_modules", pkgName);
  fs.mkdirSync(path.dirname(tmpPkg), { recursive: true });

  try {
    copyDirFromAsar(pkgRoot, tmpPkg);
    _asarPkgCache.set(cacheKey, tmpPkg);
    console.log(`[lsp-handlers] ASAR extract (package): ${pkgRoot} → ${tmpPkg}`);
  } catch (e) {
    console.error(`[lsp-handlers] ASAR package extract failed: ${pkgRoot}`, e);
    return asarPath;
  }

  const relativeEntry = afterNm.slice(pkgName.length + 1);
  return path.join(tmpPkg, relativeEntry);
}

/** 递归复制 ASAR 内的目录到磁盘——fs 的 ASAR 支持 + 写回真实文件系统 */
function copyDirFromAsar(src: string, dest: string): void {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirFromAsar(srcPath, destPath);
    } else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// E5.7#36：壳崩重建复用本函数——引用始终刷新（lsp:data 推送读模块引用），IPC 通道只注册一次
let _mainWindow: BrowserWindow | null = null;
let _registered = false;

export function registerLspHandlers(mainWindow: BrowserWindow): void {
  _mainWindow = mainWindow;
  if (_registered) return;
  _registered = true;

  ipcMain.handle(IPC.lsp.spawn, async (event, { command, args, pluginId }: {
    command: string;
    args?: string[];
    pluginId: string;
  }) => {
    const channelId = `lsp-${++_channelId}`;
    // E5.5#7 Bug B fix：用 event.sender 路由 LSP 数据回发起 spawn 的 WebView（池内编辑器插件）。
    // 旧代码用 pluginId（语言 ID "python"）查 View 映射——永远 null（E5.7#43 该 API 已删）。
    const senderWc = event.sender;

    // E5#114d：resolve ASAR 文件路径——外部 node 不认识 app.asar
    const resolvedArgs = (args ?? []).map(resolveLspArg);
    // 写诊断日志（主进程 console.error 不进 protocol-debug.log，直接写文件）
    try {
      const logFile = path.join(app.getPath('userData'), 'protocol-debug.log');
      const ts = new Date().toISOString();
      fs.appendFileSync(logFile, `[${ts}] [main] [lsp:debug] spawn: command=${command} originalArgs=${JSON.stringify(args)} resolvedArgs=${JSON.stringify(resolvedArgs)} pluginId=${pluginId}\n`);
    } catch { /* ignore */ }

    const child = spawn(command, resolvedArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    // stdout → renderer（双路由：壳 + 发起 spawn 的插件 WebView）
    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      // E5.5#7：用 event.sender 路由——无论编辑器在哪个 WebView，数据能回到正确的那个
      // E5.6#9g：防重复发送——单 WebView 模式下 senderWc === mainWindow.webContents，
      // 不加判断会导致同一 WebContents 收两次 lsp:data → buffer 重复 → JSON.parse 炸在 Content-Length header
      const sentTo = new Set<Electron.WebContents>();
      const sendOnce = (wc: Electron.WebContents | null | undefined) => {
        if (wc && !wc.isDestroyed() && !sentTo.has(wc)) {
          sentTo.add(wc);
          wc.send(IPC.lsp.data, { channelId, data: text });
        }
      };
      sendOnce(_mainWindow && !_mainWindow.isDestroyed() ? _mainWindow.webContents : null);
      sendOnce(senderWc);
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
  ipcMain.on(IPC.lsp.write, (_event, { channelId, data }: { channelId: string; data: string }) => {
    const channel = channels.get(channelId);
    if (channel && !channel.process.stdin?.destroyed) {
      channel.process.stdin?.write(data);
    }
  });

  ipcMain.handle(IPC.lsp.dispose, async (_event, { channelId }: { channelId: string }) => {
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
