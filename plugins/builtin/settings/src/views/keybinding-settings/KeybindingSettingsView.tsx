/**
 * Keyboard Shortcuts 设置子栏——对标 VS Code Keyboard Shortcuts 页面。
 * E3f #59：双 tab + 表格视图 + 搜索 + 双击改绑定 + 冲突检测。
 * #59-C：完整命令视图——以 CommandRegistry 为数据源。
 * #59-D：行内编辑——双框 chord 捕获 + ✕ + 点击外部取消 + 字体归一化。
 *
 * 🔥 E5.5#7-p2 多 WebView 改造：零 import @src/core，全走 window.linkdesk.* IPC。
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { compareKeybindingRows } from "./keybindingRowSort";
import "./KeybindingSettingsView.css";

/* ── 辅助函数 ── */

function lk() {
  return window.linkdesk;
}

interface KeybindingRow {
  command: string;
  title: string;
  key: string;
  source: string;
  when?: string;
  pluginId?: string;
}

interface KeybindingSettingsViewProps {
  initialQuery?: string;
}

function KeybindingSettingsView({ initialQuery }: KeybindingSettingsViewProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState(initialQuery ?? "");
  const [version, setVersion] = useState(0);
  // E3f #59-D：行内编辑——双框模式
  const [editingRow, setEditingRow] = useState<KeybindingRow | null>(null);
  const [firstKey, setFirstKey] = useState("");
  const [secondKey, setSecondKey] = useState("");
  const [activeField, setActiveField] = useState<"first" | "second">("first");
  const editRowRef = useRef<HTMLDivElement>(null);

  // E5.5#7-p2：IPC 异步数据——getCommands / getConflicts 是 Promise
  const [commands, setCommands] = useState<Array<{ id: string; title?: string }>>([]);
  const [conflictKeys, setConflictKeys] = useState<Set<string>>(new Set());
  const [allKeybindings, setAllKeybindings] = useState<Array<{ command: string; key: string; source: string; when?: string; pluginId?: string }>>([]);

  const loadData = useCallback(async () => {
    const linkdesk = lk();
    const [cmds, conflicts, kbs] = await Promise.all([
      linkdesk.commands?.getCommands?.() ?? Promise.resolve([]),
      linkdesk.keybindings?.getConflicts?.() ?? Promise.resolve([]),
      linkdesk.keybindings?.getKeybindings?.() ?? Promise.resolve([]),
    ]);
    setCommands(cmds as Array<{ id: string; title?: string }>);
    setConflictKeys(new Set((conflicts as Array<{ key: string }>).map((c: { key: string }) => c.key)));
    setAllKeybindings(kbs as Array<{ command: string; key: string; source: string; when?: string; pluginId?: string }>);
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
    const rows: Array<KeybindingRow & { _conflict: boolean }> = commands.map((cmd) => {
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
    rows.sort(compareKeybindingRows);
    return rows;
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

  // ── 行内编辑：双框 chord 捕获 ──

  const startEdit = useCallback((row: KeybindingRow) => {
    setEditingRow(row);
    setFirstKey("");
    setSecondKey("");
    setActiveField("first");
    lk().keybindings?.setKeybindingCaptureActive?.(true);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingRow(null);
    setFirstKey("");
    setSecondKey("");
    setActiveField("first");
    lk().keybindings?.setKeybindingCaptureActive?.(false);
  }, []);

  const confirmEdit = useCallback(async () => {
    if (!editingRow || !firstKey) return;
    const kb = lk().keybindings;
    if (!kb) return;
    await kb.removeKeybindingForCommand(editingRow.command);
    const key = secondKey ? `${firstKey} ${secondKey}` : firstKey;
    await kb.registerKeybinding({
      command: editingRow.command,
      key,
      when: editingRow.when,
      source: "user",
    });
    await kb.saveUserKeybindings();
    cancelEdit();
  }, [editingRow, firstKey, secondKey, cancelEdit]);

  // 点击外部关闭编辑——对标终端重命名行
  useEffect(() => {
    if (!editingRow) return;
    const onClick = (e: MouseEvent) => {
      if (editRowRef.current && !editRowRef.current.contains(e.target as Node)) {
        cancelEdit();
      }
    };
    // 延迟绑定——避免双击事件自己触发关闭
    setTimeout(() => document.addEventListener("mousedown", onClick), 0);
    return () => document.removeEventListener("mousedown", onClick);
  }, [editingRow, cancelEdit]);

  // 捕获键盘输入——写入当前 active field
  useEffect(() => {
    if (!editingRow) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === "Escape") { cancelEdit(); return; }
      if (e.key === "Enter" && firstKey) { confirmEdit(); return; }

      // 🔥 contextBridge 结构化克隆会丢掉 KeyboardEvent 的原生属性（.key/.code 是 C++ getter）。
      // 必须提取为普通对象再传——否则 e.key 变 undefined → toLowerCase() 炸。
      const keyString = lk().keybindings?.keyboardEventToKeyString?.({
        key: e.key,
        ctrlKey: e.ctrlKey,
        shiftKey: e.shiftKey,
        altKey: e.altKey,
        metaKey: e.metaKey,
      }) ?? "";
      if (!keyString) return;

      if (activeField === "first") {
        setFirstKey(keyString);
        setActiveField("second");
      } else {
        setSecondKey(keyString);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [editingRow, firstKey, activeField, cancelEdit, confirmEdit]);

  // 冲突检测
  const getConflict = (key: string) => {
    if (!key) return null;
    return allKeybindings.filter((b) => b.key === key && b.command !== editingRow?.command);
  };

  const firstConflict = getConflict(firstKey);
  const fullKey = secondKey ? `${firstKey} ${secondKey}` : "";
  const secondConflict = fullKey ? getConflict(fullKey) : null;

  const sourceLabel = (s: string) => {
    if (s === "user") return t("用户");
    if (s === "plugin") return t("插件");
    if (s === "builtin") return t("内置");
    return "—";
  };

  // E3f #59-G + E5.5#7-p2：重置为默认——走 linkdesk.dialog.confirm 替代动态 import DialogService
  const handleResetDefault = useCallback(async (row: KeybindingRow) => {
    const confirmed = await lk().dialog?.confirm?.(
      t("确定要将「{{key}}」重置为默认值吗？", { key: row.title })
    );
    if (!confirmed) return;
    const kb = lk().keybindings;
    if (!kb) return;
    await kb.resetKeybindingToDefault(row.command);
    await kb.saveUserKeybindings();
  }, [t]);

  // 预填已有键值：将 chord "ctrl+k ctrl+t" 拆分为 first="ctrl+k" second="ctrl+t"
  const splitChord = useCallback((row: KeybindingRow) => {
    if (row.key === "—") return;
    const spaceIdx = row.key.indexOf(" ");
    if (spaceIdx > 0) {
      setFirstKey(row.key.slice(0, spaceIdx));
      setSecondKey(row.key.slice(spaceIdx + 1));
      setActiveField("second"); // 两键都有 → 聚焦第二键
    } else {
      setFirstKey(row.key);
      setActiveField("second"); // 一键已有 → 第二键待填
    }
  }, []);

  return (
    <div className="keybindings-view">
      <div className="keybindings-search-bar">
        <span className="codicon codicon-search keybindings-search-icon" />
        <input
          className="keybindings-search-input"
          type="text"
          placeholder={t("搜索快捷键")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="keybindings-table">
        <div className="keybindings-header">
          <span>{t("命令")}</span>
          <span>{t("快捷键")}</span>
          <span>{t("来源")}</span>
          <span>{t("when 条件")}</span>
        </div>
        {filtered.length === 0 ? (
          <div className="keybindings-empty">{t("无匹配快捷键")}</div>
        ) : (
          filtered.map((row) => {
            const isEditing = editingRow?.command === row.command;
            return (
              <div
                key={row.command}
                ref={isEditing ? editRowRef : undefined}
                className={`keybindings-row ${row._conflict ? "conflict" : ""} ${isEditing ? "editing" : ""}`}
                onDoubleClick={isEditing ? undefined : () => { startEdit(row); splitChord(row); }}
              >
                <div className="keybindings-col-command">
                  <div>{t(row.title)}</div>
                  <div className="keybindings-col-command-id">{row.command}</div>
                </div>
                <div className="keybindings-col-key-cell">
                  {isEditing ? (
                    <div className="keybindings-inline-edit">
                      {/* 第一键 */}
                      <span
                        className={`keybindings-chord-field ${activeField === "first" ? "active" : ""}`}
                        tabIndex={0}
                        onFocus={() => setActiveField("first")}
                      >
                        {firstKey || (activeField === "first" ? t("按下快捷键…") : "")}
                      </span>
                      {/* 第二键——第一键未填时灰显 */}
                      <span
                        className={`keybindings-chord-field ${activeField === "second" && firstKey ? "active" : firstKey ? "" : "dimmed"}`}
                        tabIndex={firstKey ? 0 : -1}
                        onFocus={() => firstKey && setActiveField("second")}
                      >
                        {secondKey || (firstKey && !secondKey && activeField === "second" ? t("可选") : "")}
                      </span>
                      {/* 冲突提示 */}
                      {(secondConflict?.length ?? 0) > 0 && (
                        <span className="keybindings-inline-conflict" title={secondConflict?.map(b => b.command).join(t("、"))}>
                          ⚠
                        </span>
                      )}
                      {(!secondKey || !secondConflict) && firstConflict && firstConflict.length > 0 && (
                        <span className="keybindings-inline-conflict" title={firstConflict.map(b => b.command).join(t("、"))}>
                          ⚠
                        </span>
                      )}
                      <button className="keybindings-inline-btn confirm" onClick={confirmEdit} disabled={!firstKey} title={t("确定")}>
                        <span className="codicon codicon-check" />
                      </button>
                      <button className="keybindings-inline-btn cancel" onClick={cancelEdit} title={t("取消")}>
                        <span className="codicon codicon-close" />
                      </button>
                    </div>
                  ) : row.key === "—" ? (
                    <span className="keybindings-col-key-none">{row.key}</span>
                  ) : (
                    <span className={`keybindings-col-key ${row._conflict ? "conflict-key" : ""}`}>
                      {row.key}
                    </span>
                  )}
                  {/* E3f #59-G：自定义过（source=user）的行显示重置齿轮 */}
                  {!isEditing && row.source === "user" && (
                    <button
                      className="keybindings-row-gear"
                      title={t("重置为默认")}
                      onClick={(e) => { e.stopPropagation(); handleResetDefault(row); }}
                    >
                      <span className="codicon codicon-gear" />
                    </button>
                  )}
                </div>
                <div className="keybindings-col-source">{sourceLabel(row.source)}</div>
                <div className="keybindings-col-when">{row.when || "—"}</div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default KeybindingSettingsView;
