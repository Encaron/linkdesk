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
import "./file-tree.css";

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
    <div className="file-tree-root file-tree-sidebar">
      {/* 标题栏 */}
      <div className="file-tree-header">{t("资源管理器")}</div>

      {/* 路径面包屑 */}
      {rootName && (
        <div className="file-tree-breadcrumb">
          <span className="codicon codicon-root-folder file-tree-breadcrumb-icon" />
          <span className="file-tree-breadcrumb-path">{rootName}</span>
        </div>
      )}

      {/* 工具栏 */}
      <div className="file-tree-toolbar">
        <button className="file-tree-toolbar-btn" title={t("新建文件")} onClick={() => {/* TODO E4b #98 */}}>
          <span className="codicon codicon-new-file" />
        </button>
        <button className="file-tree-toolbar-btn" title={t("新建文件夹")} onClick={() => {/* TODO E4b #98 */}}>
          <span className="codicon codicon-new-folder" />
        </button>
        <button className="file-tree-toolbar-btn" title={t("刷新")} onClick={handleRefresh}>
          <span className="codicon codicon-refresh" />
        </button>
        <button className="file-tree-toolbar-btn" title={t("收起全部")} onClick={handleCollapseAll}>
          <span className="codicon codicon-collapse-all" />
        </button>
      </div>

      {/* 文件树 或 空工作区 */}
      <div className="file-tree-body">
        {roots.length === 0 ? (
          <WelcomeView />
        ) : (
          <FileTree model={model} onOpenFile={handleOpenFile} />
        )}
      </div>
    </div>
  );
};

export default FileTreeSidebar;
