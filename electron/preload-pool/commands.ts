/**
 * Pool preload 命令域——池侧命令注册表 + commands 命名空间 + 壳→池执行桥。
 * E5.8#0d.10-4b：自 preload-pool.ts 拆出——_poolCommands 本地注册表（handler 闭包不可跨进程，
 * executeCommand 先查池侧、未找到 fallback 壳 IPC）+ 壳侧 placeholder 命令的 executeRequest 转发桥。
 * 依赖方向：commands → electron/ipc（channels/event-system type）；无反向。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import type { EventSystemApi } from '../ipc/event-system';

// ── E5.6#11.5a：池侧命令注册表——Path B 关键设计 ──
// 池内插件需要注册命令（file-tree ~20 + marketplace ~5 + serial-monitor ~5）。
// handler 是函数闭包——引用池侧 React state/DOM，壳无法执行。
// 因此池 preload 在 contextBridge 隔离世界内维护 Map<string, Function>。
// executeCommand 先查池侧注册表，未找到则 fallback 到壳侧 IPC。
// 🔥 真相源分工（与壳 CommandRegistry 的唯一权威声明一致）：
//   _poolCommands（本表）= 执行真相源——handler 永不离开本进程；
//   壳 CommandRegistry = 显示真相源——title/category/when 只读壳那份。
//   meta 单向同步（commands:register IPC）只回传显示面，壳侧执行走 executeInPool 转发桥。
const _poolCommands = new Map<string, Function>();

/** 查池侧 handler 并执行——handler 存在返回 Promise，不存在返回 null（调用方决定 fallback 壳 / reject）。E5.8#1c 去重 */
function callPoolHandler(id: string, args: unknown[]): Promise<unknown> | null {
  const handler = _poolCommands.get(id);
  if (!handler) return null;
  return Promise.resolve(handler(...args));
}

/** commands 命名空间——池侧注册 + 壳侧 fallback + executeRequest 转发桥注册 */
export function buildCommands(events: EventSystemApi) {
  // ── 命令对象——池侧注册 + 壳侧 fallback ──
  const commandsObj = {
    /**
     * 注册池侧命令——handler 来自 renderer（React 代码），contextBridge 自动代理函数引用。
     * meta 同步到壳注册表（IPC.commands.register IPC）——命令面板/右键菜单的标题、分类、
     * when 过滤全由壳侧 getCommands 消费，池内注册必须回传才可见（含动态 toggle 标题重注册）。
     * 不传 meta 的旧调用向后兼容（纯池内命令，壳侧不可见）。
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令 handler 入参类型由插件调用方决定，对标 VS Code registerCommand 的 (...args: any[]) => any
    registerCommand: (id: string, handler: (...args: any[]) => any, meta?: { title?: string; category?: string; when?: string }) => {
      _poolCommands.set(id, handler);
      ipcRenderer.invoke(IPC.commands.register, id, meta ?? null).catch((e) => {
        console.error(`[preload-pool] commands:register 回传失败 (${id}):`, e);
      });
    },
    /** 注销某插件的全部命令（约定：命令 ID 格式为 "pluginId.commandName"）——池侧 handler + 壳侧运行时条目同步注销 */
    unregisterCommands: (pluginId: string) => {
      for (const [id] of _poolCommands) {
        if (id.startsWith(pluginId + '.')) _poolCommands.delete(id);
      }
      ipcRenderer.invoke(IPC.commands.unregister, pluginId).catch((e) => {
        console.error(`[preload-pool] commands:unregister 回传失败 (${pluginId}):`, e);
      });
    },
    /** 执行命令——先查池侧注册表，未找到则 IPC 到壳 */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令入参类型由插件命令调用方决定，对标 VS Code executeCommand 的 ...args: any[]
    executeCommand: (id: string, ...args: any[]) => {
      // 壳侧 executeCommand(id, token, ...realArgs) 的 token 是 CancellationToken。
      // 调用方（ContextMenu/CommandPalette）固定传 undefined 占位。池 handler 不消费 token——
      // 剥离后传 realArgs。E5.7#63.8 后壳侧 handler 合同同样只收 args——两进程约定归一。
      const realArgs = args.length > 0 && args[0] === undefined ? args.slice(1) : args;
      return callPoolHandler(id, realArgs) ?? ipcRenderer.invoke(IPC.commands.execute, id, ...args);
    },
    /** 向后兼容别名——委托 executeCommand（E5.8#1c 去重） */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令入参类型由插件命令调用方决定（委托 executeCommand，同型豁免）
    execute: (id: string, ...args: any[]) => commandsObj.executeCommand(id, ...args),
    getCommands: () => ipcRenderer.invoke(IPC.plugins.call, 'getCommands'),
  };

  // ── E5.7 Bug C：壳→池 命令执行请求桥——占位命令的壳侧执行转发到池真实 handler ──
  // 壳 CommandRegistry.executeCommand 遇 placeholder 命令（loader 元数据注册）→
  // events.emit("commands:executeRequest") → 主进程 plugin:push 广播 → 本订阅执行 →
  // invoke(IPC.commands.executeResult) → 壳 IpcBridgeHandler resolvePoolExecution 回传。
  // 订阅放 preload 模块级（对标 extraHandlers）：_poolCommands 就在本隔离世界，无 contextBridge 往返。
  // executeLocal 不 fallback 壳——壳侧该命令就是占位元数据，fallback 只会死循环。
  const executeLocal = (id: string, ...args: unknown[]): Promise<unknown> =>
    callPoolHandler(id, args) ?? Promise.reject(new Error(`命令 "${id}" 未在池内注册`));
  const sendExecuteResult = (requestId: string, result: { result?: unknown; error?: string }): void => {
    ipcRenderer.invoke(IPC.commands.executeResult, requestId, result).catch((e) => {
      console.error(`[preload-pool] commands:executeResult 回传失败 (${requestId}):`, e);
    });
  };
  events.on('commands:executeRequest', async (payload) => {
    const { requestId, commandId, args } = (payload ?? {}) as {
      requestId?: string;
      commandId?: string;
      args?: unknown[];
    };
    if (!requestId || !commandId) return;
    try {
      const result = await executeLocal(commandId, ...(Array.isArray(args) ? args : []));
      sendExecuteResult(requestId, { result });
    } catch (e) {
      sendExecuteResult(requestId, { error: e instanceof Error ? e.message : String(e) });
    }
  });

  return commandsObj;
}
