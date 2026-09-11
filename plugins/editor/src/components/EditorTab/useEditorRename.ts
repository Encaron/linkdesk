/**
 * E5.8#25.3：文件重命名/移动联动（E6#87c 拆自 EditorTab.tsx）——路径迁移，内容保留，脏 ● 保留。
 *
 * 对标串口会话改名即时联动。事件源 = 文件树 emit file:renamed（池 broadcast 直达本 WCV，
 * 与壳 #25.1 桥同源；editor 是池插件，事件同进程直收，零 IPC 中转）。
 */
import { useCallback, useEffect } from "react";
import { clearDirtyFile, trackDirtyFile } from "../../services/hot-exit";
import type { EditorTabState, PatchStatus } from "./types";

const lk = window.linkdesk;

export function useEditorRename(state: EditorTabState, patchStatus: PatchStatus): void {
  const tabs = window.linkdesk?.tabs;
  const { model, currentPath, setCurrentPath, dirtyRef, baseLabelRef } = state;

  // 迁移四件事：EditorModel 路径（内容不动→dirty 保留）/ baseLabel / hot-exit 备份 key / 壳标签 ●。
  // 幂等（同路径 no-op）——壳 sourceId 迁移与池事件可能先后抵达同一目标路径。
  const applyRename = useCallback((newPath: string) => {
    const normalized = lk.path.normalize(newPath);
    if (normalized === currentPath) return;
    model?.setFilePath(normalized);
    baseLabelRef.current = normalized.split("/").pop() || normalized;
    if (model?.isDirty()) {
      // 热备份 key 迁移——删旧 key，重挂新 key（内容不丢；改名后保存即写新路径）
      const content = model.getValue();
      clearDirtyFile(currentPath);
      trackDirtyFile(normalized, content);
    }
    // 壳标签栏——新 sourceId 已由壳 TabManager 迁移（但其 label 不带 ●），此处重挂保留脏前缀
    const label = dirtyRef.current ? `● ${baseLabelRef.current}` : baseLabelRef.current;
    tabs?.updateLabelBySourceId?.(normalized, label);
    // 状态栏语言随新扩展名刷新（.txt→.ts 显示即切换）
    patchStatus((prev) => ({ language: model?.language ?? prev.language }));
    setCurrentPath(normalized);
  }, [model, currentPath, tabs, setCurrentPath, dirtyRef, baseLabelRef, patchStatus]);

  // 池事件主路径——改名即时到达（文件树与编辑器同 WCV，事件同进程广播）
  useEffect(() => {
    return lk.events.on<{ oldPath: string; newPath: string }>("file:renamed", (e) => {
      const oldPath = e?.oldPath;
      const newPath = e?.newPath;
      if (typeof oldPath !== "string" || typeof newPath !== "string") return;
      if (lk.path.normalize(oldPath) !== lk.path.normalize(currentPath)) return;
      applyRename(newPath);
    });
  }, [currentPath, applyRename]);
}
