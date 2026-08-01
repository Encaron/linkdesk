/**
 * FoldersView——文件树视图。
 * E3.6：从 sidebar.tsx 提取——SidePanel 统画 header，此处只负责内容。
 *
 * 对标 VS Code ExplorerView 的 FOLDERS section。
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { executeCommand } from "@src/core/CommandRegistry";
import { getConfigurationValue } from "@src/core/ConfigurationService";
import { useConfigurationValue } from "@src/core/useConfiguration";
import { getWorkspaceFolders, onDidChangeFolders, type WorkspaceFolder } from "@src/core/WorkspaceService";
import { setPluginStateValue, getPluginStateValue } from "@src/core/PluginStateService";
import { ViewContainerService } from "@src/core/ViewContainerService";
import { CoreEvents } from "@src/core/CoreEvents";
import { ContextKeyService } from "@src/core/ContextKeyService";
import { readFile, exists, watchFile } from "@src/core/FileService";
import { useTabActions } from "@src/core/TabActionsContext";
import { getPluginFor } from "@src/core/FileAssociationService";
import FileTree from "../FileTree";
import FileTreeContextMenu, { activateFileTreeContextMenu, setFileTreeHandleRef, clearFileTreeHandle, setOpenFileFn } from "../FileTreeContextMenu";
import { FileTreeDecorationService } from "../FileTreeDecoration";
import WelcomeView from "../WelcomeView";
import { FileTreeModel } from "../FileTreeModel";
import type { FileTreeHandle } from "../FileTree";
import type { ExplorerItem } from "../FileTreeModel";
import { FileExcludeFilter } from "../FileExcludeFilter";
import { joinPath, normalizePath, extension } from "../pathUtils";
import "../file-tree.css";

const FoldersView: React.FC = () => {
  const { t } = useTranslation();
  const tabActions = useTabActions();
  const modelRef = useRef<FileTreeModel>(new FileTreeModel());
  const model = modelRef.current;
  const filterRef = useRef<FileExcludeFilter>(new FileExcludeFilter());
  /** E4V#35 R15-1: 多根 watcher——每个根独立监听，E4V#56 已隔离 IPC 频道 */
  const _watchersRef = useRef<Array<() => void>>([]);
  const _debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [roots, setRoots] = useState<WorkspaceFolder[]>([]);
  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  /* ── 注册 explorer 命令 + FileContext 菜单项 + 🔥 归一化桥接 ── */
  const fileTreeRef = useRef<FileTreeHandle>(null);

  useEffect(() => {
    activateFileTreeContextMenu();
    return () => { clearFileTreeHandle(); };
  }, []);

  // 🔥 传 ref 对象本身（非 .current 快照）——命令 handler 每次读 .current 拿最新 handle
  setFileTreeHandleRef(fileTreeRef);

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

  /* ── E4V#32: autoReveal——切标签页时文件树自动定位 ── */
  const autoReveal = useConfigurationValue<boolean>("explorer.autoReveal") ?? true;
  useEffect(() => {
    if (!autoReveal) return;
    const unsub = CoreEvents.onDidChangeActiveTab.event(({ filePath }) => {
      if (!filePath) return;
      fileTreeRef.current?.reveal(filePath);
    });
    return unsub;
  }, [autoReveal]);

  /* ── E4V#31: 文件装饰器消费——订阅 FileDecorationRegistry → 模型变更时 decorate 节点 ── */
  const decoServiceRef = useRef<FileTreeDecorationService>(new FileTreeDecorationService(model));
  const decoService = decoServiceRef.current;

  // 装饰器回调——getChildren 创建新节点后应用装饰
  useEffect(() => {
    model.setDecorator((items) => items.forEach((i) => decoService.decorate(i)));
    decoService.attach();
    return () => {
      model.setDecorator(null);
      decoService.detach();
    };
  }, [model, decoService]);

  /* ── 同步工作区根 ── */
  // 🛡️ _loadingPromise guard——防 StrictMode 双重 effect + onDidChangeFolders 快速触发
  // E4V#35 setRoots 可能异步化后，并发 syncRoots 会残留旧文件夹。
  const _syncGuardRef = useRef<Promise<void> | null>(null);
  const syncRoots = useCallback(async () => {
    if (_syncGuardRef.current) return _syncGuardRef.current;
    const promise = (async () => {
      const folders = getWorkspaceFolders();
      setRoots(folders);
      await model.setRoots(folders.map((f) => f.uri));
      // E4V#8a: filter 必须在 getChildren 之前设置——否则首次加载不过滤
      const filter = filterRef.current;
      const excludeCfg = getConfigurationValue<Record<string, boolean>>("files.exclude") ?? {};
      filter.configure(excludeCfg);
      // E4V#34g1: explorer.excludeGitIgnore 开关——默认 true
      filter.clearGitignore();
      if ((getConfigurationValue<boolean>("explorer.excludeGitIgnore") ?? true)) {
        for (const f of folders) {
          const gitignorePath = joinPath(f.uri, ".gitignore");
          if (await exists(gitignorePath)) {
            try {
              const content = await readFile(gitignorePath);
              filter.setGitignore(content);
            } catch { /* 读取失败静默跳过 */ }
          }
        }
      }
      model.setExcludeFilter(filter);
      // E4V#36b: 恢复展开状态——逐层重建（浅层先于深层，确保 findClosest 能找到父节点）
      const savedUris = getPluginStateValue<string[]>("file-tree", "expandedUris");
      if (savedUris && savedUris.length > 0) {
        const currentRoots = model.roots;
        const toExpand = savedUris
          .map((u) => normalizePath(u))
          .filter((u) => currentRoots.some((r) => u === r.uri || u.startsWith(r.uri + "/")));
        // 按深度排序——父目录先于子目录
        toExpand.sort((a, b) => a.split("/").length - b.split("/").length);
        for (const uri of toExpand) {
          model.expand(uri);
          const item = model.findClosest(uri);
          if (item) await model.getChildren(item).catch(() => {});
        }
      }
      // E4V#34i: explorer.expandSingleFolderWorkspaces——单目录工作区自动展开根
      if ((getConfigurationValue<boolean>("explorer.expandSingleFolderWorkspaces") ?? true)
          && folders.length === 1) {
        const root = model.roots[0];
        if (root) {
          await model.getChildren(root).catch(() => {});
          const dirs = root.children?.filter((c) => c.isDirectory) ?? [];
          if (dirs.length === 1) {
            model.expand(root.uri);
            model.expand(dirs[0].uri);
            await model.getChildren(dirs[0]).catch(() => {});
          }
        }
      }
      // E4V#35 R15-1: 多根 watcher——每个根独立监听
      _watchersRef.current.forEach((u) => u());
      _watchersRef.current = [];
      for (const f of folders) {
        try {
          const unwatch = await watchFile(f.uri, (event) => {
            CoreEvents.onDidChangeFileSystem.fire([event]);
          });
          _watchersRef.current.push(unwatch);
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
    // E4V#fix: 文件变更防抖——300ms 内累积的变更合并为一次 refresh。
    // 背景：onFileChange IPC 监听是全局的（所有 watcher 共享 filesystem:changed 频道），
    // 批量文件操作（npm install / git checkout / appData 写入）会产生数十个事件，
    // 每个都触发 refresh → 并发竞态 → 展开目录缩回（twistie ▼ 但 children 为空）。
    const unsub2 = CoreEvents.onDidChangeFileSystem.event((events) => {
      const folders = getWorkspaceFolders();
      const inWorkspace = events.some(e => folders.some(f => {
        const np = normalizePath(e.path);
        const nr = normalizePath(f.uri);
        return np === nr || np.startsWith(nr + "/");
      }));
      if (!inWorkspace) return;
      // 防抖：清掉上次定时器，300ms 无新事件才执行
      if (_debounceRef.current) clearTimeout(_debounceRef.current);
      _debounceRef.current = setTimeout(async () => {
        _debounceRef.current = null;
        // 🔥 定向 refresh：变更路径是目录→直接刷新，是文件→刷新父目录
        // Windows fs.watch 即使 recursive=false 也会对子目录变更报目录名
        const affectedDirs = new Set<string>();
        for (const e of events) {
          const absPath = normalizePath(e.path);
          const item = model.findClosest(absPath);
          const dir = (item?.isDirectory) ? absPath : absPath.substring(0, absPath.lastIndexOf("/"));
          if (dir) affectedDirs.add(dir); else affectedDirs.add(absPath);
        }
        for (const dir of affectedDirs) {
          await model.refresh(dir);
          const item = model.findClosest(dir);
          if (item && model.isExpanded(item.uri)) await model.getChildren(item).catch(() => {});
        }
        if (affectedDirs.size === 0) {
          await model.refresh();
          for (const uri of model.getExpandedUris()) {
            const item = model.findClosest(uri);
            if (item) await model.getChildren(item).catch(() => {});
          }
        }
        rerender();
      }, 300);
    });
    return () => {
      unsub1(); unsub2();
      if (_debounceRef.current) clearTimeout(_debounceRef.current);
      _watchersRef.current.forEach((u) => u());
      _watchersRef.current = [];
    };
  }, [syncRoots, model, rerender]);

  /* ── 🔥 归一化配置订阅——useConfigurationValue = 读+订阅一行搞定 ── */
  const excludeCfg = useConfigurationValue<Record<string, boolean>>("files.exclude");
  const compactFolders = useConfigurationValue<boolean>("explorer.compactFolders");
  const excludeGitIgnore = useConfigurationValue<boolean>("explorer.excludeGitIgnore");
  const isInitialMount = useRef(true);

  // files.exclude 变更 → 重配 filter + 刷新
  useEffect(() => {
    if (isInitialMount.current) return;
    if (excludeCfg === undefined) return;
    const filter = filterRef.current;
    filter.configure(excludeCfg);
    model.refresh().then(() => rerender());
  }, [excludeCfg, model, rerender]);

  // compactFolders 变更 → 触发 useMemo 重算 flattenTree
  useEffect(() => {
    if (isInitialMount.current) return;
    if (compactFolders === undefined) return;
    model.onDidChange.fire();
  }, [compactFolders, model]);

  // excludeGitIgnore 变更 → 重新读/清 .gitignore
  useEffect(() => {
    if (isInitialMount.current) return;
    if (excludeGitIgnore === undefined) return;
    (async () => {
      const filter = filterRef.current;
      filter.clearGitignore();
      if (excludeGitIgnore) {
        const folders = getWorkspaceFolders();
        for (const f of folders) {
          const gitignorePath = joinPath(f.uri, ".gitignore");
          if (await exists(gitignorePath)) {
            try {
              const content = await readFile(gitignorePath);
              filter.setGitignore(content);
            } catch { /* skip */ }
          }
        }
      }
      await model.refresh();
      for (const uri of model.getExpandedUris()) {
        const item = model.findClosest(uri);
        if (item) await model.getChildren(item).catch(() => {});
      }
      rerender();
    })();
  }, [excludeGitIgnore, model, rerender]);

  /** E4V#36a: 展开状态持久化——debounce 500ms + unmount 清 timer */
  const _expandSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsub = model.onDidChange.event(() => {
      if (_expandSaveTimerRef.current) clearTimeout(_expandSaveTimerRef.current);
      _expandSaveTimerRef.current = setTimeout(() => {
        _expandSaveTimerRef.current = null;
        const uris = model.getExpandedUris();
        if (uris.length > 0) {
          setPluginStateValue("file-tree", "expandedUris", uris).catch(() => {});
        }
      }, 500);
    });
    return () => {
      unsub();
      if (_expandSaveTimerRef.current) clearTimeout(_expandSaveTimerRef.current);
    };
  }, [model]);

  // 首个 effect 触发后翻转标记——后续变更正常响应
  useEffect(() => { isInitialMount.current = false; }, []);

  /* ── 🆕 E3.6 TB6：FOLDERS view 动态标题 = 工作区文件夹名 ──
   * E36#ROLE：role 字段保证始终 sectionViews——title 可安全为空，不再需要 " " 占位。
   * E4V#35：多根时标题走 workspace name。
   * E4V#56+P2：pinnedContent——sticky scroll 已移除（E4V#57 放弃）。 */
  useEffect(() => {
    const updateTitle = () => {
      const folders = getWorkspaceFolders();
      // E4V#35f: 单根→根名，多根→"工作区"（对标 VS Code WORKSPACE）
      const title = folders.length === 1 ? folders[0].name : (folders.length > 1 ? t("工作区") : "");
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
  /** 核心逻辑：扩展名 → FileAssociationService → createTab */
  const doOpenFile = useCallback((filePath: string, name: string, mode: "preview" | "pin") => {
    const ext = extension(name);
    if (!ext) {
      console.warn(`[file-tree] 无法识别文件类型（无扩展名: ${name}）`);
      return;
    }
    const pluginId = getPluginFor(ext);
    if (!pluginId) {
      console.warn(`[file-tree] 没有注册处理 ".${ext}" 的编辑器（文件: ${name}）`);
      return;
    }
    tabActions?.createTab(pluginId, {
      filePath,
      label: name,
      pinned: mode === "pin",
    });
  }, [tabActions]);

  const handleOpenFile = useCallback((item: ExplorerItem, mode: "preview" | "pin") => {
    doOpenFile(item.uri, item.name, mode);
  }, [doOpenFile]);

  // 🔥 桥接 openFile 到模块级命令 handler——FileTreeContextMenu 中的命令通过此桥创建标签页
  useEffect(() => {
    setOpenFileFn(doOpenFile);
    return () => { setOpenFileFn(null); };
  }, [doOpenFile]);

  return (
    <div className="file-tree-root">
      {/* 文件树 或 空工作区——工具栏已迁移到 header actions（E4V#20f） */}
      <div className="file-tree-body">
        {roots.length === 0 ? (
          <WelcomeView />
        ) : (
          <FileTree ref={fileTreeRef} model={model} onOpenFile={handleOpenFile} onContextMenu={handleContextMenu} />
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
