/**
 * 命令注册表——对标 VS Code CommandService。
 * Phase 5 柱子 1：插件注册命令 → 命令面板/右键菜单/快捷键三条消费路径。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子1
 * VS Code 对标：vscode.commands.registerCommand / executeCommand
 * VS Code 源码：src/vs/platform/commands/common/commands.ts — ICommandService
 *
 * 关键设计决策：
 * - handler 签名从第一天就用 async (...) => Promise<unknown>（异步执行）
 *   不等 Phase 7 任务系统——同步改异步签名的代价是改所有插件（V2.6 模式）
 * - E5.7#63.8：token 从 handler 合同删除——executeCommand 进 handler 前统一剥 token
 *   （壳直注册与跨进程路径约定归一，全仓 handler 样板唯一：(...args)）
 * - 命令 ID 就是插件的公共 API——跨插件命令调用走 execute() 不走 hard import
 */

import type { CancellationToken } from "../../utils/CancellationToken";
import { reportError } from "../../services/bootstrap/ErrorService";
import { trackRegistration } from "../registrationTracker"; // E5.8#10：register 返 disposer——卸载自动逆序回滚

/* ── 类型 ── */

export interface Command {
  /** 命令 ID——对标 VS Code command identifier。如 "terminal.clear" */
  id: string;
  /** 显示名称——命令面板 / 右键菜单 / 快捷键提示用 */
  title: string;
  /** 分组——命令面板里的分类（如 "终端" / "文件"） */
  category?: string;
  /** context key when 条件——Phase 5 实现（见 ContextKeyService） */
  when?: string;
  /**
   * 占位标记——loader.ts 按 plugin.json contributes.commands 注册的元数据命令。
   * handler 只是诊断 warn；真实 handler 由插件视图在池内 mount 时注册到池侧注册表
   * （preload-pool 的 _poolCommands）。执行时走壳→池转发（executeInPool），不调本 handler。
   */
  placeholder?: boolean;
  /** 异步处理器——E5.7#63.8：不接收 token（executeCommand 进 handler 前统一剥），只收 args */
  handler: (...args: unknown[]) => Promise<unknown>;
}

const _commands = new Map<string, Command>();
const _pluginCommands = new Map<string, Set<string>>(); // pluginId → commandId[]

/* ── 注册 / 注销 ── */

/**
 * 注册命令。Phase 5 盲区 9（P1）：命令 ID 即插件公共 API——跨插件调用走 execute()。
 *
 * Phase 5d 关键设计：loader 先注册元数据（title/category/when），组件 mount 时重注册 handler。
 * 重注册时只替换 handler——不覆盖元数据。对标 VS Code：package.json 是元数据源头，
 * 运行时 extension activate 只提供实现。
 *
 * E5.8#10 返 disposer：新增条目 → 登记"删这一条"disposer（卸载自动逆序回滚）；
 * 重注册分支 → 原条目由首注册者持有，返回 no-op（防误删他人命令）。
 */
export function registerCommand(pluginId: string, command: Command): () => void {
  if (_commands.has(command.id)) {
    // 重注册：更新 handler + title（toggle 命令的 title 随状态变化动态更新）。
    // loader 先注册元数据 → 组件 mount 时重注册覆盖 handler → useEffect 按状态更新 title。
    const existing = _commands.get(command.id)!;
    // #59f1：异插件覆盖警告——两插件声明同一命令 ID
    for (const [pid, ids] of _pluginCommands) {
      if (ids.has(command.id) && pid !== pluginId) {
        console.warn(`[CommandRegistry] "${command.id}" 被覆盖——原注册者: ${pid}，新注册者: ${pluginId}`);
        break;
      }
    }
    existing.handler = command.handler;
    existing.title = command.title;
    // 组件重注册真实 handler 时清 placeholder——否则真实实现永远被转发分支拦截
    existing.placeholder = command.placeholder;
    // 重注册未新增条目——首注册者的 disposer 持有删除权，返回 no-op
    return () => {};
  }
  _commands.set(command.id, command);

  let pluginSet = _pluginCommands.get(pluginId);
  if (!pluginSet) {
    pluginSet = new Set();
    _pluginCommands.set(pluginId, pluginSet);
  }
  pluginSet.add(command.id);

  // E5.8#10：登记"删这一条"disposer——卸载自动逆序回滚（含池运行时命令同步清）
  return trackRegistration(pluginId, () => {
    _commands.delete(command.id);
    _pluginCommands.get(pluginId)?.delete(command.id);
    _poolRuntimeCommands.delete(command.id);
  });
}

/** 注销插件的所有命令——插件卸载时调用 */
export function unregisterPluginCommands(pluginId: string): void {
  const pluginSet = _pluginCommands.get(pluginId);
  if (pluginSet) {
    for (const cmdId of pluginSet) {
      _commands.delete(cmdId);
      _poolRuntimeCommands.delete(cmdId);
    }
    _pluginCommands.delete(pluginId);
  }
}

/* ── 池侧命令元数据同步（E5.7 Bug C 补全——命令面板/菜单可见性）── */

// 🔥 真相源分工（跨进程双注册表的唯一权威声明）：
//   壳 CommandRegistry（本模块）= 显示真相源——title/category/when/命令面板/右键菜单
//   全部只读壳这份注册表；池 _poolCommands（electron/preload-pool.ts）= 执行真相源——
//   handler 闭包引用池侧 React state/DOM，壳进程无法持有也无法执行。
//   meta 单向同步：池 → 壳（"commands:register" IPC），只更新显示面，永不覆盖 handler/placeholder。
//   壳侧执行池命令走 executeInPool 转发桥（Bug C 桥），不是"把 handler 搬过来"。

/** 池内运行时注册的命令——经 "commands:register" IPC 创建，随视图 unmount 的 unregister 注销 */
const _poolRuntimeCommands = new Set<string>();

/**
 * 池侧 registerCommand 的元数据回传——preload-pool 经 "commands:register" IPC 调用。
 *
 * 命令面板/右键菜单的标题、分类、when 过滤全部由壳侧 getCommands 消费——
 * 池内注册必须回传元数据才可见（含动态 toggle 标题的重注册更新）。
 *
 * 已存在条目：只更新 title/category/when——不动 handler/placeholder。
 *   loader 元数据条目保持转发语义（Bug C 桥），壳原生命令保持壳侧执行。
 * 不存在条目：plugin.json 未声明的池内运行时命令——以占位条目登记入壳注册表
 *   （命令面板可见，执行走 executeInPool 转发到池）。
 */
export function registerPoolCommandMetadata(
  commandId: string,
  meta: { title?: string; category?: string; when?: string },
): void {
  const existing = _commands.get(commandId);
  if (existing) {
    if (meta.title !== undefined) existing.title = meta.title;
    if (meta.category !== undefined) existing.category = meta.category;
    if (meta.when !== undefined) existing.when = meta.when;
    return;
  }
  // 命令 ID 约定 "pluginId.commandName"——pluginId 取前缀（preload-pool unregister 同约定）
  const pluginId = commandId.split(".")[0];
  registerCommand(pluginId, {
    id: commandId,
    title: meta.title ?? commandId,
    category: meta.category,
    when: meta.when,
    placeholder: true,
    handler: async () => {
      console.warn(`[CommandRegistry] 命令 "${commandId}" 尚未绑定 handler——池内视图未挂载`);
    },
  });
  _poolRuntimeCommands.add(commandId);
}

/**
 * 壳侧插件入口注册命令——E5.7#56 双进程执行归一化（插件入口模块壳/池各执行一次）。
 * 壳进程执行时注册真实条目：handler 存壳 preload 的 _shellCommands（contextBridge
 * 页面世界函数代理，隔离世界可调用），条目 handler 经
 * window.linkdesk.commands._executeShellLocal 桥回。
 *
 * 与 registerPoolCommandMetadata 协同（两半程在壳注册表自然汇合）：
 *   - 壳启动注册在先（glob loader 执行入口模块）→ 池侧后到只更新 meta（已有条目分支，
 *     不动 handler）——壳侧 handler 保留；
 *   - 池侧注册在先的极端情形——本函数把占位条目升级为真实条目（清 placeholder，
 *     执行改走壳桥，不再走 executeInPool 转发）。
 */
export function registerShellLocalCommand(
  commandId: string,
  meta: { title?: string; category?: string; when?: string },
): void {
  const pluginId = commandId.split(".")[0];
  registerCommand(pluginId, {
    id: commandId,
    title: meta.title ?? commandId,
    category: meta.category,
    when: meta.when,
    placeholder: false,
    handler: (...args) => {
      const bridge = window.linkdesk?.commands?._executeShellLocal;
      if (!bridge) return Promise.reject(new Error(`命令 "${commandId}" 壳侧执行桥不可用`));
      return bridge(commandId, ...args);
    },
  });
}

/**
 * 池侧 unregisterCommands 的回传——移除该插件的运行时命令条目。
 * loader 元数据条目保留——插件仍加载，plugin.json 静态声明仍在。
 */
export function unregisterPoolCommands(pluginId: string): void {
  const prefix = `${pluginId}.`;
  for (const id of [..._poolRuntimeCommands]) {
    if (!id.startsWith(prefix)) continue;
    _poolRuntimeCommands.delete(id);
    _commands.delete(id);
    _pluginCommands.get(pluginId)?.delete(id);
  }
}

/* ── 执行 ── */

/**
 * 执行命令——对标 VS Code executeCommand。
 * Phase 5 盲区 8（P1）：包 try/catch 做错误隔离——一个 buggy 命令不崩命令面板。
 * #44 activationEvents：如果命令所属插件还未加载 → 先触发激活再执行。
 */

/** 命令执行前的预激活钩子——loader.ts 注入（避免循环依赖） */
let _preActivateHook: ((commandId: string) => Promise<void>) | null = null;

/** 设置预激活钩子——loader.ts 在初始化时调用 */
export function setPreActivateHook(hook: (commandId: string) => Promise<void>): void {
  _preActivateHook = hook;
}

export async function executeCommand(
  commandId: string,
  // E5.7#63.8：占位参数——handler 合同已删 token，但调用方仍按旧槽位传 undefined
  // （如 IpcBridgeHandler commands:execute 透传）。槽位保留 = 未来取消语义入口。
  _token?: CancellationToken,
  ...args: unknown[]
): Promise<unknown> {
  // #44：执行前激活延迟插件——onCommand 触发源
  if (_preActivateHook) await _preActivateHook(commandId);

  const cmd = _commands.get(commandId);
  if (!cmd) {
    console.warn(`[CommandRegistry] 命令 "${commandId}" 未注册`);
    return;
  }

  try {
    if (cmd.placeholder) {
      // E5.7 Bug C：占位命令的真实 handler 注册在池 preload 的 _poolCommands。
      // 壳→池转发：events.emit("commands:executeRequest") → 主进程 plugin:push 广播
      // → 池 preload 订阅执行 → invoke("commands:executeResult") → IpcBridgeHandler 回传。
      return await executeInPool(cmd, args);
    }
    // E5.7#63.8：token 在此统一剥除——handler 合同只收 args。
    // 外层 token 参数保留（未来取消语义入口），与池 preload executeCommand
    // 剥 undefined 占位同语义——全仓 handler 样板唯一：(...args)。
    return await cmd.handler(...args);
  } catch (err) {
    reportError({
      message: `命令 "${cmd.title}" 执行出错: ${err instanceof Error ? err.message : String(err)}`,
      source: cmd.category ?? "命令系统",
      error: err,
    });
  }
}

/* ── 壳→池 命令执行转发（E5.7 Bug C）── */

/** 池执行回传等待超时——10 秒无回传视为池侧 handler 卡死/池崩溃 */
const POOL_EXEC_TIMEOUT_MS = 10_000;

interface PoolPendingEntry {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const _poolPending = new Map<string, PoolPendingEntry>();
let _poolRequestSeq = 0;

/**
 * 占位命令转发到池执行。
 * 壳 emit("commands:executeRequest") → 主进程 plugin:push 广播 → 池 preload 订阅执行
 * → invoke("commands:executeResult") → IpcBridgeHandler 调 resolvePoolExecution 回传。
 *
 * token 不转发——池 handler 不消费 CancellationToken（与 preload-pool 剥离 token 占位同约定）。
 * 无 preload 桥（dev 预览/单测）时回退占位 handler 的诊断 warn——与 E5.7 前行为一致。
 */
async function executeInPool(cmd: Command, args: unknown[]): Promise<unknown> {
  const events = window.linkdesk?.events;
  if (!events?.emit) {
    return cmd.handler(undefined, ...args);
  }
  const requestId = `pool-cmd:${++_poolRequestSeq}`;
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      _poolPending.delete(requestId);
      reject(new Error(`命令 "${cmd.id}" 池内执行超时（${POOL_EXEC_TIMEOUT_MS / 1000} 秒）`));
    }, POOL_EXEC_TIMEOUT_MS);
    _poolPending.set(requestId, { resolve, reject, timer });
    events.emit("commands:executeRequest", { requestId, commandId: cmd.id, args });
  });
}

/**
 * 池执行结果回传入口——IpcBridgeHandler 的 "commands:executeResult" 通道调用。
 * 已超时清理的迟到结果直接丢弃（pending 已删）。
 */
export function resolvePoolExecution(
  requestId: string,
  payload: { result?: unknown; error?: string },
): void {
  const pending = _poolPending.get(requestId);
  if (!pending) return;
  clearTimeout(pending.timer);
  _poolPending.delete(requestId);
  if (payload.error) pending.reject(new Error(payload.error));
  else pending.resolve(payload.result);
}

/** 同步执行（fire-and-forget）——不需要等待结果时用 */
export function executeCommandSync(
  commandId: string,
  token?: CancellationToken,
  ...args: unknown[]
): void {
  executeCommand(commandId, token, ...args).catch((err) => {
    console.error(`[CommandRegistry] 命令 "${commandId}" fire-and-forget 出错:`, err);
  });
}

/* ── 查询 ── */

/** 命令是否有已注册的 handler */
export function hasHandler(commandId: string): boolean {
  return _commands.has(commandId);
}

/** 获取单个命令 */
export function getCommand(commandId: string): Command | undefined {
  return _commands.get(commandId);
}

/** 获取所有已注册命令——命令面板消费 */
export function getCommands(): Command[] {
  return Array.from(_commands.values());
}

/** 获取插件的所有命令 ID */
export function getPluginCommands(pluginId: string): string[] {
  return Array.from(_pluginCommands.get(pluginId) ?? []);
}

/** 清空注册表（测试用） */
export function clearCommands(): void {
  _commands.clear();
  _pluginCommands.clear();
}
