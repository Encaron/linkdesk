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
// 因此池 preload 在 contextBridge 隔离世界内维护 Map<string, PoolCommandEntry>。
// executeCommand 先查池侧注册表，未找到则 fallback 到壳侧 IPC。
// 🔥 真相源分工（与壳 CommandRegistry 的唯一权威声明一致）：
//   _poolCommands（本表）= 执行真相源——handler 永不离开本进程；
//   壳 CommandRegistry = 显示真相源——title/category/when 只读壳那份。
//   meta 单向同步（commands:register IPC）只回传显示面，壳侧执行走 executeInPool 转发桥。
// S4/T6（作用域分区）：条目带注册时刻的 activation/scope——视图卸载只摘 view:* ，
//   plugin 作用域常驻；同一 commandId 只允许一个作用域（⛔ 谁最后注册谁赢）。
interface PoolCommandEntry {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- handler 入参类型由插件调用方决定（同 registerCommand 的 ...args: any[] 契约）
  handler: (...args: any[]) => any;
  /** S4：注册上下文——entry 顶层（含 on-command 激活 import）= "entry"；视图挂载期间 = "view" */
  activation: "entry" | "view";
  /** S4/T6：作用域——"plugin" = 插件存活期常驻；"view:<viewInstanceId>" = 该实例卸载即摘 */
  scope: string;
}
const _poolCommands = new Map<string, PoolCommandEntry>();

// ── S4：激活上下文栈（同步压弹）——PluginComponent mount 压 viewInstanceId、unmount 弹；
// registerCommand 只读栈顶（⛔ 自己维护挂载判断）。空栈 = entry 上下文（默认）。
const _activationStack: string[] = [];

/**
 * 2026-11-25：**入口 import 强制上下文**（修复「插件升级/重开后齿轮命令丢失」）。
 * 病根：entry 的顶层副作用若在某个视图挂载期间被 import（on-command 激活 / 懒加载），
 * 会按栈顶误判成 view 作用域 ⇒ 该视图卸载时命令被摘；模块缓存又让 entry 不会二次执行
 * ⇒ 之后齿轮菜单报「命令 … 未在池内注册」。
 * 修法：PluginComponent 在 import **入口**（非视图）前后压/弹本计数器；期间注册一律按 entry。
 */
let _entryImportDepth = 0;

/**
 * 2026-11-25：**清单声明过的命令 = 插件级**（与 import 上下文解耦）。
 * 病根二：插件把命令注册放进「首个被 import 的池面模块」（市场侧就是这种），首个 import 若发生在
 * 某个视图挂载期间 ⇒ 命令被记成 view 作用域；视图一卸载就整批摘掉，而模块级 guard 又让 entry
 * 重被 import 时不再注册 ⇒ 图标/齿轮报「未在池内注册」。
 * 判据：contributes.commands[] 声明过的 id 是**插件级公共命令**（声明面即契约），视图卸载只该摘
 * 私有命令。本集合从壳注册表 placeholder:true 的条目预取（loader 为声明面登记的占位元数据）。
 */
const _declaredCommandIds = new Set<string>();
let _declaredLoadInFlight = false;
let _declaredLoadDisabled = false;
/**
 * 🔴 2026-11-25 根修（竞态）：旧实现「模块加载即取一次、成败都上锁」——池 preload 常早于壳注册完
 * 声明面占位，取到空集就**永久空**⇒ 视图卸载的「声明面提升」失效，插件级命令整批被摘。
 * 现在：**集合为空就允许重取**（并发去重），并在每次 registerCommand 前机会性刷新。
 */
function ensureDeclaredCommands(): void {
  if (_declaredLoadDisabled || _declaredLoadInFlight || _declaredCommandIds.size > 0) return;
  _declaredLoadInFlight = true;
  void ipcRenderer
    .invoke(IPC.plugins.call, "getCommands")
    .then((list: unknown) => {
      if (!Array.isArray(list)) return;
      for (const c of list as Array<{ id?: unknown; placeholder?: unknown }>) {
        if (typeof c?.id === "string" && c.placeholder === true) _declaredCommandIds.add(c.id);
      }
    })
    .catch(() => {
      /* 壳不可达（浏览器 dev-host）⇒ 集合空 = 退回纯上下文判定（下次注册再试） */
    })
    .finally(() => {
      _declaredLoadInFlight = false;
    });
}

/** 测试内部面——注入「声明面命令」集合（生产由 ensureDeclaredCommands 预取） */
function setDeclaredCommandsForTest(ids: Iterable<string>): void {
  _declaredCommandIds.clear();
  for (const id of ids) _declaredCommandIds.add(id);
  _declaredLoadDisabled = true; // 阻止预取覆盖测试注入
}

// 模块加载即预取声明面命令集合（须在 _declaredCommandIds 初始化之后——否则 TDZ）
ensureDeclaredCommands();

/** 视图挂载：压栈（栈顶即当前视图上下文） */
function enterViewContext(viewInstanceId: string): void {
  if (_activationStack[_activationStack.length - 1] !== viewInstanceId) _activationStack.push(viewInstanceId);
}

/** 视图卸载：弹栈 ＋ 只摘该实例的 view:* 作用域命令（⛔ 不碰 plugin 作用域） */
function leaveViewContext(viewInstanceId: string): void {
  const at = _activationStack.lastIndexOf(viewInstanceId);
  if (at >= 0) _activationStack.splice(at, 1);
  for (const [id, entry] of _poolCommands) {
    if (entry.scope !== `view:${viewInstanceId}`) continue;
    if (_declaredCommandIds.has(id)) {
      // 声明面命令 = 插件级：视图卸载时**提升**，⛔ 不随实例删（否则图标/齿轮永久 miss）
      _poolCommands.set(id, { ...entry, scope: "plugin", activation: "entry" });
      continue;
    }
    _poolCommands.delete(id);
  }
}

/** 查池侧 handler 并执行——handler 存在返回 Promise，不存在返回 null（调用方决定 fallback 壳 / reject）。E5.8#1c 去重 */
function callPoolHandler(id: string, args: unknown[]): Promise<unknown> | null {
  const entry = _poolCommands.get(id);
  if (!entry) return null;
  return Promise.resolve(entry.handler(...args));
}

/** E6#62e 池侧 on-command 激活钩——池 renderer 注册的属主插件入口 import 回调。
 *  命令 miss（壳占位转发 / 池直调都覆盖）→ 先请 renderer import 属主插件入口（#17d 壳零 import 铁律
 *  保持——入口唯一执行者 = 池）——entry 顶层副作用注册命令 handler 后重试一次；仍 miss → 走 fallback。
 *  纯命令插件作者契约：命令 handler 在 entry 顶层注册（无视图可开也能按需激活）。 */
let _commandMissHandler: ((pluginId: string) => Promise<boolean>) | null = null;

/** 命令 ID 的**推定**属主——名字第一段（约定 "pluginId.commandName"）。
 *  🔴 E6#111b 后本函数**只是兜底**：真属主由壳解析（`resolvePoolCommandOwner`）。
 *  名字推定的唯一合法用途 = 壳不可达时（浏览器 dev-host / 单测）的兼容档。 */
function commandOwnerId(commandId: string): string | null {
  const dot = commandId.indexOf(".");
  return dot > 0 ? commandId.slice(0, dot) : null;
}

/** 命令 → 真属主（池侧缓存）。只缓存**权威档**（壳解析出的声明面／注册方自报）——
 *  推定档不入缓存：声明晚到时必须能翻盘，缓存了就等于把推定钉成身份。 */
const _poolCommandOwners = new Map<string, string>();

/**
 * 命令真属主解析——① 池侧已记（壳回执／注册方自报）→ ② 壳权威解析（声明面查表）→ ③ 名字推定兜底。
 * 🔴 E6#111b（H3 修点）：旧实现直接切名字第一段 ⇒ 「借了别人前缀的命令」会把**不相干的插件**
 *   整只 import 进来（`editor.selectForCompare` 属主是 file-tree，却去 import `editor` 插件）。
 * 归属解析只在壳一处做（池是单进程共享 realm，preload 自己推不出身份），池侧只消费与兜底。
 */
async function resolvePoolCommandOwner(commandId: string): Promise<string | null> {
  const known = _poolCommandOwners.get(commandId);
  if (known) return known;
  try {
    const res = await ipcRenderer.invoke(IPC.plugins.call, "resolveCommandOwner", commandId) as
      | { pluginId?: string; source?: string }
      | null;
    if (res && typeof res.pluginId === "string") {
      if (res.source !== "inferred") _poolCommandOwners.set(commandId, res.pluginId);
      return res.pluginId;
    }
  } catch {
    // 壳不可达（浏览器 dev-host / 单测）→ 落 ③ 名字推定兜底（与 1.32 前行为一致）
  }
  return commandOwnerId(commandId);
}

/** 查池侧 handler——miss 先经 on-command 激活重试一次（import 属主入口，模块缓存幂等），仍 miss → fallback() */
async function callPoolHandlerWithActivation(
  commandId: string,
  args: unknown[],
  fallback: () => Promise<unknown>,
): Promise<unknown> {
  const direct = callPoolHandler(commandId, args);
  if (direct) return direct;
  const owner = await resolvePoolCommandOwner(commandId);
  if (owner && _commandMissHandler) {
    try {
      if (await _commandMissHandler(owner)) {
        const retry = callPoolHandler(commandId, args);
        if (retry) return retry;
      }
    } catch (e) {
      console.error(`[preload-pool] on-command 激活属主插件 "${owner}" 失败:`, e);
    }
  }
  return fallback();
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
    registerCommand: (id: string, handler: (...args: any[]) => any, meta?: { title?: string; category?: string; when?: string; pluginId?: string; description?: string; params?: { name: string; type: "string" | "number" | "boolean" | "object"; required?: boolean; description?: string }[]; async?: boolean }) => {
      // 竞态兜底：声明面集合为空时，注册这条请求顺手再取一次（⛔ 上锁一次定终身）
      ensureDeclaredCommands();
      // S4：读激活上下文栈顶定 activation/scope——entry 顶层注册 = plugin 作用域；视图挂载期间 = view:<id>
      // 2026-11-25：入口 import 期间强制 entry（见 _entryImportDepth 注）——否则视图内触发激活入口会误记 view 作用域。
      const viewInstanceId = _entryImportDepth > 0 ? undefined : _activationStack[_activationStack.length - 1];
      const activation: "entry" | "view" = viewInstanceId ? "view" : "entry";
      const scope = viewInstanceId ? `view:${viewInstanceId}` : "plugin";
      const existing = _poolCommands.get(id);
      if (existing && existing.scope !== scope) {
        // 2026-11-25：view → plugin = **提升**（入口级注册是权威，声明面命令更该如此）；
        // 反向（plugin → view）仍保留插件级，⛔ 谁最后注册谁赢。
        if (scope === "plugin") {
          _poolCommands.set(id, { handler, activation: "entry", scope: "plugin" });
          if (meta?.pluginId) _poolCommandOwners.set(id, meta.pluginId);
          return;
        }
        // T6：同一 commandId 只允许一个作用域——跨层双注册 ⇒ 诊断 ＋ 后者不覆盖（⛔ 谁最后注册谁赢）。
        // 视图态晚于插件级 ⇒ 保留首注册；插件的双注册由各仓收敛（02 §2.2 的验收对象）。
        console.warn(
          `[preload-pool] 命令 "${id}" 双注册被拒——已有 scope=${existing.scope}（activation=${existing.activation}），`
          + `新注册 scope=${scope}（activation=${activation}）——同一 id 只允许一个作用域，保留首注册。`,
        );
        return;
      }
      // 同作用域重注册 = meta/标题刷新（动态 toggle 标题）——handler/meta 更新，activation 以首注册为准
      _poolCommands.set(id, { handler, activation: existing?.activation ?? activation, scope });
      // E6#111b ②：注册方显式申报的真身份——优先于名字推定（照 notifications.source 先例）
      if (meta?.pluginId) _poolCommandOwners.set(id, meta.pluginId);
      // S4：activation（运行期真值）随 meta 回传壳注册表——describe 输出与错误码映射都靠它
      const syncedMeta = { ...meta, activation }; // async 随 meta 原样透传（声明式，S6）
      // E6#111b ①：壳回执带回归属（声明面查表结果）——池侧只消费，不自己从名字推
      ipcRenderer.invoke(IPC.commands.register, id, syncedMeta ?? null)
        .then((res) => {
          const r = res as { pluginId?: string; source?: string } | null;
          if (r && typeof r.pluginId === 'string' && r.source !== 'inferred') _poolCommandOwners.set(id, r.pluginId);
        })
        .catch((e) => {
          console.error(`[preload-pool] commands:register 回传失败 (${id}):`, e);
        });
    },
    /** 注销某插件的全部**插件级**命令——S4/T6 后只摘 scope="plugin"（按真属主摘，E6#111b 判据⑤/H2）；
     *  ⛔ 不碰 view:* 条目（视图实例卸载由 _leaveViewContext 摘）。真属主未知时才退回名字前缀推定（兼容档）。 */
    unregisterCommands: (pluginId: string) => {
      for (const [id, entry] of _poolCommands) {
        if (entry.scope !== "plugin") continue;
        const owner = _poolCommandOwners.get(id) ?? commandOwnerId(id);
        if (owner === pluginId) {
          _poolCommands.delete(id);
          _poolCommandOwners.delete(id);
        }
      }
      ipcRenderer.invoke(IPC.commands.unregister, pluginId).catch((e) => {
        console.error(`[preload-pool] commands:unregister 回传失败 (${pluginId}):`, e);
      });
    },
    /** 执行命令——先查池侧注册表；miss 走 on-command 激活（#62e）重试一次，仍未找到则 IPC 到壳 */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令入参类型由插件命令调用方决定，对标 VS Code executeCommand 的 ...args: any[]
    executeCommand: (id: string, ...args: any[]) => {
      // 壳侧 executeCommand(id, token, ...realArgs) 的 token 是 CancellationToken（E5.7#63.8 后
      // 只留槽位、handler 合同只收 args）。作者契约（linkdesk-api）不带占位槽 ⇒ 两种调用形都要归一
      // 成 realArgs：缺省形 (obj) → [obj]；池内形（ContextMenu/CommandPalette）(undefined, obj) → [obj]。
      const realArgs = args.length > 0 && args[0] === undefined ? args.slice(1) : args;
      // E6#62e：miss 先 import 属主插件入口（模块缓存幂等）再重试一次；仍 miss → fallback 壳 IPC。
      // 🔴 壳桥契约是 `commands:execute(id, token, ...realArgs)`（IpcBridgeHandler/commands.ts 按此位
      //   解构）——⛔ 这里必须**补 undefined 占位**再铺 realArgs：直接把 realArgs 铺进去，第一个实参
      //   会被壳当成 token 吃掉（`core.openSettings` 的 ctx 落进 token 槽 ⇒ pluginId/scrollTo 静默丢，
      //   T6「市场点配置项不跳类别」即此形；具名对象展开 expandNamedArgs 也一并失效）。
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 契约 executeCommand<T> 泛型返回：池侧命令返回值经 Promise 透传，边界归一 any（对标原 `?? invoke` 隐式 Promise<any>）
      return callPoolHandlerWithActivation(id, realArgs, () => ipcRenderer.invoke(IPC.commands.execute, id, undefined, ...realArgs)) as Promise<any>;
    },
    /** 向后兼容别名——委托 executeCommand（E5.8#1c 去重） */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 命令入参类型由插件命令调用方决定（委托 executeCommand，同型豁免）
    execute: (id: string, ...args: any[]) => commandsObj.executeCommand(id, ...args),
    /** E6#62e 内部钩——池 renderer（PoolApp mount）注册 on-command 激活回调。underscore 内部面（对标 _executeShellLocal），非插件作者 API */
    _setCommandMissHandler: (handler: (pluginId: string) => Promise<boolean>): void => {
      _commandMissHandler = handler;
    },
    /** S4 内部面——PluginComponent mount/unmount 压弹激活上下文栈（非插件作者 API，⛔ 插件自己调） */
    _enterViewContext: enterViewContext,
    _leaveViewContext: leaveViewContext,
    /** 2026-11-25 内部面——import 入口前后压/弹「强制 entry 作用域」计数器（PluginComponent 调；非插件 API） */
    _beginEntryImport: () => { _entryImportDepth++; },
    _endEntryImport: () => { if (_entryImportDepth > 0) _entryImportDepth--; },
    /** 测试内部面（⛔ 插件 API）：注入声明面命令集合 */
    _setDeclaredCommandsForTest: setDeclaredCommandsForTest,
    getCommands: () => ipcRenderer.invoke(IPC.plugins.call, 'getCommands'),
  };

  // ── E5.7 Bug C：壳→池 命令执行请求桥——占位命令的壳侧执行转发到池真实 handler ──
  // 壳 CommandRegistry.executeCommand 遇 placeholder 命令（loader 元数据注册）→
  // events.emit("commands:executeRequest") → 主进程 plugin:push 广播 → 本订阅执行 →
  // invoke(IPC.commands.executeResult) → 壳 IpcBridgeHandler resolvePoolExecution 回传。
  // 订阅放 preload 模块级（对标 extraHandlers）：_poolCommands 就在本隔离世界，无 contextBridge 往返。
  // executeLocal 不 fallback 壳——壳侧该命令就是占位元数据，fallback 只会死循环。
  // E6#62e：miss 先经 on-command 激活（import 属主入口）重试一次，仍 miss → reject。
  const executeLocal = (id: string, ...args: unknown[]): Promise<unknown> =>
    callPoolHandlerWithActivation(id, args, () => Promise.reject(new Error(`命令 "${id}" 未在池内注册`)));
  const sendExecuteResult = (requestId: string, result: { result?: unknown; error?: string; code?: string; hint?: string }): void => {
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
      // S2/T14：插件错误**原样透传 code/hint**（结构化错误只有一个构造点 = SDK `pluginError`）；
      // 裸 Error（无 code）⇒ `EUNKNOWN`——⛔ 由壳猜语义归到某个已有码。message 只作人读。
      const err = e as { code?: unknown; message?: unknown; hint?: unknown };
      const code = typeof err?.code === 'string' && err.code ? err.code : 'EUNKNOWN';
      // message 取字符串形态优先（pluginError 若返回带 code 的普通对象也照样可取，⛔ [object Object]）
      const message = typeof err?.message === 'string' ? err.message : (e instanceof Error ? e.message : String(e));
      sendExecuteResult(requestId, {
        error: message,
        code,
        ...(typeof err?.hint === 'string' && err.hint ? { hint: err.hint } : {}),
      });
    }
  });

  return commandsObj;
}
