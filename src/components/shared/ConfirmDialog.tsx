/**
 * ConfirmDialog — React 确认/提示弹窗组件。
 * E2c #15：注册到 DialogService，替代模块级桥接变量。
 *
 * 全部颜色走 CSS 变量，暗色/亮色自动适配。
 * 使用方式：
 *   import { confirm, alert } from "../../core/DialogService";
 *   const ok = await confirm({ title: "关闭", message: "确定关闭吗？" });
 */

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  registerDialogRenderers,
  unregisterDialogRenderers,
  type DialogOptions,
} from "../../core/DialogService";
// E2c #15：re-export showConfirm 兼容旧 import 路径（terminal sidebar 仍引用此文件）
export { showConfirm } from "../../core/DialogService";
import "./ConfirmDialog.css";

/* ── 类型 ── */

interface DialogState {
  open: boolean;
  options: DialogOptions;
  resolve: ((v: boolean) => void) | null;
  /** alert 模式——只有确认按钮，不返回 boolean */
  alertResolve: (() => void) | null;
}

/* ── 组件 ── */

export function ConfirmDialog() {
  const { t } = useTranslation();
  const [state, setState] = useState<DialogState>({
    open: false,
    options: { title: "", message: "" },
    resolve: null,
    alertResolve: null,
  });

  // 注册到 DialogService——挂载时注册，卸载时清理
  useEffect(() => {
    const confirmRenderer = (options: DialogOptions): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({ open: true, options, resolve, alertResolve: null });
      });
    };

    const alertRenderer = (options: DialogOptions): Promise<void> => {
      return new Promise((resolve) => {
        setState({ open: true, options, resolve: null, alertResolve: resolve });
      });
    };

    registerDialogRenderers(confirmRenderer, alertRenderer);
    return () => unregisterDialogRenderers();
  }, []);

  const isAlert = !!state.alertResolve;

  const handleConfirm = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
    if (state.resolve) state.resolve(true);
    if (state.alertResolve) state.alertResolve();
  }, [state.resolve, state.alertResolve]);

  const handleCancel = useCallback(() => {
    setState((prev) => ({ ...prev, open: false }));
    if (state.resolve) state.resolve(false);
    // alert 模式没有取消——点 backdrop 关闭不触发任何回调
  }, [state.resolve]);

  /** Enter=确认 / Escape=取消——对标原生 dialog 键盘行为 */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); handleConfirm(); }
    else if (e.key === "Escape" && !isAlert) { e.preventDefault(); handleCancel(); }
  }, [handleConfirm, handleCancel, isAlert]);

  if (!state.open) return null;

  const { options } = state;

  return (
    <div className="confirm-backdrop" onClick={isAlert ? undefined : handleCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}
        tabIndex={-1} ref={(el) => el?.focus()} onKeyDown={handleKeyDown}>
        {options.title && <h3 className="confirm-title">{options.title}</h3>}
        <p className="confirm-message">{options.message}</p>
        <div className="confirm-actions">
          {!isAlert && (
            <button className="confirm-btn confirm-btn-secondary" onClick={handleCancel}>
              {options.cancelLabel ?? t("取消")}
            </button>
          )}
          <button className="confirm-btn confirm-btn-primary" onClick={handleConfirm}>
            {options.confirmLabel ?? (isAlert ? t("确定") : t("确定"))}
          </button>
        </div>
      </div>
    </div>
  );
}
