import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
// Electron IPC——window.linkdesk 由 preload-shell.ts 注入
const linkdesk = () => window.linkdesk;
import { showProgress, setDoNotDisturb, setSourceFilter, pushToast } from "./core/services/NotificationService";
import { reportError } from "./core/services/ErrorService";
import { useIpcEvent } from "./hooks/useIpcEvent";
import { useHeartbeat } from "./hooks/useHeartbeat"; // E2a #5 心跳看门狗
import { useMemoryMonitor } from "./hooks/useMemoryMonitor"; // E2a #6 内存监控
import { useTabManager, allTabs, syncCountersAfterRestore } from "./hooks/useTabManager";
import { getAllLeafGroupIds } from "./hooks/splitTree";
import SidePanel from "./components/SidePanel";
import ProgressBar from "./components/ProgressBar";
import ToastContainer from "./components/ToastContainer";
// E5.5#7-p12：CommandPalette/ThemeBrowser/LanguagePicker 不再在 App.tsx 渲染——走 QuickPickService
import QuickPick from "./components/shared/QuickPick";
import { QuickPickService, type QuickPickState } from "./core/registry/QuickPickService";
import { ConfirmDialog } from "./components/shared/ConfirmDialog";

import { loadTheme, applyTheme, applyAccentColor, registerFallbackThemes, getEffectiveAccentColor } from "./core/services/ThemeEngine";
import { initPluginLoader, startPluginWatcher, stopPluginWatcher, getLoadedPluginManifests } from "./pluginLoader/loader";
import { factorySlots } from "./core/services/FactorySlots";
import { getViewPlugin, invokeBeforeCloseTab } from "./pluginLoader/viewRegistry";
// Phase 5：新基础设施服务
// initConfigurationService 已提前到 main.tsx mount 前调用
import { getConfigurationValue, setConfigurationValue, onDidChangeConfiguration } from "./core/services/ConfigurationService";
// initStorageService 已提前到 main.tsx mount 前调用
import { registerConfiguration } from "./core/registry/ConfigurationRegistry";
import { initLayoutService, getTabLayout, saveTabLayout, syncWriteLayout, type WorkspaceLayout } from "./core/services/LayoutService";
import { initWorkspaceService, syncWriteWorkspaceFolders } from "./core/services/WorkspaceService"; // E5.5#0e
import { initPluginStates, APP_PLUGIN_ID, setPluginStateValue } from "./core/services/PluginStateService";
import { ContextKeyService } from "./core/registry/ContextKeyService";
import { CUSTOM_EVENTS } from "./core/react/CoreEvents";
import { shellEvents } from "./core/react/ShellEvents"; // E5#3b：壳内事件总线
import { layoutEngine } from "./core/services/LayoutEngine"; // E5#9f：壳布局引擎——E5.7#9 起只喂容器尺寸（zone 几何真相源）
import { onDidRequestShowChannel } from "./core/services/LogChannel"; // E3f #54
import { initIpcBridgeHandler, unregisterIpcBridgeHandler } from "./core/services/IpcBridgeHandler"; // E3a #26 + E5#103
import { initAll } from "./core/services/AppInitializer"; // E5#107：启动管线——可测试
import { mountGlobalKeybindings, initUserKeybindings } from "./core/registry/KeybindingRegistry";
import { applyConfiguration } from "./core/services/ConfigurationApplier";
import { initV3Api } from "./core/api/v3Api"; // Phase 5h: runtime plugin API namespace
import { FALLBACK_PLUGIN_ID } from "./utils/fallbackPluginId";
import { usePoolSync } from "./hooks/usePoolSync";

/* ── 强调色应用（模块级 helper——init + onDidChangeConfiguration 共用） ── */

/** 将 hex 强调色写到 --accent / --accent-hover / --accent-light CSS 变量 */
// Phase 5b：核心命令注册（右键菜单归一化）+ E5#5e-ii-f：核心回调（壳快捷键执行标签页操作）
import { ensureCoreCommands, ensureCoreKeybindings, updateCoreCallbacks, type CoreCallbacks } from "./core/commands/coreCommands";
import { registerCommand } from "./core/registry/CommandRegistry"; // E3f #59e
// Phase 5e：内置协议注册（方括号解析器迁移到 ProtocolRegistry）
import { ensureBuiltinProtocols } from "./core/commands/registerBuiltinProtocols";
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
      // E5.6#9h：extension-file:// 主题文件 404 是 @codingame 已知无害错误，
      // VS Code 1.90+ light_modern.json 不在 monaco-languageclient 的打包中。
      // defineThemeSafe 已有 vs/vs-dark 兜底，功能不受影响。
      const msg = event.reason?.message ?? String(event.reason);
      if (msg.includes("extension-file://") && msg.includes("Not Found")) {
        event.preventDefault();
        return;
      }
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
      // E5#5e-ii：useTabManager 订阅此事件关闭标签页
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

  // E5.7#6：桥接池图标栏点击——池 events.emit("icon:selected") → 主进程 plugin:emit →
  // 壳 plugin:push → linkdesk.events.on → 转壳内 shellEvents（消费方 App/useTabManager 开标签）。
  useEffect(() => {
    const unsub = window.linkdesk?.events?.on("icon:selected", (pluginId: string) => {
      shellEvents.emit("icon:selected", pluginId);
    });
    return () => { unsub?.(); };
  }, []);

  /* ---- E5#9f：LayoutEngine 壳布局——E5.7#9 起只喂容器尺寸 ---- */
  // E5.7#12.5：Pool bounds 推流已删（主进程 syncPoolBounds 接管，WCV 满窗零偏移）。
  // LayoutEngine 仍需喂容器尺寸——zone 几何真相源在壳（usePoolSync 读 sidebar 宽度、
  // SidePanel setZoneWidth 折叠、Phase 3 #13 拖拽 commit）。零偏移——无 TITLE_BAR_HEIGHT。
  // Phase 7 #31 LayoutEngine 整删时此 effect 一并删除。
  useEffect(() => {
    const updateSize = () => layoutEngine.setContainerSize(window.innerWidth, window.innerHeight);
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => {
      window.removeEventListener("resize", updateSize);
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
  // E5.6#9d：侧栏展开/折叠状态——订阅 SidePanel 发出的 sidebar:toggled
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false);
  // E3.6: ref 同步——revertContainerIfCurrent 读最新值（ref 赋值在 render 阶段合法）
  sidebarViewRef.current = sidebarView;
  // E5.5#7-p12：归一化——所有 QuickPick 浮层共用一个组件
  const [quickPickState, setQuickPickState] = useState<QuickPickState | null>(null);
  useEffect(() => {
    return QuickPickService.onChange(() => {
      setQuickPickState(QuickPickService.getState());
    });
  }, []);

  // E3.6：图标栏点击——读 contributes.viewsContainers 取 containerId。

  // E5.6#9d：订阅 SidePanel 发出的侧栏状态变化——用于 pushLayout
  useEffect(() => {
    const u1 = shellEvents.on("sidebar:containerChanged", (cid: string | null) => {
      setSidebarView(cid);
    });
    const u2 = shellEvents.on("sidebar:toggled", (visible: boolean) => {
      setIsSidebarExpanded(visible);
      // E5.7#4：#12 提前——SidebarPool WCV 已删，侧栏显隐由 Pool 内 SidebarZone 条件渲染接管（Phase 3 #10）
    });
    return () => { u1(); u2(); };
  }, []);

  /* ---- QuickPick 归一化（E5.5#7-p12）——所有浮层共用一个 QuickPick，QuickPickService 管理状态 ---- */
  useEffect(() => {
    // 保留——非 QuickPick 事件（输出面板 / 工作区 / 设置）
    const onOutput = () => { shellEvents.emit("icon:selected", "output"); };
    window.addEventListener(CUSTOM_EVENTS.SHOW_OUTPUT, onOutput);
    const onRestoreWorkspace = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        layout?: { tabs?: { groups: unknown[]; activeGroupId: string }; cards?: unknown[] };
        settings?: Record<string, unknown>;
      };
      if (detail.layout?.tabs?.groups?.length) { /* workspace:restore 事件由 useTabManager 接管 */ }
      if (detail.settings) {
        for (const [key, value] of Object.entries(detail.settings)) {
          try { setConfigurationValue(key, value); } catch { /* skip */ }
        }
      }
    };
    window.addEventListener(CUSTOM_EVENTS.RESTORE_WORKSPACE, onRestoreWorkspace);
    const onOpenSettings = () => {
      const settingsId = factorySlots.getPluginId("settings") ?? "welcome";
      shellEvents.emit("icon:selected", settingsId);
    };
    window.addEventListener(CUSTOM_EVENTS.OPEN_SETTINGS, onOpenSettings);
    return () => {
      window.removeEventListener(CUSTOM_EVENTS.SHOW_OUTPUT, onOutput);
      window.removeEventListener(CUSTOM_EVENTS.RESTORE_WORKSPACE, onRestoreWorkspace);
      window.removeEventListener(CUSTOM_EVENTS.OPEN_SETTINGS, onOpenSettings);
    };
  }, []);

  // E3f #54：插件调 channel.show() → 自动打开输出面板并切换到该频道
  useEffect(() => {
    const unsub = onDidRequestShowChannel.event((_channelId: string) => {
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
    forceCloseTab,
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

  // E5#5b：订阅 icon:selected——tabOnly 插件直接开标签页（不再经 App 中转）
  useEffect(() => {
    const unsub = shellEvents.on("icon:selected", (pluginId) => {
      const plugin = getViewPlugin(pluginId);
      if (plugin?.manifest.appearsIn?.tabBar && !plugin?.manifest.appearsIn?.sidePanel) {
        const tabId = createTab(pluginId);
        // E5.6 fix：icon:selected 直开标签页也不会触发 tab:focused → activeEditor 不更新
        if (tabId) shellEvents.emit("tab:focused", { pluginId, tabId });
      }
    });
    return unsub;
  }, [createTab]);

  // E5#5e-ii-f：TabActions 桥接——ShellEvents → useTabManager
  useEffect(() => {
    // E5.6 fix：tab:create / tab:openOrFocus 后也 emit tab:focused。
    // 池自动激活的新标签页不会触发 pool→focusTab IPC（那是用户点击才发的），
    // 导致 activeEditor context key 永远不更新 → when:"activeEditor == 'xxx'" 过滤掉所有菜单项。
    const u1 = shellEvents.on("tab:create", ({ type, opts }) => {
      const tabId = createTab(type, opts as any);
      if (tabId) shellEvents.emit("tab:focused", { pluginId: type, tabId });
    });
    const u2 = shellEvents.on("tab:openOrFocus", ({ type, opts }) => {
      const tabId = openOrFocusTab(type, opts as any);
      if (tabId) shellEvents.emit("tab:focused", { pluginId: type, tabId });
    });
    const u3 = shellEvents.on("tab:focus", ({ tabId }) => focusTab(tabId));
    const u4 = shellEvents.on("tab:close", ({ tabId }) => closeTab(tabId));
    const u5 = shellEvents.on("tab:focusBySourceId", ({ sourceId }) => focusTabBySourceId(sourceId));
    const u6 = shellEvents.on("tab:updateLabelBySourceId", ({ sourceId, label }) => updateTabLabelBySourceId(sourceId, label));
    const u7 = shellEvents.on("tab:closeBySourceId", ({ sourceId }) => closeTabBySourceId(sourceId));
    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); };
  }, [createTab, openOrFocusTab, focusTab, closeTab, focusTabBySourceId, updateTabLabelBySourceId, closeTabBySourceId]);

  // E5#7h3：mount 时恢复上次保存的标签页布局——ready 守卫：
  // 原 MainContent 在 ready 门控的 JSX 内 mount（initAll 完成后才挂载）；
  // 迁入 App 后此 effect 首轮 mount 就跑，必须等 LayoutService 初始化完成（ready=true）。
  useEffect(() => {
    if (!ready) return;
    try {
      const savedLayout = getTabLayout();
      if (savedLayout?.groups?.length > 0) {
        restoreLayout(savedLayout);
        const all = savedLayout.groups.flatMap((g: { tabs: { id: string; type: string }[] }) => g.tabs);
        syncCountersAfterRestore(all);
      }
    } catch { /* 恢复失败不影响启动 */ }
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // E5#5c：包装 focusTab——emit tab:focused 通知状态栏
  const handleFocusTab = useCallback((tabId: string) => {
    focusTab(tabId);
    for (const g of tabState.groups) {
      const tab = g.tabs.find((t) => t.id === tabId);
      if (tab) {
        shellEvents.emit("tab:focused", { pluginId: tab.pluginId || tab.type, tabId });
        break;
      }
    }
  }, [focusTab, tabState.groups]);

  // E5#5e-ii-f：核心回调——注册到 coreCommands，壳快捷键（Ctrl+W/Ctrl+Tab 等）走这里
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
    closeActiveTab: async () => {
      const group = tabState.groups.find((g) => g.id === tabState.activeGroupId);
      const tab = group?.tabs.find((t) => t.id === group.activeTabId);
      if (!tab) return;
      if (tab.pluginId && !await invokeBeforeCloseTab(tab.pluginId)) return;
      await closeTab(tab.id);
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
    closeAllEditors: () => {
      for (const g of tabState.groups) {
        for (const t of g.tabs) {
          if (t.filePath) closeTab(t.id);
        }
      }
    },
    reopenClosedTab: () => restoreClosedTab(),
    // E5.6#16.7k：池 GroupTabBar ContextMenu 归一化——补三个 CoreCallback
    closeAllTabs: (groupId) => {
      const g = tabState.groups.find((x) => x.id === groupId);
      if (g) for (const t of [...g.tabs]) closeTab(t.id);
    },
    duplicateTab: (tabId) => _duplicateTab(tabId),
    pinTab: (tabId) => pinTab(tabId),
  }), [closeTab, forceCloseTab, splitTab, tabState, handleFocusTab, unsplit, openOrFocusTab, restoreClosedTab, t, _duplicateTab, pinTab]);
  updateCoreCallbacks(coreCallbacks);

  // E5.6#16.5：MainPool tab 操作→壳 useTabManager。
  // 池 GroupTabBar 通过 pool.tabAction() → IPC → 此 handler → tabState 更新 → pushLayout 回环。
  const handleTabAction = useCallback((action: any) => {
    switch (action?.action) {
      case "focusTab":
        handleFocusTab(action.tabId);
        break;
      case "closeTab":
        closeTab(action.tabId);
        break;
      case "closeOtherTabs": {
        // 关闭同 group 内除指定 tab 外的所有 tab
        const g = tabState.groups.find((x) => x.id === action.groupId);
        if (g) {
          for (const t of g.tabs) {
            if (t.id !== action.tabId) closeTab(t.id);
          }
        }
        break;
      }
      case "closeTabsToRight": {
        // 关闭同 group 内指定 tab 右侧的所有 tab
        const g = tabState.groups.find((x) => x.id === action.groupId);
        if (g) {
          const idx = g.tabs.findIndex((t) => t.id === action.tabId);
          if (idx >= 0) {
            for (let i = g.tabs.length - 1; i > idx; i--) {
              closeTab(g.tabs[i].id);
            }
          }
        }
        break;
      }
      case "closeAllTabs": {
        // 关闭指定 group 的所有 tab
        const g = tabState.groups.find((x) => x.id === action.groupId);
        if (g) {
          for (const t of [...g.tabs]) {
            closeTab(t.id);
          }
        }
        break;
      }
      case "reorderTab":
        reorderTab(action.tabId, action.newIndex);
        break;
      case "moveTab":
        moveTab(action.tabId, action.targetGroupId);
        break;
      case "splitTab":
        // E5.6#16.7j-3：splitTabAt 无 solo guard + 支持 zone 精确定位——修复分屏后无法改方向 (d)
        // E5.6#16.7k-2：direction 归一化——右键菜单传 "right"/"down"，拖拽传 zone/horizontal/vertical
        splitTabAt(
          action.tabId,
          action.direction === "vertical" || action.direction === "down" || action.direction === "up"
            ? "vertical"
            : "horizontal",
          action.targetGroupId,
          action.zone ?? (action.direction === "left" || action.direction === "right" || action.direction === "up" || action.direction === "down" ? action.direction : undefined),
        );
        break;
      case "duplicateTab":
        _duplicateTab(action.tabId);
        break;
      case "pinTab":
        pinTab(action.tabId);
        break;
      case "createTab":
        createTab(action.pluginId ?? FALLBACK_PLUGIN_ID, { groupId: action.groupId } as any);
        break;
      // E5.6#16：分隔线拖拽结束（#16.5 后从 pool.sidebarAction 迁到 pool.tabAction）
      case "updateSplitSizes":
        updateSplitSizes(action.anchorGroupId, action.sizes as [number, number], action.branchIndex);
        break;
    }
  }, [focusTab, closeTab, tabState.groups, reorderTab, moveTab, splitTab, splitTabAt, _duplicateTab, pinTab, createTab, updateSplitSizes, handleFocusTab]);

  // E5.6#9a → E5.7#4：Pool 布局同步——tabState/sidebarView 变化 → 全量推送到唯一 Pool
  usePoolSync({ tabState, sidebarView, isSidebarVisible: isSidebarExpanded, onTabAction: handleTabAction });

  // E5#5e-ii-d：布局持久化——App 拥有 tabState，自己负责保存
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutInitialized = useRef(false);
  const tabStateRef = useRef(tabState);
  tabStateRef.current = tabState;

  // beforeunload——F5 刷新/关闭窗口时同步写入
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
        syncWriteWorkspaceFolders(); // E5.5#0e：退出/刷新时同步保存工作区文件夹列表
      } catch { /* 静默 */ }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  // 100ms 防抖保存——标签页/分屏变更后自动持久化
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
      }).catch((e) => { console.error("[App] 保存标签页布局失败:", e); });
    };
    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(doSave, 100);
    return () => {
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    };
  }, [tabState.groups, tabState.activeGroupId, tabState.root]);

  if (!ready) return null;

  return (
    <div className="app-shell">
      <SourceStateContext.Provider value={sourceStateValue}>
        {/* E5.7#9：壳 DOM 全删——TitleBar(#5)/IconBar(#6)/StatusBar(#8) 已迁池内 zone，
            MainContent/WindowControls/SplitHandles 删除。壳 = 纯状态持有者
            （tabState/Registry/命令执行），WCV 满窗覆盖壳渲染进程（#12.5），无可见 DOM。 */}
        {/* E5.7#4：#12 提前——SidePanel 保留隐藏挂载：icon:selected →
            sidebar:containerChanged/sidebar:toggled 事件管线是壳侧栏状态的唯一入口
            （Phase 3 #10 SidebarZone 接管后删除）。width 只影响不可见内部——
            280 兜底 = LayoutEngine 侧栏 zone 默认宽（首帧喂尺寸前 getBounds 为 undefined）。 */}
        <div style={{ display: "none" }}>
          <SidePanel width={layoutEngine.getBounds("sidebar")?.width ?? 280} />
        </div>
        <ToastContainer />
        <ProgressBar />
        {/* E5.5#7-p12：归一化——所有 QuickPick 浮层共用一个组件 */}
        {quickPickState && (
          <QuickPick
            open={quickPickState.open}
            onClose={quickPickState.onClose}
            items={quickPickState.items}
            placeholder={quickPickState.placeholder}
            prefix={quickPickState.prefix}
            getSearchText={quickPickState.getSearchText}
            getKey={quickPickState.getKey}
            onSelect={quickPickState.onSelect}
            onHighlight={quickPickState.onHighlight}
            renderLabel={quickPickState.renderLabel}
            renderCategory={quickPickState.renderCategory}
            renderDetail={quickPickState.renderDetail}
            renderDetailRight={quickPickState.renderDetailRight}
            renderItemActions={quickPickState.renderItemActions}
          />
        )}
        <ConfirmDialog />
      </SourceStateContext.Provider>
    </div>
  );
}

export default App;
