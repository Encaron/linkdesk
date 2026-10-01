/**
 * 壳「欢迎页」命令——欢迎标签页重设计 W4a。
 * 任务档案：`docs/04-软件更新/待抉择池/欢迎标签页重设计/`（01-设计.md §三 W4）。
 *
 * ## 只有一条命令
 *
 * | id | 谁发起 | 可见性 |
 * |:--|:--|:--|
 * | `app.openWelcome` | **人**——帮助菜单（helpLearn 锚位）＋ 标签栏 [+] 菜单末项 ＋ 命令面板 | 命令面板可见 |
 *
 * W7 落地后欢迎页不再是保底标签（零标签 ⇒ 空场背景），本命令成为三个**显式入口**
 * 共用的唯一落点（「入口可多处，命令源唯一」——与 `app.openAiManual` 逐字同理）。
 *
 * ## 为什么走 `getCallbacks().openTab`
 *
 * 与 `manualCommands.ts` 同族：`openOrFocusTab`（按 type 去重，已有则聚焦）——
 * 本函数不自判「有没有开过」，那是标签页状态层的职责。目标身份 = 壳自有常量
 * `FALLBACK_PLUGIN_ID`（fallbackPluginId.ts——壳兜底页，不属第三方 id 禁令面）。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { getCallbacks } from "../infra/CoreCallbacks";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { FALLBACK_PLUGIN_ID } from "../../utils/plugin/fallbackPluginId";

export function registerWelcomeCommands(): void {
  registerCommand(APP_PLUGIN_ID, {
    // 恒显（无 when）——壳兜底页无需任何插件在场，随时可回。
    id: "app.openWelcome",
    title: "欢迎页",
    category: "帮助",
    description: "打开（或聚焦）欢迎标签页——开始、最近文件夹、帮助入口都在这里",
    params: [],
    handler: async () => {
      getCallbacks()?.openTab(FALLBACK_PLUGIN_ID);
    },
  });
}
