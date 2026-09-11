/**
 * useFileTreeDnD——文件树拖放 hook（E6#87a 从 FileTreeDnD.ts 拆出）。
 * E4b #99：OS 拖入 + 树内拖拽 + 插入线/目录高亮 + 祖先后代约束。
 *
 * 对标 VS Code explorerViewer.ts——DragAndDrop + onDragOver + onDrop。
 */

import { useState, useCallback, useRef } from "react";
import type { ExplorerItem } from "../FileTreeModel";
// E6#73m K2：失败出口——写操作的异常必须有用户可见的那一头（本插件唯一出口，别处别再开第二条）
import i18n from "i18next";
import { dirname } from "../../utils/pathUtils";
import { notifyFailure, errText, nameOf } from "../FileTreeNotify";
import { getDropTargetIndex, resolveDropTarget } from "./dropTarget";
import { executeSafeDrop } from "./execute";
import type { DnDCallbacks, DnDState } from "./types";

const lk = window.linkdesk;

/**
 * 文件树拖放 hook——返回 drag 事件处理器 + 状态。
 * 在 FileTree 组件中消费。
 */
export function useFileTreeDnD(callbacks: DnDCallbacks): {
  dndState: DnDState;
  handleDragStart: (item: ExplorerItem, e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => Promise<void>;
} {
  const [dndState, setDndState] = useState<DnDState>({ sourceUri: null, hoverIndex: -1 });
  const dragItemRef = useRef<ExplorerItem | null>(null);

  /** dragStart——记录被拖拽的项 + E5#108d 原生拖出 */
  const handleDragStart = useCallback((item: ExplorerItem, e: React.DragEvent) => {
    dragItemRef.current = item;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", item.uri);
    // E5#108d：对标 VS Code fillEditorsDragData——设 DownloadURL + text/uri-list，
    // Chromium 自动识别为原生文件拖拽。不用 Electron startDrag（闪退）。
    const fileName = item.name;
    e.dataTransfer.setData("DownloadURL", `application/octet-stream:${fileName}:file://${item.uri}`);
    e.dataTransfer.setData("text/uri-list", `file://${item.uri}`);
    setDndState({ sourceUri: item.uri, hoverIndex: -1 });
  }, []);

  /** dragOver——计算 drop target + 显示指示线 */
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const el = callbacks.getContainerEl();
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const idx = getDropTargetIndex(e.clientY, el.scrollTop, rect.top);
      const clamped = Math.max(0, Math.min(callbacks.flatItems.length - 1, idx));
      setDndState((prev) => (prev.hoverIndex === clamped ? prev : { ...prev, hoverIndex: clamped }));
    },
    [callbacks],
  );

  /** dragLeave——清除 hover */
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // 只在离开容器时清除
    if (e.currentTarget === e.target) {
      setDndState({ sourceUri: null, hoverIndex: -1 });
    }
  }, []);

  /** drop——执行文件操作 */
  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const target = resolveDropTarget(dndState.hoverIndex, callbacks.flatItems);
      setDndState({ sourceUri: null, hoverIndex: -1 });

      if (!target) return;

      const sourceItem = dragItemRef.current;
      dragItemRef.current = null;

      // 工具：刷新目录——若展开则重载子节点，保证 twistie 箭头与内容一致
      const refreshDir = async (dir: string) => {
        callbacks.model.refresh(dir);
        if (callbacks.model.isExpanded(dir)) {
          const item = callbacks.model.findClosest(dir);
          if (item) await callbacks.model.getChildren(item);
        }
      };
      // E6#73m K2：`getChildren` 是读磁盘——目录刚被移走 / 权限没了都会抛。它同样挂在
      // 不 await 的 `onDrop` 下，抛了就是「树停在旧内容 + 一声不吭」。写操作成了却刷不出来
      // 同样是坏结果（用户以为没成），照实报。
      const refreshDirSafe = async (dir: string) => {
        try {
          await refreshDir(dir);
        } catch (e) {
          notifyFailure(i18n.t("刷新"), [{ name: nameOf(dir), detail: errText(e) }]);
        }
      };

      // OS 拖入——e.dataTransfer.files
      if (e.dataTransfer.files.length > 0) {
        const gfp = window.linkdesk?.getFilePath as ((f: File) => string) | undefined;
        const sources: { path: string; name: string }[] = [];
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i];
          // E5.7#98：旧 Electron File 有 .path（webkit 私有字段）——窄化访问，getFilePath 缺失时回退
          const srcPath = gfp?.(file) || (file as { path?: string }).path;
          if (srcPath) sources.push({ path: srcPath, name: file.name });
        }
        await executeSafeDrop(sources, target.targetDir, "copy");
        await refreshDirSafe(target.targetDir);
        // E4V#34h2: explorer.autoOpenDroppedFile——拖入后自动打开
        if (await lk.configuration.get("explorer.autoOpenDroppedFile") ?? false) {
          for (const src of sources) {
            callbacks.onAutoOpenDroppedFile?.(src.path, src.name);
          }
        }
        callbacks.rerender();
        return;
      }

      // 树内拖拽——dataTransfer text/plain 是 URI
      const uri = e.dataTransfer.getData("text/plain");
      if (!uri || !sourceItem) return;

      // 不能拖到自己所在的目录
      if (dirname(uri) === target.targetDir) return;

      await executeSafeDrop([{ path: uri, name: sourceItem.name }], target.targetDir, "move");
      await refreshDirSafe(dirname(uri));
      await refreshDirSafe(target.targetDir);
      callbacks.rerender();
    },
    [dndState.hoverIndex, callbacks],
  );

  return { dndState, handleDragStart, handleDragOver, handleDragLeave, handleDrop };
}
