/**
 * 来源信任与两条开关——**信任状态的唯一 store**（spec §3.5/§3.8）。
 *
 * 两个正交开关（D5 拍板，互不替代、可同时开）：
 *   `app.pluginUpdate.silentOfficial`（默认**开**）→ 官方目录的**同源更新**不逐项询问
 *   `app.pluginUpdate.silentTrustedSources`（默认**关**）→ 已信任第三方来源的**同源更新**不逐项询问
 * 两者都只管**更新**；首装 / 来源变更 / 降级恒问（policy.ts 里那些分支不看开关）。
 *
 * 信任清单：
 *   · 真身 = 配置数组 `app.pluginUpdate.trustedSources`（sourceId 列表，**唯一 store**）；
 *   · 行数据（url/repo/publisher/插件数）= 来源身份账本 `listKnownSources()` 聚合；
 *   · 官方 = `fixed: true`、恒 trusted（不可关、不在数组里）——但**官方是否免问只看 `silentOfficial`**
 *     （见 policy.ts 文件头的正交铁律）。
 *   · 撤销/失效：来源变更（url/repo/publisher 变了）在 policy 里恒 ask，信任天然不生效——
 *     ⛔ 不需要也不允许在 trust.ts 里再写一套「失效判定」（第二个判定点 = 两个真相）。
 *
 * ⚠️ 命名：`trust` 只表示「这个来源被用户信任过」，⛔ 不表示「安全」——真正的安全在 P1 的
 *   HTTPS/sha256/来源账本与 P2 的权限系统（spec §七）。
 */

import { getConfigurationValue, setConfigurationValue } from "../../configuration/ConfigurationService";
import i18n from "../../../../i18n";
import type { PluginSourceIdentity, PluginSourceTrustEntry, PluginUpdatePolicy } from "../../../api/linkdesk-api/types";
import { listKnownSources } from "./ledger";
import { OFFICIAL_SOURCE_ID } from "./policy";
import type { KnownSource } from "./types";

/** 两条开关的配置键——声明方（`src/App/config/pluginUpdate.ts`）与读取方共用这一份常量 */
export const POLICY_KEYS = {
  silentOfficial: "app.pluginUpdate.silentOfficial",
  silentTrustedSources: "app.pluginUpdate.silentTrustedSources",
  trustedSources: "app.pluginUpdate.trustedSources",
  /** 已登记的市场目录源 id 列表（D9′ 零插件路径：`plugins.addSource` 写它；市场/浏览面读它） */
  sources: "app.pluginUpdate.sources",
} as const;

/** 默认值——**唯一来源**：配置声明用它、读取兜底也用它（⛔ 两处各写一遍数字） */
export const DEFAULT_POLICY: PluginUpdatePolicy = {
  silentOfficial: true,
  silentTrustedSources: false,
};

/** 官方固定信任行——清单里恒有这一行 */
const OFFICIAL_TRUST_ENTRY: PluginSourceTrustEntry = {
  sourceId: OFFICIAL_SOURCE_ID,
  url: "https://github.com/Encaron/linkdesk-marketplace",
  trusted: true,
  fixed: true,
};

/** 读两条开关（配置未注册时回落到 `DEFAULT_POLICY`——同一份常量） */
export function getUpdatePolicy(): PluginUpdatePolicy {
  const silentOfficial = getConfigurationValue<boolean | undefined>(POLICY_KEYS.silentOfficial);
  const silentTrustedSources = getConfigurationValue<boolean | undefined>(POLICY_KEYS.silentTrustedSources);
  return {
    silentOfficial: typeof silentOfficial === "boolean" ? silentOfficial : DEFAULT_POLICY.silentOfficial,
    silentTrustedSources:
      typeof silentTrustedSources === "boolean" ? silentTrustedSources : DEFAULT_POLICY.silentTrustedSources,
  };
}

/** 写两条开关（部分更新）；返回写后全量 */
export async function setUpdatePolicy(patch: Partial<PluginUpdatePolicy>): Promise<PluginUpdatePolicy> {
  if (typeof patch.silentOfficial === "boolean") {
    await setConfigurationValue(POLICY_KEYS.silentOfficial, patch.silentOfficial);
  }
  if (typeof patch.silentTrustedSources === "boolean") {
    await setConfigurationValue(POLICY_KEYS.silentTrustedSources, patch.silentTrustedSources);
  }
  return getUpdatePolicy();
}

/** 信任清单的 sourceId 数组（配置值；脏值过滤） */
function readTrustedIds(): string[] {
  const raw = getConfigurationValue<unknown>(POLICY_KEYS.trustedSources);
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
}

/** 某来源是否被信任——官方恒 true（fixed）；其余看配置数组 */
export function isSourceTrusted(sourceId: string): boolean {
  if (sourceId === OFFICIAL_SOURCE_ID) return true;
  return readTrustedIds().includes(sourceId);
}

/**
 * 来源显示名——**壳解析的单一来源**（⛔ 市场拼、⛔ 各面各推导）。
 * 顺序：官方固定词 → `repo`（owner/repo 最可读）→ URL host → sourceId 兜底。
 */
export function sourceLabel(source: PluginSourceIdentity): string {
  if (source.id === OFFICIAL_SOURCE_ID) return i18n.t("官方目录");
  if (source.repo) return source.repo;
  try {
    return new URL(source.url).host || source.id;
  } catch {
    return source.id;
  }
}

/** 账本条目 → 信任清单行（官方 fixed 行在前，其余按 sourceId 序 = listKnownSources 的确定性顺序） */
function toTrustEntry(source: KnownSource, trustedIds: string[]): PluginSourceTrustEntry {
  return {
    sourceId: source.sourceId,
    url: source.url,
    repo: source.repo,
    publisher: source.publisher,
    trusted: source.sourceId === OFFICIAL_SOURCE_ID || trustedIds.includes(source.sourceId),
    fixed: source.sourceId === OFFICIAL_SOURCE_ID ? true : undefined,
    seenAt: source.lastSeenAt ? Date.parse(source.lastSeenAt) || undefined : undefined,
  };
}

/**
 * 读信任清单——官方行恒在；其余 = 账本已知来源。
 * 配置里有、账本里没有的 sourceId **不渲染**（没有 url 就没有可展示的事实；
 * 这种情况只可能来自手改配置文件，policy 也不会因此免问——isTrusted 仍为 true，
 * 但来源变更判定会先命中 ask，不会因此静默）。
 */
export async function listSourceTrust(): Promise<PluginSourceTrustEntry[]> {
  const trustedIds = readTrustedIds();
  const known = await listKnownSources();
  const rows: PluginSourceTrustEntry[] = [OFFICIAL_TRUST_ENTRY];
  for (const source of known) {
    if (source.sourceId === OFFICIAL_SOURCE_ID) continue;
    rows.push(toTrustEntry(source, trustedIds));
  }
  return rows;
}

/**
 * 显式信任一个来源——只接受**账本已知**的来源（官方不需要、未知来源没有 url 可记）。
 * 返回写后清单。
 */
export async function trustSource(entry: {
  sourceId: string;
  url: string;
  repo?: string;
  publisher?: string;
}): Promise<PluginSourceTrustEntry[]> {
  if (entry.sourceId === OFFICIAL_SOURCE_ID) return listSourceTrust();
  // 🔴 允许**账本里还没有**的来源（2026-11-24 实机）：确认卡上的「以后此来源不再询问」出现在
  // **首装**时——那时这个来源还没装过任何插件 ⇒ 账本没有它。若这里抛「未知来源」，
  // 用户勾了等于没勾（还被吞掉一个 promise）。信任清单只存 id，先记下即可；
  // 等首装成功、账本学到该来源后，清单自然会把它显示出来（来源变更仍会自动回到必问）。
  const trusted = readTrustedIds();
  if (!trusted.includes(entry.sourceId)) {
    await setConfigurationValue(POLICY_KEYS.trustedSources, [...trusted, entry.sourceId]);
  }
  return listSourceTrust();
}

/** 撤销信任（官方 fixed 不可撤销）；返回写后清单 */
export async function untrustSource(sourceId: string): Promise<PluginSourceTrustEntry[]> {
  if (sourceId === OFFICIAL_SOURCE_ID) return listSourceTrust();
  const trusted = readTrustedIds();
  if (trusted.includes(sourceId)) {
    await setConfigurationValue(
      POLICY_KEYS.trustedSources,
      trusted.filter((id) => id !== sourceId),
    );
  }
  return listSourceTrust();
}
