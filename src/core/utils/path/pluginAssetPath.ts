/**
 * 插件资产 linkdesk:// URL 构建——**唯一实现已下沉共享层**（2026-11-24 K6/R6）。
 *
 * 为什么下沉：共享件 `plugin-icon/iconUtils.ts` 也要构建资产 URL，但 R6 禁止共享件 import 壳 core。
 * 实现 = `src/components/shared/asset-url/pluginAssetPath.ts`（零依赖纯函数）；本文件只 re-export，
 * 保住既有 core/electron 消费方的 import 路径（`pluginLoader/contributions`、`ThemeEngine/fonts` 等）。
 *
 * `linkdesk://{pluginId}/{相对路径}` 由主进程协议处理器解析到插件目录（electron/plugins/protocol.ts，
 * 解析算法见 linkdeskProtocolPath.ts）。⛔ 别在此重新实现——协议形状一处定义。
 */

export { getPluginAssetPath } from "../../../components/shared/asset-url/pluginAssetPath";
