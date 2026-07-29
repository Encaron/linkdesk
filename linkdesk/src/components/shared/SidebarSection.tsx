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

import { type ReactNode, useState, useCallback } from "react";
import "./SidebarSection.css";

export interface SidebarSectionProps {
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
}

function SidebarSection({
  title,
  collapsible = true,
  defaultOpen = true,
  badge,
  actions,
  children,
  titleDescription,
  titleTooltip,
}: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = useCallback(() => {
    if (collapsible) setOpen((prev) => !prev);
  }, [collapsible]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  return (
    <div className="sidebar-section">
      <div
        className={`sidebar-section-header${!collapsible ? " not-collapsible" : ""}`}
        onClick={toggle}
        role="button"
        title={titleTooltip}
        aria-expanded={collapsible ? open : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={collapsible ? onKeyDown : undefined}
      >
        {collapsible && (
          <span className={`sidebar-section-arrow${open ? "" : " collapsed"}`}>
            ▼
          </span>
        )}
        <span className="sidebar-section-title">{title}</span>
        {titleDescription && (
          <span className="sidebar-section-title-description">{titleDescription}</span>
        )}
        {badge !== undefined && badge !== "" && (
          <span className="sidebar-section-badge">{badge}</span>
        )}
        <span className="sidebar-section-spacer" />
        {actions && (
          <span
            className="sidebar-section-actions"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
          </span>
        )}
      </div>
      {open && <div className="sidebar-section-body">{children}</div>}
    </div>
  );
}

export default SidebarSection;
