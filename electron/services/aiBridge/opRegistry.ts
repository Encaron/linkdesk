/**
 * 异步 op 注册表（S6 · `opId` 相位的**唯一**存放点，住壳）。
 *
 * 规格：`docs/04-软件更新/待抉择池/AI门外契约面补齐/05-门外自检与异步相位.md` §二
 *       ＋ 交接.md《T11 规格》§1/§2（契约形状以那份为准）。
 *
 * 判据（⛔ 越界即第二套状态机）：
 *   · 状态是**封闭枚举** `running/done/failed/expired`——⛔ 插件自造 `"processing"`；
 *   · 只此一份：插件不自建 op 表、CLI 不自建缓存（CLI 只转发 `opStatus`）；
 *   · memory-only（⛔ 落盘）：op 是会话内相位，不是历史；账本那是另一件事（`log`）。
 *   · 上限 500，超出淘汰**最老的已终态**；running 永不淘汰（不然查询会凭空 EOPEXPIRED）。
 *   · TTL 默认 10 分钟：到期转 expired 并释放结果引用（防大回执把内存钉住）。
 *
 * 本模块**零 IO、零定时器依赖注入**（`now` 可传）——纯逻辑可单测；到期的物理清理由
 * 查询时惰性判定 ＋ 注册时顺带清扫（⛔ 不起后台定时器，免僵尸）。
 */

/** 封闭状态枚举（⛔ 扩值前先改 05 §二 与本注释） */
/** 封闭状态枚举（仅本文件；对外只走 OpStatusView.state 的字符串值） */
type OpState = "running" | "done" | "failed" | "expired";

/** 查询回执形状（`opStatus` 的 result——契约见交接.md《T11 规格》§1） */
export interface OpStatusView {
  state: OpState;
  result?: unknown;
  error?: { code: string; message: string; hint?: string };
  startedAt: string;
  elapsedMs: number;
}

/** 一条 op 记录（内部形状，⛔ 直接出网） */
interface OpRecord {
  state: OpState;
  startedAtMs: number;
  endedAtMs?: number;
  result?: unknown;
  error?: { code: string; message: string; hint?: string };
}

export interface OpRegistryOptions {
  /** TTL（毫秒）——默认 10 分钟 */
  ttlMs?: number;
  /** 容量上限——默认 500（淘汰最老终态；running 永不淘汰） */
  maxEntries?: number;
  /** 时钟注入（测试用） */
  now?: () => number;
  /** opId 生成器（测试用；默认 `op_` ＋ 8 位 hex） */
  newId?: () => string;
}

export const OP_TTL_MS = 600_000;
export const OP_MAX_ENTRIES = 500;

/** `op_` ＋ 8 位十六进制——不透明，客户端 ⛔ 解析其结构 */
function defaultNewId(): string {
  let s = "";
  for (let i = 0; i < 8; i += 1) s += "0123456789abcdef"[Math.floor(Math.random() * 16)];
  return `op_${s}`;
}

export function createOpRegistry(opts: OpRegistryOptions = {}) {
  const ttlMs = opts.ttlMs ?? OP_TTL_MS;
  const maxEntries = opts.maxEntries ?? OP_MAX_ENTRIES;
  const now = opts.now ?? (() => Date.now());
  const newId = opts.newId ?? defaultNewId;
  const records = new Map<string, OpRecord>();

  /** 惰性过期：把到期的 running 记录转 expired 并释放结果（查询与注册都先跑一次） */
  function sweep(): void {
    const t = now();
    for (const rec of records.values()) {
      if (rec.state === "running" && t - rec.startedAtMs >= ttlMs) {
        rec.state = "expired";
        rec.endedAtMs = rec.startedAtMs + ttlMs;
        rec.result = undefined;
      } else if (rec.state !== "running" && rec.result !== undefined && t - (rec.endedAtMs ?? rec.startedAtMs) >= ttlMs) {
        rec.result = undefined; // 终态也过 TTL ⇒ 丢结果（形状仍可查，直到被容量淘汰）
      }
    }
  }

  /** 容量控制：先清最老的终态；仍超 ⇒ 丢最老的（防御性，正常不触发） */
  function enforceCapacity(): void {
    if (records.size <= maxEntries) return;
    const finished = [...records.entries()]
      .filter(([, r]) => r.state !== "running")
      .sort((a, b) => (a[1].startedAtMs - b[1].startedAtMs));
    while (records.size > maxEntries && finished.length > 0) {
      const [id] = finished.shift()!;
      records.delete(id);
    }
  }

  return {
    /** 开一条 op——返回 opId（壳把它放进 exec 的 pending 回执） */
    start(): { opId: string; startedAt: string } {
      sweep();
      const startedAtMs = now();
      let opId = newId();
      while (records.has(opId)) opId = newId(); // 极小概率撞车
      records.set(opId, { state: "running", startedAtMs });
      enforceCapacity();
      return { opId, startedAt: new Date(startedAtMs).toISOString() };
    },

    /** 结算成功 */
    settle(opId: string, result: unknown): void {
      const rec = records.get(opId);
      if (!rec || rec.state !== "running") return; // 已过期/已结算 ⇒ 不动（如实保留 expired）
      rec.state = "done";
      rec.result = result;
      rec.endedAtMs = now();
    },

    /** 结算失败（错误信封由调用方按唯一构造点做好） */
    fail(opId: string, error: { code: string; message: string; hint?: string }): void {
      const rec = records.get(opId);
      if (!rec || rec.state !== "running") return;
      rec.state = "failed";
      rec.error = error;
      rec.endedAtMs = now();
    },

    /**
     * 查询——未知名 ⇒ null（调用方回 `ENOTFOUND`）；
     * 已过期 ⇒ 仍是 **expired** 形状（⚠️ 05 要求过期给 `EOPEXPIRED` 码：调用方见 expired ⇒ 抛该码）。
     */
    status(opId: string): OpStatusView | null {
      sweep();
      const rec = records.get(opId);
      if (!rec) return null;
      const end = rec.endedAtMs ?? now();
      return {
        state: rec.state,
        ...(rec.state === "done" && rec.result !== undefined ? { result: rec.result } : {}),
        ...(rec.state === "failed" && rec.error ? { error: rec.error } : {}),
        startedAt: new Date(rec.startedAtMs).toISOString(),
        elapsedMs: Math.max(0, end - rec.startedAtMs),
      };
    },

    /** 读数（doctor/测试用） */
    size(): number {
      return records.size;
    },

    /** 测试用清空 */
    clear(): void {
      records.clear();
    },
  };
}

export type OpRegistry = ReturnType<typeof createOpRegistry>;
