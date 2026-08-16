/**
 * WelcomeView——空工作区欢迎视图。
 * E4a #92：对标 VS Code Explorer 空状态。
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { basename, normalizePath } from "../utils/pathUtils";

const lk = () => window.linkdesk;

const PLUGIN_ID = "file-tree";
const RECENT_KEY = "recentFolders";
const MAX_RECENT = 10;

/* ── 组件 ── */

const WelcomeView: React.FC = () => {
  const { t } = useTranslation();
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  /* ── 最近文件夹更新 ── */

  const updateRecent = useCallback(async (uris: string[]) => {
    const stored = (await window.linkdesk?.pluginState?.get<string[]>(PLUGIN_ID, RECENT_KEY)) ?? [];
    const merged = [...new Set([...uris, ...stored])].slice(0, MAX_RECENT);
    await window.linkdesk?.pluginState?.set(PLUGIN_ID, RECENT_KEY, merged);
    setRecentFolders(merged);
  }, []);

  /* ── 加载最近文件夹 ── */

  useEffect(() => {
    window.linkdesk?.pluginState?.get(PLUGIN_ID, RECENT_KEY).then((raw: unknown) => {
      const arr = (Array.isArray(raw) ? raw : []) as string[];
      // E4V#36c: 清理历史残留——去重 + 归一化（防旧数据含 \ 或重复路径如 工具软件/工具软件）
      const cleaned = [...new Set(arr.map((p: string) => normalizePath(p)))];
      if (cleaned.length !== arr.length || cleaned.some((p: string, i: number) => p !== arr[i])) {
        void window.linkdesk?.pluginState?.set(PLUGIN_ID, RECENT_KEY, cleaned);
      }
      setRecentFolders(cleaned);
    });
    const unsub = lk().workspace?.onDidChangeFolders(async () => {
      const folders = await lk().workspace.getFolders();
      if (folders.length > 0) {
        updateRecent(folders.map((f) => f.uri));
      }
    });
    return unsub;
  }, [updateRecent]);

  /* ── 打开文件夹 ── */

  const handleOpenFolder = useCallback(async () => {
    await lk().workspace.openFolder();
  }, []);

  const handleOpenRecent = useCallback(async (folderPath: string) => {
    lk().workspace.addFolder(folderPath);
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
    if (file?.path) lk().workspace.addFolder(file.path);
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
