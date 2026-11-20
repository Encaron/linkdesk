/**
 * 主进程解压段（electron/ipc/handlers/plugin-install-handlers.ts）throw 文案的**判据串单源**。
 * R4-1.2（I16）：installFromDirectory 把解压段错误分类成五类回执时按 includes 匹配——两处消费同一常量
 * 防文案漂移（⛔ 不在消费方重抄字面量）。electron 侧 import 本文件（electron → src 单向，既有惯例）。
 */

/** 不是有效 .linkdesk-plugin 包（顶层无可解析 plugin.json）→ 回执 bad-manifest */
export const EXTRACT_ERR_INVALID_PACKAGE = "不是有效的 .linkdesk-plugin 包";
/** 包内 pluginId 非法（SAFE_PLUGIN_ID 不过）→ 回执 unsafe-id */
export const EXTRACT_ERR_UNSAFE_PLUGIN_ID = "包内 pluginId 非法";
/** 目标已存在（同 id 已装，不静默覆盖）→ 回执 exists */
export const EXTRACT_ERR_TARGET_EXISTS = "已存在安装目录";
/** zip-slip 命中（拒绝并清理）→ 回执 io */
export const EXTRACT_ERR_ZIP_SLIP = "包内含非法条目（zip-slip）";
