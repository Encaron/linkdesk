/**
 * 幂等重放表（T-B · 状态命令约定）——写命令带 `idempotencyKey` 时，「同一键重试」的**唯一**存放点。
 *
 * 规格：`docs/04-软件更新/待抉择池/AI门外契约面补齐/13-状态命令约定.md` §二.3。
 *
 * 判据（⛔ 越界即第二套语义）：
 *   · **声明式**：只有命令在 `params[]` 里声明了名为 `idempotencyKey` 的参数才启用——
 *     壳不认识任何命令 id；未声明 ⇒ 参数被忽略、行为与旧版逐字节一致（默认关闭）。
 *   · 只缓存**成功**结果：失败不缓存 ⇒ AI 修好参数后重试仍会真正执行。
 *   · 回放回执 = 首次结果 ＋ `replayed:true`（⛔ 再执行一遍）；首次调用的回执形状不变。
 *   · memory-only（⛔ 落盘）：幂等窗口是会话内语义；重启后不认旧键（与 op 注册表同纪律）。
 *   · TTL 10 分钟 / 上限 500，惰性清扫（⛔ 后台定时器）——与 `opRegistry` 同一套容量纪律。
 *
 * 本模块零 IO、零定时器（`now` 可注入）——纯逻辑可单测。
 */

const IDEMPOTENCY_TTL_MS = 600_000;
const IDEMPOTENCY_MAX_ENTRIES = 500;

interface IdempotencyEntry {
  result: unknown;
  atMs: number;
}

/** 参数声明的最小形状（`LinkDeskCommandParam` 的结构子集，⛔ 反向 import 壳类型） */
interface ParamLike {
  name?: unknown;
}

export interface IdempotencyRegistryOptions {
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

/**
 * 从实参里取 `idempotencyKey`（两种实参写法都要认，与 `expandNamedArgs` 同一契约）：
 *   · 具名对象 `[{ value: 1, idempotencyKey: "k" }]`；
 *   · 逐位平铺 `[1, "k"]`——位置按声明的 `params[].name` 找。
 * 未声明该参数 / 键不是非空字符串 ⇒ null（调用方按「未启用」处理，⛔ 猜）。
 */
export function extractIdempotencyKey(
  params: readonly ParamLike[] | undefined,
  args: readonly unknown[],
): string | null {
  if (!Array.isArray(params)) return null;
  const index = params.findIndex((p) => p && p.name === "idempotencyKey");
  if (index < 0) return null;
  const named = args.length === 1 && args[0] && typeof args[0] === "object" && !Array.isArray(args[0])
    ? (args[0] as Record<string, unknown>)
    : null;
  const raw = named ? named.idempotencyKey : args[index];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function createIdempotencyRegistry(opts: IdempotencyRegistryOptions = {}) {
  const ttlMs = opts.ttlMs ?? IDEMPOTENCY_TTL_MS;
  const maxEntries = opts.maxEntries ?? IDEMPOTENCY_MAX_ENTRIES;
  const now = opts.now ?? (() => Date.now());
  const entries = new Map<string, IdempotencyEntry>();

  const keyOf = (commandId: string, key: string) => `${commandId}\u0000${key}`;

  /** 惰性过期：只保留 TTL 内的结果（查询与写入都先跑一次） */
  function sweep(): void {
    const t = now();
    for (const [k, e] of entries) {
      if (t - e.atMs >= ttlMs) entries.delete(k);
    }
  }

  /** 容量控制：超限淘汰最老的（插入顺序即时间序——重写同键时先删后插，保持「最近使用」） */
  function enforceCapacity(): void {
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next();
      if (oldest.done) break;
      entries.delete(oldest.value);
    }
  }

  return {
    /** 命中返回首次结果；未命中 / 已过期 ⇒ null（调用方照常执行） */
    lookup(commandId: string, key: string): { result: unknown } | null {
      sweep();
      const e = entries.get(keyOf(commandId, key));
      return e ? { result: e.result } : null;
    },

    /** 记录一次成功结果（失败不进来——见模块头注） */
    store(commandId: string, key: string, result: unknown): void {
      sweep();
      const k = keyOf(commandId, key);
      entries.delete(k);
      entries.set(k, { result, atMs: now() });
      enforceCapacity();
    },

    /** 读数（doctor / 测试用） */
    size(): number {
      return entries.size;
    },

    /** 测试用清空 */
    clear(): void {
      entries.clear();
    },
  };
}

export type IdempotencyRegistry = ReturnType<typeof createIdempotencyRegistry>;
