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
import { useState, useMemo } from "react";
import { useHeartbeat } from "./hooks/useHeartbeat"; // E2a #5 心跳看门狗
import { useMemoryMonitor } from "./hooks/useMemoryMonitor"; // E2a #6 内存监控
import { useTabManager } from "./hooks/useTabManager";
import { usePoolSync } from "./hooks/usePoolSync";

// Phase 5b：核心命令注册（右键菜单归一化）+ E5#5e-ii-f：核心回调（壳快捷键执行标签页操作）
import { updateCoreCallbacks, type CoreCallbacks } from "./core/commands/shell/coreCommands";
import { createCoreCallbacks, createTabActionHandler, createFocusTabHandler } from "./App/tabCallbacks";
import { useAppStartup } from "./App/startup";
import { useAppLifecycle } from "./App/lifecycle";
import { useUiBridges } from "./App/bridges";
import { useSidebarHost } from "./App/sidebarHost";
import { useLayoutPersistence } from "./App/persistence";
import { useTabActions } from "./App/tabActions";
import "./App.css";

function App() {
  const [ready, setReady] = useState(false);

  // E2a #5：心跳看门狗——App mount 即开始发送，主进程 2s 未收到 → 弹窗 "应用无响应"
  useHeartbeat();
  // E2a #6：内存监控——每 10s 采样，JS heap > 80% → toast 告警
  useMemoryMonitor();
  const [, setTheme] = useState<string>("Dark");
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
  useUiBridges({ setPanelActiveViewId });
  // E5.6#9d：侧栏展开/折叠状态——订阅侧栏宿主状态机（原 SidePanel，E5.7#10 迁入 App）发出的 sidebar:toggled
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  // E5.8#0d.10-3e：侧栏宿主状态机（折叠状态机 + 状态同步 + 启动恢复）迁入 src/App/sidebarHost.ts
  useSidebarHost({ setSidebarView, setIsSidebarExpanded, ready });

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
  } = useTabManager();

  // E5.8#0d.10-3g：标签页动作（图标直开/TabActions 桥接）+ 启动恢复——迁入 src/App/tabActions.ts
  useTabActions({ ready, createTab, openOrFocusTab, focusTab, closeTab, focusTabBySourceId, updateTabLabelBySourceId, closeTabBySourceId, restoreLayout, setPanelActiveViewId });

  // E5#5c：包装 focusTab——emit tab:focused 通知状态栏
  const handleFocusTab = useMemo(
    () => createFocusTabHandler({ focusTab, groups: tabState.groups }),
    [focusTab, tabState.groups],
  );

  // E5#5e-ii-f：核心回调——注册到 coreCommands，壳快捷键（Ctrl+W/Ctrl+Tab 等）走这里
  const coreCallbacks: CoreCallbacks = useMemo(
    () => createCoreCallbacks({ closeTab, splitTab, tabState, handleFocusTab, unsplit, openOrFocusTab, restoreClosedTab, duplicateTab: _duplicateTab, pinTab }),
    [closeTab, splitTab, tabState, handleFocusTab, unsplit, openOrFocusTab, restoreClosedTab, _duplicateTab, pinTab],
  );
  updateCoreCallbacks(coreCallbacks);

  // E5.6#16.5：MainPool tab 操作→壳 useTabManager。
  // 池 GroupTabBar 通过 pool.tabAction() → IPC → 此 handler → tabState 更新 → pushLayout 回环。
  // E5.7#96：action 载荷定型为 PoolTabAction wire 契约——枚举值/字段名壳池双端 tsc 对齐。
  const handleTabAction = useMemo(
    () => createTabActionHandler({ handleFocusTab, closeTab, groups: tabState.groups, reorderTab, moveTab, splitTabAt, duplicateTab: _duplicateTab, pinTab, createTab, updateSplitSizes }),
    [handleFocusTab, closeTab, tabState.groups, reorderTab, moveTab, splitTabAt, _duplicateTab, pinTab, createTab, updateSplitSizes],
  );

  // E5.6#9a → E5.7#4：Pool 布局同步——tabState/sidebarView/panelActiveViewId 变化 → 全量推送到唯一 Pool
  usePoolSync({ tabState, sidebarView, isSidebarVisible: isSidebarExpanded, panelActiveViewId, onTabAction: handleTabAction });

  // E5.8#0d.10-3f：布局持久化（beforeunload 同步写入 + 标签页/面板 100ms 防抖保存）迁入 src/App/persistence.ts
  useLayoutPersistence({ ready, tabState, panelActiveViewId });

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
