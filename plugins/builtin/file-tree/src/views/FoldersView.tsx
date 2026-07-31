/**
 * FoldersView——文件树视图。
 * E3.6：从 sidebar.tsx 提取——SidePanel 统画 header，此处只负责内容。
 *
 * 对标 VS Code ExplorerView 的 FOLDERS section。
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { executeCommand } from "@src/core/CommandRegistry";
import { getConfigurationValue, onDidChangeConfiguration } from "@src/core/ConfigurationService";
import { getWorkspaceFolders, onDidChangeFolders, type WorkspaceFolder } from "@src/core/WorkspaceService";
import { ViewContainerService } from "@src/core/ViewContainerService";
import { CoreEvents } from "@src/core/CoreEvents";
import { ContextKeyService } from "@src/core/ContextKeyService";
import { readFile, exists, watchFile } from "@src/core/FileService";
import FileTree from "../FileTree";
import FileTreeContextMenu, { activateFileTreeContextMenu, setFileTreeRefs, clearFileTreeRefs } from "../FileTreeContextMenu";
import WelcomeView from "../WelcomeView";
import { FileTreeModel } from "../FileTreeModel";
import type { ExplorerItem } from "../FileTreeModel";
import { FileExcludeFilter } from "../FileExcludeFilter";
import { joinPath } from "../pathUtils";
import "../file-tree.css";

const FoldersView: React.FC = () => {
  const { t } = useTranslation();
  const modelRef = useRef<FileTreeModel>(new FileTreeModel());
  const model = modelRef.current;
  const filterRef = useRef<FileExcludeFilter>(new FileExcludeFilter());
  const _unwatchRef = useRef<(() => void) | null>(null);

  const [roots, setRoots] = useState<WorkspaceFolder[]>([]);
  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  /* ── 注册 explorer 命令 + FileContext 菜单项 + ref 桥接 ── */
  useEffect(() => {
    activateFileTreeContextMenu();
    setFileTreeRefs(model);
    return () => { clearFileTreeRefs(); };
  }, [model, rerender]);

  /* ── 右键菜单状态 ── */
  const [contextMenu, setContextMenu] = useState<{
    item: ExplorerItem | null;
    anchor: { x: number; y: number };
  } | null>(null);

  const handleContextMenu = useCallback(
    (item: ExplorerItem, event: React.MouseEvent) => {
      event.preventDefault();
      // E4V#12 fix: setState 前设 context key——确保菜单 when 求值时已生效
      ContextKeyService.setValue("explorerItemIsFile", item.isDirectory === false);
      ContextKeyService.setValue("explorerItemIsDir", item.isDirectory === true);
      ContextKeyService.setValue("explorerItemIsRoot", item.parent === null);
      ContextKeyService.setValue("explorerResourceReadonly", item.isReadonly === true);
      setContextMenu({ item, anchor: { x: event.clientX, y: event.clientY } });
    },
    [],
  );

  /* ── 同步工作区根 ── */
  // 🛡️ _loadingPromise guard——防 StrictMode 双重 effect + onDidChangeFolders 快速触发
  // E4V#35 setRoots 可能异步化后，并发 syncRoots 会残留旧文件夹。
  const _syncGuardRef = useRef<Promise<void> | null>(null);
  const syncRoots = useCallback(async () => {
    if (_syncGuardRef.current) { console.log("[fs-watch] syncRoots SKIP (guard active)"); return _syncGuardRef.current; }
    console.log("[fs-watch] syncRoots START at %ds", ((Date.now() - performance.timeOrigin) / 1000).toFixed(1));
    const promise = (async () => {
      const folders = getWorkspaceFolders();
      setRoots(folders);
      await model.setRoots(folders.map((f) => f.uri));
      // E4V#8a: filter 必须在 getChildren 之前设置——否则首次加载不过滤
      const filter = filterRef.current;
      const excludeCfg = getConfigurationValue<Record<string, boolean>>("files.exclude") ?? {};
      filter.configure(excludeCfg);
      filter.clearGitignore();
      for (const f of folders) {
        const gitignorePath = joinPath(f.uri, ".gitignore");
        if (await exists(gitignorePath)) {
          try {
            const content = await readFile(gitignorePath);
            filter.setGitignore(content);
          } catch { /* 读取失败静默跳过 */ }
        }
      }
      model.setExcludeFilter(filter);
      // 启动文件监听——外部变更实时刷新
      if (_unwatchRef.current) { _unwatchRef.current(); _unwatchRef.current = null; }
      if (folders.length > 0) {
        try {
          _unwatchRef.current = await watchFile(folders[0].uri, (event) => {
            console.log("[fs-watch] watcher callback at %ds: %s %s",
              ((Date.now() - performance.timeOrigin) / 1000).toFixed(1),
              event.type, event.path);
            CoreEvents.onDidChangeFileSystem.fire([event]);
          });
        } catch { /* watcher 启动失败静默 */ }
      }
      rerender();
    })().finally(() => { _syncGuardRef.current = null; });
    _syncGuardRef.current = promise;
    return promise;
  }, [model, rerender]);

  useEffect(() => {
    syncRoots();
    const unsub1 = onDidChangeFolders(() => { syncRoots(); });
    const unsub2 = CoreEvents.onDidChangeFileSystem.event((events) => {
      console.log("[fs-watch] TRIGGER at %ds: %d events, expanded=%d",
        ((Date.now() - performance.timeOrigin) / 1000).toFixed(1),
        events.length, model.getExpandedUris().length);
      model.refresh().then(async () => {
        for (const uri of model.getExpandedUris()) {
          const item = model.findClosest(uri);
          if (item) await model.getChildren(item).catch(() => {});
        }
        console.log("[fs-watch] RELOAD done at %ds, expanded=%d",
          ((Date.now() - performance.timeOrigin) / 1000).toFixed(1),
          model.getExpandedUris().length);
        rerender();
      });
    });
    // E4V#8a: 订阅 files.exclude 变化→重新配置过滤器+刷新
    const unsub3 = onDidChangeConfiguration((key, _value) => {
      if (key === "files.exclude") {
        const filter = filterRef.current;
        const excludeCfg = getConfigurationValue<Record<string, boolean>>("files.exclude") ?? {};
        filter.configure(excludeCfg);
        model.refresh().then(() => rerender());
      }
    });
    return () => {
      unsub1(); unsub2(); unsub3();
      if (_unwatchRef.current) { _unwatchRef.current(); _unwatchRef.current = null; }
    };
  }, [syncRoots, model, rerender]);

  /* ── 🆕 E3.6 TB6：FOLDERS view 动态标题 = 工作区文件夹名 ──
   * E36#ROLE：role 字段保证始终 sectionViews——title 可安全为空，不再需要 " " 占位。
   * E4V#35：多根时标题走 workspace name。 */
  useEffect(() => {
    const updateTitle = () => {
      const folders = getWorkspaceFolders();
      const title = folders[0]?.name ?? "";
      const existing = ViewContainerService.getView("folders");
      ViewContainerService.registerView("file-tree", "explorer", {
        id: "folders",
        title,
        render: existing?.render ?? (() => null),
        // E4V#20f: 工具栏迁移到 header actions——对标 VS Code ▶ FOLDERS [+][🔄][⊟]
        actions: (
          <>
            <button className="file-tree-toolbar-btn" title={t("新建文件")} onClick={() => executeCommand("explorer.newFile")}>
              <span className="codicon codicon-new-file" />
            </button>
            <button className="file-tree-toolbar-btn" title={t("新建文件夹")} onClick={() => executeCommand("explorer.newFolder")}>
              <span className="codicon codicon-new-folder" />
            </button>
            <button className="file-tree-toolbar-btn" title={t("刷新")} onClick={() => executeCommand("explorer.refresh")}>
              <span className="codicon codicon-refresh" />
            </button>
            <button className="file-tree-toolbar-btn" title={t("收起全部")} onClick={() => executeCommand("explorer.collapseAll")}>
              <span className="codicon codicon-collapse-all" />
            </button>
          </>
        ),
      });
    };
    updateTitle();
    const unsub = onDidChangeFolders(updateTitle);
    return unsub;
  }, [t]);

  /* ── 打开文件 ── */
  const handleOpenFile = useCallback((_item: ExplorerItem, _mode: "preview" | "pin") => {
    // TODO E4c #103
  }, []);

  return (
    <div className="file-tree-root">
      {/* 文件树 或 空工作区——工具栏已迁移到 header actions（E4V#20f） */}
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
