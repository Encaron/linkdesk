/**
 * PluginDetailView — 插件详情页。
 * Phase 4 Step 4：plugin.json 是唯一数据源——图标 + 名称 + 版本 + 描述 + 更新日志。
 *
 * 设计依据：[[phase4-design-decisions]] 第 11 条。
 */

import { useTranslation } from "react-i18next";
import { getViewPlugin } from "../../pluginLoader/viewRegistry";
import "./PluginDetailView.css";

interface PluginDetailViewProps {
  isActive: boolean;
  pluginId?: string;
}

function PluginDetailView({ isActive: _isActive, pluginId }: PluginDetailViewProps) {
  const { t } = useTranslation();

  if (!pluginId) {
    return <div className="plugin-detail-empty">未指定插件 ID</div>;
  }

  const plugin = getViewPlugin(pluginId);
  if (!plugin) {
    return (
      <div className="plugin-detail-empty">
        {t("插件")} "{pluginId}" {t("未安装或已禁用")}
      </div>
    );
  }

  const m = plugin.manifest;

  return (
    <div className="plugin-detail">
      <header className="plugin-detail-header">
        <span className="plugin-detail-icon">
          {m.iconSource === "codicon" ? `[${m.icon}]` : (m.icon ?? "🧩")}
        </span>
        <div className="plugin-detail-meta">
          <h2 className="plugin-detail-name">{t(m.name)}</h2>
          <span className="plugin-detail-version">v{m.version}</span>
          {m.author && <span className="plugin-detail-author">{m.author}</span>}
        </div>
      </header>

      {m.description && (
        <p className="plugin-detail-desc">{t(m.description)}</p>
      )}

      <section className="plugin-detail-section">
        <h3>{t("类型")}</h3>
        <p>{m.type}</p>
      </section>

      {m.tabBehavior && Object.keys(m.tabBehavior).length > 0 && (
        <section className="plugin-detail-section">
          <h3>{t("标签页行为")}</h3>
          <ul>
            {m.tabBehavior.singleton && <li>单例——全局只允许一个实例</li>}
            {m.tabBehavior.isFallback && <li>保底——关闭所有标签页后自动显示</li>}
            {m.tabBehavior.confirmOnClose && <li>关闭确认：{m.tabBehavior.confirmOnClose}</li>}
          </ul>
        </section>
      )}

      {m.statusBar && m.statusBar.length > 0 && (
        <section className="plugin-detail-section">
          <h3>{t("状态栏贡献")}</h3>
          <ul>
            {m.statusBar.map((item) => (
              <li key={item.id}>{item.label || item.id}</li>
            ))}
          </ul>
        </section>
      )}

      {m.changelog && m.changelog.length > 0 && (
        <section className="plugin-detail-section">
          <h3>{t("更新日志")}</h3>
          {m.changelog.map((entry, i) => (
            <div key={i} className="plugin-detail-changelog-entry">
              <span className="changelog-version">v{entry.version}</span>
              <span className="changelog-date">{entry.date}</span>
              {entry.changes && entry.changes.length > 0 && (
                <ul>
                  {entry.changes.map((change, j) => (
                    <li key={j}>{change}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export default PluginDetailView;
