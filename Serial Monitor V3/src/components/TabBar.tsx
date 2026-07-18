/**
 * TabBar — 标签栏组件。
 * Phase 3 v4：每个面板独立渲染自己的标签栏，接收 TabGroup。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §2.2, §4.2]
 */

import { useState, useRef, useEffect, useCallback } from "react";
import type { Tab, TabType, TabGroup } from "../hooks/useTabManager";
import { detectDropZone } from "../hooks/tabDragTypes";
import "./TabBar.css";

/* ── 图标映射 ── */

const TYPE_ICON: Record<string, string> = {
  terminal: "\u{1F4DF}",
  workspace: "\u{1F4CA}",
  settings: "\u{2699}\u{FE0F}",
  oled: "\u{1F3A8}",
  editor: "\u{1F4DD}",
};

/* ── Props ── */

interface TabBarProps {
  group: TabGroup;
  isActiveGroup: boolean;
  onFocusTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (type: TabType, opts?: any) => string;
  onSplitTab?: (tabId: string, direction: "horizontal" | "vertical") => void;
  onMoveTab?: (tabId: string) => void;
  onReorderTab?: (tabId: string, toIndex: number) => void;
  onDropSplit?: (tabId: string, zone: "left" | "right" | "up" | "down") => void;
  editorAreaRef?: React.RefObject<HTMLDivElement | null>;
  dragDropZone?: "left" | "right" | "up" | "down" | "center" | null;
  onDragDropZone?: (zone: "left" | "right" | "up" | "down" | "center" | null) => void;
  isDragging?: boolean;
  onDraggingChange?: (v: boolean) => void;
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
  onClose,
  onCloseTab,
  onSplitTab,
}: {
  state: ContextMenuState;
  tabs: Tab[];
  onClose: () => void;
  onCloseTab: (tabId: string) => void;
  onSplitTab?: (tabId: string, direction: "horizontal" | "vertical") => void;
}) {
  const tab = tabs.find((t) => t.id === state.tabId);
  if (!tab) return null;

  const tabIndex = tabs.findIndex((t) => t.id === state.tabId);
  const hasOthers = tabs.length > 1;
  const hasRight = tabIndex < tabs.length - 1;
  const canSplit = tabs.length > 1; // v4: 由 reducer 判断是否已分屏

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
  group,
  isActiveGroup: _isActiveGroup,
  onFocusTab,
  onCloseTab,
  onCreateTab,
  onSplitTab,
  onMoveTab: _onMoveTab,
  onReorderTab,
  onDropSplit,
  editorAreaRef,
  onDragDropZone,
  onDraggingChange,
}: TabBarProps) {
  const { tabs, activeTabId } = group;
  const [plusOpen, setPlusOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const plusRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 进出动画状态
  const [enteringTabId, setEnteringTabId] = useState<string | null>(null);
  const [exitingTabId, setExitingTabId] = useState<string | null>(null);
  const prevTabIds = useRef(new Set<string>(tabs.map((t) => t.id)));

  // 检测新标签页 → 播放进入动画
  useEffect(() => {
    const currentIds = new Set(tabs.map((t) => t.id));
    for (const id of currentIds) {
      if (!prevTabIds.current.has(id)) {
        setEnteringTabId(id);
        const timer = setTimeout(() => setEnteringTabId(null), 150);
        prevTabIds.current = currentIds;
        return () => clearTimeout(timer);
      }
    }
    prevTabIds.current = currentIds;
  }, [tabs]);

  // 关闭标签页（带动画）
  const closeWithAnimation = useCallback(
    (tabId: string) => {
      // 终端保底：[×] 清空接收区
      if (tabs.length === 1 && tabs[0].type === "terminal") {
        window.dispatchEvent(new CustomEvent("v3-clear-terminal"));
        return;
      }
      setExitingTabId(tabId);
      setTimeout(() => {
        onCloseTab(tabId);
        setExitingTabId(null);
      }, 120);
    },
    [tabs, onCloseTab]
  );

  // 拖拽重排状态
  const dragState = useRef<{
    tabId: string;
    fromIndex: number;
    toIndex: number;
    startX: number;
    startY: number;
    phase: "idle" | "reorder" | "split";
    _lifted: boolean;
  }>({ tabId: "", fromIndex: -1, toIndex: -1, startX: 0, startY: 0, phase: "idle", _lifted: false });
  const [dragInsertIndex, setDragInsertIndex] = useState<number | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);

  // 拖拽分屏预览位置
  const [previewPos, setPreviewPos] = useState<{ x: number; y: number } | null>(null);

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

  // 拖拽重排 + 分屏——window 级别事件监听
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (dragState.current.phase === "idle") return;

      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;

      // 移动距离不足阈值 → 不启动拖拽
      if (dragState.current.phase === "reorder" && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;

      // 首次超过阈值 → 把标签页"拎起来"（对标 VS Code: 移动后才开始拖拽）
      if (dragState.current.phase === "reorder" && !dragState.current._lifted) {
        dragState.current._lifted = true;
        setDraggingTabId(dragState.current.tabId);
      }

      // 垂直拖拽超过阈值 → 切换到分屏模式
      if (dragState.current.phase === "reorder" && Math.abs(dy) > 15) {
        dragState.current.phase = "split";
        onDraggingChange?.(true);
        setDragInsertIndex(null);
      }

      // ── 分屏模式 ──
      if (dragState.current.phase === "split") {
        setPreviewPos({ x: e.clientX, y: e.clientY });

        // 鼠标在另一个标签栏上？→ 不显示毛玻璃（准备移动/插入）
        let overOtherBar = false;
        const allBars = document.querySelectorAll(".tab-bar");
        for (const bar of allBars) {
          if (bar === scrollRef.current?.parentElement) continue;
          const barRect = bar.getBoundingClientRect();
          if (e.clientX >= barRect.left && e.clientX <= barRect.right &&
              e.clientY >= barRect.top && e.clientY <= barRect.bottom) {
            overOtherBar = true;
            break;
          }
        }
        // 也在自己的标签栏上？
        const ownBar = scrollRef.current?.parentElement;
        if (ownBar) {
          const ownRect = ownBar.getBoundingClientRect();
          if (e.clientX >= ownRect.left && e.clientX <= ownRect.right &&
              e.clientY >= ownRect.top && e.clientY <= ownRect.bottom) {
            overOtherBar = true;
          }
        }

        if (overOtherBar) {
          onDragDropZone?.(null); // 不显示毛玻璃
        } else {
          const areaRect = editorAreaRef?.current?.getBoundingClientRect();
          if (areaRect) {
            const zone = detectDropZone(e.clientX, e.clientY, areaRect);
            onDragDropZone?.(zone);
          }
        }
        return;
      }

      // ── 重排模式 ──
      if (!scrollRef.current) return;
      const tabElements = scrollRef.current.querySelectorAll<HTMLElement>(".tab-item");
      const scrollRect = scrollRef.current.getBoundingClientRect();
      const mouseX = e.clientX - scrollRect.left + scrollRef.current.scrollLeft;

      let insertIdx = tabs.length;
      for (let i = 0; i < tabElements.length; i++) {
        const rect = tabElements[i].getBoundingClientRect();
        const midX = rect.left - scrollRect.left + scrollRef.current.scrollLeft + rect.width / 2;
        if (mouseX < midX) { insertIdx = i; break; }
      }
      if (insertIdx > dragState.current.fromIndex) insertIdx--;

      dragState.current.toIndex = insertIdx;
      setDragInsertIndex(insertIdx);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (dragState.current.phase === "idle") return;

      if (dragState.current.phase === "split") {
        // 先检查是否放到了另一个面板的标签栏上
        let movedToOtherBar = false;
        if (_onMoveTab) {
          const otherBars = document.querySelectorAll(".tab-bar");
          for (const bar of otherBars) {
            if (bar === scrollRef.current?.parentElement) continue; // 跳过自己的标签栏
            const barRect = bar.getBoundingClientRect();
            if (e.clientX >= barRect.left && e.clientX <= barRect.right &&
                e.clientY >= barRect.top && e.clientY <= barRect.bottom) {
              _onMoveTab(dragState.current.tabId);
              movedToOtherBar = true;
              break;
            }
          }
        }
        if (!movedToOtherBar) {
          const areaRect = editorAreaRef?.current?.getBoundingClientRect();
          let zone: "left" | "right" | "up" | "down" | "center" | null = null;
          if (areaRect) {
            zone = detectDropZone(e.clientX, e.clientY, areaRect);
          }
          if (zone && zone !== "center" && onDropSplit) {
            onDropSplit(dragState.current.tabId, zone);
          }
        }
        onDragDropZone?.(null);
        onDraggingChange?.(false);
        setPreviewPos(null);
        dragState.current.phase = "idle";
        setDraggingTabId(null);
        return;
      }

      // 重排模式
      const { tabId, toIndex } = dragState.current;
      if (toIndex >= 0 && toIndex !== dragState.current.fromIndex) {
        onReorderTab?.(tabId, toIndex);
      }
      dragState.current.phase = "idle";
      setDragInsertIndex(null);
      setDraggingTabId(null);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragState.current.phase === "split") {
        dragState.current.phase = "idle";
        onDragDropZone?.(null);
        onDraggingChange?.(false);
        setPreviewPos(null);
        setDraggingTabId(null);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [tabs, onReorderTab, onDropSplit, editorAreaRef, onDragDropZone, onDraggingChange]);

  return (
    <div className="tab-bar">
      <div className="tab-list" ref={scrollRef} onWheel={onWheel}>
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isDragging = draggingTabId === tab.id;
          const isEntering = enteringTabId === tab.id;
          const isExiting = exitingTabId === tab.id;

          return (
            <>
              {/* 拖拽插入指示器 */}
              {dragInsertIndex === idx && draggingTabId !== tab.id && (
                <div className="tab-drop-indicator" key={`indicator-${idx}`} />
              )}
              <div
                key={tab.id}
                className={`tab-item${isActive ? " active" : ""}${isDragging ? " dragging" : ""}${isEntering ? " entering" : ""}${isExiting ? " exiting" : ""}`}
                title={tab.label}
                onClick={() => onFocusTab(tab.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY });
                }}
                onMouseDown={(e) => {
                  if (e.button === 1) {
                    e.preventDefault();
                    closeWithAnimation(tab.id);
                    return;
                  }
                  if (e.button === 0 && onReorderTab) {
                    // 左键：开始拖拽重排
                    dragState.current = {
                      tabId: tab.id,
                      fromIndex: idx,
                      toIndex: idx,
                      startX: e.clientX,
                      startY: e.clientY,
                      phase: "reorder",
                    };
                    // 不立即设 draggingTabId——等鼠标移动超阈值再"拎起来"（对标 VS Code）
                    setDragInsertIndex(idx);
                  }
                }}
              >
                {tab.dirty && <span className="tab-dirty-dot">●</span>}
                <span className="tab-icon">{TYPE_ICON[tab.type]}</span>
                <span className="tab-label">{tab.label}</span>
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeWithAnimation(tab.id);
                  }}
                  title={tabs.length === 1 && tab.type === "terminal" ? "清空接收区" : "关闭"}
                >
                  ×
                </button>
              </div>
            </>
          );
        })}
        {/* 最后一个位置之后的插入指示器 */}
        {dragInsertIndex === tabs.length && (
          <div className="tab-drop-indicator" />
        )}

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
          onClose={() => setContextMenu(null)}
          onCloseTab={onCloseTab}
          onSplitTab={onSplitTab}
        />
      )}

      {/* 拖拽预览：克隆标签页外观——图标+文字+关闭按钮（VS Code 风格） */}
      {previewPos && draggingTabId && (() => {
        const tab = tabs.find((t) => t.id === draggingTabId);
        if (!tab) return null;
        return (
          <div
            className="tab-drag-preview"
            style={{
              position: "fixed",
              left: previewPos.x - 50,
              top: previewPos.y - 14,
              pointerEvents: "none",
              zIndex: 200,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span className="tab-icon" style={{ flexShrink: 0, fontSize: 13, opacity: 0.8 }}>
              {TYPE_ICON[tab.type] ?? ""}
            </span>
            <span className="tab-label">{tab.label}</span>
          </div>
        );
      })()}
    </div>
  );
}
