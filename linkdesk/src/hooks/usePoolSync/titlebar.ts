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

/**
 * E5.7#5：菜单栏数据序列化——壳 TitleBar 的 group 分组 / flattenGroupItems 展平 /
 * MenuRenderer getLabel 翻译三合一搬入壳侧，池哑渲染（显示文本铁律）。
 * 无 command 父项展平为其 children；command+children 父项保留 children（池子面板）。
 */
export function buildTitleBarMenuGroups(t: (key: string) => string): PoolMenuGroup[] {
  const allItems = getMenuItems(MENU_SLOTS.MenuBar);
  const groups = new Map<string, Array<MenuItem & { pluginId: string }>>();
  for (const item of allItems) {
    const group = item.group ?? "other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }
  const sortedGroupNames = [...groups.keys()].sort(
    (a, b) => (groups.get(a)![0]?.order ?? 99) - (groups.get(b)![0]?.order ?? 99)
  );

  // label 解析与壳 MenuRenderer 一致：item.label > command.title > command id，再 t()
  const resolveItem = (item: MenuItem): PoolMenuItem => ({
    label: item.label ? t(item.label) : item.command ? t(getCommand(item.command)?.title ?? item.command) : "",
    command: item.command,
    ...(item.children?.length ? { children: item.children.map(resolveItem) } : {}),
  });
  const flattenGroupItems = (items: Array<MenuItem & { pluginId: string }>): PoolMenuItem[] => {
    const result: PoolMenuItem[] = [];
    for (const item of items) {
      if (item.children?.length) {
        if (!item.command) {
          for (const child of item.children) result.push(resolveItem(child));
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
      label: t(groupItems[0]?.label ?? groupName),
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
  const allItems = getMenuItems(MENU_SLOTS.MenuBar);
  const allKeybindings = getKeybindings();
  const groups = new Map<string, Array<MenuItem & { pluginId: string }>>();
  for (const item of allItems) {
    const group = item.group ?? "other";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(item);
  }
  const sortedGroupNames = [...groups.keys()].sort(
    (a, b) => (groups.get(a)![0]?.order ?? 99) - (groups.get(b)![0]?.order ?? 99)
  );

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

  const resolveItem = (item: MenuItem): PoolMenuItem => {
    const kb = allKeybindings.find((k) => k.command === item.command);
    return {
      label: item.label ? t(item.label) : item.command ? t(getCommand(item.command)?.title ?? item.command) : "",
      command: item.command,
      // 壳 MenuRenderer.getKeyLabel：showKeybindings + 无绑定 → 不显示
      ...(kb?.key ? { shortcut: formatKeyLabel(kb.key) } : {}),
      // 壳 MenuRenderer.isDisabled：checkWhen + when 不满足 → 灰显（when 缺省 = 匹配）
      ...(!ContextKeyService.matches(item.when) ? { disabled: true } : {}),
      ...(item.children?.length ? { children: item.children.map(resolveItem) } : {}),
    };
  };

  return sortedGroupNames.map((groupName) => {
    const groupItems = groups.get(groupName)!;
    return {
      group: groupName,
      label: t(groupItems[0]?.label ?? groupName),
      items: groupItems.map(resolveItem),
    };
  });
}

/** E5.7#5：标题栏槽位按钮序列化——when 过滤在壳（ContextKeyService），池不评估表达式 */
export function buildTitleBarSlots(slot: "left" | "right"): TitleBarSlotButton[] {
  return getTitleBarContributions(slot)
    .filter((item) => !item.when || ContextKeyService.matches(item.when))
    .map((item) => ({ command: item.command, icon: item.icon, title: item.command }));
}
