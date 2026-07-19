/**
 * SidePanel — 侧栏。Phase 3 改为跟随 activeTabType。
 * Phase 4 UX：sidebarView 解耦侧栏和主区——对标 VS Code Side Bar。
 *   点 🧩 → 侧栏切为插件列表，主区不变。
 *
 * 设计依据：[V3-Phase3-标签页分屏设计.md §7] + [V3-插件系统与UI重构设计.md §5]
 */

import { useState, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import TerminalSidebar from "./TerminalSidebar";
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import "./SidePanel.css";

interface SidePanelProps {
  activeTabType: string;
  activePluginId?: string;
  /** Phase 4 UX：侧栏独立视图——覆盖 activeTabType 的侧栏内容 */
  sidebarView?: string | null;
  width: number;
}

const sidebarTitleKeys: Record<string, string> = {
  terminal: "收发设置",
  workspace: "卡片属性",
  settings: "导航",
  oled: "图形属性",
  editor: "编辑器",
  welcome: "欢迎",
  "plugin-detail": "插件详情",
  marketplace: "插件管理",
};

const SidePanel = forwardRef<HTMLElement, SidePanelProps>(
  function SidePanel({ activeTabType, activePluginId, sidebarView, width }, ref) {
  const [collapsed, setCollapsed] = useState(false);
  const [animating, setAnimating] = useState(false);
  const { t } = useTranslation();

  const toggleCollapse = (collapse: boolean) => {
    setAnimating(true);
    setCollapsed(collapse);
    setTimeout(() => setAnimating(false), 220);
  };

  const cls = ["side-panel"];
  if (collapsed) cls.push("collapsed");
  if (animating) cls.push("animating");

  // Phase 4 UX：sidebarView 优先——解耦侧栏和标签页
  const effectiveType = sidebarView ?? activeTabType;
  const effectivePluginId = sidebarView ? sidebarView : activePluginId;

  const renderSidebarContent = () => {
    // Phase 4：优先使用插件侧栏组件
    if (effectivePluginId) {
      const plugin = getViewPlugin(effectivePluginId);
      if (plugin?.sidebarComponent) {
        const SidebarComponent = plugin.sidebarComponent;
        return <SidebarComponent />;
      }
    }
    // Fallback：旧版硬编码
    if (effectiveType === "terminal") return <TerminalSidebar />;
    if (effectiveType === "workspace") return <div className="side-panel-placeholder">{t("卡片属性编辑器")} — Phase 5</div>;
    if (effectiveType === "settings") return <div className="side-panel-placeholder">{t("导航")} — Phase 7</div>;
    if (effectiveType === "oled") return <div className="side-panel-placeholder">{t("图形属性")} — Phase 6</div>;
    return null;
  };

  return (
    <aside ref={ref} className={cls.join(" ")} style={{ width: collapsed ? 28 : width }}>
      {collapsed ? (
        <button
          className="side-panel-expand"
          onClick={() => toggleCollapse(false)}
          title={t("展开侧栏")}
        >
          ▶
        </button>
      ) : (
        <>
          <div className="side-panel-header">
            <span className="side-panel-title">
              {t(sidebarTitleKeys[effectiveType] ?? effectiveType)}
            </span>
            <button
              className="side-panel-collapse"
              onClick={() => toggleCollapse(true)}
              title={t("折叠侧栏")}
            >
              ◀
            </button>
          </div>
          <div className="side-panel-content">
            {renderSidebarContent()}
          </div>
        </>
      )}
    </aside>
  );
});

export default SidePanel;
