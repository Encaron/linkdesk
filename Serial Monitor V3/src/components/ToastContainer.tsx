/**
 * ToastContainer — toast 通知渲染容器。
 * Phase 4 Step 4：在状态栏上方浮动显示，最多 3 条堆叠。
 * 对标 VS Code 右下角通知。
 */

import { useState, useEffect } from "react";
import { subscribeToasts, dismissToast, type Toast } from "../core/toast";
import "./ToastContainer.css";

function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    return subscribeToasts(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast-item">
          <span className="toast-message">{toast.message}</span>
          {toast.actions && toast.actions.length > 0 && (
            <span className="toast-actions">
              {toast.actions.map((action, i) => (
                <button
                  key={i}
                  className="toast-action-btn"
                  onClick={() => {
                    action.onClick();
                    dismissToast(toast.id);
                  }}
                >
                  {action.label}
                </button>
              ))}
            </span>
          )}
          <button
            className="toast-close-btn"
            onClick={() => dismissToast(toast.id)}
            title="关闭"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export default ToastContainer;
