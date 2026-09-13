/**
 * App 聚合器——壳根组件：mount-once 状态 + 子模块 hook 编排。
 * E5.8#0d.10-3g 收官：全部副作用逻辑拆入 src/App/ 同名夹子模块（聚合器门面模式，壳目录规范 §4）——
 *   tabCallbacks.ts  createCoreCallbacks/createTabActionHandler/createFocusTabHandler 纯工厂（#0d.10-3a）
 *   startup.ts       useAppStartup          启动初始化管线（#0d.10-3b）
 *   lifecycle.ts     useAppLifecycle        杂项生命周期（#0d.10-3c）
 *   bridges.ts       useUiBridges           壳↔池 UI 桥（#0d.10-3d）
 *   sidebarHost.ts   useSidebarHost         侧栏宿主状态机（#0d.10-3e）
 *   persistence.ts   useLayoutPersistence   布局持久化（#0d.10-3f）
 *   tabActions.ts    useTabActions          标签页动作 + 启动恢复（#0d.10-3g）
 * App.tsx 本身 = 聚合器（零 effect 零业务逻辑）：state 声明 → 子 hook 编排 → usePoolSync 推池。
 * 消费方零变更（main.tsx 仍 import App 默认导出）。
 */
import { useState, useMemo, useRef } from "react";
import { useHeartbeat } from "./hooks/useHeartbeat"; // E2a #5 心跳看门狗
import { useMemoryMonitor } from "./hooks/useMemoryMonitor"; // E2a #6 内存监控
import { useUpdateScheduler } from "./hooks/useUpdateScheduler"; // E6#57.9d 后台检查更新调度（auto 档）
import { useUpdateNotifications } from "./hooks/useUpdateNotifications"; // E6#57.12 更新通知面生产者
import { useTabManager } from "./hooks/useTabManager";
import { usePoolSync } from "./hooks/usePoolSync";
import { useWindowHost, type MainResourceActions } from "./App/windows/windowHost"; // E5.8#43-2：壳窗口注册表（多窗口 tabState + 窗口模式策略）；#46.2：主窗资源联动动作集

// Phase 5b：核心命令注册（右键菜单归一化）+ E5#5e-ii-f：核心回调（壳快捷键执行标签页操作）
import { updateCoreCallbacks, type CoreCallbacks } from "./core/commands/shell/coreCommands";
import { createCoreCallbacks, createTabActionHandler, createFocusTabHandler, createSourceIdRouters, createStableSourceIdRoutersBridge } from "./App/tabCallbacks";
import { useAppStartup } from "./App/startup";
import { useAppLifecycle } from "./App/lifecycle";
import { useUiBridges } from "./App/bridges";
import { useSidebarHost } from "./App/sidebarHost";
import { usePanelHost } from "./App/panelHost"; // E5.8#31：底部面板显隐宿主（Ctrl+J）
import { usePanelReveal } from "./App/panelReveal"; // E5.8#34.5：panel.reveal 通用 API 壳侧消费
import { useFloatingPanelReveal } from "./App/floatingPanelReveal"; // E5.8#39.5：panel.revealFloating 悬浮面板声明制
import { useLayoutPersistence } from "./App/persistence";
import { useTabActions } from "./App/tabActions";
import { useWindowRelocation } from "./App/windows/windowRelocation"; // E5.8#44：壳侧窗口间标签页搬迁（detach/merge）
import { usePanelDrift } from "./App/panelDrift"; // E5.8#45：面板脱出到独立窗口（drift 窗）
import "./App.css";

function App() {
  const [ready, setReady] = useState(false);

  // E2a #5：心跳看门狗——App mount 即开始发送，主进程 2s 未收到 → 弹窗 "应用无响应"
  useHeartbeat();
  // E2a #6：内存监控——每 10s 采样，JS heap > 80% → toast 告警
  useMemoryMonitor();
  // E6#57.9d：更新后台调度——ready（post-init）后 30s 首次检查，此后每 4h；manual 档不自动
  // （无窗口守卫——壳渲染进程结构上只有主窗口一份，实证见该文件头 + 08-调度归属与失败重试.md §一）
  // 🔴 `ready` 参数是 A7 修复本体（#57.9e 立案）：mount 时配置未就绪，档位要等 post-init 才读得到。
  useUpdateScheduler(ready);
  // E6#57.12：更新通知面生产者——发现 / 进度 / 完成三格由**状态迁移**驱动（后台查到的和手点查到的
  // 走同一个迁移）；「已最新」「失败」两格不在这里，它们是**发起方自消化**的（见该文件头的两条路径）。
  // 挂载点必须与调度器同处：调度器只负责「什么时候查」，本 hook 只负责「查完怎么说话」。
  useUpdateNotifications();
  const [, setTheme] = useState<string>("dark"); // E5.8#50.21：初始 = 壳内置配方 id（启动后由 app.theme 覆盖）
  const [, setLang] = useState<"zh" | "en">("zh");

  // E5.8#0d.10-3b：启动初始化管线（mount-once 注册 + initAll + post-init state 同步）迁入 src/App/startup.ts
  useAppStartup({ setTheme, setLang, setReady });

  /* ---- 图标栏 → 打开/聚焦标签页（Phase 3 §6.2） ---- */
  // Phase 4 UX：sidebarView 解耦侧栏和主区——对标 VS Code Activity Bar
  // 对标 VS Code：Extensions 侧栏打开时，切换编辑器不会关闭侧栏
  const [sidebarView, setSidebarView] = useState<string | null>(null);
  // E5.8#0d.10-3c：杂项生命周期（unhandledrejection/插件卸载防侧栏/context key/图标排序/LayoutEngine 尺寸/配置同步/自定义事件/频道显示）迁入 src/App/lifecycle.ts
  useAppLifecycle({ setTheme, setLang, sidebarView, setSidebarView });
  // E5.7#63.7：底部面板激活视图——真相源在壳（池只被动渲染）。null = 尚未选择 → usePoolSync 回退 views[0]
  const [panelActiveViewId, setPanelActiveViewId] = useState<string | null>(null);
  // E5.8#0d.10-3d：壳↔池 UI 桥接器（池 events 转发 + QuickPick/Toast/Dialog 哑桥 + 内存压力）迁入 src/App/bridges.ts
  // E5.8#32：面板激活视图 ref——bridges 桥 serialize 判断已激活勾选（ref 稳定，桥 effect 保持 deps 恒不变注册一次）
  const panelActiveViewIdRef = useRef(panelActiveViewId);
  panelActiveViewIdRef.current = panelActiveViewId;
  // E5.6#9d：侧栏展开/折叠状态——订阅侧栏宿主状态机（原 SidePanel，E5.7#10 迁入 App）发出的 sidebar:toggled
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  // E5.8#0d.10-3e：侧栏宿主状态机（折叠状态机 + 状态同步 + 启动恢复）迁入 src/App/sidebarHost.ts
  useSidebarHost({ setSidebarView, setIsSidebarExpanded, ready });
  // E5.8#31：底部面板显隐宿主——panelVisible 真相源 + 订阅 panel:toggle（Ctrl+J）翻转 + 立即落盘
  const { panelVisible, setPanelVisible } = usePanelHost({ panelActiveViewId });
  // E5.8#34.5：panel.reveal 通用 API 壳侧消费——面板展开 + 切到该视图（面板隐藏时同 Ctrl+J 机制）
  usePanelReveal({ setPanelVisible, setPanelActiveViewId });
  // E5.8#39.5：panel.revealFloating 通用 API 壳侧消费——声明寻址 + I8-2 身份开关键 + pushPanel
  useFloatingPanelReveal();

  // E3f #59-F：壳级快捷键已全部迁移到 KeybindingRegistry——声明式单一路径。
  // 原 capture-phase handler（Ctrl+, / Ctrl+Shift+P）和 bubble-phase handler
  // （Ctrl+W / Ctrl+Tab / Ctrl+\ / Ctrl+1~9）已删除。执行走 coreCommands.ts 的 CoreCallbacks 模式。

  /* ═══════════════════════════════════════════════════════════
   * E5.7#9：标签页状态机——原 MainContent.tsx 状态逻辑整体迁入 App。
   * 壳 = 纯状态持有者：tabState 真相源 + 布局持久化 + 池 tabAction 回环处理。
   * DOM 渲染（tab bar/分屏面板/壳视图 overlay）已随 MainContent 删除——
   * Phase 5 #20 MainZone 池内重建（池 ShellViewRenderer 路由 welcome/plugin-detail/output）。
   * ═══════════════════════════════════════════════════════════ */
  const {
    tabState,
    focusTab,
    focusGroup,
    closeTab,
    createTab,
    moveTab,
    splitTab,
    splitTabAt,
    duplicateTab: _duplicateTab,
    unsplit,
    updateSplitSizes,
    reorderTab,
    pinTab,
    openOrFocusTab,
    restoreLayout,
    focusTabBySourceId,
    closeTabBySourceId,
    updateTabLabelBySourceId,
    restoreClosedTab,
    removeTab, // E5.8#44：跨窗口搬迁源侧摘除（main 专用，内建 ensureFallback）
    insertTab, // E5.8#44：跨窗口搬迁目标侧插入（main）
    renameResourceBySourceId, // E5.8#46.2：资源事件族——windowHost 广播 effect 主窗分支消费
    deleteResourceBySourceId,
    removeTabsByPlugin,
    removeTabsUnderFolder,
  } = useTabManager();

  // E5.8#46.2：主窗资源联动动作集——windowHost 广播 effect 主窗分支消费（脱出窗走 mapResourceAcrossWindows）。
  // 6 方法恒等（useCallback []）→ useMemo 稳定 → 广播 effect 经 ref 读活值（deps [] 恒等注册，#46.12 死循环止血）
  const mainResourceActions: MainResourceActions = useMemo(
    () => ({
      renameResourceBySourceId,
      deleteResourceBySourceId,
      updateTabLabelBySourceId,
      closeTabBySourceId,
      removeTabsByPlugin,
      removeTabsUnderFolder,
    }),
    [renameResourceBySourceId, deleteResourceBySourceId, updateTabLabelBySourceId, closeTabBySourceId, removeTabsByPlugin, removeTabsUnderFolder],
  );

  // E5.8#43-2：壳窗口注册表——main tabState 活同步进注册表；createWindow/closeWindow/updateTabState
  // 供 #44 脱出手势/右键命令消费
  // E5.8#45：onDriftWindowClosed——漂移面板窗关闭 = 关闭面板（I9-13 拍板 A：关窗即关会话，不回归主窗口）。
  // 双路径（OS 点 × / 壳驱动 closeWindow）同触发；setPanelVisible 稳定（usePanelHost）→ 回调恒等
  const { windows, createWindow, closeWindow, updateTabState } = useWindowHost({
    mainTabState: tabState,
    onDriftWindowClosed: () => setPanelVisible(false),
    mainResourceActions,
  });

  // E5.8#44：壳侧窗口间标签页搬迁——detach（拖出/右键「在新窗口中打开」）+ merge（吸附并窗/「并回主窗口」）
  const relocation = useWindowRelocation({
    windows,
    createWindow,
    closeWindow,
    updateTabState,
    removeTab,
    insertTab,
  });

  // E5.8#45：面板脱出到独立窗口——detachPanel（PanelZone ⤢ → panel:detach 桥消费）。
  // 需 windows/createWindow（上方 useWindowHost）→ useUiBridges 随之移到本行之后接线
  const { detachPanel } = usePanelDrift({ windows, createWindow });
  // E5.8#0d.10-3d：壳↔池 UI 桥接器——移到 usePanelDrift 之后（detachPanel 依赖 windows/createWindow 就绪）。
  // deps 恒等（setPanelActiveViewId useState setter + panelActiveViewIdRef ref + detachPanel useCallback 稳定）
  useUiBridges({ setPanelActiveViewId, panelActiveViewIdRef, detachPanel });

  // E5.8#46.12/46.2：focusBySourceId 按窗路由——信封来源窗章（池→壳请求自动盖章）落脱出窗注册表聚焦，
  // 主窗/未注走 useTabManager。修窗口身份丢失类同根 bug（脱出窗 focus 静默 no-op）。
  // E5.8#46.2：updateLabel/close 已移出路由——windowHost 全窗广播（壳侧唯一订阅点，资源事件 = 全窗事实）。
  const sourceIdRouters = useMemo(
    () => createSourceIdRouters({
      windows, updateTabState, closeWindow,
      focusTabBySourceId,
    }),
    [windows, updateTabState, closeWindow, focusTabBySourceId],
  );

  // 🔥 E5.8#46.12 回归修复（实机卡死根因）：sourceIdRouters 闭包抓 windows（每次 tabState 变化换引用）
  // → 路由函数引用不稳 → useTabActions u5 订阅 effect 每 render 重订阅 → ShellEvents.on()
  // 回放缓冲重放 tab:create → createTab 死循环。ref 读活值 + 稳定桥钉死函数引用（恒等），路由不降。
  const sourceIdRoutersRef = useRef(sourceIdRouters);
  sourceIdRoutersRef.current = sourceIdRouters;
  const stableSourceIdRouters = useMemo(() => createStableSourceIdRoutersBridge(sourceIdRoutersRef), []);

  // E5.8#0d.10-3g：标签页动作（图标直开/TabActions 桥接）+ 启动恢复——迁入 src/App/tabActions.ts
  useTabActions({ ready, createTab, openOrFocusTab, focusTab, closeTab, focusTabBySourceId: stableSourceIdRouters.focusTabBySourceId, restoreLayout, setPanelActiveViewId });

  // E5#5c：包装 focusTab——emit tab:focused 通知状态栏
  const handleFocusTab = useMemo(
    () => createFocusTabHandler({ focusTab, groups: tabState.groups }),
    [focusTab, tabState.groups],
  );

  // E5#5e-ii-f：核心回调——注册到 coreCommands，壳快捷键（Ctrl+W/Ctrl+Tab 等）走这里
  const coreCallbacks: CoreCallbacks = useMemo(
    () => createCoreCallbacks({
      closeTab, splitTab, tabState, handleFocusTab, unsplit, openOrFocusTab, restoreClosedTab,
      duplicateTab: _duplicateTab, pinTab,
      detachTab: relocation.detachTabToNewWindow, mergeTabToMain: relocation.mergeTabToMain, findTabWindow: relocation.findTabWindow,
      windows, updateTabState, closeWindow,
    }),
    [closeTab, splitTab, tabState, handleFocusTab, unsplit, openOrFocusTab, restoreClosedTab, _duplicateTab, pinTab, relocation, windows, updateTabState, closeWindow],
  );
  updateCoreCallbacks(coreCallbacks);

  // E5.6#16.5：MainPool tab 操作→壳 useTabManager。
  // 池 GroupTabBar 通过 pool.tabAction() → IPC → 此 handler → tabState 更新 → pushLayout 回环。
  // E5.7#96：action 载荷定型为 PoolTabAction wire 契约——枚举值/字段名壳池双端 tsc 对齐。
  const handleTabAction = useMemo(
    () => createTabActionHandler({ handleFocusTab, focusGroup, closeTab, groups: tabState.groups, reorderTab, moveTab, splitTabAt, duplicateTab: _duplicateTab, pinTab, createTab, updateSplitSizes, releaseOutside: relocation.releaseOutside, windows, updateTabState, closeWindow }),
    [handleFocusTab, focusGroup, closeTab, tabState.groups, reorderTab, moveTab, splitTabAt, _duplicateTab, pinTab, createTab, updateSplitSizes, relocation.releaseOutside, windows, updateTabState, closeWindow],
  );

  // E5.6#9a → E5.7#4：Pool 布局同步——壳窗口注册表/侧栏/面板变化 → 按窗口定向推送到各 Pool
  // E5.8#43-2：windows 注册表替代单 tabState——主窗恒推全量，脱出窗按策略表 zones 推子集
  usePoolSync({ windows, sidebarView, isSidebarVisible: isSidebarExpanded, panelActiveViewId, panelVisible, onTabAction: handleTabAction });

  // E5.8#0d.10-3f：布局持久化（beforeunload 同步写入 + 标签页/面板 100ms 防抖保存）迁入 src/App/persistence.ts
  // E5.8#43-3：windows 传入——脱出窗 bounds 变化落盘（moved/resized 上报 → 注册表 → 持久化）
  useLayoutPersistence({ ready, tabState, panelActiveViewId, panelVisible, windows });

  if (!ready) return null;

  return (
    <div className="app-shell">
      {/* E5.7#9：壳 DOM 全删——TitleBar(#5)/IconBar(#6)/StatusBar(#8)/SidePanel(#10) 已迁池内 zone，
          MainContent/WindowControls 删除（#9），SplitHandles 删除（#31）。壳 = 纯状态持有者
          （tabState/Registry/命令执行/侧栏宿主状态机），WCV 满窗覆盖壳渲染进程（#12.5），无可见 DOM。 */}
    </div>
  );
}

export default App;
