/**
 * TabBar — 标签栏组件。
 * Phase 3 Step 2：接收 TabState 的核心字段 + 回调，渲染标签页列表。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §2.2]
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { Tab, TabType, SplitLayout } from "../hooks/useTabManager";
import "./TabBar.css";

/* ── 图标映射 ── */

const TYPE_ICON: Record<TabType, string> = {
  terminal: "📟",
  workspace: "📊",
  settings: "⚙",
  oled: "🎨",
};

/* ── Props ── */

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  split: SplitLayout | null;
  onFocusTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (type: TabType, workspaceName?: string) => void;
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

  const items: { label: string; type: TabType; workspaceName?: string }[] = [
    { label: "新建终端", type: "terminal" },
    { label: "新建工作台", type: "workspace" },
    // Phase 4: { label: "打开 workspace 文件", type: "workspace" } — 需文件选择器
  ];

  return (
    <>
      {/* 遮罩——点击关闭 */}
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
            key={item.type + (item.workspaceName ?? "")}
            className="tab-plus-menu-item"
            onClick={() => {
              onCreateTab(item.type, item.workspaceName);
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

/* ── 组件 ── */

export default function TabBar({
  tabs,
  activeTabId,
  split,
  onFocusTab,
  onCloseTab,
  onCreateTab,
}: TabBarProps) {
  const [plusOpen, setPlusOpen] = useState(false);
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

  // 确定分屏标记：哪些 tabIds 在面板中
  const paneIds = split ? new Set(split.tabIds) : null;

  return (
    <div className="tab-bar">
      <div className="tab-list" ref={scrollRef} onWheel={onWheel}>
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          // 分屏标记：在面板中且活跃 → "active split"，在面板中但不活跃 → "inactive split"
          const inSplit = paneIds?.has(tab.id);
          const isSplitActive = inSplit && !isActive;

          return (
            <div
              key={tab.id}
              className={`tab-item${isActive ? " active" : ""}${isSplitActive ? " split-inactive" : ""}`}
              title={tab.label}
              onClick={() => onFocusTab(tab.id)}
              onMouseDown={(e) => {
                // 中键关闭
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
            >
              {/* dirty 标记 */}
              {tab.dirty && <span className="tab-dirty-dot">●</span>}

              {/* 图标 */}
              <span className="tab-icon">{TYPE_ICON[tab.type]}</span>

              {/* 标题 */}
              <span className="tab-label">{tab.label}</span>

              {/* 关闭按钮 */}
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

        {/* [+] 按钮 */}
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
    </div>
  );
}
