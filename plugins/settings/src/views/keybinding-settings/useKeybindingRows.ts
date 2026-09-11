/**
 * 快捷键表格的数据层——命令 + 绑定 + 冲突三路拉取、排序、搜索过滤。
 * E6#87d 自 KeybindingSettingsView.tsx 逐字搬出（只搬家，零逻辑变更；内层重名局部变量 rows → list 改名消歧）。
 *
 * 🔥 E5.5#7-p2 多 WebView 改造：零 import @src/core，全走 window.linkdesk.* IPC。
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { compareKeybindingRows } from "./keybindingRowSort";
import type { KeybindingRow, KeybindingBinding } from "./types";

function lk() {
  return window.linkdesk;
}

export function useKeybindingRows(initialQuery?: string) {
  const [search, setSearch] = useState(initialQuery ?? "");
  const [version, setVersion] = useState(0);

  // E5.5#7-p2：IPC 异步数据——getCommands / getConflicts 是 Promise
  const [commands, setCommands] = useState<Array<{ id: string; title?: string }>>([]);
  const [conflictKeys, setConflictKeys] = useState<Set<string>>(new Set());
  const [allKeybindings, setAllKeybindings] = useState<KeybindingBinding[]>([]);

  const loadData = useCallback(async () => {
    const linkdesk = lk();
    const [cmds, conflicts, kbs] = await Promise.all([
      linkdesk.commands?.getCommands?.() ?? Promise.resolve([]),
      linkdesk.keybindings?.getConflicts?.() ?? Promise.resolve([]),
      linkdesk.keybindings?.getKeybindings?.() ?? Promise.resolve([]),
    ]);
    setCommands(cmds as Array<{ id: string; title?: string }>);
    setConflictKeys(new Set((conflicts as Array<{ key: string }>).map((c: { key: string }) => c.key)));
    setAllKeybindings(kbs as KeybindingBinding[]);
  }, []);

  // 监听插件生命周期 + 快捷键注册表变更——表格自动刷新（#59-B）
  useEffect(() => {
    const linkdesk = lk();
    loadData();
    const unsub1 = linkdesk.configuration?.onPluginLifecycleChange?.(() => setVersion((v) => v + 1));
    const unsub2 = linkdesk.keybindings?.onChange?.(() => setVersion((v) => v + 1));
    return () => { unsub1?.(); unsub2?.(); };
  }, [loadData]);

  // version 变更 → 重新拉取数据
  useEffect(() => { loadData(); }, [version, loadData]);

  useEffect(() => {
    if (initialQuery) setSearch(initialQuery);
  }, [initialQuery]);

  // E3f #59-C：完整命令视图——以 CommandRegistry 为数据源，合并快捷键绑定
  const rows = useMemo(() => {
    const kbMap = new Map(allKeybindings.map((kb) => [kb.command, kb]));
    const list: Array<KeybindingRow & { _conflict: boolean }> = commands.map((cmd) => {
      const kb = kbMap.get(cmd.id);
      return {
        command: cmd.id,
        title: cmd.title ?? cmd.id,
        key: kb?.key ?? "—",
        source: kb?.source ?? "—",
        when: kb?.when,
        pluginId: kb?.pluginId,
        _conflict: kb ? conflictKeys.has(kb.key) : false,
      };
    });
    // 有绑定的命令浮顶，再按命令标题字母序——对齐 VS Code Keyboard Shortcuts 默认排序（compareKeybindingData）
    list.sort(compareKeybindingRows);
    return list;
  }, [commands, allKeybindings, conflictKeys]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) =>
        r.command.toLowerCase().includes(q) ||
        r.title.toLowerCase().includes(q) ||
        r.key.toLowerCase().includes(q) ||
        (r.when ?? "").toLowerCase().includes(q) ||
        (r.source ?? "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  return { search, setSearch, rows: filtered, allKeybindings };
}
