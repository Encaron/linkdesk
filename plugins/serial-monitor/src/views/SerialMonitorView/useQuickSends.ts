/**
 * 快捷发送条——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * quickSends 数据本身来自会话（settings.quickSends），本 hook 只管编辑态与写入：
 * 唯一写入入口是本文件（§3.12 硬规则），经 updateSession 落回会话。
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { LineType } from "../../types";

export interface QuickSendsOptions {
  quickSends: Record<string, string>;
  updateSession: (patch: { quickSends?: Record<string, string> }) => void;
  appendLine: (text: string, color: LineType) => void;
}

export function useQuickSends({ quickSends, updateSession, appendLine }: QuickSendsOptions) {
  const { t } = useTranslation();

  const [qsAdding, setQsAdding] = useState(false);
  const [qsEditing, setQsEditing] = useState<string | null>(null);
  const [qsName, setQsName] = useState("");
  const [qsContent, setQsContent] = useState("");
  const [qsCtxMenu, setQsCtxMenu] = useState<{ key: string; x: number; y: number } | null>(null);

  const saveQuickSends = useCallback((updated: Record<string, string>) => {
    // Phase 5.5c C4a：写入会话——唯一入口 QuickSendBar（§3.12 硬规则）
    // C1：updateSession 已绑定 sourceId，无需传 id 参数
    updateSession({ quickSends: updated });
  }, [updateSession]);

  const handleSaveQuickSend = () => {
    if (!qsName.trim() || !qsContent.trim()) return;
    const name = qsName.trim();
    if (qsEditing && qsEditing !== name) {
      const updated = { ...quickSends };
      delete updated[qsEditing];
      updated[name] = qsContent.trim();
      saveQuickSends(updated);
      appendLine(t("---- 快捷发送「{{name}}」已更新 ----", { name }), "system");
    } else if (qsEditing) {
      saveQuickSends({ ...quickSends, [name]: qsContent.trim() });
      appendLine(t("---- 快捷发送「{{name}}」已更新 ----", { name }), "system");
    } else {
      saveQuickSends({ ...quickSends, [name]: qsContent.trim() });
      appendLine(t("---- 快捷发送「{{name}}」已添加 ----", { name }), "system");
    }
    setQsName("");
    setQsContent("");
    setQsAdding(false);
    setQsEditing(null);
  };

  const handleDeleteQuickSend = (key: string) => {
    const updated = { ...quickSends };
    delete updated[key];
    saveQuickSends(updated);
    appendLine(t("---- 快捷发送「{{name}}」已删除 ----", { name: key }), "system");
    setQsCtxMenu(null);
  };

  const handleQuickSendCtxMenu = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    setQsCtxMenu({ key, x: e.clientX, y: e.clientY });
  };

  return {
    qsAdding, setQsAdding, qsEditing, setQsEditing,
    qsName, setQsName, qsContent, setQsContent,
    qsCtxMenu, setQsCtxMenu, handleSaveQuickSend, handleDeleteQuickSend, handleQuickSendCtxMenu,
  };
}
