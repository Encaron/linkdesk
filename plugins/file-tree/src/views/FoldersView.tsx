/**
 * FoldersView——文件树视图（门面）。
 * E3.6：从 sidebar.tsx 提取——SidePanel 统画 header，此处只负责内容。
 *
 * 对标 VS Code ExplorerView 的 FOLDERS section。
 *
 * 🔴 `contributes.views[].render = "src/views/FoldersView.tsx"`——basename 是 SDK bundle key，
 * 门面必须留在本路径本文件名（12 档 §一·〇 形 (a)）。子件在同名夹 `FoldersView/` 内（E6#87a）：
 *   - `fsWatcher.ts`          文件系统变更发射器（🔴 `fsEmitter` 单一属主）
 *   - `types.ts`              WorkspaceFolderDto
 *   - `Toolbar.tsx`           工具栏
 *   - `useWorkspaceRoots.ts`  工作区根同步 + 每根监听
 *   - `useFsChangeRefresh.ts` 变更防抖刷新
 *   - `useExplorerConfig.ts`  三项 explorer 配置订阅
 *   - `useExpandPersistence.ts` 展开状态持久化
 *   - `useViewRegistration.tsx` FOLDERS 标题 + SEARCH 视图注册
 */

import { useState, useRef, useCallback, useEffect } from "react";
// E5.6#11.5i：ViewContainerService → lk.viewContainer（#11.5g3 遗漏）
import FileTree from "../components/FileTree";
import FileTreeContextMenu, { activateFileTreeContextMenu, setFileTreeHandleRef, clearFileTreeHandle, setOpenFileFn } from "../components/FileTreeContextMenu";
import { FileTreeDecorationService } from "../services/FileTreeDecoration";
import { FileTreeModel } from "../services/FileTreeModel";
import type { FileTreeHandle } from "../components/FileTree";
import type { ExplorerItem } from "../services/FileTreeModel";
import { FileExcludeFilter } from "../services/FileExcludeFilter";
import { extension } from "../utils/pathUtils";
import { useWorkspaceRoots } from "./FoldersView/useWorkspaceRoots";
import { useFsChangeRefresh } from "./FoldersView/useFsChangeRefresh";
import { useExplorerConfig } from "./FoldersView/useExplorerConfig";
import { useExpandPersistence } from "./FoldersView/useExpandPersistence";
import { useViewRegistration } from "./FoldersView/useViewRegistration";
import Toolbar from "./FoldersView/Toolbar";
import "../styles/file-tree-shell.css";
import "../styles/file-tree-node.css";

const lk = window.linkdesk;

const FoldersView: React.FC = () => {
  const tabs = window.linkdesk?.tabs;
  const modelRef = useRef<FileTreeModel>(new FileTreeModel());
  const model = modelRef.current;
  model.init(); // E4V#34a: 异步加载 sortOrder 配置
  const filterRef = useRef<FileExcludeFilter>(new FileExcludeFilter());

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
      window.linkdesk?.contextKey?.set("explorerItemIsFile", item.isDirectory === false);
      window.linkdesk?.contextKey?.set("explorerItemIsDir", item.isDirectory === true);
      window.linkdesk?.contextKey?.set("explorerItemIsRoot", item.parent === null);
      window.linkdesk?.contextKey?.set("explorerResourceReadonly", item.isReadonly === true);
      setContextMenu({ item, anchor: { x: event.clientX, y: event.clientY } });
    },
    [],
  );

  /* ── E4V#32: autoReveal——切标签页时文件树自动定位 ── */
  // E5.6#11.5g3: inline useConfigurationValue + lk.tabs.onDidChangeActiveTab 替代 CoreEvents
  const [autoReveal, setAutoReveal] = useState<boolean>(true);
  useEffect(() => { lk.configuration.get("explorer.autoReveal").then((v: unknown) => setAutoReveal(v as boolean ?? true)); return lk.configuration.onChange("explorer.autoReveal", (v: unknown) => setAutoReveal(v as boolean ?? true)); }, []);
  useEffect(() => {
    if (!autoReveal) return;
    const unsub = lk.tabs?.onDidChangeActiveTab?.(({ filePath }: { filePath?: string }) => {
      if (!filePath) return;
      fileTreeRef.current?.reveal(filePath);
    });
    return unsub;
  }, [autoReveal]);

  /* ── E4V#31: 文件装饰器消费——订阅 linkdesk.decorations.onDidChange（E5.7#60 池内注册表）→ 模型变更时 decorate 节点 ── */
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

  /* ── 工作区根 / 变更刷新 / 配置订阅 / 持久化 / 视图注册 ── */
  const roots = useWorkspaceRoots({ model, filterRef, rerender });
  useFsChangeRefresh(model, rerender);
  useExplorerConfig({ model, filterRef, rerender });
  useExpandPersistence(model);
  useViewRegistration();

  /* ── 打开文件 ── */
  /** 核心逻辑：扩展名 → FileAssociationService → createTab。
   *  E5#99：未知类型不拦截——交壳 tabs:create handler 统一 toast。 */
  const doOpenFile = useCallback(async (filePath: string, name: string, mode: "preview" | "pin") => {
    const ext = extension(name);
    const pluginId = ext ? await lk.fileAssociation.getPluginFor(ext) : "";
    tabs?.create(pluginId || "", {
      filePath,
      sourceId: filePath,
      label: name,
      pinned: mode === "pin",
    });
  }, [tabs]);

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
      {/* E5.6#11：工具栏从 header actions (ReactNode→不可IPC序列化) 迁移到组件内自渲染 */}
      {roots.length > 0 && <Toolbar />}
      <div className="file-tree-body">
        {roots.length > 0 && (
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
