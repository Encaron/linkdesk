/**
 * ProgressBar — 通知进度条组件。
 * 对标 VS Code 进度通知——右下角固定定位，max-width 450px，
 * 跟 ToastContainer 同一区域，不是全屏横条。
 *
 * 设计文档：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/05-E3e-通知系统.md
 * VS Code 对标：src/vs/workbench/services/notification/common/notificationService.ts
 */

import { useState, useEffect } from "react";
import {
  subscribeProgress,
  cancelProgress,
  type ProgressItem,
} from "../core/NotificationService";
import "./ProgressBar.css";

function ProgressBar() {
  const [items, setItems] = useState<ProgressItem[]>([]);

  useEffect(() => {
    return subscribeProgress((p) => setItems(p));
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="progress-container">
      {items.map((item) => (
        <ProgressItemRow key={item.id} item={item} />
      ))}
    </div>
  );
}

function ProgressItemRow({ item }: { item: ProgressItem }) {
  const { id, title, message, percentage, cancellable, done } = item;
  const pct = percentage < 0 ? 0 : percentage;

  return (
    <div className={`progress-card${done ? " progress-done" : ""}`}>
      {/* 主行：标题 + 百分比 + 取消 */}
      <div className="progress-card-header">
        <span className="codicon codicon-sync~spin progress-card-icon" />
        <span className="progress-card-title">{title}</span>
        <span className="progress-card-pct">
          {percentage < 0 ? "" : `${pct}%`}
        </span>
        {cancellable && !done && (
          <button
            className="progress-card-cancel"
            onClick={() => cancelProgress(id)}
            title="取消"
          >
            <span className="codicon codicon-close" />
          </button>
        )}
      </div>

      {/* 消息 */}
      {message && (
        <div className="progress-card-message">{message}</div>
      )}

      {/* 进度轨道 */}
      {!done && (
        <div className="progress-card-track">
          <div
            className={`progress-card-fill${percentage < 0 ? " progress-indeterminate" : ""}`}
            style={percentage >= 0 ? { width: `${pct}%` } : undefined}
          />
        </div>
      )}
    </div>
  );
}

export default ProgressBar;
