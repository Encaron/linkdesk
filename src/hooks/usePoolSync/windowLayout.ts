/**
 * 壳按窗口组装 PoolLayout——E5.8#43-2。纯函数（零 React），usePoolSync 主推送 effect 消费。
 *
 * 窗口模式策略表（src/App/windows.ts）zones/tabBarCreate 声明驱动每窗推哪些 zone——
 * 新增窗口类型 = 策略表加一行，布局组装零改（#43 架构内核「改一处不全身」）。
 *
 * 脱出窗 = PoolLayout 子集：只推 titleBar+groups（#43-2 B1b iconBar/sidebar/statusBar 可选化
 * 后池按字段条件渲染，无空列/空条）；titleBar.title = 活动 tab 标题（窗口标题随活动 tab）；
 * creatableViews 推空数组（I9-6 [+] 不提供创建菜单）。
 *
 * 依赖方向：windowLayout → App/windows（策略表）+ pluginLoader/viewRegistry + core/utils（icon/tabIdentity）。
 */

import type { TFunction } from "i18next";
import type { TabState } from "../useTabManager";
import type {
  PoolLayout,
  PoolGroup,
  SidebarLayout,
  IconBarLayout,
  StatusBarLayout,
  TitleBarLayout,
  CreatableViewMeta,
} from "../../core/types/pool/poolLayout";
import type { WindowShellState, PoolZone } from "../../App/windows";
import { WINDOW_MODE_STRATEGIES } from "../../App/windows";
import { getViewPlugin, getTabBehavior } from "../../pluginLoader/contributions/viewRegistry";
import { resolvePluginIcon } from "../../core/utils/plugin/iconUtils";
import { isShellRenderedTab, resolvePoolTabTitle } from "../../core/utils/tabIdentity";
import { computeGroupFlexes } from "./sidebar-panel"; // E5.6#16：SplitNode 树 → group flex 比例

/** 主窗 zone 数据包——usePoolSync 一次性组装（侧栏/面板/图标栏/状态栏全是壳主窗状态），
 *  assembleWindowLayout 按策略 zones 决定每窗取哪些。脱出窗只消费 titleBarBase/groups 侧 */
export interface WindowLayoutContext {
  /** 标题栏（除 title 外）——title 每窗随活动 tab 计算 */
  titleBarBase: Omit<TitleBarLayout, "title">;
  iconBar: IconBarLayout;
  sidebar: SidebarLayout;
  rightSidebar: PoolLayout["rightSidebar"];
  panel: PoolLayout["panel"];
  statusBar: StatusBarLayout;
  /** E5.8#45：面板已脱出到漂移窗（windows 存在 mode:"drift"）——main 停推 panel（面板独占性：
   *  面板恒只在一个窗口渲染；漂移窗按 zones 推 panel，main 按本标记抑制） */
  panelDetached: boolean;
  /** 可创建视图列表——main 消费（detached 按 tabBarCreate 抑制） */
  creatableViews: CreatableViewMeta[];
  t: TFunction;
}

/** 窗口标题随活动 tab——该窗活动组的活动 tab 标题（无活动 tab 兜底应用名）。窗口标题（#43-2） */
export function windowTitleFor(win: WindowShellState, t: TFunction): string {
  const activeGroup = win.tabState.groups.find((g) => g.id === win.tabState.activeGroupId) ?? win.tabState.groups[0];
  const activeTab = activeGroup?.tabs.find((tab) => tab.id === activeGroup.activeTabId) ?? activeGroup?.tabs[0];
  if (activeTab) {
    const pid = activeTab.pluginId ?? activeTab.type;
    const entry = getViewPlugin(pid);
    return resolvePoolTabTitle(activeTab.label, entry?.manifest.name, t);
  }
  return t("LinkDesk");
}

/** 序列化某窗口的 tabState → PoolGroup[]——flex 树 + 标签元数据（图标/tabBehavior/壳内部视图标记） */
export function serializeGroups(tabState: TabState, t: TFunction): PoolGroup[] {
  const flexMap = computeGroupFlexes(tabState.root);
  return tabState.groups.map((g) => ({
    id: g.id,
    flex: flexMap.get(g.id) ?? 1,
    activeTabId: g.activeTabId,
    tabs: g.tabs.map((tab) => {
      const pid = tab.pluginId ?? tab.type;
      const entry = getViewPlugin(pid);
      const resolved = entry?.manifest ? resolvePluginIcon(pid, entry.manifest) : null;
      const behavior = getTabBehavior(pid);
      return {
        id: tab.id,
        pluginId: pid,
        // 标签栏 title 推流时二次解析——getDefaultLabel 已 t()，此处兜底语言切换/恢复的旧语言快照
        title: resolvePoolTabTitle(tab.label, entry?.manifest.name, t),
        sourceId: tab.sourceId,
        dirty: tab.dirty,
        icon: resolved?.src ?? resolved?.emoji,
        pinned: tab.pinned,
        closeBehavior: behavior.confirmOnClose ? "confirm" : "normal",
        singleton: behavior.singleton,
        shellRendered: isShellRenderedTab(tab.type),
        shellType: isShellRenderedTab(tab.type) ? tab.type : undefined,
        detailPluginId: tab.detailPluginId,
      };
    }),
  }));
}

/** 按窗口模式策略组装该窗布局——zones 决定推哪些 zone，tabBarCreate 决定 [+] 供给（I9-6） */
export function assembleWindowLayout(win: WindowShellState, ctx: WindowLayoutContext): PoolLayout {
  const strategy = WINDOW_MODE_STRATEGIES[win.mode];
  const include = (zone: PoolZone): boolean => strategy.zones.includes(zone);
  return {
    version: 2,
    // titleBar 恒推（窗口 chrome——池恒渲染）；title 每窗随活动 tab。
    // 菜单栏按模式策略（拍板 7——02 §6）：main 随全局菜单样式配置照推；detached/drift 纯工作区
    // 窗口无菜单栏——menuBarVisible 恒 false + 菜单组不推（标题栏 logo/拖拽区/窗口控制照常）
    titleBar: {
      ...ctx.titleBarBase,
      title: windowTitleFor(win, ctx.t),
      menuBarVisible: strategy.titleBarMenu && ctx.titleBarBase.menuBarVisible,
      menuGroups: strategy.titleBarMenu ? ctx.titleBarBase.menuGroups : [],
    },
    iconBar: include("iconBar") ? ctx.iconBar : undefined,
    sidebar: include("sidebar") ? ctx.sidebar : undefined,
    rightSidebar: include("rightSidebar") ? ctx.rightSidebar : undefined,
    groups: serializeGroups(win.tabState, ctx.t),
    root: win.tabState.root,
    activeGroupId: win.tabState.activeGroupId,
    // 空数组 = [+] 按钮无创建菜单（池 GroupTabBar 空列表不弹菜单）
    creatableViews: strategy.tabBarCreate === "provided" ? ctx.creatableViews : [],
    // E5.8#45 面板独占性：策略 zones 含 panel 时，main 遇 ctx.panelDetached 停推（面板已移漂移窗）；
    // 漂移窗恒推 panel（I9-13——漂移窗 = 面板专用窗）
    panel: include("panel") && !(win.mode === "main" && ctx.panelDetached) ? ctx.panel : undefined,
    statusBar: include("statusBar") ? ctx.statusBar : undefined,
  };
}
