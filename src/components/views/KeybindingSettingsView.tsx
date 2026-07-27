/**
 * Keyboard Shortcuts 设置子栏——对标 VS Code Keyboard Shortcuts 页面。
 * E3f #59：双 tab + 表格视图 + 搜索 + 双击改绑定 + 冲突检测。
 * #59-C：完整命令视图——以 CommandRegistry 为数据源。
 * #59-D：行内编辑——双框 chord 捕获 + ✓✕ + 点击外部取消 + 字体归一化。
 */

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  getKeybindings,
  registerKeybinding,
  saveUserKeybindings,
  keybindingResolver,
  removeKeybindingForCommand,
  resetKeybindingToDefault,
  keyboardEventToKeyString,
  findKeybindingForCommand,
  setKeybindingCaptureActive,
} from "../../core/KeybindingRegistry";
import { getCommands } from "../../core/CommandRegistry";
import { onPluginLifecycleChange } from "../../pluginLoader/lifecycle";
import { CoreEvents } from "../../core/CoreEvents"; // E3f #59-B
import "./KeybindingSettingsView.css";

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

  // 监听插件生命周期 + 快捷键注册表变更——表格自动刷新（#59-B）
  useEffect(() => {
    const unsub1 = onPluginLifecycleChange.event(() => setVersion((v) => v + 1));
    const unsub2 = CoreEvents.onDidChangeKeybindings.event(() => setVersion((v) => v + 1));
    return () => { unsub1(); unsub2(); };
  }, []);

  useEffect(() => {
    if (initialQuery) setSearch(initialQuery);
  }, [initialQuery]);

  // E3f #59-C：完整命令视图——以 CommandRegistry 为数据源，合并快捷键绑定
  const rows = useMemo(() => {
    const commands = getCommands();
    const conflicts = keybindingResolver.detectConflicts();
    const conflictKeys = new Set(conflicts.map((c) => c.key));

    return commands.map((cmd): KeybindingRow & { _conflict: boolean } => {
      const kb = findKeybindingForCommand(cmd.id);
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
  }, [version]);

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
    setKeybindingCaptureActive(true); // E3f #59-D：阻止全局 chord 状态机
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingRow(null);
    setFirstKey("");
    setSecondKey("");
    setActiveField("first");
    setKeybindingCaptureActive(false); // E3f #59-D
  }, []);

  const confirmEdit = useCallback(async () => {
    if (!editingRow || !firstKey) return;
    removeKeybindingForCommand(editingRow.command);
    const key = secondKey ? `${firstKey} ${secondKey}` : firstKey;
    registerKeybinding({
      command: editingRow.command,
      key,
      when: editingRow.when,
      source: "user",
    });
    await saveUserKeybindings();
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

      const keyString = keyboardEventToKeyString(e);
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
    const bindings = getKeybindings();
    return bindings.filter((b) => b.key === key && b.command !== editingRow?.command);
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

  // E3f #59-G：重置为默认
  const handleResetDefault = useCallback(async (row: KeybindingRow) => {
    const { showConfirm } = await import("../../core/DialogService");
    const confirmed = await showConfirm(t("确定要将「{{cmd}}」的快捷键重置为默认值吗？", { cmd: row.title }));
    if (!confirmed) return;
    resetKeybindingToDefault(row.command);
    await saveUserKeybindings();
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
                  <div>{row.title}</div>
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
                        <span className="keybindings-inline-conflict" title={secondConflict?.map(b => b.command).join("、")}>
                          ⚠
                        </span>
                      )}
                      {(!secondKey || !secondConflict) && firstConflict && firstConflict.length > 0 && (
                        <span className="keybindings-inline-conflict" title={firstConflict.map(b => b.command).join("、")}>
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
