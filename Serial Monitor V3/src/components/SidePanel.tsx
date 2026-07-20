/**
 * SidePanel — 侧栏。Phase 4.4：对标 VS Code——侧栏只从 viewRegistry 读 sidebarComponent。
 * 不再有硬编码 import 或 if (effectiveType === "...")。
 *
 * 设计依据：VS Code viewsService + viewDescriptorService（侧栏内容由扩展声明）
 */

import { useState, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import "./SidePanel.css";

interface SidePanelProps {
  activeTabType: string;
  activePluginId?: string;
  sidebarView?: string | null;
  width: number;
}

const SidePanel = forwardRef<HTMLElement, SidePanelProps>(
  function SidePanel({ activePluginId, sidebarView, width }, ref) {
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

  // Phase 4.4：侧栏内容只有一个来源——viewRegistry
  const effectivePluginId = sidebarView ?? activePluginId;

  const renderSidebarContent = () => {
    if (!effectivePluginId) return null;
    const plugin = getViewPlugin(effectivePluginId);
    if (plugin?.sidebarComponent) {
      const SidebarComponent = plugin.sidebarComponent;
      return <SidebarComponent />;
    }
    // 无侧栏——对标 VS Code 空侧栏
    return <div className="side-panel-placeholder">{t("无设置项")}</div>;
  };

  // 标题从 registry 读
  const title = effectivePluginId
    ? getViewPlugin(effectivePluginId)?.manifest.name ?? effectivePluginId
    : "";

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
            <span className="side-panel-title">{t(title)}</span>
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
