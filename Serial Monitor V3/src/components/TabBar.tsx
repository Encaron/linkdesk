/**
 * TabBar — 标签栏组件。
 * Phase 3 Step 2+9：标签页列表 + [+] 菜单 + 右键上下文菜单。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §2.2, §10.4]
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { Tab, TabType, SplitLayout } from "../hooks/useTabManager";
import "./TabBar.css";

/* ── 图标映射 ── */

const TYPE_ICON: Record<TabType, string> = {
  terminal: "\u{1F4DF}",  // 📟
  workspace: "\u{1F4CA}", // 📊
  settings: "\u{2699}\u{FE0F}",   // ⚙️
  oled: "\u{1F3A8}",      // 🎨
};

/* ── Props ── */

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  split: SplitLayout | null;
  onFocusTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (type: TabType, workspaceName?: string) => void;
  onSplitTab?: (tabId: string, direction: "horizontal" | "vertical") => void;
}

/* ── [+] 弹出菜单 ── */

function PlusMenu({
  isOpen,
  onClose,
  onCreateTab,
  buttonRef,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreateTab: (type: TabType, workspaceName?: string) => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  if (!isOpen) return null;

  const items: { label: string; type: TabType }[] = [
    { label: "新建终端", type: "terminal" },
    { label: "新建工作台", type: "workspace" },
  ];

  return (
    <>
      <div className="tab-plus-backdrop" onClick={onClose} />
      <div
        className="tab-plus-menu"
        style={{
          position: "fixed",
          top: (buttonRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
          left: (buttonRef.current?.getBoundingClientRect().left ?? 0) - 80,
        }}
      >
        {items.map((item) => (
          <button
            key={item.type}
            className="tab-plus-menu-item"
            onClick={() => {
              onCreateTab(item.type);
              onClose();
            }}
          >
            {TYPE_ICON[item.type]} {item.label}
          </button>
        ))}
      </div>
    </>
  );
}

/* ── 右键上下文菜单 ── */

interface ContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

function ContextMenu({
  state,
  tabs,
  split,
  onClose,
  onCloseTab,
  onSplitTab,
}: {
  state: ContextMenuState;
  tabs: Tab[];
  split: SplitLayout | null;
  onClose: () => void;
  onCloseTab: (tabId: string) => void;
  onSplitTab?: (tabId: string, direction: "horizontal" | "vertical") => void;
}) {
  const tab = tabs.find((t) => t.id === state.tabId);
  if (!tab) return null;

  const tabIndex = tabs.findIndex((t) => t.id === state.tabId);
  const hasOthers = tabs.length > 1;
  const hasRight = tabIndex < tabs.length - 1;
  const canSplit = !split;

  const items: { label: string; action: () => void; disabled?: boolean }[] = [
    {
      label: "关闭",
      action: () => onCloseTab(state.tabId),
    },
    {
      label: "关闭其他",
      action: () => {
        tabs
          .filter((t) => t.id !== state.tabId)
          .forEach((t) => onCloseTab(t.id));
      },
      disabled: !hasOthers,
    },
    {
      label: "关闭右侧",
      action: () => {
        tabs
          .slice(tabIndex + 1)
          .forEach((t) => onCloseTab(t.id));
      },
      disabled: !hasRight,
    },
    { label: "", action: () => {}, disabled: true }, // divider
    {
      label: "向下分屏",
      action: () => onSplitTab?.(state.tabId, "vertical"),
      disabled: !canSplit,
    },
    {
      label: "向右分屏",
      action: () => onSplitTab?.(state.tabId, "horizontal"),
      disabled: !canSplit,
    },
  ];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <>
      <div className="tab-context-backdrop" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="tab-context-menu"
        style={{ position: "fixed", left: state.x, top: state.y }}
      >
        {items.map((item, i) =>
          item.label === "" ? (
            <div key={i} className="tab-context-divider" />
          ) : (
            <button
              key={i}
              className={`tab-context-item${item.disabled ? " disabled" : ""}`}
              disabled={item.disabled}
              onClick={() => { item.action(); onClose(); }}
            >
              {item.label}
            </button>
          )
        )}
      </div>
    </>
  );
}

/* ── 组件 ── */

export default function TabBar({
  tabs,
  activeTabId,
  split,
  onFocusTab,
  onCloseTab,
  onCreateTab,
  onSplitTab,
}: TabBarProps) {
  const [plusOpen, setPlusOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const plusRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 点击外部关闭 [+] 菜单
  useEffect(() => {
    if (!plusOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlusOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plusOpen]);

  // 滚轮横向滚动
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  // 确定分屏标记
  const paneIds = split ? new Set(split.tabIds) : null;

  return (
    <div className="tab-bar">
      <div className="tab-list" ref={scrollRef} onWheel={onWheel}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const inSplit = paneIds?.has(tab.id);
          const isSplitActive = inSplit && !isActive;

          return (
            <div
              key={tab.id}
              className={`tab-item${isActive ? " active" : ""}${isSplitActive ? " split-inactive" : ""}`}
              title={tab.label}
              onClick={() => onFocusTab(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
              }}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
            >
              {tab.dirty && <span className="tab-dirty-dot">●</span>}
              <span className="tab-icon">{TYPE_ICON[tab.type]}</span>
              <span className="tab-label">{tab.label}</span>
              {tab.closable && (
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  title="关闭"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        <button
          ref={plusRef}
          className={`tab-plus-btn${plusOpen ? " open" : ""}`}
          onClick={() => setPlusOpen(!plusOpen)}
          title="新建标签页"
        >
          +
        </button>
      </div>

      <PlusMenu
        isOpen={plusOpen}
        onClose={() => setPlusOpen(false)}
        onCreateTab={onCreateTab}
        buttonRef={plusRef}
      />

      {contextMenu && (
        <ContextMenu
          state={contextMenu}
          tabs={tabs}
          split={split}
          onClose={() => setContextMenu(null)}
          onCloseTab={onCloseTab}
          onSplitTab={onSplitTab}
        />
      )}
    </div>
  );
}
