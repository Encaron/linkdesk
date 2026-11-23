/**
 * 壳「外观资产」命令 —— 语义归属（2026-11-24）的 AI/命令入口。
 *
 * | id | 形态 | 说明 |
 * |:--|:--|:--|
 * | `appearance.pickImage` | 动作 | 弹系统选图框 → 拷入受控存储 → 返回 `{picked,url,name}` |
 *
 * 🔴 为什么是宿主动作而不是插件私有逻辑：起始目录 / 扩展名白名单 / 入库去重全在
 *    `electron/services/hostAssets/appearance/defaults.ts`；换掉任何设置 UI，行为不变。
 * 插件（与 AI）只传 schema 声明的 `{domain,target}`，⛔ 不传路径、不传目录令牌。
 *
 * R1（用户在场）：选图必须由人在系统框里完成——AI 调本命令时同样会弹框等用户，不是偷偷读盘。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import type { AppearancePickOptions, AppearancePickResult } from "../../api/linkdesk-api/appearance";

export function registerAppearanceAssetCommands(): void {
  registerCommand(APP_PLUGIN_ID, {
    id: "appearance.pickImage",
    title: "选择背景图片",
    category: "首选项", // 命令面板归组——与存储/外观齿轮同组（复用既有译名）
    description:
      "弹出系统图片选择框，把选中的图片拷入受控外观存储并返回受控 URL（起始目录/过滤器由宿主决定；取消返回 picked:false）",
    params: [
      {
        name: "options",
        type: "object",
        required: true,
        description:
          '{ domain: string; target: string }——两个值都取自配置 schema 的 assetDomain / pickTarget（如 { domain:"appearance", target:"app" }）',
      },
    ],
    handler: async (...args) => {
      const options = args[0] as AppearancePickOptions | undefined;
      if (!options) {
        throw new Error("appearance.pickImage: 缺少 {domain,target}");
      }
      const pickImage = window.linkdesk?.appearance?.pickImage;
      if (!pickImage) {
        throw new Error("appearance.pickImage: 宿主未提供选图动作");
      }
      const result: AppearancePickResult = await pickImage(options);
      return result;
    },
  });
}
