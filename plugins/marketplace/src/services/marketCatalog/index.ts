/**
 * marketCatalog — 目录纯数据域（零 window/timer/IO 副作用，vitest 直测）——**夹内入口（聚合门面）**。
 * E6#86（第 3.6.3 轮）feature-folder 化：原 390 行按职责拆进同名夹 `marketCatalog/`，本文件纯再导出。
 * E6#86g（第 3.6.3b 轮）门面归位：`marketCatalog.ts` → `marketCatalog/index.ts`（services 无 basename
 * 约束 ⇒ 门面形态用夹内入口；`views/` 因 basename = `render` = bundle key 才必须用夹旁散门面）。
 *
 * E6#29 marketplace.json 格式权威字段（01-GitHub-Releases方案.md §三/3.2）：
 *   顶层 { version?, updatedAt?, plugins[] }；条目 = id/name/version/description/author/
 *   icon+iconSource/downloadUrl/size/publishedAt/minAppVersion，扩展纯增量：
 *   versions[]/readmeUrl/screenshots[]/license/categories[]（旧条目不填不崩）。
 *
 * 本模块只做「格式→内存对象」的纯变换（parse/normalize/merge/compare/源 URL 归一），
 * 运行时拉取/缓存/配置读写 = marketSources/（消费本模块纯函数，jsdom 可 mock）。
 *
 * 🔴 版本比较不 import src/core（插件独立铁律——零 @src/core）。本地实现与壳
 * semverUtils 同语义（忽略 v 前缀 / 缺位补 0 / 预发布逐位），双实现分处两进程域。
 *
 * 夹内布局（依赖单向：semver → select / merge；types 为纯声明叶）：
 *   types.ts      数据形状声明
 *   sourceUrl.ts  源 URL 归一 + 插件自己的主页推导
 *   parse.ts      marketplace.json 文本 → 内存对象
 *   semver.ts     版本比较原语（与壳 semverUtils 同语义）
 *   select.ts     目录选择器（稳定版/可更新/下拉两值/钉记账）
 *   merge.ts      多源合并去重
 *
 * 🔴 **门面保留原路径原文件名**：`views/*` / `marketSources` / `updateDiscovery` / `installGate` /
 * `installConfirmPayload` / `__tests__/*` 共十余处消费方的 import 路径一字不改。
 */

export type { CatalogEntry, MarketplaceCatalog, ParseResult, CatalogVersionChoice } from "./types";

export {
  OFFICIAL_SOURCE_URL,
  repoUrlToRawUrl,
  isRawMarketplaceUrl,
  normalizeSourceUrl,
  pluginRepoUrl,
  sourceNameOfUrl,
} from "./sourceUrl";

export { parseCatalog } from "./parse";

export { compareVersions, isVersionNewer, isPrereleaseVersion } from "./semver";

export {
  stableLatestVersion,
  versionDownloadUrl,
  updateToVersion,
  updateTargetFor,
  defaultVersionPick,
  versionActionTarget,
  selectableVersions,
  pinnedAfterApply,
} from "./select";

export { mergeCatalogs } from "./merge";
