/**
 * FileTreeDnD——拖放工具。
 * E4b #99：OS 拖入 + 树内拖拽 + 插入线/目录高亮 + 祖先后代约束。
 *
 * 对标 VS Code explorerViewer.ts——DragAndDrop + onDragOver + onDrop。
 */

import { useState, useCallback, useRef } from "react";
import type { ExplorerItem } from "./FileTreeModel";
import type { FileTreeModel } from "./FileTreeModel";
import { getScaledTreeItemHeight } from "../utils/layoutTokens";
import { dirname, joinPath, normalizePath } from "../utils/pathUtils";

const lk = window.linkdesk;
import type { FlatItem } from "../utils/pathUtils";

/* ── 类型 ── */

export type DropEffect = "copy" | "move" | "none";

export interface DropTarget {
  /** flatItems 中的索引 */
  index: number;
  /** 目标项 */
  item: ExplorerItem;
  /** 目标目录路径——drop 后的实际目标 */
  targetDir: string;
  /** 拖放效果 */
  effect: DropEffect;
}

/* ── 工具 ── */

/** 由鼠标 Y + scrollTop 计算 flatItems 中的索引 */
export function getDropTargetIndex(
  mouseY: number,
  scrollTop: number,
  containerTop: number,
): number {
  return Math.floor((mouseY - containerTop + scrollTop) / getScaledTreeItemHeight());
}

/**
 * 解析拖放目标——给定 flatItems 和索引，返回目标目录。
 * 目录节点 → 自身。文件节点 → 其父目录。
 */
export function resolveDropTarget(
  targetIndex: number,
  flatItems: FlatItem[],
): DropTarget | null {
  if (targetIndex < 0 || targetIndex >= flatItems.length) return null;
  const fi = flatItems[targetIndex];
  const targetDir = fi.item.isDirectory ? fi.item.uri : dirname(fi.item.uri);
  return {
    index: targetIndex,
    item: fi.item,
    targetDir,
    effect: "move",
  };
}

/** 检查 source 是否是 target 的祖先——禁止拖祖先到后代 */
export function isAncestorOf(source: ExplorerItem, target: ExplorerItem): boolean {
  if (!source.isDirectory) return false;
  const sn = source.uri;
  const tn = target.uri;
  return sn !== tn && tn.startsWith(sn + "/");
}

/**
 * 🔥 拖放安全检查——归一化入口。
 * OS 拖入和树内拖拽两分支都调此函数，三个检查只写一处。
 * 对标 VS Code FileDragAndDrop。
 */
export async function executeSafeDrop(
  sources: { path: string; name: string }[],
  targetDir: string,
  operation: "copy" | "move",
): Promise<void> {
  // E4V#34e: explorer.enableDragAndDrop 配置开关
  if ((await lk.configuration.get("explorer.enableDragAndDrop") ?? true) === false) return;
  // E4V#34h1: explorer.confirmDragAndDrop——移动/复制前弹确认框
  if (await lk.configuration.get("explorer.confirmDragAndDrop") ?? true) {
    const names = sources.map((s) => `"${s.name}"`).join(", ");
    const targetName = targetDir.split("/").pop() ?? targetDir;
    const confirmed = await window.linkdesk?.dialog?.confirm?.(`确定${operation === "move" ? "移动" : "复制"} ${names} 到 "${targetName}"？`);
    if (!confirmed) return;
  }
  const t = normalizePath(targetDir);
  for (const src of sources) {
    const s = normalizePath(src.path);
    const dest = joinPath(t, src.name);
    if (t.startsWith(s + "/")) continue;  // 祖先→后代——防递归嵌套
    if (s === t) continue;                // 自己→自己——防 sub→sub/sub
    if (s === dest) continue;             // 同路径——无操作
    await lk.filesystem.copy(src.path, dest);
    if (operation === "move") await lk.filesystem.remove(src.path);
  }
}

/* ── Drag 事件类型 ── */

export interface DnDState {
  /** 正在被拖拽的源 URI */
  sourceUri: string | null;
  /** 鼠标悬停位置对应的 flatItems 索引（-1 = 无有效目标） */
  hoverIndex: number;
}

export interface DnDCallbacks {
  flatItems: FlatItem[];
  model: FileTreeModel;
  rerender: () => void;
  getContainerEl: () => HTMLDivElement | null;
  /** E4V#34h2: OS 拖入文件后自动打开回调 */
  onAutoOpenDroppedFile?: (filePath: string, name: string) => void;
}

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
        await refreshDir(target.targetDir);
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
      await refreshDir(dirname(uri));
      await refreshDir(target.targetDir);
      callbacks.rerender();
    },
    [dndState.hoverIndex, callbacks],
  );

  return { dndState, handleDragStart, handleDragOver, handleDragLeave, handleDrop };
}
