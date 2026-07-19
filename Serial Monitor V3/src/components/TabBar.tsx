/**
 * TabBar — 标签栏组件。
 * Phase 3 v4：每个面板独立渲染自己的标签栏，接收 TabGroup。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §2.2, §4.2]
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Tab, TabGroup } from "../hooks/useTabManager";
import { detectDropZone } from "../hooks/tabDragTypes";
import { useDragReorder } from "../hooks/useDragReorder";
import "./TabBar.css";

/* ── 图标映射 ── */

const TYPE_ICON: Record<string, string> = {
  terminal: "\u{1F4DF}",
  workspace: "\u{1F4CA}",
  settings: "\u{2699}\u{FE0F}",
  oled: "\u{1F3A8}",
  editor: "\u{1F4DD}",
  welcome: "\u{1F3E0}",
};

/** 获取标签页图标：优先查 pluginId 的 icon，否则用 type */
function getTabIcon(tab: Tab): string {
  // Phase 4：pluginId 的图标由 viewRegistry 提供（codicon 名或 emoji fallback）
  // 暂时用 type 映射
  return TYPE_ICON[tab.type] ?? "\u{1F4C4}";
}

/* ── Props ── */

interface TabBarProps {
  group: TabGroup;
  isActiveGroup: boolean;
  onFocusTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
  onCreateTab: (type: string, opts?: any) => string;
  onSplitTab?: (tabId: string, direction: "horizontal" | "vertical") => void;
  onMoveTab?: (tabId: string, targetGroupId?: string) => void;
  onReorderTab?: (tabId: string, toIndex: number) => void;
  /** 对标 VS Code：双击标签页 → 固定/取消固定 */
  onPinTab?: (tabId: string) => void;
  onDropSplit?: (tabId: string, zone: "left" | "right" | "up" | "down", targetGroupId?: string) => void;
  /** Shift+拖 = 复制标签页到新面板 */
  onDropCopySplit?: (tabId: string, zone: "left" | "right" | "up" | "down", targetGroupId?: string) => void;
  editorAreaRef?: React.RefObject<HTMLDivElement | null>;
  dragDropZone?: "left" | "right" | "up" | "down" | "center" | null;
  onDragDropZone?: (zone: "left" | "right" | "up" | "down" | "center" | null, targetGroupId?: string) => void;
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
  onCreateTab: (type: string, workspaceName?: string) => void;
  buttonRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const items: { label: string; type: string }[] = [
    { label: t("新建终端"), type: "terminal" },
    { label: t("新建工作台"), type: "workspace" },
    { label: t("新建欢迎页"), type: "welcome" },
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
            {TYPE_ICON[item.type] ?? ""} {item.label}
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
  const { t } = useTranslation();
  const tab = tabs.find((t) => t.id === state.tabId);
  if (!tab) return null;

  const tabIndex = tabs.findIndex((t) => t.id === state.tabId);
  const hasOthers = tabs.length > 1;
  const hasRight = tabIndex < tabs.length - 1;
  const canSplit = tabs.length > 1; // v4: 由 reducer 判断是否已分屏

  const items: { label: string; action: () => void; disabled?: boolean }[] = [
    {
      label: t("关闭"),
      action: () => onCloseTab(state.tabId),
    },
    {
      label: t("关闭其他"),
      action: () => {
        tabs
          .filter((t) => t.id !== state.tabId)
          .forEach((t) => onCloseTab(t.id));
      },
      disabled: !hasOthers,
    },
    {
      label: t("关闭右侧"),
      action: () => {
        tabs
          .slice(tabIndex + 1)
          .forEach((t) => onCloseTab(t.id));
      },
      disabled: !hasRight,
    },
    { label: "", action: () => {}, disabled: true }, // divider
    {
      label: t("向下分屏"),
      action: () => onSplitTab?.(state.tabId, "vertical"),
      disabled: !canSplit,
    },
    {
      label: t("向右分屏"),
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
  onPinTab,
  onDropSplit,
  onDropCopySplit,
  editorAreaRef,
  onDragDropZone,
  onDraggingChange,
}: TabBarProps) {
  const { t } = useTranslation();
  const { tabs, activeTabId } = group;
  const [plusOpen, setPlusOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const plusRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // 标签溢出检测 + 滚动箭头
  const [overflowLeft, setOverflowLeft] = useState(false);
  const [overflowRight, setOverflowRight] = useState(false);

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setOverflowLeft(el.scrollLeft > 2);
    setOverflowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(checkOverflow);
    ro.observe(el);
    el.addEventListener("scroll", checkOverflow, { passive: true });
    return () => { ro.disconnect(); el.removeEventListener("scroll", checkOverflow); };
  }, [checkOverflow, tabs.length]);

  const scrollTabs = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

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
      setExitingTabId(tabId);
      setTimeout(() => {
        onCloseTab(tabId);
        setExitingTabId(null);
      }, 120);
    },
    [tabs, onCloseTab]
  );

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

  // ── 拖拽重排 + 分屏（useDragReorder hook 封装 window 级事件处理）──

  const computeInsertIndex = useCallback(
    (clientX: number, _clientY: number, container: HTMLElement, fromIndex: number, _itemCount: number) => {
      const tabElements = container.querySelectorAll<HTMLElement>(".tab-item");
      const scrollRect = container.getBoundingClientRect();
      const mouseX = clientX - scrollRect.left + container.scrollLeft;

      let insertIdx = tabs.length;
      for (let i = 0; i < tabElements.length; i++) {
        const rect = tabElements[i].getBoundingClientRect();
        const midX = rect.left - scrollRect.left + container.scrollLeft + rect.width / 2;
        if (mouseX < midX) { insertIdx = i; break; }
      }
      if (insertIdx > fromIndex) insertIdx--;
      return insertIdx;
    },
    [tabs.length]
  );

  const isInPureEditor = useCallback(
    (clientX: number, clientY: number) => {
      const elUnderMouse = document.elementFromPoint(clientX, clientY);
      const overAnyTabBar = elUnderMouse?.closest(".tab-bar") != null;
      const areaRect = editorAreaRef?.current?.getBoundingClientRect();
      return !!(areaRect && !overAnyTabBar &&
        clientX >= areaRect.left && clientX <= areaRect.right &&
        clientY >= areaRect.top && clientY <= areaRect.bottom);
    },
    [editorAreaRef]
  );

  const findOtherContainer = useCallback(
    (clientX: number, clientY: number, ownContainer: HTMLElement) => {
      if (!_onMoveTab) return false;
      const otherBars = document.querySelectorAll(".tab-bar");
      for (const bar of otherBars) {
        if (bar === ownContainer.parentElement) continue;
        const barRect = bar.getBoundingClientRect();
        if (clientX >= barRect.left && clientX <= barRect.right &&
            clientY >= barRect.top && clientY <= barRect.bottom) {
          return true;
        }
      }
      return false;
    },
    [_onMoveTab]
  );

  const computeSplitZone = useCallback(
    (clientX: number, clientY: number) => {
      // 第 1 层：rect-based 面板命中检测——对标 VS Code hitTest（不依赖 elementFromPoint）
      const panes = document.querySelectorAll<HTMLElement>(".tab-group-pane");
      for (const pane of panes) {
        const paneRect = pane.getBoundingClientRect();
        if (
          clientX >= paneRect.left && clientX <= paneRect.right &&
          clientY >= paneRect.top && clientY <= paneRect.bottom
        ) {
          const zone = detectDropZone(clientX, clientY, paneRect);
          const targetGroupId = pane.getAttribute("data-group-id") ?? undefined;
          return { zone, targetGroupId };
        }
      }
      // 第 2 层：鼠标不在任何面板内（如分割条上）→ 编辑器边缘 fallback
      const areaRect = editorAreaRef?.current?.getBoundingClientRect();
      if (!areaRect) return null;
      return { zone: detectDropZone(clientX, clientY, areaRect) };
    },
    [editorAreaRef]
  );

  const {
    draggingId,
    insertIndex: dragInsertIndex,
    previewPos,
    startDrag,
  } = useDragReorder(scrollRef, {
    itemCount: tabs.length,
    editorAreaRef,
    onReorder: onReorderTab ?? (() => {}),
    onDropSplit,
    onDropCopySplit,
    onMoveToOther: _onMoveTab,
    onDraggingChange,
    onDragDropZone,
    computeInsertIndex,
    isInPureEditor,
    findOtherContainer,
    computeSplitZone,
  });

  return (
    <div className="tab-bar">
      {overflowLeft && (
        <button className="tab-scroll-arrow tab-scroll-left" onClick={() => scrollTabs(-200)}>‹</button>
      )}
      <div className="tab-list" ref={scrollRef} onWheel={onWheel} onScroll={checkOverflow} role="tablist">
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isDragging = draggingId === tab.id;
          const isEntering = enteringTabId === tab.id;
          const isExiting = exitingTabId === tab.id;

          return (
            <>
              {/* 拖拽插入指示器 */}
              {dragInsertIndex === idx && draggingId !== tab.id && (
                <div className="tab-drop-indicator" key={`indicator-${idx}`} />
              )}
              <div
                key={tab.id}
                data-tab-id={tab.id}
                className={`tab-item${isActive ? " active" : ""}${isDragging ? " dragging" : ""}${isEntering ? " entering" : ""}${isExiting ? " exiting" : ""}${!tab.pinned ? " preview" : ""}`}
                title={t(tab.label) + (tab.pinned ? "" : t(" — 双击固定"))}
                onClick={() => onFocusTab(tab.id)}
                onDoubleClick={() => onPinTab?.(tab.id)}
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
                    startDrag(tab.id, idx, e);
                  }
                }}
              >
                {tab.dirty && <span className="tab-dirty-dot">●</span>}
                <span className="tab-icon">{getTabIcon(tab)}</span>
                <span className="tab-label">{t(tab.label)}</span>
                <button
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeWithAnimation(tab.id);
                  }}
                  title={t("关闭")}
                  aria-label={t("关闭")}
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
      {overflowRight && (
        <button className="tab-scroll-arrow tab-scroll-right" onClick={() => scrollTabs(200)}>›</button>
      )}

        <button
          ref={plusRef}
          className={`tab-plus-btn${plusOpen ? " open" : ""}`}
          onClick={() => setPlusOpen(!plusOpen)}
          title={t("新建标签页")}
          aria-label={t("新建标签页")}
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

      {/* 拖拽预览：portal 到 body 确保永远在最顶层（不受 stacking context 影响） */}
      {previewPos && draggingId && (() => {
        const tab = tabs.find((t) => t.id === draggingId);
        if (!tab) return null;
        return createPortal(
          <div
            className="tab-drag-preview"
            style={{
              position: "fixed",
              left: previewPos.x - 50,
              top: previewPos.y - 14,
              pointerEvents: "none",
              zIndex: 99999,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <span className="tab-icon" style={{ flexShrink: 0, fontSize: 13, opacity: 0.8 }}>
              {getTabIcon(tab)}
            </span>
            <span className="tab-label">{t(tab.label)}</span>
          </div>,
          document.body
        );
      })()}
    </div>
  );
}
