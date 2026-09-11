/**
 * 文件加载管线（E4V#40f + E5.7#38 Hot Exit，E6#87c 拆自 EditorTab.tsx）。
 *
 * 两条路径：有备份（崩溃重建/跨组移动）→ 磁盘取编码/语言 + 备份当内容 + 标脏；
 * 无备份 → 正常读盘。加载失败 → 错误态。
 */
import { useCallback, useEffect } from "react";
import type { TFunction } from "i18next";
import { EditorModel } from "../../services/EditorModel";
import { cancelPendingClear, loadBackup, scheduleClearOnUnmount, trackDirtyFile } from "../../services/hot-exit";
import type { EditorTabState, PatchStatus } from "./types";

export function useEditorLoad(state: EditorTabState, t: TFunction, patchStatus: PatchStatus): void {
  const tabs = window.linkdesk?.tabs;
  const {
    setModel, setValue, setLoading, setError,
    currentPath, model, dirtyRef, baseLabelRef, initialFilePathRef,
  } = state;

  /** 备份内容未保存 → 标脏：脏位 + 标签 ● 前缀 + 热备份登记（两条恢复分支共用） */
  const markBackupDirty = useCallback((content: string) => {
    dirtyRef.current = true;
    tabs?.updateLabelBySourceId?.(initialFilePathRef.current, `● ${baseLabelRef.current}`);
    trackDirtyFile(initialFilePathRef.current, content);
  }, [tabs, dirtyRef, baseLabelRef, initialFilePathRef]);

  // 加载文件
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // E5.7#38——取消未决 unmount 清理（跨组移动/StrictMode 的 remount 路径）
    cancelPendingClear(initialFilePathRef.current);

    (async () => {
      // E5.7#38——Hot Exit：崩溃重建/跨组移动后优先恢复备份内容（只读——重复读安全）
      const backupContent = await loadBackup(initialFilePathRef.current);
      if (cancelled) return;

      if (backupContent !== null) {
        // 从磁盘正常加载（取编码/语言），但内容用备份
        try {
          const m = await EditorModel.load(initialFilePathRef.current);
          if (cancelled) return;
          m.setValue(backupContent);
          setModel(m);
          setValue(backupContent);
          patchStatus({ encoding: m.encoding, language: m.language });
          // 标记为脏——备份内容未保存
          markBackupDirty(backupContent);
          setLoading(false);
        } catch {
          if (cancelled) return;
          // 从磁盘加载失败→只用备份内容
          const fallback = EditorModel.fromContent(initialFilePathRef.current, backupContent);
          setModel(fallback);
          setValue(backupContent);
          patchStatus({ encoding: fallback.encoding, language: fallback.language });
          markBackupDirty(backupContent);
          setLoading(false);
        }
      } else {
        try {
          const m = await EditorModel.load(initialFilePathRef.current);
          if (cancelled) return;
          setModel(m);
          setValue(m.getValue());
          patchStatus({ encoding: m.encoding, language: m.language });
          setLoading(false);
        } catch (err) {
          if (cancelled) return;
          console.error(`[EditorTab] 加载失败: ${initialFilePathRef.current}`, err);
          setError(`${t("无法打开文件")}: ${(err as Error).message}`);
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
    // E5.7#99：per-tab 一次性加载管线（初始路径冻结）；E5.8#25.3：改名后 prop 变化——ref 冻结避免重载丢 dirty/undo
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 路径入 deps 会改名时重载文件 → 新建 model 丢 undo/光标
  }, []);

  // E5.7#38——标签关闭 = unmount：脏文件延迟清备份（关闭即弃语义）；跨组移动/StrictMode 的
  // remount 在 mount 侧 cancelPendingClear 取消。池崩 = 进程死亡，此清理不执行 → 备份存活。
  useEffect(() => {
    return () => {
      if (model?.isDirty()) scheduleClearOnUnmount(currentPath);
    };
  }, [model, currentPath]);
}
