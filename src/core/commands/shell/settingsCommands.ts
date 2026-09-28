/**
 * 壳首选项命令——设置/主题/语言/快捷键。
 * E5#44-3：从 coreCommands.ts 提取。
 */

import { registerCommand, type Command } from "../../registry/commands/CommandRegistry";
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
import { getFloatingPanelViewId, getTabCreatableViews } from "../../../pluginLoader/contributions/viewRegistry";
import { resolveFloatingPanelOpenForm } from "../../services/ui/floatingPanelForm";

export function registerSettingsCommands(): void {
  // 🔴 显式标注 `Command[]`（不是可省的类型注解）：不标则数组字面量里的 `type: "object"`
  // 会放宽成 `string`，`registerCommand` 当场编译红（M1 `AI#7` 的 params 是四值联合）。
  const commands: Command[] = [
    {
      id: "core.openSettings",
      title: "设置",
      category: "视图",
      description: "打开设置页（已有设置标签页/悬浮面板则聚焦它，不重复开）",
      params: [{ name: "ctx", type: "object", required: false, description: "{ pluginId: string; scrollTo: string }——pluginId 定位到该插件的设置分组，scrollTo 滚动到指定设置项" }],
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
        // 🪡 首开形态（声明制通用接缝，2026-09 用户拍板）：插件声明 defaultForm / formKey（键交用户），
        // 壳决定开成标签页还是悬浮面板——壳侧零插件 id 硬编码，将来任何声明者自动生效。
        // ⚠️ 只作用于「此刻没有设置标签页」这一支：上面聚焦支已 return，开成之后的面板↔标签页互转
        // （面板右上角「在主窗口中打开」/ 标签页右键「在悬浮面板中打开」）仍各走原路，不归这里管。
        const form = resolveFloatingPanelOpenForm(settingsPluginId);
        // 声明 tab 且该插件**真能**开成标签页（appearsIn.tabBar + entry，同 open-in 按钮门控）→ 开标签页。
        // 声明 tab 却无标签页形态 = 作者声明矛盾 ⇒ 落回面板（有面板就开），不静默无动作。
        if (form === "tab" && getTabCreatableViews().some((v) => v.pluginId === settingsPluginId)) {
          getCallbacks()?.openTab(settingsPluginId);
          return;
        }
        // E5.8#41.16 🔴 复合寻址：双设置套并存时裸 viewId="settings" 会被 getViewByViewId 判歧义 fail-loud →
        // 静默 no-op（Ctrl+,/齿轮失效）。壳侧路径已知激活套 pluginId → 载荷携带，resolve 走复合键精确命中（#41.8 §4.2）。
        if (fpViewId) shellEvents.emit("panel:reveal-floating", { viewId: fpViewId, pluginId: settingsPluginId });
      },
    },
    {
      // E5.8#50.24：升级两段式（配方→配色）——命令 id 归一化为 theme.* 族（09 §1 命令清单）
      id: "theme.pick",
      title: "主题：选择主题…",
      description: "打开主题选择器切换当前主题",
      params: [{ name: "ctx", type: "object", required: false, description: "{ pluginId: string }——只列该插件提供的主题，省略 = 列全部主题" }],
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
      description: "把外观模式复位为跟随主题，并清掉全部外观覆盖",
      handler: async () => {
        await setConfigurationValue("app.appearanceMode", "followTheme", "user");
      },
    },
    {
      // E5.8#90：复位混搭——批复位 3 来源键回跟随主题（保持自定义模式；域来源 onApply 重合并回主题基线，startup.ts 单一写入点；E5.8#132 surface 域删来源 4→3）
      id: "theme.resetMix",
      title: "混搭：复位为整体配方…",
      description: "把混搭（分区外观）的各来源复位为跟随主题，保持自定义模式",
      handler: async () => {
        await resetConfigurationValueBatch(MIX_SOURCE_KEYS, "user");
      },
    },
    {
      id: "workbench.action.selectLanguage",
      title: "选择语言",
      category: "首选项",
      description: "打开语言选择器切换界面语言",
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
      description: "打开键盘快捷方式设置页",
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
    // 对齐 mockups/01 Frame 2：设置/主题/语言/快捷键 ── 检查更新… / 关于 LinkDesk。
    { command: "update.checkForUpdates", group: "update" },
    // ── E6#57.14g：关于入口——**末项**，与「检查更新…」**同组 `update`**（判据②，与帮助菜单同款取舍：
    // 同组不画线）。命令 id 与帮助菜单是**同一条**（`app.about`）——「入口可多处，命令源唯一」。
    { command: "app.about", group: "update" },
  ]);
}
