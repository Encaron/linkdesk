/**
 * marketCatalog — 目录纯数据域（零 window/timer/IO 副作用，vitest 直测）。
 * E6#29 marketplace.json 格式权威字段（01-GitHub-Releases方案.md §三/3.2）：
 *   顶层 { version?, updatedAt?, plugins[] }；条目 = id/name/version/description/author/
 *   icon+iconSource/downloadUrl/size/publishedAt/minAppVersion，扩展纯增量：
 *   versions[]/readmeUrl/screenshots[]/license/categories[]（旧条目不填不崩）。
 *
 * 本模块只做「格式→内存对象」的纯变换（parse/normalize/merge/compare/源 URL 归一），
 * 运行时拉取/缓存/配置读写 = marketSources.ts（消费本模块纯函数，jsdom 可 mock）。
 *
 * 🔴 版本比较不 import src/core（插件独立铁律——零 @src/core）。本地实现与壳
 * semverUtils 同语义（忽略 v 前缀 / 缺位补 0 / 预发布逐位），双实现分处两进程域。
 */

/** 市场目录单条目——marketplace.json plugins[] 元素（作者侧声明，sourceId 为合并时注入） */
export interface CatalogEntry {
  id: string;
  name: string;
  version: string;
  description?: string;
  /** author 兼容两种形态：文档形态 {name,url} / 旧平铺 string */
  author?: { name?: string; url?: string } | string;
  icon?: string;
  /** "lucide" | "codicon" | "url"——url 形态 = 作者自制彩色图直接 <img>（E6#29c/06-图标.md） */
  iconSource?: "lucide" | "codicon" | "url";
  category?: string;
  categories?: string[];
  downloadUrl?: string;
  size?: number;
  publishedAt?: string;
  minAppVersion?: string;
  /** 版本历史（最新在前）——版本下拉数据源（E6#29c） */
  versions?: Array<{ version: string; downloadUrl?: string; publishedAt?: string; changelog?: string }>;
  readmeUrl?: string;
  screenshots?: string[];
  license?: string;
  /** 合并注入：条目来源仓库名（owner/repo）——用户知道装的是谁的（E6#30c 来源标注） */
  sourceName?: string;
}

/** marketplace.json 根结构 */
export interface MarketplaceCatalog {
  version?: string;
  updatedAt?: string;
  plugins: CatalogEntry[];
}

/** parse 结果——失败给原因（#30f 目录损坏空态判断依据，不抛） */
export type ParseResult =
  | { ok: true; catalog: MarketplaceCatalog }
  | { ok: false; reason: string };

/** 官方默认源（mockup/01 §6.2 定死：encaron/linkdesk-marketplace）——恒拉取、UI「内置」锁 */
export const OFFICIAL_SOURCE_URL =
  "https://raw.githubusercontent.com/encaron/linkdesk-marketplace/main/marketplace.json";

/** GitHub 仓库主页 URL（https://github.com/owner/repo）→ raw marketplace.json 直链（HEAD 免猜分支） */
export function repoUrlToRawUrl(repoUrl: string): string | null {
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)/.exec(repoUrl.trim());
  if (!m) return null;
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/HEAD/marketplace.json`;
}

/** 已是 raw.githubusercontent 的 marketplace.json 直链？ */
export function isRawMarketplaceUrl(url: string): boolean {
  return /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/.*marketplace\.json$/.test(url.trim());
}

/** 把用户提供的源 URL 归一为可 fetch 的 marketplace.json 直链——仓库主页 URL 或已直链都收 */
export function normalizeSourceUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (isRawMarketplaceUrl(raw)) return raw;
  return repoUrlToRawUrl(raw);
}

/** GitHub 源身份归一——任何形态（github.com 仓库主页含 tree/blob 尾 / raw.githubusercontent.com
 * 直链含任意分支与路径尾）都归为小写 `owner/repo`。分支无关（main/HEAD 通吃）——URL 精确串比较
 * 会让「官方 main 直链 vs 仓库主页归一 HEAD」永不相等、官方源漏判（E6#30c 实测 bug）。返 null = 非 GitHub 源。
 * 只用于「是否同一源 / 是否官方」身份比较——fetch 仍走 normalizeSourceUrl 产物（形态不可互换）。 */
export function sourceKeyOfUrl(url: string): string | null {
  const m = /^https?:\/\/(?:github\.com|raw\.githubusercontent\.com)\/([^/]+)\/([^/?#]+)/i.exec(url.trim());
  if (!m) return null;
  return `${m[1].toLowerCase()}/${m[2].toLowerCase()}`;
}

/** 来源标注名：从 raw URL 抽 owner/repo（无 github raw 形态 → 回退 host+路径前两段） */
export function sourceNameOfUrl(rawUrl: string): string {
  const m = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)/.exec(rawUrl);
  if (m) return `${m[1]}/${m[2]}`;
  const h = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)/.exec(rawUrl);
  return h ? `${h[1]}/${h[2]}/${h[3]}` : rawUrl;
}

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
    sourceName: undefined, // 合并注入——parse 阶段不填
  };
}

/* ═══ 版本比较——本地纯实现（壳同语义：忽略 v 前缀 / 缺位补 0 / 预发布） ═══ */

function parseNum(s: string): number {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}

function compareNumeric(a: string, b: string): number {
  const A = a.split(".").map(parseNum);
  const B = b.split(".").map(parseNum);
  const len = Math.max(A.length, B.length);
  for (let i = 0; i < len; i++) {
    const x = A[i] ?? 0;
    const y = B[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

/** semver 比较——返回 -1/0/1。主版本号相等才比预发布；有预发布 < 无预发布 */
export function compareVersions(a: string, b: string): number {
  const va = a.trim().replace(/^[vV]/, "");
  const vb = b.trim().replace(/^[vV]/, "");
  const pa = va.includes("-") ? va.split("-") : null;
  const pb = vb.includes("-") ? vb.split("-") : null;
  const core = compareNumeric(pa ? pa[0] : va, pb ? pb[0] : vb);
  if (core !== 0) return core;
  const ha = pa ? pa[1] ?? "" : "";
  const hb = pb ? pb[1] ?? "" : "";
  if (ha === hb) return 0;
  if (!ha) return 1; // a 正式 > b 预发布
  if (!hb) return -1;
  return ha < hb ? -1 : 1;
}

/** 版本比较辅助：a > b？ */
export function isVersionNewer(a: string, b: string): boolean {
  return compareVersions(a, b) > 0;
}

/** 多源合并去重——同 id 取 semver 高者；版本平手用先出现的源（官方排前 → 官方胜出） */
export function mergeCatalogs(sources: Array<{ sourceName: string; entries: CatalogEntry[] }>): CatalogEntry[] {
  const byId = new Map<string, CatalogEntry>();
  for (const src of sources) {
    for (const e of src.entries) {
      const prev = byId.get(e.id);
      if (!prev) {
        byId.set(e.id, { ...e, sourceName: src.sourceName });
      } else if (isVersionNewer(e.version, prev.version)) {
        byId.set(e.id, { ...e, sourceName: src.sourceName });
      }
    }
  }
  return [...byId.values()];
}
