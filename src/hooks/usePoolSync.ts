/**
 * usePoolSync——E5.6#9a。
 *
 * 替代 useWebViewSync。壳侧任何状态变化 → 全量推送 PoolLayout 到唯一 Pool。
 * Pool 被动渲染——不知道"世界为什么长这样"，只接收布局快照。
 *
 * 缓冲回放模式（E5.6#8b）保证 pushLayout 在池 React mount 之前到达不丢失。
 */

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TabState } from "./useTabManager";
import type { PoolLayout, SidebarLayout, SidebarViewMeta, PoolGroup, PoolMenuGroup, PoolMenuItem, TitleBarSlotButton, IconBarItem, IconBarLayout } from "../core/types/poolLayout";
import { ViewContainerService } from "../core/services/ViewContainerService";
import { layoutEngine } from "../core/services/LayoutEngine"; // E5.6#11-fix7：池◀按钮→壳 setZoneWidth("sidebar", 28)
import { getConfigurationValue } from "../core/services/ConfigurationService"; // E5.7#1：titleBar.menuBarVisible
import { getAssetPath } from "../core/services/assetPath"; // E5.7#5：logoUrl——池不 import core，壳解析推送
import { getMenuItems, MenuId, getTitleBarContributions, type MenuItem } from "../core/registry/MenuRegistry"; // E5.7#5/#6：菜单栏序列化（titlebar + 汉堡）
import { getCommand } from "../core/registry/CommandRegistry"; // E5.7#5：菜单项 label 回退 command.title
import { getKeybindings } from "../core/registry/KeybindingRegistry"; // E5.7#6：汉堡菜单快捷键显示
import { ContextKeyService } from "../core/registry/ContextKeyService"; // E5.7#5：槽位按钮 when 过滤 + context 变化重推
import type { SplitNode } from "./splitTree"; // E5.6#16：从分屏树计算 flex 比例
// E5.6#16.5：填充 PoolTab 新字段——图标/固定/关闭行为/单例
import { getViewPlugin, getViewPlugins, getIconLocation, onDidRegister, onDidUnregister, getTabBehavior, getTabCreatableViews } from "../pluginLoader/viewRegistry";
import { resolvePluginIcon } from "../pluginLoader/iconUtils";
import { getPluginStateValue, APP_PLUGIN_ID } from "../core/services/PluginStateService"; // E5.7#6：图标顺序（iconOrder）
import { isShellRenderedTab } from "./tabIdentity";

/**
 * E5.6#11d：从 ViewContainerService 构建完整 SidebarViewMeta[]。
 * containerId → getViewContainer（title/mergeHeaderWhenSingle）+ getActiveViews → 每条序列化。
 * renderPath 从 loader.ts 设置的 _renderPath 读——池 PluginComponent 按此 key O(1) 查找组件。
 */
function buildSidebarViewMetas(containerId: string): SidebarViewMeta[] {
  const views = ViewContainerService.getActiveViews(containerId);
  return views.map((v) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const desc = v as any;
    return {
      id: v.id,
      title: v.title,
      pluginId: desc._pluginId ?? "",
      renderPath: desc._renderPath ?? "",
      role: v.role,
      order: v.order,
      collapsed: v.collapsed,
      badge: v.badge,
      titleDescription: v.titleDescription,
      titleTooltip: v.titleTooltip,
      singleViewPaneContainerTitle: v.singleViewPaneContainerTitle,
      minHeight: v.minHeight,
    };
  });
}

/**
 * E5.6#16：从 SplitNode 树计算每个 group 的 flex 比例。
 * 叶子节点：递归累乘父 branch 的 sizes 比例。
 * 单 group（root 为 leaf）：flex = 1。
 */
function computeGroupFlexes(root: SplitNode): Map<string, number> {
  if (root.type === "leaf") {
    return new Map([[root.groupId, 1]]);
  }
  const result = new Map<string, number>();
  function walk(node: SplitNode, parentFlex: number): void {
    if (node.type === "leaf") {
      result.set(node.groupId, parentFlex);
      return;
    }
    const total = node.sizes[0] + node.sizes[1];
    if (total <= 0) {
      // 防御：sizes 归零 → 均分
      walk(node.children[0], parentFlex / 2);
      walk(node.children[1], parentFlex / 2);
      return;
    }
    walk(node.children[0], parentFlex * (node.sizes[0] / total));
    walk(node.children[1], parentFlex * (node.sizes[1] / total));
  }
  walk(root, 1);
  return result;
}

/** E5.7#1：app.menuStyle 枚举 → 菜单栏可见——titleBar 布局（Phase 2 #5 TitleBarZone 消费） */
const MENU_STYLE_MENUBAR_VISIBLE: Record<string, boolean> = {
  titlebar: true,
  hamburger: false,
  both: true,
};

/** E5.7#6：app.menuStyle 枚举 → ☰ 汉堡可见——iconBar 布局（Phase 2 #6 IconBarZone 消费） */
const MENU_STYLE_HAMBURGER_VISIBLE: Record<string, boolean> = {
  titlebar: false,
  hamburger: true,
  both: true,
};

/**
 * E5.7#5：菜单栏数据序列化——壳 TitleBar 的 group 分组 / flattenGroupItems 展平 /
 * MenuRenderer getLabel 翻译三合一搬入壳侧，池哑渲染（显示文本铁律）。
 * 无 command 父项展平为其 children；command+children 父项保留 children（池子面板）。
 */
function buildTitleBarMenuGroups(t: (key: string) => string): PoolMenuGroup[] {
  const allItems = getMenuItems(MenuId.MenuBar);
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
function buildHamburgerMenuGroups(t: (key: string) => string): PoolMenuGroup[] {
  const allItems = getMenuItems(MenuId.MenuBar);
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

/** E5.7#6：图标栏序列化——壳 IconBar 的 ordered 计算照搬（iconOrder 优先 + 剩余按注册序）。
 *  无 iconBar 声明的插件不出现在图标栏（壳 topIcons/bottomIcons filter 同款）。 */
function buildIconBar(t: (key: string) => string, sidebarView: string | null, isSidebarVisible: boolean): IconBarLayout {
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

  const icons: IconBarItem[] = [];
  for (const p of ordered) {
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
      ? { hamburger: { title: t("菜单"), groups: buildHamburgerMenuGroups(t) } }
      : {}),
  };
}

/** E5.7#5：标题栏槽位按钮序列化——when 过滤在壳（ContextKeyService），池不评估表达式 */
function buildTitleBarSlots(slot: "left" | "right"): TitleBarSlotButton[] {
  return getTitleBarContributions(slot)
    .filter((item) => !item.when || ContextKeyService.matches(item.when))
    .map((item) => ({ command: item.command, icon: item.icon, title: item.command }));
}

export interface UsePoolSyncInput {
  tabState: TabState;
  /** 侧栏当前容器 ID——null = 无活动侧栏视图 */
  sidebarView: string | null;
  /** 侧栏是否展开（未折叠） */
  isSidebarVisible: boolean;
  /** 侧栏当前宽度（px） */
  sidebarWidth: number;
  /** E5.6#16.5：MainPool tab 操作回调——池→壳→useTabManager（含分屏比例更新） */
  onTabAction?: (action: any) => void;
}

/**
 * 构建 PoolLayout 并推送到唯一 Pool（E5.7#4 单 WCV 直推）。
 * 依赖 tabState / sidebarView / isSidebarVisible / sidebarWidth——任一变化触发全量推送。
 */
export function usePoolSync({ tabState, sidebarView, isSidebarVisible, sidebarWidth, onTabAction }: UsePoolSyncInput): void {
  // E5.7#5：菜单栏/槽位/窗口控件文案在壳解析——t() 变化（切语言）会触发下方 effect 重推
  const { t, i18n } = useTranslation();

  // 缓存 pool API 引用——window.linkdesk.pool 在 preload 阶段就绪，mount 后不会变
  const poolApiRef = useRef<any>(null);
  if (!poolApiRef.current) {
    poolApiRef.current = (window as any).linkdesk?.pool;
  }

  // E5.6#11-fix8：跟踪上次非空 sidebarView——图标栏点击坍塌时 emit null → sidebarView=null，
  // 但池仍需知道渲染哪个容器（collapsed 状态 ▶ 按钮需要 containerId 和 views）。
  // 宽≤48 时优先 collapsed 而非 hidden——确保图标点击和 ◀ 按钮两条坍塌路径行为一致。
  const lastSidebarViewRef = useRef<string | null>(null);

  // E5.6#11j fix：layoutVersion——ViewContainerService 写操作后触发重推。
  // reorderView/setVisible 会 fire onDidChangeActiveViews → bump version。
  // setCollapsed 不 fire 事件 → handler 内手动 bump。
  const [layoutVersion, setLayoutVersion] = useState(0);

  // 订阅 ViewContainerService.onDidChangeActiveViews——reorder/setVisible 后触发重推
  useEffect(() => {
    const sub = ViewContainerService.onDidChangeActiveViews.event(() => {
      setLayoutVersion((v) => v + 1);
    });
    return () => sub();
  }, []);

  // E5.7#5：context key 变化（槽位按钮 when / 菜单 when 语义）与语言切换（t() 文案）→ 重推布局。
  // 壳 TitleBar 用 onDidChangeContext 触发重渲染——池版等价物是 layoutVersion bump。
  useEffect(() => {
    const unsub = ContextKeyService.onDidChangeContext(() => {
      setLayoutVersion((v) => v + 1);
    });
    const onLangChanged = () => {
      setLayoutVersion((v) => v + 1);
    };
    i18n.on("languageChanged", onLangChanged);
    return () => {
      unsub();
      i18n.off("languageChanged", onLangChanged);
    };
  }, [i18n]);

  // E5.7#6：Phase 5h Step 1 同款——插件注册/注销时重推（安装插件后图标栏即时更新）
  useEffect(() => {
    const unsub1 = onDidRegister.event(() => setLayoutVersion((v) => v + 1));
    const unsub2 = onDidUnregister.event(() => setLayoutVersion((v) => v + 1));
    return () => { unsub1(); unsub2(); };
  }, []);

  // E5.6#11j：注册池→壳侧栏操作回调。池组件调用 pool.sidebarAction() →
  // 主进程转发 → 壳 preload → 此 handler → ViewContainerService 写方法。
  useEffect(() => {
    const poolApi = poolApiRef.current;
    if (!poolApi) return;
    const unsub = poolApi.onSidebarAction?.((action: any) => {
      switch (action?.action) {
        case "reorder":
          ViewContainerService.reorderView(action.containerId, action.viewId, action.newIndex);
          break;
        case "setCollapsed":
          ViewContainerService.setCollapsed(action.viewId, action.collapsed);
          setLayoutVersion((v) => v + 1);  // setCollapsed 不 fire 事件——手动触发重推
          break;
        case "setVisible":
          ViewContainerService.setVisible(action.containerId, action.viewId, action.visible);
          break;
        // E5.6#11-fix7：池◀/▶按钮→布局引擎→WebContentsView bounds→重推 layout
        case "toggleSidebarCollapse": {
          const zone = layoutEngine.getBounds("sidebar");
          if (zone) {
            const targetWidth = zone.width <= 48 ? 280 : 28;
            layoutEngine.setZoneWidth("sidebar", targetWidth);
          }
          break;
        }
        // E5.6#16.5：updateSplitSizes 已迁移到 pool.tabAction 通道——此处不再处理
      }
    });
    return unsub;
  }, []);

  // E5.6#16.5：注册池→壳主区 tab 操作回调。池组件调用 pool.tabAction() →
  // 主进程转发 → 壳 preload → 此 handler → useTabManager 方法（通过 onTabAction 回调）。
  useEffect(() => {
    const poolApi = poolApiRef.current;
    if (!poolApi || !onTabAction) return;
    const unsub = poolApi.onTabAction?.((action: any) => {
      onTabAction(action);
    });
    return unsub;
  }, [onTabAction]);

  // E5.6#11-fix：接收池侧 marketplace badge 更新事件→写入壳 ViewContainerService。
  // 池内 ViewContainerService 是空实例——marketplaceShared 的 updateAllBadges 改走 events.emit，
  // 壳监听到后写入壳 ViewContainerService → onDidChangeActiveViews 触发 layoutVersion bump → 重推布局。
  useEffect(() => {
    const unsub = (window as any).linkdesk?.events?.on("marketplace:updateBadge", (data: any) => {
      const existing = ViewContainerService.getView(data.viewId);
      if (!existing) return;
      // 防重推循环——badge 值未变则跳过
      if (existing.badge === data.count) return;
      ViewContainerService.registerView("marketplace", "marketplace", {
        id: data.viewId,
        title: existing.title,
        render: existing.render,
        badge: data.count,
      });
    });
    return () => { unsub?.(); };
  }, []);

  useEffect(() => {
    // E5.6#11-fix8：记住上次非空 sidebarView——图标栏坍塌时 emit null，但 collapsed ▶ 仍需知道容器
    if (sidebarView) {
      lastSidebarViewRef.current = sidebarView;
    }

    const poolApi = poolApiRef.current;
    if (!poolApi) return;

    // 侧栏布局——E5.6#11d：完整容器元数据 + SidebarViewMeta[]
    // E5.6#11-fix8：isSidebarVisible 只对壳 SidePanel DOM 有意义——池渲染不应依赖它。
    // 池只要知道是哪个容器（sidebarView 或 lastSidebarViewRef），就应该渲染侧栏。
    // 宽≤48 → collapsed（▶ 按钮），宽>48 → 展开。两条坍塌路径（图标点击/◀按钮）行为一致。
    const effectiveSidebarView = sidebarView || lastSidebarViewRef.current;
    let sidebar: SidebarLayout;
    if (effectiveSidebarView) {
      const container = ViewContainerService.getViewContainer(effectiveSidebarView);
      const views = buildSidebarViewMetas(effectiveSidebarView);
      const collapsedSet = ViewContainerService.loadCollapsedState();
      const isCollapsed = sidebarWidth <= 48;
      sidebar = {
        visible: true,
        width: sidebarWidth,
        containerId: effectiveSidebarView,
        containerTitle: container?.title ?? effectiveSidebarView,
        mergeHeaderWhenSingle: container?.mergeHeaderWhenSingle,
        views,
        collapsedViews: [...collapsedSet],
        collapsed: isCollapsed,
        viewId: views[0]?.pluginId ?? null,  // 向后兼容
      };
    } else {
      sidebar = {
        visible: false,
        width: sidebarWidth,
        containerId: null,
        containerTitle: "",
        views: [],
      };
    }

    // 主区分屏组——每个 group 映射为一个 flex 区域
    // E5.6#16：从 SplitNode 树计算实际 flex 比例（不再硬编码 1）
    const flexMap = computeGroupFlexes(tabState.root);
    const groups: PoolGroup[] = tabState.groups.map((g) => ({
      id: g.id,
      flex: flexMap.get(g.id) ?? 1,
      activeTabId: g.activeTabId,
      tabs: g.tabs.map((t) => {
        const pid = t.pluginId ?? t.type;
        const entry = getViewPlugin(pid);
        const resolved = entry?.manifest ? resolvePluginIcon(pid, entry.manifest) : null;
        const behavior = getTabBehavior(pid);
        return {
          id: t.id,
          pluginId: pid,
          title: t.label,
          sourceId: t.sourceId,
          dirty: t.dirty,
          // E5.6#16.5：TabBar 渲染元数据
          icon: resolved?.src ?? resolved?.emoji,
          pinned: t.pinned,
          // E5.6#16.7k-4：欢迎页 closeBehavior 从 blocked → normal——壳 reduceCloseTab 已有 fallback 自动重建
          closeBehavior: behavior.confirmOnClose ? "confirm" : "normal",
          singleton: behavior.singleton,
          shellRendered: isShellRenderedTab(t.type),
          shellType: isShellRenderedTab(t.type) ? t.type : undefined,
          detailPluginId: (t as any).detailPluginId,
        };
      }),
    }));

    // E5.7#1/#4：PoolLayout v2 全量布局——唯一 Pool 单 WCV 直推完整快照。
    // Phase 2 填充：titleBar 已由 #5 序列化；iconBar 已由 #6 序列化；statusBar（#8 StatusBarZone）待对应任务。
    const fullLayout: PoolLayout = {
      version: 2,
      titleBar: {
        title: document.title,
        // 壳 getAssetPath 解析——Path B：池不 import core，logo 以同源相对 URL 推送
        logoUrl: getAssetPath("assets/logo.svg"),
        menuBarVisible: MENU_STYLE_MENUBAR_VISIBLE[getConfigurationValue<string>("app.menuStyle") ?? "titlebar"] ?? true,
        menuGroups: buildTitleBarMenuGroups(t),
        slots: { left: buildTitleBarSlots("left"), right: buildTitleBarSlots("right") },
        windowControls: { minimize: t("最小化"), maximize: t("最大化"), restore: t("还原"), close: t("关闭") },
      },
      iconBar: buildIconBar(t, sidebarView, isSidebarVisible),
      sidebar,
      groups,
      root: tabState.root,
      // E5.6#16.7k-3：推 creatableViews——GroupTabBar [+] 按钮动态创建菜单
      creatableViews: getTabCreatableViews().map((e) => ({ pluginId: e.pluginId, label: e.manifest.name })),
      statusBar: { items: [] },
    };

    poolApi.pushLayout(fullLayout);
  }, [tabState, sidebarView, isSidebarVisible, sidebarWidth, layoutVersion, t]);
}
