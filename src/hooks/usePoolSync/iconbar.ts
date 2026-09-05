/**
 * usePoolSync 图标栏序列化——buildIconBar。E5.8#0d.10-5a：自 usePoolSync.ts 拆出——纯函数：
 * 图标栏 DTO（iconOrder 优先 + 剩余按注册序 + 汉堡内嵌）。零 hook 依赖。
 * 依赖方向：iconbar → viewRegistry/PluginState + titlebar（汉堡）；无反向。
 * E6#54b：resolvePluginIcon 已随 @linkdesk/ui 迁至 components/shared/plugin-icon/iconUtils（纯函数，壳/包同源）。
 */

import type { IconBarLayout, IconBarItem } from "../../core/types/pool/poolLayout";
import { getViewPlugins, getViewPlugin, getIconLocation } from "../../pluginLoader/contributions/viewRegistry";
import { getConfigurationValue } from "../../core/services/configuration/ConfigurationService"; // E5.7#1：titleBar.menuBarVisible
import { resolvePluginIcon } from "../../components/shared/plugin-icon/iconUtils";
import { getPluginStateValue, APP_PLUGIN_ID } from "../../core/services/plugins/PluginStateService"; // E5.7#6：图标顺序（iconOrder）
import { factorySlots } from "../../core/services/bootstrap/FactorySlots"; // E5.8#41.11：槽位感知——每 factoryRole 只渲染激活套图标
import { MENU_STYLE_HAMBURGER_VISIBLE, buildHamburgerMenuGroups } from "./titlebar";

/** E5.7#6：图标栏序列化——壳 IconBar 的 ordered 计算照搬（iconOrder 优先 + 剩余按注册序）。
 *  无 iconBar 声明的插件不出现在图标栏（壳 topIcons/bottomIcons filter 同款）。
 *  E5.8#148：panelVisible 透传给汉堡（查看→界面→面板 勾选态序列化）。 */
export function buildIconBar(t: (key: string) => string, sidebarView: string | null, isSidebarVisible: boolean, panelVisible: boolean): IconBarLayout {
  const plugins = getViewPlugins();
  let order: string[] = [];
  try {
    order = getPluginStateValue<string[]>(APP_PLUGIN_ID, "iconOrder") ?? [];
  } catch { order = []; }

  const remaining = new Set(plugins.map((p) => p.pluginId));
  const ordered: typeof plugins = [];
  for (const id of order) {
    if (remaining.has(id)) {
      remaining.delete(id);
      const p = plugins.find((v) => v.pluginId === id);
      if (p) ordered.push(p);
    }
  }
  for (const id of remaining) {
    const p = plugins.find((v) => v.pluginId === id);
    if (p) ordered.push(p);
  }

  // E5.8#41.11 槽位感知（#41.10 ⑧-2 形态二图标替换）：声明 factoryRole 者 = 形态二进槽——
  // 每角色只渲染激活套图标（非激活套隐藏 = 「把原来的剔除换成作者自己的」）；未声明 = 形态一并存照旧全出。
  // E5.8#41.12 🪡 概念生效接缝：getDefaultPluginId（默认=内置）→ getActive（读持久化激活套——
  // 用户切到第三方设置套，图标栏跟着换成第三方图标，与 openSettings 路由一致）。
  const slotActive = ordered.filter((p) => {
    const role = p.manifest.factoryRole;
    return !role || factorySlots.getActive(role) === p.pluginId;
  });

  const icons: IconBarItem[] = [];
  for (const p of slotActive) {
    const location = getIconLocation(p.pluginId);
    if (!location) continue; // 无 iconBar 声明——不渲染（壳 topIcons/bottomIcons filter 同款）
    const resolved = resolvePluginIcon(p.pluginId, p.manifest);
    icons.push({
      pluginId: p.pluginId,
      icon: resolved.lucide
        ? { kind: "lucide", name: resolved.lucide }
        : resolved.codicon
          ? { kind: "codicon", name: resolved.codicon }
          : resolved.src
            ? { kind: "img", src: resolved.src }
            : { kind: "emoji", text: resolved.emoji ?? "📄" },
      label: t(p.manifest.name),
      location,
    });
  }

  // 壳 isActive 同款双重守卫：侧栏展开 + 有活动容器 + 容器属于该插件
  let activePluginId: string | undefined;
  if (isSidebarVisible && sidebarView) {
    activePluginId = icons.find((i) => {
      const plugin = getViewPlugin(i.pluginId);
      const containers = plugin?.manifest.contributes?.viewsContainers as Record<string, unknown> | undefined;
      return !!containers && Object.keys(containers).some((id) => id === sidebarView);
    })?.pluginId;
  }

  const menuStyle = getConfigurationValue<string>("app.menuStyle") ?? "titlebar";
  const hamburgerVisible = MENU_STYLE_HAMBURGER_VISIBLE[menuStyle] ?? false;

  return {
    icons,
    ...(activePluginId ? { activePluginId } : {}),
    hamburgerVisible,
    navLabel: t("导航"),
    ...(hamburgerVisible
      ? { hamburger: { title: t("菜单"), groups: buildHamburgerMenuGroups(t, { panelVisible, sidebarVisible: isSidebarVisible }) } }
      : {}),
  };
}
