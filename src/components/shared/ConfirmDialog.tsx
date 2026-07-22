/**
 * ConfirmDialog — 自定义确认弹窗，替代 window.confirm()。
 * Tauri WebView 禁用了 window.confirm()，需要一个 React 实现的替代品。
 * Phase 6 会升级为更完善的对话框系统。
 *
 * 使用方式：await showConfirm("确定关闭吗？") → true/false
 */

import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import "./ConfirmDialog.css";

/* ── 模块级桥接——showConfirm() 是 imperative API，通过 ref 连接到 React state ── */

let gResolve: ((v: boolean) => void) | null = null;
let gSetOpen: ((open: boolean) => void) | null = null;
let gSetMessage: ((msg: string) => void) | null = null;

/**
 * 显示确认弹窗，返回 Promise<boolean>。
 * 用户点"确定"→ resolve(true)，点"取消"或点 backdrop → resolve(false)。
 */
export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    gResolve = resolve;
    gSetMessage?.(message);
    gSetOpen?.(true);
  });
}

/** 确认弹窗组件——在 App.tsx 中渲染一次即可。 */
export function ConfirmDialog() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  gSetOpen = setOpen;
  gSetMessage = setMessage;

  const handleConfirm = useCallback(() => {
    setOpen(false);
    gResolve?.(true);
    gResolve = null;
  }, []);

  const handleCancel = useCallback(() => {
    setOpen(false);
    gResolve?.(false);
    gResolve = null;
  }, []);

  if (!open) return null;

  return (
    <div className="confirm-backdrop" onClick={handleCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-btn confirm-btn-secondary" onClick={handleCancel}>
            {t("取消")}
          </button>
          <button className="confirm-btn confirm-btn-primary" onClick={handleConfirm}>
            {t("确定")}
          </button>
        </div>
      </div>
    </div>
  );
}
