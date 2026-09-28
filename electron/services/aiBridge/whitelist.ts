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
 * **内核侧**的操作级错误（EARGS/EUNKNOWN/ENOTFOUND/ENOACTION/EUSERDENIED…），经应答的 `code` 字段
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
import { coded } from './errors.js';
import { askFirstCatalog, askFirstRuleForCommand, askFirstRuleForOp, askUser } from './sensitive.js';

/** 带 code 的操作错误——构造器本体现在住 `errors.ts`（与 `sensitive.ts` 共用，避免循环 import）。
 *  仍从这里**再导出**：既有调用方（`index.ts` / 单测）认的是这个出口，⛔ 不为搬家改一圈调用方。 */
export { coded };

/** 白清单版本——操作表形状变更时递增（客户端据此判断自省结果的新旧）。 */
export const WHITELIST_VERSION = 1;

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
}

/** 内核注入给操作的执行上下文——操作不直接碰 electron / net，只经它说话 */
export interface BridgeOpContext {
  /** 主进程 → 壳渲染进程的一次请求（复用既有 bridge:* 信封，requestId 前缀 `aibridge-`） */
  shellRequest(channel: string, args: unknown[], timeoutMs?: number): Promise<unknown>;
  /** 认人身份（ping 的正文；endpoint 由监听器回填） */
  identity(): Record<string, unknown>;
  /** 操作账（log 操作读） */
  ledgerEntries(): LedgerEntry[];
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

/**
 * 执行壳命令的**唯一出口**（AI#29）——`exec` 与 `notifyAction` 两条路都从这里过。
 *
 * 🔴 收口的原因（此前是两条各写一遍的 `ctx.shellRequest(IPC.commands.execute, …)`）：
 *   敏感动作的确认**按目标命令判**，而「谁在执行命令」有两处 ⇒ 只给其中一处加门 =
 *   另一处是敞开的（实测：`exec update.openUpdateFlow` 曾可无声重启并装新版本）。
 *   收成一个函数后，「有没有门」不再取决于将来谁又写了一个执行入口。
 */
async function runShellCommand(ctx: BridgeOpContext, commandId: string, args: unknown[]): Promise<unknown> {
  const rule = askFirstRuleForCommand(commandId);
  if (rule) await askUser(ctx, `执行敏感命令「${rule.id}」`, `${rule.what}\n（问一声的原因：${rule.why}）`);
  return ctx.shellRequest(IPC.commands.execute, [commandId, undefined, ...args]);
}

/* ── 操作表（本文件唯一的手写正文；describe 从它派生） ── */

export const OPS: Record<string, BridgeOp> = {
  describe: {
    name: 'describe',
    kind: 'read',
    help: '自查：本实例支持的操作（白名单）＋ 可执行的命令面（运行期派生）——零源码环境 AI 的自举点',
    params: [],
    run: async (_req, ctx) => {
      const commands = await listShellCommands(ctx);
      return {
        whitelistVersion: WHITELIST_VERSION,
        ops: opCatalog(),
        commands,
        commandCount: commands.length,
        // AI#29：哪些动作会先停下等人点头——**自述面**（AI 动手前就知道，客户端据此定等待预算）
        askFirst: askFirstCatalog(),
      };
    },
  },

  ping: {
    name: 'ping',
    kind: 'read',
    help: '认人：谁在服务（pid / 通道 / 版本 / 已跑多久）——客户端每次调用先 ping 并把应答 pid 与记录对齐',
    params: [],
    run: async (_req, ctx) => ctx.identity(),
  },

  tabs: {
    name: 'tabs',
    kind: 'read',
    help: '读标签快照（经壳读取面 plugins:call "listTabs"——M1 AI#3；壳是标签权威，无第二份）',
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
      const opts = req.opts && typeof req.opts === 'object' ? req.opts : undefined;
      await ctx.shellRequest(IPC.tabs.create, [type, opts]);
      // tabs:create 是 fire 型（壳收到即 emit tab:create）——「开没开成」用 tabs 操作回读，不在这装成功
      return { accepted: true, type };
    },
  },

  exec: {
    name: 'exec',
    kind: 'write',
    help: '执行壳命令（能执行的 = describe 的 commands 清单里那些；严格回传真结果——做了/没做可分辨）。⚠️ describe 的 askFirst.commands 里的敏感命令会先在软件里弹确认框，用户不点头 = EUSERDENIED、不执行',
    params: [
      { name: 'commandId', type: 'string', required: true, description: '命令 id（如 app.openAiManual）' },
      { name: 'args', type: 'array', required: false, description: '透传给命令的实参' },
    ],
    run: async (req, ctx) => {
      const commandId = req.commandId;
      if (typeof commandId !== 'string' || !commandId) throw coded('EARGS', 'exec 需要 commandId（非空 string）');
      const extra = Array.isArray(req.args) ? req.args : [];
      // 缺口① 左半：先查存在性——白名单 = 运行期派生的命令面，现取不缓存（AI#33 判据）
      const commands = await listShellCommands(ctx);
      if (!commands.some((c) => c && c.id === commandId)) {
        throw coded(
          'EUNKNOWN',
          `命令 "${commandId}" 不在当前命令面（运行期派生白名单，共 ${commands.length} 条）——describe 可列出全部`,
        );
      }
      // 缺口① 右半：壳侧严格执行出口回传真结果（未注册/抛错都会以 {error} 信封回来）。
      // 🔴 存在性查过**之后**才问一声：对一条不存在的命令弹确认框只是骚扰。
      // AI#29：敏感命令由 runShellCommand 统一拦下问用户——⛔ 别绕开它直接 shellRequest。
      const result = await runShellCommand(ctx, commandId, extra);
      return { commandId, result: result === undefined ? null : result };
    },
  },

  install: {
    name: 'install',
    kind: 'write',
    help: '安装插件（zip 包 URL 或本地路径）——确认对话框在软件里弹出，用户点头才装（装 = 问一声，AI#29；⛔ 不绕确认回路）；用户不点头 = EUSERDENIED、不装',
    params: [
      { name: 'source', type: 'string', required: true, description: '插件包 URL（…linkdesk-plugin / zip）或本地路径' },
    ],
    run: async (req, ctx) => {
      const source = req.source;
      if (typeof source !== 'string' || !source) throw coded('EARGS', 'install 需要 source（URL 或本地路径）');
      // 问一声：走**统一确认回路**（`sensitive.ts` 的 askUser——AI 侧唯一弹框出口），
      // 文案取自名单表本身（⛔ 不在此手抄第二份 what/why）。
      // 用户可能在走开，等 10 分钟不算长；没点头 ⇒ EUSERDENIED 上抛（⛔ 不再返回
      // `{installed:false}` 那种「账面无错、其实没装」的形状——AI#29 把会话 8 记下的瑕疵一并修掉）。
      const askRule = askFirstRuleForOp('install');
      if (askRule) await askUser(ctx, askRule.what, `${source}\n（问一声的原因：${askRule.why}）`);
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
    help: '读通知面板（经壳读取面 plugins:call "listNotifications"——M1 AI#1；按钮的 command 事实随行，M1 AI#2）',
    params: [],
    run: async (_req, ctx) => ctx.shellRequest(IPC.plugins.call, ['listNotifications']),
  },

  notifyAction: {
    name: 'notifyAction',
    kind: 'write',
    help: '执行通知上的按钮（按钮 = 命令——照 M1 AI#2 的 command/args 走 commands.execute，与手点同一条命令路径）。⚠️ 按钮背后是敏感命令时同样要用户点头（AI#29）',
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

  log: {
    name: 'log',
    kind: 'read',
    help: '读最近操作账（正门三件套之「账本」的读取面；先记后判——被拒的调用也在账上，AI#43）',
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
