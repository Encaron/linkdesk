/**
 * marketSourceAdd — marketplace 自有「加作者源」决策（纯函数域：零 IO 零 i18n 零 React）。
 * E6#30c + 万物皆可插件（2026-09-08 用户拍板）：把 SearchView AddSourcePopup.submit 的
 * 判重/拦截/追加决策抽纯，使 marketplace 的加源门不依赖 settings 插件即可被独立冒烟测试驱动
 * （判据 = 换/卸 settings 插件不影响 marketplace，见 plugin-independence-iron-law memory §插件互不依赖）。
 * 本文件 = marketplace 写路径唯一决策点；组件只把 reason 映射成 t() 文案、决策 ok 才落盘。
 * 🔒 身份规则同 E6#30c：官方源任何形态（仓库主页/HEAD 直链）按 owner/repo 身份（urlSourceKey，
 *    @linkdesk/ui 共享实现——设置行内判重/读边界同这把钥匙）判「已在列表」→ 官方恒不入册永不落盘。
 *    通过时 next = [...current, 用户粘的原始形态]（不归一——仓库主页保持主页，同读边界约定：原始形态只此一份落盘）。
 */

import { urlSourceKey } from "@linkdesk/ui";
import { OFFICIAL_SOURCE_URL, normalizeSourceUrl } from "./marketCatalog";

export type AddSourceRejectReason = "empty" | "bad-url" | "official" | "duplicate";

export type AddSourceDecision =
  | { ok: true; next: string[] }
  | { ok: false; reason: AddSourceRejectReason };

/** 加源决策——current = readConfiguredAuthorSources() 的现作者源（读边界已滤官方与同身份重复）。 */
export function decideAddSource(raw: string, current: string[]): AddSourceDecision {
  const input = raw.trim();
  if (!input) return { ok: false, reason: "empty" };
  if (!normalizeSourceUrl(input)) return { ok: false, reason: "bad-url" };
  const key = urlSourceKey(input);
  if (key === null) return { ok: false, reason: "bad-url" }; // normalize 已过 → 理论不可达（防御）
  if (urlSourceKey(OFFICIAL_SOURCE_URL) === key) return { ok: false, reason: "official" };
  if (current.some((s) => urlSourceKey(s) === key)) return { ok: false, reason: "duplicate" };
  return { ok: true, next: [...current, input] };
}
