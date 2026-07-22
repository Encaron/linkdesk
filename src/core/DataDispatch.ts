/**
 * 数据分发层——协议输出 → 卡片/视图消费。
 * Phase 5 盲区 6（P0）：协议解析器的输出需要路由到订阅了对应 cardId 的组件。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §盲区6
 *
 * 模型：订阅制（Pub/Sub 但按 sourceId + cardId 双层索引）。
 * sourceId 区分数据源（哪个串口/文件/网络流），cardId 区分数据类型（heartbeat / temperature / …）。
 */

/* ── 类型 ── */

export interface DataPacket {
  /** 数据源 ID——如 "COM3" */
  sourceId: string;
  /** 卡片 ID——协议解析后的逻辑数据类型 */
  cardId: string;
  /** 解析后的字段值 */
  fields: Record<string, unknown>;
  /** 原始行（调试用） */
  raw?: string;
}

type DataSubscriber = (packet: DataPacket) => void;

/* ── 订阅索引 ── */

// sourceId → cardId → Set<subscriber>
const _subscriptions = new Map<string, Map<string, Set<DataSubscriber>>>();

/**
 * 订阅数据——卡片/视图组件挂载时调用。
 * @param sourceId 数据源 ID（如 "COM3"）
 * @param cardId   卡片 ID（如 "heartbeat"）——"*" 表示订阅该 source 的所有数据
 * @param fn       收到数据时的回调
 * @returns 取消订阅函数
 */
export function subscribe(
  sourceId: string,
  cardId: string,
  fn: DataSubscriber
): () => void {
  let sourceMap = _subscriptions.get(sourceId);
  if (!sourceMap) {
    sourceMap = new Map();
    _subscriptions.set(sourceId, sourceMap);
  }

  let cardSet = sourceMap.get(cardId);
  if (!cardSet) {
    cardSet = new Set();
    sourceMap.set(cardId, cardSet);
  }

  cardSet.add(fn);

  return () => {
    cardSet?.delete(fn);
    if (cardSet?.size === 0) {
      sourceMap?.delete(cardId);
    }
    if (sourceMap?.size === 0) {
      _subscriptions.delete(sourceId);
    }
  };
}

/**
 * 分发数据——协议解析器输出后调用。
 * Phase 5 盲区 8（P1）：包 try/catch——一个 buggy 订阅者不崩管道。
 */
export function dispatch(packet: DataPacket): void {
  // 精确匹配 cardId
  const sourceMap = _subscriptions.get(packet.sourceId);
  if (!sourceMap) return;

  const subscribers = new Set<DataSubscriber>();

  // cardId 精确匹配
  const cardSet = sourceMap.get(packet.cardId);
  if (cardSet) {
    for (const fn of cardSet) subscribers.add(fn);
  }

  // "*" 通配符——订阅该 source 全部数据
  const wildcardSet = sourceMap.get("*");
  if (wildcardSet) {
    for (const fn of wildcardSet) subscribers.add(fn);
  }

  for (const fn of subscribers) {
    try {
      fn(packet);
    } catch (err) {
      console.error(`[DataDispatch] 订阅者出错 (sourceId=${packet.sourceId}, cardId=${packet.cardId}):`, err);
    }
  }
}

/**
 * 分发协议解析后的多字段结果。
 * ProtocolRegistry 的 parseLine 返回数组 → 对每个元素调 dispatch。
 */
export function dispatchParsed(
  sourceId: string,
  parsed: Array<{ cardId?: string; value?: unknown; fields?: Record<string, unknown> }>,
  raw?: string
): void {
  for (const item of parsed) {
    if (!item.cardId) continue;
    dispatch({
      sourceId,
      cardId: item.cardId,
      fields: item.fields ?? { value: item.value },
      raw,
    });
  }
}

/** 取消订阅指定 sourceId 的所有订阅者——串口关闭时调用 */
export function unsubscribeAll(sourceId: string): void {
  _subscriptions.delete(sourceId);
}

/** 当前活跃订阅数（调试用） */
export function getSubscriberCount(): number {
  let count = 0;
  for (const sourceMap of _subscriptions.values()) {
    for (const cardSet of sourceMap.values()) {
      count += cardSet.size;
    }
  }
  return count;
}

/** 清空所有订阅（测试用） */
export function clearSubscriptions(): void {
  _subscriptions.clear();
}
