/**
 * NotificationCenter —— 通知中心铃铛 + 下拉面板。
 * 对标 VS Code Notifications Center——铃铛图标 → 面板 → 按时间分组 + 未读/已读。
 *
 * 从 StatusBar.tsx 提取（E3e #49），原面板代码在 StatusBar.tsx:65-258。
 * 面板样式仍用 StatusBar.css 中已有的 .status-bar-notif-* 类。
 *
 * 设计文档：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/05-E3e-通知系统.md
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { subscribeToasts, dismissToast, setToastsSuppressed, type Toast } from "../core/services/toast";

/* ── 模块级未读追踪——跨渲染保留，面板关闭期间到来的通知标记为未读 ── */

const _seenIds = new Set<string>();

/* ── 时间格式化——中文友好，零外部依赖 ── */

function formatTimeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return i18n.t("刚刚");
  const min = Math.floor(diff / 60_000);
  if (min < 60) return i18n.t("{{min}} 分钟前", { min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return i18n.t("{{hr}} 小时前", { hr });
  const d = Math.floor(hr / 24);
  return i18n.t("{{d}} 天前", { d });
}

/* ── E3e #50：source 归类 ── */

interface SourceGroup {
  key: string;
  label: string;
  unread: number;
  items: Toast[];
}

function buildSourceGroups(notifications: Toast[]): SourceGroup[] {
  const map = new Map<string, Toast[]>();
  for (const n of notifications) {
    // source 取第一段作为插件名——"terminal.portErrors" → "terminal"
    const src = n.source?.split(".")[0] || "";
    const key = src || "__other__";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(n);
  }

  const groups: SourceGroup[] = [];
  for (const [key, items] of map) {
    items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const unread = items.filter((n) => !_seenIds.has(n.id)).length;
    groups.push({
      key,
      label: key === "__other__" ? i18n.t("其他") : key,
      unread,
      items,
    });
  }

  // 有未读的组排前面
  groups.sort((a, b) => b.unread - a.unread);
  return groups;
}

/* ── 图标映射 ── */

function getNotifIconClass(n: Toast): string {
  if (n.icon) return n.icon.startsWith("codicon") ? n.icon : `codicon codicon-${n.icon}`;
  switch (n.severity) {
    case "error": return "codicon codicon-error notif-severity-error";
    case "warning": return "codicon codicon-warning notif-severity-warning";
    case "info":
    default: return "codicon codicon-info";
  }
}

/* ── 组件 ── */

function NotificationCenter() {
  const { t } = useTranslation();

  const [notifications, setNotifications] = useState<Toast[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);

  // 订阅 toast
  useEffect(() => {
    return subscribeToasts((toasts) => {
      setNotifications([...toasts]);
    });
  }, []);

  // 面板打开时标记所有为已读 + 隐藏右下角 toast
  useEffect(() => {
    setToastsSuppressed(showPanel);
    if (showPanel) {
      for (const n of notifications) _seenIds.add(n.id);
    }
  }, [showPanel, notifications]);

  // 点击外部关闭
  useEffect(() => {
    if (!showPanel) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (bellRef.current?.contains(target)) return;
      setShowPanel(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [showPanel]);

  // 清空全部
  const clearAll = useCallback(() => {
    notifications.forEach((n) => dismissToast(n.id));
  }, [notifications]);

  // 未读计数
  const unreadCount = notifications.filter((n) => !_seenIds.has(n.id)).length;

  // E3e #50：按 source 归类——同插件通知放一起，最新在前
  const sourceGroups = buildSourceGroups(notifications);

  return (
    <>
      {/* 铃铛 */}
      <button
        ref={bellRef}
        className={`status-bar-btn status-bar-notif-btn${unreadCount > 0 ? " has-notifications" : ""}`}
        onClick={() => setShowPanel(!showPanel)}
        title={unreadCount > 0 ? t("{{count}} 条通知", { count: unreadCount }) : t("通知")}
      >
        <span className="codicon codicon-bell" />
        {unreadCount > 0 && (
          <span className="status-bar-notif-badge">{unreadCount}</span>
        )}
      </button>

      {/* 面板 */}
      {showPanel && (
        <div className="status-bar-notif-panel" ref={panelRef}>
          <div className="notif-panel-header">
            <span className="notif-panel-title">{t("通知")}</span>
            <div className="notif-panel-toolbar">
              {notifications.length > 0 && (
                <button className="notif-panel-clear" onClick={clearAll}>
                  {t("全部清除")}
                </button>
              )}
            </div>
          </div>
          {notifications.length === 0 ? (
            <div className="notif-panel-empty">{t("暂无通知")}</div>
          ) : (
            <div className="notif-panel-list">
              {sourceGroups.map((group) => (
                <div key={group.key}>
                  <div className="notif-panel-section-header">
                    <span className="notif-source-group-label">{group.label}</span>
                    {group.unread > 0 && (
                      <span className="notif-source-group-badge">{group.unread}</span>
                    )}
                  </div>
                  {group.items.map(renderNotifItem)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** 单条通知项 */
function renderNotifItem(n: Toast) {
  const timeLabel = n.createdAt ? formatTimeAgo(n.createdAt) : "";

  return (
    <div key={n.id} className="notif-panel-item">
      <div className="notif-main-row">
        <span className={`codicon ${getNotifIconClass(n)} notif-icon`} />
        <span className="notif-panel-msg">{n.message}</span>
        {timeLabel && (
          <span className="notif-panel-time">{timeLabel}</span>
        )}
        <button
          className="notif-panel-dismiss"
          onClick={() => dismissToast(n.id)}
          title={i18n.t("关闭")}
        >
          <span className="codicon codicon-close" />
        </button>
      </div>
      {(n.source || (n.actions && n.actions.length > 0)) && (
        <div className="notif-details-row">
          {n.source && <span className="notif-source">{i18n.t("来源: {{source}}", { source: n.source })}</span>}
          {n.actions && n.actions.length > 0 && (
            <div className="notif-actions-row">
              {n.actions.map((a, i) => (
                <button
                  key={i}
                  className={`notif-action-btn ${a.isPrimary ? "primary" : "secondary"}`}
                  onClick={() => { a.onClick(); dismissToast(n.id); }}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationCenter;
