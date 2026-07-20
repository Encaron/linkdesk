import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTabManager, allTabs } from "./hooks/useTabManager";
import { getAllLeafGroupIds } from "./hooks/splitTree";
import { type DropZone } from "./hooks/tabDragTypes";
import IconBar from "./components/IconBar";
import SidePanel from "./components/SidePanel";
import MainContent from "./components/MainContent";
import StatusBar from "./components/StatusBar";
import ToastContainer from "./components/ToastContainer";
import PreferenceService, { initPrefs } from "./core/PreferenceService";
import { TerminalPrefsContext, defaultTerminalPrefs, type TerminalPrefs } from "./core/TerminalPrefsContext";
import { loadTheme, applyTheme } from "./core/ThemeEngine";
import { initPluginLoader, startPluginWatcher } from "./pluginLoader/loader";
import { isSidebarOnlyView, shouldKeepSidebarOnFocus } from "./hooks/tabIdentity";
// Phase 5：新基础设施服务
import { initConfigurationService, getConfigurationValue } from "./core/ConfigurationService";
import { registerConfiguration } from "./core/ConfigurationRegistry";
import { initLayoutService, getTabLayout, saveTabLayout } from "./core/LayoutService";
import { initPluginStates } from "./core/PluginStateService";
import { ContextKeyService } from "./core/ContextKeyService";
import { mountGlobalKeybindings } from "./core/KeybindingRegistry";
// Phase 5b：核心命令注册（右键菜单归一化）
import { ensureCoreCommands, updateCoreCallbacks, type CoreCallbacks } from "./core/coreCommands";
import SerialContext from "./core/SerialContext";
import type { PortInfo } from "./core/SerialContext";
import TabActionsContext from "./core/TabActionsContext";
import i18n from "./i18n";
import "./App.css";

function App() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [terminalPrefs, setTerminalPrefs] = useState<TerminalPrefs>({ ...defaultTerminalPrefs });
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [portName, setPortName] = useState("COM3");
  const [baudRate, setBaudRate] = useState("115200");
  const [theme, setTheme] = useState<"Dark" | "Light">("Dark");
  const [lang, setLang] = useState<"zh" | "en">("zh");
  const [lastError, setLastError] = useState<string | null>(null);
  const [txBytes, setTxBytes] = useState(0);
  const [rxBytes, setRxBytes] = useState(0);

  // Phase 3 v4: 标签页状态管理
  const {
    tabState,
    openOrFocusTab,
    focusTab,
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
  }), [closeTab, splitTab, tabState.groups]);

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
  const activeTabType = activeTab?.type ?? "welcome";
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
    window.addEventListener("plugin-removed", handler);
    return () => window.removeEventListener("plugin-removed", handler);
  }, [tabState.groups, forceCloseTab]);


  /* ---- 启动初始化 ---- */
  useEffect(() => {
    (async () => {
      // Phase 5：并行初始化所有服务
      const prefs = await initPrefs().catch(() => PreferenceService.loadPrefs?.() ?? null);
      await Promise.all([
        initConfigurationService(),
        initLayoutService(),
        initPluginStates(),
      ]).catch((e) => console.warn("[App] Phase 5 服务初始化部分失败:", e));

      // Phase 5：注册核心配置（对标 VS Code 内置 settings）——Settings Editor "通用"分组
      registerConfiguration("app", {
        title: "通用",
        properties: {
          "app.theme": {
            type: "string",
            default: "Dark",
            enum: ["Dark", "Light"],
            description: "配色主题",
          },
          "app.language": {
            type: "string",
            default: "zh",
            enum: ["zh", "en"],
            description: "界面语言",
          },
          "app.accentColor": {
            type: "string",
            default: "#0078d4",
            enum: ["#0078d4", "#e74856", "#ff8c00", "#107c10", "#6b69d6", "#8764b8"],
            description: "自定义强调色（图标栏高亮、开关、焦点边框）",
          },
        },
      });

      // Phase 5：初始化 context key 核心状态
      ContextKeyService.initCoreKeys();

      // Phase 5b：注册核心命令 + TabContext 菜单项（只执行一次，幂等）
      ensureCoreCommands();

      // Phase 4：初始化插件加载器（在 prefs 就绪后，布局恢复前）
      await initPluginLoader().catch((e) => console.warn("[App] 插件加载器初始化失败:", e));
      // P1-5：启动文件监听（检测新插件目录）
      startPluginWatcher();

      // 挂载全局快捷键（Phase 5 KeybindingRegistry）
      mountGlobalKeybindings();

      // Phase 5：主题/语言优先读 ConfigurationService（Settings Editor 写的），fallback 旧 Prefs
      const cfgTheme = getConfigurationValue<string>("app.theme");
      const cfgLang = getConfigurationValue<string>("app.language");
      const initTheme = cfgTheme || prefs?.theme || "Dark";
      const initLang = cfgLang || prefs?.language || "zh";

      loadTheme(initTheme)
        .then(applyTheme)
        .catch(() => { /* CSS fallback 生效 */ });
      setTheme(initTheme as "Dark" | "Light");
      setLang(initLang as "zh" | "en");
      i18n.changeLanguage(initLang);

      if (prefs) {
        setTerminalPrefs({ ...defaultTerminalPrefs, ...prefs.preferences });
        setPortName(prefs.lastPort || "COM3");
      }

      // Phase 5：布局恢复——LayoutService 优先
      try {
        const savedLayout = getTabLayout();
        if (savedLayout?.groups?.length > 0) {
          restoreLayout(savedLayout);
        }
      } catch { /* 布局恢复失败不影响启动 */ }

      setReady(true);
    })();
  }, [restoreLayout]);

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

  // Phase 5：Settings Editor 的配置变更 → 实际生效
  useEffect(() => {
    import("./core/ConfigurationService").then(({ onDidChangeConfiguration }) => {
      onDidChangeConfiguration((key, value) => {
        if (key === "app.theme") {
          const themeVal = value as string;
          setTheme(themeVal as "Dark" | "Light");
          loadTheme(themeVal).then(applyTheme).catch(() => {});
        }
        if (key === "app.language") {
          const langVal = value as string;
          setLang(langVal as "zh" | "en");
          i18n.changeLanguage(langVal);
        }
        if (key === "app.accentColor") {
          document.documentElement.style.setProperty("--accent", value as string);
          // 动态计算 hover 和 light 变体
          const hex = (value as string).replace("#", "");
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          document.documentElement.style.setProperty(
            "--accent-hover",
            `rgb(${Math.min(255, r + 30)},${Math.min(255, g + 30)},${Math.min(255, b + 30)})`
          );
          document.documentElement.style.setProperty(
            "--accent-light",
            `rgba(${r},${g},${b},0.15)`
          );
        }
      });
    });
  }, []);

  /* ---- 主题/语言切换 ---- */
  const handleToggleTheme = useCallback(() => {
    const next = theme === "Dark" ? "Light" : "Dark";
    setTheme(next);
    loadTheme(next).then(applyTheme).catch(() => {});
    // Phase 5：持久化到 ConfigurationService（替代 PreferenceService）
    import("./core/ConfigurationService").then(({ setConfigurationValue }) => {
      setConfigurationValue("app.theme", next, "user").catch(() => {});
    });
  }, [theme]);

  const handleToggleLang = useCallback(() => {
    const next = lang === "zh" ? "en" : "zh";
    setLang(next);
    i18n.changeLanguage(next);
    // Phase 5：持久化到 ConfigurationService（替代 PreferenceService）
    import("./core/ConfigurationService").then(({ setConfigurationValue }) => {
      setConfigurationValue("app.language", next, "user").catch(() => {});
    });
  }, [lang]);

  /* ---- 图标栏 → 打开/聚焦标签页（Phase 3 §6.2） ---- */
  // Phase 4 UX：sidebarView 解耦侧栏和主区——对标 VS Code Activity Bar
  // 对标 VS Code：Extensions 侧栏打开时，切换编辑器不会关闭侧栏
  const [sidebarView, setSidebarView] = useState<string | null>(null);

  // Phase 4.4：侧栏由插件 sidebarComponent 决定，不再特判 plugin-detail/marketplace
  const handleFocusTab = useCallback((tabId: string) => {
    const group = tabState.groups.find((g) => g.tabs.some((t) => t.id === tabId));
    const tab = group?.tabs.find((t) => t.id === tabId);
    // shouldKeepSidebarOnFocus：plugin-detail 保留侧栏（展示的是被查看插件的侧栏）
    if (tab && !shouldKeepSidebarOnFocus(tab)) {
      setSidebarView(null);
    }
    focusTab(tabId);
  }, [tabState.groups, focusTab]);

  // Phase 4.6 → Phase 5：图标栏点击。
  // - isSidebarOnlyView：纯侧栏 toggle（对标 VS Code Extensions 图标）
  // - 其余：打开/聚焦标签页 + 显示对应侧栏，传 pinned:true 防止预览替换。
  // Phase 5 rootfix：reduceOpenOrFocus 接收 opts → reduceCreateTab 跳过 Step 3 预览替换。
  // 对标 VS Code Activity Bar——点击打开的是固定视图，不是预览。
  const handleIconClick = useCallback(
    (pluginId: string) => {
      if (isSidebarOnlyView(pluginId)) {
        setSidebarView((prev) => (prev === pluginId ? null : pluginId));
      } else {
        setSidebarView(pluginId);
        openOrFocusTab(pluginId, { pinned: true });
      }
    },
    [openOrFocusTab]
  );

  // Phase 5c：监听齿轮菜单事件——跨组件通信
  useEffect(() => {
    const onOpenView = (e: Event) => {
      const { pluginId } = (e as CustomEvent).detail as { pluginId: string };
      if (pluginId) handleIconClick(pluginId);
    };
    window.addEventListener("v3-open-view", onOpenView);
    return () => window.removeEventListener("v3-open-view", onOpenView);
  }, [handleIconClick]);

  /* ---- 串口控制 ---- */
  const handleToggleOpen = useCallback(async () => {
    try {
      if (isOpen) {
        await invoke("close_port");
        setIsOpen(false);
      } else {
        await invoke("open_port", { portName, baudRate: parseInt(baudRate) });
        setIsOpen(true);
      }
    } catch (e: any) {
      setLastError(`串口操作失败：${e?.message || e}`);
    }
  }, [isOpen, portName, baudRate]);

  const handleBaudChange = useCallback(async (newBaud: string) => {
    setBaudRate(newBaud);
    if (isOpen) {
      try {
        await invoke("close_port");
        await invoke("open_port", { portName, baudRate: parseInt(newBaud) });
      } catch (e: any) {
        setLastError(`波特率切换失败：${e?.message || e}`);
        setIsOpen(false);
      }
    }
  }, [isOpen, portName]);

  const handlePortChange = useCallback(async (newPort: string) => {
    setPortName(newPort);
    if (isOpen) {
      try {
        await invoke("close_port");
        await invoke("open_port", { portName: newPort, baudRate: parseInt(baudRate) });
      } catch (e: any) {
        setLastError(`端口切换失败：${e?.message || e}`);
        setIsOpen(false);
      }
    }
  }, [isOpen, baudRate]);

  // Phase 5：终端设置变更 → 持久化到 ConfigurationService + PluginStateService（替代 PreferenceService）
  useEffect(() => {
    import("./core/ConfigurationService").then(async ({ setConfigurationValue }) => {
      await setConfigurationValue("terminal.timestampFormat", terminalPrefs.timestampFormat, "user");
      // 其余 terminal.* 配置项等 Settings Editor 就绪后统一迁移
    }).catch(() => {});
    // 同时保持 PreferenceService 兼容（Phase 5 过渡期——Settings Editor 完成后删除）
    try {
      const prefs = PreferenceService.loadPrefs();
      prefs.preferences = terminalPrefs as any;
      PreferenceService.savePrefs(prefs).catch(() => {});
    } catch { /* 静默 */ }
  }, [terminalPrefs]);

  // Phase 5：lastPort → PluginStateService（替代 PreferenceService）
  useEffect(() => {
    import("./core/PluginStateService").then(({ setPluginStateValue }) => {
      setPluginStateValue("terminal", "lastPort", portName);
    }).catch(() => {});
    // 同时保持 PreferenceService 兼容
    try {
      const prefs = PreferenceService.loadPrefs();
      prefs.lastPort = portName;
      PreferenceService.savePrefs(prefs).catch(() => {});
    } catch { /* 静默 */ }
  }, [portName]);

  // COM 口枚举 + 热插拔
  useEffect(() => {
    const refreshPorts = async () => {
      try {
        const list = await invoke<PortInfo[]>("list_ports");
        setPorts(list);
      } catch { /* 静默 */ }
    };
    refreshPorts();
    const timer = setInterval(refreshPorts, 2000);
    return () => clearInterval(timer);
  }, []);

  // TX/RX 字节计数
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ tx?: number; rx?: number }>("serial-stats", (event) => {
      if (event.payload.tx) setTxBytes((prev) => prev + event.payload.tx!);
      if (event.payload.rx) setRxBytes((prev) => prev + event.payload.rx!);
    }).then((fn) => { unlisten = fn; }).catch(() => {});
    return () => { unlisten?.(); };
  }, []);

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

  // beforeunload：F5/关闭窗口时同步写 localStorage，不等防抖
  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        const s = tabStateRef.current;
        const layout = {
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
        localStorage.setItem("v3_layout", JSON.stringify(layout));
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

  /**
   * 壳级全局快捷键——capture phase 第一优先级。
   *
   * 职责：处理不依赖上下文、始终可用的快捷键。对标 VS Code 内置 keybindings。
   * 注意：matched 时必须调用 e.stopImmediatePropagation()——阻止 KeybindingRegistry
   * 的同级 capture handler 也触发，避免双重执行。
   *
   * KeybindingRegistry 只处理插件声明的 contributes.keybindings（带 when 条件）。
   * 分工：壳级 → 这里；插件级 → KeybindingRegistry。
   */
  useEffect(() => {
    const onGlobalKeyDown = (e: KeyboardEvent) => {
      // Ctrl+, → 打开设置标签页（对标 VS Code Preferences: Open Settings）
      if (e.ctrlKey && e.key === ",") {
        e.preventDefault();
        e.stopImmediatePropagation();
        createTab("settings", { pinned: true });
        return;
      }
      // Ctrl+Shift+P → 命令面板（对标 VS Code Show All Commands）
      if (e.ctrlKey && e.shiftKey && (e.code === "KeyP" || e.key === "P" || e.key === "p")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        window.dispatchEvent(new CustomEvent("v3-show-palette"));
        return;
      }
    };
    window.addEventListener("keydown", onGlobalKeyDown, true); // capture phase——在编辑器之前拦截
    return () => window.removeEventListener("keydown", onGlobalKeyDown, true);
  }, [createTab]);

  // Phase 3: 全局键盘快捷键（§10.5）——依赖 activeTab 的快捷键
  useEffect(() => {
    const activeTabId = activeTab?.id;
    if (!activeTabId) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+W: 关闭当前标签页
      if (e.ctrlKey && e.key === "w") {
        e.preventDefault();
        const result = closeTab(activeTabId);
        if (!result.closed && result.reason === "dirty") {
          const activeGroup = tabState.groups.find((g) => g.id === tabState.activeGroupId);
          const tab = activeGroup?.tabs.find((t) => t.id === activeTabId);
          if (tab && window.confirm(t("「{{label}}」有未保存的修改，确定关闭？", { label: t(tab.label) }))) {
            forceCloseTab(activeTabId);
          }
        }
      }
      // Ctrl+Tab: 下一个标签页
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        const activeGroup = tabState.groups.find((g) => g.id === tabState.activeGroupId);
        if (activeGroup) {
          const { tabs } = activeGroup;
          const idx = tabs.findIndex((t) => t.id === activeGroup.activeTabId);
          if (idx !== -1) {
            const next = e.shiftKey ? idx - 1 : idx + 1;
            const target = tabs[(next + tabs.length) % tabs.length];
            handleFocusTab(target.id);
          }
        }
      }
      // Ctrl+\: 分屏切换
      if (e.ctrlKey && e.key === "\\") {
        e.preventDefault();
        const isSplit = tabState.root.type === "branch" || getAllLeafGroupIds(tabState.root).length > 1;
        if (isSplit) {
          unsplit(tabState.activeGroupId);
        } else {
          const activeGroup = tabState.groups.find((g) => g.id === tabState.activeGroupId);
          if (activeGroup && activeGroup.tabs.length > 1) {
            const idx = activeGroup.tabs.findIndex((t) => t.id === activeGroup.activeTabId);
            const next = activeGroup.tabs[(idx + 1) % activeGroup.tabs.length];
            splitTab(next.id, "horizontal");
          }
        }
      }
      // Ctrl+1~9: 跳转到第 N 个标签页
      const all = allTabs(tabState);
      const num = parseInt(e.key);
      if (e.ctrlKey && num >= 1 && num <= 9 && all[num - 1]) {
        e.preventDefault();
        handleFocusTab(all[num - 1].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tabState, activeTab, closeTab, forceCloseTab, handleFocusTab, splitTab, unsplit]);

  // SerialContext value（Phase 4：桥接 App 串口状态和终端插件）
  const serialContextValue = useMemo(() => ({
    state: { ports, portName, baudRate, isOpen, txBytes, rxBytes, lastError },
    actions: { toggleOpen: handleToggleOpen, setPortName: handlePortChange, setBaudRate: handleBaudChange },
  }), [ports, portName, baudRate, isOpen, txBytes, rxBytes, lastError, handleToggleOpen, handlePortChange, handleBaudChange]);

  // TabActionsContext value（Phase 4 P0-1：插件可创建标签页）
  const tabActionsValue = useMemo(() => ({
    createTab,
    openOrFocusTab,
  }), [createTab, openOrFocusTab]);

  if (!ready) return null;

  return (
    <div className="app-shell">
      <TabActionsContext.Provider value={tabActionsValue}>
      <SerialContext.Provider value={serialContextValue}>
      <TerminalPrefsContext.Provider value={{ prefs: terminalPrefs, setPrefs: setTerminalPrefs }}>
      <div className="app-body">
        <IconBar
          activeTabType={activeTabType ?? "welcome"}
          activePluginId={activePluginId}
          sidebarView={sidebarView}
          onOpenOrFocus={handleIconClick}
        />
        <SidePanel
          ref={sidebarRef}
          activeTabType={activeTabType ?? "welcome"}
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
      <ToastContainer />
      </TerminalPrefsContext.Provider>
      </SerialContext.Provider>
      </TabActionsContext.Provider>
    </div>
  );
}

export default App;
