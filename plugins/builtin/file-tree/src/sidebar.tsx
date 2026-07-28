/**
 * FileTreeSidebar——文件树侧栏包装。
 * E4a #90：路径面包屑 + 工具栏 + 文件树 / 空工作区欢迎。
 *
 * 对标 VS Code ExplorerView。
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getWorkspaceFolders, onDidChangeFolders, type WorkspaceFolder } from "@src/core/WorkspaceService";
import { CoreEvents } from "@src/core/CoreEvents";
import FileTree from "./FileTree";
import WelcomeView from "./WelcomeView";
import { FileTreeModel } from "./FileTreeModel";
import type { ExplorerItem } from "./FileTreeModel";

/* ── 常量 ── */

const TITLE_BAR_H = 28;
const BREADCRUMB_H = 28;
const TOOLBAR_H = 28;

/* ── 组件 ── */

const FileTreeSidebar: React.FC = () => {
  const { t } = useTranslation();
  const modelRef = useRef<FileTreeModel>(new FileTreeModel());
  const model = modelRef.current;

  const [roots, setRoots] = useState<WorkspaceFolder[]>([]);
  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  /* ── 同步工作区根 ── */

  const syncRoots = useCallback(async () => {
    const folders = getWorkspaceFolders();
    setRoots(folders);
    await model.setRoots(folders.map((f) => f.uri));
    rerender();
  }, [model, rerender]);

  useEffect(() => {
    syncRoots();
    const unsub1 = onDidChangeFolders(() => { syncRoots(); });
    const unsub2 = CoreEvents.onDidChangeFileSystem.event(() => {
      model.refresh().then(() => rerender());
    });
    return () => { unsub1(); unsub2(); };
  }, [syncRoots, model, rerender]);

  /* ── 打开文件（占位——E4c #103 FileAssociation 连线） ── */

  const handleOpenFile = useCallback((_item: ExplorerItem, _mode: "preview" | "pin") => {
    // TODO E4c #103: 通过 FileAssociationService 打开编辑器
  }, []);

  /* ── 工具栏操作 ── */

  const handleRefresh = useCallback(async () => {
    await model.refresh();
    rerender();
  }, [model, rerender]);

  const handleCollapseAll = useCallback(() => {
    model.collapseAll();
    rerender();
  }, [model, rerender]);

  /* ── 渲染 ── */

  const rootName = roots[0]?.name ?? "";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* 标题栏 */}
      <div
        style={{
          height: TITLE_BAR_H,
          display: "flex",
          alignItems: "center",
          padding: "0 12px",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: "var(--color-dimmed, #94A3B8)",
          flexShrink: 0,
        }}
      >
        {t("资源管理器")}
      </div>

      {/* 路径面包屑 */}
      {rootName && (
        <div
          style={{
            height: BREADCRUMB_H,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            fontSize: 12,
            color: "var(--color-dimmed, #94A3B8)",
            flexShrink: 0,
            borderBottom: "1px solid var(--color-border, #1E293B)",
          }}
        >
          <span className="codicon codicon-root-folder" style={{ marginRight: 6, fontSize: 14 }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {rootName}
          </span>
        </div>
      )}

      {/* 工具栏 */}
      <div
        style={{
          height: TOOLBAR_H,
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 8px",
          flexShrink: 0,
        }}
      >
        <ToolbarButton icon="codicon-new-file" title={t("新建文件")} onClick={() => {/* TODO E4b #98 */}} />
        <ToolbarButton icon="codicon-new-folder" title={t("新建文件夹")} onClick={() => {/* TODO E4b #98 */}} />
        <ToolbarButton icon="codicon-refresh" title={t("刷新")} onClick={handleRefresh} />
        <ToolbarButton icon="codicon-collapse-all" title={t("收起全部")} onClick={handleCollapseAll} />
      </div>

      {/* 文件树 或 空工作区 */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {roots.length === 0 ? (
          <WelcomeView />
        ) : (
          <FileTree model={model} onOpenFile={handleOpenFile} />
        )}
      </div>
    </div>
  );
};

/* ── 工具栏按钮 ── */

const ToolbarButton: React.FC<{
  icon: string;
  title: string;
  onClick: () => void;
}> = ({ icon, title, onClick }) => (
  <button
    title={title}
    onClick={onClick}
    style={{
      width: 22,
      height: 22,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      border: "none",
      background: "transparent",
      color: "var(--color-dimmed, #94A3B8)",
      cursor: "pointer",
      borderRadius: 4,
      padding: 0,
    }}
    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-foreground, #F8FAFC)"; }}
    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--color-dimmed, #94A3B8)"; }}
  >
    <span className={`codicon ${icon}`} style={{ fontSize: 14 }} />
  </button>
);

export default FileTreeSidebar;
