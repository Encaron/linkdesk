/**
 * GroupTabBar——E5.6#16.5。
 *
 * MainPool 内的标签栏。每个 group 自包含——GroupPane 内部渲染自己的 TabBar。
 * 所有写操作走 pool.tabAction() → IPC → 壳 useTabManager → pushLayout 回环。
 *
 * 对标壳 TabBar.tsx（431 行）的核心功能：
 * - 标签页渲染（图标/标题/dirty dot/固定状态）
 * - 点击切标签页 / [×] 关闭 / 中键关闭
 * - 拖拽排序——乐观更新 + 松手 IPC
 * - overflow 折叠——滚动箭头
 * - 右键菜单——方案 A（池内渲染，自适应翻转）
 * - [+] 新建标签页按钮
 *
 * 🔴 不包含（留在壳 TabBar）：
 * - 跨 group 拖拽分屏（MainRenderer 负责）
 * - 拖到其他 group（MainRenderer 负责）
 * - createPortal 拖拽预览（池 DOM 内 float div 替代）
 */

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type { PoolTab } from "../core/types/poolLayout";
import { normalizePath } from "../core/services/pathUtils";
import "./GroupTabBar.css";

// ═══════════════════════════════════════════════════════════════════
// Props
// ═══════════════════════════════════════════════════════════════════

interface GroupTabBarProps {
  groupId: string;
  tabs: PoolTab[];
  activeTabId: string;
  /** E5.6#16.7：拖拽中的标签页 ID——MainRenderer 全局协调 */
  draggingId?: string;
  /** E5.6#16.7：拖拽插入位置——显示 drop indicator 的位置 */
  dragInsertIndex?: number | null;
  /** E5.6#16.7：用户 mousedown → MainRenderer 接管拖拽 */
  onTabDragStart?: (tabId: string, index: number, e: ReactMouseEvent) => void;
  /** E5.6#16.7：TabBar DOM 挂载/卸载 → MainRenderer 记录 bounding rect */
  onTabBarMount?: (el: HTMLDivElement | null) => void;
  /** E5.6#16.7k-3：可创建为标签页的视图——[+] 按钮下拉菜单 */
  creatableViews?: { pluginId: string; label: string }[];
}

// ═══════════════════════════════════════════════════════════════════
// 右键菜单项
// ═══════════════════════════════════════════════════════════════════

/** 菜单项高度——须与 CSS `.group-tab-context-item { height: 28px }` 一致 */
const MENU_ITEM_HEIGHT = 28;
/** 菜单上下 padding——须与 CSS `padding: 4px 0` 一致 */
const MENU_PADDING_Y = 8;
/** 菜单最小宽度 */
const MENU_MIN_WIDTH = 180;

interface ContextMenuState {
  tabId: string;
  x: number;
  y: number;
}

/** 右键菜单项——i18n 化：label/tooltip 走 t()，在组件内构建 */
function buildMenuItems(t: (key: string) => string) {
  return [
    { id: "close", label: t("关闭"), action: (tabId: string) => ({ action: "closeTab", tabId }) },
    { id: "closeOthers", label: t("关闭其他"), action: (tabId: string, groupId: string) => ({ action: "closeOtherTabs", groupId, tabId }) },
    { id: "closeToRight", label: t("关闭右侧"), action: (tabId: string, groupId: string) => ({ action: "closeTabsToRight", groupId, tabId }) },
    { id: "closeAll", label: t("关闭全部"), action: (_tabId: string, groupId: string) => ({ action: "closeAllTabs", groupId }) },
    { id: "divider1", label: "", action: null as any, divider: true as const },
    { id: "splitRight", label: t("向右分屏"), action: (tabId: string) => ({ action: "splitTab", tabId, direction: "right" }) },
    { id: "splitDown", label: t("向下分屏"), action: (tabId: string) => ({ action: "splitTab", tabId, direction: "down" }) },
    { id: "duplicate", label: t("复制标签页"), action: (tabId: string) => ({ action: "duplicateTab", tabId }) },
    { id: "divider2", label: "", action: null as any, divider: true as const },
    { id: "pin", label: t("固定"), action: (tabId: string) => ({ action: "pinTab", tabId }) },
  ];
}

// ═══════════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════════

/** 去歧义标签名——同名文件加父目录后缀（对标 VS Code） */
function disambiguateLabels(tabs: PoolTab[]): Map<string, string> {
  const result = new Map<string, string>();
  const countByLabel = new Map<string, number>();
  for (const t of tabs) countByLabel.set(t.title, (countByLabel.get(t.title) ?? 0) + 1);
  for (const t of tabs) {
    if ((countByLabel.get(t.title) ?? 0) <= 1 || !t.sourceId) {
      result.set(t.id, t.title);
      continue;
    }
    const parts = normalizePath(t.sourceId).split("/").filter(Boolean);
    const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
    result.set(t.id, parent ? `${t.title} • ${parent}/` : t.title);
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════════════════════════════

export default function GroupTabBar({ groupId, tabs, activeTabId, draggingId, dragInsertIndex, onTabDragStart, onTabBarMount, creatableViews }: GroupTabBarProps) {
  // ── i18n ──
  const { t } = useTranslation();

  // ── 池 API 引用 ──
  const poolApiRef = useRef<any>(null);
  if (!poolApiRef.current) {
    poolApiRef.current = (window as any).linkdesk?.pool;
  }
  const poolApi = poolApiRef.current;

  const tabAction = useCallback(
    (action: any) => {
      poolApi?.tabAction?.(action);
    },
    [poolApi],
  );

  // ── 右键菜单项（i18n）──
  const MENU_ITEMS = useMemo(() => buildMenuItems(t), [t]);

  // ── 去歧义标签名 ──
  const labels = useMemo(() => disambiguateLabels(tabs), [tabs]);

  // ── Overflow 检测 ──
  const [overflowLeft, setOverflowLeft] = useState(false);
  const [overflowRight, setOverflowRight] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", checkOverflow);
    };
  }, [checkOverflow, tabs.length]);

  const scrollTabs = (delta: number) => {
    scrollRef.current?.scrollBy({ left: delta, behavior: "smooth" });
  };

  // ── 滚轮横向滚动 ──
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (scrollRef.current) {
      e.preventDefault();
      scrollRef.current.scrollLeft += e.deltaY;
    }
  }, []);

  // ── 右键菜单 ──
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [menuFlipY, setMenuFlipY] = useState(false);

  // ── E5.6#16.7k-3：PlusMenu [+] 按钮下拉 ──
  const [showPlusMenu, setShowPlusMenu] = useState(false);
  const [plusMenuPos, setPlusMenuPos] = useState<{ x: number; y: number } | null>(null);

  // 点外部 / Escape 关闭菜单
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  // PlusMenu 点外部关闭
  useEffect(() => {
    if (!showPlusMenu) return;
    const close = () => setShowPlusMenu(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    // delay——避免同一次 click 既打开又关闭
    const timer = setTimeout(() => {
      window.addEventListener("mousedown", close);
    }, 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [showPlusMenu]);

  const onContextMenu = useCallback(
    (tabId: string, e: ReactMouseEvent) => {
      e.preventDefault();
      // 检测菜单是否超出 View 底部——翻转方向
      const menuHeight = MENU_ITEMS.length * MENU_ITEM_HEIGHT + MENU_PADDING_Y;
      const viewHeight = window.innerHeight;
      setMenuFlipY(e.clientY + menuHeight > viewHeight);
      setContextMenu({ tabId, x: e.clientX, y: e.clientY });
    },
    [],
  );

  // E5.6#16.7：拖拽状态由 MainRenderer 全局管理——此组件只做视觉渲染
  // draggingId / dragInsertIndex 从 props 读

  // ── Enter / Exit 动画（对标旧 TabBar）──
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

  const barRef = useRef<HTMLDivElement | null>(null);

  // E5.6#16.7：通知 MainRenderer TabBar DOM 挂载/卸载——用于拖拽 bounding rect 检测
  const onMountRef = useRef(onTabBarMount);
  onMountRef.current = onTabBarMount;
  const setBarRef = useCallback((el: HTMLDivElement | null) => {
    barRef.current = el;
    onMountRef.current?.(el);
  }, []);

  // ── 关闭（带动画——对标旧 TabBar closeWithAnimation）──
  // 先播 exit 动画 120ms → 再发 IPC 关闭。壳侧 handleTabAction 处理 invokeBeforeCloseTab。
  const handleClose = useCallback(
    async (tabId: string, e?: ReactMouseEvent) => {
      e?.stopPropagation();
      setExitingTabId(tabId);
      await new Promise((r) => setTimeout(r, 120));
      tabAction({ action: "closeTab", tabId });
      setExitingTabId(null);
    },
    [tabAction],
  );

  // ── 渲染 ──

  // 无标签页——不渲染 TabBar（空 group 由 MainRenderer 处理）
  if (tabs.length === 0) return null;

  return (
    <div className="group-tab-bar" ref={setBarRef}>
      {/* 左滚动箭头 */}
      {overflowLeft && (
        <button
          className="group-tab-scroll-arrow group-tab-scroll-left"
          onClick={() => scrollTabs(-200)}
        >
          <span className="codicon codicon-chevron-left" />
        </button>
      )}

      {/* 标签页列表 */}
      <div
        className="group-tab-list"
        ref={scrollRef}
        onWheel={onWheel}
        onScroll={checkOverflow}
        role="tablist"
      >
        {tabs.map((tab, idx) => {
          const isActive = tab.id === activeTabId;
          const isDragging = draggingId === tab.id;
          const isEntering = enteringTabId === tab.id;
          const isExiting = exitingTabId === tab.id;

          return (
            <div key={tab.id} style={{ display: "contents" }}>
              {/* 拖拽插入指示器——E5.6#16.7：props 驱动 */}
              {dragInsertIndex === idx && draggingId !== tab.id && (
                <div className="group-tab-drop-indicator" />
              )}
              <div
                data-tab-id={tab.id}
                className={`group-tab-item${isActive ? " active" : ""}${isDragging ? " dragging" : ""}${isEntering ? " entering" : ""}${isExiting ? " exiting" : ""}${!tab.pinned ? " preview" : ""}`}
                title={tab.sourceId ?? (tab.pinned ? tab.title : `${tab.title} — ${t("双击固定")}`)}
                onClick={() => tabAction({ action: "focusTab", tabId: tab.id })}
                onDoubleClick={() => tabAction({ action: "pinTab", tabId: tab.id })}
                onContextMenu={(e) => onContextMenu(tab.id, e)}
                onMouseDown={(e) => {
                  // 中键关闭
                  if (e.button === 1) {
                    e.preventDefault();
                    handleClose(tab.id);
                    return;
                  }
                  // 左键拖拽——E5.6#16.7：交 MainRenderer 全局协调
                  if (e.button === 0 && !tab.singleton) {
                    onTabDragStart?.(tab.id, idx, e);
                  }
                }}
              >
                {/* dirty dot */}
                {tab.dirty && <span className="group-tab-dirty-dot" />}

                {/* 图标——emoji 或 img */}
                {tab.icon && (
                  tab.icon.length <= 2 && /[\p{Emoji}]/u.test(tab.icon)
                    ? <span className="group-tab-icon-emoji">{tab.icon}</span>
                    : <img className="group-tab-icon" src={tab.icon} alt="" />
                )}

                {/* 标签文字 */}
                <span className="group-tab-label">{labels.get(tab.id) ?? tab.title}</span>

                {/* 关闭按钮——singleton/blocked 不显示 */}
                {tab.closeBehavior !== "blocked" && !tab.singleton && (
                  <button
                    className="group-tab-close"
                    onClick={(e) => handleClose(tab.id, e)}
                    title={t("关闭")}
                    aria-label={t("关闭")}
                  >
                    <span className="codicon codicon-close" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {/* 末尾插入指示器 */}
        {dragInsertIndex === tabs.length && (
          <div className="group-tab-drop-indicator" />
        )}

        {/* 右滚动箭头 */}
        {overflowRight && (
          <button
            className="group-tab-scroll-arrow group-tab-scroll-right"
            onClick={() => scrollTabs(200)}
          >
            <span className="codicon codicon-chevron-right" />
          </button>
        )}

        {/* [+] PlusMenu——E5.6#16.7k-3：壳推送 creatableViews 时显示动态列表，否则兜底欢迎页 */}
        <button
          className="group-tab-plus-btn"
          onClick={(e) => {
            if (creatableViews && creatableViews.length > 0) {
              const btnRect = (e.target as HTMLElement).getBoundingClientRect();
              setPlusMenuPos({ x: btnRect.left, y: btnRect.bottom + 4 });
              setShowPlusMenu(true);
            } else {
              tabAction({ action: "createTab" });
            }
          }}
          title={t("新建标签页")}
          aria-label={t("新建标签页")}
        >
          +
        </button>

        {/* PlusMenu 下拉——动态列出可创建视图 */}
        {showPlusMenu && plusMenuPos && creatableViews && creatableViews.length > 0 && (
          <div
            className="group-tab-plus-menu"
            style={{
              position: "fixed",
              left: plusMenuPos.x,
              top: plusMenuPos.y,
              zIndex: 1001,
            }}
          >
            {creatableViews.map((v) => (
              <button
                key={v.pluginId}
                className="group-tab-plus-menu-item"
                onClick={() => {
                  tabAction({ action: "createTab", pluginId: v.pluginId });
                  setShowPlusMenu(false);
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 右键菜单——池内渲染，自适应翻转 */}
      {contextMenu && (
        <>
          <div className="group-tab-context-backdrop" />
          <div
            className="group-tab-context-menu"
            style={{
              position: "fixed",
              left: Math.max(0, Math.min(contextMenu.x, window.innerWidth - MENU_MIN_WIDTH)),
              top: menuFlipY
                ? contextMenu.y - MENU_ITEMS.length * MENU_ITEM_HEIGHT - MENU_PADDING_Y
                : contextMenu.y,
              zIndex: 1000,
            }}
          >
            {MENU_ITEMS.map((item) => {
              if (item.divider) {
                return <div key={item.id} className="group-tab-context-divider" />;
              }
              const tab = tabs.find((t) => t.id === contextMenu.tabId);
              // "固定" → 动态文字
              let label = item.label;
              if (item.id === "pin") {
                label = tab?.pinned ? t("取消固定") : t("固定");
              }
              return (
                <button
                  key={item.id}
                  className={`group-tab-context-item${(item as any).disabled ? " disabled" : ""}`}
                  disabled={(item as any).disabled}
                  title={(item as any).tooltip ?? ""}
                  onClick={() => {
                    if ((item as any).disabled) return;
                    const act = item.action(contextMenu.tabId, groupId);
                    tabAction(act);
                    setContextMenu(null);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </>
      )}

    </div>
  );
}
