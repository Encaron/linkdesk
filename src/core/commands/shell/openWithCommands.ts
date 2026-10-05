/**
 * 「打开方式」壳命令——`workbench.action.openWith`（共享件 OpenWithPicker 的唯一调用面）。
 *
 * 为什么是壳命令而不是插件命令：它要能被 AI / CLI / 别的插件触发（三问决策链 Q3 ⇒ 壳命令 + SDK helper），
 * 且面板消费的是宿主声明（判据 A ⇒ 住壳/共享件）。原 id `file-tree.openWith` 是「住错层」的产物——
 * 卸载 file-tree 后设置页入口与编辑器按钮一并失效。
 *
 * 入参唯一形状 = `OpenWithRequest`（⛔ 不接受裸路径字符串）：见 `OpenWithService` 的归一化与装配。
 */

import { registerCommand, type Command } from "../../registry/commands/CommandRegistry";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { SHELL_COMMANDS } from "./shellCommands";
import { showOpenWith } from "../../services/ui/OpenWithService";

/** 注册壳命令（幂等由调用方 `ensureCoreCommands` 保证） */
export function registerOpenWithCommands(): void {
  // 🔴 显式标注 `Command[]`——同 settingsCommands 的理由：不标则 `type: "object"` 被放宽成 string。
  const commands: Command[] = [
    {
      id: SHELL_COMMANDS.openWith,
      title: "打开方式…",
      category: "编辑器",
      description: "为指定文件（uri）或文件类型（ext）选择打开方式——面板居中弹出；右键入口传 anchor 则就近弹出",
      params: [
        {
          name: "request",
          type: "object",
          required: true,
          description: "OpenWithRequest——{ uri?; name?; ext?; anchor? }，uri 与 ext 至少给一个（类型见 @linkdesk/contracts）",
        },
      ],
      handler: async (request: unknown) => {
        await showOpenWith(request);
      },
    },
  ];
  for (const cmd of commands) registerCommand(APP_PLUGIN_ID, cmd);
}
