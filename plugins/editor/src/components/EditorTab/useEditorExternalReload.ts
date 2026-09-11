/**
 * E5.8#0d.9——外部文件变更自动重载（对标 VS Code "file changed on disk"，E6#87c 拆自 EditorTab.tsx）。
 *
 * 监听父目录（Windows 原子替换/重命名下文件级监听不可靠）→ 200ms 防抖（避开写入中间态半读）
 * → reloadFromDisk 内容比较三态：无差异=no-op（自己 Ctrl+S 经此自然过滤）/
 *   干净=自动重载 / 脏=弹 confirm 由用户决定（取消保留未保存改动）。
 * 删除事件跳过——保存会重建文件。
 */
import { useEffect } from "react";
import type { RefObject } from "react";
import type { TFunction } from "i18next";
import type { EditorViewHandle } from "../../views/EditorView";
import type { EditorTabState } from "./types";

const lk = window.linkdesk;

export function useEditorExternalReload(
  state: EditorTabState,
  t: TFunction,
  markClean: () => void,
  editorViewRef: RefObject<EditorViewHandle>,
): void {
  const { model, currentPath, setValue } = state;

  useEffect(() => {
    if (!model) return;
    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let unsubscribe: (() => void) | null = null;

    const applyReload = async () => {
      if (cancelled) return;
      const fresh = await model.reloadFromDisk();
      if (cancelled || fresh === null) return; // 无差异（含自己保存）或读失败——不动
      if (model.isDirty()) {
        const ok = await lk.dialog.confirm(
          t("文件已在外部被修改，重新加载将丢失未保存的更改。重新加载？"),
        );
        if (cancelled || !ok) return; // 取消 → 保留未保存改动
      }
      // 应用重载——顺序：EditorModel 先于 Monaco（Monaco onChange 回链时内容已同步 → 不误标脏）
      model.setValue(fresh);
      model.markSaved();
      markClean();
      setValue(fresh);
      editorViewRef.current?.setValue(fresh);
    };

    lk.filesystem
      .watch(lk.path.dirname(currentPath), (e) => {
        if (cancelled || e.type === "deleted") return;
        if (lk.path.normalize(e.path) !== lk.path.normalize(currentPath)) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(applyReload, 200);
      })
      .then((unsub) => {
        if (cancelled) { unsub(); return; }
        unsubscribe = unsub;
      })
      .catch((err) => console.warn(`[EditorTab] 监听目录失败: ${lk.path.dirname(currentPath)}`, err));

    return () => {
      cancelled = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe?.();
    };
    // E5.8#0d.9：per-file watcher——model 就绪后挂；t 入 deps 保证 confirm 文案语言新鲜（语言切换重挂 watcher 无害）；
    // E5.8#25.3：currentPath 入 deps——改名后重挂新目录监听（旧目录 watcher 随清理摘除）
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setValue/editorViewRef 稳定，入 deps 无害但不加噪
  }, [currentPath, model, t, markClean]);
}
