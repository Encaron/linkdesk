/**
 * 命令面「可见性」两半（生长格 `AI#54` · 2026-09-29 用户拍板 = **壳侧兜底**）。
 *
 * ── 病 ──
 * 一部分插件把命令注册在**视图挂载时**（视图态命令：`file-tree.compareWithSelected` /
 * `serial-monitor.toggleSystemLog` 那类，注册点住在 React 视图 hook 里）⇒ **没开过视图时**，
 * 命令在壳注册表里根本不存在：外部 AI 的 `describe` 看不到、`getCommands()` 也查不到，
 * 只能靠「先撞一次 `EUNKNOWN` → 猜要开视图 → 再 discover」——可发现性与可操作性同时受损。
 * 独立证据（2026-09-29 外部 AI 黑盒实测）：`open-tab serial-monitor` 之前命令面 142 条、
 * 之后 145 条。⛔ 这不是「插件写错了」：视图没了、视图态命令就该没（`unregisterCommands(pluginId)`
 * 的粗粒度摘除是有意为之）。⇒ 修在**壳侧**，插件一行不改。
 *
 * ── 两半 ──
 *   ① **声明面可发现**（`pickPendingCommands`）：插件清单 `contributes.commands` 是**静态声明**，
 *      壳本来就有（`plugins:call "list"` 的 manifest 子集里）⇒ 把「已声明但尚未注册」的差集
 *      单独列给 AI 看（`describe.commandsPending`）：**能规划、不能执行**——`exec` 仍只认注册面，
 *      撞到这类 id 时给的是**带指引的** `EUNKNOWN`（先 `open-tab <pluginId>`），不是干巴巴一句「不在命令面」。
 *   ② **挂载后不留空窗**（`settleCommandSurface`）：`tabs:create` 是 fire 型（壳收到即 emit），
 *      池侧挂载 → 插件注册 → `commands:register` 回传是**之后**才发生的异步链 ⇒ `open-tab` 一返回就
 *      `exec` 会撞上一段竞态空窗。故开完标签**等命令面落定**（轮询到「连续 quietMs 没变化」或到
 *      capMs 上限）再返回，并把**新挂牌的 id** 一并交回（AI 不必自己再 describe 一次去比对）。
 *
 * ⛔ 不发明新通道、不碰契约：两个面都是既有读取面（`plugins:call "getCommands"` / `"list"`）。
 * ⚠️ 等待必须**有上限**（MCP 客户端默认预算 5 秒——见 `AI#60` 三预算）⇒ capMs 默认 2 秒，
 * 到点如实回 `settled: false`，⛔ 不抛错、⛔ 不把「没等到」说成失败（标签确实开了）。
 */

/** 插件清单里我们用到的那一小片（`plugins:call "list"` 的 manifest 子集） */
export interface DeclaredCommandSource {
  pluginId?: unknown;
  manifest?: { contributes?: { commands?: unknown } } | null;
}

export interface PendingCommand {
  id: string;
  /** 声明面的标题/说明——原样透出，⛔ 不在壳侧翻译 */
  title?: string;
  description?: string;
  pluginId: string;
  /** 人话指引：这条为什么现在不能执行、要做什么（AI 照做即可，不必猜） */
  needs: string;
}

/**
 * 差集：**已声明**（`contributes.commands`）而**未注册**（`getCommands()` 里没有）的命令。
 *
 * 规则（全部有单测）：
 *   · id 非空 string 才算（清单是用户可写的 JSON，坏条目一律跳过而不是崩）；
 *   · 已注册的不列（那是执行面的事，describe.commands 里已有）；
 *   · 同一 id 多处声明只留第一条（去重——避免 AI 看到两条同 id 而困惑）；
 *   · 输出按 id 排序（确定性：门禁/测试/前后对比都靠它稳定）。
 */
export function pickPendingCommands(
  plugins: readonly DeclaredCommandSource[],
  registered: readonly { id?: unknown }[],
): PendingCommand[] {
  const have = new Set<string>();
  for (const c of registered) if (typeof c?.id === "string" && c.id) have.add(c.id);

  const out = new Map<string, PendingCommand>();
  for (const p of plugins) {
    const pluginId = typeof p?.pluginId === "string" && p.pluginId ? p.pluginId : "";
    const declared = p?.manifest?.contributes?.commands;
    if (!pluginId || !Array.isArray(declared)) continue;
    for (const raw of declared) {
      const id = (raw as { id?: unknown })?.id;
      if (typeof id !== "string" || !id) continue;
      if (have.has(id) || out.has(id)) continue;
      const title = (raw as { title?: unknown }).title;
      const description = (raw as { description?: unknown }).description;
      out.set(id, {
        id,
        ...(typeof title === "string" && title ? { title } : {}),
        ...(typeof description === "string" && description ? { description } : {}),
        pluginId,
        needs: `先 open-tab ${pluginId}（该插件的视图挂载后才注册）`,
      });
    }
  }
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface SettleOptions {
  /** 连续多久没变化算落定（默认 250ms） */
  quietMs?: number;
  /** 总上限——到点如实回 `settled: false`（默认 2000ms，⛔ 别撑破 MCP 侧 5 秒预算） */
  capMs?: number;
  /** 轮询间隔（默认 100ms） */
  stepMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** 前后差集的最大条数（防恶意/异常插件把回执撑爆；默认 50） */
  maxAdded?: number;
}

export interface SettleResult {
  /** 落定那一刻的命令 id 集（排序） */
  ids: string[];
  /** 相对 `before` 新挂牌的 id（排序、已截断） */
  added: string[];
  /** 轮询次数（读数用） */
  polls: number;
  /** true = 等到稳定；false = 撞到 capMs 上限（**不是失败**，命令面只是还没落定） */
  settled: boolean;
}

const DEFAULT_QUIET_MS = 250;
const DEFAULT_CAP_MS = 2000;
const DEFAULT_STEP_MS = 100;
const DEFAULT_MAX_ADDED = 50;

/**
 * 等命令面落定——`read()` 每次现取一份 id 集（壳侧 = `plugins:call "getCommands"`）。
 * 判据：**连续 `quietMs` 无变化** ⇒ 落定；总耗时到 `capMs` ⇒ 收工并如实标注。
 */
export async function settleCommandSurface(
  read: () => Promise<string[]>,
  before: readonly string[],
  opts: SettleOptions = {},
): Promise<SettleResult> {
  const quietMs = opts.quietMs ?? DEFAULT_QUIET_MS;
  const capMs = opts.capMs ?? DEFAULT_CAP_MS;
  const stepMs = opts.stepMs ?? DEFAULT_STEP_MS;
  const maxAdded = opts.maxAdded ?? DEFAULT_MAX_ADDED;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());

  const beforeSet = new Set(before);
  const sorted = (ids: readonly string[]): string[] => [...new Set(ids)].sort();

  const t0 = now();
  let prev = sorted(before);
  let lastChangeAt = t0;
  let polls = 0;

  for (;;) {
    const elapsed = now() - t0;
    if (elapsed >= capMs) return finish(prev, beforeSet, polls, false, maxAdded);
    // 剩余预算不足一个轮询间隔 ⇒ 别再多睡一轮（否则实际耗时可能越过 cap）
    const sleepMs = Math.min(stepMs, capMs - elapsed);
    await sleep(sleepMs);
    polls += 1;

    const next = sorted(await read());
    const same = next.length === prev.length && next.every((v, i) => v === prev[i]);
    if (same) {
      if (now() - lastChangeAt >= quietMs) return finish(next, beforeSet, polls, true, maxAdded);
    } else {
      prev = next;
      lastChangeAt = now();
    }
  }
}

function finish(
  ids: string[],
  beforeSet: Set<string>,
  polls: number,
  settled: boolean,
  maxAdded: number,
): SettleResult {
  return { ids, added: ids.filter((id) => !beforeSet.has(id)).slice(0, maxAdded), polls, settled };
}
