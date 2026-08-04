/**
 * ToastContainer — 通知渲染容器。
 * Phase 4 对标 VS Code Notifications 系统。
 * 读源码依据：notificationsToasts.css / notificationsList.css / notificationsViewer.ts
 *
 * 设计文档：docs/phase4_插件系统/V3-Phase4-通知系统设计.md
 */

import { useState, useEffect, useRef } from "react";
import { subscribeToasts, subscribeToastSuppressed, dismissToast, type Toast } from "../core/services/toast";
import "./ToastContainer.css";

/** VS Code 默认通知行高 */
const ROW_HEIGHT = 42;

function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [suppressed, setSuppressed] = useState(false);
  const prevIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    return subscribeToasts((t) => {
      const currentIds = new Set(t.map((x) => x.id));
      prevIds.current = currentIds;
      setToasts(t);
    });
  }, []);

  useEffect(() => {
    return subscribeToastSuppressed((v) => setSuppressed(v));
  }, []);

  if (toasts.length === 0 || suppressed) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <NotificationItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

/** 单条通知卡片——对标 VS Code `.notification-list-item` */
function NotificationItem({ toast }: { toast: Toast }) {
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

  const iconClass = getIconClass(toast);

  return (
    <div
      className={`toast-item${visible ? " toast-fade-in" : ""}${expanded ? " toast-expanded" : ""}`}
      onDoubleClick={() => setExpanded(!expanded)}
      onMouseUp={(e) => {
        // VS Code：中键关闭
        if (e.button === 1) {
          e.preventDefault();
          dismissToast(toast.id);
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
              title={expanded ? "收起" : "展开"}
            >
              <span className={`codicon ${expanded ? "codicon-chevron-down" : "codicon-chevron-up"}`} />
            </button>
          )}
          <button
            className="toast-close-btn"
            onClick={() => dismissToast(toast.id)}
            title="关闭"
          >
            <span className="codicon codicon-close" />
          </button>
        </div>
      </div>

      {/* ── 详情行：source + 按钮 ── */}
      {(expanded || mounted) && (
        <div className="toast-details-row">
          {toast.source && (
            <span className="toast-source">来源: {toast.source}</span>
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

/** 图标映射——对标 VS Code Severity codicons */
function getIconClass(toast: Toast): string {
  if (toast.icon) {
    // 如果直接传了 codicon 类名
    if (toast.icon.startsWith("codicon")) return `codicon ${toast.icon}`;
    // 如果传了自定义类名
    return toast.icon;
  }
  // 根据 severity 默认
  switch (toast.severity) {
    case "error":
      return "codicon codicon-error toast-severity-error";
    case "warning":
      return "codicon codicon-warning toast-severity-warning";
    case "info":
    default:
      return "codicon codicon-info toast-severity-info";
  }
}

function hasPrimaryActions(toast: Toast): boolean {
  return toast.actions?.some((a) => a.isPrimary) ?? false;
}

export default ToastContainer;
