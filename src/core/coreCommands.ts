/**
 * 核心内置命令 + 菜单项注册。
 * Phase 5b：右键菜单归一化——核心内置命令走 CommandRegistry，菜单项走 MenuRegistry。
 * Phase 5c：命令面板走 Registry——加 category + 全局命令面板入口 + Ctrl+Shift+P。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-右键菜单系统.md §六
 *           docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子1
 *
 * 模式：模块级 callbacks ref——App.tsx 每次渲染更新 ref（零开销），
 * handler 延迟读取 _callbacks 避免闭包过期。命令只在首次调用时注册一次。
 */

import { registerCommand, type Command } from "./CommandRegistry";
import { registerMenuItems, MenuId } from "./MenuRegistry";
import { factorySlots } from "./FactorySlots";
import { APP_PLUGIN_ID } from "./PluginStateService";
import { CUSTOM_EVENTS } from "./CoreEvents";
import { openKeybindingsSettings } from "./KeybindingRegistry";

/* ── Callbacks ── */

export interface CoreCallbacks {
  /** 关闭指定标签页 */
  closeTab: (tabId: string) => void;
  /** 关闭组内除指定标签页外的所有标签页 */
  closeOtherTabs: (groupId: string, exceptTabId: string) => void;
  /** 关闭组内指定标签页右侧的所有标签页 */
  closeRightTabs: (groupId: string, tabIndex: number) => void;
  /** 分屏 */
  splitTab: (tabId: string, direction: "horizontal" | "vertical") => void;
  /** 查找标签页所在的组 */
  findGroupByTabId: (tabId: string) => { groupId: string; tabs: Array<{ id: string }> } | null;
  /** 打开/聚焦标签页 */
  openTab: (pluginId: string) => string;
}

let _callbacks: CoreCallbacks | null = null;
let _registered = false;

/** 每次渲染调用——更新 callbacks ref（零开销赋值，无需 deps 管理） */
export function updateCoreCallbacks(cb: CoreCallbacks): void {
  _callbacks = cb;
}

/* ── 命令定义 ── */

const CORE_COMMANDS: Array<Command & { menuGroup?: string; menuId?: MenuId }> = [
  {
    id: "core.openSettings",
    title: "设置",
    category: "视图",
    handler: async () => {
      // 齿轮菜单"设置"——通过系统插槽查找设置插件（对标 VS Code Ctrl+,）
      const pluginId = factorySlots.getPluginId("settings");
      if (pluginId) _callbacks?.openTab(pluginId);
    },
    menuId: MenuId.ExtensionGear,
    menuGroup: "navigation",
  },
  {
    id: "workbench.action.showCommands",
    title: "命令面板",
    category: "视图",
    handler: async () => {
      window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.SHOW_PALETTE));
    },
    menuId: MenuId.ExtensionGear,
    menuGroup: "navigation",
  },
  {
    id: "workbench.action.selectTheme",
    title: "选择颜色主题",
    category: "首选项",
    handler: async () => {
      window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.SHOW_THEME_BROWSER));
    },
    menuId: MenuId.ExtensionGear,
    menuGroup: "navigation",
  },
  {
    id: "workbench.action.openExtensionSettings",
    title: "扩展设置",
    category: "首选项",
    handler: async (_token, ...args) => {
      const ctx = args[0] as { pluginId?: string } | undefined;
      window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.SHOW_SETTINGS, {
        detail: { pluginId: ctx?.pluginId },
      }));
    },
    menuId: MenuId.ExtensionGear,
    menuGroup: "navigation",
  },
  {
    id: "workbench.action.openKeybindingsSettings",
    title: "打开键盘快捷方式",
    category: "首选项",
    handler: async () => {
      const path = await openKeybindingsSettings();
      if (path) {
        // 通知用户文件位置——后续 Phase 6 JSON 编辑器接管此命令
        const { pushToast, TOAST_TTL_INFO } = await import("./toast");
        pushToast({
          message: `快捷键配置文件：${path}`,
          ttl: TOAST_TTL_INFO,
        });
      }
    },
  },
  {
    id: "core.closeTab",
    title: "关闭",
    category: "标签页",
    handler: async (_token, ...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) _callbacks?.closeTab(ctx.tabId);
    },
    menuId: MenuId.TabContext,
    menuGroup: "navigation",
  },
  {
    id: "core.closeOtherTabs",
    title: "关闭其他",
    category: "标签页",
    handler: async (_token, ...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) {
        const group = _callbacks?.findGroupByTabId(ctx.tabId);
        if (group) _callbacks?.closeOtherTabs(group.groupId, ctx.tabId);
      }
    },
    menuId: MenuId.TabContext,
    menuGroup: "navigation",
  },
  {
    id: "core.closeRightTabs",
    title: "关闭右侧",
    category: "标签页",
    handler: async (_token, ...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) {
        const group = _callbacks?.findGroupByTabId(ctx.tabId);
        if (group) {
          const idx = group.tabs.findIndex((t) => t.id === ctx.tabId);
          if (idx >= 0) _callbacks?.closeRightTabs(group.groupId, idx);
        }
      }
    },
    menuId: MenuId.TabContext,
    menuGroup: "navigation",
  },
  {
    id: "core.splitDown",
    title: "向下分屏",
    category: "标签页",
    handler: async (_token, ...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) _callbacks?.splitTab(ctx.tabId, "vertical");
    },
    menuId: MenuId.TabContext,
    menuGroup: "split",
  },
  {
    id: "core.splitRight",
    title: "向右分屏",
    category: "标签页",
    handler: async (_token, ...args) => {
      const ctx = args[0] as { tabId?: string } | undefined;
      if (ctx?.tabId) _callbacks?.splitTab(ctx.tabId, "horizontal");
    },
    menuId: MenuId.TabContext,
    menuGroup: "split",
  },
];

/* ── 注册入口（App.tsx useEffect 调用一次） ── */

/** 确保核心命令 + 菜单项已注册（幂等——只执行一次）。 */
export function ensureCoreCommands(): void {
  if (_registered) return;
  _registered = true;

  // ── 注册核心标签页命令 ──
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

  // E3b #36e：选择颜色主题——底部齿轮始终显，插件卡片仅对有 contributes.themes 的插件显
  registerMenuItems(MenuId.MarketplaceItemGear, APP_PLUGIN_ID, [
    { command: "workbench.action.selectTheme", group: "navigation", when: "extensionHasThemes" },
    { command: "workbench.action.openExtensionSettings", group: "navigation", when: "extensionHasConfiguration" },
  ]);

}
