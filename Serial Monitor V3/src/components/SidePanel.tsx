/**
 * SidePanel — 侧栏。Phase 3 改为跟随 activeTabType。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §7]
 */

import { useState, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import type { TabType } from "../hooks/useTabManager";
import TerminalSidebar from "./TerminalSidebar";
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import "./SidePanel.css";

interface SidePanelProps {
  activeTabType: TabType;
  activePluginId?: string;
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
};

const SidePanel = forwardRef<HTMLElement, SidePanelProps>(
  function SidePanel({ activeTabType, activePluginId, width }, ref) {
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

  // Phase 4：优先使用插件侧栏组件
  const renderSidebarContent = () => {
    if (activePluginId) {
      const plugin = getViewPlugin(activePluginId);
      if (plugin?.sidebarComponent) {
        const SidebarComponent = plugin.sidebarComponent;
        return <SidebarComponent />;
      }
    }
    // Fallback：旧版硬编码
    if (activeTabType === "terminal") return <TerminalSidebar />;
    if (activeTabType === "workspace") return <div className="side-panel-placeholder">{t("卡片属性编辑器")} — Phase 5</div>;
    if (activeTabType === "settings") return <div className="side-panel-placeholder">{t("导航")} — Phase 7</div>;
    if (activeTabType === "oled") return <div className="side-panel-placeholder">{t("图形属性")} — Phase 6</div>;
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
              {t(sidebarTitleKeys[activeTabType])}
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
