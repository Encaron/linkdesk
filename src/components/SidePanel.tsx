/**
 * SidePanel — 侧栏。Phase 4.4：对标 VS Code——侧栏只从 viewRegistry 读 sidebarComponent。
 * 不再有硬编码 import 或 if (effectiveType === "...")。
 *
 * 设计依据：VS Code viewsService + viewDescriptorService（侧栏内容由扩展声明）
 */

import { useState, useEffect, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import ErrorBoundary from "./shared/ErrorBoundary";
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
  // 对标 VS Code：侧栏独立于编辑器/标签页切换。sidebarView 由图标栏点击控制，
  // lastSidebar 记住上次有效侧栏——关闭标签页不会把侧栏切到别的插件。
  const [lastSidebar, setLastSidebar] = useState<string | null>(null);
  const effectivePluginId = sidebarView ?? lastSidebar ?? activePluginId;

  // effectivePluginId 有值时更新 lastSidebar——下次标签页切换不回退到 activePluginId
  useEffect(() => {
    if (effectivePluginId) setLastSidebar(effectivePluginId);
  }, [effectivePluginId]);

  const renderSidebarContent = () => {
    if (!effectivePluginId) return null;
    const plugin = getViewPlugin(effectivePluginId);
    if (plugin?.sidebarComponent) {
      const SidebarComponent = plugin.sidebarComponent;
      return (
        <ErrorBoundary pluginId={effectivePluginId}>
          <SidebarComponent />
        </ErrorBoundary>
      );
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
