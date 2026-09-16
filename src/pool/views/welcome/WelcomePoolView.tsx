/**
 * WelcomePoolView——E5.6#16.7k-1。
 *
 * Pool 侧欢迎页。对标壳 WelcomeView.tsx，用 window.linkdesk.* IPC 替代 @src/core import。
 *
 * 🔴 欢迎页是标签页保底——所有插件都崩了它也必须能显示。
 *    因此不走 PluginComponent 管线，壳直接渲染。
 *    数据全部通过 window.linkdesk.* IPC，不 import @src/core。
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Folder, BookOpen } from "lucide-react";
import { PluginIcon } from "../../../components/shared/plugin-icon/PluginIcon";
import type { CreatableViewMeta } from "../../../core/types/pool/poolLayout";
import "./WelcomePoolView.css";

interface WelcomePoolViewProps {
  isActive: boolean;
  creatableViews?: CreatableViewMeta[];
}

interface RecentEntry {
  pluginId: string;
  label: string;
  workspaceName?: string;
}

interface RecentFolder {
  path: string;
  name: string;
}

export default function WelcomePoolView({ isActive: _isActive, creatableViews }: WelcomePoolViewProps) {
  const { t } = useTranslation();
  const api = window.linkdesk;

  const [recentFolders, setRecentFolders] = useState<RecentFolder[]>([]);
  const [recentViews, setRecentViews] = useState<RecentEntry[]>([]);

  // ── 加载数据 ──
  useEffect(() => {
    if (!api) return;
    (async () => {
      try {
        const rf = await api.pluginState?.get("app", "recentFolders");
        if (Array.isArray(rf)) setRecentFolders(rf);
      } catch { /* 静默 */ }
      try {
        const rv = await api.pluginState?.get("app", "recentViews");
        if (Array.isArray(rv)) setRecentViews(rv);
      } catch { /* 静默 */ }
    })();
  }, [api]);

  // ── 订阅文件夹变更 ──
  useEffect(() => {
    if (!api?.workspace?.onDidChangeFolders) return;
    const unsub = api.workspace.onDidChangeFolders(async () => {
      try {
        const folders = await api.workspace.getFolders();
        if (!folders?.length) return;
        const recent = (await api.pluginState?.get("app", "recentFolders")) ?? [];
        const arr = Array.isArray(recent) ? recent : [];
        for (const f of folders) {
          const filtered = arr.filter((r: RecentFolder) => r.path !== f.uri);
          filtered.unshift({ path: f.uri, name: f.name });
          await api.pluginState?.set("app", "recentFolders", filtered.slice(0, 10));
          setRecentFolders(filtered.slice(0, 10));
        }
      } catch { /* 静默 */ }
    });
    return () => { unsub?.(); };
  }, [api]);

  // ── Actions ──
  const handleOpenFolder = () => {
    api?.workspace?.openFolder();
  };

  const handleRecentFolderClick = (folderPath: string) => {
    api?.workspace?.addFolder(folderPath);
  };

  const handleShortcutClick = (pluginId: string, displayName: string) => {
    api?.pool?.tabAction({ action: "createTab", pluginId });
    recordRecentView(pluginId, displayName);
  };

  const recordRecentView = async (pluginId: string, label: string) => {
    try {
      const recent = (await api?.pluginState?.get("app", "recentViews")) ?? [];
      const arr: RecentEntry[] = Array.isArray(recent) ? recent : [];
      const filtered = arr.filter((r) => !(r.pluginId === pluginId && !r.workspaceName));
      filtered.unshift({ pluginId, label: label || pluginId });
      await api?.pluginState?.set("app", "recentViews", filtered.slice(0, 10));
    } catch { /* 静默 */ }
  };

  const handleRecentClick = (entry: RecentEntry) => {
    api?.pool?.tabAction({
      action: "createTab",
      pluginId: entry.pluginId,
      workspaceName: entry.workspaceName,
    });
  };

  return (
    <div className="ldk-welcome-page">
      <div className="ldk-welcome-logo-bg" aria-hidden="true">
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

      <div className="ldk-welcome-scroll">
        <header className="ldk-welcome-hero">
          <h1 className="ldk-welcome-title">LinkDesk</h1>
          <p className="ldk-welcome-subtitle">{t("通用调试容器")}</p>
        </header>

        <section className="ldk-welcome-section">
          <h2 className="ldk-welcome-section-title">{t("文件夹")}</h2>
          <button className="ldk-welcome-card ldk-welcome-open-folder" onClick={handleOpenFolder}>
            <FolderOpen size={24} className="ldk-welcome-card-icon" />
            <span className="ldk-welcome-card-label">{t("打开文件夹")}</span>
          </button>
          {recentFolders.length > 0 && (
            <div className="ldk-welcome-recent-list">
              <h3 className="welcome-recent-subtitle">{t("最近")}</h3>
              {recentFolders.slice(0, 5).map((f, i) => (
                <button
                  key={`${f.path}-${i}`}
                  className="ldk-welcome-recent-item"
                  onClick={() => handleRecentFolderClick(f.path)}
                  title={f.path}
                >
                  <Folder size={16} className="ldk-welcome-recent-icon" />
                  <span className="ldk-welcome-recent-label">{f.name}</span>
                  <span className="ldk-welcome-recent-workspace">{f.path}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="ldk-welcome-section">
          <h2 className="ldk-welcome-section-title">{t("开始")}</h2>
          {(creatableViews && creatableViews.length > 0) ? (
            <div className="ldk-welcome-card-grid">
              {creatableViews.map((v) => (
                <button
                  key={v.pluginId}
                  className="ldk-welcome-card"
                  onClick={() => handleShortcutClick(v.pluginId, v.label)}
                >
                  <PluginIcon pluginId={v.pluginId} className="ldk-welcome-card-icon" />
                  <span className="ldk-welcome-card-label">{t(v.label)}</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="ldk-welcome-empty">{t("暂无可用视图")}</p>
          )}
        </section>

        {recentViews.length > 0 && (
          <section className="ldk-welcome-section">
            <h2 className="ldk-welcome-section-title">{t("最近")}</h2>
            <div className="ldk-welcome-recent-list">
              {recentViews.slice(0, 10).map((entry, i) => (
                <button
                  key={`${entry.pluginId}-${entry.workspaceName ?? ""}-${i}`}
                  className="ldk-welcome-recent-item"
                  onClick={() => handleRecentClick(entry)}
                >
                  <PluginIcon pluginId={entry.pluginId} className="ldk-welcome-recent-icon" />
                  <span className="ldk-welcome-recent-label">{t(entry.label)}</span>
                  {entry.workspaceName && (
                    <span className="ldk-welcome-recent-workspace">{entry.workspaceName}</span>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="ldk-welcome-section">
          <h2 className="ldk-welcome-section-title">{t("帮助")}</h2>
          <div className="ldk-welcome-help-links">
            <span className="ldk-welcome-help-item"><BookOpen size={14} /> {t("使用文档")}</span>
            <span className="ldk-welcome-help-item">⌨ {t("键盘快捷键")}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
