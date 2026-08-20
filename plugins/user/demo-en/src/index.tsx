/**
 * demo-en 插件入口。E5.8#37.9.2 纯英文示范插件。
 *
 * E5.8#37.9.2.2 修复 + #37.9.2.3 壳级收口：本插件按 file-tree 同款标准模式
 * （侧栏专用 + 图标）声明 entry —— 有 entry = 走 loadPluginComponent 注册进
 * viewRegistry（图标栏数据源），是图标最直接的路径。entryless 插件也能拿图标了
 * （E5.8#37.9.2.3：runtime.ts Step 4 对 entryless 且含侧栏视图容器的插件注册
 * component-less 条目），但 entry 仍是官方推荐形态——第三方作者照抄本文件即可。
 * export default 主视图，其余交给壳。
 */
export { default } from "./views/HelloView";
