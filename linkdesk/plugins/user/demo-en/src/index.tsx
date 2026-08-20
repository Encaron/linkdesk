/**
 * demo-en 插件入口。E5.8#37.9.2 纯英文示范插件。
 *
 * E5.8#37.9.2.2：entry 是图标栏出现图标的必要条件——图标栏数据源 viewRegistry
 * 只收 registerViewPlugin 的插件（runtime.ts:282 有 entry 才走 loadPluginComponent），
 * entryless 插件（panel-demo 先例）即使声明 appearsIn.iconBar 也被静默丢弃。
 * file-tree 同款模式（侧栏专用 + 图标）：export default 主视图即可。
 */
export { default } from "./views/HelloView";
