/**
 * 插件生命周期操作层——安装/卸载/禁用/启用 + 查询 + 主题/语言回退。
 * E5.8#0d.10-1e：自 loader.ts 拆出——Phase 4.3 生命周期 API 独立成模块。
 * E6#84（第 3.6 层文件整理）：本文件 779 行超「500-800 多职责」人工审区，feature-folder 化——
 *   **本文件 = 纯 re-export 聚合门面（零逻辑）**，实现按域落 `lifecycle-ops/` 同名夹：
 *     `progress.ts`          进度广播（jobProgress + 裸进度）
 *     `revert.ts`            主题/语言回退三件套（⚠️ 与 unloadPlugin 的时序见该文件头注）
 *     `install-ops.ts`       安装域（installPlugin / installWithProgress / packageOps / 两条腿）
 *     `state-toggles.ts`     禁用 / 启用 / 卸载
 *     `query-projections.ts` 四条 get* 投影 + isPluginDisabled + reinstallPlugin
 *   **外部 import 路径零变更**（loader.ts / update.ts / 测试全走 `./lifecycle-ops`）——门面把住出口。
 *   依赖方向：门面 → 子模块；域内 progress → install-queue；state-toggles → progress/revert；
 *   投影层在末端。**无环**（同 0d.10-8 KeybindingRegistry 先例）。
 * 依赖方向：lifecycle-ops → runtime（loadPlugin）→ contributions → state，无反向——防环。
 * 壳 IpcBridgeHandler 的 setPluginAPI 注册在 loader.ts（聚合器），此处只定义操作。
 */

export { jobProgress } from "./lifecycle-ops/progress";

export {
  packageOps,
  installPlugin,
  installWithProgress,
} from "./lifecycle-ops/install-ops";

export {
  disablePlugin,
  enablePlugin,
  uninstallPlugin,
} from "./lifecycle-ops/state-toggles";

export {
  isPluginDisabled,
  getLoadedPluginManifests,
  getListPluginManifests,
  getDisabledPluginInfo,
  getUninstalledPluginInfo,
  reinstallPlugin,
} from "./lifecycle-ops/query-projections";

/** 磁盘落点判定——本体在 `plugin-disk-location.ts`（E6#73m K1 抽出的卸载磁盘腿）。
 *  此处原样再导出：`update.ts` 等既有消费方零改动（依赖方向仍是 ops → disk-location，不成环）。 */
export { isUnderHome } from "./plugin-disk-location";

// 导出供 vitest + loader.ts watcher——防止新增贡献类型时漏加 revert（主题/语言/图标主题…）
export { revertThemeIfCurrent, revertLanguageIfCurrent, reapplyThemeAfterUnload } from "./lifecycle-ops/revert";
