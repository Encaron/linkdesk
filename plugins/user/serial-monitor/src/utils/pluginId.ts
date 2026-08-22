/**
 * E5.7#95：本插件自识 ID——大写常量（linkdesk/no-plugin-id-hardcode 批准的常量通道）。
 *
 * 用途：广播事件（plugin-state:changed 等）按 pluginId 过滤到自身。
 * 插件写死自己的 ID 不违反插件独立铁律——铁律禁止的是壳/core/pluginLoader 写死插件 ID
 * （新插件不应触发壳代码修改）；插件自知两侧都在插件作者控制下。
 */
export const SERIAL_MONITOR_PLUGIN_ID = "serial-monitor";
