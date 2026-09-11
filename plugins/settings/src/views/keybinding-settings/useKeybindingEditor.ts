/**
 * 行内编辑状态机——双击改绑定：双框 chord 捕获 + ✕ + 点击外部取消 + 冲突检测 + 重置为默认。
 * E6#87d 自 KeybindingSettingsView.tsx 逐字搬出（只搬家，零逻辑变更）。
 * E3f #59-D 原始设计；#59-G 重置默认走 linkdesk.dialog.confirm。
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { KeybindingRow, KeybindingBinding } from "./types";

function lk() {
  return window.linkdesk;
}

export function useKeybindingEditor(allKeybindings: KeybindingBinding[]) {
  // E3f #59-D：行内编辑——双框模式
  const [editingRow, setEditingRow] = useState<KeybindingRow | null>(null);
  const [firstKey, setFirstKey] = useState("");
  const [secondKey, setSecondKey] = useState("");
  const [activeField, setActiveField] = useState<"first" | "second">("first");
  const editRowRef = useRef<HTMLDivElement>(null);

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

  return {
    editingRow,
    firstKey,
    secondKey,
    activeField,
    setActiveField,
    editRowRef,
    startEdit,
    cancelEdit,
    confirmEdit,
    firstConflict,
    secondConflict,
    splitChord,
  };
}

/** 编辑状态机的返回值——行组件按需取用 */
export type KeybindingEditor = ReturnType<typeof useKeybindingEditor>;
