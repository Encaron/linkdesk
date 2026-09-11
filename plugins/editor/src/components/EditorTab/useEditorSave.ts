/**
 * 保存与脏标记（E4V#40f/#40n/#40o，E6#87c 拆自 EditorTab.tsx）。
 *
 * 三条入口共用一条写盘路径：Ctrl+S（EditorView 经 onSave 回调）、切走标签自动保存
 * （files.autoSave = onFocusChange）、停止输入自动保存（= afterDelay，1s 计时器）。
 * 脏→净的清理只有一处（markClean），保存成功与外部重载都走它——防两处漂移。
 */
import { useCallback, useEffect, useRef } from "react";
import type { TFunction } from "i18next";
import { clearDirtyFile, trackDirtyFile } from "../../services/hot-exit";
import type { EditorTabState } from "./types";

const lk = window.linkdesk;

export function useEditorSave(state: EditorTabState, t: TFunction, isActive: boolean): {
  markClean: () => void;
  handleSave: () => Promise<void>;
  handleChange: (newValue: string | undefined) => Promise<void>;
} {
  const tabs = window.linkdesk?.tabs;
  const { model, currentPath, dirtyRef, baseLabelRef, setValue, setError } = state;
  // E4V#40o——自动保存计时器
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // E4V#40o——onFocusChange 需要前一帧 isActive 判断切换方向
  const prevActiveRef = useRef(isActive);

  // E5.8#0d.9——缓冲区转"干净"的公共清理：保存成功 / 外部重载两条路径共用（归一化，防两处漂移）
  const markClean = useCallback(() => {
    dirtyRef.current = false;
    clearDirtyFile(currentPath);
    tabs?.updateLabelBySourceId?.(currentPath, baseLabelRef.current);
  }, [currentPath, tabs, dirtyRef, baseLabelRef]);

  const handleSave = useCallback(async () => {
    if (!model) return;
    try {
      await model.save();
      model.markSaved();
      markClean();
    } catch (err) {
      console.error(`[EditorTab] 保存失败: ${currentPath}`, err);
      setError(`${t("保存失败：")} ${(err as Error).message}`);
    }
  }, [model, currentPath, t, markClean, setError]);

  // E4V#40o——onFocusChange 自动保存：切走标签页时自动保存
  useEffect(() => {
    const wasActive = prevActiveRef.current;
    prevActiveRef.current = isActive;
    lk.configuration.get("files.autoSave").then((autoSave) => {
      if ((autoSave ?? "off") === "onFocusChange" && wasActive && !isActive && model && model.isDirty()) {
        handleSave();
      }
    });
  }, [isActive, model, handleSave]);

  const handleChange = useCallback(async (newValue: string | undefined) => {
    const v = newValue ?? "";
    setValue(v);
    model?.setValue(v);
    const isDirty = model?.isDirty() ?? false;
    if (dirtyRef.current !== isDirty) {
      dirtyRef.current = isDirty;
      // E5#52：只加减 ●，不重取 baseName——保留标签页去歧义后缀
      const label = isDirty ? `● ${baseLabelRef.current}` : baseLabelRef.current;
      tabs?.updateLabelBySourceId?.(currentPath, label);
    }
    // E4V#40n——Hot Exit：每次内容变更都更新备份，不在上面的状态守卫里（否则只保存第一次按键的内容）
    if (isDirty) {
      trackDirtyFile(currentPath, v);
    }
    // E4V#40o——afterDelay 自动保存：每次变更重置 1s 计时器
    const autoSave = await lk.configuration.get("files.autoSave") ?? "off";
    if (autoSave === "afterDelay") {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        handleSave();
      }, 1000);
    }
  }, [model, currentPath, tabs, handleSave, dirtyRef, baseLabelRef, setValue]);

  // E4V#40o——卸载时清理自动保存计时器
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  return { markClean, handleSave, handleChange };
}
