import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTabManager, allTabs, resetTerminalCounter } from "./hooks/useTabManager";
import { getAllLeafGroupIds } from "./hooks/splitTree";
import { type DropZone } from "./hooks/tabDragTypes";
import IconBar from "./components/IconBar";
import SidePanel from "./components/SidePanel";
import MainContent from "./components/MainContent";
import StatusBar from "./components/StatusBar";
import ToastContainer from "./components/ToastContainer";
import CommandPalette from "./components/terminal/CommandPalette";
import { ConfirmDialog, showConfirm } from "./components/shared/ConfirmDialog";

import { loadTheme, applyTheme } from "./core/ThemeEngine";
import { initPluginLoader, startPluginWatcher, stopPluginWatcher } from "./pluginLoader/loader";
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
import { mountGlobalKeybindings } from "./core/KeybindingRegistry";
import { applyConfiguration } from "./core/ConfigurationApplier";
import { initV3Api } from "./core/v3Api"; // Phase 5h: runtime plugin API namespace

/* ── 强调色应用（模块级 helper——init + onDidChangeConfiguration 共用） ── */

/** 将 hex 强调色写到 --accent / --accent-hover / --accent-light CSS 变量 */
function applyAccentColor(hexColor: string): void {
  document.documentElement.style.setProperty("--accent", hexColor);
  const hex = hexColor.replace("#", "");
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
// Phase 5b：核心命令注册（右键菜单归一化）
import { ensureCoreCommands, updateCoreCallbacks, type CoreCallbacks } from "./core/coreCommands";
// Phase 5e：内置协议注册（方括号解析器迁移到 ProtocolRegistry）
import { ensureBuiltinProtocols } from "./core/registerBuiltinProtocols";
import SerialContext from "./core/SerialContext";
import type { PortInfo } from "./core/SerialContext";
import TabActionsContext from "./core/TabActionsContext";
import i18n from "./i18n";
import "./App.css";

function App() {
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [portName, setPortName] = useState("");
  const [baudRate, setBaudRate] = useState("115200");
  // B86 fix：handleToggleOpen 用 ref 读最新值——ControlPanel 先 setPortName（React 异步）
  // 紧接着调 toggleOpen，闭包里的 portName 还是旧值（""），传给 Rust → ERROR_INVALID_NAME
  const portNameRef = useRef(portName);
  portNameRef.current = portName;
  const baudRateRef = useRef(baudRate);
  baudRateRef.current = baudRate;
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
  }), [closeTab, splitTab, tabState.groups, openOrFocusTab]);

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

      // Phase 5：注册核心配置（对标 VS Code 内置 settings）——Settings Editor "通用"分组
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
            },
          },
          "app.language": {
            type: "string",
            default: "zh",
            enum: ["zh", "en"],
            description: "界面语言",
            onApply: (v) => { i18n.changeLanguage(v as string); },
          },
          "app.accentColor": {
            type: "string",
            default: "#0078d4",
            description: "自定义强调色（图标栏高亮、开关、焦点边框）",
            onApply: (v) => applyAccentColor(v as string),
          },
        },
      });

      // Phase 5：初始化 context key 核心状态
      ContextKeyService.initCoreKeys();

      // Phase 5b：注册核心命令 + TabContext 菜单项（只执行一次，幂等）
      ensureCoreCommands();

      // Phase 5e：注册内置方括号协议到 ProtocolRegistry（只执行一次，幂等）
      ensureBuiltinProtocols();

      // Phase 4：初始化插件加载器（在 prefs 就绪后，布局恢复前）
      await initPluginLoader().catch((e) => console.warn("[App] 插件加载器初始化失败:", e));
      // P1-5：启动文件监听（检测新插件目录）
      startPluginWatcher();

      // 挂载全局快捷键（Phase 5 KeybindingRegistry）——捕获返回值用于 cleanup
      keybindingCleanup = mountGlobalKeybindings();

      // Phase 5f：主题/语言/强调色通过 ConfigurationApplier 框架应用。
      // onApply 在 registerConfiguration 时声明，框架保证 theme async → accent sync 的时序。
      // B14：PreferenceService 已删除——ConfigurationService 默认值已注册，无需 prefs fallback。
      const initTheme = getConfigurationValue<string>("app.theme") ?? "Dark";
      const initLang = getConfigurationValue<string>("app.language") ?? "zh";

      await applyConfiguration("app.theme", initTheme);
      applyConfiguration("app.language", initLang);
      applyConfiguration("app.accentColor", getConfigurationValue<string>("app.accentColor"));
      setTheme(initTheme as "Dark" | "Light");
      setLang(initLang as "zh" | "en");

      // B14：lastPort 已迁移到 PluginStateService——终端插件自行管理
      setPortName("");

      // Bug fix (F5 状态不同步)：F5 只重启前端 React state，Rust 后端串口仍在运行。
      // 启动时查询后端实际状态，同步 isOpen/portName/baudRate。
      try {
        const status = await invoke<{ is_open: boolean; port_name: string; baud_rate: number }>("get_serial_status");
        if (status.is_open) {
          setPortName(status.port_name);
          setBaudRate(String(status.baud_rate));
          setIsOpen(true);
        }
      } catch { /* 首次启动或串口不可用——保持默认值 */ }

      // Phase 5：布局恢复——LayoutService 优先
      try {
        const savedLayout = getTabLayout();
        if (savedLayout?.groups?.length > 0) {
          restoreLayout(savedLayout);
          // 布局恢复后修复 _terminalCounter——避免新 session 的 ID 和
          // 已恢复的旧 tab ID 碰撞（两个独立计数器生命周期不一致）。
          // tabIdentity 的 generateId 用 _terminalCounter，useTerminalSessions 用 _sessionCounter。
          // 布局恢复了旧 tab（如 terminal-1、terminal-2），但 _terminalCounter 重启归零 →
          // 下次 createTab 生成同名 ID → 和旧 tab 碰撞 → closeTab 关错页。
          let maxN = 0;
          for (const g of savedLayout.groups) {
            for (const t of g.tabs) {
              const m = t.id.match(/^terminal-(\d+)$/);
              if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
            }
          }
          if (maxN > 0) resetTerminalCounter(maxN);
        }
      } catch { /* 布局恢复失败不影响启动 */ }

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

  // portOpen / portName——串口开关时更新
  useEffect(() => {
    ContextKeyService.setValue("portOpen", isOpen);
    ContextKeyService.setValue("portName", isOpen ? portName : null);
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
      if (key === "app.theme") setTheme(value as "Dark" | "Light");
      if (key === "app.language") setLang(value as "zh" | "en");
    });
    return unsub;
  }, []);

  /* ---- 主题/语言切换 ---- */
  const handleToggleTheme = useCallback(() => {
    const next = theme === "Dark" ? "Light" : "Dark";
    setTheme(next);
    // Phase 5f：ConfigurationApplier 通过 onApply 自动调 loadTheme+applyTheme
    setConfigurationValue("app.theme", next, "user").catch(() => {});
  }, [theme]);

  const handleToggleLang = useCallback(() => {
    const next = lang === "zh" ? "en" : "zh";
    setLang(next);
    // Phase 5f：ConfigurationApplier 通过 onApply 自动调 i18n.changeLanguage
    setConfigurationValue("app.language", next, "user").catch(() => {});
  }, [lang]);

  /* ---- 图标栏 → 打开/聚焦标签页（Phase 3 §6.2） ---- */
  // Phase 4 UX：sidebarView 解耦侧栏和主区——对标 VS Code Activity Bar
  // 对标 VS Code：Extensions 侧栏打开时，切换编辑器不会关闭侧栏
  const [sidebarView, setSidebarView] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

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

  // 图标栏点击——所有插件统一：toggle 侧栏。标签页从 WelcomeView/[+]/侧栏内部操作/齿轮菜单打开。
  // 对标 VS Code Activity Bar：点 Explorer/Extensions 图标只切侧栏，不自动开编辑器。
  const handleIconClick = useCallback(
    (pluginId: string) => {
      setSidebarView((prev) => (prev === pluginId ? null : pluginId));
    },
    []
  );


  /* ---- Command Palette——壳级特性，不属任何插件 ---- */
  useEffect(() => {
    const handler = () => setPaletteOpen((p) => !p);
    window.addEventListener(CUSTOM_EVENTS.SHOW_PALETTE, handler);
    return () => window.removeEventListener(CUSTOM_EVENTS.SHOW_PALETTE, handler);
  }, []);

  /* ---- 串口控制 ---- */
  // E8：receiveCoding 从 session 传入——不再读旧 ConfigurationService（那个已没值了）

  const handleToggleOpen = useCallback(async (encoding?: string) => {
    try {
      if (isOpen) {
        await invoke("close_port");
        setIsOpen(false);
      } else {
        // B86 fix：用 ref 读最新值——ControlPanel 在同一次事件循环里先 setPortName
        // （React 异步 setState）再调 toggleOpen，闭包 portName 还是旧值 → 打开失败
        await invoke("open_port", { portName: portNameRef.current, baudRate: parseInt(baudRateRef.current), encoding: encoding ?? "UTF-8" });
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
        await invoke("close_port");
        await invoke("open_port", { portName: portNameRef.current, baudRate: parseInt(newBaud), encoding: encoding ?? "UTF-8" });
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
        await invoke("close_port");
        await invoke("open_port", { portName: newPort, baudRate: parseInt(baudRateRef.current), encoding: encoding ?? "UTF-8" });
      } catch (e: any) {
        setLastError(`端口切换失败：${e?.message || e}`);
        setIsOpen(false);
      }
    }
  }, [isOpen]);

  // Phase 5f：终端设置已迁移到 useConfiguration 直连——终端组件内部 setConfigurationValue。
  // App 壳不再需要逐 key 同步 terminalPrefs → ConfigurationService 双写。
  // 见 plugins/terminal/index.tsx + sidebar.tsx——每个设置项独立 useConfiguration("terminal.xxx")

  // Phase 5：lastPort → PluginStateService（替代 PreferenceService）
  useEffect(() => {
    import("./core/PluginStateService").then(({ setPluginStateValue }) => {
      setPluginStateValue("terminal", "lastPort", portName);
    }).catch(() => {});
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

  // E5：监听 Rust serial-system 事件——invokeBeforeClose 直接调 close_port，
  // 不走 handleToggleOpen → setIsOpen(false)。此处补刀同步 isOpen 状态。
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<string>("serial-system", (event) => {
      if (/Port closed|关闭/.test(event.payload)) {
        setIsOpen(false);
      }
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

  /**
   * 壳级全局快捷键——capture phase 第一优先级。
   *
   * 职责：处理不依赖上下文、始终可用的快捷键。对标 VS Code 内置 keybindings。
   *
   * ⚠️ 注册顺序依赖：本 handler 必须在 KeybindingRegistry 之前注册，
   * 否则 stopImmediatePropagation 无法阻止 Registry 重复触发。
   * 当前顺序：App render → 此 useEffect → startup useEffect → mountGlobalKeybindings。
   * 如果未来加"全局快捷键监控/调试工具"，它必须注册在此 handler 之前。
   *
   * matched 时必须调用 e.stopImmediatePropagation()——阻止 KeybindingRegistry
   * 的同级 capture handler 也触发，避免双重执行。
   *
   * 分工：壳级 → 这里；插件级（带 when 条件）→ KeybindingRegistry。
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
        window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.SHOW_PALETTE));
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

    const onKeyDown = async (e: KeyboardEvent) => {
      // Ctrl+W: 关闭当前标签页
      if (e.ctrlKey && e.key === "w") {
        e.preventDefault();
        const activeGroup = tabState.groups.find((g) => g.id === tabState.activeGroupId);
        const tab = activeGroup?.tabs.find((t) => t.id === activeTabId);
        if (tab?.pluginId && !await invokeBeforeCloseTab(tab.pluginId)) return;

        const result = closeTab(activeTabId);
        if (!result.closed && result.reason === "dirty") {
          if (tab && await showConfirm(t("「{{label}}」有未保存的修改，确定关闭？", { label: t(tab.label) }))) {
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
    focusTab,
    focusTabBySourceId,
    openOrFocusBySourceId,
    updateTabLabelBySourceId,
    closeTabBySourceId,
    closeTab,
  }), [createTab, openOrFocusTab, focusTab, focusTabBySourceId, openOrFocusBySourceId, updateTabLabelBySourceId, closeTabBySourceId, closeTab]);

  if (!ready) return null;

  return (
    <div className="app-shell">
      <TabActionsContext.Provider value={tabActionsValue}>
      <SerialContext.Provider value={serialContextValue}>
      <div className="app-body">
        <IconBar
          sidebarView={sidebarView}
          onOpenOrFocus={handleIconClick}
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
      <ToastContainer />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
      />
      <ConfirmDialog />
      </SerialContext.Provider>
      </TabActionsContext.Provider>
    </div>
  );
}

export default App;
