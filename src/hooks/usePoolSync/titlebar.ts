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

/**
 * E5.7#5：菜单栏数据序列化——壳 TitleBar 的 group 分组 / flattenGroupItems 展平 /
 * MenuRenderer getLabel 翻译三合一搬入壳侧，池哑渲染（显示文本铁律）。
 * 无 command 父项展平为其 children；command+children 父项保留 children（池子面板）。
 */
/** 收集 MenuBar 插槽菜单并按 group 分组排序——titlebar/汉堡共用（E5.8#1c 去重） */
function collectMenuBarGroups(): { groups: Map<string, Array<MenuItem & { pluginId: string }>>; sortedGroupNames: string[] } {
  // E5.8#33：合并「面板」槽位（壳招牌）——槽位在前：招牌项先入组（菜单首位）+ 组序排文件/查看后（order 100）
  // 插件 group:"panel" 条目（menuBar/panel 槽均可）与招牌同组自动归并
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

export function buildTitleBarMenuGroups(t: (key: string) => string): PoolMenuGroup[] {
  const { groups, sortedGroupNames } = collectMenuBarGroups();

  // label 解析与壳 MenuRenderer 一致：item.label > command.title > command id，再 t()
  // E5.8#37.6：when 过滤——不匹配的菜单项隐藏（顶层 flatten 与嵌套 children 双处）
  const resolveItem = (item: MenuItem): PoolMenuItem => {
    const children = item.children?.filter(whenMatch).map(resolveItem);
    return {
      label: item.label ? t(item.label) : item.command ? t(getCommand(item.command)?.title ?? item.command) : "",
      command: item.command,
      ...(children?.length ? { children } : {}),
    };
  };
  const flattenGroupItems = (items: Array<MenuItem & { pluginId: string }>): PoolMenuItem[] => {
    const result: PoolMenuItem[] = [];
    for (const item of items) {
      if (!whenMatch(item)) continue;
      if (item.children?.length) {
        if (!item.command) {
          for (const child of item.children) {
            if (whenMatch(child)) result.push(resolveItem(child));
          }
        } else {
          result.push(resolveItem(item));
        }
      } else if (item.command) {
        result.push(resolveItem(item));
      }
    }
    return result;
  };

  return sortedGroupNames.map((groupName) => {
    const groupItems = groups.get(groupName)!;
    return {
      group: groupName,
      label: t(resolveGroupLabel(groupItems, groupName)),
      items: flattenGroupItems(groupItems),
    };
  });
}

/**
 * E5.7#6：☰ 汉堡菜单序列化——壳 HamburgerMenu 的 MenuRenderer 语义照搬：
 * showGroups（组标题）+ showKeybindings（快捷键）+ checkWhen（when 灰显）。
 * 与 titlebar 关键差异：**不展平**——无 command 父项（"文件"/"查看"）保留为
 * 带 children 的父项，hover 弹出子面板（壳 titlebar 下拉则展平为平铺列表）。
 */
export function buildHamburgerMenuGroups(t: (key: string) => string): PoolMenuGroup[] {
  const { groups, sortedGroupNames } = collectMenuBarGroups();
  const allKeybindings = getKeybindings();

  /** 壳 MenuRenderer.formatKeyLabel 同款——chord: "ctrl+k ctrl+t" → "Ctrl+K Ctrl+T" */
  const formatKeyLabel = (key: string): string =>
    key
      .split(" ")
      .map((chord) =>
        chord
          .replace(/ctrl\+/i, "Ctrl+")
          .replace(/alt\+/i, "Alt+")
          .replace(/shift\+/i, "Shift+")
          .replace(/\+\w/g, (m) => m.toUpperCase())
      )
      .join(" ");

  // E5.8#37.6：when 不满足 → 隐藏（原灰显——对换菜单当开关，至多一项显示；壳 MenuRenderer 语义 = 过滤）。
  // disabled 字段随此次移除（PoolMenuItem/MenuItemList/CSS 同步删——无生产者即成死代码）
  const resolveItem = (item: MenuItem): PoolMenuItem | null => {
    if (!whenMatch(item)) return null;
    const kb = allKeybindings.find((k) => k.command === item.command);
    const children = item.children?.map(resolveItem).filter((c): c is PoolMenuItem => c !== null);
    return {
      label: item.label ? t(item.label) : item.command ? t(getCommand(item.command)?.title ?? item.command) : "",
      command: item.command,
      // 壳 MenuRenderer.getKeyLabel：showKeybindings + 无绑定 → 不显示
      ...(kb?.key ? { shortcut: formatKeyLabel(kb.key) } : {}),
      ...(children?.length ? { children } : {}),
    };
  };

  return sortedGroupNames.map((groupName) => {
    const groupItems = groups.get(groupName)!;
    return {
      group: groupName,
      label: t(resolveGroupLabel(groupItems, groupName)),
      items: groupItems.map(resolveItem).filter((x): x is PoolMenuItem => x !== null),
    };
  });
}

/** E5.7#5：标题栏槽位按钮序列化——when 过滤在壳（ContextKeyService），池不评估表达式 */
export function buildTitleBarSlots(slot: "left" | "right"): TitleBarSlotButton[] {
  return getTitleBarContributions(slot)
    .filter((item) => !item.when || ContextKeyService.matches(item.when))
    .map((item) => ({ command: item.command, icon: item.icon, title: item.command }));
}
