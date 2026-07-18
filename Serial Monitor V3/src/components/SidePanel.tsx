import { useState, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import type { ViewId } from "../App";
import TerminalSidebar from "./TerminalSidebar";
import "./SidePanel.css";

interface SidePanelProps {
  activeView: ViewId;
  contentView: ViewId;
  width: number;
}

const sidebarTitleKeys: Record<ViewId, string> = {
  terminal: "收发设置",
  workspace: "卡片属性",
  settings: "导航",
};

const SidePanel = forwardRef<HTMLElement, SidePanelProps>(
  function SidePanel({ activeView, contentView, width }, ref) {
  const [collapsed, setCollapsed] = useState(false);
  const [animating, setAnimating] = useState(false);
  const { t } = useTranslation();

  const toggleCollapse = (collapse: boolean) => {
    setAnimating(true);
    setCollapsed(collapse);
    setTimeout(() => setAnimating(false), 220);
  };

  const displayView = activeView === "settings" ? "settings" : contentView;

  const cls = ["side-panel"];
  if (collapsed) cls.push("collapsed");
  if (animating) cls.push("animating");

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
              {t(sidebarTitleKeys[displayView])}
            </span>
            <button
              className="side-panel-collapse"
              onClick={() => toggleCollapse(true)}
              title={t("折叠侧栏")}
            >
              ◀
            </button>
          </div>
          <div className="side-panel-body">
            {activeView === "terminal" && <TerminalSidebar />}
            {activeView === "workspace" && <WorkspaceSidebar />}
            {activeView === "settings" && <SettingsSidebar />}
          </div>
        </>
      )}
    </aside>
  );
  }
);

function WorkspaceSidebar() {
  return (
    <div className="side-panel-body">
      <span style={{ color: "var(--text-muted)", fontSize: 11, padding: 12 }}>
        工作台侧栏——Phase 2 实现
      </span>
    </div>
  );
}

function SettingsSidebar() {
  return (
    <div className="side-panel-body">
      <span style={{ color: "var(--text-muted)", fontSize: 11, padding: 12 }}>
        设置侧栏——Phase 4 实现
      </span>
    </div>
  );
}

export default SidePanel;
