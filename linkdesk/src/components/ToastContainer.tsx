/**
 * ToastContainer — 通知渲染容器。
 * Phase 4 对标 VS Code Notifications 系统。
 * 读源码依据：notificationsToasts.css / notificationsList.css / notificationsViewer.ts
 *
 * 设计文档：docs/phase4_插件系统/V3-Phase4-通知系统设计.md
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import OverlayPortal from "./shared/OverlayPortal";
import { subscribeToasts, subscribeToastSuppressed, dismissToast, getToastIconClass, type Toast } from "../core/services/toast";
import "./ToastContainer.css";

/** VS Code 默认通知行高 */
const ROW_HEIGHT = 42;

function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [suppressed, setSuppressed] = useState(false);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const prevIds = useRef<Set<string>>(new Set());
  const toastMapRef = useRef<Map<string, Toast>>(new Map());

  useEffect(() => {
    return subscribeToasts((t) => {
      // 维护全量 toast 数据缓存——dismiss 后仍需数据渲染退出动画
      for (const toast of t) {
        toastMapRef.current.set(toast.id, toast);
      }
      const currentIds = new Set(t.map((x) => x.id));
      // E3.5 #TO01: 检测消失的 toast → 标记为退出中而非立即卸载
      for (const id of prevIds.current) {
        if (!currentIds.has(id) && toastMapRef.current.has(id)) {
          setExitingIds((prev) => new Set(prev).add(id));
        }
      }
      prevIds.current = currentIds;
      setToasts(t);
    });
  }, []);

  useEffect(() => {
    return subscribeToastSuppressed((v) => setSuppressed(v));
  }, []);

  // E3.5 #TO05: 退出动画结束 → 从 exitingIds 移除
  const handleExited = useCallback((id: string) => {
    setExitingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  if (toasts.length === 0 && exitingIds.size === 0) return null;

  // E3.5 #TO02: 合并活跃 + 退出中 toast
  const renderToasts: Array<{ toast: Toast; exiting: boolean }> = [
    ...toasts.map((t) => ({ toast: t, exiting: false })),
  ];
  for (const id of exitingIds) {
    if (!toasts.some((t) => t.id === id)) {
      const data = toastMapRef.current.get(id);
      if (data) renderToasts.push({ toast: data, exiting: true });
    }
  }

  if (renderToasts.length === 0 || suppressed) return null;

  return (
    <OverlayPortal>
    <div className="toast-container">
      {renderToasts.map(({ toast, exiting }) => (
        <NotificationItem key={toast.id} toast={toast} exiting={exiting} onExited={() => handleExited(toast.id)} />
      ))}
    </div>
    </OverlayPortal>
  );
}

/** 单条通知卡片——对标 VS Code `.notification-list-item` */
function NotificationItem({ toast, exiting, onExited }: { toast: Toast; exiting?: boolean; onExited?: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 首次渲染后触发入场动画
    const id = requestAnimationFrame(() => {
      setMounted(true);
      const id2 = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(id2);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // E3.5 #TO03: 退出动画——exiting 时去掉 toast-fade-in 触发 CSS 反向动画
  useEffect(() => {
    if (exiting && visible) {
      setVisible(false);
    }
  }, [exiting, visible]);

  const iconClass = getToastIconClass(toast); // E5.7#16：图标解析迁入 toast 服务归一（serialize 与渲染共用）

  return (
    <div
      className={`toast-item${visible ? " toast-fade-in" : ""}${expanded ? " toast-expanded" : ""}${exiting ? " toast-exiting" : ""}`}
      onDoubleClick={() => setExpanded(!expanded)}
      onMouseUp={(e) => {
        // VS Code：中键关闭
        if (e.button === 1) {
          e.preventDefault();
          dismissToast(toast.id);
        }
      }}
      onTransitionEnd={(e) => {
        // E3.5 #TO05: CSS transition 结束后才真正从 DOM 移除
        if (exiting && e.target === e.currentTarget && e.propertyName === "opacity") {
          onExited?.();
        }
      }}
    >
      {/* ── 主行 ── */}
      <div className="toast-main-row" style={{ minHeight: ROW_HEIGHT }}>
        {/* 图标 */}
        <div className={`toast-icon ${iconClass}`} />

        {/* 消息 */}
        <div className="toast-message" title={toast.message}>
          {toast.message}
        </div>

        {/* 工具栏——对标 VS Code：hover 时显示 */}
        <div className="toast-toolbar">
          {hasPrimaryActions(toast) && (
            <button
              className="toast-chevron-btn"
              onClick={() => setExpanded(!expanded)}
              title={expanded ? t("收起") : t("展开")}
            >
              <span className={`codicon ${expanded ? "codicon-chevron-down" : "codicon-chevron-up"}`} />
            </button>
          )}
          <button
            className="toast-close-btn"
            onClick={() => dismissToast(toast.id)}
            title={t("关闭")}
          >
            <span className="codicon codicon-close" />
          </button>
        </div>
      </div>

      {/* ── 详情行：source + 按钮 ── */}
      {(expanded || mounted) && (
        <div className="toast-details-row">
          {toast.source && (
            <span className="toast-source">{t("来源: {{source}}", { source: toast.source })}</span>
          )}
          {toast.actions && toast.actions.length > 0 && (
            <div className="toast-actions">
              {toast.actions.map((action, i) => (
                <button
                  key={i}
                  className={`toast-action-btn ${action.isPrimary ? "primary" : "secondary"}`}
                  onClick={() => {
                    action.onClick();
                    dismissToast(toast.id);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function hasPrimaryActions(toast: Toast): boolean {
  return toast.actions?.some((a) => a.isPrimary) ?? false;
}

export default ToastContainer;
