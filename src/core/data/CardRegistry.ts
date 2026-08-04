/**
 * 卡片注册表——Phase 5 柱子 5：骨架。
 * Phase 5 只定义 registry 接口，渲染留给 Phase 7。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子5
 *
 * Phase 7 做：react-grid-layout 工作台 + 卡片拖拽重排 + ProtocolRegistry → DataDispatch → 卡片消费端管道。
 */

import type React from "react";

/* ── 类型 ── */

export interface CardEntry {
  id: string;                        // 卡片类型 ID——如 "waveform" / "gauge" / "switch"
  name: string;                      // 显示名
  pluginId: string;                  // 所属插件
  component: React.ComponentType<{   // 卡片渲染组件（Phase 7 渲染）
    isActive: boolean;
    cardId: string;                  // 数据字段路由键
    fields: Record<string, unknown>; // DataDispatch 推送的数据
  }>;
  acceptsFields: string[];           // 它能消费哪些 cardId
  defaultSize?: { w: number; h: number };
  minSize?: { w: number; h: number };
}

/* ── Registry ── */

const _cards = new Map<string, CardEntry>();

/** 注册卡片——插件加载时 loader 调用 */
export function registerCard(entry: CardEntry): void {
  if (_cards.has(entry.id)) {
    console.warn(`[CardRegistry] 卡片 "${entry.id}" 重复注册——覆盖旧条目`);
  }
  _cards.set(entry.id, entry);
}

/** 注销卡片——卸载时调用 */
export function unregisterCard(cardId: string): boolean {
  return _cards.delete(cardId);
}

/** 注销插件的全部卡片 */
export function unregisterPluginCards(pluginId: string): void {
  for (const [id, entry] of _cards) {
    if (entry.pluginId === pluginId) {
      _cards.delete(id);
    }
  }
}

/** 获取单个卡片条目 */
export function getCard(cardId: string): CardEntry | undefined {
  return _cards.get(cardId);
}

/** 获取所有已注册卡片 */
export function getCards(): CardEntry[] {
  return Array.from(_cards.values());
}

/** 获取能消费指定 cardId 的卡片——DataDispatch 路由用（Phase 7） */
export function getCardsForField(cardId: string): CardEntry[] {
  return Array.from(_cards.values()).filter(
    (entry) => entry.acceptsFields.includes(cardId) || entry.acceptsFields.includes("*")
  );
}

/** 清空注册表（测试用） */
export function clearCards(): void {
  _cards.clear();
}
