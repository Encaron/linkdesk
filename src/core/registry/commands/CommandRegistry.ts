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
import type { LinkDeskCommandParam } from "../../api/linkdesk-api/types"; // M1 AI#7：命令元数据与契约同型（`import type` 零运行时耦合）
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
   * M1 `AI#7`：这条命令**干什么**——用户/AI 视角的意图（⛔ 不复述命令 id）。
   * i18n 约定同 title（key = 中文原文）；随 `commands.getCommands()` 出契约（`LinkDeskCommand`）。
   */
  description?: string;
  /** M1 `AI#7`：参数结构（逐位对应 handler 实参）——无参数命令不填。契约 `LinkDeskCommandParam` 同型 */
  params?: LinkDeskCommandParam[];
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
const _pluginCommands = new Map<string, Set<string>>(); // pluginId → commandId[]（归属倒排索引）

/* ── 归属（E6#111b：归属从身份来，不从名字来）── */

/**
 * 归属来源三档——1.31 裁决的解析优先级 ① 声明面 → ② 注册方自报 → ③ 名字推定。
 *  - `declared`：plugin.json `contributes.commands[]` 声明面（loader 用真身份注册）——权威，不可改；
 *  - `reported`：注册方显式申报（池／壳载荷的可选 `pluginId`，照 `notifications.source` 先例 `ui.ts:26-32`）；
 *  - `inferred`：名字第一段推定——**老第三方零申报的兼容档，是"推定"不是身份**。
 */
export type CommandOwnerSource = "declared" | "reported" | "inferred";

/** 注册方对身份的主张档——`inferred` = 不主张身份（调用方没报，只是名字里带着一段）。 */
export type CommandOwnerClaim = CommandOwnerSource;

/** 命令归属——`_commandOwners` 是唯一真相源，`_pluginCommands` 是它的按 pluginId 倒排索引（两册同笔维护）。 */
export interface CommandOwnership {
  pluginId: string;
  source: CommandOwnerSource;
}

/** 档位强弱——**重挂只在「后到的档更强」时发生**（乱序到达的自愈），同档先到者保留。 */
const _OWNER_STRENGTH: Record<CommandOwnerSource, number> = { inferred: 0, reported: 1, declared: 2 };

/** 命令 id → 归属（唯一真相源）。 */
const _commandOwners = new Map<string, CommandOwnership>();

/** ③ 名字第一段推定——**只在前两档都拿不到时用**（不是身份，冲突时必须能出声）。 */
function inferOwnerFromCommandId(commandId: string): string {
  return commandId.split(".")[0];
}

/**
 * 归属解析（① 声明面 → ② 自报 → ③ 名字推定）——**登记新条目与乱序纠正共用这一条**。
 * 🔴 `inferred` 不主张身份 ⇒ 已登记归属先者保留；声明面恒为权威，任何主张都改不动它。
 */
function _resolveOwner(commandId: string, claimOwner: string, claim: CommandOwnerClaim): CommandOwnership {
  const known = _commandOwners.get(commandId);
  if (known?.source === "declared") return known;
  if (claim === "inferred") return known ?? { pluginId: claimOwner, source: "inferred" };
  if (known && _OWNER_STRENGTH[known.source] >= _OWNER_STRENGTH[claim]) return known;
  return { pluginId: claimOwner, source: claim };
}

/** 归属两册同笔维护——写新归属并摘旧倒排（`_commandOwners` 与 `_pluginCommands` 恒一致）。 */
function _setOwnership(commandId: string, owner: CommandOwnership): void {
  const prev = _commandOwners.get(commandId);
  if (prev && prev.pluginId !== owner.pluginId) _pluginCommands.get(prev.pluginId)?.delete(commandId);
  _commandOwners.set(commandId, owner);
  let set = _pluginCommands.get(owner.pluginId);
  if (!set) {
    set = new Set();
    _pluginCommands.set(owner.pluginId, set);
  }
  set.add(commandId);
}

/** 摘归属（两册同笔）。 */
function _dropOwnership(commandId: string): void {
  const prev = _commandOwners.get(commandId);
  _commandOwners.delete(commandId);
  if (prev) _pluginCommands.get(prev.pluginId)?.delete(commandId);
}

/** 条目整删——命令表 ＋ 归属两册 ＋ 池运行时标记（disposer / 注销共用同一具尸体清单）。 */
function _deleteCommandEntry(commandId: string): void {
  _commands.delete(commandId);
  _dropOwnership(commandId);
  _poolRuntimeCommands.delete(commandId);
}

/**
 * 命令归属查询——池侧 on-command 激活取真属主（`plugins.call "resolveCommandOwner"`，H3 修点）。
 * 已登记 ⇒ 照实报（含来源档）；未登记 ⇒ ③ 名字推定，**`inferred` 是给池侧的信号：别缓存，声明晚到要能翻盘**。
 */
export function resolveCommandOwnership(commandId: string): CommandOwnership {
  return _commandOwners.get(commandId) ?? { pluginId: inferOwnerFromCommandId(commandId), source: "inferred" };
}

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
export function registerCommand(
  pluginId: string,
  command: Command,
  claim: CommandOwnerClaim = "declared",
): () => void {
  const owner = _resolveOwner(command.id, pluginId, claim);
  if (_commands.has(command.id)) {
    // 重注册：更新 handler + title（toggle 命令的 title 随状态变化动态更新）。
    // loader 先注册元数据 → 组件 mount 时重注册覆盖 handler → useEffect 按状态更新 title。
    const existing = _commands.get(command.id)!;
    // E6#111b 判据③④（H1）：主张了身份（declared／reported）而归属不是他 ⇒ 异归属顶替，**不覆盖 ＋ 出声点名双方**。
    // 🔴 不抛错——本函数调用点在 parseContributions 内，抛错 = 整只插件装不上（比被覆盖更坏）。
    // 主张档 `inferred`（名字推定）不算主张 ⇒ 不拦：真实 handler 正是靠这条路径注册进声明的属主条目。
    if (claim !== "inferred" && pluginId !== owner.pluginId) {
      console.error(
        `[CommandRegistry] "${command.id}" 异归属注册被拒——属主: ${owner.pluginId}（${owner.source}），`
        + `新注册者: ${pluginId}——不覆盖（原 handler 保留）`,
      );
      return () => {};
    }
    // E6#111b §1.2 乱序到达自愈：推定落在先、真身份后到 ⇒ **重挂归属**。这是**另一条触发路径**，
    // 与下面三行的「同插件重注册」互不干涉——那三行是既有设计，逐字未动。
    const prev = _commandOwners.get(command.id);
    if (prev && prev.pluginId !== owner.pluginId) {
      _setOwnership(command.id, owner);
      // 归属换人 ⇒ 清理权同笔移交新属主（原登记层是推定属主，真正卸载的那一方永远不会命中它）
      trackRegistration(owner.pluginId, () => _deleteCommandEntry(command.id));
    }
    existing.handler = command.handler;
    existing.title = command.title;
    // M1 AI#7：可选元数据**有值才覆盖**——组件 mount 重注册只带 handler，不该把声明面写的
    // description/params 抹掉（title 是必填故无条件覆盖，二者不同款）。
    if (command.description !== undefined) existing.description = command.description;
    if (command.params !== undefined) existing.params = command.params;
    // 组件重注册真实 handler 时清 placeholder——否则真实实现永远被转发分支拦截
    existing.placeholder = command.placeholder;
    // 重注册未新增条目——首注册者的 disposer 持有删除权，返回 no-op
    return () => {};
  }
  _commands.set(command.id, command);
  _setOwnership(command.id, owner);

  // E5.8#10：登记"删这一条"disposer——卸载自动逆序回滚（含池运行时命令同步清）。
  // E6#111b：登记层按**真属主**（owner.pluginId），不按调用方自报的名字——推定属主下二者可能不同。
  return trackRegistration(owner.pluginId, () => _deleteCommandEntry(command.id));
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
 * E5.8#43-4（③ 归属表）：命令 id → 注册窗口集合（声明式数据，壳唯一真相源）。
 * "commands:register" IPC 带 sender windowId 回传（主进程边界注入，插件零改动）维护。
 * 多窗口下命令执行路由的判定依据：origin 亲和优先 → 归属表唯一注册者 → 全池广播兜底（§8.6 方案 B）。
 */
const _poolCommandWindows = new Map<string, Set<string>>();

/**
 * 池侧 registerCommand 的元数据回传——preload-pool 经 "commands:register" IPC 调用。
 *
 * 命令面板/右键菜单的标题、分类、when 过滤全部由壳侧 getCommands 消费——
 * 池内注册必须回传元数据才可见（含动态 toggle 标题的重注册更新）。
 *
 * 已存在条目：只更新 title/category/when/description/params——不动 handler/placeholder。
 *   loader 元数据条目保持转发语义（Bug C 桥），壳原生命令保持壳侧执行。
 * 不存在条目：plugin.json 未声明的池内运行时命令——以占位条目登记入壳注册表
 *   （命令面板可见，执行走 executeInPool 转发到池）。
 *
 * E5.8#43-4（③）：windowId 参数 = 注册窗口归属（主进程 sender 解析注入）——两分支都记入
 *   归属表 `_poolCommandWindows`（路由 origin 亲和/归属表兜底的声明式数据源）。
 */
export function registerPoolCommandMetadata(
  commandId: string,
  meta: { title?: string; category?: string; when?: string; pluginId?: string; description?: string; params?: LinkDeskCommandParam[] },
  windowId?: string,
): CommandOwnership {
  // §8.6 归属表：登记该命令的注册窗口（多窗口同一命令在每窗各注册一次 → 集合多成员）
  if (windowId) {
    let set = _poolCommandWindows.get(commandId);
    if (!set) {
      set = new Set();
      _poolCommandWindows.set(commandId, set);
    }
    set.add(windowId);
  }

  // E6#111b 判据③（H1 修点）：归属从身份来——① 声明面查表 → ② meta.pluginId 自报 → ③ 名字推定。
  // 🔴 旧实现是 `commandId.split(".")[0]`：两个插件同前缀运行时注册 ⇒ 推导归属相同 ⇒ 连 warn 都不响。
  const owner = _resolveOwner(
    commandId,
    meta.pluginId ?? inferOwnerFromCommandId(commandId),
    meta.pluginId ? "reported" : "inferred",
  );

  const existing = _commands.get(commandId);
  if (existing) {
    // 异归属自报 ⇒ 不覆盖显示面（与 registerCommand 同一条判据；照旧只动 title/category/when）
    if (meta.pluginId && meta.pluginId !== owner.pluginId) {
      console.error(
        `[CommandRegistry] "${commandId}" 异归属注册被拒——属主: ${owner.pluginId}（${owner.source}），`
        + `新注册者: ${meta.pluginId}——显示面不更新`,
      );
      return owner;
    }
    // 乱序自愈：推定落在先、声明/自报后到 ⇒ 重挂归属（与下面的显示面更新无关，各自独立）
    if (_commandOwners.get(commandId)?.pluginId !== owner.pluginId) _setOwnership(commandId, owner);
    if (meta.title !== undefined) existing.title = meta.title;
    if (meta.category !== undefined) existing.category = meta.category;
    if (meta.when !== undefined) existing.when = meta.when;
    // M1 AI#7：说明与参数同走「有值才覆盖」——池侧重注册不带这两项时不抹掉声明面那份
    if (meta.description !== undefined) existing.description = meta.description;
    if (meta.params !== undefined) existing.params = meta.params;
    return owner;
  }
  // 命令 ID 约定 "pluginId.commandName"——**声明面查不到时才**退回前缀推定（preload-pool unregister 同约定）
  registerCommand(owner.pluginId, {
    id: commandId,
    title: meta.title ?? commandId,
    category: meta.category,
    when: meta.when,
    description: meta.description,
    params: meta.params,
    placeholder: true,
    handler: async () => {
      console.warn(`[CommandRegistry] 命令 "${commandId}" 尚未绑定 handler——池内视图未挂载`);
    },
  }, owner.source);
  _poolRuntimeCommands.add(commandId);
  return owner;
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
  meta: { title?: string; category?: string; when?: string; pluginId?: string; description?: string; params?: LinkDeskCommandParam[] },
): CommandOwnership {
  // E6#111b 判据③（H1 修点）：与 registerPoolCommandMetadata 同一条归属解析（①→②→③）
  const owner = _resolveOwner(
    commandId,
    meta.pluginId ?? inferOwnerFromCommandId(commandId),
    meta.pluginId ? "reported" : "inferred",
  );
  registerCommand(owner.pluginId, {
    id: commandId,
    title: meta.title ?? commandId,
    category: meta.category,
    when: meta.when,
    description: meta.description,
    params: meta.params,
    placeholder: false,
    handler: (...args) => {
      const bridge = window.linkdesk?.commands?._executeShellLocal;
      if (!bridge) return Promise.reject(new Error(`命令 "${commandId}" 壳侧执行桥不可用`));
      return bridge(commandId, ...args);
    },
  }, owner.source);
  return owner;
}

/**
 * 池侧 unregisterCommands 的回传——移除该插件的运行时命令条目。
 * loader 元数据条目保留——插件仍加载，plugin.json 静态声明仍在。
 *
 * E5.8#43-4（③ 归属表维护）：windowId = 注销来源窗口（主进程 sender 解析注入）。
 * 多窗口下同一命令可在多窗注册——注销只摘本窗口归属，他窗仍在注册 → 命令保留（路由仍可达）；
 * 本窗口摘空（或旧路径未带 windowId）→ 整条命令删除（兼容单窗口原语义）。
 */
export function unregisterPoolCommands(pluginId: string, windowId?: string): void {
  // E6#111b 判据⑤（H2 修点）：遍历集按**真归属**取，不按名字前缀——
  // 旧实现 `${pluginId}.` 前缀整片删 ⇒ 借了别人前缀的命令被连带删掉（假借 / 同名双插件同前缀双伤）。
  const owns = (id: string): boolean => _commandOwners.get(id)?.pluginId === pluginId;
  // E5.8#46.14：遍历集 = _poolRuntimeCommands ∪ _poolCommandWindows 键——plugin.json 声明命令
  // 从未入 _poolRuntimeCommands（loader 元数据先注册，registerPoolCommandMetadata existing 分支
  // 直接 return），旧实现漏摘其归属 → 残留旧窗 id → executeInPool origin 亲和误路由到已无 handler
  // 的旧窗 → 「未在池内注册」。摘归属只清本窗口；归属摘空后仅运行时命令整条删 _commands，
  // plugin.json 声明命令由 loader 持有保留（palette 可见性走 when 门控）。
  const ids = new Set<string>();
  for (const id of _poolRuntimeCommands) if (owns(id)) ids.add(id);
  for (const id of _poolCommandWindows.keys()) if (owns(id)) ids.add(id);
  for (const id of ids) {
    if (windowId) {
      const set = _poolCommandWindows.get(id);
      if (set) {
        set.delete(windowId);
        if (set.size > 0) continue; // 他窗口仍注册该命令 → 保留条目（路由仍可达）
      }
    }
    _poolCommandWindows.delete(id);
    if (_poolRuntimeCommands.has(id)) {
      _poolRuntimeCommands.delete(id);
      _commands.delete(id);
      _dropOwnership(id);
    }
  }
}

/**
 * E5.8#43-4（③ 归属表清理）：窗口关闭时壳调——摘除该窗注册的全部命令归属。
 * 池窗销毁无 unregister IPC（池进程没了），若不清理 → 路由仍指向已关窗 → 定向发空视图 → 10s 超时。
 * 某命令最后一扇注册窗关闭 → 整条摘除（命令面板不再显示该幽灵命令，防执行超时）。
 */
export function purgePoolCommandWindows(windowId: string): void {
  for (const [commandId, set] of [..._poolCommandWindows]) {
    set.delete(windowId);
    if (set.size > 0) continue;
    _poolCommandWindows.delete(commandId);
    _poolRuntimeCommands.delete(commandId);
    _commands.delete(commandId);
    _dropOwnership(commandId);
  }
}

/* ── 执行 ── */

/**
 * 执行命令——对标 VS Code executeCommand。
 * Phase 5 盲区 8（P1）：包 try/catch 做错误隔离——一个 buggy 命令不崩命令面板。
 * E6#62e：无壳侧预激活钩（延迟激活轨已退役——插件 JS 统一不壳 import）；占位命令执行走
 * executeInPool 转发池，命令属主插件由池侧 on-command miss 激活（electron/preload-pool/commands.ts）。
 */

/**
 * 执行内核——strict 二择是 M4 `AI#32` 对缺口① 的修法（壳侧回传真结果）：
 *   strict=false（UI 面既有语义，一字未动）：未注册只 warn、handler 抛错只 reportError——
 *     命令面板/菜单/快捷键的调用方不关心失败形态（可见性已由 when 门控）。
 *   strict=true（严格执行出口，命令桥 `commands:execute` 一条缝专用）：未注册 ⇒ 抛、
 *     handler 抛错 ⇒ reportError 后**原样再抛**——桥上的调用方（AI / 池插件 fallback）从此
 *     分辨得了「做了」与「没做」（对标 VS Code：executeCommand 对未知命令本就抛错）。
 * 两条路 reportError 都走——错误服务照记，strict 只是**不再吞掉**，不是少记。
 */

/**
 * 命令桥的**具名实参 → 位置实参**展开（M4 `AI#52`「壳侧宽进」·2026-09-29 用户拍板）。
 *
 * ── 修的是什么 ──
 *   命令元数据 `params[].name` 是**具名**的，而执行面按**位置**透传 ⇒ 外部 AI 照具名对象调用
 *   **静默无效**（`ok=true` 但 handler 只读 `args[0]`、拿到对象当字符串直接跳过）。实证：
 *   `executeCommand("workbench.action.togglePanelViewVisibility", undefined, {containerId, viewId})`
 *   ⇒ `visible` 恒 `true`。⇒ 让**声明面成为唯一真相源**：`params` 的名字从此在执行面**真的可用**。
 *
 * ── 放宽的边界（窄口 —— ⛔ 四条都不展开，越界 = 把合法调用改坏）──
 *   ① 只走**命令桥那条缝**（`executeCommandStrict`，门① / 门③ 共用）——UI 面（面板/菜单/快捷键）
 *      维持纯位置语义，既有行为一字不动；
 *   ② `args` 恰好 **1 个**，且它是**普通对象**（数组 / 字符串 / null 都不算——那些可能就是合法实参）；
 *   ③ 该命令**声明了 ≥2 个 `params`**——arity=1 时「一个对象」本身就是它的合法实参
 *      （`toggleViewVisibility({viewId})` 即此形），展开会产生歧义；
 *   ④ 对象里**至少命中一个**声明名——键名全不匹配 = 调用方传的是自己的载荷对象，原样放行。
 *
 * ── 展开规则 ──
 *   按 `params` **声明顺序**取值（对象键序不参与）、尾部没给的 `undefined` 剪掉（可选实参传不传
 *   等价）。⚠️ 只认 `params[].name`：多出来的键被丢掉——位置调用面本来就看不见它们，属预期。
 *
 * @returns `expanded` = 命中的具名键（调用方/测试可观测；空数组 = 未展开、`args` 原样）
 */
export function expandNamedArgs(
  params: LinkDeskCommandParam[] | undefined,
  args: unknown[],
): { args: unknown[]; expanded: string[] } {
  if (!params || params.length < 2 || args.length !== 1) return { args, expanded: [] };
  const only = args[0];
  if (only === null || typeof only !== 'object' || Array.isArray(only)) return { args, expanded: [] };
  const obj = only as Record<string, unknown>;
  const named = params.filter((p) => Object.prototype.hasOwnProperty.call(obj, p.name));
  if (named.length === 0) return { args, expanded: [] };
  const out: unknown[] = params.map((p) => obj[p.name]);
  while (out.length > 0 && out[out.length - 1] === undefined) out.pop();
  return { args: out, expanded: named.map((p) => p.name) };
}

async function runCommand(commandId: string, args: unknown[], strict: boolean): Promise<unknown> {
  const cmd = _commands.get(commandId);
  if (!cmd) {
    // R3 运行期半条（`docs/…/10-纠正案-共享件转正与归一/05-防复发-机械准入原则.md` §三 R3 配套）：
    // dev 构建把**空转命令**喊到 `error`——菜单项/键位/命令面板指向不存在的命令时当场在控制台现形。
    // 为什么运行期还要这一半：R3 的静态面判不干净**动态注册**的壳命令（`Object.entries(映射表)` 循环注册），
    // 静态面宁可漏报也不假红 ⇒ 漏的那些靠这里在真跑一次时暴露。⛔ 生产一字不变（静默不当噪声——
    // 存量第三方插件里指向不存在命令的项不该在用户机上刷屏）。
    if (process.env.NODE_ENV === "development") {
      console.error(
        `[CommandRegistry] 空转命令（未注册）："${commandId}" —— 菜单项/键位/命令面板指向了没人认领的命令，`
          + `点了或按下去不会有任何反应（R3 门禁的运行期半条）`,
      );
    } else {
      console.warn(`[CommandRegistry] 命令 "${commandId}" 未注册`);
    }
    if (strict) throw new Error(`命令 "${commandId}" 未注册`);
    return undefined;
  }

  // M4 `AI#52`：桥这条缝兼容「单个具名对象」——展开判据与四条边界见 `expandNamedArgs` 头注
  const callArgs = strict ? expandNamedArgs(cmd.params, args).args : args;

  try {
    if (cmd.placeholder) {
      // E5.7 Bug C：占位命令的真实 handler 注册在池 preload 的 _poolCommands。
      // 壳→池转发：events.emit("commands:executeRequest") → 主进程 plugin:push 广播
      // → 池 preload 订阅执行 → invoke("commands:executeResult") → IpcBridgeHandler 回传。
      return await executeInPool(cmd, callArgs);
    }
    // E5.7#63.8：token 在此统一剥除——handler 合同只收 args。
    // 外层 token 参数保留（未来取消语义入口），与池 preload executeCommand
    // 剥 undefined 占位同语义——全仓 handler 样板唯一：(...args)。
    return await cmd.handler(...callArgs);
  } catch (err) {
    reportError({
      message: `命令 "${cmd.title}" 执行出错: ${err instanceof Error ? err.message : String(err)}`,
      source: cmd.category ?? "命令系统",
      error: err,
    });
    if (strict) throw err instanceof Error ? err : new Error(String(err));
    return undefined;
  }
}

export async function executeCommand(
  commandId: string,
  // E5.7#63.8：占位参数——handler 合同已删 token，但调用方仍按旧槽位传 undefined
  // （如 IpcBridgeHandler commands:execute 透传）。槽位保留 = 未来取消语义入口。
  _token?: CancellationToken,
  ...args: unknown[]
): Promise<unknown> {
  return runCommand(commandId, args, false);
}

/**
 * M4 `AI#32`（缺口①）：严格执行——未注册 / handler 抛错都以异常回传，⛔ 不再吞成 undefined。
 * 唯一消费方 = 命令桥（`IpcBridgeHandler/commands.ts` 的 `commands:execute` 缝）；UI 面
 * （面板/菜单/快捷键）继续走 `executeCommand`——那边的调用方靠 when 门控，失败形态无意义。
 */
export async function executeCommandStrict(
  commandId: string,
  _token?: CancellationToken,
  ...args: unknown[]
): Promise<unknown> {
  return runCommand(commandId, args, true);
}

/* ── 壳→池 命令执行转发（E5.7 Bug C）── */

/** 池执行回传等待超时——10 秒无回传视为池侧 handler 卡死/池崩溃 */
const POOL_EXEC_TIMEOUT_MS = 10_000;

interface PoolPendingEntry {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  /** E5.8#43-4（④）：executeRequest 定向发时的目标窗口——executeResult 回执校验只收目标窗口（防模式 B 双执行） */
  targetWindowId?: string;
}

const _poolPending = new Map<string, PoolPendingEntry>();
let _poolRequestSeq = 0;

/**
 * 占位命令转发到池执行。
 * 壳 emit("commands:executeRequest") → 主进程 plugin:push 定向广播 → 池 preload 订阅执行
 * → invoke("commands:executeResult") → IpcBridgeHandler 调 resolvePoolExecution 回传。
 *
 * E5.8#43-4（③ 路由）：origin 亲和优先 → origin 不在注册集 → 归属表唯一注册者 → 全池广播兜底。
 *   originWindowId = 命令调用来源窗口（壳 = 唯一执行发起方 → 恒主窗；§8.6 声明式 origin，声明式数据）。
 *   targetWindowId 进载荷 → 主进程 broadcast 按窗口定向发池（不再全池广播，杜绝模式 B 双执行）。
 *
 * token 不转发——池 handler 不消费 CancellationToken（与 preload-pool 剥离 token 占位同约定）。
 * 无 preload 桥（dev 预览/单测）时回退占位 handler 的诊断 warn——与 E5.7 前行为一致。
 */
async function executeInPool(cmd: Command, args: unknown[], originWindowId = "main"): Promise<unknown> {
  const events = window.linkdesk?.events;
  if (!events?.emit) {
    return cmd.handler(undefined, ...args);
  }
  const requestId = `pool-cmd:${++_poolRequestSeq}`;
  // §8.6 路由：origin 亲和优先 → 归属表唯一注册者 → 兜底广播（targetWindowId 缺省 → 主进程全池广播）
  const registered = _poolCommandWindows.get(cmd.id) ?? new Set<string>();
  let targetWindowId: string | undefined;
  if (registered.has(originWindowId)) {
    targetWindowId = originWindowId;
  } else if (registered.size === 1) {
    targetWindowId = [...registered][0];
  }
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      _poolPending.delete(requestId);
      reject(new Error(`命令 "${cmd.id}" 池内执行超时（${POOL_EXEC_TIMEOUT_MS / 1000} 秒）`));
    }, POOL_EXEC_TIMEOUT_MS);
    _poolPending.set(requestId, { resolve, reject, timer, targetWindowId });
    events.emit("commands:executeRequest", { requestId, commandId: cmd.id, args, targetWindowId });
  });
}

/**
 * 池执行结果回传入口——IpcBridgeHandler 的 "commands:executeResult" 通道调用。
 * 已超时清理的迟到结果直接丢弃（pending 已删）。
 *
 * E5.8#43-4（④ 回执校验）：windowId = 回执来源窗口（主进程 sender 解析注入）。
 *   定向发（pending.targetWindowId 已定）→ 只收目标窗口回执——他窗迟到/双执行回执静默丢弃；
 *   兜底广播（targetWindowId 缺省）→ 任意窗口回执都收（兼容旧路径/单测直调）。
 */
export function resolvePoolExecution(
  requestId: string,
  payload: { result?: unknown; error?: string },
  windowId?: string,
): void {
  const pending = _poolPending.get(requestId);
  if (!pending) return;
  if (pending.targetWindowId && windowId && pending.targetWindowId !== windowId) return;
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
  _commandOwners.clear();
  _poolRuntimeCommands.clear();
  _poolCommandWindows.clear();
  for (const [, pending] of _poolPending) clearTimeout(pending.timer);
  _poolPending.clear();
}
