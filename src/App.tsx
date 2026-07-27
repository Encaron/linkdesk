import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
// Electron IPC——window.linkdesk 由 preload-shell.ts 注入
const linkdesk = () => (window as any).linkdesk;
import { showProgress, setDoNotDisturb, setSourceFilter, pushToast } from "./core/NotificationService";
import { useIpcEvent } from "./hooks/useIpcEvent";
import { useHeartbeat } from "./hooks/useHeartbeat"; // E2a #5 心跳看门狗
import { useMemoryMonitor } from "./hooks/useMemoryMonitor"; // E2a #6 内存监控
import { useTabManager, allTabs, syncCountersAfterRestore } from "./hooks/useTabManager";
import { getAllLeafGroupIds } from "./hooks/splitTree";
import { type DropZone } from "./hooks/tabDragTypes";
import IconBar from "./components/IconBar";
import TitleBar from "./components/TitleBar"; // E3f #52f
import WindowControls from "./components/WindowControls"; // E3f #52f
import SidePanel from "./components/SidePanel";
import MainContent from "./components/MainContent";
import StatusBar from "./components/StatusBar";
import ProgressBar from "./components/ProgressBar";
import ToastContainer from "./components/ToastContainer";
import CommandPalette from "./components/shared/CommandPalette";
import QuickPick from "./components/shared/QuickPick"; // E3f #58
import ThemeBrowser from "./components/ThemeBrowser";
import LanguagePicker from "./components/LanguagePicker";
import { ConfirmDialog } from "./components/shared/ConfirmDialog";
import { showConfirm } from "./core/DialogService";

import { loadTheme, applyTheme, applyAccentColor, getAvailableThemes, registerFallbackThemes, getEffectiveAccentColor } from "./core/ThemeEngine";
import { initPluginLoader, startPluginWatcher, stopPluginWatcher, getLoadedPluginManifests } from "./pluginLoader/loader";
import { factorySlots } from "./core/FactorySlots";
import { getViewPlugin } from "./pluginLoader/viewRegistry";
import { shouldKeepSidebarOnFocus } from "./hooks/tabIdentity";
import { invokeBeforeCloseTab } from "./pluginLoader/viewRegistry";
import { FALLBACK_PLUGIN_ID } from "./utils/fallbackPluginId";
// Phase 5：新基础设施服务
import { initConfigurationService, getConfigurationValue, setConfigurationValue, onDidChangeConfiguration } from "./core/ConfigurationService";
import { initStorageService } from "./core/StorageService";
import { registerConfiguration } from "./core/ConfigurationRegistry";
import { initLayoutService, getTabLayout, saveTabLayout, syncWriteLayout, type WorkspaceLayout } from "./core/LayoutService";
import { initPluginStates, APP_PLUGIN_ID } from "./core/PluginStateService";
import { ContextKeyService } from "./core/ContextKeyService";
import { CUSTOM_EVENTS } from "./core/CoreEvents";
import { onDidRequestShowChannel } from "./core/LogChannel"; // E3f #54
import { initIpcBridgeHandler } from "./core/IpcBridgeHandler"; // E3a #26
import { mountGlobalKeybindings, initUserKeybindings } from "./core/KeybindingRegistry";
import { applyConfiguration } from "./core/ConfigurationApplier";
import { initV3Api } from "./core/v3Api"; // Phase 5h: runtime plugin API namespace

/* ── 强调色应用（模块级 helper——init + onDidChangeConfiguration 共用） ── */

/** 将 hex 强调色写到 --accent / --accent-hover / --accent-light CSS 变量 */
// Phase 5b：核心命令注册（右键菜单归一化）
import { ensureCoreCommands, ensureCoreKeybindings, updateCoreCallbacks, type CoreCallbacks } from "./core/coreCommands";
import { registerCommand } from "./core/CommandRegistry"; // E3f #59e
// Phase 5e：内置协议注册（方括号解析器迁移到 ProtocolRegistry）
import { ensureBuiltinProtocols } from "./core/registerBuiltinProtocols";
import SourceStateContext from "./core/SourceStateContext";
import type { SourceInfo } from "./core/SourceStateContext";
import TabActionsContext from "./core/TabActionsContext";
import i18n from "./i18n";
import "./App.css";

function App() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);

  // E2a #5：心跳看门狗——App mount 即开始发送，主进程 2s 未收到 → 弹窗 "应用无响应"
  useHeartbeat();
  // E2a #6：内存监控——每 10s 采样，JS heap > 80% → toast 告警
  useMemoryMonitor();
  const [isOpen, setIsOpen] = useState(false);
  const [ports, setPorts] = useState<SourceInfo[]>([]);
  const [portName, setPortName] = useState("");
  const [baudRate, setBaudRate] = useState("115200");
  // B86 fix：handleToggleOpen 用 ref 读最新值——ControlPanel 先 setPortName（React 异步）
  // 紧接着调 toggleOpen，闭包里的 portName 还是旧值（""），传给 Rust → ERROR_INVALID_NAME
  const portNameRef = useRef(portName);
  portNameRef.current = portName;
  const baudRateRef = useRef(baudRate);
  baudRateRef.current = baudRate;
  const [theme, setTheme] = useState<string>("Dark");
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [lastError, setLastError] = useState<string | null>(null);
  const [txBytes, setTxBytes] = useState(0);
  const [rxBytes, setRxBytes] = useState(0);

  // Phase 3 v4: 标签页状态管理
  const {
    tabState,
    openOrFocusTab,
    focusTab,
    focusTabBySourceId,
    closeTabBySourceId,
    openOrFocusBySourceId,
    updateTabLabelBySourceId,
    closeTab,
    forceCloseTab,
    createTab,
    moveTab,
    splitTab,
    splitTabAt,
    duplicateTab,
    unsplit,
    updateSplitSizes,
    restoreLayout,
    reorderTab,
    pinTab,
  } = useTabManager();

  // Phase 4.4：侧栏由插件 sidebarComponent 决定，不再特判 plugin-detail/marketplace
  const handleFocusTab = useCallback((tabId: string) => {
    const group = tabState.groups.find((g) => g.tabs.some((t) => t.id === tabId));
    const tab = group?.tabs.find((t) => t.id === tabId);
    if (tab && !shouldKeepSidebarOnFocus(tab)) {
      setSidebarView(null);
    }
    focusTab(tabId);
  }, [tabState.groups, focusTab]);

  // Phase 5b：核心命令 callbacks——每次渲染更新模块级 ref（零开销），handler 延迟读取避免闭包过期
  const coreCallbacks: CoreCallbacks = useMemo(() => ({
    closeTab,
    closeOtherTabs: (groupId, exceptTabId) => {
      const g = tabState.groups.find((g) => g.id === groupId);
      if (g) g.tabs.filter((t) => t.id !== exceptTabId).forEach((t) => closeTab(t.id));
    },
    closeRightTabs: (groupId, tabIndex) => {
      const g = tabState.groups.find((g) => g.id === groupId);
      if (g) g.tabs.slice(tabIndex + 1).forEach((t) => closeTab(t.id));
    },
    splitTab,
    findGroupByTabId: (tabId) => {
      for (const g of tabState.groups) {
        const found = g.tabs.find((t) => t.id === tabId);
        if (found) return { groupId: g.id, tabs: g.tabs.map((t) => ({ id: t.id })) };
      }
      return null;
    },
    openTab: (pluginId) => openOrFocusTab(pluginId, { pinned: true })!,
    // E3f #59-F：壳级快捷键迁移到 KeybindingRegistry
    closeActiveTab: async () => {
      const group = tabState.groups.find((g) => g.id === tabState.activeGroupId);
      const tab = group?.tabs.find((t) => t.id === group.activeTabId);
      if (!tab) return;
      if (tab.pluginId && !await invokeBeforeCloseTab(tab.pluginId)) return;
      const result = closeTab(tab.id);
      if (!result.closed && result.reason === "dirty") {
        if (await showConfirm(t("「{{label}}」有未保存的修改，确定关闭？", { label: t(tab.label) }))) {
          forceCloseTab(tab.id);
        }
      }
    },
    focusNextTab: (shift) => {
      const activeGroup = tabState.groups.find((g) => g.id === tabState.activeGroupId);
      if (!activeGroup) return;
      const { tabs } = activeGroup;
      const idx = tabs.findIndex((t) => t.id === activeGroup.activeTabId);
      if (idx === -1) return;
      const next = shift ? idx - 1 : idx + 1;
      handleFocusTab(tabs[(next + tabs.length) % tabs.length].id);
    },
    toggleSplit: () => {
      const isSplit = tabState.root.type === "branch" || getAllLeafGroupIds(tabState.root).length > 1;
      if (isSplit) {
        unsplit(tabState.activeGroupId);
      } else {
        const activeGroup = tabState.groups.find((g) => g.id === tabState.activeGroupId);
        if (activeGroup && activeGroup.tabs.length > 1) {
          const idx = activeGroup.tabs.findIndex((t) => t.id === activeGroup.activeTabId);
          splitTab(activeGroup.tabs[(idx + 1) % activeGroup.tabs.length].id, "horizontal");
        }
      }
    },
    focusNthTab: (n) => {
      const all = allTabs(tabState);
      if (n >= 1 && n <= all.length) handleFocusTab(all[n - 1].id);
    },
  }), [closeTab, forceCloseTab, splitTab, tabState, handleFocusTab, unsplit, openOrFocusTab, t]);

  // 每次渲染更新 callbacks ref
  updateCoreCallbacks(coreCallbacks);

  // Phase 3 Step 6: 拖拽分屏
  const editorAreaRef = useRef<HTMLDivElement>(null);
  const [dragDropZone, setDragDropZone] = useState<DropZone>(null);
  const [dragDropTargetGroupId, setDragDropTargetGroupId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 当前活跃标签页（v4: 从 groups 派生）
  const activeTab = useMemo(() => {
    const group = tabState.groups.find((g) => g.id === tabState.activeGroupId);
    return group?.tabs.find((t) => t.id === group.activeTabId);
  }, [tabState.groups, tabState.activeGroupId]);
  const activeTabType = activeTab?.type ?? FALLBACK_PLUGIN_ID;
  const activePluginId = activeTab?.pluginId;

  // Phase 4.4：监听插件卸载/禁用事件，自动关闭关联标签页
  useEffect(() => {
    const handler = (e: Event) => {
      const { pluginId } = (e as CustomEvent).detail as { pluginId: string };
      for (const group of tabState.groups) {
        for (const tab of group.tabs) {
          if (tab.pluginId === pluginId || tab.detailPluginId === pluginId) {
            forceCloseTab(tab.id);
          }
        }
      }
    };
    window.addEventListener(CUSTOM_EVENTS.PLUGIN_REMOVED, handler);
    return () => window.removeEventListener(CUSTOM_EVENTS.PLUGIN_REMOVED, handler);
  }, [tabState.groups, forceCloseTab]);


  /* ---- 启动初始化 ---- */
  useEffect(() => {
    // B12+B13 fix：捕获 cleanup 函数——HMR/StrictMode 下避免重复注册
    let keybindingCleanup: (() => void) | undefined;

    (async () => {
      // Phase 5：并行初始化所有服务（B14：PreferenceService 已删除，initPrefs 不再需要）
      await Promise.all([
        initStorageService(),
        initConfigurationService(),
        initLayoutService(),
        initPluginStates(),
      ]).catch((e) => console.warn("[App] Phase 5 服务初始化部分失败:", e));

      // Phase 5h: expose window.__v3_core__ before plugins load
      initV3Api();

      // E3a #26：初始化 IpcBridge 壳侧处理器——监听主进程转发的插件 IPC 请求
      initIpcBridgeHandler();

      // M2：注册内置兜底主题——插件主题后注册同名覆盖。确保卸载全部主题插件后下拉框不为空
      registerFallbackThemes();

      // Phase 5：注册核心配置（对标 VS Code 内置 settings）——Settings Editor "通用"分组
      // Phase 5：注册核心配置（app.theme 暂用占位枚举——插件加载后用真实主题列表覆盖）
      registerConfiguration(APP_PLUGIN_ID, {
        title: "通用",
        properties: {
          "app.theme": {
            type: "string",
            default: "Dark",
            enum: ["Dark", "Light"],
            description: "配色主题",
            onApply: async (v) => {
              const t = await loadTheme(v as string);
              applyTheme(t);
              // E3f #59d2：强调色走归一化函数——三种路径一条函数，不手写 if/else
              applyAccentColor(getEffectiveAccentColor());
            },
          },
          "app.language": {
            type: "string",
            default: "zh",
            enum: ["zh", "en"],
            description: "界面语言",
            onApply: (v) => {
              i18n.changeLanguage(v as string);
              // E3c #40：跨进程广播——壳切语言 → 所有插件 WebView 同步
              const bridge = (window as any).linkdesk?.bridge;
              if (bridge?.broadcast) {
                const resources: Record<string, unknown> = {};
                for (const lang of i18n.languages ?? []) {
                  const bundle = i18n.getResourceBundle(lang, "translation");
                  if (bundle) resources[lang] = bundle;
                }
                bridge.broadcast("lang:changed", { lang: v, resources });
              }
            },
          },
          "app.accentMode": {
            type: "string",
            default: "custom",
            enum: ["custom", "followTheme"],
            description: "强调色模式——自定义固定色 / 跟随主题（主题无强调色时用自定义兜底）",
            onApply: (v) => {
              if (v === "custom") {
                // 读当前 DOM 上实际显示的强调色——切模式前可能跟着主题走，不是 app.accentColor 的旧值
                const current = document.documentElement.style.getPropertyValue("--accent").trim();
                if (current) setConfigurationValue("app.accentColor", current, "user");
              }
              applyAccentColor(getEffectiveAccentColor());
            },
          },
          "app.accentColor": {
            type: "string",
            default: "#0078d4",
            description: "自定义强调色（图标栏高亮、开关、焦点边框）",
            dependsOn: { key: "app.accentMode", value: "custom" },
            renderHint: "color",
            onApply: (v) => applyAccentColor(v as string),
          },
          "app.menuStyle": {
            type: "string",
            default: "titlebar",
            enum: ["titlebar", "hamburger", "both"],
            description: "菜单栏样式——标题栏 / 汉堡菜单 / 两者都显示",
          },
        },
      });

      // Phase 5：初始化 context key 核心状态
      ContextKeyService.initCoreKeys();

      // Phase 5b：注册核心命令 + TabContext 菜单项（只执行一次，幂等）
      ensureCoreCommands();
      // E3f #59e2：color-picker.pick 命令——Promise 桥接，插件调 commands.execute 弹出浮层拿到返回值
      registerCommand(APP_PLUGIN_ID, {
        id: "color-picker.pick",
        title: "选择颜色…",
        category: "开发人员",
        handler: async (_token, ...args: unknown[]) => {
          const opts = (args[0] as { initialColor?: string; presets?: string[] }) ?? {};
          const color = await import("./components/shared/ColorPicker").then(m =>
            m.showColorPicker({ initialColor: opts.initialColor, presets: opts.presets })
          );
          // 返回值通过 executeCommand 的 Promise 传回调用方——对标 VS Code commands.executeCommand
          return color as unknown as void;
        },
      });

      // Phase 5e：注册内置方括号协议到 ProtocolRegistry（只执行一次，幂等）
      ensureBuiltinProtocols();

      // Phase 4：初始化插件加载器（在 prefs 就绪后，布局恢复前）
      await initPluginLoader().catch((e) => console.warn("[App] 插件加载器初始化失败:", e));
      // P1-5：启动文件监听（检测新插件目录）
      startPluginWatcher();

      // E2c #19e：初始化系统插槽——必须在插件加载后、首次消费前
      factorySlots.initialize(getLoadedPluginManifests().map((p) => ({ pluginId: p.pluginId, manifest: p.manifest })));

      // 挂载全局快捷键（Phase 5 KeybindingRegistry）——捕获返回值用于 cleanup
      keybindingCleanup = mountGlobalKeybindings();

      // E3f #59-F：注册全部壳级快捷键——声明式 CORE_KEYBINDINGS，幂等
      ensureCoreKeybindings();

      // E2c #17：加载用户快捷键 + 启动文件监听（在 mount 之后——加载前注册的插件绑定优先）
      initUserKeybindings().catch((e) => console.warn("[App] 用户快捷键初始化失败:", e));

      // Phase 5f：主题/语言/强调色通过 ConfigurationApplier 框架应用。
      // onApply 在 registerConfiguration 时声明，框架保证 theme async → accent sync 的时序。
      // B14：PreferenceService 已删除——ConfigurationService 默认值已注册，无需 prefs fallback。
      const initTheme = getConfigurationValue<string>("app.theme") ?? "Dark";
      const initLang = getConfigurationValue<string>("app.language") ?? "zh";

      await applyConfiguration("app.theme", initTheme);
      applyConfiguration("app.language", initLang);
      applyConfiguration("app.accentColor", getConfigurationValue<string>("app.accentColor"));
      setTheme(initTheme);
      setLang(initLang as "zh" | "en");

      // B14：lastPort 已迁移到 PluginStateService——终端插件自行管理
      setPortName("");

      // Bug fix (F5 状态不同步)：F5 只重启前端 React state，Rust 后端串口仍在运行。
      // 启动时查询后端实际状态，同步 isOpen/portName/baudRate。
      try {
        const status = await linkdesk().serial.getStatus();
        if (status.isOpen) {
          setPortName(status.portName);
          setBaudRate(String(status.baudRate));
          setIsOpen(true);
        }
      } catch { /* 首次启动或串口不可用——保持默认值 */ }

      // Phase 5：布局恢复——LayoutService 优先
      try {
        const savedLayout = getTabLayout();
        if (savedLayout?.groups?.length > 0) {
          restoreLayout(savedLayout);
          // G3：恢复后同步计数器——扫描所有 tab ID 提取最大值，
          // 避免 F5 后计数器归零与旧 tab ID 碰撞（syncCountersAfterRestore 泛化处理所有类型）
          const allTabs = savedLayout.groups.flatMap((g: { tabs: { id: string; type: string }[] }) => g.tabs);
          syncCountersAfterRestore(allTabs);
        }
      } catch { /* 布局恢复失败不影响启动 */ }

      // E3e debug：暴露通知 API 到 window——DevTools 控制台可调试验证
      (window as any).__showProgress = showProgress;
      (window as any).__setDoNotDisturb = setDoNotDisturb;
      (window as any).__setSourceFilter = setSourceFilter;
      (window as any).__pushToast = pushToast;
      (window as any).__clearDismissed = () => localStorage.removeItem("linkdesk_dismissed_toasts");

      setReady(true);
    })();

    // B12+B13 fix：cleanup——HMR/StrictMode double-mount 时不泄漏
    return () => {
      keybindingCleanup?.();
      stopPluginWatcher();
    };
  }, [restoreLayout]);

  /* ── Phase 5d：运行时 context key 更新 ── */
  // 对标 VS Code setContext——串口/标签页状态变更时同步更新全局 context key 状态机

  // sourceOpen / sourceName——数据源开关时更新
  useEffect(() => {
    ContextKeyService.setValue("sourceOpen", isOpen);
    ContextKeyService.setValue("sourceName", isOpen ? portName : null);
  }, [isOpen, portName]);

  // activeEditor——标签页切换时更新（pluginId 即 editor 身份）
  useEffect(() => {
    ContextKeyService.setValue("activeEditor", activePluginId ?? null);
  }, [activePluginId]);

  // editorCount——标签页开关时更新
  useEffect(() => {
    const count = tabState.groups.reduce((sum, g) => sum + g.tabs.length, 0);
    ContextKeyService.setValue("editorCount", count);
  }, [tabState.groups]);

  /* ---- 侧栏拖拽调整宽度 ---- */
  const [sidebarWidth, setSidebarWidth] = useState(220);
  const dragging = useRef(false);
  const sidebarRef = useRef<HTMLElement>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !sidebarRef.current) return;
      const w = Math.min(520, Math.max(160, e.clientX - 42));
      sidebarRef.current.style.width = w + "px";
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (sidebarRef.current) {
        setSidebarWidth(parseInt(sidebarRef.current.style.width) || 220);
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  /* ---- 拖拽分屏回调（Phase 3.x: 用 splitTabAt——在目标面板位置分裂） ---- */
  const handleDropSplit = useCallback(
    (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => {
      const direction = zone === "left" || zone === "right" ? "horizontal" : "vertical";
      splitTabAt(tabId, direction, targetGroupId, zone);
      setDragDropZone(null);
      setDragDropTargetGroupId(null);
      setIsDragging(false);
    },
    [splitTabAt]
  );

  /** Shift+拖 = 复制标签页到新面板（对标 VS Code） */
  const handleDropCopySplit = useCallback(
    (tabId: string, zone: Exclude<DropZone, null | "center">, targetGroupId?: string) => {
      const newId = duplicateTab(tabId);
      if (newId) {
        const direction = zone === "left" || zone === "right" ? "horizontal" : "vertical";
        splitTabAt(newId, direction, targetGroupId, zone);
      }
      setDragDropZone(null);
      setDragDropTargetGroupId(null);
      setIsDragging(false);
    },
    [duplicateTab, splitTabAt]
  );

  // Phase 5f：ConfigurationApplier 归一化——setConfigurationValue 自动调 onApply。
  // 此 listener 只做 React state 同步（theme/language——app shell 需要）。
  // terminal.* 变更由 useConfiguration hook 在终端组件内部响应。
  useEffect(() => {
    const unsub = onDidChangeConfiguration((key, value) => {
      if (key === "app.theme") setTheme(value as string);
      if (key === "app.language") setLang(value as "zh" | "en");
    });
    return unsub;
  }, []);

  /* ---- 主题/语言切换 ---- */
  const handleToggleTheme = useCallback(() => {
    const themes = getAvailableThemes();
    if (themes.length === 0) return;
    const idx = themes.indexOf(theme);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next);
    // Phase 5f：ConfigurationApplier 通过 onApply 自动调 loadTheme+applyTheme
    setConfigurationValue("app.theme", next, "user").catch(() => {});
  }, [theme]);

  const handleToggleLang = useCallback(() => {
    setLangPickerOpen(true);
  }, []);

  /* ---- 图标栏 → 打开/聚焦标签页（Phase 3 §6.2） ---- */
  // Phase 4 UX：sidebarView 解耦侧栏和主区——对标 VS Code Activity Bar
  // 对标 VS Code：Extensions 侧栏打开时，切换编辑器不会关闭侧栏
  const [sidebarView, setSidebarView] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [themeBrowserOpen, setThemeBrowserOpen] = useState(false);
  const [themeBrowserPluginId, setThemeBrowserPluginId] = useState<string | undefined>(undefined);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  // E3f #58：开发者工具——DevTools picker
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  type DevToolsTarget = { kind: 'plugin'; id: string } | { kind: 'shell' };
  const [devtoolsTargets, setDevtoolsTargets] = useState<DevToolsTarget[]>([]);

  // 图标栏点击——viewRole 声明决定行为。
  // sidebarPrimary（默认）：toggle 侧栏，对标 VS Code Activity Bar。
  // tabOnly：直接开标签页，对标 VS Code 设置齿轮。
  const handleIconClick = useCallback(
    (pluginId: string) => {
      const plugin = getViewPlugin(pluginId);
      if (plugin?.manifest.viewRole === "tabOnly") {
        createTab(pluginId);
      } else {
        setSidebarView((prev) => (prev === pluginId ? null : pluginId));
      }
    },
    [createTab]
  );


  /* ---- QuickPick 互斥——同时只允许一个浮动面板打开（对标 VS Code） ---- */
  useEffect(() => {
    const onPalette = () => {
      setThemeBrowserOpen(false);
      setLangPickerOpen(false);
      setPaletteOpen((p) => !p);
    };
    const onThemeBrowser = (e: Event) => {
      const { pluginId } = (e as CustomEvent).detail as { pluginId?: string };
      setPaletteOpen(false);
      setThemeBrowserPluginId(pluginId);
      setThemeBrowserOpen(true);
    };
    window.addEventListener(CUSTOM_EVENTS.SHOW_PALETTE, onPalette);
    window.addEventListener(CUSTOM_EVENTS.SHOW_THEME_BROWSER, onThemeBrowser);
    const onLanguagePicker = () => {
      setPaletteOpen(false);
      setLangPickerOpen(true);
    };
    window.addEventListener(CUSTOM_EVENTS.SHOW_LANGUAGE_PICKER, onLanguagePicker);
    // E3f #54：输出面板
    const onOutput = () => { openOrFocusTab("output", { pinned: true }); };
    window.addEventListener(CUSTOM_EVENTS.SHOW_OUTPUT, onOutput);
    // E3f #58：DevTools picker
    const onDevtoolsPicker = async () => {
      const lk = (window as any).linkdesk;
      const webViewIds: string[] = await lk?.pluginViews?.getAllIds?.() ?? [];
      const targets: DevToolsTarget[] = webViewIds.map(id => ({ kind: 'plugin' as const, id }));
      // 始终提供壳窗口入口（不管有没有插件 WebView）
      targets.push({ kind: 'shell' });
      if (targets.length === 0) return;
      setDevtoolsTargets(targets);
      setDevtoolsOpen(true);
    };
    window.addEventListener(CUSTOM_EVENTS.SHOW_DEVTOOLS_PICKER, onDevtoolsPicker);
    // E3f #56：工作区导入——恢复布局 + 设置
    const onRestoreWorkspace = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        layout?: { tabs?: { groups: unknown[]; activeGroupId: string }; cards?: unknown[] };
        settings?: Record<string, unknown>;
      };
      if (detail.layout?.tabs?.groups?.length) {
        restoreLayout(detail.layout.tabs as Parameters<typeof restoreLayout>[0]);
      }
      if (detail.settings) {
        for (const [key, value] of Object.entries(detail.settings)) {
          try { setConfigurationValue(key, value); } catch { /* skip invalid keys */ }
        }
      }
    };
    window.addEventListener(CUSTOM_EVENTS.RESTORE_WORKSPACE, onRestoreWorkspace);
    // E3f #59-A：外部打开设置标签页——快捷键命令/齿轮跳转
    const onOpenSettings = () => {
      const settingsId = factorySlots.getPluginId("settings") ?? "welcome";
      openOrFocusTab(settingsId, { pinned: true });
    };
    window.addEventListener(CUSTOM_EVENTS.OPEN_SETTINGS, onOpenSettings);
    return () => {
      window.removeEventListener(CUSTOM_EVENTS.SHOW_PALETTE, onPalette);
      window.removeEventListener(CUSTOM_EVENTS.SHOW_THEME_BROWSER, onThemeBrowser);
      window.removeEventListener(CUSTOM_EVENTS.SHOW_LANGUAGE_PICKER, onLanguagePicker);
      window.removeEventListener(CUSTOM_EVENTS.SHOW_OUTPUT, onOutput);
      window.removeEventListener(CUSTOM_EVENTS.RESTORE_WORKSPACE, onRestoreWorkspace);
      window.removeEventListener(CUSTOM_EVENTS.OPEN_SETTINGS, onOpenSettings);
      window.removeEventListener(CUSTOM_EVENTS.SHOW_DEVTOOLS_PICKER, onDevtoolsPicker);
    };
  }, [createTab, openOrFocusTab, restoreLayout]);

  // E3f #54：插件调 channel.show() → 自动打开输出面板并切换到该频道
  useEffect(() => {
    const unsub = onDidRequestShowChannel.event((channelId: string) => {
      openOrFocusTab("output", { pinned: true, sourceId: channelId });
    });
    return unsub;
  }, [openOrFocusTab]);

  /* ---- 串口控制 ---- */
  // E8：receiveCoding 从 session 传入——不再读旧 ConfigurationService（那个已没值了）

  const handleToggleOpen = useCallback(async (encoding?: string) => {
    try {
      if (isOpen) {
        await linkdesk().serial.closePort();
        setIsOpen(false);
      } else {
        // B86 fix：用 ref 读最新值——ControlPanel 在同一次事件循环里先 setPortName
        // （React 异步 setState）再调 toggleOpen，闭包 portName 还是旧值 → 打开失败
        await linkdesk().serial.openPort({ portName: portNameRef.current, baudRate: parseInt(baudRateRef.current), encoding: encoding ?? "UTF-8" });
        setIsOpen(true);
      }
    } catch (e: any) {
      setLastError(`串口操作失败：${e?.message || e}`);
    }
  }, [isOpen]);

  const handleBaudChange = useCallback(async (newBaud: string, encoding?: string) => {
    setBaudRate(newBaud);
    if (isOpen) {
      try {
        await linkdesk().serial.closePort();
        await linkdesk().serial.openPort({ portName: portNameRef.current, baudRate: parseInt(newBaud), encoding: encoding ?? "UTF-8" });
      } catch (e: any) {
        setLastError(`波特率切换失败：${e?.message || e}`);
        setIsOpen(false);
      }
    }
  }, [isOpen]);

  const handlePortChange = useCallback(async (newPort: string, encoding?: string) => {
    setPortName(newPort);
    if (isOpen) {
      try {
        await linkdesk().serial.closePort();
        await linkdesk().serial.openPort({ portName: newPort, baudRate: parseInt(baudRateRef.current), encoding: encoding ?? "UTF-8" });
      } catch (e: any) {
        setLastError(`端口切换失败：${e?.message || e}`);
        setIsOpen(false);
      }
    }
  }, [isOpen]);

  // Phase 5f：终端设置已迁移到 useConfiguration 直连——终端组件内部 setConfigurationValue。
  // App 壳不再需要逐 key 同步 terminalPrefs → ConfigurationService 双写。
  // 见 plugins/terminal/index.tsx + sidebar.tsx——每个设置项独立 useConfiguration("terminal.xxx")

  // E2c #19f：lastPort 持久化已搬到终端插件 ControlPanel.handlePortChange——壳不再知道 terminal

  // COM 口枚举 + 热插拔
  useEffect(() => {
    const refreshPorts = async () => {
      try {
        const list = await linkdesk().serial.listPorts();
        setPorts(list);
      } catch { /* 静默 */ }
    };
    refreshPorts();
    const timer = setInterval(refreshPorts, 2000);
    return () => clearInterval(timer);
  }, []);

  // TX/RX 字节计数——useIpcEvent 内置 generation counter，防 StrictMode 泄漏
  useIpcEvent<{ tx?: number; rx?: number }>("serial-stats", (payload) => {
    if (payload.tx) setTxBytes((prev) => prev + payload.tx!);
    if (payload.rx) setRxBytes((prev) => prev + payload.rx!);
  });

  // E5：监听 Rust serial-system 事件——invokeBeforeClose 直接调 close_port，
  // 不走 handleToggleOpen → setIsOpen(false)。此处补刀同步 isOpen 状态。
  useIpcEvent<string>("serial-system", (payload) => {
    if (/Port closed|关闭/.test(payload)) {
      setIsOpen(false);
    }
  });

  // 串口关闭时重置计数
  useEffect(() => {
    if (!isOpen) {
      setTxBytes(0);
      setRxBytes(0);
    }
  }, [isOpen]);

  // Phase 5: 布局持久化——走 LayoutService（layout.json）
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutInitialized = useRef(false);
  // 保持最新 tabState 的 ref——供 beforeunload 同步读（防抖窗口期 F5 也能保存）
  const tabStateRef = useRef(tabState);
  tabStateRef.current = tabState;

  // Phase 5f：beforeunload 归一化——走 LayoutService.syncWrite() 统一入口。
  // 不再手动序列化 + localStorage.setItem——归一化到 StorageService.writeSync。
  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        const s = tabStateRef.current;
        const layout: WorkspaceLayout = {
          tabs: {
            groups: s.groups.map((g) => ({
              id: g.id,
              tabs: g.tabs.map((t) => ({
                id: t.id, type: t.type, label: t.label, dirty: t.dirty,
                workspaceName: t.workspaceName, filePath: t.filePath,
                pluginId: t.pluginId, detailPluginId: t.detailPluginId,
                sourceId: t.sourceId, pinned: t.pinned,
              })),
              activeTabId: g.activeTabId,
            })),
            activeGroupId: s.activeGroupId,
            root: s.root,
          },
          cards: [],
        };
        syncWriteLayout(layout);
      } catch { /* 静默 */ }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => {
    if (!layoutInitialized.current) {
      layoutInitialized.current = true;
      return;
    }

    const doSave = () => {
      saveTabLayout({
        groups: tabState.groups.map((g) => ({
          id: g.id,
          tabs: g.tabs.map((t) => ({
            id: t.id, type: t.type, label: t.label, dirty: t.dirty,
            workspaceName: t.workspaceName, filePath: t.filePath,
            pluginId: t.pluginId,
            detailPluginId: t.detailPluginId,
            sourceId: t.sourceId,
            pinned: t.pinned,
          })),
          activeTabId: g.activeTabId,
        })),
        activeGroupId: tabState.activeGroupId,
        root: tabState.root,
      }).catch(() => {});
    };

    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(doSave, 100);  // Phase 5: 100ms 防抖（500ms→100ms）
    return () => {
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    };
  }, [tabState.groups, tabState.activeGroupId, tabState.root]);

  // E3f #59-F：壳级快捷键已全部迁移到 KeybindingRegistry——声明式单一路径。
  // 原 capture-phase handler（Ctrl+, / Ctrl+Shift+P）和 bubble-phase handler
  // （Ctrl+W / Ctrl+Tab / Ctrl+\ / Ctrl+1~9）已删除。执行走 coreCommands.ts 的 CoreCallbacks 模式。

  // E2b #7：SourceStateContext——替代 SerialContext（核心只知道"数据源"，不知道"串口"）
  const sourceStateValue = useMemo(() => ({
    state: { ports, sourceName: portName, baudRate, isOpen, txBytes, rxBytes, lastError },
    actions: { toggleOpen: handleToggleOpen, setSourceName: handlePortChange, setBaudRate: handleBaudChange },
  }), [ports, portName, baudRate, isOpen, txBytes, rxBytes, lastError, handleToggleOpen, handlePortChange, handleBaudChange]);

  // TabActionsContext value（Phase 4 P0-1：插件可创建标签页）
  const tabActionsValue = useMemo(() => ({
    createTab,
    openOrFocusTab,
    focusTab,
    focusTabBySourceId,
    openOrFocusBySourceId,
    updateTabLabelBySourceId,
    closeTabBySourceId,
    closeTab,
  }), [createTab, openOrFocusTab, focusTab, focusTabBySourceId, openOrFocusBySourceId, updateTabLabelBySourceId, closeTabBySourceId, closeTab]);

  if (!ready) return null;

  // E3f #52g：菜单样式——titlebar / hamburger / both
  const menuStyle = getConfigurationValue<string>("app.menuStyle") ?? "titlebar";
  const showTitleBar = menuStyle !== "hamburger";
  const showHamburger = menuStyle !== "titlebar";

  return (
    <div className="app-shell">
      {/* E3f #52g：TitleBar 始终渲染——hamburger 时只隐藏菜单按钮，Logo+拖拽区保留 */}
      <TitleBar showMenus={showTitleBar} />
      {/* E3f #52f：窗口控件（─ □ ×）——始终渲染，不受 menuStyle 影响 */}
      <WindowControls />
      <TabActionsContext.Provider value={tabActionsValue}>
      <SourceStateContext.Provider value={sourceStateValue}>
      <div className="app-main">
      <div className="app-body">
        <IconBar
          sidebarView={sidebarView}
          onOpenOrFocus={handleIconClick}
          showHamburger={showHamburger}
        />
        <SidePanel
          ref={sidebarRef}
          activeTabType={activeTabType ?? FALLBACK_PLUGIN_ID}
          activePluginId={activePluginId}
          sidebarView={sidebarView}
          width={sidebarWidth}
        />
        <div className="sidebar-resize-handle" onMouseDown={onResizeMouseDown} />
        {/* Phase 3 v4: 编辑器区域——每个面板独立标签栏（在 MainContent 内部渲染） */}
        <div className="editor-area" ref={editorAreaRef}>
          <MainContent
            tabState={tabState}
            activeGroupId={tabState.activeGroupId}
            onFocusTab={handleFocusTab}
            onCloseTab={closeTab}
            onCreateTab={createTab}
            onSplitTab={splitTab}
            onMoveTab={moveTab}
            onReorderTab={reorderTab}
            onPinTab={pinTab}
            onDropSplit={handleDropSplit}
            onDropCopySplit={handleDropCopySplit}
            onSplitResize={(anchorId, sizes, branchIndex) => updateSplitSizes(anchorId, sizes, branchIndex)}
            dropZone={dragDropZone}
            editorAreaRef={editorAreaRef}
            dragDropTargetGroupId={dragDropTargetGroupId}
            onDragDropZone={(zone, targetGroupId) => {
              setDragDropZone(zone);
              setDragDropTargetGroupId(targetGroupId ?? null);
            }}
            isDragging={isDragging}
            onDraggingChange={setIsDragging}
          />
        </div>
      </div>
      <StatusBar
        error={lastError}
        theme={theme}
        lang={lang}
        onToggleTheme={handleToggleTheme}
        onToggleLang={handleToggleLang}
      />
      </div>
      <ToastContainer />
      <ProgressBar />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <ThemeBrowser
        open={themeBrowserOpen}
        onClose={() => { setThemeBrowserOpen(false); setThemeBrowserPluginId(undefined); }}
        pluginId={themeBrowserPluginId}
      />
      <LanguagePicker
        open={langPickerOpen}
        onClose={() => setLangPickerOpen(false)}
      />
      {/* E3f #58：DevTools picker——列出所有运行中的插件 WebView + 壳窗口 */}
      <QuickPick
        open={devtoolsOpen}
        onClose={() => setDevtoolsOpen(false)}
        items={devtoolsTargets}
        placeholder={t("选择插件…")}
        getSearchText={(target) => target.kind === 'shell' ? `shell ${t("壳窗口")}` : target.id}
        getKey={(target) => target.kind === 'shell' ? '__shell__' : target.id}
        onSelect={async (target) => {
          const lk = (window as any).linkdesk;
          if (target.kind === 'shell') {
            await lk?.window?.toggleDevTools?.();
          } else {
            await lk?.pluginViews?.toggleDevTools?.(target.id);
          }
          setDevtoolsOpen(false);
        }}
        renderItem={(target) => (
          <>
            <span className="palette-item-label">
              {target.kind === 'shell' ? 'shell' : target.id}
            </span>
            <span className="palette-item-category">{t("切换 DevTools")}</span>
          </>
        )}
      />
      <ConfirmDialog />
      </SourceStateContext.Provider>
      </TabActionsContext.Provider>
    </div>
  );
}

export default App;
