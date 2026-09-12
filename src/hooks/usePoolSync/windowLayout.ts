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
  IconBarIcon,
  PoolReleaseNotesData,
} from "../../core/types/pool/poolLayout";
import type { WindowShellState, PoolZone } from "../../App/windows";
import { WINDOW_MODE_STRATEGIES } from "../../App/windows";
import { getViewPlugin, getTabBehavior } from "../../pluginLoader/contributions/viewRegistry";
import { resolvePluginIcon, pickIdentityArt } from "../../components/shared/plugin-icon/iconUtils"; // E6#54b：随 @linkdesk/ui 迁至 shared（纯函数）；#69f：标签栏 Type-2 身份图裁决同源
import { resolvedToIconBarIcon } from "./resolvedIcon"; // E6#69f：ResolvedIcon→IconBarIcon 单源转换（iconbar/windowLayout 同消费）
import { FileIconResolver } from "../../components/shared/file-icon/FileIconResolver"; // E6#69g：文件图标共享解析器（file-tree 同源，禁插件内双源/禁跨插件 import）
import { IconRegistry } from "../../core/registry/appearance/IconRegistry"; // E6#69g：当前图标主题 mappings（app.iconTheme 变更 → layoutVersion 重算）
import { getConfigurationValue } from "../../core/services/configuration/ConfigurationService"; // E6#69g：同步读 app.iconTheme（iconbar 读 menuStyle 同款）
import { isShellRenderedTab, resolvePoolTabTitle, RELEASE_NOTES_TAB_TYPE } from "../../core/utils/tabIdentity";
import { factorySlots } from "../../core/services/bootstrap/FactorySlots"; // E6#30.10b：活跃 marketplace 插件定位（iconbar 同源导入路径）
import { ViewContainerService } from "../../core/services/layout/ViewContainerService"; // E6#30.10b：main 容器详情贡献寻址
import type { ViewDescriptor } from "../../core/services/layout/ViewContainerService/types"; // E6#30.10b：_pluginId/_renderPath 内部标记字段读型
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
  /**
   * E6#57.13：发行说明壳视图的载荷（**壳想、池画**——壳取好、池只画）。
   *
   * 一个窗口最多一个发行说明标签页（`tabBehavior.singleton` 语义，见 `SHELL_META`），
   * 所以载荷挂在 ctx 上、由 `serializeGroups` 盖章到**那一个** tab 上，而不是按 tab 存一份。
   * 池侧不在本窗有该 tab（或没打开）时载荷被忽略——不算错。
   */
  releaseNotes?: PoolReleaseNotesData;
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

/** E6#30.10b：活跃 marketplace 插件的主区详情贡献寻址——工厂槽活跃插件在容器 "main" 注册的
 *  view id "plugin-detail"（contributes.views.main[].render）。返回 { 贡献插件 id, renderPath }；
 *  市场插件禁用/卸载/未激活 → undefined = 壳保底 PluginDetailPoolView。零插件 id 硬编码（#10）——
 *  role "marketplace" + 容器 "main" + view id "plugin-detail" 是贡献面契约（10-市场UI拥有权.md §三·一），
 *  谁填充槽位谁就是贡献者。每次 pushLayout 现场解析——渲染期判定天然覆盖「删市场插件→保底」。 */
function resolveActiveMarketDetailContribution(): { contributorId: string; renderPath: string } | undefined {
  const marketId = factorySlots.getActive("marketplace");
  if (!marketId) return undefined;
  // 注册表内部标记字段（_pluginId/_renderPath 不在 ViewDescriptor 声明面）——显式联合类型读型，不用 any
  const registered = ViewContainerService.getViews("main") as Array<ViewDescriptor & { _pluginId?: string; _renderPath?: string }>;
  const view = registered.find((v) => v._pluginId === marketId && v.id === "plugin-detail");
  const renderPath = view?._renderPath;
  return renderPath ? { contributorId: marketId, renderPath } : undefined;
}

/** E6#69g：文件标签图标——tab.filePath 在（身份 = 文件路径的标签）→ 共享 FileIconResolver 出文件类型图标。
 *  与 file-tree 树行/搜索行同解析器同默认表同 theme mappings（同文件同图）。判定走数据字段 filePath
 *  （禁 pluginId 硬编码——任何以文件为标签的插件都吃此链，editor 只是首个消费方）。
 *  当前图标主题 = 同步读 app.iconTheme 配置（"default" → undefined → codicon 保底）；主题切换经
 *  useSubscriptions 的 app.iconTheme → layoutVersion bump 触发本函数重算。 */
function resolveFileTabIcon(filePath: string): IconBarIcon {
  const iconThemeId = getConfigurationValue<string>("app.iconTheme") ?? "default";
  const mappings = iconThemeId === "default" ? undefined : IconRegistry.getMappings(iconThemeId);
  const resolver = new FileIconResolver(mappings);
  // 路径 → 基名（兼容 / 与 \ 分隔）——解析器契约取文件名元数据（传路径会漏命中 ext/文件名表）
  const base = filePath.slice(Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\")) + 1);
  const desc = resolver.getFileIcon(base);
  return desc.kind === "image"
    ? { kind: "img", src: desc.url }
    : { kind: "codicon", name: desc.className, ...(desc.color ? { color: desc.color } : {}) };
}

/**
 * E6#57.13：发行说明标签页的标题——**在序列化时推导，不改 tab state**。
 *
 * mockup 03 的标签栏文字是「发行说明 v0.2.0 ✕」/ 无内容时「发行说明 ✕」——即**标题随态变**。
 * 备选做法（开 tab 时写进 `tab.label`）要在每次态变化时回来改标签页状态，多一条壳→tabState 写路径，
 * 且语言切换后还要再修一遍；序列化期推导则天然随 `t` 与态一起重算（本文件既有做法，
 * `resolvePoolTabTitle` 同理）。载荷缺席（没开该 tab / 尚未取到）→ `undefined` ⇒ 落回 `tab.label`
 * （= `getDefaultLabel` 给的 `t("发行说明")`），与 mockup 的无版本态一致。
 */
function releaseNotesTabTitle(data: PoolReleaseNotesData | undefined, t: TFunction): string | undefined {
  return data?.state === "content" ? t("发行说明 v{{version}}", { version: data.version }) : undefined;
}

/** 序列化某窗口的 tabState → PoolGroup[]——flex 树 + 标签元数据（图标/tabBehavior/壳内部视图标记） */
export function serializeGroups(tabState: TabState, t: TFunction, releaseNotes?: PoolReleaseNotesData): PoolGroup[] {
  const flexMap = computeGroupFlexes(tabState.root);
  // E6#30.10b：主区详情贡献一次解析、盖章所有 plugin-detail tab（同一窗口内活跃 marketplace 唯一）
  const detailContribution = resolveActiveMarketDetailContribution();
  return tabState.groups.map((g) => ({
    id: g.id,
    flex: flexMap.get(g.id) ?? 1,
    activeTabId: g.activeTabId,
    tabs: g.tabs.map((tab) => {
      const pid = tab.pluginId ?? tab.type;
      const entry = getViewPlugin(pid);
      const behavior = getTabBehavior(pid);
      const isDetailTab = tab.type === "plugin-detail";
      // E6#30.7b：plugin-detail 标签图标 = 活跃市场贡献插件图标（30.10b detailContribution 同源——
      //  详情页是市场表面，目标插件可能未装无图标可解析，市场图标恒可辨）。普通标签 = 自身插件图标。
      const iconPid = isDetailTab && detailContribution ? detailContribution.contributorId : pid;
      const iconEntry = iconPid === pid ? entry : getViewPlugin(iconPid);
      // E6#69f/#69g：标签图标判别联合——
      //  文件标签（tab.filePath 数据字段在，身份=文件路径）→ 文件类型图标（resolveFileTabIcon，与 file-tree 同图）；
      //  普通视图标签 → Type-2 身份图 pickIdentityArt(marketIcon ?? icon ?? 默认彩色块)（#69f：图标栏 Type-1
      //  不进标签栏；图标栏 4 只插件的 marketIcon = Type-2，其视图标签显彩色身份图）；
      //  无 manifest（未注册/壳内部欢迎等非插件视图）→ undefined（保持旧行为：无图标标签）。
      const icon = tab.filePath
        ? resolveFileTabIcon(tab.filePath)
        : iconEntry?.manifest
          ? resolvedToIconBarIcon(resolvePluginIcon(iconPid, pickIdentityArt(iconEntry.manifest)))
          : undefined;
      const isReleaseNotesTab = tab.type === RELEASE_NOTES_TAB_TYPE;
      return {
        id: tab.id,
        pluginId: pid,
        // 标签栏 title 推流时二次解析——getDefaultLabel 已 t()，此处兜底语言切换/恢复的旧语言快照
        // E6#57.13：发行说明标签例外——标题随态（content 时带版本号），见 releaseNotesTabTitle
        title: (isReleaseNotesTab ? releaseNotesTabTitle(releaseNotes, t) : undefined)
          ?? resolvePoolTabTitle(tab.label, entry?.manifest.name, t),
        sourceId: tab.sourceId,
        dirty: tab.dirty,
        icon,
        pinned: tab.pinned,
        closeBehavior: behavior.confirmOnClose ? "confirm" : "normal",
        singleton: behavior.singleton,
        shellRendered: isShellRenderedTab(tab.type),
        shellType: isShellRenderedTab(tab.type) ? tab.type : undefined,
        detailPluginId: tab.detailPluginId,
        detailContributorId: isDetailTab ? detailContribution?.contributorId : undefined,
        detailViewRenderPath: isDetailTab ? detailContribution?.renderPath : undefined,
        // E6#57.13：发行说明载荷——壳取好推下（壳想、池画）。只盖章到那一个 tab，别的类型不携带
        releaseNotes: isReleaseNotesTab ? releaseNotes : undefined,
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
    groups: serializeGroups(win.tabState, ctx.t, ctx.releaseNotes),
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
