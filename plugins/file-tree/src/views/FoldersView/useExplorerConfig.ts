/**
 * useExplorerConfig——三项 explorer 配置的订阅与生效（E6#87a 从 FoldersView.tsx 拆出）。
 *
 * E5.6#11.5g3: inline useConfigurationValue——useState + useEffect 替代。
 * 🔴 `isInitialMount` 的翻转 effect 必须**排在三项变更 effect 之后**（原实现的注册序）。
 */
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import type { FileTreeModel } from "../../services/FileTreeModel";
import type { FileExcludeFilter } from "../../services/FileExcludeFilter";
import { joinPath } from "../../utils/pathUtils";

const lk = window.linkdesk;

export interface UseExplorerConfigArgs {
  model: FileTreeModel;
  filterRef: MutableRefObject<FileExcludeFilter>;
  rerender: () => void;
}

export function useExplorerConfig({ model, filterRef, rerender }: UseExplorerConfigArgs) {
  const [excludeCfg, setExcludeCfg] = useState<Record<string, boolean>>();
  const [compactFolders, setCompactFolders] = useState<boolean>();
  const [excludeGitIgnore, setExcludeGitIgnore] = useState<boolean>();
  useEffect(() => {
    lk.configuration.get("files.exclude").then((v: unknown) => setExcludeCfg(v as Record<string, boolean>));
    return lk.configuration.onChange("files.exclude", (v: unknown) => setExcludeCfg(v as Record<string, boolean>));
  }, []);
  useEffect(() => {
    lk.configuration.get("explorer.compactFolders").then((v: unknown) => setCompactFolders(v as boolean ?? true));
    return lk.configuration.onChange("explorer.compactFolders", (v: unknown) => setCompactFolders(v as boolean ?? true));
  }, []);
  useEffect(() => {
    lk.configuration.get("explorer.excludeGitIgnore").then((v: unknown) => setExcludeGitIgnore(v as boolean ?? true));
    return lk.configuration.onChange("explorer.excludeGitIgnore", (v: unknown) => setExcludeGitIgnore(v as boolean ?? true));
  }, []);
  const isInitialMount = useRef(true);

  // files.exclude 变更 → 重配 filter + 刷新
  useEffect(() => {
    if (isInitialMount.current) return;
    if (excludeCfg === undefined) return;
    const filter = filterRef.current;
    filter.configure(excludeCfg);
    model.refresh().then(() => rerender());
  }, [excludeCfg, model, rerender, filterRef]);

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
        const folders = await lk.workspace.getFolders();
        for (const f of folders) {
          const gitignorePath = joinPath(f.uri, ".gitignore");
          if (await lk.filesystem.exists(gitignorePath)) {
            try {
              const content = await lk.filesystem.readTextFile(gitignorePath);
              filter.setGitignore(content);
            } catch { /* skip */ }
          }
        }
      }
      await model.refresh();
      for (const uri of model.getExpandedUris()) {
        const item = model.findClosest(uri);
        if (item) await model.getChildren(item).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
      }
      rerender();
    })();
  }, [excludeGitIgnore, model, rerender, filterRef]);

  // 首个 effect 触发后翻转标记——后续变更正常响应
  useEffect(() => { isInitialMount.current = false; }, []);
}
