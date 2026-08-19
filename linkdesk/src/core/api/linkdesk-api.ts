/**
 * 🔥 linkdesk API 命名空间——类型安全的插件 API 入口（聚合器门面）
 *
 * E3j #74：对标 VS Code `vscode` 命名空间。插件通过此模块获得：
 *   - 完整的 TypeScript 类型提示（IDE 自动补全、参数校验）
 *   - 零 IPC 知识——不需要知道 channel 名、action 格式、参数结构
 *   - 所有方法内部走 ipcRenderer.invoke()——自动经过 #72 的 IPC 消息队列
 *
 * E5.7#97：本文件成为 window.linkdesk 的完整契约面（替代 E5#89 的宽松
 * Record<string, any>）——池 preload（插件运行时真相源）+ 壳 preload 双端
 * 注入的全部命名空间在此一处声明。跨堆 wire 载荷类型从 src/core/types/ipc/
 * import（决策点 1）——改动 tsc 三端同时报错。
 *
 * 使用方式：
 *   import { linkdesk } from "@src/core/api/linkdesk-api";
 *   const themes = await linkdesk.theme.getAvailable();
 *   await linkdesk.commands.executeCommand("myCommand", arg1, arg2);
 *
 * 运行时实现：window.linkdesk（由 preload-pool.ts / preload-shell.ts 通过 contextBridge 注入）。
 *
 * E5.8#0d.10-9e：拆 linkdesk-api/ 子模块后，本文件 = 聚合器——10 个命名空间域接口交叉组装
 * LinkDeskAPI + 13 独立接口 re-export + DialogOpenOptions 保路径 + getLinkDesk/linkdesk 运行时导出。
 * 分层依赖：types（独立接口基座）→ 10 域接口（Commands/Appearance/Tabs/Keybindings/Ui/Data/
 * Workspace/Editor/Plugins/Shell）→ 本聚合器交叉组装；域接口间零互依赖，单向无环。
 * 外部消费方 import 路径零变更（"./linkdesk-api" 命中文件，"./linkdesk-api/types" 命中子模块）。
 */

import type { CommandsAPI } from "./linkdesk-api/commands";
import type { AppearanceAPI } from "./linkdesk-api/appearance";
import type { TabsAPI } from "./linkdesk-api/tabs";
import type { KeybindingsAPI } from "./linkdesk-api/keybindings";
import type { UiAPI } from "./linkdesk-api/ui";
import type { DataAPI } from "./linkdesk-api/data";
import type { WorkspaceAPI } from "./linkdesk-api/workspace";
import type { EditorAPI } from "./linkdesk-api/editor";
import type { PluginsAPI } from "./linkdesk-api/plugins";
import type { ShellAPI } from "./linkdesk-api/shell";

/**
 * linkdesk API——插件代码的类型安全入口。
 * 对标 VS Code `vscode` 对象的全局命名空间结构。
 * 池 preload 注入的命名空间为插件运行时真相源（required）；
 * 壳 preload 独有面（bridge/pool/window/path/…）为 `?` 可选——池内不存在。
 * E5.8#0d.10-9e：由 10 个命名空间域接口交叉组装（interface→type intersection，
 * 索引访问 LinkDeskAPI["pool"]/["configuration"] 等消费方契约不变）。
 */
export type LinkDeskAPI = CommandsAPI & AppearanceAPI & TabsAPI & KeybindingsAPI & UiAPI & DataAPI & WorkspaceAPI & EditorAPI & PluginsAPI & ShellAPI;

// ── 独立类型接口 re-export（types.ts 基座）──

export type {
  LinkDeskCommand,
  LinkDeskTheme,
  LinkDeskLanguage,
  LinkDeskConfigSchema,
  PluginListEntry,
  PluginInstallResult,
  PluginInfoEntry,
  PluginListSubset,
  EnvInfo,
  FileDecoration,
  FileDecorationProvider,
  MenuItemDescriptor,
  NotificationHandle,
} from "./linkdesk-api/types";

export type { DialogOpenOptions } from "../types/ipc/dialogs"; // E5.7#97：归口 src/core/types/ipc/dialogs.ts——此 re-export 保持既有插件 import 路径

// E5.8#20：PluginStateChangedPayload 补导出——插件经 events.on("plugin-state:changed") 通配订阅
// （pluginState.onChange 精确 key 匹配捕获不了通配键名），载荷类型属契约面必给消费类型。
export type { PluginStateChangedPayload } from "../types/ipc/events";

// ── 获取 typed API 实例 ──

/**
 * 返回类型安全的 linkdesk API 对象。
 * 运行时 window.linkdesk 由 preload 注入——此函数只加类型标注。
 */
export function getLinkDesk(): LinkDeskAPI {
  return (window as unknown as { linkdesk: LinkDeskAPI }).linkdesk;
}

/**
 * 便捷导出：类型安全的 linkdesk API 实例。
 *
 * @example
 *   import { linkdesk } from "@src/core/api/linkdesk-api";
 *   const themes = await linkdesk.theme.getAvailable();
 *   await linkdesk.commands.executeCommand("editor.action.formatDocument");
 */
export const linkdesk: LinkDeskAPI = getLinkDesk();
