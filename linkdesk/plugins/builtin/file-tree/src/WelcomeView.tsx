/**
 * WelcomeView——空工作区欢迎视图。
 * E4a #92：对标 VS Code Explorer 空状态。
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { openFolder, addFolder, onDidChangeFolders } from "@src/core/WorkspaceService";
import { getPluginStateValue, setPluginStateValue } from "@src/core/PluginStateService";
import { basename, normalizePath } from "./pathUtils";

const PLUGIN_ID = "file-tree";
const RECENT_KEY = "recentFolders";
const MAX_RECENT = 10;

/* ── 组件 ── */

const WelcomeView: React.FC = () => {
  console.log("[WelcomeView] 组件挂载");
  const { t } = useTranslation();
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  /* ── 最近文件夹更新 ── */

  const updateRecent = useCallback(async (uris: string[]) => {
    const stored = getPluginStateValue<string[]>(PLUGIN_ID, RECENT_KEY) ?? [];
    const merged = [...new Set([...uris, ...stored])].slice(0, MAX_RECENT);
    await setPluginStateValue(PLUGIN_ID, RECENT_KEY, merged);
    setRecentFolders(merged);
  }, []);

  /* ── 加载最近文件夹 ── */

  useEffect(() => {
    const raw = getPluginStateValue<string[]>(PLUGIN_ID, RECENT_KEY) ?? [];
    // E4V#36c: 清理历史残留——去重 + 归一化（防旧数据含 \ 或重复路径如 工具软件/工具软件）
    const cleaned = [...new Set(raw.map((p) => normalizePath(p)))];
    if (cleaned.length !== raw.length || cleaned.some((p, i) => p !== raw[i])) {
      void setPluginStateValue(PLUGIN_ID, RECENT_KEY, cleaned);
    }
    setRecentFolders(cleaned);

    const unsub = onDidChangeFolders((folders) => {
      if (folders.length > 0) {
        updateRecent(folders.map((f) => f.uri));
      }
    });
    return unsub;
  }, [updateRecent]);

  /* ── 打开文件夹 ── */

  const handleOpenFolder = useCallback(async () => {
    console.log("[WelcomeView] handleOpenFolder 点击");
    try {
      await openFolder();
      console.log("[WelcomeView] openFolder 成功");
    } catch (e) {
      console.error("[WelcomeView] openFolder 失败", e);
    }
  }, []);

  const handleOpenRecent = useCallback(async (folderPath: string) => {
    console.log("[WelcomeView] handleOpenRecent", folderPath);
    addFolder(folderPath);
  }, []);

  /* ── 拖放 ── */

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0] as (File & { path?: string }) | null;
    if (file?.path) addFolder(file.path);
  }, []);

  /* ── 渲染 ── */

  const welcomeClass = [
    "file-tree-welcome",
    dragOver && "file-tree-welcome--dragover",
  ].filter(Boolean).join(" ");

  return (
    <div className={welcomeClass} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <p>{t("你没有打开文件夹。")}</p>

      <button className="file-tree-welcome-btn" onClick={handleOpenFolder}>
        {t("打开文件夹")}
      </button>

      {recentFolders.length > 0 && (
        <div className="file-tree-recent">
          <div className="file-tree-recent-title">{t("最近")}</div>
          {recentFolders.map((folderPath) => (
            <button
              key={folderPath}
              className="file-tree-recent-item"
              title={folderPath}
              onClick={() => handleOpenRecent(folderPath)}
            >
              <span className="codicon codicon-root-folder file-tree-recent-item-icon" />
              {basename(folderPath)}
              <span className="file-tree-recent-item-path">{folderPath}</span>
            </button>
          ))}
        </div>
      )}

      {dragOver && <p className="file-tree-dragover-hint">{t("释放以打开文件夹")}</p>}
    </div>
  );
};

export default WelcomeView;
