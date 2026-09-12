/**
 * usePoolSync 标题栏序列化——MENU_STYLE 两表 + buildTitleBarMenuGroups / buildHamburgerMenuGroups /
 * buildTitleBarSlots。E5.8#0d.10-5a：自 usePoolSync.ts 拆出——纯函数：菜单栏/汉堡/槽位 DTO 序列化。
 * 依赖方向：titlebar → core/registry（Menu/Command/Keybinding/ContextKey）；iconbar → titlebar（汉堡）。
 */

import type { PoolMenuGroup, PoolMenuItem, TitleBarSlotButton } from "../../core/types/pool/poolLayout";
import { getMenuItems, MENU_SLOTS, getTitleBarContributions, type MenuItem } from "../../core/registry/commands/MenuRegistry"; // E5.7#5/#6：菜单栏序列化（titlebar + 汉堡）
import { getCommand } from "../../core/registry/commands/CommandRegistry"; // E5.7#5：菜单项 label 回退 command.title
import { getKeybindings } from "../../core/registry/commands/KeybindingRegistry"; // E5.7#6：汉堡菜单快捷键显示
import { ContextKeyService } from "../../core/registry/commands/ContextKeyService"; // E5.7#5：槽位按钮 when 过滤 + context 变化重推

/** E5.7#1：app.menuStyle 枚举 → 菜单栏可见——titleBar 布局（Phase 2 #5 TitleBarZone 消费） */
export const MENU_STYLE_MENUBAR_VISIBLE: Record<string, boolean> = {
  titlebar: true,
  hamburger: false,
  both: true,
};

/** E5.7#6：app.menuStyle 枚举 → ☰ 汉堡可见——iconBar 布局（Phase 2 #6 IconBarZone 消费） */
export const MENU_STYLE_HAMBURGER_VISIBLE: Record<string, boolean> = {
  titlebar: false,
  hamburger: true,
  both: true,
};

/** E5.8#37.6：when 过滤——when 缺失 = 恒匹配；不匹配 = 菜单项隐藏（对换菜单当开关）。
 *  菜单栏/汉堡统一语义（壳 MenuRenderer 的 when 过滤壳侧一站式）。ContextKeyService.matches
 *  读全局 context key（如 sidebarPosition——usePoolSync 随布局推送保持同步）。 */
function whenMatch(item: MenuItem): boolean {
  return !item.when || ContextKeyService.matches(item.when);
}

/** 壳 MenuRenderer.formatKeyLabel 同款——chord: "ctrl+k ctrl+t" → "Ctrl+K Ctrl+T" */
function formatKeyLabel(key: string): string {
  return key
    .split(" ")
    .map((chord) =>
      chord
        .replace(/ctrl\+/i, "Ctrl+")
        .replace(/alt\+/i, "Alt+")
        .replace(/shift\+/i, "Shift+")
        .replace(/\+\w/g, (m) => m.toUpperCase())
    )
    .join(" ");
}

/** E5.8#148：zone 显隐勾选菜单的可见性上下文——usePoolSync 状态传入（真相源 = App state，
 *  与命令 handler emit sidebar:toggle/panel:toggle 同一入口链），顶部/汉堡共用。 */
export interface ZoneVisibility {
  panelVisible: boolean;
  sidebarVisible: boolean;
}

/** E5.8#148：显隐勾选谓词——命令 ID → 当前勾选态（zone 可见 = ✓；不可见 = 空白，非灰显）。
 *  无映射命令返回 undefined（不显示 ✓）——单选勾选（面板位置/对齐）走 ui.ts resolvePanelChecked 不在此。 */
function resolveVisibilityChecked(commandId: string, vis: ZoneVisibility): boolean | undefined {
  switch (commandId) {
    case "workbench.action.toggleSidebarVisibility": return vis.sidebarVisible;
    case "workbench.action.togglePanel": return vis.panelVisible;
    default: return undefined;
  }
}

/** E5.8#55-C：菜单项 → PoolMenuItem 共用解析上下文（顶部/汉堡共用 resolveItemNode） */
interface ResolveItemCtx {
  t: (key: string) => string;
  /** 快捷键查找源——汉堡 showKeybindings=true 传入；顶部菜单栏无快捷键显示不传 */
  keybindings?: ReturnType<typeof getKeybindings>;
  /** E5.8#148：显隐勾选谓词——命令 → 当前勾选态（zone 可见 = ✓）。undefined = 不显示 ✓ */
  resolveChecked?: (commandId: string) => boolean | undefined;
}

/** E5.8#55-C：菜单项 → PoolMenuItem 共用解析——顶部/汉堡唯一一处 label 解析 + when 过滤 +
 *  children 递归 + 快捷键显示（原两处 resolveItem 各写一份——C 修复去重）。
 *  语义：when 不匹配 → 返回 null（调用方过滤）；label 优先于命令 title；传 keybindings 才查快捷键。 */
function resolveItemNode(item: MenuItem, ctx: ResolveItemCtx): PoolMenuItem | null {
  if (!whenMatch(item)) return null;
  const kb = ctx.keybindings?.find((k) => k.command === item.command);
  const checked = ctx.resolveChecked?.(item.command);
  const children = item.children?.map((c) => resolveItemNode(c, ctx)).filter((c): c is PoolMenuItem => c !== null);
  return {
    label: item.label ? ctx.t(item.label) : item.command ? ctx.t(getCommand(item.command)?.title ?? item.command) : "",
    command: item.command,
    // E6#57.10：组内二级分组透传——菜单里画分隔线的唯一依据（ContextMenu 相邻不同 group = 一条线）。
    // 全仓既有菜单项同组（文件="file" / 查看="view"）⇒ 序列化输出逐字节不变，只在新菜单里生效。
    ...(item.group ? { group: item.group } : {}),
    // 壳 MenuRenderer.getKeyLabel：showKeybindings + 无绑定 → 不显示
    ...(kb?.key ? { shortcut: formatKeyLabel(kb.key) } : {}),
    // E5.8#148：显隐勾选——resolveChecked 命中命令（主侧栏/面板）→ 序列化当前勾选态
    ...(checked !== undefined ? { checked } : {}),
    ...(children?.length ? { children } : {}),
  };
}

/**
 * E5.7#5：菜单栏数据序列化——壳 TitleBar 的 group 分组 / MenuRenderer getLabel 翻译
 * 搬入壳侧，池哑渲染（显示文本铁律）。
 * E5.8#55：去掉父项展平——无 command 父项（"文件"/"查看"→"外观"等嵌套子菜单）保留层级，
 * 顶部下拉换 ContextMenu 后出嵌套子菜单（对标 VS Code：查看→外观→活动栏位置）。
 */
/** 收集 MenuBar 插槽菜单并按 group 分组排序——titlebar/汉堡共用（E5.8#1c 去重） */
function collectMenuBarGroups(): { groups: Map<string, Array<MenuItem & { pluginId: string }>>; sortedGroupNames: string[] } {
  // E5.8#33→#148：合并「面板」槽位——壳招牌已删（面板入口迁入 查看→界面 子菜单），
  // 插件 group:"panel" 条目（menuBar/panel 槽均可）仍归并进"panel"组（无招牌时独立成组）
  const allItems = [...getMenuItems(MENU_SLOTS.Panel), ...getMenuItems(MENU_SLOTS.MenuBar)];
  const groups = new Map<string, Array<MenuItem & { pluginId: string }>>();
  for (const item of allItems) {
    const group = item.group ?? "other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }
  const sortedGroupNames = [...groups.keys()].sort(
    (a, b) => (groups.get(a)![0]?.order ?? 99) - (groups.get(b)![0]?.order ?? 99)
  );
  return { groups, sortedGroupNames };
}

/** E5.8#33：组标签 = 壳招牌父项（command 空 + label）——插件 group:"panel" 项先入组时不抢标签 */
function resolveGroupLabel(
  groupItems: Array<MenuItem & { pluginId: string }>,
  groupName: string
): string {
  return groupItems.find((i) => i.command === "" && i.label)?.label ?? groupItems[0]?.label ?? groupName;
}

export function buildTitleBarMenuGroups(t: (key: string) => string, vis: ZoneVisibility): PoolMenuGroup[] {
  const { groups, sortedGroupNames } = collectMenuBarGroups();
  // E5.8#55-C：顶部菜单栏无快捷键显示（壳原语义）——ctx 不传 keybindings
  // E5.8#148：resolveChecked 绑定 zone 可见性——查看→界面→主侧栏/面板 勾选态
  const ctx: ResolveItemCtx = { t, resolveChecked: (cmd) => resolveVisibilityChecked(cmd, vis) };
  // E5.8#55：展平组标签容器（label = 组标签——点组按钮直接平铺命令，VS Code 顶部行为）；
  // 保留嵌套子菜单（label ≠ 组标签的无 command 父项，如「外观」→「活动栏位置」）——
  // 顶部下拉换 ContextMenu 后出嵌套子菜单（对标 VS Code：查看→外观→活动栏位置）。
  // label/when/children 解析统一走 resolveItemNode（C 修复——单处写）。
  const flattenGroupItems = (items: Array<MenuItem & { pluginId: string }>, groupLabel: string): PoolMenuItem[] => {
    const result: PoolMenuItem[] = [];
    for (const item of items) {
      if (!whenMatch(item)) continue;
      if (item.children?.length) {
        if (!item.command && item.label === groupLabel) {
          // 组标签容器——展平为其 children（顶部点「文件」直接见命令，不出现「文件→」两段式）
          for (const child of item.children) {
            const node = resolveItemNode(child, ctx);
            if (node) result.push(node);
          }
        } else {
          // 命令 + children 父项（保留子面板）/ 嵌套子菜单父项（label ≠ 组标签，保留层级）
          const node = resolveItemNode(item, ctx);
          if (node) result.push(node);
        }
      } else if (item.command) {
        const node = resolveItemNode(item, ctx);
        if (node) result.push(node);
      }
    }
    return result;
  };

  return sortedGroupNames.map((groupName) => {
    const groupItems = groups.get(groupName)!;
    const groupLabel = resolveGroupLabel(groupItems, groupName);
    return {
      group: groupName,
      label: t(groupLabel),
      items: flattenGroupItems(groupItems, groupLabel),
    };
  });
}

/**
 * E5.7#6：☰ 汉堡菜单序列化——壳 HamburgerMenu 的 MenuRenderer 语义照搬：
 * showGroups（组标题）+ showKeybindings（快捷键）+ checkWhen（when 灰显）。
 * 与 titlebar 关键差异：**不展平**——无 command 父项（"文件"/"查看"）保留为
 * 带 children 的父项，hover 弹出子面板（壳 titlebar 下拉则展平为平铺列表）。
 */
export function buildHamburgerMenuGroups(t: (key: string) => string, vis: ZoneVisibility): PoolMenuGroup[] {
  const { groups, sortedGroupNames } = collectMenuBarGroups();
  // E5.8#55-C：汉堡 showKeybindings=true——ctx 传 keybindings（一次性拉取，复用原 allKeybindings 语义）
  // E5.8#148：resolveChecked 绑定 zone 可见性——查看→界面→主侧栏/面板 勾选态
  const ctx: ResolveItemCtx = { t, keybindings: getKeybindings(), resolveChecked: (cmd) => resolveVisibilityChecked(cmd, vis) };

  // E5.8#37.6：when 不满足 → 隐藏（原灰显——对换菜单当开关，至多一项显示；壳 MenuRenderer 语义 = 过滤）。
  // disabled 字段随此次移除（PoolMenuItem/MenuItemList/CSS 同步删——无生产者即成死代码）
  return sortedGroupNames.map((groupName) => {
    const groupItems = groups.get(groupName)!;
    return {
      group: groupName,
      label: t(resolveGroupLabel(groupItems, groupName)),
      items: groupItems.map((item) => resolveItemNode(item, ctx)).filter((x): x is PoolMenuItem => x !== null),
    };
  });
}

/** E5.7#5：标题栏槽位按钮序列化——when 过滤在壳（ContextKeyService），池不评估表达式 */
export function buildTitleBarSlots(slot: "left" | "right"): TitleBarSlotButton[] {
  return getTitleBarContributions(slot)
    .filter((item) => !item.when || ContextKeyService.matches(item.when))
    .map((item) => ({ command: item.command, icon: item.icon, title: item.command }));
}
