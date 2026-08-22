/**
 * ViewContainerService 视图复合键域——E5.8#41.8/#41.9.1 自建。
 * `(pluginId, viewId)` 复合键 = 视图身份的唯一来源（插件独立性——两插件同名视图共存不互踩）。
 *
 * 键格式：`pluginId:viewId`（冒号分隔符）。**全量验证 2026-08-21：当前所有 pluginId
 * （serial-monitor/file-tree/marketplace/settings…）与 viewId（folders/search/installed/
 * receive-and-send…）均不含冒号**——零歧义。若未来第三方引入冒号 id → 切复合数组
 * `{pluginId, viewId}` 存（见 #41.8 设计 §3.4 备选，运行时 Map 嵌套 + 持久化对象数组）。
 *
 * 消费方：ViewContainerService 聚合器（_viewIndex/_emptyContents 复合键）+ 持久化域
 * （hidden.ts/collapsed.ts/viewOrder——#41.9.2 键迁移复用同一视图键）。
 */

/** 复合键分隔符——全量验证 pluginId/viewId 不含此字符（§3.1）。模块私有——消费方只经 viewKey/splitViewKey。 */
const VIEW_KEY_SEP = ":";

/** 复合键——`${pluginId}:${viewId}`。pluginId/viewId 均不含冒号（§3.1 全量验证）。 */
export function viewKey(pluginId: string, viewId: string): string {
  return `${pluginId}${VIEW_KEY_SEP}${viewId}`;
}

/** 拆分复合键 → `[pluginId, viewId]`。键必含分隔符（均经 viewKey 构造）。 */
export function splitViewKey(key: string): [string, string] {
  const sep = key.indexOf(VIEW_KEY_SEP);
  return [key.slice(0, sep), key.slice(sep + 1)];
}

/** 是否为复合视图键（含分隔符）——持久化 load 区分存量裸键（#41.8 §3.4 静默弃，不迁移不报错）。 */
export function isViewKey(key: string): boolean {
  return key.includes(VIEW_KEY_SEP);
}
