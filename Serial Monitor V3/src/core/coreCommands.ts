/**
 * 核心内置命令 + 菜单项注册。
 * Phase 5b：右键菜单归一化——核心内置命令走 CommandRegistry，菜单项走 MenuRegistry。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-右键菜单系统.md §六
 *
 * 模式：模块级 callbacks ref——App.tsx 每次渲染更新 ref（零开销），
 * handler 延迟读取 _callbacks 避免闭包过期。命令只在首次调用时注册一次。
 */

import { registerCommand, type Command } from "./CommandRegistry";
import { registerMenuItems, MenuId } from "./MenuRegistry";

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
}

let _callbacks: CoreCallbacks | null = null;
let _registered = false;

/** 每次渲染调用——更新 callbacks ref（零开销赋值，无需 deps 管理） */
export function updateCoreCallbacks(cb: CoreCallbacks): void {
  _callbacks = cb;
}

/* ── 命令定义（不包含 handler——handler 在 ensureRegistered 中桥接到 _callbacks） ── */

const CORE_COMMANDS: Array<Command & { menuGroup?: string; menuId: MenuId }> = [
  {
    id: "core.closeTab",
    title: "关闭",
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

  // 按 menuId 收集菜单项
  const menuItemsMap = new Map<MenuId, Array<{ command: string; group?: string }>>();

  for (const cmd of CORE_COMMANDS) {
    // 注册命令——如果 loader 已从 plugin.json 注册过，此调用覆盖为真实 handler
    registerCommand("app", {
      id: cmd.id,
      title: cmd.title,
      handler: cmd.handler,
    });

    // 收集菜单项
    if (!menuItemsMap.has(cmd.menuId)) {
      menuItemsMap.set(cmd.menuId, []);
    }
    menuItemsMap.get(cmd.menuId)!.push({
      command: cmd.id,
      group: cmd.menuGroup,
    });
  }

  // 注册菜单项
  for (const [menuId, items] of menuItemsMap) {
    registerMenuItems(menuId, "app", items);
  }
}
