/**
 * useTreeRename——行内重命名（E4V#27，E6#87a 从 useTreeSelection 拆出）。
 *
 * 🔥 rename 退出是**归一出口**——finish / cancel / 卸载三条路径走同一个 `exitRename`，
 * 它负责还原快捷键捕获 + inputFocus context key + defer 聚焦回容器。
 */
import { useCallback, useEffect, useState } from "react";
import type { FileTreeModel } from "../../services/FileTreeModel";

const lk = window.linkdesk;

export interface UseTreeRenameArgs {
  model: FileTreeModel;
  selection: Set<string>;
  focusedUri: string | null;
  setFocusedUri: (uri: string) => void;
  setSelection: (s: Set<string>) => void;
  /** 容器元素 getter——rename 退出后 defer 聚焦回容器（等 React 卸载 input 再聚焦，不触发 onBlur） */
  getContainerEl: () => HTMLElement | null;
}

export function useTreeRename({
  model, selection, focusedUri, setFocusedUri, setSelection, getContainerEl,
}: UseTreeRenameArgs) {
  const [renamingUri, setRenamingUri] = useState<string | null>(null);

  const startRename = useCallback(() => {
    const target = selection.size > 0 ? [...selection][0] : focusedUri;
    if (!target) return;
    setRenamingUri(target);
    setFocusedUri(target);
    setSelection(new Set([target]));
    // 🔥 屏蔽全局快捷键——防止 KeybindingRegistry 抢 Enter/Escape
    lk.keybindings.setKeybindingCaptureActive(true);
    window.linkdesk?.contextKey?.set("inputFocus", true);
  }, [selection, focusedUri, setFocusedUri, setSelection]);

  /** 🔥 rename 退出归一出口——finish/cancel/blur 三条路径走同一个 */
  const exitRename = useCallback(() => {
    lk.keybindings.setKeybindingCaptureActive(false);
    window.linkdesk?.contextKey?.set("inputFocus", false);
    // defer focus: 等 React 卸载 input 后再聚焦→不触发 input onBlur
    requestAnimationFrame(() => getContainerEl()?.focus());
  }, [getContainerEl]);

  const finishRename = useCallback(async (uri: string, newName: string) => {
    setRenamingUri(null);
    exitRename();
    if (!newName || newName === uri.split("/").pop()) return;
    const dir = uri.substring(0, uri.lastIndexOf("/"));
    const dest = dir + "/" + newName;
    // E5.8#25.2：原生原子重命名（替代 copy+remove 模拟——非原子 + 大文件全量复制慢）
    await lk.filesystem.rename(uri, dest);
    lk.events.emit("file:renamed", { oldPath: uri, newPath: dest });
    await model.refresh(dir);
    const parent = model.findClosest(dir);
    if (parent && model.isExpanded(parent.uri)) await model.getChildren(parent).catch((e) => { console.error("[file-tree] 刷新目录失败:", e); });
  }, [model, exitRename]);

  // onRenameCancel 的调用方传的是鼠标事件——**签名必须零参**，多一个形参会把事件收成参数
  const cancelRename = useCallback(() => {
    setRenamingUri(null);
    exitRename();
  }, [exitRename]);

  // 组件卸载时若仍在 rename→清理
  useEffect(() => () => { if (renamingUri !== null) exitRename(); }, [renamingUri, exitRename]);

  return { renamingUri, startRename, finishRename, cancelRename };
}
