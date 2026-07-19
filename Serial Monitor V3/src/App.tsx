import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useTabManager, allTabs, type TabType } from "./hooks/useTabManager";
import { getAllLeafGroupIds } from "./hooks/splitTree";
import { type DropZone } from "./hooks/tabDragTypes";
import IconBar from "./components/IconBar";
import SidePanel from "./components/SidePanel";
import MainContent from "./components/MainContent";
import TopBar from "./components/TopBar";
import StatusBar from "./components/StatusBar";
import PreferenceService, { initPrefs } from "./core/PreferenceService";
import { TerminalPrefsContext, defaultTerminalPrefs, type TerminalPrefs } from "./core/TerminalPrefsContext";
import { loadTheme, applyTheme } from "./core/ThemeEngine";
import i18n from "./i18n";
import "./App.css";

// 保留 ViewId 用于向后兼容 IconBar（Phase 3 过渡期）
export type ViewId = "terminal" | "workspace" | "settings";

interface PortInfo {
  name: string;
  description: string;
}

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
  } = useTabManager();

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
  const activeTabType: TabType | undefined = activeTab?.type;

  /* ---- 启动初始化 ---- */
  useEffect(() => {
    initPrefs().then((prefs) => {
      loadTheme(prefs.theme || "Dark")
        .then(applyTheme)
        .catch(() => { /* CSS fallback 生效 */ });
      setTheme((prefs.theme as "Dark" | "Light") || "Dark");

      const lang = prefs.language || "zh";
      setLang(lang);
      i18n.changeLanguage(lang);

      setTerminalPrefs({ ...defaultTerminalPrefs, ...prefs.preferences });
      setPortName(prefs.lastPort || "COM3");

      // Phase 3: 恢复布局（§11.3）
      try {
        const savedLayout = prefs.layout;
        if (savedLayout?.groups) {
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

  /* ---- 主题/语言切换 ---- */
  const handleToggleTheme = useCallback(() => {
    const next = theme === "Dark" ? "Light" : "Dark";
    setTheme(next);
    loadTheme(next).then(applyTheme).catch(() => {});
    try { const p = PreferenceService.loadPrefs(); p.theme = next; PreferenceService.savePrefs(p).catch(() => {}); } catch {}
  }, [theme]);

  const handleToggleLang = useCallback(() => {
    const next = lang === "zh" ? "en" : "zh";
    setLang(next);
    i18n.changeLanguage(next);
    try { const p = PreferenceService.loadPrefs(); p.language = next; PreferenceService.savePrefs(p).catch(() => {}); } catch {}
  }, [lang]);

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

  // Phase 3 v4: 布局持久化
  useEffect(() => {
    if (!layoutInitialized.current) {
      layoutInitialized.current = true;
      return;
    }

    const saveLayout = () => {
      try {
        const prefs = PreferenceService.loadPrefs();
        prefs.layout = {
          groups: tabState.groups.map((g) => ({
            id: g.id,
            tabs: g.tabs.map((t) => ({
              id: t.id, type: t.type, label: t.label, dirty: t.dirty,
              workspaceName: t.workspaceName, filePath: t.filePath,
            })),
            activeTabId: g.activeTabId,
          })),
          activeGroupId: tabState.activeGroupId,
          root: tabState.root,
        };
        PreferenceService.savePrefs(prefs).catch(() => {});
      } catch { /* 静默 */ }
    };

    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(saveLayout, 500);
    return () => {
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    };
  }, [tabState.groups, tabState.activeGroupId, tabState.root]);

  // Phase 3: 全局键盘快捷键（§10.5）
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
            focusTab(target.id);
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
        focusTab(all[num - 1].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [tabState, activeTab, closeTab, forceCloseTab, focusTab, splitTab, unsplit]);

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
        theme={theme}
        lang={lang}
        onToggleTheme={handleToggleTheme}
        onToggleLang={handleToggleLang}
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
        {/* Phase 3 v4: 编辑器区域——每个面板独立标签栏（在 MainContent 内部渲染） */}
        <div className="editor-area" ref={editorAreaRef}>
          <MainContent
            tabState={tabState}
            activeGroupId={tabState.activeGroupId}
            onFocusTab={focusTab}
            onCloseTab={closeTab}
            onCreateTab={createTab}
            onSplitTab={splitTab}
            onMoveTab={moveTab}
            onReorderTab={reorderTab}
            onDropSplit={handleDropSplit}
            onDropCopySplit={handleDropCopySplit}
            onSplitResize={updateSplitSizes}
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
      </TerminalPrefsContext.Provider>
      <StatusBar isOpen={isOpen} txBytes={txBytes} rxBytes={rxBytes} />
    </div>
  );
}

export default App;
