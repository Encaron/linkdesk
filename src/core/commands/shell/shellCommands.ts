/**
 * 壳命令常量表——**插件消费宿主命令的唯一合法写法**（⛔ 不许在插件源码里写裸 id 字面量）。
 *
 * 为什么要这张表：宿主命令 id 一旦被插件硬编码，改名就是全生态事故——本表是「一处改名、
 * 全体跟随」的机械保证。`@linkdesk/plugin-sdk` 里有一份**同名字面量**的镜像（壳不依赖 SDK，
 * 依赖方向不允许壳 import 它），两边的相等由门禁腿 `check-shell-command-constants.mjs` 对账，
 * 见 `docs/插件作者文档` 的「调用宿主命令」一节。
 *
 * 🔴 纪律：本文件是 id 字面量的**两处合法落点之一**（另一处 = `packages/plugin-sdk`）；
 * 壳内自用、SDK 导出、作者文档三处必须同笔改。
 */
export const SHELL_COMMANDS = {
  /** 「打开方式」选择器——入参 `OpenWithRequest`（`@linkdesk/contracts`）；面板升起，动作回执走 openWith:action */
  openWith: "workbench.action.openWith",
} as const;
