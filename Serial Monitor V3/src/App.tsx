import { useState, useCallback, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import IconBar from "./components/IconBar";
import SidePanel from "./components/SidePanel";
import MainContent from "./components/MainContent";
import TopBar from "./components/TopBar";
import StatusBar from "./components/StatusBar";
import { TerminalPrefsContext, defaultTerminalPrefs, type TerminalPrefs } from "./core/TerminalPrefsContext";
import "./App.css";

export type ViewId = "terminal" | "workspace" | "settings";

function App() {
  const [activeView, setActiveView] = useState<ViewId>("terminal");
  const [lastContentView, setLastContentView] = useState<ViewId>("terminal");
  const [isOpen, setIsOpen] = useState(false);
  const [terminalPrefs, setTerminalPrefs] = useState<TerminalPrefs>(defaultTerminalPrefs);

  /* ---- 侧栏拖拽调整宽度（直接操作 DOM，不经过 React） ---- */
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
      // 只在松手时同步一次 React state
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

  /* ---- 视图切换 ---- */
  const handleViewChange = (view: ViewId) => {
    if (view === "settings") {
      setActiveView("settings");
    } else {
      setLastContentView(view);
      setActiveView(view);
    }
  };

  const contentView = activeView === "settings" ? lastContentView : activeView;

  return (
    <div className="app-shell">
      <TopBar
        portName="COM3"
        baudRate="115200"
        isOpen={isOpen}
        onToggleOpen={async () => {
          try {
            if (isOpen) {
              await invoke("close_port");
            } else {
              await invoke("open_port", { portName: "COM3", baudRate: 115200 });
            }
            setIsOpen(!isOpen);
          } catch (e) {
            console.error("串口操作失败:", e);
          }
        }}
      />
      <TerminalPrefsContext.Provider value={{ prefs: terminalPrefs, setPrefs: setTerminalPrefs }}>
      <div className="app-body">
        <IconBar activeView={activeView} onViewChange={handleViewChange} />
        <SidePanel
          ref={sidebarRef}
          activeView={activeView}
          contentView={contentView}
          width={sidebarWidth}
        />
        <div className="sidebar-resize-handle" onMouseDown={onResizeMouseDown} />
        <MainContent activeView={activeView} />
      </div>
      </TerminalPrefsContext.Provider>
      <StatusBar isOpen={isOpen} txBytes={1234} rxBytes={56789} />
    </div>
  );
}

export default App;
