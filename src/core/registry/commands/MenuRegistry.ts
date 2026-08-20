/**
 * 菜单注册表——对标 VS Code MenuRegistry + MenuId。
 * Phase 5 柱子 3：插件声明 contributes.menus → 右键/齿轮/命令面板动态内容。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子3
 *            docs/phase5_应用基础设施/V3-Phase5-右键菜单系统.md
 * VS Code 对标：MenuId + MenuRegistry.getMenuItems
 * VS Code 源码：src/vs/platform/actions/common/actions.ts — MenuId, MenuRegistry
 */

import { trackRegistration } from "../registrationTracker"; // E5.8#10：register 返 disposer——卸载自动逆序回滚

/* ── MenuId：唯一权威定义 ── */

/**
 * 菜单注册点 ID——对标 VS Code MenuId。
 * E5.7#64：闭合 enum → 开放 string——第三方作者可声明新注册点（任意字符串），
 * 壳零改动即可消费（插件独立铁律：壳不因新菜单点改代码）；壳内置注册点走 MENU_SLOTS 常量表。
 * 插件 manifest 声明的是同名字符串数据（不 import 壳模块——字符串即契约），与常量表天然同源。
 */
export type MenuId = string;

/** 壳内置菜单注册点常量表——壳代码唯一引用面（拼写错 = tsc 报错，字符串数据面不变） */
export const MENU_SLOTS = {
  /** Ctrl+Shift+P 命令面板 */
  CommandPalette: "commandPalette",
  /** 标签栏标签右键 */
  TabContext: "tabContext",
  /** 标签页主内容区右键（终端接收区、编辑器等） */
  EditorContext: "editorContext",
  /** 底部齿轮菜单——全局操作入口（设置、命令面板、主题选择器）。IconBar 消费。 */
  ExtensionGear: "extensionGear",
  /** 插件市场条目齿轮——per-plugin 操作（启用/禁用/卸载）。marketplace sidebar 消费。 */
  MarketplaceItemGear: "marketplaceItemGear",
  /** ☰ 汉堡菜单栏 */
  MenuBar: "menuBar",
  /** E5.8#33：菜单栏「面板」菜单——壳声明招牌 + 打开/折叠条目；插件 contributes.menus.menuBar/panel + group:"panel" 自动归并 */
  Panel: "panel",
  /** 文件树右键 */
  FileContext: "fileContext",
  /** 卡片右键 */
  CardContext: "cardContext",
  /** 快捷发送药丸右键 */
  QuickSendContext: "quickSendContext",
  /** 图标栏右键 */
  IconBar: "iconBar",
  /** E3f #53：设置项齿轮——Settings Editor 每行 hover 齿轮菜单 */
  SettingItemGear: "settingItemGear",
  /** view header 右键——SidePanel 容器标题右键菜单（折叠/展开/隐藏/重置位置） */
  ViewTitleContext: "viewTitleContext",
} as const;

/* ── 类型 ── */

export interface MenuItem {
  /** 命令 ID——引用 CommandRegistry 中的命令。有 children 时可为空（父菜单项）。 */
  command: string;
  /** 显示标签——有值时覆盖 getCommand(id).title。父菜单项（无 command）必填。 */
  label?: string;
  /** 分组——菜单内的分隔（"navigation" / "edit" / "extension" 等） */
  group?: string;
  /** context key when 条件——Phase 5 实现（见 ContextKeyService） */
  when?: string;
  /** 排序权重——同 group 内越小越靠前 */
  order?: number;
  /**
   * E3f #52a：嵌套子菜单——对标 VS Code SubmenuAction。
   * 有 children 时 command 可为空字符串——父菜单项不执行命令，展开子菜单。
   */
  children?: MenuItem[];
}

/** 插件在 plugin.json 里声明的菜单项——command 或 submenu 二选一 */
export type ManifestMenuItem =
  | string
  | {
      command: string;
      label?: string;
      when?: string;
      group?: string;
      /** E5.8#33：排序权重——同 group 内越小越靠前（壳招牌用于菜单栏组序） */
      order?: number;
      /** E3f #52a：嵌套子菜单——有 children 时 command 可为空 */
      children?: ManifestMenuItem[];
    };

/* ── Registry ── */

const _menus = new Map<MenuId, Array<MenuItem & { pluginId: string }>>();

/** 注册菜单项——loader 在 parseContributions 阶段调用。幂等：同 pluginId + command 不会重复。
 *  E5.8#10 返 disposer：只删本次调用新增的条目（引用级精确）——去重跳过的条目不碰。 */
export function registerMenuItems(
  menuId: MenuId,
  pluginId: string,
  items: ManifestMenuItem[]
): () => void {
  const existing = _menus.get(menuId) ?? [];
  const added: Array<MenuItem & { pluginId: string }> = [];
  for (const item of items) {
    let normalized: MenuItem & { pluginId: string };

    if (typeof item === "string") {
      normalized = { command: item, pluginId };
    } else {
      normalized = {
        command: item.command,
        label: item.label,
        group: item.group,
        when: item.when,
        order: item.order, // E5.8#33：order 归一化透传——getMenuItems 排序依赖（面板招牌排文件/查看后）
        pluginId,
      };
      // E3f #52a：递归处理嵌套 children
      if (item.children) {
        normalized.children = item.children.map((c): MenuItem & { pluginId: string } => {
          if (typeof c === "string") return { command: c, pluginId };
          return {
            command: c.command,
            label: c.label,
            group: c.group,
            when: c.when,
            order: c.order,
            pluginId,
            ...(c.children ? {
              children: c.children.map((gc): MenuItem & { pluginId: string } =>
                typeof gc === "string"
                  ? { command: gc, pluginId }
                  : { command: gc.command, label: gc.label, group: gc.group, when: gc.when, order: gc.order, pluginId }
              ),
            } : {}),
          };
        });
      }
    }

    // 幂等——同一 menuId 下同一 pluginId 同一 command 不重复注册
    // 父菜单项（command 为空但有 children）不做幂等检查——允许多个同名组
    const duplicate = normalized.command
      ? existing.some((e) => e.command === normalized.command && e.pluginId === normalized.pluginId)
      : false;
    if (!duplicate) {
      existing.push(normalized);
      added.push(normalized);
    }
  }
  _menus.set(menuId, existing);

  // E5.8#10：disposer = 从当前列表滤掉本次新增的引用。unregisterMenuItems 换过数组也幂等
  // （引用不在新数组里 → filter 自然保留）。无新增（全去重）→ 不登记追踪，返 no-op。
  const dispose = (): void => {
    if (added.length === 0) return;
    const list = _menus.get(menuId);
    if (!list) return;
    _menus.set(menuId, list.filter((item) => !added.includes(item)));
  };
  return added.length > 0 ? trackRegistration(pluginId, dispose) : () => {};
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

/* ── E3h #66：TitleBar 声明式扩展区域 ── */

/** 插件在 plugin.json 里声明的 TitleBar 按钮 */
export interface TitleBarContribution {
  /** 点击时执行的命令 ID */
  command: string;
  /** codicon 类名（如 "codicon-settings"）或图片路径 */
  icon?: string;
  /** context key when 条件——不满足时隐藏按钮 */
  when?: string;
  /** 排序权重——越小越靠外 */
  order?: number;
}

const _titleBar = new Map<string, Array<TitleBarContribution & { pluginId: string }>>();

/** 插件声明 contributes.titleBar → 注册按钮到指定槽位。
 *  E5.8#10 返 disposer：删"这一条"（按引用滤除）。 */
export function registerTitleBarContribution(
  pluginId: string,
  slot: "left" | "right",
  item: TitleBarContribution
): () => void {
  const list = _titleBar.get(slot) ?? [];
  const entry = { ...item, pluginId };
  list.push(entry);
  list.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
  _titleBar.set(slot, list);

  return trackRegistration(pluginId, () => {
    const cur = _titleBar.get(slot);
    if (!cur) return;
    const kept = cur.filter((i) => i !== entry);
    if (kept.length !== cur.length) {
      _titleBar.set(slot, kept);
    }
  });
}

/** 获取指定槽位的所有按钮（已按 order 排序） */
export function getTitleBarContributions(
  slot: "left" | "right"
): Array<TitleBarContribution & { pluginId: string }> {
  return _titleBar.get(slot) ?? [];
}
