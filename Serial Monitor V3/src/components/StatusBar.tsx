/**
 * StatusBar — 底部状态栏。
 * Phase 4 P0-2：走 getStatusBarContributions() 插件贡献框架。
 * Phase 4 P3-9：通知铃铛 🔔 + 未读计数 + 通知历史面板。
 * 左区：插件贡献项（align: "left"）按加载顺序排列。
 * 右区：插件贡献项（align: "right"）+ 核心全局项（语言、主题、通知）。
 * 对标 VS Code Status Bar Contributions + Notification Bell。
 *
 * 设计依据：[V3-插件系统与UI重构设计.md §3.5 + §3.6]
 */

import { Fragment, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getStatusBarContributions } from "../pluginLoader/viewRegistry";
import { subscribeToasts, dismissToast, type Toast } from "../core/toast";
import type { StatusBarItem } from "../core/types";
import "./StatusBar.css";

interface StatusBarProps {
  isOpen: boolean;
  txBytes: number;
  rxBytes: number;
  error?: string | null;
  theme?: "Dark" | "Light";
  lang?: "zh" | "en";
  onToggleTheme?: () => void;
  onToggleLang?: () => void;
}

function StatusBar({ isOpen, txBytes, rxBytes, error, theme, lang, onToggleTheme, onToggleLang }: StatusBarProps) {
  const { t } = useTranslation();

  // Phase 4：从 viewRegistry 读取所有插件的 statusBar 贡献
  const allItems = getStatusBarContributions();

  // P3-9：通知铃铛——未读计数 + 通知历史
  const [notifications, setNotifications] = useState<Toast[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const notifBellRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return subscribeToasts((toasts) => {
      setNotifications([...toasts]);
    });
  }, []);

  // 点击外部关闭通知面板（对标 VS Code：点击面板+铃铛之外的地方关闭）
  useEffect(() => {
    if (!showNotifPanel) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (notifPanelRef.current?.contains(target)) return;
      if (notifBellRef.current?.contains(target)) return;
      setShowNotifPanel(false);
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [showNotifPanel]);

  const unreadCount = notifications.length;
  const leftItems = allItems.filter((item) => item.align !== "right");
  const rightItems = allItems.filter((item) => item.align === "right");

  /** 渲染单个贡献条目——已知条目用动态数据，未知条目渲染静态 label */
  function renderContribution(item: StatusBarItem & { pluginId: string }) {
    // ── 终端插件：连接状态 ──
    if (item.pluginId === "terminal" && item.id === "connection") {
      return (
        <>
          <span className={`status-dot${isOpen ? " connected" : ""}`} />
          <span className="status-text">
            {isOpen ? t("已连接") : t("未连接")}
          </span>
        </>
      );
    }

    // ── 终端插件：TX/RX 流量 ──
    if (item.pluginId === "terminal" && item.id === "stats") {
      return (
        <>
          <span className="status-traffic">TX:{formatBytes(txBytes)} ↑</span>
          <span className="status-divider">│</span>
          <span className="status-traffic">RX:{formatBytes(rxBytes)} ↓</span>
        </>
      );
    }

    // ── 通用：静态 label + 可选 icon ──
    return (
      <span className="status-text">
        {item.icon && <span className={`codicon codicon-${item.icon}`} />}
        {item.label || item.id}
      </span>
    );
  }

  return (
    <div className="status-bar">
      {/* 左区：插件贡献项 + 错误信息 */}
      <div className="status-bar-left">
        {leftItems.map((item, i) => (
          <Fragment key={`${item.pluginId}-${item.id}`}>
            {i > 0 && <span className="status-divider">│</span>}
            {renderContribution(item)}
          </Fragment>
        ))}
        {error && (
          <>
            <span className="status-divider">│</span>
            <span className="status-error" title={error}>{error}</span>
          </>
        )}
      </div>

      {/* 右区：插件贡献项（align: right）+ 核心全局项（语言 + 主题 + 通知） */}
      <div className="status-bar-right">
        {rightItems.map((item) => (
          <Fragment key={`${item.pluginId}-${item.id}`}>
            {renderContribution(item)}
          </Fragment>
        ))}
        {/* P3-9：通知铃铛 —— 对标 VS Code notificationsCenter */}
        <button
          ref={notifBellRef}
          className={`status-bar-btn status-bar-notif-btn${unreadCount > 0 ? " has-notifications" : ""}`}
          onClick={() => setShowNotifPanel(!showNotifPanel)}
          title={unreadCount > 0 ? t("{{count}} 条通知", { count: unreadCount }) : t("通知")}
        >
          <span className="codicon codicon-bell" />{unreadCount > 0 && <span className="status-bar-notif-badge">{unreadCount}</span>}
        </button>
        {showNotifPanel && (
          <div className="status-bar-notif-panel" ref={notifPanelRef}>
            {/* VS Code: header 35px, title uppercase, toolbar on right */}
            <div className="notif-panel-header">
              <span className="notif-panel-title">{t("通知")}</span>
              <div className="notif-panel-toolbar">
                {unreadCount > 0 && (
                  <button
                    className="notif-panel-clear"
                    onClick={() => notifications.forEach((n) => dismissToast(n.id))}
                  >
                    {t("全部清除")}
                  </button>
                )}
              </div>
            </div>
            {notifications.length === 0 ? (
              <div className="notif-panel-empty">{t("暂无通知")}</div>
            ) : (
              <div className="notif-panel-list">
                {notifications.map((n) => (
                  <div key={n.id} className="notif-panel-item">
                    {/* VS Code: main row = icon + message + dismiss (hover reveal) */}
                    <div className="notif-main-row">
                      <span className="codicon codicon-info notif-icon" />
                      <span className="notif-panel-msg">{n.message}</span>
                      <button
                        className="notif-panel-dismiss"
                        onClick={() => dismissToast(n.id)}
                        title={t("关闭")}
                      >
                        ✕
                      </button>
                    </div>
                    {/* VS Code: source row hidden unless expanded */}
                    <div className="notif-source-row">
                      {n.actions && n.actions.length > 0
                        ? n.actions.map((a, i) => (
                            <button
                              key={i}
                              className="notif-panel-clear"
                              onClick={() => { a.onClick(); dismissToast(n.id); }}
                            >
                              {a.label}
                            </button>
                          ))
                        : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {onToggleLang && (
          <button className="status-bar-btn" onClick={onToggleLang} title={t("切换语言")}>
            {lang === "zh" ? "中" : "EN"}
          </button>
        )}
        {onToggleTheme && (
          <button className="status-bar-btn" onClick={onToggleTheme} title={t("切换主题")}>
            {theme === "Dark" ? "☀" : "☾"}
          </button>
        )}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

export default StatusBar;
