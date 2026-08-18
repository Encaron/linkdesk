/**
 * 欢迎页的 pluginId——系统内置常量。
 *
 * 🔥 B5 fix 续：独立文件避免 tabIdentity ↔ viewRegistry 循环依赖导致的 const TDZ 死区。
 * tabIdentity.ts 和 viewRegistry.ts 本就互相 import——在此文件中定义常量，双方都 import 此文件，不形成新循环。
 */

export const FALLBACK_PLUGIN_ID = "welcome";
