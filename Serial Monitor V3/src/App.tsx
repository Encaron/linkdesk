import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTabManager, type TabType } from "./hooks/useTabManager";
import IconBar from "./components/IconBar";
import SidePanel from "./components/SidePanel";
import MainContent from "./components/MainContent";
import TabBar from "./components/TabBar";
import TopBar from "./components/TopBar";
import StatusBar from "./components/StatusBar";
import PreferenceService, { initPrefs } from "./core/PreferenceService";
import { TerminalPrefsContext, defaultTerminalPrefs, type TerminalPrefs } from "./core/TerminalPrefsContext";
import { loadTheme, applyTheme } from "./core/ThemeEngine";
import "./App.css";

// 保留 ViewId 用于向后兼容 IconBar（Phase 3 过渡期）
export type ViewId = "terminal" | "workspace" | "settings";

interface PortInfo {
  name: string;
  description: string;
}

function App() {
  const [ready, setReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [terminalPrefs, setTerminalPrefs] = useState<TerminalPrefs>({ ...defaultTerminalPrefs });
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [portName, setPortName] = useState("COM3");
  const [baudRate, setBaudRate] = useState("115200");
  const [txBytes, setTxBytes] = useState(0);
  const [rxBytes, setRxBytes] = useState(0);

  // Phase 3: 标签页状态管理
  const {
    tabState,
    openOrFocusTab,
    focusTab,
    closeTab,
    forceCloseTab,
    createTab,
    splitTab,
    unsplit,
    updateSplitSizes,
    restoreLayout,
  } = useTabManager();

  // 当前活跃标签页的类型（用于 IconBar 高亮 + SidePanel 联动）
  const activeTab = useMemo(
    () => tabState.tabs.find((t) => t.id === tabState.activeTabId),
    [tabState.tabs, tabState.activeTabId]
  );
  const activeTabType: TabType | undefined = activeTab?.type;

  /* ---- 启动初始化 ---- */
  useEffect(() => {
    initPrefs().then((prefs) => {
      loadTheme(prefs.theme || "Dark")
        .then(applyTheme)
        .catch(() => { /* CSS fallback 生效 */ });

      setTerminalPrefs({ ...defaultTerminalPrefs, ...prefs.preferences });
      setPortName(prefs.lastPort || "COM3");

      // Phase 3: 恢复布局（§11.3）
      try {
        const savedLayout = (prefs as any).layout;
        if (savedLayout && savedLayout.tabs) {
          restoreLayout(savedLayout);
        }
      } catch { /* 布局恢复失败不影响启动 */ }

      setReady(true);
    });
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

  /* ---- 图标栏 → 打开/聚焦标签页（Phase 3 §6.2） ---- */
  const handleIconClick = useCallback(
    (type: string) => {
      openOrFocusTab(type as TabType);
    },
    [openOrFocusTab]
  );

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
    } catch (e) {
      console.error("串口操作失败:", e);
    }
  }, [isOpen, portName, baudRate]);

  const handleBaudChange = useCallback(async (newBaud: string) => {
    setBaudRate(newBaud);
    if (isOpen) {
      try {
        await invoke("close_port");
        await invoke("open_port", { portName, baudRate: parseInt(newBaud) });
      } catch (e) {
        console.error("波特率切换失败:", e);
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
      } catch (e) {
        console.error("端口切换失败:", e);
        setIsOpen(false);
      }
    }
  }, [isOpen, baudRate]);

  // 终端设置变更 → 持久化
  useEffect(() => {
    try {
      const prefs = PreferenceService.loadPrefs();
      prefs.preferences = terminalPrefs as any;
      PreferenceService.savePrefs(prefs).catch(() => {});
    } catch { /* 静默 */ }
  }, [terminalPrefs]);

  // lastPort 变更 → 持久化
  useEffect(() => {
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

  // Phase 3: 布局持久化——保存到 prefs.json（§11）
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const layoutInitialized = useRef(false);

  useEffect(() => {
    // 跳过首次渲染（restoreLayout 会设置初始状态）
    if (!layoutInitialized.current) {
      layoutInitialized.current = true;
      return;
    }

    const saveLayout = () => {
      try {
        const prefs = PreferenceService.loadPrefs();
        (prefs as any).layout = {
          tabs: tabState.tabs.map((t) => ({
            id: t.id,
            type: t.type,
            label: t.label,
            workspaceName: t.workspaceName,
          })),
          activeTabId: tabState.activeTabId,
          split: tabState.split,
        };
        PreferenceService.savePrefs(prefs).catch(() => {});
      } catch { /* 静默 */ }
    };

    // tabs 和 split 变化 → 立即保存
    // activeTabId 变化 → 500ms 防抖
    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(saveLayout, 500);
    return () => {
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    };
  }, [tabState.tabs, tabState.activeTabId, tabState.split]);

  // Phase 3: 全局键盘快捷键（§10.5）
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Ctrl+W: 关闭当前标签页
      if (e.ctrlKey && e.key === "w") {
        e.preventDefault();
        const result = closeTab(tabState.activeTabId);
        if (!result.closed && result.reason === "dirty") {
          // dirty 标签页——弹出确认后强制关闭
          // Phase 3: 简单的 window.confirm，Phase 6 替换为自定义对话框
          const tab = tabState.tabs.find((t) => t.id === result.tabId);
          if (tab && window.confirm(`「${tab.label}」有未保存的修改，确定关闭？`)) {
            forceCloseTab(result.tabId);
          }
        }
      }
      // Ctrl+Tab: 下一个标签页
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault();
        const idx = tabState.tabs.findIndex((t) => t.id === tabState.activeTabId);
        if (idx !== -1) {
          const next = e.shiftKey ? idx - 1 : idx + 1;
          const target = tabState.tabs[(next + tabState.tabs.length) % tabState.tabs.length];
          focusTab(target.id);
        }
      }
      // Ctrl+\: 分屏切换（toggle）
      if (e.ctrlKey && e.key === "\\") {
        e.preventDefault();
        if (tabState.split) {
          unsplit();
        } else {
          // 找到当前标签页之后的下一个标签页作为分屏目标
          const idx = tabState.tabs.findIndex((t) => t.id === tabState.activeTabId);
          const next = tabState.tabs[(idx + 1) % tabState.tabs.length];
          if (next && next.id !== tabState.activeTabId) {
            splitTab(next.id, "horizontal");
          }
        }
      }
      // Ctrl+1~9: 跳转到第 N 个标签页
      const num = parseInt(e.key);
      if (e.ctrlKey && num >= 1 && num <= 9 && tabState.tabs[num - 1]) {
        e.preventDefault();
        focusTab(tabState.tabs[num - 1].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tabState, closeTab, forceCloseTab, focusTab, splitTab, unsplit]);

  if (!ready) return null;

  return (
    <div className="app-shell">
      <TopBar
        ports={ports}
        portName={portName}
        baudRate={baudRate}
        isOpen={isOpen}
        onToggleOpen={handleToggleOpen}
        onPortChange={handlePortChange}
        onBaudChange={handleBaudChange}
      />
      {/* Phase 3: 标签栏 */}
      <TabBar
        tabs={tabState.tabs}
        activeTabId={tabState.activeTabId}
        split={tabState.split}
        onFocusTab={focusTab}
        onCloseTab={closeTab}
        onCreateTab={createTab}
        onSplitTab={splitTab}
      />
      <TerminalPrefsContext.Provider value={{ prefs: terminalPrefs, setPrefs: setTerminalPrefs }}>
      <div className="app-body">
        <IconBar
          activeTabType={activeTabType ?? "terminal"}
          onOpenOrFocus={handleIconClick}
        />
        <SidePanel
          ref={sidebarRef}
          activeTabType={activeTabType ?? "terminal"}
          width={sidebarWidth}
        />
        <div className="sidebar-resize-handle" onMouseDown={onResizeMouseDown} />
        <MainContent tabState={tabState} onSplitResize={updateSplitSizes} />
      </div>
      </TerminalPrefsContext.Provider>
      <StatusBar isOpen={isOpen} txBytes={txBytes} rxBytes={rxBytes} />
    </div>
  );
}

export default App;
