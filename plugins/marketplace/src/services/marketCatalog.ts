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
  /** "lucide" | "codicon" | "url"——url 形态 = 作者自制彩色图以 img 元素直载（E6#29c/06-图标.md） */
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
  /** 合并注入：该胜出条目来自官方默认源（E6#30.8f「官方发布」徽标——官方身份随条目携带，UI 零再判） */
  official?: boolean;
  /** 合并注入：该胜出条目来源的可 fetch URL——判 http 明文源用（E6#71k：http 源信任不可记忆，
   *  见 08-信任与安全 §四.2。sourceName 对 http/https 同形，判不出明文，故恒带 URL） */
  sourceUrl?: string;
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
    official: undefined, // 同上：来源身份是合并时语义
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

/* ═══ E6#33a 稳定版判定（05 §二·四——发现/自动更新默认只看稳定版，beta 不提示） ═══ */

/** 是否 prerelease（含 "-" 预发布标识；build metadata "+" 截断后判） */
export function isPrereleaseVersion(v: string): boolean {
  return v.trim().replace(/^[vV]/, "").split("+")[0].includes("-");
}

/** 条目稳定版最新——versions[] 最新在前取首个非 prerelease；旧格式无 versions[] → 顶层 version（本身非 prerelease 才返回）。
 *  undefined = 条目无稳定版可提示（§二·四：全 prerelease 不提示，beta 只走手动安装 #33c 版本下拉）。 */
export function stableLatestVersion(entry: CatalogEntry): string | undefined {
  const list = entry.versions && entry.versions.length > 0 ? entry.versions.map((x) => x.version) : [entry.version];
  for (const v of list) {
    if (!isPrereleaseVersion(v)) return v;
  }
  return undefined;
}

/** 指定版本的下载地址（E6#33b/c——升级动作/版本下拉选哪版取哪版 downloadUrl，不默认顶层 beta）。
 *  versions[] 命中该版本（semver 等判，容 v 前缀）且带 downloadUrl → 用之；versions[] 无命中或该版本无
 *  downloadUrl → 仅当目标 == 顶层 version 借 entry.downloadUrl（顶层即最新）；否则 undefined（诚实——不发错包）。
 *  旧格式无 versions[] → 目标须 == 顶层 version 才返回。 */
export function versionDownloadUrl(entry: CatalogEntry, version: string): string | undefined {
  if (entry.versions && entry.versions.length > 0) {
    const hit = entry.versions.find((v) => v.downloadUrl && compareVersions(v.version, version) === 0);
    if (hit) return hit.downloadUrl;
  }
  return compareVersions(entry.version, version) === 0 ? entry.downloadUrl : undefined;
}

/** 相对本地版本判定「可更新」（E6#33b——UI 常驻徽标/升级入口 + #33d autoUpdate 消费同一判据）。
 *  语义 = planDiscovery 成员判定同源：stable-only（§二·四，beta 不提示）+ semver.gt 唯一判定（§一·三）。
 *  返回该可更新的远端稳定版；无本地版本 / 不比本地高 / 无稳定版 → undefined（不提示）。
 *  视图层消费此单函数即与发现/铃铛同判据——杜绝「探索徽标 top-beta 而详情/铃铛 stable 不提示」的判定分裂。
 *  目录条目缺失/未上架 → undefined（§二·五——下架不提示；调用方可不守卫直传 Map.get 结果）。 */
export function updateToVersion(entry: CatalogEntry | undefined, localVersion?: string): string | undefined {
  if (!entry || !localVersion) return undefined;
  const remote = stableLatestVersion(entry);
  if (remote === undefined) return undefined;
  return isVersionNewer(remote, localVersion) ? remote : undefined;
}

/** 版本下拉可选单条（E6#33c——05 §四：下拉每条 {version, downloadUrl, publishedAt?, changelog?}，选中哪条拉哪条） */
export interface CatalogVersionChoice {
  version: string;
  downloadUrl: string;
  publishedAt?: string;
  changelog?: string;
}

/** 版本下拉可选集（E6#33c——UI「装哪个版本/升到哪版」选项源，05 §四）。
 *  versions[] 全集（含 beta——§二·四 手动可选）过滤出**有可解析 downloadUrl** 的版本（无 URL 旧版诚实
 *  不出现在下拉——选了也发不了包，不发错包即 versionDownloadUrl 顶层兜底同一语义）；
 *  semver 倒序最新在前（目录乱序/旧格式也能给对默认值，平手保序）；旧格式无 versions[] → 只顶层一条
 *  （length 1 = 调用方不显示下拉）；顶层 version 不在 versions[] 时补入（顶层即最新——下拉恒含可装最新）。
 *  无条目/全无可下版本 → []。 */
export function selectableVersions(entry: CatalogEntry | undefined): CatalogVersionChoice[] {
  if (!entry) return [];
  const rows = entry.versions && entry.versions.length > 0 ? entry.versions : [];
  const out: CatalogVersionChoice[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row?.version || seen.has(row.version)) continue;
    const url = versionDownloadUrl(entry, row.version);
    if (!url) continue;
    seen.add(row.version);
    out.push({ version: row.version, downloadUrl: url, publishedAt: row.publishedAt, changelog: row.changelog });
  }
  // 顶层 version（最新）不在 versions[] 时补入——旧格式/作者漏列时下拉仍含当前可装最新
  if (entry.version && !seen.has(entry.version)) {
    const url = versionDownloadUrl(entry, entry.version);
    if (url) {
      out.push({ version: entry.version, downloadUrl: url, publishedAt: entry.publishedAt });
    }
  }
  if (out.length < 2) return out;
  return [...out].sort((a, b) => compareVersions(b.version, a.version)); // 倒序最新在前（相等保序——稳定排序）
}

/** E6#33c pinnedVersion 记账（05 §二·九——版本动作落地 appliedVersion 后应记的钉）：
 *  目录有稳定最新（stableLatestVersion 存在）且落地到它 → null（清钉——追最新，autoUpdate 恢复）；
 *  停在非稳定最新（旧版/beta/中间版）→ 记 appliedVersion（暂停 autoUpdate，#33d 消费）；
 *  目录无稳定版可比（全 beta）→ undefined（无 auto-update 目标可防，不落盘不写空钉）。 */
export function pinnedAfterApply(entry: CatalogEntry | undefined, appliedVersion: string): string | null | undefined {
  const stable = entry ? stableLatestVersion(entry) : undefined;
  if (stable === undefined) return undefined;
  return compareVersions(appliedVersion, stable) === 0 ? null : appliedVersion;
}

/** 多源合并去重——同 id 取 semver 高者；版本平手用先出现的源（官方排前 → 官方胜出）。
 *  E6#30.8f：来源记录可带 official 标记，胜出条目的来源身份（sourceName + official）随条目携带——UI 读
 *  单一字段即可显示「官方发布」徽标，不把官方身份跟"源 URL 长啥样"耦合回视图层。
 *  E6#71k：连带携带 sourceUrl（同时注入，同一条记录的两个面）——信任门判 http 明文源需要它，
 *  sourceName 对 http/https 同形判不出。 */
export function mergeCatalogs(
  sources: Array<{ sourceName: string; sourceUrl?: string; official?: boolean; entries: CatalogEntry[] }>,
): CatalogEntry[] {
  const byId = new Map<string, CatalogEntry>();
  for (const src of sources) {
    for (const e of src.entries) {
      const prev = byId.get(e.id);
      const carried: CatalogEntry = { ...e, sourceName: src.sourceName, sourceUrl: src.sourceUrl };
      if (src.official) carried.official = true;
      if (!prev) {
        byId.set(e.id, carried);
      } else if (isVersionNewer(e.version, prev.version)) {
        byId.set(e.id, carried);
      }
    }
  }
  return [...byId.values()];
}
