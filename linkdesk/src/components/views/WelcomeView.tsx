/**
 * WelcomeView — 欢迎页。对标 VS Code Welcome / chrome://newtab。
 * Phase 4 Step 3：壳的兜底 UI——不是插件，关闭所有标签页后自动显示。
 *
 * 设计依据：[V3-Phase4-欢迎页设计.md]
 *
 * 数据全部派生，零自有存储：
 * - 快捷入口 = viewRegistry 投影
 * - 最近列表 = prefs.recentViews 投影
 */

import { useTranslation } from "react-i18next";
import { getViewPlugins } from "../../pluginLoader/viewRegistry";
// Phase 5f：PreferenceService 兜底读清理——recentViews 已完全迁移到 PluginStateService
import { getPluginStateValue, setPluginStateValue } from "../../core/PluginStateService";
import "./WelcomeView.css";

interface WelcomeViewProps {
  isActive: boolean;
  onCreateTab?: (type: string, opts?: { workspaceName?: string; label?: string }) => string;
}

function WelcomeView({ isActive: _isActive, onCreateTab }: WelcomeViewProps) {
  const { t } = useTranslation();

  const viewPlugins = getViewPlugins();
  const recentViews = (() => {
    try {
      return getPluginStateValue<Array<{ pluginId: string; label: string; workspaceName?: string }>>("app", "recentViews") ?? [];
    } catch {
      return [];
    }
  })();

  const handleShortcutClick = (pluginId: string, displayName: string) => {
    if (onCreateTab) {
      // pluginId 即 TabType（terminal/workspace/settings/marketplace）
      onCreateTab(pluginId);
    }
    // 记录用显示名（"终端"），不是 manifest.type（"view"）
    recordRecentView(pluginId, displayName);
  };

  const handleRecentClick = (entry: { pluginId: string; label: string; workspaceName?: string }) => {
    if (onCreateTab) {
      onCreateTab(entry.pluginId, {
        workspaceName: entry.workspaceName,
        label: entry.label,
      });
    }
  };

  return (
    <div className="welcome-page">
      {/* NodeDesk 大 Logo 背景——对标 VS Code 欢迎页，文字浮在 logo 上 */}
      <div className="welcome-logo-bg" aria-hidden="true">
        <svg viewBox="0 0 160 160">
          <polygon
            points="80,10 147,45 147,115 80,150 13,115 13,45"
            fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinejoin="round"
          />
          <circle cx="80" cy="46" r="8" fill="var(--text-muted)" />
          <circle cx="46" cy="108" r="8" fill="var(--text-muted)" />
          <circle cx="114" cy="108" r="8" fill="var(--text-muted)" />
        </svg>
      </div>

      <div className="welcome-scroll">
      <header className="welcome-hero">
        <h1 className="welcome-title">LinkDesk</h1>
        <p className="welcome-subtitle">{t("通用调试容器")}</p>
      </header>

      <section className="welcome-section">
        <h2 className="welcome-section-title">{t("开始")}</h2>
        {viewPlugins.length > 0 ? (
          <div className="welcome-card-grid">
            {viewPlugins.map((p) => (
              <button
                key={p.pluginId}
                className="welcome-card"
                onClick={() => handleShortcutClick(p.pluginId, p.manifest.name)}
                title={p.manifest.description ?? p.manifest.name}
              >
                <span className="welcome-card-icon">
                  {getPluginEmoji(p.pluginId)}
                </span>
                <span className="welcome-card-label">{t(p.manifest.name)}</span>
                {p.manifest.description && (
                  <span className="welcome-card-desc">{t(p.manifest.description)}</span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="welcome-empty">{t("暂无可用视图")}</p>
        )}
      </section>

      {recentViews.length > 0 && (
        <section className="welcome-section">
          <h2 className="welcome-section-title">{t("最近")}</h2>
          <div className="welcome-recent-list">
            {recentViews.slice(0, 10).map((entry, i) => (
              <button
                key={`${entry.pluginId}-${entry.workspaceName ?? ""}-${i}`}
                className="welcome-recent-item"
                onClick={() => handleRecentClick(entry)}
              >
                <span className="welcome-recent-icon">
                  {getPluginEmoji(entry.pluginId)}
                </span>
                <span className="welcome-recent-label">{t(entry.label)}</span>
                {entry.workspaceName && (
                  <span className="welcome-recent-workspace">{entry.workspaceName}</span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="welcome-section">
        <h2 className="welcome-section-title">{t("帮助")}</h2>
        <div className="welcome-help-links">
          <span className="welcome-help-item">📖 {t("使用文档")}</span>
          <span className="welcome-help-item">⌨ {t("键盘快捷键")}</span>
        </div>
      </section>
      </div>
    </div>
  );
}

/** 插件 ID → emoji 图标映射 */
function getPluginEmoji(pluginId: string): string {
  const map: Record<string, string> = {
    terminal: "\u{1F4DF}",   // 📟
    workspace: "\u{1F4CA}",  // 📊
    settings: "⚙️}", // ⚙
    marketplace: "\u{1F9E9}", // 🧩
  };
  return map[pluginId] ?? "\u{1F4C4}"; // 📄 fallback
}

/** 记录最近视图 */
function recordRecentView(pluginId: string, label: string, workspaceName?: string) {
  try {
    // Phase 5：写入 PluginStateService（替代 PreferenceService）
    const recent = getPluginStateValue<Array<{ pluginId: string; label: string; workspaceName?: string }>>("app", "recentViews") ?? [];
    // 去重：同一 pluginId + workspaceName 移到头部
    const filtered = recent.filter(
      (r) => !(r.pluginId === pluginId && r.workspaceName === workspaceName)
    );
    filtered.unshift({ pluginId, label: label || pluginId, workspaceName });
    setPluginStateValue("app", "recentViews", filtered.slice(0, 10));
  } catch {
    // 静默
  }
}

export default WelcomeView;
export { recordRecentView };
