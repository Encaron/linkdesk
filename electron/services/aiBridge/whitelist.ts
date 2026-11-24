/**
 * AI 接入白名单（M4 `AI#33`）——`linkdeskctl` / MCP 两张皮共用的**语义操作面清单**。
 *
 * ## 白名单的形态（spike `AI#31` 实测有效的结论，照抄不另起炉灶）
 *
 * **操作表每条自带 `help` / `params`，`describe` 操作从同一张表派生**（`opCatalog()` 读同一个
 * 对象）⇒ 清单与真实现**不可能漂移**。这正是「运行期派生，不手抄第二份」（AI#33 判据）。
 *
 * ## 「exec 能执行什么」的白名单也运行期派生
 *
 * `exec` 操作的执行对象 = 壳命令注册表——网关**先查存在性再执行**（缺口① 左半）：
 * 清单经壳既有读取面 `plugins:call "getCommands"`（E3j #74）**每次现取**，不缓存——
 * 插件装上/卸载后命令面跟着变，「挂牌即进名单，桥不为每个新功能升级」（AI#33 生长格判据）。
 * 「handler 真做了没有」由壳侧严格执行出口回传真结果（缺口① 右半，`CommandRegistry.executeCommandStrict`）。
 *
 * ## 错误分类法只留一份
 *
 * 连接面六种（NO_RECORD/SWITCH_OFF/LAST_FAILED/APP_EXITED/REFUSED/EAUTH…）的**客户端**分类
 * 在 `cli/linkdeskctl/lib/bridge-client.mjs`（CLI/MCP/验收三处共用，⛔ 不许 fork）；本文件是
 * **内核侧**的操作级错误（EARGS/EVIEWREQUIRED/ENOTACTIVE/EUNKNOWNCOMMAND/ENOTFOUND/ENOACTION/EUSERDENIED…），经应答的 `code` 字段
 * 原样传给客户端。两层合起来 = spike README 判据③「失败路径有可读原因」的全集。
 *
 * ## 🔴 敏感动作的确认回路（`AI#29`）在本文件的落法
 *
 * **一处执令出口**：`exec` 与 `notifyAction` 都经 `runShellCommand()` 执行壳命令，敏感命令
 * （名单住 `sensitive.ts`，`describe` 的 `askFirst` 自述）在那里统一停下问用户；`install` 走
 * 同一个 `askUser()`。⛔ **别在操作里直接 `ctx.shellRequest(IPC.commands.execute, …)`**——
 * 那就是又开一个没有门的入口。
 */

import { IPC } from '../../ipc/channels.js';
import { pickPendingCommands, settleCommandSurface, type DeclaredCommandSource, type PendingCommand } from './commandSurface.js';
import { coded, POLICY_DENIED, PROTECTED } from './errors.js';
import { askUser } from './sensitive.js';
import type { OpRegistry } from './opRegistry.js';
import { buildActionCard } from './policy/cards.js';
import {
  askFirstCatalog,
  askTextForCommand,
  askTextForOp,
  decide,
  getPolicySnapshot,
  isRisk,
  isUserOnlyCommand,
  POLICY_MODE_LABEL,
  requestElevationFlow,
  riskOfCommand,
  riskOfOp,
} from './policy/index.js';

/** 带 code 的操作错误——构造器本体现在住 `errors.ts`（与 `sensitive.ts` 共用，避免循环 import）。
 *  仍从这里**再导出**：既有调用方（`index.ts` / 单测）认的是这个出口，⛔ 不为搬家改一圈调用方。 */
export { coded };

/** 白清单版本——操作表形状变更时递增（客户端据此判断自省结果的新旧）。
 *  v2（2026-11-25 S6/T11）：新增 `opStatus`（异步相位查询）。 */
export const WHITELIST_VERSION = 2;

/* ── 类型 ── */

export interface BridgeOpParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required?: boolean;
  /** 参数说明（describe / --help 自省面的正文） */
  description?: string;
}

/** 一条操作请求（传输层解耦后的「请求对象」——内核收这个，不收 stdio/TCP） */
type BridgeOpRequest = Record<string, unknown>;

/** 账本条目（AI#43 雏形：先记后判，被拒的也记） */
export interface LedgerEntry {
  ts: string;
  op: string;
  /** 关键实参（exec 的 commandId / install 的 source…）——「对谁做了什么」要查得出来 */
  arg: string | null;
  ok: boolean;
  code: string | null;
  ms: number;
  /** S6/T11：`op.completed` 事件行——异步 op 结算时追加（字段与 `opStatus` 的终态一致） */
  opId?: string;
  commandId?: string;
  state?: "done" | "failed" | "expired";
}

/**
 * 一次请求此刻在**哪条腿**上（AI#60）——相位词汇的**唯一定义处**。
 * `sensitive.ts` 的同名可选参数是**结构型**照抄（它 ⛔ 不 import 本模块，免得成环；见那里的注）。
 */
export type BridgePhase = 'op' | 'shell' | 'ask-user';

/** 内核注入给操作的执行上下文——操作不直接碰 electron / net，只经它说话 */
export interface BridgeOpContext {
  /** 主进程 → 壳渲染进程的一次请求（复用既有 bridge:* 信封，requestId 前缀 `aibridge-`） */
  shellRequest(channel: string, args: unknown[], timeoutMs?: number): Promise<unknown>;
  /** 认人身份（ping 的正文；endpoint 由监听器回填） */
  identity(): Record<string, unknown>;
  /** 操作账（log 操作读） */
  ledgerEntries(): LedgerEntry[];
  /**
   * 相位标记（AI#60，**可选**——老 ctx / 既有假 ctx 不传也不崩）：内核据此对客户端说
   * 「这条请求正在等人点头」。⛔ 由内核实现记（`index.ts` 的 `opContextFor`），操作只声明事实。
   */
  phase?(phase: BridgePhase, what?: string | null): void;
  /** T12：壳版本（`apiVersion` 由壳生成，⛔ 作者手填；可选——假 ctx 不传则 "unknown"） */
  appVersion?(): string;
  /** S6/T11：异步 op 注册表（**可选**——老 ctx/假 ctx 不传；`opStatus` 缺它时如实报不可用） */
  ops?: OpRegistry;
  /** S6/T11：异步 op 结算后追加 `op.completed` 账本行（可选——同批「事件面」；缺它则只有查询面） */
  recordOpCompleted?(entry: { opId: string; commandId: string; state: "done" | "failed"; code: string | null; ms: number }): void;
}

export interface BridgeOp {
  name: string;
  /** 能力类别（AI#38.7 开放范围明细的「读/做」两栏从它派生——⛔ 设置页不手抄第二份） */
  kind: 'read' | 'write';
  /** 一句人读说明——describe / `linkdeskctl --help` 自省面的正文（AI#35 判据的「怎么操作」） */
  help: string;
  params: BridgeOpParam[];
  run(req: BridgeOpRequest, ctx: BridgeOpContext): Promise<unknown>;
}

/* ── 壳读取面（全部是既有面，零新 IPC 通道） ── */

/** 壳命令面现取——`plugins:call "getCommands"`（E3j #74；返回值已剥 handler）。运行期派生白名单的唯一来源 */
async function listShellCommands(ctx: BridgeOpContext): Promise<Array<{ id: string } & Record<string, unknown>>> {
  const list = await ctx.shellRequest(IPC.plugins.call, ['getCommands']);
  return Array.isArray(list) ? (list as Array<{ id: string } & Record<string, unknown>>) : [];
}

/** 插件清单现取——`plugins:call "list"`（既有面；manifest 子集里带 `contributes`）——**声明面**的来源 */
async function listShellPlugins(ctx: BridgeOpContext): Promise<DeclaredCommandSource[]> {
  const list = await ctx.shellRequest(IPC.plugins.call, ['list']);
  return Array.isArray(list) ? (list as DeclaredCommandSource[]) : [];
}

/**
 * 「已声明、未注册」的命令（生长格 `AI#54` ①）——`describe.commandsPending` 的正文。
 * 传入的 `registered` 用调用方手上那份（describe 刚取过的命令面），⛔ 别为它再取一次。
 */
async function listPendingCommands(
  ctx: BridgeOpContext,
  registered: readonly { id?: unknown }[],
): Promise<PendingCommand[]> {
  return pickPendingCommands(await listShellPlugins(ctx), registered);
}

/** 通知 DTO 里按 id 找条目（NotifLayout.groups[].items[].id，poolLayout.ts） */
function findNotifItem(layout: unknown, notificationId: string): { actions: Array<{ label: string; command?: string; args?: unknown[] }> } | null {
  const groups = (layout as { groups?: Array<{ items?: unknown[] }> })?.groups;
  if (!Array.isArray(groups)) return null;
  for (const g of groups) {
    for (const item of Array.isArray(g.items) ? g.items : []) {
      if (item && typeof item === 'object' && (item as { id?: string }).id === notificationId) {
        return item as { actions: Array<{ label: string; command?: string; args?: unknown[] }> };
      }
    }
  }
  return null;
}

/** 以 tabId 为首参的命令——确认卡要显示「哪个标签页」，而不是一串 id */
const TAB_TARGET_COMMANDS = new Set([
  'core.closeTab',
  'core.closeOtherTabs',
  'core.closeRightTabs',
  'core.duplicateTab',
  'core.togglePin',
  'core.splitRight',
  'core.splitDown',
  'core.openInNewWindow',
  'core.mergeBackToMain',
]);

/**
 * 解析确认卡的作用对象（标签页标题）。
 * 🔴 只读一次 `listTabs`，失败就退回「标签页」——⛔ 不因为查不到标题就不弹卡。
 */
async function resolveCommandTarget(
  ctx: BridgeOpContext,
  commandId: string,
  args: unknown[],
): Promise<{ title?: string; metaKey?: string; icon?: string } | undefined> {
  if (!TAB_TARGET_COMMANDS.has(commandId)) return undefined;
  const first = args[0];
  const tabId =
    first && typeof first === 'object' ? (first as { tabId?: unknown }).tabId : undefined;
  if (typeof tabId !== 'string' || !tabId) return undefined;
  try {
    const snap = (await ctx.shellRequest(IPC.plugins.call, ['listTabs'])) as {
      windows?: { groups?: { tabs?: { id?: unknown; title?: unknown }[] }[] }[];
    };
    const tabs = (snap?.windows ?? []).flatMap((w) => (w.groups ?? []).flatMap((g) => g.tabs ?? []));
    const tab = tabs.find((t) => t.id === tabId);
    const title = tab && typeof tab.title === 'string' ? tab.title : undefined;
    return { ...(title ? { title } : {}), metaKey: '标签页', icon: '▤' };
  } catch {
    return { metaKey: '标签页', icon: '▤' };
  }
}

/** 档位不允许时的统一话术——告诉 AI「可请求提权」，⛔ 别让它原样重试 */
function policyDenied(mode: string, risk: string, target: string): Error & { code: string } {
  return coded(
    POLICY_DENIED,
    `当前权限「${POLICY_MODE_LABEL[mode as keyof typeof POLICY_MODE_LABEL] ?? mode}」不允许${target}（风险 ${risk}）`
      + '——可调 requestElevation 说明理由请求用户提高权限（CLI: linkdeskctl request-elevation <mode> <reason>；MCP: linkdesk_request_elevation）；批准后再重试原动作一次；⛔ 不要原样重试',
  );
}

/**
 * 执行壳命令的**唯一出口**（AI#29 ＋ 档位策略闸）——`exec` 与 `notifyAction` 两条路都从这里过。
 *
 * 🔴 收口的原因（此前是两条各写一遍的 `ctx.shellRequest(IPC.commands.execute, …)`）：
 *   敏感动作的确认**按目标命令判**，而「谁在执行命令」有两处 ⇒ 只给其中一处加门 =
 *   另一处是敞开的（实测：`exec update.openUpdateFlow` 曾可无声重启并装新版本）。
 *
 * 判序（⛔ 顺序本身是判据）：
 *   ① **L2 命令锁**：`userOnly` ⇒ `EPROTECTED`（元数据为准；AI 正门永远够不着）；
 *   ② **档位**：`decide(mode, risk)` ⇒ `deny` 抛 `EPOLICYDENIED` / `ask` 弹唯一确认框 / `allow` 直通；
 *   ③ 执行。
 */
async function runShellCommand(
  ctx: BridgeOpContext,
  commandId: string,
  args: unknown[],
  knownCommands?: readonly { id?: unknown; userOnly?: unknown }[],
  asyncDeclared = false,
): Promise<unknown> {
  const commands = knownCommands ?? (await listShellCommands(ctx));
  if (isUserOnlyCommand(commands, commandId)) {
    throw coded(
      PROTECTED,
      `命令「${commandId}」只允许用户操作（userOnly）——AI 永远不可调；请提示用户去设置页操作，⛔ 不要重试`,
    );
  }
  // 风险来源（S7）：壳命令 → 壳内建表；插件命令 → 只认 manifest 声明；均无 → R2 兜底。
  // 归属来自 getCommands DTO 的 shellOwned（属主不是任何已装插件 = 壳）；壳表 ⛔ 覆盖插件声明（见 riskOfCommand）
  const entry = commands.find((c) => c && c.id === commandId) as { risk?: unknown; shellOwned?: unknown } | undefined;
  const shellOwned = entry?.shellOwned === true;
  const { risk } = riskOfCommand(commandId, shellOwned, isRisk(entry?.risk) ? entry.risk : undefined);
  const snapshot = getPolicySnapshot();
  const decision = decide(snapshot.mode, risk);
  if (decision === 'deny') throw policyDenied(snapshot.mode, risk, `执行「${commandId}」`);
  if (decision === 'ask') {
    // 确认卡：动作名取风险表的 what（未登记才退回命令标题），作用对象由命令参数解析。
    // ⛔ 不把命令 id 塞进人眼；id 只进账本。
    const text = askTextForCommand(commandId);
    const title = (commands.find((c) => c && c.id === commandId) as { title?: unknown } | undefined)?.title;
    const what = text.what ?? (typeof title === 'string' && title ? title : '执行操作');
    const target = await resolveCommandTarget(ctx, commandId, args);
    await askUser(ctx, what, buildActionCard(what, text.why, risk, target));
  }
  const executeOnce = () => ctx.shellRequest(IPC.commands.execute, [commandId, undefined, ...args]);
  // S6/T11（A 案 · 声明式）：async 命令 ⇒ 本请求立即回 pending+opId，真实执行在后台跑、结算写注册表。
  // 🔴 顺序铁律：档位判定与用户确认**都在上面同步走完**才允许回 pending——⛔ 先回 pending 再弹框
  //   （那样 AI 会以为「已在跑」，而用户其实还没点头）。
  if (asyncDeclared && ctx.ops) {
    const reg = ctx.ops;
    const { opId, startedAt } = reg.start();
    const t0 = Date.now();
    void executeOnce().then(
      (r) => {
        reg.settle(opId, r === undefined ? null : r);
        ctx.recordOpCompleted?.({ opId, commandId, state: "done", code: null, ms: Date.now() - t0 });
      },
      (e: unknown) => {
        const err = e as { code?: unknown; message?: unknown; hint?: unknown };
        const code = typeof err?.code === "string" && err.code ? err.code : "EERROR";
        const message = typeof err?.message === "string" && err.message ? err.message : String(e);
        reg.fail(opId, { code, message, ...(typeof err?.hint === "string" && err.hint ? { hint: err.hint } : {}) });
        ctx.recordOpCompleted?.({ opId, commandId, state: "failed", code, ms: Date.now() - t0 });
      },
    );
    return { pending: true, opId, startedAt };
  }
  try {
    return await executeOnce();
  } catch (e) {
    // S4/T8：视图在场与否决定「能不能执行」——池侧 miss（视图未挂载 / 入口没认领）按注册的 activation 判码。
    // 池侧 canonical 错误串 = preload-pool executeLocal 的「未在池内注册」（同笔钉在单测里，⛔ 两边各改一边）。
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === `命令 "${commandId}" 未在池内注册`) {
      const poolEntry = commands.find((c) => c && c.id === commandId) as { activation?: unknown; pluginId?: unknown } | undefined;
      if (poolEntry?.activation === "view") {
        throw coded(
          "EVIEWREQUIRED",
          `命令 "${commandId}" 需要视图在场（activation=view），当前未挂载——先 open-tab ${poolEntry.pluginId ?? "对应插件"}，再重试`,
        );
      }
      throw coded("ENOTACTIVE", `命令 "${commandId}" 的入口未注册 handler（插件未启用或加载失败）——查看插件管理器`);
    }
    throw e;
  }
}

/**
 * S7/T4：命令面每条带上 `risk` ＋ `riskSource`（shell/declared/fallback）——纯函数（描述面组装，测试直打）。
 * AI 动手前就能预测「这条会不会被问」；⛔ 不在这里改任何判定。
 */
export function surfaceCommandRisks(
  commands: Array<{ id: string } & Record<string, unknown>>,
): Array<{ id: string } & Record<string, unknown>> {
  return commands.map((c) => {
    const ownerEntry = c as { risk?: unknown; shellOwned?: unknown };
    const shellOwned = ownerEntry.shellOwned === true;
    const declared = isRisk(ownerEntry.risk) ? ownerEntry.risk : undefined;
    const { risk, source } = riskOfCommand(c.id, shellOwned, declared);
    return { ...c, risk, riskSource: source };
  });
}

/**
 * S3a/T15：描述面的**筛选 ＋ 分页**（纯函数，测试直打）。
 * 🔴 归一化铁律（04 §二）：filter/limit/cursor 的**唯一实现**住这里——⛔ CLI/MCP/插件各写一份过滤。
 * 缺省（无 filter/limit/cursor）⇒ **原样全量**（与旧行为逐字节一致，⛔ 破坏兼容）。
 * 游标不透明：`c_` ＋ base64url({o, sig})；`sig` = 筛选条件的稳定指纹，换筛选必须换游标（否则 EARGS）。
 */
export function pageCommands<T extends { id: string; title?: unknown; description?: unknown; category?: unknown; pluginId?: unknown }>(
  commands: readonly T[],
  req: { filter?: unknown; limit?: unknown; cursor?: unknown },
): { commands: T[]; total: number; nextCursor: string | null } {
  const filter = req.filter && typeof req.filter === "object" ? (req.filter as Record<string, unknown>) : {};
  const pid = typeof filter.pluginId === "string" && filter.pluginId ? filter.pluginId : null;
  const cat = typeof filter.category === "string" && filter.category ? filter.category : null;
  const q = typeof filter.query === "string" && filter.query ? filter.query.toLowerCase() : null;

  const matched = commands.filter((c) => {
    if (!c || typeof c.id !== "string") return false;
    if (pid && c.pluginId !== pid) return false;
    if (cat && c.category !== cat) return false;
    if (q) {
      const hay = `${c.id}\n${typeof c.title === "string" ? c.title : ""}\n${typeof c.description === "string" ? c.description : ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sig = JSON.stringify([pid, cat, q]);
  const limitRaw = Number(req.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : null;

  let offset = 0;
  if (typeof req.cursor === "string" && req.cursor) {
    if (!req.cursor.startsWith("c_")) throw coded("EARGS", `游标不合法（"${req.cursor}"）——用上一次回执里的 nextCursor，⛔ 自己构造`);
    let decoded: { o?: unknown; sig?: unknown } | null = null;
    try {
      decoded = JSON.parse(Buffer.from(req.cursor.slice(2), "base64url").toString("utf8")) as { o?: unknown; sig?: unknown };
    } catch {
      throw coded("EARGS", "游标解不开——它是不透明串，⛔ 自己构造；用上次回执的 nextCursor");
    }
    if (!decoded || typeof decoded.o !== "number" || decoded.o < 0) throw coded("EARGS", "游标解不开——用上次回执的 nextCursor");
    if (decoded.sig !== sig) throw coded("EARGS", "游标与筛选条件不匹配——换了 filter 就要从第一页重新开始（不带 cursor）");
    offset = Math.floor(decoded.o);
  }

  const end = limit ? offset + limit : matched.length;
  const page = matched.slice(offset, end);
  const nextCursor = end < matched.length ? `c_${Buffer.from(JSON.stringify({ o: end, sig })).toString("base64url")}` : null;
  return { commands: page, total: matched.length, nextCursor };
}

/* ── 操作表（本文件唯一的手写正文；describe 从它派生） ── */

export const OPS: Record<string, BridgeOp> = {
  describe: {
    name: 'describe',
    kind: 'read',
    help: '自查：本实例支持的操作（白名单）＋ 可执行的命令面（运行期派生）——零源码环境 AI 的自举点。命令面可筛选/分页（filter.pluginId/category/query ＋ limit ＋ cursor，全部可选；不给 = 全量，与旧行为一致）；响应带 total/nextCursor——⛔ 别把这里的 cursor 当串口 readSince 的 since 用（同名不同义）',
    params: [
      { name: 'filter', type: 'object', required: false, description: '{ pluginId?, category?, query? }——query 对 id/title/description 做子串匹配' },
      { name: 'limit', type: 'number', required: false, description: '每页条数（缺省 = 不分页，全量）' },
      { name: 'cursor', type: 'string', required: false, description: '上一页回执里的 nextCursor（不透明；换 filter 必须从第一页重新开始）' },
    ],
    run: async (req, ctx) => {
      const commands = await listShellCommands(ctx);
      const surfaced = surfaceCommandRisks(commands);
      const page = pageCommands(surfaced, { filter: req.filter, limit: req.limit, cursor: req.cursor });
      return {
        whitelistVersion: WHITELIST_VERSION,
        // S3b/T12：契约面版本——**壳统一生成**（⛔ 作者手填）：壳版本 ＋ 命令面结构修订号。
        // contracts 包版本运行期不可读（打包后不在盘），故用 whitelistVersion 作「命令面结构版本」。
        apiVersion: `linkdesk/${ctx.appVersion?.() ?? "unknown"}+bridge${WHITELIST_VERSION}`,
        ops: opCatalog(),
        commands: page.commands,
        commandCount: page.commands.length,
        total: page.total,
        nextCursor: page.nextCursor,
        // AI#54 ①：**声明面**——已声明（`contributes.commands`）而运行期未注册的命令（多为视图态：
        // 该插件的视图挂载后才注册）。给 AI 的是**可发现性**：能规划下一步（先 open-tab），
        // ⛔ 不是执行面——`exec` 只认上面那份 commands。
        commandsPending: await listPendingCommands(ctx, commands),
        // AI#29：哪些动作会先停下等人点头——**自述面**（AI 动手前就知道，客户端据此定等待预算）
        askFirst: askFirstCatalog(),
        // AI 权限档位（只读自述）：AI 动手前就知道自己现在能做什么
        policy: (() => {
          const s = getPolicySnapshot();
          return { mode: s.mode, degraded: s.degraded };
        })(),
      };
    },
  },

  ping: {
    name: 'ping',
    kind: 'read',
    help: '认人：谁在服务（pid / 通道 / 版本 / 已跑多久）＋ 在办请求的相位（还在跑 / 正等人点头）——客户端每次调用先 ping 并把应答 pid 与记录对齐',
    params: [],
    run: async (_req, ctx) => ctx.identity(),
  },

  tabs: {
    name: 'tabs',
    kind: 'read',
    help: '读标签快照（经壳读取面 plugins:call "listTabs"——壳是标签权威，无第二份）',
    params: [],
    run: async (_req, ctx) => ctx.shellRequest(IPC.plugins.call, ['listTabs']),
  },

  openTab: {
    name: 'openTab',
    kind: 'write',
    help: '开一个标签页（经壳 tabs:create 通道——插件调壳的同一张缝；结果经 tabs 操作回读确认）',
    params: [
      { name: 'type', type: 'string', required: true, description: '标签类型（视图/插件 id，如 app）' },
      { name: 'opts', type: 'object', required: false, description: '透传给视图的选项' },
    ],
    run: async (req, ctx) => {
      const type = req.type;
      if (typeof type !== 'string' || !type) throw coded('EARGS', 'openTab 需要 type（非空 string）');
      // 档位闸（与 exec / install 同一个 decide）——此前这个入口漏了，read/ask 档可直接开标签
      const snapshot = getPolicySnapshot();
      const risk = riskOfOp('openTab', 'write');
      const decision = decide(snapshot.mode, risk);
      if (decision === 'deny') throw policyDenied(snapshot.mode, risk, '打开标签页');
      if (decision === 'ask') {
        const text = askTextForOp('openTab');
        await askUser(
          ctx,
          text.what ?? '打开标签页',
          buildActionCard(text.what ?? '打开标签页', text.why, risk, { title: type, metaKey: '标签页' }),
        );
      }
      const opts = req.opts && typeof req.opts === 'object' ? req.opts : undefined;
      // 开之前的命令面——用来算「这一开新挂牌了哪些命令」
      const before = (await listShellCommands(ctx)).map((c) => c.id);
      await ctx.shellRequest(IPC.tabs.create, [type, opts]);
      // tabs:create 是 fire 型（壳收到即 emit tab:create）——「开没开成」用 tabs 操作回读，不在这装成功。
      // 🔴 但**命令面的落定要等**（AI#54 ②）：池侧挂载 → 插件注册 → `commands:register` 回传是随后的
      // 异步链，不等就会在 open-tab 与「新命令可用」之间留一段竞态空窗（AI 紧接着 exec 撞 EUNKNOWN）。
      const settled = await settleCommandSurface(
        async () => (await listShellCommands(ctx)).map((c) => c.id),
        before,
      );
      return { accepted: true, type, added: settled.added, commandsSettled: settled.settled };
    },
  },

  exec: {
    name: 'exec',
    kind: 'write',
    help: '执行壳命令（能执行的 = describe 的 commands 清单里那些；严格回传真结果——做了/没做可分辨）。注意：describe 的 askFirst.commands 里的敏感命令会先在软件里弹确认框，用户不点头 = EUSERDENIED、不执行；当前权限档位不允许 = EPOLICYDENIED（用 requestElevation 说明理由请求用户提权；CLI 子命令 request-elevation，MCP 工具 linkdesk_request_elevation；批准后再重试一次，别原样硬重试）；命令被标 userOnly = EPROTECTED（只能由用户在界面上操作）。实参两种写法等价：**逐位平铺**（`args: [a, b]`）或**一个具名对象**（`{ 参数名: 值 }`——键名照 describe 里该命令的 `params[].name`，≥2 个参数时壳侧按声明顺序展开）',
    params: [
      { name: 'commandId', type: 'string', required: true, description: '命令 id（如 app.openAiManual）' },
      { name: 'args', type: 'array', required: false, description: '透传给命令的实参（逐位平铺，或一个具名对象——键名照该命令的 params[].name）' },
    ],
    run: async (req, ctx) => {
      const commandId = req.commandId;
      if (typeof commandId !== 'string' || !commandId) throw coded('EARGS', 'exec 需要 commandId（非空 string）');
      const extra = Array.isArray(req.args) ? req.args : [];
      // 缺口① 左半：先查存在性——白名单 = 运行期派生的命令面，现取不缓存（AI#33 判据）
      const commands = await listShellCommands(ctx);
      const surfaceEntry = commands.find((c) => c && c.id === commandId) as { activation?: unknown; pluginId?: unknown } | undefined;
      if (!surfaceEntry) {
        // S4/T8：失败必须可判读——三码由本处**一处**映射（⛔ CLI/MCP/插件各拼一份）：
        //   · 声明了未注册且是视图态 ⇒ EVIEWREQUIRED（先 open-tab）；
        //   · 声明了未注册（入口没认领）⇒ ENOTACTIVE（插件未启用 / 入口加载失败）；
        //   · 连声明都没有 ⇒ EUNKNOWNCOMMAND（跑 describe 看可用面）。
        const pending = (await listPendingCommands(ctx, commands)).find((p) => p.id === commandId);
        if (pending) {
          if (pending.activation === "view") {
            throw coded(
              'EVIEWREQUIRED',
              `命令 "${commandId}" 是视图态命令（插件 "${pending.pluginId}"），视图不在场——先 open-tab ${pending.pluginId}，再重试`,
            );
          }
          throw coded(
            'ENOTACTIVE',
            `命令 "${commandId}" 已由插件 "${pending.pluginId}" 声明，但运行期无人认领——插件未启用或入口加载失败，查看插件管理器`,
          );
        }
        throw coded('EUNKNOWNCOMMAND', `命令 "${commandId}" 不存在——跑 describe 看可用面（当前命令面 ${commands.length} 条）`);
      }
      // 缺口① 右半：壳侧严格执行出口回传真结果（未注册/抛错都会以 {error} 信封回来）。
      // 🔴 存在性查过**之后**才问一声：对一条不存在的命令弹确认框只是骚扰。
      // AI#29：敏感命令由 runShellCommand 统一拦下问用户——⛔ 别绕开它直接 shellRequest。
      // 命令面刚取过 → 传进去复用（userOnly 判定与存在性检查同一份数据，不付第二次 IPC）。
      // S6：async 声明来自命令条目（manifest / 池注册 meta 的运行期真值）
      const result = await runShellCommand(ctx, commandId, extra, commands, (surfaceEntry as { async?: unknown }).async === true);
      // S6：异步回执直接抬到顶层（⛔ 塞进 result 再包一层）
      if (result && typeof result === "object" && (result as { pending?: unknown }).pending === true) {
        return { commandId, ...(result as Record<string, unknown>) };
      }
      return { commandId, result: result === undefined ? null : result };
    },
  },

  requestElevation: {
    name: 'requestElevation',
    kind: 'write',
    help: '请求用户提高 AI 权限档位（只是**请求**：软件里弹提权框，用户点「允许」才生效、且常驻到用户自己改回；AI 没有任何「自己批准」的通道）。被 EPOLICYDENIED 拒绝后用它说明理由，不要原样重试',
    params: [
      { name: 'mode', type: 'string', required: true, description: '目标档（read|ask|auto|full；只能比当前档高）' },
      { name: 'reason', type: 'string', required: true, description: '为什么需要更高权限（这句话会显示给用户）' },
      { name: 'scope', type: 'object', required: false, description: '预留：命令/风险级范围（本版不解释）' },
    ],
    run: async (req, ctx) => requestElevationFlow(ctx, { mode: req.mode, reason: req.reason, scope: req.scope }),
  },

  install: {
    name: 'install',
    kind: 'write',
    help: '安装插件（zip 包 URL 或本地路径）——确认对话框在软件里弹出，用户点头才装（装 = 问一声，不绕确认回路）；用户不点头 = EUSERDENIED、不装',
    params: [
      { name: 'source', type: 'string', required: true, description: '插件包 URL（…linkdesk-plugin / zip）或本地路径' },
    ],
    run: async (req, ctx) => {
      const source = req.source;
      if (typeof source !== 'string' || !source) throw coded('EARGS', 'install 需要 source（URL 或本地路径）');
      // 档位闸（与 exec / notifyAction 同一个 `decide`）：R3 ⇒ `ask` 档与 `auto` 档都要问（D9），
      // `read` 档直接拒，`full` 档不问但账本照记。
      const snapshot = getPolicySnapshot();
      const risk = riskOfOp('install', 'write');
      const decision = decide(snapshot.mode, risk);
      if (decision === 'deny') throw policyDenied(snapshot.mode, risk, '安装插件');
      if (decision === 'ask') {
        // 问一声：走**统一确认回路**（`sensitive.ts` 的 askUser——AI 侧唯一弹框出口），
        // 文案取自风险登记表本身（⛔ 不在此手抄第二份 what/why）。
        // 用户可能在走开，等 10 分钟不算长；没点头 ⇒ EUSERDENIED 上抛（⛔ 不再返回
        // `{installed:false}` 那种「账面无错、其实没装」的形状——AI#29 把会话 8 记下的瑕疵一并修掉）。
        const text = askTextForOp('install');
        await askUser(ctx, text.what ?? '安装插件', `${source}${text.why ? `\n（问一声的原因：${text.why}）` : ''}`);
      }
      // installWithProgress = 下载→解压→加载的完整 job（时长由网络决定）——同样放宽超时
      const job = await ctx.shellRequest(
        IPC.plugins.call,
        ['installWithProgress', source, { origin: 'user', ledgerSource: 'user' }],
        600_000,
      );
      return { installed: true, job };
    },
  },

  notifications: {
    name: 'notifications',
    kind: 'read',
    help: '读通知面板（经壳读取面 plugins:call "listNotifications"——按钮的 command 事实随行）',
    params: [],
    run: async (_req, ctx) => ctx.shellRequest(IPC.plugins.call, ['listNotifications']),
  },

  notifyAction: {
    name: 'notifyAction',
    kind: 'write',
    help: '执行通知上的按钮（按钮 = 命令——按 command/args 走 commands.execute，与手点同一条命令路径）。注意：按钮背后是敏感命令时同样要用户点头',
    params: [
      { name: 'notificationId', type: 'string', required: true, description: '通知 id（notifications 操作的返回里有）' },
      { name: 'action', type: 'string', required: true, description: '按钮 label 或序号（从 0 起）' },
    ],
    run: async (req, ctx) => {
      const notificationId = req.notificationId;
      const actionSel = req.action;
      if (typeof notificationId !== 'string' || !notificationId) throw coded('EARGS', 'notifyAction 需要 notificationId（非空 string）');
      if (typeof actionSel !== 'string' && typeof actionSel !== 'number') throw coded('EARGS', 'notifyAction 需要 action（label 或序号）');
      const layout = await ctx.shellRequest(IPC.plugins.call, ['listNotifications']);
      const item = findNotifItem(layout, notificationId);
      if (!item) throw coded('ENOTFOUND', `通知 "${notificationId}" 不在当前通知面板——notifications 操作可列出全部`);
      const actions = Array.isArray(item.actions) ? item.actions : [];
      const idx = typeof actionSel === 'number' ? actionSel : actions.findIndex((a) => a.label === actionSel);
      const action = idx >= 0 ? actions[idx] : undefined;
      if (!action) {
        throw coded('ENOTFOUND', `按钮 "${actionSel}" 不在该通知上（现有 ${actions.length} 个：${actions.map((a) => a.label).join('、') || '无'}）`);
      }
      if (!action.command) {
        throw coded('ENOACTION', `按钮「${action.label}」没有绑定命令（点击仅关闭通知）——无法远程执行`);
      }
      // AI#29：按钮背后是哪条命令**只有读到这里才知道** ⇒ 敏感性只能在此判，故与 exec 共用同一条出口
      const result = await runShellCommand(ctx, action.command, action.args ?? []);
      return { pressed: true, notificationId, action: action.label, command: action.command, result: result === undefined ? null : result };
    },
  },

  opStatus: {
    name: 'opStatus',
    kind: 'read',
    help: '查异步命令的相位（S6）：exec 回 pending+opId 之后，用 opId 读 running/done/failed/expired——⛔ 别干等、⛔ 别重试同一条命令（重试 = 同一个动作做两遍）。过期（默认 10 分钟）回 EOPEXPIRED',
    params: [
      { name: 'opId', type: 'string', required: true, description: 'exec 回执里的 opId（不透明，⛔ 别解析）' },
    ],
    run: async (req, ctx) => {
      const opId = req.opId;
      if (typeof opId !== 'string' || !opId) throw coded('EARGS', 'opStatus 需要 opId（非空 string）');
      const reg = ctx.ops;
      if (!reg) throw coded('EERROR', '本实例未装配 op 注册表（老内核）——升级软件后可用');
      const view = reg.status(opId);
      if (!view) throw coded('ENOTFOUND', `没有这个 opId（"${opId}"）——op 只在内存里活 10 分钟；⛔ 猜 id`);
      if (view.state === 'expired') {
        throw coded('EOPEXPIRED', `op "${opId}" 已过期（op 结果只保留 10 分钟）——效果请用读数面核实（log / tabs / 插件状态命令），⛔ 别重试原命令`);
      }
      return view;
    },
  },

  log: {
    name: 'log',
    kind: 'read',
    help: '读最近操作账（正门三件套之「账本」的读取面；先记后判——被拒的调用也在账上）',
    params: [
      { name: 'limit', type: 'number', required: false, description: '返回最近几条（默认 20）' },
    ],
    run: async (req, ctx) => {
      const limitRaw = Number(req.limit);
      const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 20;
      const entries = ctx.ledgerEntries();
      return { count: entries.length, entries: entries.slice(-limit) };
    },
  },
};

/** 从 `OPS` **派生**（不手抄）——改表即改清单，改不到两处。AI#33 判据的机械保证。 */
export function opCatalog(): Array<{ name: string; kind: 'read' | 'write'; help: string; params: BridgeOpParam[] }> {
  return Object.values(OPS).map((op) => ({ name: op.name, kind: op.kind, help: op.help, params: op.params }));
}
