/**
 * 共享 `<SidebarSection>` —— 通用可折叠侧栏区块。
 * Phase 5.5b：UI 基础设施——终端侧栏先用，Phase 6 文件树/Git/数据库浏览器全复用。
 *
 * 对标 VS Code Explorer 侧栏的 section header：
 * - 22px 高度 / 11px 字体 / 600 字重 / uppercase
 * - 三角箭头 0.1s 旋转动画（▼ ↔ ▶）
 * - 可折叠 / 默认展开 / badge / actions slot
 *
 * 纯 UI 组件——不 import 任何 core 模块。
 */

import { type ReactNode, useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import "./SidebarSection.css";

interface SidebarSectionProps {
  /** 区块标题（如 "终端会话"、"收发设置"） */
  title: string;
  /** 是否可折叠，默认 true */
  collapsible?: boolean;
  /** 默认展开/合上，默认 true */
  defaultOpen?: boolean;
  /** 右侧标记（如 "(3)"、3、"新"） */
  badge?: string | number;
  /** 右侧操作按钮 slot——点击不冒泡到折叠 */
  actions?: ReactNode;
  /** 🆕 PinnedSlot——粘顶内容，header 下方、body 上方 */
  pinnedContent?: () => ReactNode;
  /** 区块内容 */
  children: ReactNode;
  /** 🆕 E3.6：标题旁的副文字——如 "(5 files)"。对标 VS Code ViewPane.titleDescription */
  titleDescription?: string;
  /** 🆕 E3.6：标题 hover tooltip——标题截断时显示完整文字 */
  titleTooltip?: string;
  /** 🆕 E3.6：控制 actions 显隐时机——'always' | 'whenExpanded' | 'default'（hover 显示） */
  showActions?: "always" | "whenExpanded" | "default";
  /** 🆕 E3.6：隐藏 header——mergeHeaderWhenSingle 时使用 */
  headerHidden?: boolean;
  /** 🆕 E3.6 ST1：sticky header 的 top 偏移（px）——由侧栏宿主根据 toolbar 高度 + section 序号计算 */
  stickyTop?: number;
  /** E4V#47——header 可拖拽排序 */
  draggable?: boolean;
  /** E4V#47——拖拽开始回调 */
  onDragStart?: (e: React.DragEvent) => void;
  /** E4V#48——拖拽结束回调（清状态） */
  onDragEnd?: () => void;
  /** E4V#46——折叠状态变更回调 */
  onToggleCollapse?: (collapsed: boolean) => void;
}

function SidebarSection({
  title,
  collapsible = true,
  defaultOpen = true,
  badge,
  actions,
  pinnedContent,
  children,
  titleDescription,
  titleTooltip,
  showActions = "default",
  headerHidden = false,
  stickyTop,
  draggable = false,
  onDragStart,
  onDragEnd,
  onToggleCollapse,
}: SidebarSectionProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);
  // E4V#43——actions 溢出检测 + … 下拉
  const actionsRef = useRef<HTMLSpanElement>(null);
  const moreRef = useRef<HTMLSpanElement>(null);
  const [actionsOverflow, setActionsOverflow] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const toggle = useCallback(() => {
    if (collapsible) setOpen((prev) => { const next = !prev; onToggleCollapse?.(!next); return next; });
  }, [collapsible, onToggleCollapse]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  // E4V#43——ResizeObserver 检测 actions 溢出
  useEffect(() => {
    const el = actionsRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // scrollWidth > clientWidth 说明内容被裁切了
      setActionsOverflow(el.scrollWidth > el.clientWidth + 2);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // E4V#43——… 下拉打开时，点击外部关闭
  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick, true);
    return () => document.removeEventListener("mousedown", onClick, true);
  }, [moreOpen]);

  // 🆕 E36#3A.4：headerHidden——不渲染 header，直接显示 body。
  // E4V#48：headerHidden 时仍支持拖拽——外容器 draggable。
  if (headerHidden) {
    return (
      <div className="sidebar-section" draggable={draggable} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        {open && pinnedContent && (
          <div className="sidebar-section-pinned" style={{
            position: "sticky",
            top: stickyTop ?? 0,
            zIndex: 1,
          }}>
            {pinnedContent()}
          </div>
        )}
        {open && <div className="sidebar-section-body">{children}</div>}
      </div>
    );
  }

  return (
    <div className="sidebar-section">
      {/* 🔥 E4V#fix: header + pinned 包进同一个 sticky 容器——消除 HEADER_H 硬编码。
         浏览器自动处理堆叠——不再各自算 top，不再有 CSS-TSX 不同步导致的缝。 */}
      <div className="sidebar-section-sticky-head"
        style={stickyTop !== undefined ? { top: stickyTop } : undefined}>
        <div
          className={`sidebar-section-header${!collapsible ? " not-collapsible" : ""}`}
          onClick={toggle}
          role="button"
          title={titleTooltip}
          aria-expanded={collapsible ? open : undefined}
          tabIndex={collapsible ? 0 : undefined}
          onKeyDown={collapsible ? onKeyDown : undefined}
          draggable={draggable}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          {collapsible && (
            <span className={`sidebar-section-arrow${open ? "" : " collapsed"}`}>
              ▼
            </span>
          )}
          <span className="sidebar-section-title">{title ? t(title) : title}</span>
          {titleDescription && (
            <span className="sidebar-section-title-description">{titleDescription}</span>
          )}
          {badge !== undefined && badge !== "" && (
            <span className="sidebar-section-badge">{badge}</span>
          )}
          <span className="sidebar-section-spacer" />
          {actions && (
            <>
              <span
                ref={actionsRef}
                className={`sidebar-section-actions${showActions === "default" ? " show-on-hover" : ""}${showActions === "whenExpanded" && !open ? " hidden" : ""}${actionsOverflow ? " overflow" : ""}`}
                onClick={(e) => e.stopPropagation()}
              >
                {actions}
              </span>
              {actionsOverflow && (
                <span
                  ref={moreRef}
                  className={`sidebar-section-more${showActions === "default" ? " show-on-hover" : ""}`}
                  onClick={(e) => { e.stopPropagation(); setMoreOpen((p) => !p); }}
                  title={t("更多操作…")}
                >
                  …
                  {moreOpen && (
                    <div className="sidebar-section-more-dropdown" onClick={(e) => e.stopPropagation()}>
                      {actions}
                    </div>
                  )}
                </span>
              )}
            </>
          )}
        </div>
        {open && pinnedContent && (
          <div className="sidebar-section-pinned">
            {pinnedContent()}
          </div>
        )}
      </div>
      {open && <div className="sidebar-section-body">{children}</div>}
    </div>
  );
}

export default SidebarSection;
