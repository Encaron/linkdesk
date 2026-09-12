/**
 * update-source——E6#57.5 检查腿（`probe`）：更新源拉取 + 版本比对。
 *
 * 设计：[06-主软件更新/01-更新机制设计.md](../../docs/02-Electron架构/E6_插件生态与发布/06-主软件更新/01-更新机制设计.md)
 * §2.3（更新源 + 六类失败）+ §2.6（只认 stable）；
 * **唯一真值表 = [05-文档与发布/02-发布流水线.md §1.5](../../docs/02-Electron架构/E6_插件生态与发布/05-文档与发布/02-发布流水线.md)**
 * （tag / asset 名 / 校验值取 `asset.digest` 而非 `checksum`）。
 *
 * 本模块产出的是 **#57.4 注入的那条腿**（`UpdateServiceDeps.probe`）——契约由状态机那头定死：
 * ① **必须自行分类返回 `{kind:'error'}` 结果，不许抛**（抛出 = 契约违反，状态机会复位后原样重抛）；
 * ② 六类错误**逐类点名**，不塌成「未知错误」；③ 一律**走 `main-fetch.ts`**（E6#76：全局 fetch
 * （undici）不读 Windows 系统代理 ⇒ 用户开代理时「检查看得见、下载必失败」）。
 *
 * 🔴 **两条最容易复发、且都不出声的坑，本文件各有一处防线**：
 * ① **校验值取 `asset.digest`，不是 `asset.checksum`**（API 里根本没有 `checksum` 字段）——照名字取会
 *    恒 `undefined` ⇒ 每次更新都走 01 §2.4 的「未附 ⇒ 降级放行」⇒ 校验永久静默失效（§1.5.1）。
 * ② **安装包名只许一处真值**——`electron-builder.yml` 的 `artifactName`；本文件持有它的**同形副本**
 *    `ASSET_NAME_TEMPLATE`，由 `scripts/assert-installer-name.mjs` 判据④ 机械比对，两侧不许各漂各的
 *    （01 §2.3：两台各写一份字符串 = `asset-missing` 的根因）。
 *
 * 与 `plugin-download.ts` 的分工：那条腿下**二进制包**（本仓产物之外的第三方 zip），本腿只下**一份
 * JSON 元数据**（本仓自己的 Release）——故不共用代码，但共用出网出口与「空闲/总时长都不许假死」的纪律。
 */

import { appPackageName, loadProduct } from '../product.js';
import {
  INVALID_RESPONSE_MESSAGE,
  META_TIMEOUT_MS,
  NETWORK_MESSAGE,
  NOT_FOUND_MESSAGE,
  classifyHttpFailure,
  fetchWithTimeout,
} from './update-http.js';
import { compareVersions, parseStrictSemver } from '../../src/core/utils/plugin/semverUtils.js';
import type { UpdateError } from '../../src/core/types/ipc/update';
import type { UpdateProbeResult } from './update-service.js';

/**
 * 🔴 安装包名的**同形副本**——逐字符等于 `electron-builder.yml` 顶层 `artifactName`
 * （`${name}-setup-${version}.${ext}`，E6#42e 立的唯一真理源）。
 *
 * **故意写成 electron-builder 的模板形态（含 `${ext}`）而不是直接写死 `linkdesk-setup-...`**：
 * 这样「契约」在两侧是**同一个字符串**，`scripts/assert-installer-name.mjs` 判据④ 才能做**逐字符**比对；
 * 一旦有人改了配置，构建期当场红，而不是等用户机器上更新器找不到安装包（`asset-missing`）。
 * 与那个门禁自己的 TEMPLATE 一样，**不从现场读**——从现场读 ⇒ 两边一起变 ⇒ 断言恒真（假门禁）。
 */
const ASSET_NAME_TEMPLATE = '${name}-setup-${version}.${ext}';

/** NSIS 目标扩展名（`${ext}` 的实值）。Windows 是首个平台（01 §2.5）；换平台时这里要跟 artifactName 一起变。 */
const INSTALLER_EXT = 'exe';

/** 六类文案的后两类——**读懂了响应之后**的语义判定，故不与 HTTP 往返那四条同居 `update-http.ts` */
const ASSET_MISSING_MESSAGE = '找到新版本但安装包缺失——发布侧可能改过安装包文件名';
const VERSION_UNPARSABLE_MESSAGE = '更新源的版本标签不是合法版本号——发布侧的 tag 可能不合 SemVer 规范';

/** 检查腿依赖——生产缺省即真值源；注入只为让单测能定 URL / 定版本 / 定产品名（不用假造 package.json） */
export interface UpdateSourceDeps {
  /** 更新源 URL（02 §2.2 单一来源 = `product.json.updateUrl`，非硬编码） */
  getUpdateUrl?: () => string;
  /** 当前运行版本（02 §2.3 唯一运行时来源 = `app.getVersion()`，经 loadProduct 透出） */
  getCurrentVersion?: () => string;
  /** 产品短名（`package.json` 的 `name`，= artifactName 的 `${name}`）——见 `product.appPackageName` */
  getAppName?: () => string;
  /** 超时预算（缺省 `META_TIMEOUT_MS`）——生产不传，唯一用途是让「超时归 network」可确定性单测 */
  timeoutMs?: number;
}

/** 更新源是否已配置——`UpdateServiceDeps.isSourceConfigured` 的实现（#57.4 留的接线点）。否 ⇒ 状态机落 `disabled`。 */
export function isUpdateSourceConfigured(): boolean {
  return loadProduct().updateUrl !== '';
}

/**
 * 期望的安装包名——按 `ASSET_NAME_TEMPLATE` 代入（`${name}`/`${version}`/`${ext}`）。
 * 导出供门禁与测试引用，**不许在别处再拼一次这个名字**（那正是 §2.3 说的「两台各写一份字符串」）。
 */
export function installerAssetName(appName: string, version: string): string {
  return ASSET_NAME_TEMPLATE
    .replace('${name}', appName)
    .replace('${version}', version)
    .replace('${ext}', INSTALLER_EXT);
}

/**
 * 造检查腿——返回 `(context) => Promise<UpdateProbeResult>`，直接喂给 `new UpdateService({ probe })`。
 *
 * ⚠️ `context`（手动/后台）**本格不分支**：两条路的取数与归类完全相同（差异只在壳出不出声，07 §4.3），
 * 参数存在是为了对上 #57.4 定死的腿签名，将来若真出现「手动才做」的策略（例如绕过缓存）从这里进。
 */
export function createUpdateProbe(
  deps: UpdateSourceDeps = {},
): (context: boolean) => Promise<UpdateProbeResult> {
  const getUpdateUrl = deps.getUpdateUrl ?? (() => loadProduct().updateUrl);
  const getCurrentVersion = deps.getCurrentVersion ?? (() => loadProduct().version);
  const getAppName = deps.getAppName ?? appPackageName;
  const timeoutMs = deps.timeoutMs ?? META_TIMEOUT_MS;

  return async function probe(_context: boolean): Promise<UpdateProbeResult> {
    const url = getUpdateUrl();
    // 源没配 ⇒ 状态机那头本该停在 disabled（isUpdateSourceConfigured），走不到这里；真走到这里
    // 也不能拿空 URL 去 fetch（会抛成 network，把「没配置」说成「网络不好」）。归 `not-found`
    // ——它的文案覆盖「不存在 / 尚未配置」两种子情形，且不新造错误码（码集由 07 §三 固定）。
    if (!url) return err('not-found', NOT_FOUND_MESSAGE);

    const current = getCurrentVersion();

    // 🔴 两段 try **刻意分开**：连不上（network）与「连上了但话听不懂」（invalid-response）是两类
    // 完全不同的事故——合在一个 catch 里，第二种会被当成第一种，报错指向用户网络（错向归因）。
    let resp: Response;
    try {
      resp = await fetchWithTimeout(url, timeoutMs);
    } catch {
      return err('network', NETWORK_MESSAGE); // 连不上 / 超时 / 代理未生效（发起阶段）
    }
    if (!resp.ok) {
      const failure = classifyHttpFailure(resp.status);
      return err(failure.code, failure.message);
    }

    let body: unknown;
    try {
      body = await resp.json();
    } catch {
      // 2xx 但响应体不是合法 JSON（GitHub 异常页 / 认证中间盒 / 半截响应）
      return err('invalid-response', INVALID_RESPONSE_MESSAGE);
    }

    return interpret(body, current, getAppName());
  };
}

/**
 * 解析响应 → 结论。顺序**有意如此**：先「看得懂吗」→ 再「稳定版吗」→ 再「比我新吗」→ 最后才「安装包在不在」。
 * 版本不比当前新时**不该**因缺 asset 报错——那时根本没有要装的东西（用户看到「找不到安装包」纯属误导）。
 */
function interpret(body: unknown, current: string, appName: string): UpdateProbeResult {
  if (typeof body !== 'object' || body === null) return err('invalid-response', INVALID_RESPONSE_MESSAGE);
  const raw = body as Record<string, unknown>;

  const tag = raw.tag_name;
  if (typeof tag !== 'string' || !tag) return err('invalid-response', INVALID_RESPONSE_MESSAGE);
  const publishedAt = raw.published_at;
  if (typeof publishedAt !== 'string' || !publishedAt) return err('invalid-response', INVALID_RESPONSE_MESSAGE);
  const htmlUrl = raw.html_url;
  if (typeof htmlUrl !== 'string' || !htmlUrl) return err('invalid-response', INVALID_RESPONSE_MESSAGE);
  const assets = raw.assets;
  if (!Array.isArray(assets)) return err('invalid-response', INVALID_RESPONSE_MESSAGE);

  // 🔴 tag 不是 SemVer → **单独报**，不许静默当成「没有更新」（发布打错 tag 会变成隐形事故）
  const parsed = parseStrictSemver(tag);
  if (!parsed) return err('version-unparsable', VERSION_UNPARSABLE_MESSAGE);

  // 只认 stable（01 §2.6）——两路信号都看：tag 自带预发布段（`v0.2.0-beta.1`）/ Release 的 prerelease 旗标。
  // 不看的话 `compareVersions("0.2.0-beta.1", "0.1.49") > 0` 会把预览版当成正式更新推给所有人。
  if (parsed.prerelease || raw.prerelease === true) return { kind: 'up-to-date' };

  if (compareVersions(parsed.version, current) <= 0) return { kind: 'up-to-date' };

  const asset = findAsset(assets, installerAssetName(appName, parsed.version));
  if (!asset) return err('asset-missing', ASSET_MISSING_MESSAGE);

  return {
    kind: 'available',
    update: {
      version: parsed.version,
      currentVersion: current,
      publishedAt,
      releaseNotesUrl: htmlUrl,
      downloadUrl: asset.downloadUrl,
      checksum: checksumFromDigest(asset.digest),
      size: typeof asset.size === 'number' && Number.isFinite(asset.size) ? asset.size : undefined,
    },
  };
}

/** 按**契约名逐字符**找 asset——找不到即 `asset-missing`（不猜、不「反正就一个 .exe」地放行，理由见清单 `#57.5c`）。 */
function findAsset(
  assets: unknown[],
  expectedName: string,
): { downloadUrl: string; size?: number; digest: unknown } | null {
  for (const entry of assets) {
    if (typeof entry !== 'object' || entry === null) continue;
    const a = entry as Record<string, unknown>;
    if (a.name !== expectedName) continue;
    // 名字对上了但下载直链不合法 ⇒ 这份 asset 不可用；**继续找下一份同名**（GitHub 允许同名重复上传）
    if (typeof a.browser_download_url !== 'string' || !a.browser_download_url) continue;
    return { downloadUrl: a.browser_download_url, size: a.size as number | undefined, digest: a.digest };
  }
  return null;
}

/**
 * 🔴 **校验值源 = `asset.digest`**（GitHub 服务端为每个 asset 自动算，形如 `sha256:<64hex>`），
 * **不是 `asset.checksum`**——API 里没有那个字段，照名字取会恒 `undefined` ⇒ 每次都走「未附 ⇒
 * 降级放行」⇒ 校验永久静默失效（05-文档与发布/02-发布流水线.md §1.5.1；01 §2.4）。
 *
 * 取不到（缺字段 / `null` / 算法不是 sha256 / 长度不对）才返回 `undefined` = 真的「未附」——
 * 那时按已拍板口径降级放行（不拒装）。**不允许把非 sha256 的串当校验值往外传**：下游是
 * sha256 比对，传个 `md5:...` 进去只会得到一个永远不等的比较结果 = 把「没校验」伪装成「校验不过」。
 */
function checksumFromDigest(digest: unknown): string | undefined {
  if (typeof digest !== 'string') return undefined;
  const m = /^sha256:([0-9a-f]{64})$/.exec(digest.trim().toLowerCase());
  return m ? m[1] : undefined;
}

/** 失败结果的唯一构造口——保证每条错误都带 code + 文案（码集由 07 §三 固定，本文件不新造码） */
function err(code: UpdateError['code'], message: string): UpdateProbeResult {
  return { kind: 'error', error: { code, message } };
}
