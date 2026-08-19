/**
 * 双面覆盖清单——E5.8#20。
 *
 * 支撑清单（非签名真相源）：矩阵 §2 覆盖矩阵的类型化——每面「必须暴露哪些命名空间」。
 * preload-pool.ts expose 对象 `satisfies PoolExposed` / preload-shell.ts `satisfies ShellExposed`——
 * 纯 tsc 即门禁：契约加方法而双端漏暴露 → 编译红；双端补面必须同步加进清单（双向机械强制）。
 *
 * 面类型 = Pick 全显式列举——加面必须列、列了必须实现。桥面（pool/shell/window 等）从
 * 契约 `?` 壳独有语义改为双端必选（矩阵 N1 修正：唯一真壳独有 = bridge）。
 *
 * 🔥 E5.8#20 satisfies 实证（设计 §3.2 边界）：commands/tabs/pool 三命名空间契约声明的是
 * 池侧（插件运行时）全方法，但池/壳各实现自己那半——namespace 级 Pick 在这些"分裂命名空间"
 * 上结构性失效（双方都满足不了对方的那半）。修正 = 这三面改方法级子集面（Pick/Omit 逐方法），
 * 其余命名空间维持 namespace 级 Pick。唯一真壳独有 = bridge；pool 四池侧方法（onLayout/ready/
 * sidebarAction/tabAction）唯一池独有。
 *
 * 设计出处：docs/02-Electron架构/E5.8_归一化基建/契约生成/03-契约生成设计.md §3.2
 * 覆盖矩阵：docs/02-Electron架构/E5.8_归一化基建/契约生成/命名空间矩阵.md §2
 */
import type { LinkDeskAPI } from "../linkdesk-api";

/** 池 preload 必暴露面（39 = 38 唯一 + config 别名；唯一缺 bridge） */
export type PoolExposed = Pick<LinkDeskAPI,
  | "commands" | "configuration" | "config" | "theme" | "language"
  | "tabs" | "keybindings" | "notifications" | "menu" | "contextKey"
  | "dialog" | "quickPick" | "quickPickHost" | "toast" | "dialogHost"
  | "serial" | "clipboard" | "p2p" | "events" | "pluginState"
  | "workspace" | "filesystem" | "path" | "env" | "search" | "encoding"
  | "decorations" | "fileAssociation" | "langDef" | "lsp" | "protocol"
  | "viewContainer" | "plugins" | "pluginManager" | "window"
  | "shell" | "hotExit" | "getFilePath"> & {
  /** pool 命名空间——分裂面方法级子集：池侧 = 收布局 + 发动作（壳侧 pushLayout/onReady/… 11 方法为壳→池推送面，池内不存在）。
   *  pool 契约必选（E5.8#22 审视 N1 修正后）——直接 Pick，无需 NonNullable */
  pool: Pick<LinkDeskAPI["pool"], "onLayout" | "ready" | "sidebarAction" | "tabAction">;
};

/** 壳 preload 必暴露面（22；bridge 真壳独有）。commands/tabs/pool 三命名空间方法级子集：
 *  commands 壳 = 注册面（execute/executeCommand/unregisterCommands/getCommands 为池侧执行面，壳不实现）
 *  tabs 壳缺 onDidChangeActiveTab（池侧订阅面——壳是标签权威自身，无订阅需求）
 *  pool 壳 = 推送面（onLayout/ready/sidebarAction/tabAction 为池侧发送面，壳不实现） */
export type ShellExposed = Pick<LinkDeskAPI,
  | "getFilePath" | "serial" | "filesystem" | "path" | "plugins"
  | "fileAssociation" | "pluginManager" | "dialog" | "pluginState" | "menu"
  | "contextKey" | "keybindings" | "p2p"
  | "clipboard" | "shell" | "env" | "events" | "bridge" | "window"> & {
  commands: Pick<LinkDeskAPI["commands"], "registerCommand" | "_executeShellLocal">;
  tabs: Omit<LinkDeskAPI["tabs"], "onDidChangeActiveTab">;
  pool: Omit<LinkDeskAPI["pool"], "onLayout" | "ready" | "sidebarAction" | "tabAction">;
};
