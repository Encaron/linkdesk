/**
 * sourceConfig — 从配置里读出「本次要拉哪些源」（官方恒在 + 作者源，按身份去重）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketSources.ts` 原样搬出，零行为变更。
 */

import { OFFICIAL_SOURCE_URL, normalizeSourceUrl } from "../marketCatalog";
import { urlSourceKey } from "@linkdesk/ui"; // E6#30c：URL 源身份（owner/repo、分支无关）——@linkdesk/ui 共享单一实现（设置行内判重同此钥匙）

/** 官方源恒在 + 配置 marketplace.marketplaceSources 作者源（URL-string 或 {url} 形态兼容归一）——去重，官方排前。
 *  官方/去重判别走 urlSourceKey（owner/repo 身份、分支无关）——仓库主页形态的官方（归一成 HEAD）与官方
 *  main 直链是同一源，精确串比较会漏判导致官方被二次拉取（E6#30c 实测）。 */
export async function getSourceUrls(): Promise<string[]> {
  const officialKey = urlSourceKey(OFFICIAL_SOURCE_URL);
  const urls: string[] = [OFFICIAL_SOURCE_URL];
  const seen = new Set<string>(officialKey ? [officialKey] : []);
  try {
    const raw = await window.linkdesk?.configuration?.get<unknown>("marketplace.marketplaceSources");
    const list = Array.isArray(raw)
      ? raw.map((it) => (typeof it === "string" ? it : (it as { url?: unknown })?.url ?? ""))
      : [];
    for (const item of list) {
      if (typeof item !== "string") continue;
      const norm = normalizeSourceUrl(item);
      const key = norm ? urlSourceKey(norm) : null;
      if (!norm || !key || seen.has(key)) continue;
      seen.add(key);
      urls.push(norm);
    }
  } catch {
    /* 配置面不可用/未知键 → 仅官方源（不崩） */
  }
  return urls;
}

/** 读配置作者源（原始 URL 串、排除官方项、按身份去重）——marketplace 弹窗/设置行读当前列表用。
 *  config.get 返回 effective（无 override 时 = default [官方源]）——官方恒不入存盘（读侧 getSourceUrls 前置），
 *  故此处按 owner/repo 身份滤官方（任何形态：main/HEAD 直链、仓库主页）；残留（历史污染）在此滤除，
 *  且 SearchView 下次弹窗添加时 current 不带残留 → 重写配置自动清污。返回用户粘的原始形态（仓库主页 URL
 *  保持原样），新增时原样回写、只此一份落盘。 */
export async function readConfiguredAuthorSources(): Promise<string[]> {
  let raw: unknown;
  try {
    raw = await window.linkdesk?.configuration?.get<unknown>("marketplace.marketplaceSources");
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const officialKey = urlSourceKey(OFFICIAL_SOURCE_URL);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of raw) {
    if (typeof it !== "string" || !it) continue;
    const key = urlSourceKey(it);
    if (!key || (officialKey !== null && key === officialKey) || seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
