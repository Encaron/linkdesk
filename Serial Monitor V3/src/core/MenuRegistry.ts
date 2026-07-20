/**
 * 菜单注册表——对标 VS Code MenuRegistry + MenuId。
 * Phase 5 柱子 3：插件声明 contributes.menus → 右键/齿轮/命令面板动态内容。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子3
 *            docs/phase5_应用基础设施/V3-Phase5-右键菜单系统.md
 * VS Code 对标：MenuId + MenuRegistry.getMenuItems
 * VS Code 源码：src/vs/platform/actions/common/actions.ts — MenuId, MenuRegistry
 */

/* ── MenuId：唯一权威定义 ── */

/**
 * 菜单注册点——对标 VS Code MenuId。
 * Phase 5 定义全集，Phase 6/7 只消费不修改。
 */
export enum MenuId {
  /** Ctrl+Shift+P 命令面板 */
  CommandPalette = "commandPalette",
  /** 标签栏标签右键 */
  TabContext = "tabContext",
  /** 标签页主内容区右键（终端接收区、编辑器等） */
  EditorContext = "editorContext",
  /** 插件市场齿轮菜单 */
  ExtensionGear = "extensionGear",
  /** ☰ 汉堡菜单栏（Phase 6 消费） */
  MenuBar = "menuBar",
  /** 文件树右键（Phase 6 消费） */
  FileContext = "fileContext",
  /** 卡片右键（Phase 7 消费） */
  CardContext = "cardContext",
  /** 快捷发送药丸右键 */
  QuickSendContext = "quickSendContext",
  /** 图标栏右键 */
  IconBar = "iconBar",
}

/* ── 类型 ── */

export interface MenuItem {
  /** 命令 ID——引用 CommandRegistry 中的命令 */
  command: string;
  /** 分组——菜单内的分隔（"navigation" / "edit" / "extension" 等） */
  group?: string;
  /** context key when 条件——Phase 5 实现（见 ContextKeyService） */
  when?: string;
  /** 排序权重——同 group 内越小越靠前 */
  order?: number;
}

/** 插件在 plugin.json 里声明的菜单项——command 或 submenu 二选一 */
export type ManifestMenuItem = string | { command: string; when?: string; group?: string };

/* ── Registry ── */

const _menus = new Map<MenuId, Array<MenuItem & { pluginId: string }>>();

/** 注册菜单项——loader 在 parseContributions 阶段调用 */
export function registerMenuItems(
  menuId: MenuId,
  pluginId: string,
  items: ManifestMenuItem[]
): void {
  const existing = _menus.get(menuId) ?? [];
  for (const item of items) {
    const normalized: MenuItem & { pluginId: string } =
      typeof item === "string"
        ? { command: item, pluginId }
        : { command: item.command, group: item.group, when: item.when, pluginId };

    existing.push(normalized);
  }
  _menus.set(menuId, existing);
}

/** 注销插件在指定 MenuId 下的所有菜单项 */
export function unregisterMenuItems(menuId: MenuId, pluginId: string): void {
  const existing = _menus.get(menuId);
  if (!existing) return;
  _menus.set(
    menuId,
    existing.filter((item) => item.pluginId !== pluginId)
  );
}

/** 注销插件的全部菜单项——卸载时调用 */
export function unregisterPluginMenus(pluginId: string): void {
  for (const [menuId] of _menus) {
    unregisterMenuItems(menuId, pluginId);
  }
}

/** 获取指定位置的菜单项（不含 when 过滤——过滤由 ContextMenu 组件调用 ContextKeyService 完成） */
export function getMenuItems(
  menuId: MenuId
): Array<MenuItem & { pluginId: string }> {
  const items = _menus.get(menuId) ?? [];
  // 按 order 排序
  return [...items].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}

/** 获取完整的菜单注册表（调试用） */
export function getAllMenus(): Map<MenuId, Array<MenuItem & { pluginId: string }>> {
  return new Map(_menus);
}

/** 清空注册表（测试用） */
export function clearMenus(): void {
  _menus.clear();
}
