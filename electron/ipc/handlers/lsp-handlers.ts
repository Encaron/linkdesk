/**
 * E4V#40s1 LSP spawn handler——main process 启动语言服务器，桥 stdin/stdout 到渲染进程。
 *
 * 渲染进程通过 lsp:spawn 请求启动语言服务器（如 pyright、clangd）。
 * 返回 channelId，后续通过 lsp:write / lsp:data 通道双向通信。
 *
 * E6#15k：spawn 路径知识收束——args 已在 langDef 注册处被绝对化（lsp-arg-resolve.ts），本文件纯透传
 * 绝对 args，不再做任何 ASAR 路径搬运（E5#114d resolveLspArg/extractPackageFromAsar/copyDirFromAsar/
 * _asarPkgCache 安全网已整删——args 注册即绝对，.asar 分支永假 = 纯死代码）。spawn cwd 与
 * checkLspDependency 基准同源自 langDef 注册上下文（plugin-manifest-loader 记录的插件根，lspSpawnDirFor），
 * 消灭 `isPackaged ? userData : appPath` 双轨猜（壳里「插件根在 userData」的第二处路径知识）。
 */
import { ipcMain, app } from "electron";
import { spawn, type ChildProcess } from "child_process";
import * as path from "path";
import * as fs from "fs";
import { IPC } from '../channels.js';
import { IpcBridge } from '../ipc-bridge.js';
// E5.8#24.6：spawn 前哨兵——纯函数模块（无 electron import，可直接 vitest）
import { checkLspDependency } from '../lsp-dependency.js';
// E6#15k：langDef 注册上下文（plugin-manifest-loader）——语言 id → 插件根目录（lsp.args 绝对化同一来源）
import { getLangDefPluginDir } from '../../plugins/plugin-manifest-loader.js';

interface LspChannel {
  process: ChildProcess;
  /** spawn 消息第三参 = langDef.id（语言 id，见 spawn handler 注）——仅日志/清理用，非路径知识 */
  langKey: string;
}

const channels = new Map<string, LspChannel>();
let _channelId = 0;

/**
 * E6#15k：spawn 工作目录 = 该语言 LSP 所属插件根（与 lsp.args 注册绝对化同一 pluginDir，同源自取）。
 * 查不到（插件已卸载/未扫盘 → fallback）→ userData：目录恒真实存在即可——args 已绝对自足，cwd 只作
 * spawn 工作目录 + checkLspDependency 非绝对参数的回退基准（目录物理存在是唯一硬要求：Windows
 * CreateProcess cwd 指向缺位/文件路径 → ENOENT，E5.8#24.6 实证）。不再用 app.isPackaged 猜路径。
 */
function lspSpawnDirFor(langKey: string): string {
  const pluginDir = getLangDefPluginDir(langKey);
  return pluginDir ?? app.getPath("userData");
}

/** E5.7#36 + E5.8#6.5：壳崩重建复用本函数——lsp:data 推送走 IpcBridge.active（恒指最新实例），
 * IPC 通道只注册一次 */
let _registered = false;

/** E5.8#24.6：写主进程诊断日志——console.error 不进 protocol-debug.log（%APPDATA%/linkdesk/），必须直接写文件 */
function appendLspLog(tag: string, line: string): void {
  try {
    const logFile = path.join(app.getPath("userData"), "protocol-debug.log");
    const ts = new Date().toISOString();
    fs.appendFileSync(logFile, `[${ts}] [main] [${tag}] ${line}\n`);
  } catch { /* ignore */ }
}

export function registerLspHandlers(): void {
  if (_registered) return;
  _registered = true;

  ipcMain.handle(IPC.lsp.spawn, async (_event, { command, args, pluginId }: {
    command: string;
    args?: string[];
    pluginId: string;
  }) => {
    const channelId = `lsp-${++_channelId}`;

    // E6#15k：消息第三参 = langDef.id（语言 id——EditorView 从 langDef.get 拿 def.id 传入，非插件 id；
    // python 插件恰好 langDef.id == pluginId == "python"，历史字段名 pluginId 是误标）。spawn 基准从
    // 注册上下文取 pluginDir（见 lspSpawnDirFor）；args 纯透传（注册处已绝对化，无需任何搬运）。
    const spawnDir = lspSpawnDirFor(pluginId);
    appendLspLog("lsp:debug", `spawn: command=${command} args=${JSON.stringify(args)} langKey=${pluginId} cwd=${spawnDir}`);

    // E5.8#24.6：spawn 前哨兵——运行时依赖物理存在检查。缺失 → 抛错（invoke reject），
    // 渲染进程 lsp.spawn() 即抛 → startLspClient 显性报错 → 编辑器 toast。
    // 修复回归 #24 静默链：pyright 被删 → spawn ENOENT → invoke 仍返 channelId → client.start() 挂死。
    const missing = checkLspDependency(command, args ?? [], spawnDir);
    if (missing) {
      const msg = `LSP 运行时依赖缺失: "${missing}"（命令 "${command}" 无法启动）——检查插件 langDef.lsp 配置与 node_modules 完整性`;
      console.error(`[lsp:${channelId}] ${msg}`);
      appendLspLog("lsp:error", `channel=${channelId} ${msg}`);
      throw new Error(msg);
    }

    const child = spawn(command, args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
      // E6#15k：cwd = 语言插件根（dev = 项目 plugins/<id>，打包 = {userData}/plugins/<id>）——与
      // checkLspDependency 的基准同源，哨兵所见 = spawn 实际所用。真实目录由注册上下文保证。
      cwd: spawnDir,
    });

    // stdout → renderer（E5.8#6.5：唯一路径 = IpcBridge.broadcast——plugin:push 发壳+发池；
    // 原 sendOnce 壳+sender 双路由删除：E5.5#7 的 event.sender 路由在唯一 Pool 下恒等于池，
    // 由 broadcast 统一分发（不再有同一 WebContents 收两次的 E5.6#9g 隐患））
    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString("utf-8");
      // E5.8#6.5-regress-2：流数据 storeForReplay=false——lsp 输出不入 lastBroadcasts 重放（原直发不重放）
      IpcBridge.active?.broadcast(IPC.lsp.data, { channelId, data: text }, undefined, false);
    });

    child.stderr?.on("data", (data: Buffer) => {
      console.warn(`[lsp:${channelId}] stderr:`, data.toString("utf-8"));
    });

    child.on("close", (code) => {
      console.log(`[lsp:${channelId}] 进程退出, code:`, code);
      channels.delete(channelId);
    });

    child.on("error", (err) => {
      // E5.8#24.6：spawn 失败显性化——console + 协议诊断日志双落盘（前置哨兵后此路径罕见：非 ENOENT 的 exec 失败/权限等）
      console.error(`[lsp:${channelId}] spawn 失败:`, err.message);
      appendLspLog("lsp:error", `channel=${channelId} spawn 失败: ${err.message}`);
      channels.delete(channelId);
    });

    channels.set(channelId, { process: child, langKey: pluginId });
    console.log(`[lsp:${channelId}] 已启动:`, command, args ?? [], "lang:", pluginId);
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
