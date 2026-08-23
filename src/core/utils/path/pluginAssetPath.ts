/**
 * 插件资产 linkdesk:// URL 构建——纯函数（无 import.meta，壳/electron 双进程 graph 皆可编）。
 *
 * E5.8#50.17 资产字体走此路（硬约束 12 同族：禁止手写绝对路径，统一走路径工具正源）。
 * `linkdesk://{pluginId}/{相对路径}` 由主进程协议处理器解析到插件目录（electron/plugins/protocol.ts，
 * 解析算法见 linkdeskProtocolPath.ts）。
 *
 * 🔥 为什么独立成文件而非并入 assetPath.ts：assetPath 的 BASE 依赖 `import.meta.env`（Vite-only），
 * electron tsconfig 是 CommonJS 编不了 import.meta——electron graph 经 ThemeEngine 反链拉入 assetPath
 * 即炸。本文件零依赖零副作用，双端皆可编。
 */

/** 获取插件资产的 linkdesk:// URL。
 *  路径归一化：normalizePath（正反斜杠正源）+ 去 `./` 前缀——作者写 `./resources/Font.woff2` 或 `resources/Font.woff2` 皆可。 */
import { normalizePath } from "./pathUtils";

export function getPluginAssetPath(pluginId: string, relativePath: string): string {
  const normalized = normalizePath(relativePath).replace(/^\.\//, "");
  return `linkdesk://${pluginId}/${normalized}`;
}
