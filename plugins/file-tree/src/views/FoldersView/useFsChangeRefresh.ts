/**
 * useFsChangeRefresh——文件变更防抖刷新（E6#87a 从 FoldersView.tsx 拆出）。
 *
 * E4V#fix: 文件变更防抖——300ms 内累积的变更合并为一次 refresh。
 * 背景：onFileChange IPC 监听是全局的（所有 watcher 共享 filesystem:changed 频道），
 * 批量文件操作（npm install / git checkout / appData 写入）会产生数十个事件，
 * 每个都触发 refresh → 并发竞态 → 展开目录缩回（twistie ▼ 但 children 为空）。
 */
import { useEffect, useRef } from "react";
import type { FileTreeModel } from "../../services/FileTreeModel";
import { normalizePath } from "../../utils/pathUtils";
import { fsEmitter } from "./fsWatcher";

const lk = window.linkdesk;

export function useFsChangeRefresh(model: FileTreeModel, rerender: () => void) {
  const _debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub2 = fsEmitter.event(async (events) => {
      const folders = await lk.workspace.getFolders();
      const inWorkspace = events.some((e) => folders.some((f: { uri: string }) => {
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
          if (item && model.isExpanded(item.uri)) await model.getChildren(item).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
        }
        if (affectedDirs.size === 0) {
          await model.refresh();
          for (const uri of model.getExpandedUris()) {
            const item = model.findClosest(uri);
            if (item) await model.getChildren(item).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
          }
        }
        rerender();
      }, 300);
    });
    return () => {
      unsub2();
      if (_debounceRef.current) clearTimeout(_debounceRef.current);
    };
  }, [model, rerender]);
}
