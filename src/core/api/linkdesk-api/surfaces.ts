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

/** 池 preload 必暴露面（44 = 43 唯一 + config 别名；唯一缺 bridge）——E5.8#34.5 加 panel（插件调 reveal 的池侧通道）；E5.8#37 加 floatingPanelHost（壳内悬浮面板哑渲染桥）；E5.8#41.12 加 settings（设置套枚举/切换，设置 UI 在池内渲染）；E5.8#41.14 加 factorySlots（任意 role 候选枚举/切换，设置 UI 通用区数据源）；E5.8#50.11 加 appearance（外观资产——选择图片拷贝入库） */
export type PoolExposed = Pick<LinkDeskAPI,
  | "commands" | "configuration" | "config" | "theme" | "language" | "appearance"
  | "tabs" | "keybindings" | "notifications" | "menu" | "contextKey"
  | "dialog" | "quickPick" | "quickPickHost" | "toast" | "dialogHost" | "floatingPanelHost"
  | "serial" | "clipboard" | "p2p" | "events" | "pluginState"
  | "workspace" | "filesystem" | "path" | "env" | "search" | "encoding"
  | "decorations" | "fileAssociation" | "langDef" | "lsp" | "protocol"
  | "viewContainer" | "plugins" | "pluginManager" | "window"
  | "shell" | "hotExit" | "getFilePath" | "panel" | "settings" | "factorySlots"> & {
  /** pool 命名空间——分裂面方法级子集：池侧 = 收布局 + 发动作 + beforeClose 通道（壳侧 pushLayout/onReady/… 12 方法为壳→池推送面，池内不存在）。
   *  pool 契约必选（E5.8#22 审视 N1 修正后）——直接 Pick，无需 NonNullable
   *  E5.8#30.16（P8）：beforeClose 三方法唯一池侧（插件注册 handler / GroupTabBar 关闭路径 await）
   *  E5.8#44-B：tabBarRects 唯一池侧（MainZone 上报 TabBar rects——壳侧无发送面）
   *  E5.8#44-C：dragPosition/onAdsorbHint 唯一池侧（池上报拖拽位置 + 订阅壳吸附提示——壳侧无发送/订阅面）
   *  E5.8#46.10：adsorbIndex 唯一池侧（池回传插入缝隙——壳侧无发送面） */
  pool: Pick<LinkDeskAPI["pool"], "onLayout" | "ready" | "sidebarAction" | "tabAction" | "tabBarRects" | "dragPosition" | "onAdsorbHint" | "adsorbIndex" | "registerBeforeClose" | "unregisterBeforeClose" | "beforeClose">;
};

/** 壳 preload 必暴露面（23；bridge 真壳独有）。commands/tabs/pool/appearance 命名空间方法级子集：
 *  commands 壳 = 注册面（execute/executeCommand/unregisterCommands/getCommands 为池侧执行面，壳不实现）
 *  tabs 壳缺 onDidChangeActiveTab（池侧订阅面——壳是标签权威自身，无订阅需求）
 *  pool 壳 = 推送面（onLayout/ready/sidebarAction/tabAction 为池侧发送面，壳不实现）
 *  appearance 壳 = 仅 revealStorage（E5.8#153：齿轮命令 handler 在壳进程执行，需壳侧触发主进程 openPath；
 *    importImage 池独有——选图拷贝入库只在池设置 UI 发生） */
export type ShellExposed = Pick<LinkDeskAPI,
  | "getFilePath" | "serial" | "filesystem" | "path" | "plugins"
  | "fileAssociation" | "pluginManager" | "dialog" | "pluginState" | "menu"
  | "contextKey" | "keybindings" | "p2p"
  | "clipboard" | "shell" | "env" | "events" | "bridge" | "window"> & {
  commands: Pick<LinkDeskAPI["commands"], "registerCommand" | "_executeShellLocal">;
  tabs: Omit<LinkDeskAPI["tabs"], "onDidChangeActiveTab">;
  pool: Omit<LinkDeskAPI["pool"], "onLayout" | "ready" | "sidebarAction" | "tabAction" | "tabBarRects" | "dragPosition" | "onAdsorbHint" | "adsorbIndex" | "registerBeforeClose" | "unregisterBeforeClose" | "beforeClose">;
  appearance: Pick<LinkDeskAPI["appearance"], "revealStorage">;
};
