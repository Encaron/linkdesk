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

import { registerCommand, type Command } from "../registry/CommandRegistry";
import { registerMenuItems, MenuId } from "../registry/MenuRegistry";
import { APP_PLUGIN_ID } from "../services/PluginStateService";
import { CUSTOM_EVENTS } from "../react/CoreEvents";
import i18n from "../../i18n";
import { getWorkspaceLayout } from "../services/LayoutService"; // E3f #56
import { getUserSettings } from "../services/ConfigurationService"; // E3f #56

// E5#44-1：Callbacks 类型 + 注册函数提取到 CoreCallbacks.ts
export type { CoreCallbacks } from "./CoreCallbacks";
export { updateCoreCallbacks } from "./CoreCallbacks";
import { getCallbacks, isRegistered, setRegistered } from "./CoreCallbacks";

/* ── 命令定义 ── */

const CORE_COMMANDS: Array<Command & { menuGroup?: string; menuId?: MenuId }> = [
  {
    id: "workbench.action.showCommands",
    title: i18n.t("命令面板"),
    category: i18n.t("视图"),
    handler: async () => {
      window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.SHOW_PALETTE));
    },
    menuId: MenuId.ExtensionGear,
    menuGroup: "navigation",
  },
  // E3f #58：开发者工具——切换插件 DevTools
  // E3f #54：输出面板
  {
    id: "workbench.action.showOutput",
    title: i18n.t("输出"),
    category: i18n.t("视图"),
    handler: async () => {
      window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.SHOW_OUTPUT));
    },
    menuId: MenuId.ExtensionGear,
    menuGroup: "navigation",
  },
  // E3f #56：工作区导入导出
  {
    id: "workbench.action.exportWorkspace",
    title: i18n.t("导出工作区"),
    category: i18n.t("文件"),
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
    title: i18n.t("导入工作区"),
    category: i18n.t("文件"),
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
    title: i18n.t("关闭"),
    category: i18n.t("标签页"),
    handler: async (_token, ...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) getCallbacks()?.closeTab(ctx.tabId);
    },
    menuId: MenuId.TabContext,
    menuGroup: "navigation",
  },
  {
    id: "core.closeOtherTabs",
    title: i18n.t("关闭其他"),
    category: i18n.t("标签页"),
    handler: async (_token, ...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) {
        const group = getCallbacks()?.findGroupByTabId(ctx.tabId);
        if (group) getCallbacks()?.closeOtherTabs(group.groupId, ctx.tabId);
      }
    },
    menuId: MenuId.TabContext,
    menuGroup: "navigation",
  },
  {
    id: "core.closeRightTabs",
    title: i18n.t("关闭右侧"),
    category: i18n.t("标签页"),
    handler: async (_token, ...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) {
        const group = getCallbacks()?.findGroupByTabId(ctx.tabId);
        if (group) {
          const idx = group.tabs.findIndex((t) => t.id === ctx.tabId);
          if (idx >= 0) getCallbacks()?.closeRightTabs(group.groupId, idx);
        }
      }
    },
    menuId: MenuId.TabContext,
    menuGroup: "navigation",
  },
  {
    id: "core.splitDown",
    title: i18n.t("向下分屏"),
    category: i18n.t("标签页"),
    handler: async (_token, ...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) getCallbacks()?.splitTab(ctx.tabId, "vertical");
    },
    menuId: MenuId.TabContext,
    menuGroup: "split",
  },
  {
    id: "core.splitRight",
    title: i18n.t("向右分屏"),
    category: i18n.t("标签页"),
    handler: async (_token, ...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) getCallbacks()?.splitTab(ctx.tabId, "horizontal");
    },
    menuId: MenuId.TabContext,
    menuGroup: "split",
  },

  // ── E3f #53：设置项齿轮命令 ──

  {
    id: "workbench.action.resetSetting",
    title: i18n.t("重置此设置"),
    category: i18n.t("首选项"),
    handler: async (_token, ...args) => {
      const ctx = args[0] as { settingKey?: string } | undefined;
      const key = ctx?.settingKey;
      if (!key) return;
      const { showConfirm } = await import("../services/DialogService");
      const confirmed = await showConfirm(
        i18n.t("确定要将「{{key}}」重置为默认值吗？", { key })
      );
      if (!confirmed) return;
      const { resetConfigurationValue } = await import("../services/ConfigurationService");
      await resetConfigurationValue(key);
    },
    menuId: MenuId.SettingItemGear,
    menuGroup: "navigation",
    when: "settingModified",
  },
  {
    id: "workbench.action.copySettingId",
    title: i18n.t("复制设置 ID"),
    category: i18n.t("首选项"),
    handler: async (_token, ...args) => {
      const ctx = args[0] as { settingKey?: string } | undefined;
      const key = ctx?.settingKey;
      if (!key) return;
      await navigator.clipboard.writeText(key);
      const { pushToast, TOAST_TTL_INFO } = await import("../services/toast");
      pushToast({ message: i18n.t("已复制：") + key, ttl: TOAST_TTL_INFO });
    },
    menuId: MenuId.SettingItemGear,
    menuGroup: "navigation",
  },
  {
    id: "workbench.action.copySettingAsJson",
    title: i18n.t("复制为 JSON"),
    category: i18n.t("首选项"),
    handler: async (_token, ...args) => {
      const ctx = args[0] as { settingKey?: string } | undefined;
      const key = ctx?.settingKey;
      if (!key) return;
      const { getConfigurationValue } = await import("../services/ConfigurationService");
      const value = getConfigurationValue(key);
      const json = JSON.stringify({ [key]: value }, null, 2);
      await navigator.clipboard.writeText(json);
      const { pushToast, TOAST_TTL_INFO } = await import("../services/toast");
      pushToast({ message: i18n.t("已复制为 JSON"), ttl: TOAST_TTL_INFO });
    },
    menuId: MenuId.SettingItemGear,
    menuGroup: "navigation",
  },

  // ── E3f #59-F：壳级快捷键命令（原 App.tsx 原始 keydown handler 迁移）──

];

// E5#44-2：标签页命令已提取到 tabCommands.ts
// E5#44-3：设置命令已提取到 settingsCommands.ts
import { registerTabCommands } from "./tabCommands";
import { registerSettingsCommands } from "./settingsCommands";
import { registerDeveloperCommands } from "./developerCommands";
import { registerShellMenus } from "./shellMenus";

// E5#16：剪贴板 Provider——壳统一快捷键，按焦点上下文分发
import { clipboardProviders } from "../ClipboardProviderRegistry";
import { ContextKeyService } from "../registry/ContextKeyService";

/** 解析当前焦点上下文——遍历已注册 Provider，找第一个 ContextKey 为 true 的 */
function resolveFocusContext(): string | undefined {
  for (const p of clipboardProviders.getAll()) {
    if (ContextKeyService.getValue(p.when)) return p.when;
  }
  return undefined;
}

/** 剪贴板操作——分发给匹配的 Provider，无匹配走浏览器原生 */
function dispatchClipboard(op: "copy" | "cut" | "paste" | "delete" | "selectAll"): void {
  if (ContextKeyService.getValue("inputFocus")) return;
  const ctx = resolveFocusContext();
  if (ctx) {
    const provider = clipboardProviders.resolve(ctx);
    if (provider) {
      if (op === "copy" && provider.onCopy) { provider.onCopy(); return; }
      if (op === "cut" && provider.onCut) { provider.onCut(); return; }
      if (op === "paste" && provider.onPaste) { provider.onPaste(); return; }
      if (op === "delete" && provider.onDelete) { provider.onDelete(); return; }
      if (op === "selectAll" && provider.onSelectAll) { provider.onSelectAll(); return; }
    }
  }
  document.execCommand(op);
}

/** 重命名——分发给匹配的 Provider */
function dispatchRename(): void {
  if (ContextKeyService.getValue("inputFocus")) return;
  const ctx = resolveFocusContext();
  if (ctx) {
    const provider = clipboardProviders.resolve(ctx);
    provider?.onRename?.();
  }
}

function registerClipboardCommands(): void {
  const cmd = (id: string, title: string, op: "copy" | "cut" | "paste" | "delete" | "selectAll") => ({
    id, title, category: "剪贴板", handler: async () => { dispatchClipboard(op); },
  });
  const commands = [
    cmd("core.clipboardCopy",  "复制", "copy"),
    cmd("core.clipboardCut",   "剪切", "cut"),
    cmd("core.clipboardPaste", "粘贴", "paste"),
    cmd("core.selectAll",      "全选", "selectAll"),
    cmd("core.delete",         "删除", "delete"),
    { id: "core.rename", title: "重命名", category: "编辑", handler: async () => { dispatchRename(); } },
  ];
  for (const c of commands) registerCommand(APP_PLUGIN_ID, c);
}

/* ── 注册入口（App.tsx useEffect 调用一次） ── */

/** 确保核心命令 + 菜单项已注册（幂等——只执行一次）。 */
export function ensureCoreCommands(): void {
  if (isRegistered()) return;
  setRegistered();

  // E5#44-2/3：标签页 + 设置命令独立注册
  registerTabCommands();
  registerSettingsCommands();
  registerDeveloperCommands();
  registerClipboardCommands();

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
export { CORE_KEYBINDINGS, ensureCoreKeybindings } from "./shellKeybindings";

