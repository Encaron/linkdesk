/**
 * SidebarTabSync——侧栏↔标签页三向同步归一化。
 *
 * 🔥 E3a #29a：单一真相源。E5#68d：参数泛化——接受任何有 create 方法的对象。
 *
 * 对标 VS Code：EditorService.openEditor() 是单一入口。
 *
 * @param tabs 有 create(type, opts) 方法的对象（linkdesk.tabs 或旧 TabActions）
 * @param sourceId   插件数据的唯一标识
 * @param pluginId   插件 ID
 * @param opts       创建标签页时的选项
 */
export function activateSidebarItem(
  tabs: { create: (type: string, opts?: Record<string, unknown>) => unknown },
  sourceId: string,
  pluginId: string,
  opts?: { label?: string; pinned?: boolean },
): unknown {
  return tabs.create(pluginId, { sourceId, ...opts });
}
