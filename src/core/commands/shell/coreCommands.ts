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
import { getUserSettings } from "../../services/configuration/ConfigurationService"; // E3f #56

// E5#44-1：Callbacks 类型 + 注册函数提取到 CoreCallbacks.ts
export type { CoreCallbacks } from "../infra/CoreCallbacks";
export { updateCoreCallbacks } from "../infra/CoreCallbacks";
import { getCallbacks, isRegistered, setRegistered } from "../infra/CoreCallbacks";

/* ── 命令定义 ── */

const CORE_COMMANDS: Array<Command & { menuGroup?: string; menuId?: MenuId }> = [
  {
    id: "workbench.action.showCommands",
    title: "命令面板",
    category: "视图",
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
    handler: async () => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".linkdesk-workspace";
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (data.layout) {
            window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.RESTORE_WORKSPACE, {
              detail: { layout: data.layout, settings: data.settings },
            }));
          }
        } catch { /* 格式错误——静默 */ }
      };
      input.click();
    },
  },
  {
    id: "core.closeTab",
    title: "关闭",
    category: "标签页",
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
    handler: async (...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) getCallbacks()?.mergeTabToMain(ctx.tabId);
    },
    // 无 menuId——不常驻所有 tab 右键。可见性 = ui.ts menu:getItems TabContext 分支动态注入
    // （findTabWindow → detached 才注入，#39.5 同款）。命令本身已注册（点击可执行）。
  },
  // ── E3f #53：设置项齿轮命令 ──

  {
    id: "workbench.action.resetSetting",
    title: "重置此设置",
    category: "首选项",
    handler: async (...args) => {
      const ctx = args[0] as { settingKey?: string } | undefined;
      const key = ctx?.settingKey;
      if (!key) return;
      const { showConfirm } = await import("../../services/ui/DialogService");
      const confirmed = await showConfirm(
        i18n.t("确定要将「{{key}}」重置为默认值吗？", { key })
      );
      if (!confirmed) return;
      const { resetConfigurationValue } = await import("../../services/configuration/ConfigurationService");
      await resetConfigurationValue(key);
    },
    menuId: MENU_SLOTS.SettingItemGear,
    menuGroup: "navigation",
    when: "settingModified",
  },
  // E5.8 用户审计 #3：跟随主题——单个键删 user scope 回落主题基线（外观键未覆盖时主题胜出，
  // 删覆盖即切主题跟变，解决 custom 模式切主题丢配置痛点 3）。与「重置此设置」同路径
  // resetConfigurationValue，差异 = 语义直述 + 仅 resetsToTheme 声明键出现（SettingRow 设 context key
  // settingFollowTheme）+ 不弹确认（轻操作可逆——重设值即恢复，对标 VS Code 重置语义）。
  {
    id: "workbench.action.followTheme",
    title: "跟随主题",
    category: "首选项",
    handler: async (...args) => {
      const ctx = args[0] as { settingKey?: string } | undefined;
      const key = ctx?.settingKey;
      if (!key) return;
      const { resetConfigurationValue } = await import("../../services/configuration/ConfigurationService");
      await resetConfigurationValue(key);
    },
    menuId: MENU_SLOTS.SettingItemGear,
    menuGroup: "navigation",
    when: "settingModified && settingFollowTheme",
  },
  {
    id: "workbench.action.copySettingId",
    title: "复制设置 ID",
    category: "首选项",
    handler: async (...args) => {
      const ctx = args[0] as { settingKey?: string } | undefined;
      const key = ctx?.settingKey;
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
    handler: async (...args) => {
      const ctx = args[0] as { settingKey?: string } | undefined;
      const key = ctx?.settingKey;
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

  // ── E5.7#79：窗口缩放——真值源 = 配置 window.zoomLevel（onApply 推主进程 setZoomFactor）。──
  // 命令只管读写配置，缩放应用/持久化全走 ConfigurationApplier——单一路径不重复。
  // 键位在 shellKeybindings.ts：ctrl+= / ctrl+shift+=（同物理键）/ ctrl+- / ctrl+0。
  {
    id: "view.zoomIn",
    title: "放大",
    category: "视图",
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
  registerQuickPickCommand(); // E5.7#18：quickpick.show 插件命令

  // ── 注册核心命令 ──
  const menuItemsMap = new Map<MenuId, Array<{ command: string; group?: string }>>();

  for (const cmd of CORE_COMMANDS) {
    registerCommand(APP_PLUGIN_ID, {
      id: cmd.id,
      title: cmd.title,
      category: cmd.category,
      handler: cmd.handler,
    });

    if (cmd.menuId) {
      if (!menuItemsMap.has(cmd.menuId)) {
        menuItemsMap.set(cmd.menuId, []);
      }
      menuItemsMap.get(cmd.menuId)!.push({
        command: cmd.id,
        group: cmd.menuGroup,
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

