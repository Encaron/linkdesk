/**
 * useWorkspaceRoots——工作区根同步 + 每根文件监听（E6#87a 从 FoldersView.tsx 拆出）。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { FileTreeModel } from "../../services/FileTreeModel";
import { FileExcludeFilter } from "../../services/FileExcludeFilter";
import { joinPath, normalizePath } from "../../utils/pathUtils";
import { expandedUrisStateKey } from "../../utils/expandedUrisStateKey"; // E6#47e 多窗维度
import { fsEmitter } from "./fsWatcher";
import type { WorkspaceFolderDto } from "./types";

const lk = window.linkdesk;

export interface UseWorkspaceRootsArgs {
  model: FileTreeModel;
  filterRef: MutableRefObject<FileExcludeFilter>;
  rerender: () => void;
}

export function useWorkspaceRoots({ model, filterRef, rerender }: UseWorkspaceRootsArgs) {
  const [roots, setRoots] = useState<WorkspaceFolderDto[]>([]);
  /** E4V#35 R15-1: 多根 watcher——每个根独立监听，E4V#56 已隔离 IPC 频道 */
  const _watchersRef = useRef<Array<() => void>>([]);

  /* ── 同步工作区根 ── */
  // 🛡️ _loadingPromise guard——防 StrictMode 双重 effect + onDidChangeFolders 快速触发
  // E4V#35 setRoots 可能异步化后，并发 syncRoots 会残留旧文件夹。
  const _syncGuardRef = useRef<Promise<void> | null>(null);
  const syncRoots = useCallback(async () => {
    if (_syncGuardRef.current) return _syncGuardRef.current;
    const promise = (async () => {
      const folders = await lk.workspace.getFolders();
      setRoots(folders);
      await model.setRoots(folders.map((f: { uri: string }) => f.uri));
      // E4V#8a: filter 必须在 getChildren 之前设置——否则首次加载不过滤
      const filter = filterRef.current;
      const excludeCfg = await lk.configuration.get("files.exclude") as Record<string, boolean> ?? {};
      filter.configure(excludeCfg);
      // E4V#34g1: explorer.excludeGitIgnore 开关——默认 true
      filter.clearGitignore();
      if ((await lk.configuration.get("explorer.excludeGitIgnore") ?? true)) {
        for (const f of folders) {
          const gitignorePath = joinPath(f.uri, ".gitignore");
          if (await lk.filesystem.exists(gitignorePath)) {
            try {
              const content = await lk.filesystem.readTextFile(gitignorePath);
              filter.setGitignore(content);
            } catch { /* 读取失败静默跳过 */ }
          }
        }
      }
      model.setExcludeFilter(filter);
      // E4V#36b: 恢复展开状态——逐层重建（浅层先于深层，确保 findClosest 能找到父节点）
      const savedUris = (await window.linkdesk?.pluginState?.get("file-tree", expandedUrisStateKey())) as string[] | undefined; // E6#47e 多窗维度
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
          if (item) await model.getChildren(item).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
        }
      }
      // E4V#34i: explorer.expandSingleFolderWorkspaces——单目录工作区自动展开根
      if ((await lk.configuration.get("explorer.expandSingleFolderWorkspaces") ?? true)
          && folders.length === 1) {
        const root = model.roots[0];
        if (root) {
          await model.getChildren(root).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
          const dirs = root.children?.filter((c) => c.isDirectory) ?? [];
          if (dirs.length === 1) {
            model.expand(root.uri);
            model.expand(dirs[0].uri);
            await model.getChildren(dirs[0]).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
          }
        }
      }
      // E4V#35 R15-1: 多根 watcher——每个根独立监听
      _watchersRef.current.forEach((u) => u());
      _watchersRef.current = [];
      for (const f of folders) {
        try {
          const unwatch = await lk.filesystem.watch(f.uri, (event: { path: string; type: string }) => {
            fsEmitter.fire([event]);
          });
          _watchersRef.current.push(unwatch);
        } catch { /* watcher 启动失败静默 */ }
      }
      rerender();
    })().finally(() => { _syncGuardRef.current = null; });
    _syncGuardRef.current = promise;
    return promise;
  }, [model, rerender, filterRef]);

  useEffect(() => {
    syncRoots();
    const unsub1 = lk.workspace.onDidChangeFolders(() => { syncRoots(); });
    return () => {
      unsub1();
      _watchersRef.current.forEach((u) => u());
      _watchersRef.current = [];
    };
  }, [syncRoots]);

  return roots;
}
