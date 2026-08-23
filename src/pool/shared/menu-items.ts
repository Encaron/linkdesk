/**
 * 菜单 DTO 适配——池布局快照（PoolMenuItem/PoolMenuGroup）→ ContextMenu 契约（MenuItemDescriptor）。
 * E5.8#55：顶部菜单栏 + 汉堡下拉统一换 ContextMenu 渲染器（右键菜单同源），
 * MenuItemList 删除——布局序列化通路不变（壳侧 buildTitleBarMenuGroups/buildHamburgerMenuGroups
 * 仍产出 PoolMenuGroup[] 推送），池侧此文件做最后一跳转换喂给 ContextMenu。
 *
 * 显示文本铁律：label/shortcut 壳侧已 t()/formatKeyLabel 解析推送（池哑渲染），
 * 此处仅结构转换不翻译。命令执行同链路：executePoolCommand(command)
 * = ContextMenu handleItemClick 的 window.linkdesk.commands.executeCommand(id, ...)，零影响。
 *
 * 依赖方向：pool/shared → core/types（DTO）+ core/api（契约类型）。零 @src/core 实现。
 */
import type { MenuItemDescriptor } from "@src/core/api/linkdesk-api";
import type { PoolMenuItem, PoolMenuGroup } from "../../core/types/pool/poolLayout";

/** 单个 PoolMenuItem → MenuItemDescriptor——children 递归（嵌套子菜单透传） */
function toDescriptor(item: PoolMenuItem): MenuItemDescriptor {
  return {
    command: item.command,
    label: item.label,
    ...(item.shortcut ? { shortcut: item.shortcut } : {}),
    ...(item.children?.length ? { children: item.children.map(toDescriptor) } : {}),
  };
}

/** titlebar 单组下拉：PoolMenuItem[] → MenuItemDescriptor[]（单组无 divider 需求，不标 group） */
export function poolMenuToDescriptors(items: PoolMenuItem[]): MenuItemDescriptor[] {
  return items.map(toDescriptor);
}

/** hamburger 多组下拉：PoolMenuGroup[] → MenuItemDescriptor[]——展平各组 items + 标 group
 *  （ContextMenu 按 group 字段分组 + divider 分隔线，替代原 MenuItemList 的组标题区块） */
export function poolGroupsToDescriptors(groups: PoolMenuGroup[]): MenuItemDescriptor[] {
  return groups.flatMap((g) => g.items.map((it) => ({ ...toDescriptor(it), group: g.group })));
}
