/**
 * marketplaceShared — 市场共享层的**门面**（E6#86 第 3.6.3 轮 feature-folder 化）。
 *
 * 本文件是纯再导出 + 模块级启动，**零实现**。原 779 行按职责拆进同名夹 `marketplaceShared/`：
 *   messages.ts      失败归因字典 + 阶段文案（码 → i18n key 的唯一映射处）
 *   searchState.ts   模块级搜索状态（跨视图同步过滤）
 *   onlineStatus.ts  离线态 hook
 *   catalogStore.ts  市场**目录** store（远端 catalog 的本地投影；`_catalogResult` 唯一属主）
 *   pluginsStore.ts  本地**已装/内置/禁用**列表 store + badge 广播
 *   notifications.ts 事件型失败通道（右下角 error toast，MARKET_SOURCE 归属）
 *   installFlow.ts   安装/更新/重试的发起与终局回执
 *   commands.ts      命令组 + gear 菜单注册（模块底自调用——**必须 import 到，否则静默不注册**）
 *
 * 🔴 **门面存在的唯一理由**：12 处消费方（`views/*` / `index.tsx` / `installJobs.ts` / `__tests__/*`）
 * 的 import 路径 `@plugins/marketplace/services/marketplaceShared` 一字不改。**保持原路径原文件名**
 * 是拆分纪律的一部分——不是可选的美化。
 *
 * 依赖方向（单向无环，拆分后不变）：
 *   marketCatalog → marketSources → updateDiscovery → marketplaceShared
 * 夹内：searchState / onlineStatus / messages（叶）→ catalogStore / pluginsStore → notifications
 *       → installFlow → commands
 */

// 命令组注册（模块底自调用生效）——侧效应 import，勿删、勿改成按需引用
import "./marketplaceShared/commands";
// E6#33a 启动发现调度（模块级每进程一次；池门控见 scheduleStartupDiscovery）——见 updateDiscovery 头注
import { scheduleStartupDiscovery } from "./updateDiscovery";

/* ═══ 搜索状态 ═══ */
export { getMarketplaceSearch, setMarketplaceSearch, onMarketplaceSearchChange } from "./marketplaceShared/searchState";

/* ═══ 失败通道 ═══ */
export { MARKET_SOURCE, notifyError, settleUpdateFailure } from "./marketplaceShared/notifications";

/* ═══ 数据 store ═══ */
export { scheduleDataRefresh, useMarketplacePlugins } from "./marketplaceShared/pluginsStore";
export { useMarketplaceCatalog, useCatalogEntryById } from "./marketplaceShared/catalogStore";

/* ═══ 失败归因字典 ═══ */
export type { InstallFailReason } from "./marketplaceShared/messages";
export {
  classifyInstallError,
  installFailLabelKey,
  updateFailLabelKey,
  failText,
  updateFailText,
  marketInstallStageLabel,
} from "./marketplaceShared/messages";

/* ═══ 安装 / 更新 / 重试 ═══ */
export { startMarketInstall, retryMarketInstall, retryMarketUpdate } from "./marketplaceShared/installFlow";

/* ═══ 离线态 ═══ */
export { useOnlineStatus } from "./marketplaceShared/onlineStatus";

/* ═══ E6#33a 启动发现调度（模块级每进程一次；池门控见 scheduleStartupDiscovery） ═══
 * 任意市场池面首次 import 本模块（侧栏已装/禁用/内置、详情、主区 tab 首挂载都经 marketplaceShared）→
 * 调度一趟 ~10s 延迟发现（05 §一·四）：拉目录比版本 → 有新版推铃铛（每版一次幂等）+ 落 store（#33b 徽标/升级入口
 * + #33d 自动更新数据源）。壳进程也 import 本模块（marketplace entry 双进程执行）→ 无 notifications.show →
 * 调度内置门控返回，壳零改动零新面。 */
scheduleStartupDiscovery();
