/**
 * 核心内置命令 + 菜单项注册。
 * Phase 5b：右键菜单归一化——核心内置命令走 CommandRegistry，菜单项走 MenuRegistry。
 * Phase 5c：命令面板走 Registry——加 category + 全局命令面板入口 + Ctrl+Shift+P。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-右键菜单系统.md §六
 *           docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子1
 *
 * 模式：模块级 callbacks ref——App.tsx 每次渲染更新 ref（零开销），
 * handler 延迟读取 getCallbacks() 避免闭包过期。命令只在首次调用时注册一次。
 */

import { registerCommand, type Command } from "../../registry/commands/CommandRegistry";
import { registerMenuItems, MENU_SLOTS, type MenuId } from "../../registry/commands/MenuRegistry";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { CUSTOM_EVENTS } from "../../react/events/CoreEvents";
import i18n from "../../../i18n";
import { getWorkspaceLayout } from "../../services/layout/LayoutService"; // E3f #56
import { pushToast } from "../../services/ui/toast"; // 04 工作区导入反馈（唯一通知面）
import { getUserSettings } from "../../services/configuration/ConfigurationService"; // E3f #56
import { getShellExposed } from "../../api/linkdesk-api/surfaces"; // 04 工作区导入：壳私有 dialog 扩展
import { CONFIG_NONE_SENTINEL } from "../../services/ui/ThemeEngine"; // E5.8#158：默认项哨兵（__none__）

// E5#44-1：Callbacks 类型 + 注册函数提取到 CoreCallbacks.ts
export type { CoreCallbacks } from "../infra/CoreCallbacks";
export { updateCoreCallbacks } from "../infra/CoreCallbacks";
import { getCallbacks, isRegistered, setRegistered } from "../infra/CoreCallbacks";
import type { LinkDeskCommandParam } from "../../api/linkdesk-api/types";

/**
 * M1 `AI#7`：设置项齿轮类命令共用的 ctx 参数——四处命令同一份字面量，只写一遍
 * （jscpd 门禁：抄成四份 = 6 行以上重复，本仓 `duplication` 直接红）。
 */
const SETTING_KEY_PARAM: LinkDeskCommandParam = {
  name: "ctx",
  type: "object",
  required: true,
  description: "{ settingKey: string }——目标设置项 id",
};

/** 从 ctx 实参取 settingKey——缺值返回 undefined（调用方静默返回：菜单项门控已保证有值）。 */
function settingKeyOf(args: unknown[]): string | undefined {
  return (args[0] as { settingKey?: string } | undefined)?.settingKey;
}

/* ── 命令定义 ── */

const CORE_COMMANDS: Array<Command & { menuGroup?: string; menuId?: MenuId }> = [
  {
    id: "workbench.action.showCommands",
    title: "命令面板",
    category: "视图",
    description: "打开命令面板，搜索并运行任意命令",
    handler: async () => {
      showCommandPalette();
    },
    menuId: MENU_SLOTS.ExtensionGear,
    menuGroup: "navigation",
  },
  // E3f #58：开发者工具——切换插件 DevTools
  // E3f #54：输出面板
  {
    id: "workbench.action.showOutput",
    title: "输出",
    category: "视图",
    description: "打开输出面板查看日志",
    handler: async () => {
      window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.SHOW_OUTPUT));
    },
    menuId: MENU_SLOTS.ExtensionGear,
    menuGroup: "navigation",
  },
  // E3f #56：工作区导入导出
  {
    id: "workbench.action.exportWorkspace",
    title: "导出工作区",
    category: "文件",
    description: "把当前布局与用户设置导出为工作区文件下载到本地",
    handler: async () => {
      const layout = getWorkspaceLayout();
      const settings = getUserSettings();
      const workspace = JSON.stringify({ version: 1, layout, settings }, null, 2);
      const blob = new Blob([workspace], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "workspace.linkdesk-workspace";
      a.click();
      URL.revokeObjectURL(url);
    },
  },
  {
    id: "workbench.action.importWorkspace",
    title: "导入工作区",
    category: "文件",
    description: "从工作区文件恢复布局与用户设置",
    handler: async () => {
      // 🔴 文件选择走主进程 dialog（04 实测第二根因）：input.click() 的文件对话框需要 user
      //    gesture，而菜单点击的手势在 pool 树、本 handler 在壳树——user gesture 不跨 WebContents
      //    ⇒ Chromium 静默拒绝（对话框根本不弹，正是用户看到的「点了没反应」）。
      const picked = await getShellExposed()?.dialog?.openWorkspaceImport?.();
      if (!picked) return; // 用户取消——无动作无提示
      // 最小校验（04 档案 §五.3）：JSON 坏 / 版本不识别 / 内容为空 ⇒ 明确报错，不静默。
      let data: { version?: unknown; layout?: unknown; settings?: unknown };
      try {
        data = JSON.parse(picked.content);
      } catch {
        pushToast({ source: "workspace", severity: "error", message: i18n.t("导入失败：不是有效的工作区文件") });
        return;
      }
      if (data.version !== 1) {
        pushToast({ source: "workspace", severity: "error", message: i18n.t("导入失败：不支持的工作区文件版本") });
        return;
      }
      if (!data.layout && !data.settings) {
        pushToast({ source: "workspace", severity: "error", message: i18n.t("导入失败：文件里没有可恢复的内容") });
        return;
      }
      // RESTORE_WORKSPACE 的监听器（lifecycle.ts）同步执行：布局恢复 + 设置写回 + 布局落盘
      window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.RESTORE_WORKSPACE, {
        detail: { layout: data.layout, settings: data.settings },
      }));
      pushToast({ source: "workspace", severity: "info", message: i18n.t("工作区已导入——布局与设置已恢复") });
    },
  },
  {
    id: "core.closeTab",
    title: "关闭",
    category: "标签页",
    description: "关闭指定标签页",
    params: [{ name: "ctx", type: "object", required: true, description: "{ tabId: string }——要关闭的标签页 id" }],
    handler: async (...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) getCallbacks()?.closeTab(ctx.tabId);
    },
    menuId: MENU_SLOTS.TabContext,
    menuGroup: "navigation",
  },
  {
    id: "core.closeOtherTabs",
    title: "关闭其他",
    category: "标签页",
    description: "关闭同分组中除指定标签页以外的全部标签页",
    params: [{ name: "ctx", type: "object", required: true, description: "{ tabId: string }——基准标签页 id（它的同组兄弟被关闭）" }],
    handler: async (...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) {
        const group = getCallbacks()?.findGroupByTabId(ctx.tabId);
        if (group) getCallbacks()?.closeOtherTabs(group.groupId, ctx.tabId);
      }
    },
    menuId: MENU_SLOTS.TabContext,
    menuGroup: "navigation",
  },
  {
    id: "core.closeRightTabs",
    title: "关闭右侧",
    category: "标签页",
    description: "关闭同分组中指定标签页右侧的全部标签页",
    params: [{ name: "ctx", type: "object", required: true, description: "{ tabId: string }——基准标签页 id（它右侧的兄弟被关闭）" }],
    handler: async (...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) {
        const group = getCallbacks()?.findGroupByTabId(ctx.tabId);
        if (group) {
          const idx = group.tabs.findIndex((t) => t.id === ctx.tabId);
          if (idx >= 0) getCallbacks()?.closeRightTabs(group.groupId, idx);
        }
      }
    },
    menuId: MENU_SLOTS.TabContext,
    menuGroup: "navigation",
  },
  {
    id: "core.splitDown",
    title: "向下分屏",
    category: "标签页",
    description: "把指定标签页所在分组上下分屏（新分组在下）",
    params: [{ name: "ctx", type: "object", required: true, description: "{ tabId: string }——要分屏的标签页 id" }],
    handler: async (...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) getCallbacks()?.splitTab(ctx.tabId, "vertical");
    },
    menuId: MENU_SLOTS.TabContext,
    menuGroup: "split",
  },
  {
    id: "core.splitRight",
    title: "向右分屏",
    category: "标签页",
    description: "把指定标签页所在分组左右分屏（新分组在右）",
    params: [{ name: "ctx", type: "object", required: true, description: "{ tabId: string }——要分屏的标签页 id" }],
    handler: async (...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) getCallbacks()?.splitTab(ctx.tabId, "horizontal");
    },
    menuId: MENU_SLOTS.TabContext,
    menuGroup: "split",
  },

  // ── E5.6#16.7k：池 GroupTabBar 右键菜单——补 GroupTabBar buildMenuItems() 中
  //    缺失的三个命令（关闭全部 / 复制标签页 / 固定切换）。
  //    已有命令 close/closeOthers/closeRightTabs/splitDown/splitRight 在 coreCommands 上方。
  {
    id: "core.closeAllTabs",
    title: "关闭全部",
    category: "标签页",
    description: "关闭指定分组内的全部标签页",
    params: [{ name: "ctx", type: "object", required: true, description: "{ groupId: string }——要清空的分组 id" }],
    handler: async (...args) => {
      const ctx = args[0] as { tabId?: string; groupId?: string } | undefined;
      if (ctx?.groupId) getCallbacks()?.closeAllTabs(ctx.groupId);
    },
    menuId: MENU_SLOTS.TabContext,
    menuGroup: "navigation",
  },
  {
    id: "core.duplicateTab",
    title: "复制标签页",
    category: "标签页",
    description: "在指定标签页所在分组复制一条同内容的标签页",
    params: [{ name: "ctx", type: "object", required: true, description: "{ tabId: string }——要复制的标签页 id" }],
    handler: async (...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) getCallbacks()?.duplicateTab(ctx.tabId);
    },
    menuId: MENU_SLOTS.TabContext,
    menuGroup: "edit",
  },
  {
    id: "core.togglePin",
    title: "固定/取消固定",
    category: "标签页",
    description: "固定或取消固定指定标签页（固定后不随批量关闭被关掉）",
    params: [{ name: "ctx", type: "object", required: true, description: "{ tabId: string }——要固定/取消固定的标签页 id" }],
    handler: async (...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) getCallbacks()?.pinTab(ctx.tabId);
    },
    menuId: MENU_SLOTS.TabContext,
    menuGroup: "pin",
  },
  // ── E5.8#44：可拖出窗口——标签页右键「在新窗口中打开」/「并回主窗口」。
  //    可见性：#39.5 同款动态注入（ui.ts menu:getItems TabContext 分支）——
  //    「并回主窗口」仅脱出窗 tab 注入（findTabWindow → detached）；「在新窗口中打开」恒有。
  {
    id: "core.openInNewWindow",
    title: "在新窗口中打开",
    category: "标签页",
    description: "把指定标签页拖出为独立窗口",
    params: [{ name: "ctx", type: "object", required: true, description: "{ tabId: string }——要拖出的标签页 id" }],
    handler: async (...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) getCallbacks()?.detachTab(ctx.tabId);
    },
    menuId: MENU_SLOTS.TabContext,
    menuGroup: "window",
  },
  {
    id: "core.mergeBackToMain",
    title: "并回主窗口",
    category: "标签页",
    description: "把脱出窗口中的指定标签页并回主窗口",
    params: [{ name: "ctx", type: "object", required: true, description: "{ tabId: string }——要并回主窗口的标签页 id" }],
    handler: async (...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) getCallbacks()?.mergeTabToMain(ctx.tabId);
    },
    // 无 menuId——不常驻所有 tab 右键。可见性 = ui.ts menu:getItems TabContext 分支动态注入
    // （findTabWindow → detached 才注入，#39.5 同款）。命令本身已注册（点击可执行）。
  },
  // ── E3f #53：设置项齿轮命令 ──

  // E5.8#158：默认项语义真区分——用户实机「重置此设置」与「跟随主题」本应不同（跟随主题=活动主题值，
  // 默认项=内置 dark/light 配方值=无主题时 GUI）但曾同调 resetConfigurationValue（删 user scope→主题胜出）。
  // 区分：声明 resetsToDefault 的键（string 型：字体/背景四键，:root 硬兜底 = __none__ 哨兵）→ 写 CONFIG_NONE_SENTINEL
  // 落到系统默认（不跟随主题）；number 型（E5.8 Phase 12 #161：app.uiFontScale）无哨兵语义 → 删 user scope
  // 回 schema default；其余键 → 删 user scope 回 schema 默认（VS Code 通用重置语义）。
  // when = settingResetsToDefault（四键恒显）|| (settingModified && !settingFollowTheme)（普通键改后显、
  // 玻璃/圆角不显——它们唯一能回的状态就是跟随主题，由 followTheme 命令覆盖，无独立默认项）。
  {
    id: "workbench.action.resetSetting",
    title: "重置此设置",
    category: "首选项",
    description: "把指定设置项重置为默认值（先弹确认框）",
    params: [SETTING_KEY_PARAM],
    handler: async (...args) => {
      const key = settingKeyOf(args);
      if (!key) return;
      const { showConfirm } = await import("../../services/ui/DialogService");
      const confirmed = await showConfirm(
        i18n.t("确定要将「{{key}}」重置为默认值吗？", { key })
      );
      if (!confirmed) return;
      const { getMergedSchema } = await import("../../registry/ConfigurationRegistry");
      const prop = getMergedSchema()[key];
      if (prop?.resetsToDefault) {
        if (prop.type === "number") {
          // E5.8 Phase 12 #161：number 型默认项键（app.uiFontScale）无 __none__ 哨兵语义（哨兵 = string 键
          // 专属——字体→系统栈/背景→无图）——删 user scope 回 schema default（100 = ⑤ 新基线），
          // 与 VS Code 通用重置同路径，NumberInput 显示不回 NaN。
          const { resetConfigurationValue } = await import("../../services/configuration/ConfigurationService");
          await resetConfigurationValue(key);
        } else {
          // E5.8#158：默认项 = 内置 dark/light 配方值（:root 硬兜底）——写 __none__ 哨兵，getAppearanceOverrides
          // 消费（字体→系统栈 / 背景→无图），与「跟随主题」（删覆盖主题胜出）真区分。
          const { setConfigurationValue } = await import("../../services/configuration/ConfigurationService");
          await setConfigurationValue(key, CONFIG_NONE_SENTINEL, "user");
        }
      } else {
        const { resetConfigurationValue } = await import("../../services/configuration/ConfigurationService");
        await resetConfigurationValue(key);
      }
    },
    menuId: MENU_SLOTS.SettingItemGear,
    menuGroup: "navigation",
    when: "settingResetsToDefault || (settingModified && !settingFollowTheme)",
  },
  // E5.8 用户审计 #3：跟随主题——单个键删 user scope 回落主题基线（外观键未覆盖时主题胜出，
  // 删覆盖即切主题跟变，解决 custom 模式切主题丢配置痛点 3）。与「重置此设置」同路径
  // resetConfigurationValue，差异 = 语义直述 + 仅 resetsToTheme 声明键出现（SettingRow 设 context key
  // settingFollowTheme）+ 不弹确认（轻操作可逆——重设值即恢复，对标 VS Code 重置语义）。
  // E5.8#157：恒显（2026-08-28 用户拍板）——原 when 含 settingModified（userValue 存在性动态判）：
  // #154 播种把值写 user scope，让「其实已跟随主题」的行也显「跟随主题」，点完无变化又消失 = 困惑。
  // 去 settingModified 恒显 resetsToTheme 键——已跟随的键点击 = 无操作；作用域仍由 settingFollowTheme
  // 逐行收窄（非 resetsToTheme 键不见），「打开存储位置」等 settingKey 门控命令不受影响。
  {
    id: "workbench.action.followTheme",
    title: "跟随主题",
    category: "首选项",
    description: "取消指定设置项的用户覆盖，让它重新跟随当前主题",
    params: [SETTING_KEY_PARAM],
    handler: async (...args) => {
      const key = settingKeyOf(args);
      if (!key) return;
      const { resetConfigurationValue } = await import("../../services/configuration/ConfigurationService");
      await resetConfigurationValue(key);
    },
    menuId: MENU_SLOTS.SettingItemGear,
    menuGroup: "navigation",
    when: "settingFollowTheme",
  },
  {
    id: "workbench.action.copySettingId",
    title: "复制设置 ID",
    category: "首选项",
    description: "把指定设置项的 id 复制到剪贴板",
    params: [SETTING_KEY_PARAM],
    handler: async (...args) => {
      const key = settingKeyOf(args);
      if (!key) return;
      const { writeClipboardText } = await import("../../services/ui/ClipboardService");
      writeClipboardText(key);
      const { pushToast, TOAST_TTL_INFO } = await import("../../services/ui/toast");
      pushToast({ message: i18n.t("已复制：") + key, ttl: TOAST_TTL_INFO });
    },
    menuId: MENU_SLOTS.SettingItemGear,
    menuGroup: "navigation",
  },
  {
    id: "workbench.action.copySettingAsJson",
    title: "复制为 JSON",
    category: "首选项",
    description: "把指定设置项的当前值以 JSON 复制到剪贴板",
    params: [SETTING_KEY_PARAM],
    handler: async (...args) => {
      const key = settingKeyOf(args);
      if (!key) return;
      const { getConfigurationValue } = await import("../../services/configuration/ConfigurationService");
      const value = getConfigurationValue(key);
      const json = JSON.stringify({ [key]: value }, null, 2);
      const { writeClipboardText } = await import("../../services/ui/ClipboardService");
      writeClipboardText(json);
      const { pushToast, TOAST_TTL_INFO } = await import("../../services/ui/toast");
      pushToast({ message: i18n.t("已复制为 JSON"), ttl: TOAST_TTL_INFO });
    },
    menuId: MENU_SLOTS.SettingItemGear,
    menuGroup: "navigation",
  },
  // E5.8#153：背景图两行齿轮「打开存储位置」——when 门控只现 app.backgroundImage/app.zoneBackgroundImage。
  // handler 调壳侧 appearance.revealStorage（E5.8#153：主进程解析 userData/appearance 并 openPath 开资源
  // 管理器内容——池内无路径知识）。失败 fail-loud 只记录不中断（console.error → debug 日志）。
  {
    id: "workbench.action.openAppearanceStorage",
    title: "打开存储位置",
    category: "首选项",
    description: "在系统资源管理器中打开外观存储目录（背景图存放处）",
    params: [{ name: "ctx", type: "object", required: true, description: "{ settingKey: string }——目标设置项 id（仅 app.backgroundImage / app.zoneBackgroundImage 会出现本命令）" }],
    handler: async (...args) => {
      const ctx = args[0] as { settingKey?: string } | undefined;
      if (!ctx?.settingKey) return;
      try {
        await window.linkdesk?.appearance.revealStorage();
      } catch (e) {
        console.error("[openAppearanceStorage] 打开存储位置失败:", e);
      }
    },
    menuId: MENU_SLOTS.SettingItemGear,
    menuGroup: "navigation",
    when: "settingKey == 'app.backgroundImage' || settingKey == 'app.zoneBackgroundImage'",
  },

  // ── E5.7#79：窗口缩放——真值源 = 配置 window.zoomLevel（onApply 推主进程 setZoomFactor）。──
  // 命令只管读写配置，缩放应用/持久化全走 ConfigurationApplier——单一路径不重复。
  // 键位在 shellKeybindings.ts：ctrl+= / ctrl+shift+=（同物理键）/ ctrl+- / ctrl+0。
  {
    id: "view.zoomIn",
    title: "放大",
    category: "视图",
    description: "放大界面（窗口缩放级别 +1，上限 8）",
    handler: async () => {
      const { getConfigurationValue, setConfigurationValue } = await import("../../services/configuration/ConfigurationService");
      const current = Number(getConfigurationValue<number>("window.zoomLevel")) || 0;
      await setConfigurationValue("window.zoomLevel", Math.min(8, current + 1), "user");
    },
  },
  {
    id: "view.zoomOut",
    title: "缩小",
    category: "视图",
    description: "缩小界面（窗口缩放级别 -1，下限 -8）",
    handler: async () => {
      const { getConfigurationValue, setConfigurationValue } = await import("../../services/configuration/ConfigurationService");
      const current = Number(getConfigurationValue<number>("window.zoomLevel")) || 0;
      await setConfigurationValue("window.zoomLevel", Math.max(-8, current - 1), "user");
    },
  },
  {
    id: "view.zoomReset",
    title: "重置缩放",
    category: "视图",
    description: "把界面缩放恢复为 100%",
    handler: async () => {
      const { setConfigurationValue } = await import("../../services/configuration/ConfigurationService");
      await setConfigurationValue("window.zoomLevel", 0, "user");
    },
  },

  // ── E3f #59-F：壳级快捷键命令（原 App.tsx 原始 keydown handler 迁移）──

];

// E5#44-2：标签页命令已提取到 tabCommands.ts
// E5#44-3：设置命令已提取到 settingsCommands.ts
import { registerTabCommands } from "./tabCommands";
import { registerSettingsCommands } from "./settingsCommands";
import { registerPanelCommands } from "./panelCommands"; // E5.8#31：底部面板显隐命令（Ctrl+J）
import { registerDeveloperCommands } from "./developerCommands";
import { registerUpdateCommands } from "./updateCommands"; // E6#57.10：主软件更新入口命令（检查更新…/处理更新）
import { registerReleaseNotesCommands } from "./releaseNotesCommands"; // E6#57.13：发行说明标签页（打开 + 池侧三条动作）
import { registerAboutCommands } from "./aboutCommands"; // E6#57.14：关于标签页（打开 + 池侧「复制」）
import { registerManualCommands } from "./manualCommands"; // M3 AI#16：AI 操作手册（打开；帮助菜单入口）
import { registerAiBridgeCommands } from "./aiBridgeCommands"; // M4 AI#38：AI 接入（状态出口＋设置页动作按钮）
import { registerShellMenus } from "../input-bindings/shellMenus";
import { registerQuickPickCommand } from "../palette/quickPickCommand"; // E5.7#18：quickpick.show 从 components/shared/QuickPick.tsx 迁入
import { showCommandPalette } from "../palette/commandPalette"; // E5.7#18：命令面板入口从 components/shared/CommandPalette.tsx 迁入

/* ── 注册入口（App.tsx useEffect 调用一次） ── */

/** 确保核心命令 + 菜单项已注册（幂等——只执行一次）。 */
export function ensureCoreCommands(): void {
  if (isRegistered()) return;
  setRegistered();

  // E5#44-2/3：标签页 + 设置命令独立注册
  registerTabCommands();
  registerSettingsCommands();
  registerPanelCommands(); // E5.8#31：底部面板显隐命令（Ctrl+J）
  registerDeveloperCommands();
  registerUpdateCommands(); // E6#57.10：主软件更新入口命令
  registerReleaseNotesCommands(); // E6#57.13：发行说明标签页（打开 + 池侧三条动作）
  registerAboutCommands(); // E6#57.14：关于标签页（打开 + 池侧「复制」）
  registerManualCommands(); // M3 AI#16：AI 操作手册标签页（打开；帮助菜单入口）
  registerAiBridgeCommands(); // M4 AI#38：AI 接入（五条状态出口 ＋ 七条动作按钮）
  registerQuickPickCommand(); // E5.7#18：quickpick.show 插件命令

  // ── 注册核心命令 ──
  const menuItemsMap = new Map<MenuId, Array<{ command: string; group?: string; when?: string }>>();

  for (const cmd of CORE_COMMANDS) {
    registerCommand(APP_PLUGIN_ID, {
      id: cmd.id,
      title: cmd.title,
      category: cmd.category,
      // M1 AI#8：说明与参数必须同笔复制——注册是显式逐字段拷贝，漏一个字段 = 元数据静默丢失
      description: cmd.description,
      params: cmd.params,
      when: cmd.when, // E5.8#153-fix：when 必须落注册——命令面板过滤消费（commandPalette matches(cmd.when)）
      handler: cmd.handler,
    });

    if (cmd.menuId) {
      if (!menuItemsMap.has(cmd.menuId)) {
        menuItemsMap.set(cmd.menuId, []);
      }
      menuItemsMap.get(cmd.menuId)!.push({
        command: cmd.id,
        group: cmd.menuGroup,
        // E5.8#153-fix：when 必须落菜单项——壳侧 getItems 过滤读 item.when ?? cmd.when，
        // 漏传 = whenExpr undefined → matches 恒真 → 齿轮菜单全命令无门控裸奔（实测每个齿轮都见
        // 重置/跟随主题/打开存储位置）。核心命令 when 门控此前从未真正生效（git log 无 when: cmd.when）。
        when: cmd.when,
      });
    }
  }

  for (const [menuId, items] of menuItemsMap) {
    registerMenuItems(menuId, APP_PLUGIN_ID, items);
  }

  // E5#44-6：壳菜单提取到 shellMenus.ts
  registerShellMenus();

}

// E5#44-5：快捷键定义提取到 shellKeybindings.ts
export { CORE_KEYBINDINGS, ensureCoreKeybindings } from "../input-bindings/shellKeybindings";

