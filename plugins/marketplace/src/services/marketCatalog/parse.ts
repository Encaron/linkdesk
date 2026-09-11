/**
 * parse — marketplace.json 文本 → 内存对象（最小结构校验 + 逐条白名单归一）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketCatalog.ts` 原样搬出，零行为变更。
 */

import type { CatalogEntry, ParseResult } from "./types";

/** parse marketplace.json 文本——最小结构校验（plugins 数组存在 + 元素有 id） */
export function parseCatalog(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: "invalid-json" };
  }
  if (typeof json !== "object" || json === null) return { ok: false, reason: "not-object" };
  const obj = json as { plugins?: unknown };
  if (!Array.isArray(obj.plugins)) return { ok: false, reason: "no-plugins-array" };
  const plugins = obj.plugins
    .map(normalizeEntry)
    .filter((p): p is CatalogEntry => p !== null);
  return { ok: true, catalog: { version: (obj as { version?: string }).version, updatedAt: (obj as { updatedAt?: string }).updatedAt, plugins } };
}

/** 单条归一——补 author/iconSource 形态缺省；无 id/name/version/downloadUrl 者丢弃（不崩其余） */
function normalizeEntry(raw: unknown): CatalogEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as CatalogEntry;
  if (typeof r.id !== "string" || !r.id || typeof r.name !== "string" || typeof r.version !== "string") {
    return null;
  }
  return {
    id: r.id,
    name: r.name,
    version: r.version,
    description: r.description,
    author: r.author,
    icon: r.icon,
    iconSource: r.iconSource,
    category: r.category,
    categories: Array.isArray(r.categories) ? r.categories : undefined,
    downloadUrl: r.downloadUrl,
    size: r.size,
    publishedAt: r.publishedAt,
    minAppVersion: r.minAppVersion,
    versions: Array.isArray(r.versions) ? r.versions : undefined,
    readmeUrl: r.readmeUrl,
    screenshots: Array.isArray(r.screenshots) ? r.screenshots : undefined,
    license: r.license,
    repository: r.repository, // E6#77 乙：作者声明的插件主页（本 whitelist 漏字段 = 静默丢，务必同步）
    sourceName: undefined, // 合并注入——parse 阶段不填
    official: undefined, // 同上：来源身份是合并时语义
  };
}
