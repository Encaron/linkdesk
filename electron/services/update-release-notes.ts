/**
 * 发行说明取数腿——E6#57.8e（设计：[06-主软件更新/05-发行说明.md](../../docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/05-发行说明.md) §2.4
 * ＋ [07-数据流通格式.md](../../docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/07-数据流通格式.md) §一/§三/§4.1）。
 *
 * 干什么：把 GitHub Releases 拉回来（**最多 30 条历史**）、在本地存一份、并按请求挑出一版的正文。
 * 谁是消费方：壳渲染的发行说明标签页（#57.13）——三态（加载中/有内容/空态）由渲染侧画，
 * 本腿只管「给数据」或「抛错」。
 *
 * 🔴 **为什么在主进程**（05 §2.4 的 (a)/(b) 腿判定，2026-09-12 用户拍板走 (a)）：
 * ① 缓存要落 `{userData}`——**只有主进程写得了**；② 主进程出网走 `main-fetch.ts`（E6#76）
 * 自动继承 Windows 系统代理；③ 与检查腿共用同一份代理语义与失败归因，不会出现
 * 「检查更新连得上、发行说明连不上」这种没法解释的分裂。
 *
 * 🔴 **六条不出声的坑，本文件各有防线**：
 * ① **缓存路径 = `{userData}/update/`**（与安装器同目录，走 `updateDownloadDir()` 唯一拼接口）
 *    ——**不是** 05 §2.4 原文写的 `updates/`（复数）。同一层摆两个只差一个字母的目录，
 *    以后每个人都要停下来问「这俩什么区别」。**安全性已核**：启动清理（`cleanupUpdateResidue`）
 *    只删两种东西——`.part` 半截文件、以及**版本号解析得出且方向是「降级」**的安装器；
 *    一个 JSON 文件名解析不出安装器版本 ⇒ 被 `continue` 跳过（`update-download.ts` 那段）。
 * ② **失效判据有两条，不是只有 24h**：`24h 过期` **＋「所请求的那一版不在缓存里 ⇒ 视为失效」**。
 *    第二条救的是**刚更新完的首次启动**——缓存可能是升级前拉的，里面根本没有你刚装上的那一版，
 *    而那正是首启自动弹的场景（05 §2.5）⇒ 只按 24h 判会给用户看上一版的说明。
 *    ⚠️ 任务书 05 §2.4 写的是「键 = 版本列表 hash」——**hash 没有比对物**（缓存里存的就是列表
 *    本身），存一个 hash 字段纯属装饰；那句话的真意思（**由版本列表决定这份缓存还算不算数**）
 *    落成上面第二条判据。已记账。
 * ③ **缓存只由成功的网络结果写**：兜底走的缓存**不回头刷新 `fetchedAt`**——否则一次断网就会
 *    把「24h」无限续命，缓存永远不会因为过期而被替换（静默变成永久陈旧）。
 * ④ **缓存写失败不拦这次请求**：缓存是省流量与断网兜底的手段，**不是正确性的一环**——
 *    写不进去（磁盘满/无权限）时用户照样该看到发行说明。
 * ⑤ **预发布与草稿不进列表**（01 §2.6 只认 stable：软件永远不会装它们，列在历史里是误导）；
 *    但**非 SemVer 的 tag 不丢**，只是排在末尾——不许静默地把发布侧打错的 tag 从历史里抹掉
 *    （与检查腿把 `version-unparsable`**单列成一类**同一立场）。
 * ⑥ **请求了某一版、但列表里没有 ⇒ 回落 `[0]`**，且返回的 `version` 字段会**暴露这个事实**
 *    （`version !== 你请求的那个`，渲染侧想较真可较真）。不整页报错：这页本质是一份**文档**
 *    （左边列版本、右边看正文），不是一次「查表」——为一个版本号没对上就把整页废掉，代价太大。
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { loadProduct } from '../product.js';
import { updateDownloadDir } from './update-download.js';
import {
  INVALID_RESPONSE_MESSAGE,
  META_TIMEOUT_MS,
  NETWORK_MESSAGE,
  NOT_FOUND_MESSAGE,
  classifyHttpFailure,
  fetchWithTimeout,
} from './update-http.js';
import { compareVersions, parseStrictSemver } from '../../src/core/utils/plugin/semverUtils.js';
import { UpdateLegError } from './update-service.js';
import type { ReleaseNotes, UpdateError } from '../../src/core/types/ipc/update';

/** 一次拉多少条历史——05 §2.4 定死 30（软件内看前 30 条精选，浏览器看全量，02 §2.4） */
const PER_PAGE = 30;

/** 缓存文件名（落在 `updateDownloadDir()` = `{userData}/update/`，见文件头 ①） */
const CACHE_FILE_NAME = 'releases-cache.json';

/** 缓存有效期——05 §2.4 定死 24h（对标插件目录缓存惯例） */
const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** 归一化后的单条——API 的原始字段名（`tag_name`/`published_at`/`html_url`）在这里**收口一次**，
 *  缓存与返回体都不再碰它们（将来 API 改名只改这一处）。 */
interface CachedRelease {
  /** SemVer 规范形（无 v 前缀）；tag 不合规范时 = 原 tag 去掉前导 v */
  version: string;
  publishedAt: string;
  body: string;
  htmlUrl: string;
}

/** 缓存文件形状——只有两件事：这份数据什么时候拉的、里面是什么 */
interface CacheFile {
  /** ISO 时间戳——**唯一**的过期判据来源（见文件头 ②③） */
  fetchedAt: string;
  releases: CachedRelease[];
}

/**
 * 取数腿依赖——生产缺省即真值源；注入只为单测（定 URL / 定目录 / 定时间）。
 *
 * ⚠️ `now` 必须可注入：24h 过期那条判据**不能用「真等 24 小时」来验**，也不能靠假定时器
 * （本文件的测试要在真本地 HTTP 服务上跑，假定时器会把 I/O 一起冻住）——
 * 注入一个时间源是唯一能让「过期/未过期」两侧都确定性复现的办法。
 */
export interface ReleaseNotesDeps {
  /** 更新源 URL（02 §2.2 单一来源 = `product.json.updateUrl`，非硬编码） */
  getUpdateUrl?: () => string;
  /** 缓存目录（缺省 `{userData}/update`，见文件头 ①） */
  getCacheDir?: () => string;
  /** 时间源（缺省 `Date.now`）——只为让 24h 过期可确定性单测 */
  now?: () => number;
  /** 超时预算（缺省 `META_TIMEOUT_MS`）——生产不传，唯一用途是让「超时归 network」可确定性单测 */
  timeoutMs?: number;
}

/**
 * 拉发行说明——`version` 不传 = 最近一版（07 §4.1）。
 * `deps.force = true`（04「发行说明刷新按钮」）＝ 跳过缓存命中短路，**绕过 24h 现拉最新**：
 * 「新鲜」与「含不含所请求那版」两条判据在 force 下都无意义——用户明说了「现在就去拿最新的」。
 * 🔴 两条铁律**不变**：成功仍写缓存（③）、失败仍走缓存兜底且不回写 `fetchedAt`（④）。
 *
 * 失败语义（07 §4.1 定死）：**失败 → 缓存兜底；无缓存才抛**。抛的是 `UpdateLegError`
 * （带 `UpdateError` 明细，码取自 07 §三 的固定码集，本文件不新造码）。
 * ⚠️ 渲染侧那三态里的空态**不显示这条 message**（05 §2.4 Frame 2 是固定文案 + `[重试]`）——
 * 本 message 是给日志与排障的，所以「跨 IPC 抛出时明细被 Electron 包成字符串」这件事不影响用户。
 * （与 `ReleaseNotesDeps` 合用一个形参位只为不破坏既有调用序——force 不是注入依赖，属请求选项。）
 */
export async function fetchReleaseNotes(
  version?: string,
  deps: ReleaseNotesDeps & { force?: boolean } = {},
): Promise<ReleaseNotes> {
  const getUpdateUrl = deps.getUpdateUrl ?? (() => loadProduct().updateUrl);
  const getCacheDir = deps.getCacheDir ?? updateDownloadDir;
  const now = deps.now ?? (() => Date.now());
  const timeoutMs = deps.timeoutMs ?? META_TIMEOUT_MS;

  const cachePath = path.join(getCacheDir(), CACHE_FILE_NAME);
  const cached = await readCache(cachePath);
  const wanted = version ? normalizeTag(version) : undefined;

  // ── 缓存命中：新鲜 **且**（没点名要哪版 或 点的那版就在里面）⇒ 直接给，不出网 ──
  if (!deps.force && cached && isFresh(cached, now()) && (wanted === undefined || contains(cached, wanted))) {
    return buildReleaseNotes(cached.releases, wanted, 'cache');
  }

  // ── 出网。**失败走缓存兜底，无缓存才抛**（07 §4.1）──
  try {
    const releases = await fetchReleases(getUpdateUrl(), timeoutMs);
    await writeCache(cachePath, releases, now()); // 只有成功的网络结果才写（文件头 ③）
    return buildReleaseNotes(releases, wanted, 'network');
  } catch (e) {
    if (cached) {
      // 兜底时**不**回写 `fetchedAt`（文件头 ③）——一次断网不许把 24h 续命成永久。
      return buildReleaseNotes(cached.releases, wanted, 'cache');
    }
    throw e;
  }
}

// ─────────────────────────── 出网 + 解析 ───────────────────────────

/** 拉 + 解析——任何一类失败都抛 `UpdateLegError`（归因照共用表走，不另立一套） */
async function fetchReleases(updateUrl: string, timeoutMs: number): Promise<CachedRelease[]> {
  // 源没配 ⇒ 不拿空 URL 去 fetch（会抛成 network，把「没配置」说成「网络不好」）。
  // 归 `not-found` ——它的文案覆盖「不存在 / 尚未配置」两种子情形（与检查腿同款处置）。
  if (!updateUrl) throw legError('not-found', NOT_FOUND_MESSAGE);

  // 🔴 两段 try **刻意分开**（与检查腿同理由）：连不上（network）与「连上了但话听不懂」
  // （invalid-response）是两类完全不同的事故——合在一个 catch 里，第二种会被当成第一种，
  // 报错指向用户网络（错向归因）。
  let resp: Response;
  try {
    resp = await fetchWithTimeout(listUrl(updateUrl), timeoutMs);
  } catch {
    throw legError('network', NETWORK_MESSAGE); // 连不上 / 超时 / 代理未生效（发起阶段）
  }
  if (!resp.ok) {
    const failure = classifyHttpFailure(resp.status);
    throw legError(failure.code, failure.message);
  }

  let body: unknown;
  try {
    body = await resp.json();
  } catch {
    // 2xx 但响应体不是合法 JSON（GitHub 异常页 / 认证中间盒 / 半截响应）
    throw legError('invalid-response', INVALID_RESPONSE_MESSAGE);
  }

  const releases = normalizeList(body);
  // 数组本身不成立、或**一条都没解析出来** ⇒ 这一趟等于没拿到东西（不许当成「历史是空的」：
  // 空列表在界面上与「这个项目一个版本都没发过」不可分辨，而事实是数据坏了）。
  if (!releases) throw legError('invalid-response', INVALID_RESPONSE_MESSAGE);
  return releases;
}

/**
 * 列表 URL ——**从 `updateUrl` 推**，不写第二份仓库地址。
 *
 * 🔴 为什么不硬编码 `api.github.com/repos/<owner>/<repo>/releases`：那是**第二处真值源**，
 * 而仓库名已经改过一次（`serial-v3` → `linkdesk`）——两处漂了就是「检查更新能用、发行说明 404」
 * 这种没人能一眼看懂的分裂。`product.json.updateUrl` 已是「更新源」的唯一真相源（02 §2.2），
 * 检查腿打的是它的 `/latest` 端点，本条需要的是它的**列表**端点 ⇒ 去掉 `/latest` 后缀即可。
 * 没有 `/latest` 后缀时原样拼 `?per_page`（有人把 updateUrl 直接配成列表端点也照常工作）。
 */
function listUrl(updateUrl: string): string {
  return `${updateUrl.replace(/\/latest\/?$/, '')}?per_page=${PER_PAGE}`;
}

/**
 * 原始响应 → 归一化列表。**返回 null = 整个响应不成形状**（不是数组）；过滤掉坏条目后为空
 * 也算 null（见 `fetchReleases` 的注释）。
 *
 * 逐条丢弃的情形：不是对象 / 缺 `tag_name`/`published_at`/`html_url` / 草稿 / 预发布。
 * `body` 允许为空串（Release 只发 tag 不写说明是合法的）。
 */
function normalizeList(body: unknown): CachedRelease[] | null {
  if (!Array.isArray(body)) return null;

  const out: CachedRelease[] = [];
  for (const entry of body) {
    if (typeof entry !== 'object' || entry === null) continue;
    const r = entry as Record<string, unknown>;
    if (r.draft === true) continue; // 公开 API 本就不返回草稿；防御性（免得将来带 token 拉时漏进来）
    if (r.prerelease === true) continue; // 01 §2.6 只认 stable（文件头 ⑤）

    const tag = r.tag_name;
    const publishedAt = r.published_at;
    const htmlUrl = r.html_url;
    const text = r.body;
    if (typeof tag !== 'string' || !tag) continue;
    if (typeof publishedAt !== 'string' || !publishedAt) continue;
    if (typeof htmlUrl !== 'string' || !htmlUrl) continue;
    if (typeof text !== 'string') continue;

    // tag 自带预发布段（`v0.2.0-beta.1`）——两种信号都看，理由同检查腿：只看旗标会把
    // 「tag 写了 beta 但没勾 prerelease」的版本推给所有人。
    const parsed = parseStrictSemver(tag);
    if (parsed?.prerelease) continue;

    out.push({
      version: parsed ? parsed.version : normalizeTag(tag),
      publishedAt,
      body: text,
      htmlUrl,
    });
  }
  return out.length > 0 ? out : null;
}

/** tag → 规范版本形（`v0.1.55` → `0.1.55`；解析不出的 tag 只去掉前导 v，原样保留） */
function normalizeTag(tag: string): string {
  return parseStrictSemver(tag)?.version ?? tag.trim().replace(/^[vV]/, '');
}

// ─────────────────────────── 组装返回体 ───────────────────────────

/**
 * 归一化列表 → `ReleaseNotes`（07 §三）。
 *
 * 排序：SemVer 大的在前；**解析不出的 tag 一律排末尾**（文件头 ⑤）——于是 `[0]` 在正常项目里
 * 恒是最新正式版，而「tag 打错了」的那些仍然看得见、只是不会成为默认展示的那一版。
 * ⚠️ `Array.prototype.sort` 是**稳定**的，故末尾那批保持 API 给的相对顺序（GitHub 本身就是倒序）。
 *
 * 选中：`wanted` 命中就它；没点名 / 点的那版不在列表里 ⇒ `[0]`（文件头 ⑥）。
 */
function buildReleaseNotes(
  releases: CachedRelease[],
  wanted: string | undefined,
  source: 'network' | 'cache',
): ReleaseNotes {
  const sorted = [...releases].sort((a, b) => {
    const pa = parseStrictSemver(a.version);
    const pb = parseStrictSemver(b.version);
    if (pa && pb) return compareVersions(pb.version, pa.version);
    if (pa) return -1;
    if (pb) return 1;
    return 0;
  });

  const selected = (wanted && sorted.find((r) => r.version === wanted)) || sorted[0];

  return {
    source,
    version: selected.version,
    publishedAt: selected.publishedAt,
    body: selected.body,
    htmlUrl: selected.htmlUrl,
    historical: sorted.map((r) => ({ version: r.version, publishedAt: r.publishedAt })),
  };
}

// ─────────────────────────── 缓存读写 ───────────────────────────

/** 缓存里有没有这一版——**失效判据之一**（文件头 ②），不是「顺手做的检查」 */
function contains(cache: CacheFile, version: string): boolean {
  return cache.releases.some((r) => r.version === version);
}

/**
 * 24h 之内算新鲜。
 * ⚠️ `age >= 0` 这条守卫是给**系统时钟往回拨**（对时/手动改表）用的：负年龄说明这份缓存
 * 「来自未来」，它到底多旧无从判断 ⇒ 按不新鲜处理，宁可多出一次网。
 */
function isFresh(cache: CacheFile, now: number): boolean {
  const age = now - Date.parse(cache.fetchedAt);
  return age >= 0 && age < CACHE_MAX_AGE_MS;
}

/**
 * 读缓存——**任何异常都返回 null**（文件不存在 / 不是 JSON / 字段不成形状 / 时间戳读不出来）。
 *
 * 🔴 这里 null 的语义 = **「这份缓存不可用」**，与「缓存里没有这一版」是两件事（后者由
 * `contains` 单独判）——两类都用 null 表达会丢掉前者本该产生的「去出网」。
 * ⚠️ 时间戳读不出来的缓存**直接判不可用**：`fetchedAt` 是过期的**唯一**判据来源（文件头 ②③），
 * 读不出它就没有任何办法判断这份数据多旧——留着它 = 让一条永久越权的缓存兜住所有失败。
 */
async function readCache(file: string): Promise<CacheFile | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(file, 'utf8')) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return null;
    const c = parsed as Record<string, unknown>;
    if (typeof c.fetchedAt !== 'string' || Number.isNaN(Date.parse(c.fetchedAt))) return null;
    if (!Array.isArray(c.releases)) return null;

    const releases = c.releases.filter(isCachedRelease);
    return releases.length > 0 ? { fetchedAt: c.fetchedAt, releases } : null;
  } catch {
    return null;
  }
}

/** 缓存条目的形状守卫——磁盘上的东西不可信（用户可能手改、也可能写到一半断电） */
function isCachedRelease(v: unknown): v is CachedRelease {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.version === 'string' &&
    typeof r.publishedAt === 'string' &&
    typeof r.body === 'string' &&
    typeof r.htmlUrl === 'string'
  );
}

/**
 * 写缓存——**失败只记一笔，绝不向上抛**（文件头 ④）。
 *
 * 不做「临时文件 + rename」那种原子写（对比安装腿的待续记录，那里非原子不可——半截 JSON
 * 会被读成「没有记录」= 下次启动不知道自己刚才在装）：这里的坏处只是**退化成没有缓存**，
 * 而截断的 JSON 在 `readCache` 那关就 `JSON.parse` 抛掉 ⇒ 不会读出一个错答案。
 */
async function writeCache(file: string, releases: CachedRelease[], now: number): Promise<void> {
  const payload: CacheFile = { fetchedAt: new Date(now).toISOString(), releases };
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(payload), 'utf8');
  } catch (e) {
    console.warn(`[update-release-notes] 发行说明缓存写入失败（不影响本次取数）: ${String(e)}`);
  }
}

/** 失败的唯一构造口——保证每条错误都带 code + 文案（码集由 07 §三 固定，本文件不新造码） */
function legError(code: UpdateError['code'], message: string): UpdateLegError {
  return new UpdateLegError({ code, message });
}
