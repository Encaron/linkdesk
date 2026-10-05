/**
 * 宿主命令常量与调用 helper——插件调用**宿主级命令**的唯一合法写法。
 *
 * 为什么要有这一份：宿主命令 id 一旦被插件源码硬编码，改名就是全生态事故。
 * 壳侧对应物是 `src/core/commands/shell/shellCommands.ts` 的 `SHELL_COMMANDS`——两边是
 * **同名字面量**（壳不依赖本包，依赖方向不允许壳 import 它），相等由门禁腿
 * `scripts/check-shell-command-constants.mjs` 逐字对账；作者文档见
 * `@linkdesk/docs` 的「调用宿主命令」一节。
 *
 * 公开面纪律（对标 `index.ts` 头注「公共 API 面保持最小」）：本模块只出**一个常量对象 ＋ 一个 helper**；
 * 类型走 `@linkdesk/contracts` 的 `types.js` 全量转发，⛔ 不在这里另写一份类型（那就是两套契约的开始）。
 */
import type { OpenWithRequest } from "./types.js";

/** 宿主命令 id 常量表（与壳侧 `SHELL_COMMANDS` 逐字相等，改一边门禁即红）。 */
export const SHELL_COMMANDS = {
  /** 「打开方式」选择器——入参 `OpenWithRequest`；面板升起，动作回执由宿主处理。 */
  openWith: "workbench.action.openWith",
} as const;

/**
 * 宿主全局 `window.linkdesk` 在本模块用到的最小形状。
 *
 * 本包 `tsconfig.json` 不引 DOM lib（`lib: ["ES2022"]`、`types: []`），`window` 与契约里
 * `declare global` 的 `Window.linkdesk` 都不在本 program 的类型图内——故像 `dev-real.ts`
 * 那样经 `globalThis` 取用，只声明真正调用的那一面（真身的权威声明在契约里）。
 */
interface HostBridge {
  linkdesk?: { commands?: { executeCommand?: (id: string, ...args: unknown[]) => unknown } };
}

/**
 * 打开「打开方式」选择器——宿主升起面板，选中项的动作由宿主执行。
 *
 * `request.uri` 与 `request.ext` **至少给一个**：右键/编辑器入口给 `uri`（宿主自行算 ext），
 * 设置页按类型入口只给 `ext`。宿主未就绪时静默 no-op（插件不应为宿主能力缺失做分支）。
 */
export function openWith(request: OpenWithRequest): void {
  const host = (globalThis as HostBridge).linkdesk;
  host?.commands?.executeCommand?.(SHELL_COMMANDS.openWith, request);
}
