/**
 * 壳首选项命令——设置/主题/语言/快捷键。
 * E5#44-3：从 coreCommands.ts 提取。
 */

import { registerCommand } from "../../registry/commands/CommandRegistry";
import { registerMenuItems, MENU_SLOTS } from "../../registry/commands/MenuRegistry";
import { factorySlots } from "../../services/bootstrap/FactorySlots";
import { setConfigurationValue, resetConfigurationValueBatch } from "../../services/configuration/ConfigurationService"; // E5.8#50.24：复位命令单一写入点
import { MIX_SOURCE_KEYS } from "../../services/ui/ThemeEngine"; // E5.8#90：混搭来源 key 全集——theme.resetMix 批复位用（单一来源）
import { getCallbacks } from "../infra/CoreCallbacks";
// E5.5#7-p15：CUSTOM_EVENTS.SHOW_THEME_BROWSER / SHOW_LANGUAGE_PICKER 不再使用——走 QuickPickService
import { openKeybindingsSettings } from "../../registry/commands/KeybindingRegistry";
import { requestSettingsGroup, requestScrollToSetting } from "../../registry/ConfigurationRegistry";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { shellEvents } from "../../react/events/ShellEvents";
import { getFloatingPanelViewId } from "../../../pluginLoader/contributions/viewRegistry";

export function registerSettingsCommands(): void {
  const commands = [
    {
      id: "core.openSettings",
      title: "设置",
      category: "视图",
      handler: async (...args: unknown[]) => {
        const ctx = args[0] as { pluginId?: string; scrollTo?: string } | undefined;
        if (ctx?.pluginId) requestSettingsGroup(ctx.pluginId);
        if (ctx?.scrollTo) requestScrollToSetting(ctx.scrollTo);
        // E5.8#41.12 🪡 概念生效接缝：一对多后走 getActive（读持久化激活套；无记录/已卸载回退默认=内置）
        const settingsPluginId = factorySlots.getActive("settings");
        if (!settingsPluginId) return;
        // E5.8#38（I8-3/IX-1 单一实例）：设置已是标签页 → 聚焦该标签页，不弹第二面板
        if (getCallbacks()?.focusTabByPluginId(settingsPluginId)) return;
        // E5.8#38（I8-1/I8-2）：声明制 revealFloating——面板身份开关键（无面板→开/同视图→关/他面板→替换）
        // 走 #39.5 子项 B wire（壳侧 useFloatingPanelReveal 编排），声明未解析 → no-op 不崩
        const fpViewId = getFloatingPanelViewId(settingsPluginId);
        // E5.8#41.16 🔴 复合寻址：双设置套并存时裸 viewId="settings" 会被 getViewByViewId 判歧义 fail-loud →
        // 静默 no-op（Ctrl+,/齿轮失效）。壳侧路径已知激活套 pluginId → 载荷携带，resolve 走复合键精确命中（#41.8 §4.2）。
        if (fpViewId) shellEvents.emit("panel:reveal-floating", { viewId: fpViewId, pluginId: settingsPluginId });
      },
    },
    {
      // E5.8#50.24：升级两段式（配方→配色）——命令 id 归一化为 theme.* 族（09 §1 命令清单）
      id: "theme.pick",
      title: "主题：选择主题…",
      handler: async (...args: unknown[]) => {
        const ctx = args[0] as { pluginId?: string } | undefined;
        // E5.5#7-p15：直调 QuickPickService——不再 dispatch SHOW_THEME_BROWSER
        const { showThemePicker } = await import("../../../components/shared/theme-browser/ThemeBrowser");
        showThemePicker(ctx?.pluginId);
      },
    },
    {
      // E5.8#50.24：复位外观——app.appearanceMode→followTheme（onApply 级联清 9 覆盖 + 6 域来源 + 强调色回配方，08 §7.3.5 单一写入点）
      id: "theme.resetAppearance",
      title: "外观：复位外观覆盖…",
      handler: async () => {
        await setConfigurationValue("app.appearanceMode", "followTheme", "user");
      },
    },
    {
      // E5.8#90：复位混搭——批复位 3 来源键回跟随主题（保持自定义模式；域来源 onApply 重合并回主题基线，startup.ts 单一写入点；E5.8#132 surface 域删来源 4→3）
      id: "theme.resetMix",
      title: "混搭：复位为整体配方…",
      handler: async () => {
        await resetConfigurationValueBatch(MIX_SOURCE_KEYS, "user");
      },
    },
    {
      id: "workbench.action.selectLanguage",
      title: "选择语言",
      category: "首选项",
      handler: async () => {
        // E5.5#7-p15：直调 QuickPickService——不再 dispatch SHOW_LANGUAGE_PICKER
        const { showLanguagePicker } = await import("../../../components/shared/language-picker/LanguagePicker");
        showLanguagePicker();
      },
    },
    {
      id: "workbench.action.openKeybindingsSettings",
      title: "打开键盘快捷方式",
      category: "首选项",
      handler: async () => { await openKeybindingsSettings(); },
    },
  ];

  for (const c of commands) {
    registerCommand(APP_PLUGIN_ID, c);
  }

  // 齿轮菜单——设置/主题/语言/快捷键 四个入口（E5.8#50.24：theme.pick 归一化命令 id）
  registerMenuItems(MENU_SLOTS.ExtensionGear, APP_PLUGIN_ID, [
    { command: "core.openSettings", group: "navigation" },
    { command: "theme.pick", group: "navigation" },
    { command: "workbench.action.selectLanguage", group: "navigation" },
    { command: "workbench.action.openKeybindingsSettings", group: "navigation" },
    // E6#57.10：新 group ⇒ 与上面四个 navigation 之间自动出一条分隔线（ContextMenu 相邻不同
    // group 出线）。即设计 03 §三「入口可多处，命令源唯一」的第二处入口——命令 id 与帮助菜单同一条。
    // 对齐 mockups/01 Frame 2：设置/主题/语言/快捷键 ── 检查更新…（/ 关于 LinkDesk 待 #57.14）。
    { command: "update.checkForUpdates", group: "update" },
  ]);
}
