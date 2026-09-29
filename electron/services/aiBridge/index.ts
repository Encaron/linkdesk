/**
 * AI 接入内核（M4 `AI#32`）——白名单语义操作面网关，住**主进程**。
 * 消费方 = 两张皮：CLI `linkdeskctl`（cli/linkdeskctl/，AI#34）与 MCP server（AI#36，后续棒）。
 *
 * ## 为什么住主进程（E5.6 对照，01-设计.md §9.2）
 *
 * 它依赖的 IPC / 命令 / 插件管理全在主进程存在 ⇒ 不新建进程/窗口、不碰渲染层、不搬组件。
 * 唯一的「跨进程活」是执行壳命令——命令注册表住在壳渲染进程（`CommandRegistry`），所以经
 * **既有 bridge:\* 信封**（`bridge:request`/`bridge:response`，requestId 前缀 `aibridge-`）
 * 转发过去，**0 条新 IPC 通道**（与 `IpcBridge` 的 pending 表互不干扰：它只认自己的前缀）。
 *
 * ## 安全半径（AI#32 判据）
 *
 * 给白名单能力，不给任意 JS 权限（`e5.7-extreme-simple-pool` 哲学同源）：表外操作一律 `EOP` 拒绝；
 * token 鉴权（`timingSafeEqual`，校验收敛到 `tokenOk()` 一处）；**默认关**（门锁语义，AI#39）。
 *
 * ## 🔴 「留口子」硬要求（用户 2026-09-28 拍板）在本文件的落法
 *
 * **代码里没有一处「非本机即拒」的判断**——绑定地址/端口全是配置（`resolveBridgeConfig`），
 * 「现在只开回环」是**默认值**（配置的结果），不是 `if (peer !== "127.0.0.1") reject` 这类代码假设；
 * 凭据与地址分家（记录文件不含凭据，token 独立一份）；操作表与账本与传输无关（pipe/tcp 同一张表）。
 * 将来跨机/远程（AI#42）= 加配置 ＋ 补对端认证，不改这把锁的形状。
 *
 * ## 开关与配置（设置面归 AI#38/AI#39，本格只把**读取口**留好）
 *
 *   · `settings.json` 的 `ai.cli.enabled` / `ai.mcp.enabled` 任一为 true ⇒ 开（AI#38.3 的正式键，
 *     默认关——两个键都缺席 = 关）；⛔ 运行期不热载，改完重启生效（热切换归 AI#39）
 *   · env `LINKDESK_AIBRIDGE=pipe|tcp|off` 显式覆盖（dev/测试用，同 spike 口径；`_HOST`/`_PORT` 同）
 *
 * ## 落盘两件（`userData` 下，**地址与凭据分家**）
 *
 *   · `ai-bridge.json` —— 通道记录（地址＋身份＋状态，**不含凭据**）。默认关也写（enabled:false），
 *     客户端才能说出「软件在跑、开关是关的」（SWITCH_OFF ≠ NO_RECORD，spike 判据③的机制）
 *   · `ai-bridge.token` —— 凭据（32 字节 hex；Windows 靠 userData 的逐用户 ACL 保护）。缺席才生成，
 *     「重新生成凭据」= 删掉它重启（AI#38.9 的正式面归设置页）
 *
 * ## 🔴 spike 用真实读数换来的三条纪律（照 `scripts/dev/m4-spike/README.md §六`，别重推）
 *
 *   ① **启动点 = `app.whenReady()` ＋ `app.hasSingleInstanceLock()` 双门**——输掉锁的进程不许
 *      改写记录/抢绑端口（否则 CLI 误报 APP_EXITED，spike 判据④负控实测）；
 *   ② **监听失败写 `lastError`**——否则「没开」与「开了没起来」在客户端不可分辨（EADDRINUSE 实测）；
 *   ③ **多窗口路由**（AI#41，2026-09-28 补齐）——「目标窗口」= **当前聚焦的壳窗**（用户在看的那只），
 *      无焦点/焦点窗已死 ⇒ 回退 `getShellWindows()` 首个（主壳窗）。这条与壳自己的口径一致：
 *      命令面板 / 对话框 / 浮动面板的主进程推送默认都是 `getFocusedWindowId()`
 *      （`electron/windows/window-manager.ts` 的 `pushQuickPick/pushDialog/pushFloatingPanel`）——
 *      通道若另立一套窗口选择法，AI 开的标签页会落在用户没在看的窗里。
 *      `ping` 报 `servedShellWindow`（'main' / 'ws-N'）⇒ **服务了哪个窗可观测、可复核**，不是「随机一只」。
 *      ⛔ 仍未做（首版边界，记在案）：按名字**指名**窗口（如 `--window ws-2`）——操作表无窗口形参。
 *
 * ## 回执语义：相位登记表（AI#60）——「没拿到答复」不是一种故障，是三种
 *
 * 「壳侧没在预算内答复」曾经与「什么都没发生」**不可分辨**（真机 `0.2.23 → 0.2.24` 整跳上，
 * `exec update.openUpdateFlow` 明明跑成了却回 `[ESHELLTIMEOUT] 壳无应答`、退出码 1 ⇒ AI 会重试、
 * 或向用户报「失败」）。本文件记**相位**（`op` / `shell` / `ask-user`），客户端在自己预算用完那一刻
 * 用**第二次廉价请求**（`ping`）读回去，把三件事分开：**还在跑** / **正等人点头** / **真没应答**；
 * `ESHELLTIMEOUT` 的文案也照此如实写（壳没答 ≠ 命令没跑）。
 * ⛔ **协议行数不变**——仍是一连接 = 一请求 = 一应答；往协议里塞「中间行」会让老客户端把中间行
 * 当终答（等于强制升协议版本，代价与收益不成比例）。⛔ 也别把预算调大当修法（长命令没有上界）。
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { IPC } from '../../ipc/channels.js';
import { OPS, coded, type BridgeOpContext, type BridgePhase, type LedgerEntry } from './whitelist.js';

/** 通道记录文件名（userData 下）。客户端（cli/linkdeskctl/lib/bridge-client.mjs）按同名找它——改名两处同笔 */
const RECORD_NAME = 'ai-bridge.json';
/** 凭据文件名（userData 下，0600）。与记录分家：地址不是秘密，凭据是 */
const TOKEN_NAME = 'ai-bridge.token';
/** 操作日志文件名（userData 下，JSONL 追加）。`ai.auditLog.enabled` = true 才写（AI#43/#38.11） */
const LOG_NAME = 'ai-bridge-log.jsonl';

const MAX_REQUEST_BYTES = 1024 * 1024;
const LEDGER_CAP = 200;
/** 本内核请求的 requestId 前缀——bridge:response 上与 IpcBridge 各认各的（对方表里没有 ⇒ 忽略） */
const REQUEST_ID_PREFIX = 'aibridge-';
/** 常规壳请求超时。装插件/确认对话框等长操作在各自操作里单独放宽 */
const SHELL_TIMEOUT_MS = 8_000;

/* ── 相位登记表（AI#60：「还在跑 / 正等人点头 / 真没应答」各有名字） ── */

/**
 * 一次请求此刻在**哪条腿**上。客户端在自己预算用完的那一刻，用**第二次廉价请求**（`ping`）
 * 把它读回去，从而把三种「没拿到答复」分辨开——⛔ 客户端不自己猜，相位只在这里记。
 * （词汇定义处 = `whitelist.ts` 的 `BridgePhase`，本文件从那里取用并再导出。）
 */
export type { BridgePhase };

/** 给客户端读的一条在办请求（`identity().inFlight` 的正文） */
export interface InFlightEntry {
  op: string;
  phase: BridgePhase;
  /** 人读补充——`shell` 记通道名，`ask-user` 记「在问什么」；⛔ 不放实参正文（凭据 / 路径不出内核） */
  what: string | null;
  /** 已经办了多久——客户端据此说「已跑 3.2 秒，还在跑」，而不是「卡住了」 */
  ms: number;
}

export interface InFlightHandle {
  id: number;
  /** 只读当前相位——「等人点头期间不被壳请求改写」那条判定要用它 */
  phase(): BridgePhase;
  set(phase: BridgePhase, what?: string | null): void;
  /** 出表：请求结束（无论成败）。⛔ 不调它 = 那只请求永远被读成「还在跑」 */
  done(): void;
}

/**
 * 相位登记表（工厂——单测各造一份，互不干扰）。
 *
 * `snapshot(selfId)` **剔除自己**：`ping` 探活本身也是一条在办请求，不剔除的话每次探活都
 * 「看见自己」⇒ 客户端永远读到「还在跑」——那是**必然说谎**。
 */
export function createInFlightRegistry(now: () => number = Date.now) {
  const entries = new Map<number, { op: string; phase: BridgePhase; what: string | null; startedAt: number }>();
  let seq = 0;
  return {
    begin(op: string): InFlightHandle {
      const id = ++seq;
      const entry = { op, phase: 'op' as BridgePhase, what: null as string | null, startedAt: now() };
      entries.set(id, entry);
      return {
        id,
        phase: () => entry.phase,
        set: (phase, what = null) => {
          entry.phase = phase;
          entry.what = what;
        },
        done: () => {
          entries.delete(id);
        },
      };
    },
    snapshot(selfId: number | null = null): InFlightEntry[] {
      const t = now();
      const out: InFlightEntry[] = [];
      for (const [id, e] of entries) {
        if (id === selfId) continue;
        out.push({ op: e.op, phase: e.phase, what: e.what, ms: t - e.startedAt });
      }
      return out;
    },
    size: () => entries.size,
  };
}

export type InFlightRegistry = ReturnType<typeof createInFlightRegistry>;

/** 模块唯一那份（真实现用它；`ping` 经 `identity().inFlight` 读走）——⛔ 不导出：唯一消费者是同文件的
 *  `opContextFor` 默认参数（导出会被 knip 当闲置面，且外面确实不需要它） */
const inFlight = createInFlightRegistry();

/* ── 配置解析（纯函数，单测友好） ── */

export interface BridgeConfig {
  enabled: boolean;
  transport: 'pipe' | 'tcp';
  host: string;
  /** 0 = 由 OS 派发临时端口（默认；实际端口以监听回调写进记录的为准） */
  port: number;
  /** 开关来源——env 显式 > 设置键；读数里说明「为什么开着/关着」用 */
  source: 'env' | 'settings' | 'default-off';
  /** 操作日志落盘开关（AI#43；设置键 `ai.auditLog.enabled`，默认关）——只管**盘上**那份，内存账恒记 */
  auditLog: boolean;
}

/**
 * 配置解析——🔴 回环是配置的结果，不是代码的假设：host 默认 127.0.0.1、port 默认 0，
 * 但**没有任何一处**「非本机即拒」的判断；`LINKDESK_AIBRIDGE_HOST` 指到别的地址一样听（AI#42 的口子）。
 */
export function resolveBridgeConfig(env: NodeJS.ProcessEnv, settingsFile: string): BridgeConfig {
  const explicit = env.LINKDESK_AIBRIDGE;
  let enabled = false;
  let transport: 'pipe' | 'tcp' = 'tcp';
  let source: BridgeConfig['source'] = 'default-off';
  let auditLog = false;
  if (explicit === 'pipe' || explicit === 'tcp') {
    enabled = true;
    transport = explicit;
    source = 'env';
  } else if (explicit !== undefined) {
    // 显式 "off"（或写错的值）＝ 明确关闭，不看设置键（dev 要临时全关时有逃生口）
    enabled = false;
    source = 'env';
  } else {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')) as Record<string, unknown>;
      if (settings['ai.cli.enabled'] === true || settings['ai.mcp.enabled'] === true) {
        enabled = true;
        source = 'settings';
      }
      auditLog = settings['ai.auditLog.enabled'] === true;
    } catch {
      // 没有 settings.json / 读不动 = 默认关（首次启动的常态，不是错误）
    }
  }
  const host = typeof env.LINKDESK_AIBRIDGE_HOST === 'string' && env.LINKDESK_AIBRIDGE_HOST
    ? env.LINKDESK_AIBRIDGE_HOST
    : '127.0.0.1';
  const portRaw = Number(env.LINKDESK_AIBRIDGE_PORT);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? Math.floor(portRaw) : 0;
  return { enabled, transport, host, port, source, auditLog };
}

/** 凭据校验——收敛到这一处（换机制/加作用域只改这里；AI#42 的评估对象） */
export function tokenOk(candidate: unknown, token: string | null): boolean {
  if (typeof candidate !== 'string' || !candidate || !token) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ── 通道记录（客户端分类法的对端） ── */

type BridgeEndpoint = { transport: 'pipe'; pipe: string } | { transport: 'tcp'; host: string; port: number };

/** 记录形状——与 spike 同字段（客户端错误分类法按这些字段说话），⛔ 别随意改名 */
interface BridgeRecord {
  v: number;
  mode: 'pipe' | 'tcp' | 'off';
  pid: number;
  appName: string;
  userData: string;
  appVersion: string;
  startedAt: string;
  enabled: boolean;
  listening: boolean;
  endpoint: BridgeEndpoint | null;
  lastError: string | null;
  exitedAt?: string;
}

/* ── 内核主体 ── */

export interface AiBridgeDeps {
  /** 壳窗注册表现取（壳崩重建后自动指向新实例——getter 闭包读最新引用，同 crash-recovery 先例） */
  getShellWindows: () => BrowserWindow[];
  /** 当前聚焦壳窗（AI#41 的「目标窗口」——缺省 = 不启用焦点优先，恒回退 `getShellWindows()` 首个） */
  getFocusedShellWindow?: () => BrowserWindow | null;
  /** 壳窗标签（'main' / 'ws-N'）——`ping` 报「服务了哪个窗」用；缺省 = 不报 */
  shellWindowLabel?: (win: BrowserWindow) => string | null;
}

interface PendingShellRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const ledger: LedgerEntry[] = [];
const pendingShell = new Map<string, PendingShellRequest>();
let shellSeq = 0;
let record: BridgeRecord | null = null;
let recordFile = '';
let tokenFile = '';
let token: string | null = null;
let startedAtMs = 0;
let endpoint: BridgeEndpoint | null = null;
let getShellWindows: AiBridgeDeps['getShellWindows'] = () => [];
let getFocusedShellWindow: () => BrowserWindow | null = () => null;
let shellWindowLabel: (win: BrowserWindow) => string | null = () => null;
/** 最近一次壳请求服务到的壳窗标签（AI#41：ping 可读） */
let servedShellWindow: string | null = null;
let pipeName = '';
/** 操作日志落盘开关（启动时读设置键；内存账恒记，落盘看它——AI#43/#38.11） */
let auditLogEnabled = false;
/** 操作日志文件绝对路径（initAiBridge 时定；present=false 时为空串） */
let logFile = '';

function log(...parts: unknown[]): void {
  console.log('[ai-bridge]', ...parts);
}

function writeRecord(): void {
  if (!record) return;
  try {
    fs.mkdirSync(path.dirname(recordFile), { recursive: true });
    fs.writeFileSync(recordFile, JSON.stringify(record, null, 2) + '\n');
  } catch (e) {
    log('⚠️ 写通道记录失败:', e instanceof Error ? e.message : String(e));
  }
}

function ledgerEntry(op: string, arg: string | null, ok: boolean, code: string | null, ms: number): void {
  const entry: LedgerEntry = { ts: new Date().toISOString(), op, arg, ok, code, ms };
  ledger.push(entry);
  if (ledger.length > LEDGER_CAP) ledger.shift();
  // 盘上那份（AI#43「账本」）：只在开关开着时写（AI#38.11 判据「关 ⇒ 不写」）。追加失败不出声打断业务。
  if (auditLogEnabled && logFile) {
    try {
      fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
    } catch (e) {
      log('⚠️ 写操作日志失败:', e instanceof Error ? e.message : String(e));
    }
  }
}

/**
 * 目标壳窗裁决（AI#41，纯函数——单测可钉）：**聚焦窗优先**，不可用 ⇒ 注册表首个。
 * `alive` 注入（真实现 = 未销毁 + webContents 未销毁；单测给假窗）。
 */
export function pickShellWindow(args: {
  focused: BrowserWindow | null | undefined;
  shells: BrowserWindow[];
  alive: (w: BrowserWindow | null | undefined) => boolean;
}): BrowserWindow | null {
  if (args.alive(args.focused)) return args.focused as BrowserWindow;
  return args.shells.find((w) => args.alive(w)) ?? null;
}

/** 「还活着」判定——聚焦窗可能在两次读之间被关掉（多窗口下常态，不是异常） */
function aliveWindow(w: BrowserWindow | null | undefined): boolean {
  return !!w && !w.isDestroyed() && !w.webContents.isDestroyed();
}

/**
 * 主进程 → 壳渲染进程的一次请求（复用既有 bridge:* 信封，`IpcBridgeHandler`（壳 React）应答）。
 * requestId 前缀 `aibridge-`——IpcBridge 的 pending 表里没有它 ⇒ 各走各的，互不干扰。
 * 目标窗 = `pickShellWindow`（聚焦窗优先，AI#41）；`sourceWindowId: "main"` 与 IpcBridge 对主壳
 * 发起的兜底章一致（壳内视角，池寻址由壳自己归一——`pool-addressing` 的 windowId 双重身份）。
 */
async function shellRequest(channel: string, args: unknown[], timeoutMs = SHELL_TIMEOUT_MS): Promise<unknown> {
  // 壳窗就绪等待——壳 React（IpcBridgeHandler）要等页面加载完才应答，窗存在但没就绪时会超时（客户端可见，重试即可）
  const deadline = Date.now() + timeoutMs;
  let win: BrowserWindow | null = null;
  for (;;) {
    win = pickShellWindow({ focused: getFocusedShellWindow(), shells: getShellWindows(), alive: aliveWindow });
    if (win) break;
    if (Date.now() > deadline) throw coded('ENOSHELL', `壳窗在 ${timeoutMs}ms 内没有出现（软件可能还在启动）`);
    await new Promise((r) => setTimeout(r, 100));
  }
  servedShellWindow = shellWindowLabel(win);

  const requestId = `${REQUEST_ID_PREFIX}${process.pid}-${++shellSeq}-${Date.now()}`;
  return new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingShell.delete(requestId);
      // AI#60：文案要**如实**——「壳没在预算内答复」⛔ 不等于「命令没执行」。长命令（如
      // `update.openUpdateFlow` 的下载腿）合法跑几分钟，主进程先放弃等待是设计；但读数不能让
      // AI 把「已经成功」当失败（真机整跳上撞过：界面照常推进，AI 那侧只拿到「壳无应答」）。
      // 确认框那条**含义相反**（没等到答复 = 没点头 ⇒ 动作没执行，fail-closed）——同样叫超时，
      // 故按通道分说，⛔ 别用一句通用话把两件事混成一个读数。
      const detail =
        channel === IPC.dialog.confirm
          ? `没等到用户答复——**等于没点头**，动作没有执行（fail-closed）`
          : `命令**可能仍在壳里执行**（长命令合法），也可能壳卡住了；这不是执行失败，⛔ 别据此判断「没做」`;
      reject(coded('ESHELLTIMEOUT', `壳无应答（${timeoutMs}ms 超时，channel=${channel}）：${detail}`));
    }, timeoutMs);
    pendingShell.set(requestId, { resolve, reject, timer });
    win!.webContents.send(IPC.bridge.request, { requestId, channel, args, sourceWindowId: 'main' });
  });
}

const opContext: BridgeOpContext = {
  shellRequest,
  identity: () => ({
    pid: process.pid,
    appName: app.getName(),
    appVersion: app.getVersion(),
    transport: endpoint?.transport ?? record?.mode ?? 'off',
    endpoint,
    userData: app.getPath('userData'),
    startedAt: record?.startedAt ?? null,
    uptimeMs: Date.now() - startedAtMs,
    /** 壳窗数（AI#41：多窗口下客户端一眼看出通道服务在几只窗上） */
    shellWindows: getShellWindows().length,
    /** 全部 BrowserWindow 数（含脱出窗等非壳窗——与 shellWindows 分列，别混一个字段） */
    allWindows: BrowserWindow.getAllWindows().length,
    /** 最近一次壳请求服务到的壳窗标签（'main' / 'ws-N'）——「操作到了哪只窗」的可观测面（AI#41） */
    servedShellWindow,
  }),
  ledgerEntries: () => ledger,
};

/**
 * 一条请求的执行上下文（AI#60）——**相位在这条缝上进出**，`handleRequest` 与单测共用同一份。
 *
 *   · `begin` 即入表（phase = `op`）；返回的 `done()` 由调用方在 `finally` 里调；
 *   · 壳请求 ⇒ 相位 `shell`（`what` = 通道名）；
 *   · 等人点头期间（`ask-user`）**不被那条确认框请求改写**——否则客户端读到的相位是
 *     「命令在跑」，而真相是「软件里弹着框等人」（那是最要命的一种误读：AI 会以为对面卡住而重试）；
 *   · `identity()` 回填 `inFlight`（**剔除自己**——`ping` 也是一条在办请求）。
 *
 * `base` 可注入（默认模块那份 `opContext`）——单测给假壳请求即可钉住相位进出，⛔ 不必起窗口。
 */
export function opContextFor(
  op: string,
  base: BridgeOpContext = opContext,
  registry: InFlightRegistry = inFlight,
): { ctx: BridgeOpContext; done: () => void } {
  const handle = registry.begin(op);
  const ctx: BridgeOpContext = {
    ...base,
    shellRequest: (channel, args, timeoutMs) => {
      if (handle.phase() !== 'ask-user') handle.set('shell', channel);
      return base.shellRequest(channel, args, timeoutMs);
    },
    identity: () => ({ ...base.identity(), inFlight: registry.snapshot(handle.id) }),
    phase: (phase, what) => handle.set(phase, what ?? null),
  };
  return { ctx, done: () => handle.done() };
}

async function handleRequest(req: unknown): Promise<unknown> {
  if (!req || typeof req !== 'object') throw coded('EPROTO', '请求必须是 JSON 对象');
  const body = req as Record<string, unknown>;
  const op = typeof body.op === 'string' ? body.op : '';
  const argOf = (name: string): string | null =>
    typeof body[name] === 'string' && body[name] ? (body[name] as string) : null;
  const keyArg = op === 'exec' ? argOf('commandId') : op === 'install' ? argOf('source') : null;

  // 账本先记后判（含被拒的——「AI 以为没做、其实做了」要查得出来，AI#43 判据）
  if (!tokenOk(body.token, token)) {
    ledgerEntry(op || '(空)', keyArg, false, 'EAUTH', 0);
    throw coded('EAUTH', '凭据不对（token 不匹配）——用 ai-bridge.token 里那份');
  }
  const handler = OPS[op];
  if (!handler) {
    ledgerEntry(op || '(空)', keyArg, false, 'EOP', 0);
    throw coded('EOP', `未知操作 ${op || '(空)'}——describe 可列出全部（⛔ 网关只给白名单里的操作，不给任意 JS）`);
  }
  const t0 = Date.now();
  const { ctx, done } = opContextFor(op);
  try {
    const result = await handler.run(body, ctx);
    ledgerEntry(op, keyArg, true, null, Date.now() - t0);
    return result;
  } catch (e) {
    const err = e as Error & { code?: string };
    const code = err.code ?? 'EERROR';
    ledgerEntry(op, keyArg, false, code, Date.now() - t0);
    throw err.code ? err : coded('EERROR', err.message || String(err));
  } finally {
    // 出表（AI#60）：请求结束就不该再被读成「还在跑」——成功 / 失败 / 被拒**一律**出表
    done();
  }
}

/** 一条连接 = 一行 JSON 请求 + 一行 JSON 应答，用完即断（零状态机，同 spike 实测形态） */
function onConnection(socket: net.Socket): void {
  let buf = '';
  socket.setEncoding('utf8');
  socket.on('error', () => {}); // 客户端早退不许炸主进程
  socket.on('data', (chunk: string) => {
    buf += chunk;
    if (buf.length > MAX_REQUEST_BYTES) {
      socket.end(JSON.stringify({ ok: false, code: 'ETOOBIG', message: `请求超过 ${MAX_REQUEST_BYTES} 字节` }) + '\n');
      socket.destroy();
      return;
    }
    const nl = buf.indexOf('\n');
    if (nl < 0) return; // 还没读到完整一行
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    let req: unknown = null;
    try {
      req = JSON.parse(line);
    } catch {
      socket.end(JSON.stringify({ ok: false, code: 'EPROTO', message: '请求不是合法 JSON' }) + '\n');
      return;
    }
    handleRequest(req).then(
      (result) => {
        if (!socket.destroyed && socket.writable) socket.end(JSON.stringify({ ok: true, result }) + '\n');
      },
      (e: Error & { code?: string }) => {
        if (!socket.destroyed && socket.writable) {
          socket.end(JSON.stringify({ ok: false, code: e.code ?? 'EERROR', message: e.message, servedBy: process.pid }) + '\n');
        }
      },
    );
  });
}

function createTokenFile(tokenFile: string): string {
  try {
    if (fs.existsSync(tokenFile)) {
      const existing = fs.readFileSync(tokenFile, 'utf8').trim();
      if (existing) return existing;
    }
    const fresh = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(tokenFile, fresh, { mode: 0o600 });
    return fresh;
  } catch (e) {
    log('⚠️ 凭据文件读写失败（通道仍会启动，客户端拿不到凭据会 EAUTH）:', e instanceof Error ? e.message : String(e));
    return '';
  }
}

/**
 * 内核启动（`main.ts` 的 `whenReady` 里调用一次；壳崩重建不经过 whenReady ⇒ 天然幂等）。
 * 🔴 双门：调用点已在 whenReady 内（门一），这里再查单实例锁（门二）——输了锁的进程
 * 到这里必须一句不做（不写记录、不监听），spike 判据④负控的机制。
 */
export function initAiBridge(deps: AiBridgeDeps): void {
  getShellWindows = deps.getShellWindows;
  getFocusedShellWindow = deps.getFocusedShellWindow ?? (() => null);
  shellWindowLabel = deps.shellWindowLabel ?? (() => null);
  if (typeof app.hasSingleInstanceLock === 'function' && !app.hasSingleInstanceLock()) {
    log(`pid=${process.pid} 未持有单实例锁（抢锁失败的进程）⇒ 不监听、不写记录`);
    return;
  }

  startedAtMs = Date.now();
  const userData = app.getPath('userData');
  recordFile = path.join(userData, RECORD_NAME);
  tokenFile = path.join(userData, TOKEN_NAME);
  logFile = path.join(userData, LOG_NAME);
  const config = resolveBridgeConfig(process.env, path.join(userData, 'settings.json'));
  auditLogEnabled = config.auditLog;

  record = {
    v: 1,
    mode: config.enabled ? config.transport : 'off',
    pid: process.pid,
    appName: app.getName(),
    userData,
    appVersion: app.getVersion(),
    startedAt: new Date(startedAtMs).toISOString(),
    enabled: config.enabled,
    listening: false,
    endpoint: null,
    lastError: null,
  };

  if (!config.enabled) {
    // 门锁语义：不监听任何东西——但记录要留（客户端据此说出「软件在跑、开关是关的」，AI#39 判据的机制）
    writeRecord();
    log(`开关关着（来源=${config.source}）⇒ 未监听；记录已留：${recordFile}`);
    return;
  }

  token = createTokenFile(tokenFile);

  // 闭包捕获：record 是模块级可空变量，TS 窄化穿不进回调——此刻起用局部非空引用（已判空路径在上面 return）
  const rec: BridgeRecord = record;

  // 应答缝——只认自己的 requestId 前缀（IpcBridge 的请求同通道不同前缀，各走各的）
  ipcMain.on(IPC.bridge.response, (_event, msg: { requestId?: string; result?: unknown; error?: string }) => {
    const id = msg?.requestId;
    if (typeof id !== 'string' || !id.startsWith(REQUEST_ID_PREFIX)) return;
    const p = pendingShell.get(id);
    if (!p) return;
    pendingShell.delete(id);
    clearTimeout(p.timer);
    if (msg.error) p.reject(coded('ESHELLERROR', String(msg.error)));
    else p.resolve(msg.result);
  });

  app.on('will-quit', () => {
    rec.listening = false;
    rec.exitedAt = new Date().toISOString();
    writeRecord();
  });

  const server = net.createServer(onConnection);
  server.on('error', (e: NodeJS.ErrnoException) => {
    // 🔴 响亮失败：写进记录（否则客户端无法把「没起来」与「关着」分开——spike 纪律②）
    rec.enabled = false;
    rec.listening = false;
    rec.lastError = e.code ?? String(e);
    writeRecord();
    log(`🔴 监听失败（${rec.lastError}）:${e.message}——通道没起来`);
  });
  server.on('listening', () => {
    if (config.transport === 'pipe') {
      endpoint = { transport: 'pipe', pipe: pipeName };
    } else {
      const addr = server.address();
      endpoint = {
        transport: 'tcp',
        host: config.host,
        port: addr && typeof addr === 'object' ? addr.port : config.port,
      };
    }
    rec.enabled = true;
    rec.listening = true;
    rec.lastError = null;
    rec.endpoint = endpoint;
    writeRecord();
    log(`listening transport=${config.transport} endpoint=${JSON.stringify(endpoint)} pid=${process.pid} userData=${userData}`);
  });

  if (config.transport === 'pipe') {
    // 管道名按 userData 摘要派生——多隔离实例互不撞名；前缀与 spike 不同（正式件/原型各归各）
    // ⚠️ Windows 命名管道语法；跨平台管道（unix socket）是 AI#42 开跨机口子时的题
    pipeName = `\\\\.\\pipe\\linkdesk-ai-${crypto.createHash('sha1').update(userData).digest('hex').slice(0, 8)}`;
    server.listen(pipeName);
  } else {
    server.listen(config.port, config.host);
  }
}

/* ── 设置页/壳命令的读取口（AI#38.4 数据源 ＋ AI#38.9 重新生成凭据）──
 * 设置页的只读状态行走壳命令 → `app:getAiBridge` → 这两个出口；⛔ 内核状态不再抄第二份到别处。 */

/** 内核状态快照（本进程 = 单实例锁持有者时才有内容；壳命令格式化显示文字，这里只出**数据**） */
export function bridgeSnapshot(): {
  present: boolean;
  pid: number;
  enabled: boolean;
  listening: boolean;
  mode: 'pipe' | 'tcp' | 'off';
  endpoint: BridgeEndpoint | null;
  lastError: string | null;
  startedAt: string | null;
  uptimeMs: number;
  /** 操作账尾部（内存账，上限 LEDGER_CAP——盘上全量在 ai-bridge-log.jsonl） */
  ledger: LedgerEntry[];
} {
  return {
    present: record !== null,
    pid: process.pid,
    enabled: record?.enabled ?? false,
    listening: record?.listening ?? false,
    mode: record?.mode ?? 'off',
    endpoint: record?.endpoint ?? null,
    lastError: record?.lastError ?? null,
    startedAt: record?.startedAt ?? null,
    uptimeMs: record ? Date.now() - startedAtMs : 0,
    ledger: ledger.slice(-50),
  };
}

/**
 * 重新生成凭据（AI#38.9「重新生成凭据」的内核半）——**旧凭据立即失效**（内存 token 当场换新，
 * `tokenOk` 校验的是内存这份）；新值写盘（0600），客户端重读 `ai-bridge.token` 即接上。
 * 未持有锁 / 内核没起来 ⇒ 抛（壳命令转成人话）。
 */
export function regenerateBridgeToken(): string {
  if (!record) throw coded('ENOTREADY', '内核没在跑（本进程未持有单实例锁）——无从重新生成凭据');
  const fresh = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(tokenFile, fresh, { mode: 0o600 });
  token = fresh;
  log('凭据已重新生成——旧凭据立即失效');
  return fresh;
}
