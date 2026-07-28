/**
 * WelcomeView——空工作区欢迎视图。
 * E4a #92：对标 VS Code Explorer 空状态。
 *
 * 显示时机：WorkspaceService.roots.length === 0
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { openFolder, addFolder, onDidChangeFolders } from "@src/core/WorkspaceService";
import { getPluginStateValue, setPluginStateValue } from "@src/core/PluginStateService";

const PLUGIN_ID = "file-tree";
const RECENT_KEY = "recentFolders";
const MAX_RECENT = 10;

/* ── 组件 ── */

const WelcomeView: React.FC = () => {
  const { t } = useTranslation();
  const [recentFolders, setRecentFolders] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);

  /* ── 最近文件夹更新（必须在 useEffect 之前——const 暂时性死区） ── */

  const updateRecent = useCallback(async (uris: string[]) => {
    const stored = getPluginStateValue<string[]>(PLUGIN_ID, RECENT_KEY) ?? [];
    const merged = [...new Set([...uris, ...stored])].slice(0, MAX_RECENT);
    await setPluginStateValue(PLUGIN_ID, RECENT_KEY, merged);
    setRecentFolders(merged);
  }, []);

  /* ── 加载最近文件夹 ── */

  useEffect(() => {
    const stored = getPluginStateValue<string[]>(PLUGIN_ID, RECENT_KEY) ?? [];
    setRecentFolders(stored);

    // 监听新文件夹打开→追加到最近列表
    const unsub = onDidChangeFolders((folders) => {
      if (folders.length > 0) {
        const uris = folders.map((f) => f.uri);
        updateRecent(uris);
      }
    });
    return unsub;
  }, [updateRecent]);

  /* ── 打开文件夹 ── */

  const handleOpenFolder = useCallback(async () => {
    await openFolder();
  }, []);

  const handleOpenRecent = useCallback(async (folderPath: string) => {
    addFolder(folderPath);
  }, []);

  /* ── 拖放文件夹 ── */

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
    const file = e.dataTransfer.files[0];
    if (file?.path) {
      addFolder(file.path);
    }
  }, []);

  /* ── 渲染 ── */

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: 24,
        color: "var(--color-dimmed)",
        fontSize: 13,
        textAlign: "center",
        gap: 12,
        border: dragOver ? "2px dashed var(--color-accent)" : "2px solid transparent",
        borderRadius: 4,
        transition: "border-color 100ms ease-out",
      }}
    >
      <p style={{ margin: 0 }}>{t("你没有打开文件夹。")}</p>

      <button
        onClick={handleOpenFolder}
        style={{
          padding: "6px 16px",
          border: "1px solid var(--color-border)",
          borderRadius: 4,
          background: "var(--color-muted)",
          color: "var(--color-foreground)",
          cursor: "pointer",
          fontSize: 12,
        }}
      >
        {t("打开文件夹")}
      </button>

      {recentFolders.length > 0 && (
        <div style={{ marginTop: 16, width: "100%", maxWidth: 320 }}>
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: 8,
              textAlign: "left",
            }}
          >
            {t("最近")}
          </div>
          {recentFolders.map((folderPath) => (
            <button
              key={folderPath}
              onClick={() => handleOpenRecent(folderPath)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                width: "100%",
                padding: "6px 8px",
                border: "none",
                borderRadius: 4,
                background: "transparent",
                color: "var(--color-dimmed)",
                cursor: "pointer",
                fontSize: 12,
                textAlign: "left",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={folderPath}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "var(--color-muted)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "transparent";
              }}
            >
              <span className="codicon codicon-root-folder" style={{ fontSize: 14, flexShrink: 0 }} />
              {folderPath.split(/[/\\]/).pop()}
              <span style={{ fontSize: 11, opacity: 0.5, marginLeft: "auto", flexShrink: 0 }}>
                {folderPath}
              </span>
            </button>
          ))}
        </div>
      )}

      {dragOver && (
        <p style={{ margin: 0, color: "var(--color-accent)", fontSize: 12 }}>
          {t("释放以打开文件夹")}
        </p>
      )}
    </div>
  );
};

export default WelcomeView;
