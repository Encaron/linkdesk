
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

import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getTabCreatableViews } from "../../pluginLoader/viewRegistry";
// Phase 5f：PreferenceService 兜底读清理——recentViews 已完全迁移到 PluginStateService
import { FolderOpen, Folder, BookOpen } from "lucide-react"; // E5#100
import { getPluginStateValue, setPluginStateValue } from "../../core/services/PluginStateService";
import { openFolder, addFolder, onDidChangeFolders } from "../../core/services/WorkspaceService"; // E3f #55
import { PluginIcon } from "../shared/PluginIcon";
import "./WelcomeView.css";

interface WelcomeViewProps {
  isActive: boolean;
  onCreateTab?: (type: string, opts?: { workspaceName?: string; label?: string }) => string;
}

function WelcomeView({ isActive: _isActive, onCreateTab }: WelcomeViewProps) {
  const { t } = useTranslation();

  const viewPlugins = getTabCreatableViews();
  const recentViews = (() => {
    try {
      return getPluginStateValue<Array<{ pluginId: string; label: string; workspaceName?: string }>>("app", "recentViews") ?? [];
    } catch {
      return [];
    }
  })();

  // E3f #55：最近文件夹——对标 VS Code File > Open Recent
  const recentFolders = (() => {
    try {
      return getPluginStateValue<Array<{ path: string; name: string }>>("app", "recentFolders") ?? [];
    } catch {
      return [];
    }
  })();

  const handleOpenFolder = () => { openFolder(); };

  const handleRecentFolderClick = (folderPath: string) => { addFolder(folderPath); };

  // 订阅文件夹变更——自动记录到 recentFolders
  useEffect(() => {
    const unsub = onDidChangeFolders((folders) => {
      if (folders.length === 0) return;
      const recent = getPluginStateValue<Array<{ path: string; name: string }>>("app", "recentFolders") ?? [];
      for (const f of folders) {
        const filtered = recent.filter((r) => r.path !== f.uri);
        filtered.unshift({ path: f.uri, name: f.name });
        setPluginStateValue("app", "recentFolders", filtered.slice(0, 10));
      }
    });
    return unsub;
  }, []);

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

      {/* E3f #55：打开文件夹 */}
      <section className="welcome-section">
        <h2 className="welcome-section-title">{t("文件夹")}</h2>
        <button className="welcome-card welcome-open-folder" onClick={handleOpenFolder}>
          <FolderOpen size={24} className="welcome-card-icon" />
          <span className="welcome-card-label">{t("打开文件夹")}</span>
        </button>
        {recentFolders.length > 0 && (
          <div className="welcome-recent-list">
            <h3 className="welcome-recent-subtitle">{t("最近")}</h3>
            {recentFolders.slice(0, 5).map((f, i) => (
              <button
                key={`${f.path}-${i}`}
                className="welcome-recent-item"
                onClick={() => handleRecentFolderClick(f.path)}
                title={f.path}
              >
                <Folder size={16} className="welcome-recent-icon" />
                <span className="welcome-recent-label">{f.name}</span>
                <span className="welcome-recent-workspace">{f.path}</span>
              </button>
            ))}
          </div>
        )}
      </section>

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
                <PluginIcon pluginId={p.pluginId} className="welcome-card-icon" />
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
                <PluginIcon pluginId={entry.pluginId} className="welcome-recent-icon" />
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
          <span className="welcome-help-item"><BookOpen size={14} /> {t("使用文档")}</span>
          <span className="welcome-help-item">⌨ {t("键盘快捷键")}</span>
        </div>
      </section>
      </div>
    </div>
  );
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
