/**
 * useExpandPersistence——展开状态持久化（E6#87a 从 FoldersView.tsx 拆出）。
 *
 * E4V#36a: debounce 500ms + unmount 清 timer。
 */
import { useEffect, useRef } from "react";
import type { FileTreeModel } from "../../services/FileTreeModel";

export function useExpandPersistence(model: FileTreeModel) {
  const _expandSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const unsub = model.onDidChange.event(() => {
      if (_expandSaveTimerRef.current) clearTimeout(_expandSaveTimerRef.current);
      _expandSaveTimerRef.current = setTimeout(() => {
        _expandSaveTimerRef.current = null;
        const uris = model.getExpandedUris();
        if (uris.length > 0) {
          window.linkdesk?.pluginState?.set("file-tree", "expandedUris", uris).catch((e) => { console.error("[file-tree] 保存展开状态失败:", e); });
        }
      }, 500);
    });
    return () => {
      unsub();
      if (_expandSaveTimerRef.current) clearTimeout(_expandSaveTimerRef.current);
    };
  }, [model]);
}
