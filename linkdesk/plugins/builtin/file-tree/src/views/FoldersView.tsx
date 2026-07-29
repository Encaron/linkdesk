/**
 * FoldersView——文件树视图。
 * E3.6：从 sidebar.tsx 提取——SidePanel 统画 header，此处只负责内容。
 *
 * 对标 VS Code ExplorerView 的 FOLDERS section。
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getWorkspaceFolders, onDidChangeFolders, type WorkspaceFolder } from "@src/core/WorkspaceService";
import { CoreEvents } from "@src/core/CoreEvents";
import FileTree from "../FileTree";
import FileTreeContextMenu, { activateFileTreeContextMenu } from "../FileTreeContextMenu";
import WelcomeView from "../WelcomeView";
import { FileTreeModel } from "../FileTreeModel";
import type { ExplorerItem } from "../FileTreeModel";
import "../file-tree.css";

const FoldersView: React.FC = () => {
  const { t } = useTranslation();
  const modelRef = useRef<FileTreeModel>(new FileTreeModel());
  const model = modelRef.current;

  const [roots, setRoots] = useState<WorkspaceFolder[]>([]);
  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  /* ── 注册 explorer 命令 + FileContext 菜单项 ── */
  useEffect(() => { activateFileTreeContextMenu(); }, []);

  /* ── 右键菜单状态 ── */
  const [contextMenu, setContextMenu] = useState<{
    item: ExplorerItem | null;
    anchor: { x: number; y: number };
  } | null>(null);

  const handleContextMenu = useCallback(
    (item: ExplorerItem, event: React.MouseEvent) => {
      event.preventDefault();
      setContextMenu({ item, anchor: { x: event.clientX, y: event.clientY } });
    },
    [],
  );

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

  /* ── 打开文件 ── */
  const handleOpenFile = useCallback((_item: ExplorerItem, _mode: "preview" | "pin") => {
    // TODO E4c #103
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

  const rootName = roots[0]?.name ?? "";

  return (
    <div className="file-tree-root">
      {/* 路径面包屑 */}
      {rootName && (
        <div className="file-tree-breadcrumb">
          <span className="codicon codicon-root-folder file-tree-breadcrumb-icon" />
          <span className="file-tree-breadcrumb-path">{rootName}</span>
        </div>
      )}

      {/* 工具栏 */}
      <div className="file-tree-toolbar">
        <button className="file-tree-toolbar-btn" title={t("新建文件")}>
          <span className="codicon codicon-new-file" />
        </button>
        <button className="file-tree-toolbar-btn" title={t("新建文件夹")}>
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
          <FileTree model={model} onOpenFile={handleOpenFile} onContextMenu={handleContextMenu} />
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <FileTreeContextMenu
          item={contextMenu.item}
          anchor={contextMenu.anchor}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default FoldersView;
