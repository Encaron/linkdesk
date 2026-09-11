/**
 * marketSources — 目录运行时拉取域（E6#30a/30c/30f）——**夹内入口（聚合门面）**。
 * E6#86（第 3.6.3 轮）feature-folder 化：原 259 行按职责拆进同名夹 `marketSources/`，本文件纯再导出。
 * E6#86g（第 3.6.3b 轮）门面归位：`marketSources.ts` → `marketSources/index.ts`。
 *
 * 职责 = 读 marketplace.marketplaceSources 配置 + 官方默认源 → 逐源拉取 marketplace.json →
 * localStorage 5min 缓存 → 合并去重（同 id 取 semver 高）→ 返回目录 + 主状态。
 * 纯格式逻辑在 marketCatalog/（parse/normalize/merge/compare/sourceName）；
 * 本模块只管编排 + IO，IO（fetch/localStorage/window.linkdesk.configuration）经 __setCatalogIO 可注入供 jsdom 直测。
 *
 * 状态机（#30f 目录防御，01 §四）：
 *   ok       至少一源交付目录（fresh 缓存 / stale 缓存兜底 / 实时拉取均可）。目录可为空：官方目录
 *            「连上但暂未上架插件」= 合法 ok 空态（空态判据 = 交付源数，非合并条数——修复把「连上但空」
 *            误判成 offline 的实证 bug）
 *   corrupt  全源零交付且 parse 失败无缓存可兜 → 空态「目录损坏」+ [重试]
 *   offline  全源零交付且网络失败无缓存可兜 → 空态「无法加载市场，请联网重试」+ [重试]
 *   单源失败 → 不阻塞其他源：有该源缓存用缓存兜底，无缓存记入 errors 展示原因（不整体降级）
 *
 * 缓存语义（01 §四）：5min 内命中读缓存不拉取；手动刷新 = forceRefreshCatalog（跳过 fresh、
 * 重拉 + 重写缓存）。网络失败/坏 parse 时有缓存原文 → 降级用 stale（usedStale=true，展示「可能过期」提示用）。
 *
 * 夹内布局（依赖单向）：types → io / sourceConfig / fetch → load。
 * 🔴 **门面保留原路径原文件名**：marketplaceShared / installGate / installConfirmPayload / `__tests__/*`
 * 等消费方的 import 路径一字不改。
 */

export type { CatalogLoadState, CatalogLoadResult, FetchFn, StorageLike } from "./types";

/** 测试注入点——jsdom 直测替掉 fetch + localStorage（模块级状态的唯一属主见 `marketSources/io.ts`） */
export { __setCatalogIO } from "./io";

export { getSourceUrls, readConfiguredAuthorSources } from "./sourceConfig";

export { loadCatalog, forceRefreshCatalog } from "./load";
