import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
// Electron IPC——window.linkdesk 由 preload-shell.ts 注入
const linkdesk = () => window.linkdesk;
import { showProgress, setDoNotDisturb, setSourceFilter, pushToast } from "./core/services/NotificationService";
import { reportError } from "./core/ErrorService";
import { useIpcEvent } from "./hooks/useIpcEvent";
import { useHeartbeat } from "./hooks/useHeartbeat"; // E2a #5 心跳看门狗
import { useMemoryMonitor } from "./hooks/useMemoryMonitor"; // E2a #6 内存监控
import { syncCountersAfterRestore } from "./hooks/useTabManager";
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

import { loadTheme, applyTheme, applyAccentColor, registerFallbackThemes, getEffectiveAccentColor } from "./core/services/ThemeEngine";
import { initPluginLoader, startPluginWatcher, stopPluginWatcher, getLoadedPluginManifests } from "./pluginLoader/loader";
import { factorySlots } from "./core/data/FactorySlots";
import { getViewPlugin } from "./pluginLoader/viewRegistry";
// Phase 5：新基础设施服务
// initConfigurationService 已提前到 main.tsx mount 前调用
import { getConfigurationValue, setConfigurationValue, onDidChangeConfiguration } from "./core/services/ConfigurationService";
import { useConfigurationValue } from "./core/react/useConfiguration";
// initStorageService 已提前到 main.tsx mount 前调用
import { registerConfiguration } from "./core/registry/ConfigurationRegistry";
import { initLayoutService, getTabLayout } from "./core/services/LayoutService";
import { initWorkspaceService } from "./core/services/WorkspaceService"; // E5.5#0e
import { initPluginStates, APP_PLUGIN_ID, setPluginStateValue } from "./core/services/PluginStateService";
import { ContextKeyService } from "./core/registry/ContextKeyService";
import { CUSTOM_EVENTS } from "./core/react/CoreEvents";
import { shellEvents } from "./core/react/ShellEvents"; // E5#3b：壳内事件总线
import { layoutEngine } from "./core/services/LayoutEngine"; // E5#9f：壳布局引擎——替代硬编码 CSS flex
import { onDidRequestShowChannel } from "./core/data/LogChannel"; // E3f #54
import { initIpcBridgeHandler, unregisterIpcBridgeHandler } from "./core/services/IpcBridgeHandler"; // E3a #26 + E5#103
import { initAll } from "./core/services/AppInitializer"; // E5#107：启动管线——可测试
import { mountGlobalKeybindings, initUserKeybindings } from "./core/registry/KeybindingRegistry";
import { applyConfiguration } from "./core/services/ConfigurationApplier";
import { initV3Api } from "./core/api/v3Api"; // Phase 5h: runtime plugin API namespace

/* ── 强调色应用（模块级 helper——init + onDidChangeConfiguration 共用） ── */

/** 将 hex 强调色写到 --accent / --accent-hover / --accent-light CSS 变量 */
// Phase 5b：核心命令注册（右键菜单归一化）
import { ensureCoreCommands, ensureCoreKeybindings } from "./core/builtin/coreCommands";
import { registerCommand } from "./core/registry/CommandRegistry"; // E3f #59e
// Phase 5e：内置协议注册（方括号解析器迁移到 ProtocolRegistry）
import { ensureBuiltinProtocols } from "./core/builtin/registerBuiltinProtocols";
import SourceStateContext from "./core/react/SourceStateContext";
import type { SourceInfo } from "./core/react/SourceStateContext";
import i18n from "./i18n";
import "./App.css";

/** E5#102c: 串口端口列表刷新间隔（ms） */
const PORT_REFRESH_INTERVAL = 2000;

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
  const [, setTheme] = useState<string>("Dark");
  const [, setLang] = useState<"zh" | "en">("zh");
  const [lastError, setLastError] = useState<string | null>(null);
  const [txBytes, setTxBytes] = useState(0);
  const [rxBytes, setRxBytes] = useState(0);

  // Phase 3 Step 6: 拖拽分屏（E5#5e-ii-f 已搬进 MainContent 内部管理）
  const editorAreaRef = useRef<HTMLDivElement>(null);
  // E3.6 Bug 2/7 防线：revertContainerIfCurrent 先于 forceCloseTab
  // 用 ref 桥接——sidebarView 声明在后面，闭包读 ref 避免 TDZ
  const sidebarViewRef = useRef<string | null>(null);
  const revertContainerIfCurrent = useCallback((pluginId: string) => {
    const current = sidebarViewRef.current;
    if (!current) return;
    const plugin = getViewPlugin(pluginId);
    const containers = plugin?.manifest.contributes?.viewsContainers as Record<string, unknown> | undefined;
    if (!containers) return;
    const containerIds = Object.keys(containers);
    if (containerIds.includes(current)) {
      setSidebarView(null);
    }
  }, []);

  // E5#88d：全局 unhandledrejection 兜底——防止 init 链等异步流程静默失败
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      reportError({ message: "未捕获的 Promise 拒绝", source: "App", error: event.reason, silent: true });
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, []);

  // Phase 4.4：监听插件卸载/禁用事件，自动关闭关联标签页
  useEffect(() => {
    const handler = (e: Event) => {
      const { pluginId } = (e as CustomEvent).detail as { pluginId: string };
      // 🔥 E36#4.5：关闭侧栏在先——需要 ViewContainerService 还有数据时读 manifest
      revertContainerIfCurrent(pluginId);
      // E5#5e-ii：MainContent 订阅此事件关闭标签页
      shellEvents.emit("plugin:removed", { pluginId });
    };
    window.addEventListener(CUSTOM_EVENTS.PLUGIN_REMOVED, handler);
    return () => window.removeEventListener(CUSTOM_EVENTS.PLUGIN_REMOVED, handler);
  }, [revertContainerIfCurrent]);


  /* ---- 启动初始化 ---- */
  useEffect(() => {
    // B12+B13 fix：捕获 cleanup 函数——HMR/StrictMode 下避免重复注册
    let keybindingCleanup: (() => void) | undefined;

    (async () => {
      // ═══ Pre-init：同步设置（需要 React 上下文 t() / sync-only）═══
      // Phase 5h: expose window.__v3_core__ before plugins load
      initV3Api();

      // E3a #26：初始化 IpcBridge 壳侧处理器——监听主进程转发的插件 IPC 请求
      initIpcBridgeHandler();

      // M2：注册内置兜底主题——插件主题后注册同名覆盖。确保卸载全部主题插件后下拉框不为空
      registerFallbackThemes();

      // Phase 5：注册核心配置（对标 VS Code 内置 settings）——Settings Editor "通用"分组
      registerConfiguration(APP_PLUGIN_ID, {
        title: t("通用"),
        properties: {
          "app.theme": {
            type: "string",
            default: "Dark",
            enum: ["Dark", "Light"],
            description: t("配色主题"),
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
            description: t("界面语言"),
            onApply: (v) => {
              i18n.changeLanguage(v as string);
              // E3c #40：跨进程广播——壳切语言 → 所有插件 WebView 同步
              const bridge = window.linkdesk?.bridge;
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
            description: t("强调色模式——自定义固定色 / 跟随主题（主题无强调色时用自定义兜底）"),
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
            description: t("自定义强调色（图标栏高亮、开关、焦点边框）"),
            dependsOn: { key: "app.accentMode", value: "custom" },
            renderHint: "color",
            // E3.5 fix: dependsOn 只控制 UI 显隐，不阻止 applyConfiguration 在启动时调用。
            // accentMode="followTheme" 时，app.accentColor 的 onApply 不应覆盖主题的 accent。
            onApply: () => applyAccentColor(getEffectiveAccentColor()),
          },
          "app.menuStyle": {
            type: "string",
            default: "titlebar",
            enum: ["titlebar", "hamburger", "both"],
            description: t("菜单栏样式——标题栏 / 汉堡菜单 / 两者都显示"),
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
        title: t("选择颜色…"),
        category: t("开发人员"),
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

      // E3f #59-F：注册全部壳级快捷键——声明式 CORE_KEYBINDINGS，幂等
      ensureCoreKeybindings();

      // ═══ Async pipeline：委托给 AppInitializer（E5#107） ═══
      const result = await initAll({
        initLayoutService,
        initPluginStates,
        initWorkspaceService, // E5.5#0e
        initPluginLoader,
        startPluginWatcher,
        getLoadedPluginManifests,
        factorySlotsInitialize: (plugins) => factorySlots.initialize(plugins),
        mountGlobalKeybindings,
        initUserKeybindings,
        getConfigurationValue,
        applyConfiguration,
        getSerialStatus: () => linkdesk().serial.getStatus(),
        getTabLayout,
        syncCountersAfterRestore,
      });

      keybindingCleanup = result.keybindingCleanup;

      // ═══ Post-init：React state 同步 ═══
      const initTheme = getConfigurationValue<string>("app.theme") ?? "Dark";
      const initLang = getConfigurationValue<string>("app.language") ?? "zh";
      setTheme(initTheme);
      setLang(initLang as "zh" | "en");

      // B14：lastPort 已迁移到 PluginStateService——终端插件自行管理
      setPortName("");

      // 串口状态同步（来自 AppInitializer 返回）
      if (result.serialState?.isOpen) {
        setPortName(result.serialState.portName);
        setBaudRate(String(result.serialState.baudRate));
        setIsOpen(true);
      }

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
      unregisterIpcBridgeHandler(); // E5#103
    };
  }, []);

  /* ── Phase 5d：运行时 context key 更新 ── */
  // 对标 VS Code setContext——串口/标签页状态变更时同步更新全局 context key 状态机

  // sourceOpen / sourceName——数据源开关时更新
  useEffect(() => {
    ContextKeyService.setValue("sourceOpen", isOpen);
    ContextKeyService.setValue("sourceName", isOpen ? portName : null);
  }, [isOpen, portName]);

  // E5#5e-ii-b：activeEditor——订阅 tab:focused 替代旧的 activePluginId 派生
  useEffect(() => {
    const unsub = shellEvents.on("tab:focused", ({ pluginId }) => {
      ContextKeyService.setValue("activeEditor", pluginId ?? null);
    });
    return unsub;
  }, []);

  // E5#7d：订阅 icon:reordered——IconBar 拖拽排序后持久化到 PluginStateService
  useEffect(() => {
    const unsub = shellEvents.on("icon:reordered", (ids) => {
      setPluginStateValue(APP_PLUGIN_ID, "iconOrder", ids);
    });
    return unsub;
  }, []);

  /* ---- E5#9f：LayoutEngine 壳布局——替代硬编码 CSS flex ---- */
  const TITLE_BAR_HEIGHT = 30;
  const [zoneBounds, setZoneBounds] = useState<Record<string, { x: number; y: number; width: number; height: number }>>({});

  useEffect(() => {
    const updateSize = () => layoutEngine.setContainerSize(window.innerWidth, window.innerHeight - TITLE_BAR_HEIGHT);
    const unsub = layoutEngine.onDidChangeLayout(() => {
      const b: Record<string, { x: number; y: number; width: number; height: number }> = {};
      for (const z of layoutEngine.getAllZones()) {
        const bounds = layoutEngine.getBounds(z.zone);
        if (bounds) b[z.zone] = bounds;
      }
      setZoneBounds(b);
    });
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => {
      window.removeEventListener("resize", updateSize);
      unsub();
    };
  }, []);

  /* ---- 侧栏拖拽调整宽度（走 LayoutEngine.resizeZone） ---- */
  const dragging = useRef(false);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
  }, []);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const edge = layoutEngine.getZone("sidebar")?.dock?.edge;
      const w = edge === "right"
        ? Math.min(600, Math.max(170, window.innerWidth - e.clientX))
        : Math.min(600, Math.max(170, e.clientX - (layoutEngine.getBounds("iconbar")?.width ?? 42)));
      layoutEngine.resizeZone("sidebar", w);
    };
    const onMouseUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

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

  /* ---- 图标栏 → 打开/聚焦标签页（Phase 3 §6.2） ---- */
  // Phase 4 UX：sidebarView 解耦侧栏和主区——对标 VS Code Activity Bar
  // 对标 VS Code：Extensions 侧栏打开时，切换编辑器不会关闭侧栏
  const [sidebarView, setSidebarView] = useState<string | null>(null);
  // E3.6: ref 同步——revertContainerIfCurrent 读最新值（ref 赋值在 render 阶段合法）
  sidebarViewRef.current = sidebarView;
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [themeBrowserOpen, setThemeBrowserOpen] = useState(false);
  const [themeBrowserPluginId, setThemeBrowserPluginId] = useState<string | undefined>(undefined);
  const [langPickerOpen, setLangPickerOpen] = useState(false);
  // E3f #58：开发者工具——DevTools picker
  const [devtoolsOpen, setDevtoolsOpen] = useState(false);
  type DevToolsTarget = { kind: 'plugin'; id: string } | { kind: 'shell' };
  const [devtoolsTargets, setDevtoolsTargets] = useState<DevToolsTarget[]>([]);

  // E3.6：图标栏点击——读 contributes.viewsContainers 取 containerId。

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
    // E5#5e-ii-f：输出面板打开走 ShellEvents，MainContent 内部 openOrFocusTab
    const onOutput = () => { shellEvents.emit("icon:selected", "output"); };
    window.addEventListener(CUSTOM_EVENTS.SHOW_OUTPUT, onOutput);
    // E3f #58：DevTools picker
    const onDevtoolsPicker = async () => {
      const lk = window.linkdesk;
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
      // E5#5e-ii-f TODO：restoreLayout 由 MainContent 处理
      if (detail.layout?.tabs?.groups?.length) {
        // MainContent 订阅 workspace:restore 事件接管
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
      shellEvents.emit("icon:selected", settingsId);
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
  }, []);

  // E3f #54：插件调 channel.show() → 自动打开输出面板并切换到该频道
  useEffect(() => {
    const unsub = onDidRequestShowChannel.event((_channelId: string) => {
      // E5#5e-ii-f：走 ShellEvents，MainContent 内部处理
      shellEvents.emit("icon:selected", "output");
    });
    return unsub;
  }, []);

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
      setLastError(t("串口操作失败") + "：" + (e?.message || e));
      reportError({ message: t("串口操作失败") + "：" + (e?.message || e), source: "serial-monitor", error: e });
    }
  }, [isOpen]);

  const handleBaudChange = useCallback(async (newBaud: string, encoding?: string) => {
    setBaudRate(newBaud);
    if (isOpen) {
      try {
        await linkdesk().serial.closePort();
        await linkdesk().serial.openPort({ portName: portNameRef.current, baudRate: parseInt(newBaud), encoding: encoding ?? "UTF-8" });
      } catch (e: any) {
        setLastError(t("波特率切换失败") + "：" + (e?.message || e));
        reportError({ message: t("波特率切换失败") + "：" + (e?.message || e), source: "serial-monitor", error: e });
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
        setLastError(t("端口切换失败") + "：" + (e?.message || e));
        reportError({ message: t("端口切换失败") + "：" + (e?.message || e), source: "serial-monitor", error: e });
        setIsOpen(false);
      }
    }
  }, [isOpen]);

  // Phase 5f：终端设置已迁移到 useConfiguration 直连——终端组件内部 setConfigurationValue。
  // App 壳不再需要逐 key 同步 terminalPrefs → ConfigurationService 双写。
  // 见 plugins/user/serial-monitor/index.tsx + sidebar.tsx——每个设置项独立 useConfiguration("serial-monitor.xxx")

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
    const timer = setInterval(refreshPorts, PORT_REFRESH_INTERVAL);
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

  // E3f #59-F：壳级快捷键已全部迁移到 KeybindingRegistry——声明式单一路径。
  // 原 capture-phase handler（Ctrl+, / Ctrl+Shift+P）和 bubble-phase handler
  // （Ctrl+W / Ctrl+Tab / Ctrl+\ / Ctrl+1~9）已删除。执行走 coreCommands.ts 的 CoreCallbacks 模式。

  // E2b #7：SourceStateContext——替代 SerialContext（核心只知道"数据源"，不知道"串口"）
  const sourceStateValue = useMemo(() => ({
    state: { ports, sourceName: portName, baudRate, isOpen, txBytes, rxBytes, lastError },
    actions: { toggleOpen: handleToggleOpen, setSourceName: handlePortChange, setBaudRate: handleBaudChange },
  }), [ports, portName, baudRate, isOpen, txBytes, rxBytes, lastError, handleToggleOpen, handlePortChange, handleBaudChange]);


  // E3f #52g：菜单样式——titlebar / hamburger / both
  const menuStyle = useConfigurationValue<string>("app.menuStyle") ?? "titlebar";

  if (!ready) return null;
  const showTitleBar = menuStyle !== "hamburger";
  const showHamburger = menuStyle !== "titlebar";

  return (
    <div className="app-shell">
      {/* E3f #52g：TitleBar 始终渲染——hamburger 时只隐藏菜单按钮，Logo+拖拽区保留 */}
      <TitleBar showMenus={showTitleBar} />
      {/* E3f #52f：窗口控件（─ □ ×）——始终渲染，不受 menuStyle 影响 */}
      <WindowControls />
      <SourceStateContext.Provider value={sourceStateValue}>
      <div className="app-main">
        {zoneBounds.iconbar && (
          <div style={{ position: "fixed", display: "flex", left: zoneBounds.iconbar.x, top: zoneBounds.iconbar.y + TITLE_BAR_HEIGHT, width: zoneBounds.iconbar.width, height: zoneBounds.iconbar.height, zIndex: 10 }}>
            <IconBar showHamburger={showHamburger} />
          </div>
        )}
        {zoneBounds.sidebar && (
          <div style={{ position: "fixed", display: "flex", overflow: "hidden", left: zoneBounds.sidebar.x, top: zoneBounds.sidebar.y + TITLE_BAR_HEIGHT, width: zoneBounds.sidebar.width, height: zoneBounds.sidebar.height, zIndex: 5 }}>
            <SidePanel width={zoneBounds.sidebar.width} />
          </div>
        )}
        {zoneBounds.sidebar && (() => {
          const edge = layoutEngine.getZone("sidebar")?.dock?.edge;
          const handleLeft = edge === "right"
            ? zoneBounds.sidebar.x - 4
            : zoneBounds.sidebar.x + zoneBounds.sidebar.width;
          return (
            <div
              style={{ position: "fixed", left: handleLeft, top: TITLE_BAR_HEIGHT, width: 4, height: zoneBounds.sidebar.height, zIndex: 15, cursor: "col-resize", background: "var(--separator)" }}
              onMouseDown={onResizeMouseDown}
            />
          );
        })()}
        {zoneBounds.main && (
          <div style={{ position: "fixed", display: "flex", flexDirection: "column", overflow: "hidden", left: zoneBounds.main.x, top: zoneBounds.main.y + TITLE_BAR_HEIGHT, width: zoneBounds.main.width, height: zoneBounds.main.height, zIndex: 1 }} ref={editorAreaRef}>
            <MainContent editorAreaRef={editorAreaRef} />
          </div>
        )}
        {zoneBounds.statusbar && (
          <div style={{ position: "fixed", left: zoneBounds.statusbar.x, top: zoneBounds.statusbar.y + TITLE_BAR_HEIGHT, width: zoneBounds.statusbar.width, height: zoneBounds.statusbar.height, zIndex: 10 }}>
            <StatusBar />
          </div>
        )}
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
          const lk = window.linkdesk;
          if (target.kind === 'shell') {
            await lk?.window?.toggleDevTools?.();
          } else {
            await lk?.pluginViews?.toggleDevTools?.(target.id);
          }
          setDevtoolsOpen(false);
        }}
        // E3.5 #CP21: 切 slot props
        renderLabel={(target) => target.kind === 'shell' ? `shell ${t("壳窗口")}` : target.id}
        renderCategory={() => t("切换 DevTools")}
        // E3.5 #CP24: 显示目标类型
        renderDetail={(target) => target.kind === 'shell' ? t("壳窗口 DevTools") : t("插件 DevTools")}
      />
      <ConfirmDialog />
      </SourceStateContext.Provider>
    </div>
  );
}

export default App;
