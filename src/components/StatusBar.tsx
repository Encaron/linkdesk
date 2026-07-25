/**
 * StatusBar — 底部状态栏（22px）。
 * Phase 4.4：对标 VS Code——插件通过 statusBarComponent 自己渲染状态项，
 * 核心不认 pluginId。通知铃铛 + 语言/主题切换是核心固定项。
 *
 * 设计依据：VS Code extensionsActions.ts（插件提供 statusBar 组件）
 */

import { Fragment, useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { getStatusBarContributions } from "../pluginLoader/viewRegistry";
import { getViewPlugin } from "../pluginLoader/viewRegistry";
import { subscribeToasts, dismissToast, type Toast } from "../core/toast";
import { getConfigurationValue } from "../core/ConfigurationService";
import { executeCommand } from "../core/CommandRegistry";
import { CUSTOM_EVENTS } from "../core/CoreEvents";

/** 通知面板图标——对标 VS Code severity codicons */
function getNotifIconClass(n: Toast): string {
  if (n.icon) return n.icon.startsWith("codicon") ? n.icon : `codicon codicon-${n.icon}`;
  switch (n.severity) {
    case "error": return "codicon codicon-error notif-severity-error";
    case "warning": return "codicon codicon-warning notif-severity-warning";
    case "info":
    default: return "codicon codicon-info";
  }
}
import "./StatusBar.css";

interface StatusBarProps {
  error?: string | null;
  theme?: string;
  lang?: "zh" | "en";
  onToggleTheme?: () => void;
  onToggleLang?: () => void;
}

function StatusBar({ error, theme, lang, onToggleTheme, onToggleLang }: StatusBarProps) {
  const { t } = useTranslation();

  // 从 viewRegistry 读取所有插件的 statusBar 贡献
  const allItems = getStatusBarContributions();

  // 去重插件 ID（保持顺序）
  const orderedPluginIds = (() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const item of allItems) {
      if (!seen.has(item.pluginId)) {
        seen.add(item.pluginId);
        ids.push(item.pluginId);
      }
    }
    return ids;
  })();

  const leftPluginIds = orderedPluginIds.filter((pid) =>
    allItems.some((i) => i.pluginId === pid && i.align !== "right")
  );
  const rightPluginIds = orderedPluginIds.filter((pid) =>
    allItems.some((i) => i.pluginId === pid && i.align === "right")
  );

  // P3-9：通知铃铛
  const [notifications, setNotifications] = useState<Toast[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const notifBellRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    return subscribeToasts((toasts) => {
      setNotifications([...toasts]);
    });
  }, []);

  // E3b #36d：Chord 状态栏提示——归一化，所有 chord（Ctrl+K Ctrl+T 等）共用
  const [chordLabel, setChordLabel] = useState<string | null>(null);
  const chordTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      const { isPending, firstKey, failedKey } = (e as CustomEvent).detail as {
        isPending: boolean; firstKey?: string; failedKey?: string;
      };
      if (chordTimerRef.current) { clearTimeout(chordTimerRef.current); chordTimerRef.current = null; }
      if (isPending && firstKey) {
        const display = firstKey.replace(/\b\w/g, (c) => c.toUpperCase());
        setChordLabel(`(${display}) 已按下，正在等待第二键…`);
      } else if (failedKey && firstKey) {
        // 对标 VS Code："(Ctrl+K, unknown) is not a command"
        const f1 = firstKey.replace(/\b\w/g, (c) => c.toUpperCase());
        const f2 = failedKey.replace(/\b\w/g, (c) => c.toUpperCase());
        setChordLabel(`组合键 (${f1}, ${f2}) 不是命令`);
        chordTimerRef.current = setTimeout(() => setChordLabel(null), 3000);
      } else {
        setChordLabel(null);
      }
    };
    window.addEventListener(CUSTOM_EVENTS.CHORD_CHANGED, handler);
    return () => {
      window.removeEventListener(CUSTOM_EVENTS.CHORD_CHANGED, handler);
      if (chordTimerRef.current) clearTimeout(chordTimerRef.current);
    };
  }, []);

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

  /** 渲染某个插件的状态栏贡献——优先用插件自己的 statusBarComponent */
  function renderPluginStatusBar(pluginId: string) {
    const plugin = getViewPlugin(pluginId);
    if (plugin?.statusBarComponent) {
      const Comp = plugin.statusBarComponent;
      return <Comp key={pluginId} />;
    }
    // 静态渲染：label + 可选 icon
    const items = allItems.filter((i) => i.pluginId === pluginId);
    // E2c #19g：configurable 条目按配置值过滤显隐
    const visibleItems = items.filter((item) => {
      if (!item.configurable) return true;
      const configKey = `${pluginId}.statusBar.${item.id}`;
      return getConfigurationValue<boolean>(configKey) ?? true;
    });
    if (visibleItems.length === 0) return null;
    return (
      <Fragment key={pluginId}>
        {visibleItems.map((item, i) => {
          const content = (
            <>
              {item.icon && <span className={`codicon codicon-${item.icon}`} />}
              {item.label || item.id}
            </>
          );
          // E2c #19i：onClick 声明 → 渲染为可点击按钮
          const el = item.onClick ? (
            <button
              className="status-bar-btn"
              onClick={() => executeCommand(item.onClick!)}
            >
              {content}
            </button>
          ) : (
            <span className="status-text">{content}</span>
          );
          return (
            <Fragment key={item.id}>
              {i > 0 && <span className="status-divider">│</span>}
              {el}
            </Fragment>
          );
        })}
      </Fragment>
    );
  }

  return (
    <div className="status-bar">
      {/* 左区：插件贡献项 + 错误信息 */}
      <div className="status-bar-left">
        {leftPluginIds.map((pid, i) => (
          <Fragment key={pid}>
            {i > 0 && <span className="status-divider">│</span>}
            {renderPluginStatusBar(pid)}
          </Fragment>
        ))}
        {error && (
          <>
            <span className="status-divider">│</span>
            <span className="status-error" title={error}>{error}</span>
          </>
        )}
      </div>

      {/* 右区：Chord 提示 + 插件贡献项 + 核心固定项（通知 + 语言 + 主题） */}
      <div className="status-bar-right">
        {rightPluginIds.map((pid) => renderPluginStatusBar(pid))}
        {/* 通知铃铛 */}
        <button
          ref={notifBellRef}
          className={`status-bar-btn status-bar-notif-btn${unreadCount > 0 ? " has-notifications" : ""}`}
          onClick={() => setShowNotifPanel(!showNotifPanel)}
          title={unreadCount > 0 ? t("{{count}} 条通知", { count: unreadCount }) : t("通知")}
        >
          <span className="codicon codicon-bell" />{unreadCount > 0 && <span className="status-bar-notif-badge">{unreadCount}</span>}
        </button>
        {/* Chord 提示——临时出现，放最右边不影响固定按钮 */}
        {chordLabel && (
          <span className="status-text status-chord">{chordLabel}</span>
        )}
        {showNotifPanel && (
          <div className="status-bar-notif-panel" ref={notifPanelRef}>
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
                    <div className="notif-main-row">
                      <span className={`codicon ${getNotifIconClass(n)} notif-icon`} />
                      <span className="notif-panel-msg">{n.message}</span>
                      <button
                        className="notif-panel-dismiss"
                        onClick={() => dismissToast(n.id)}
                        title={t("关闭")}
                      >
                        <span className="codicon codicon-close" />
                      </button>
                    </div>
                    {(n.source || (n.actions && n.actions.length > 0)) && (
                      <div className="notif-details-row">
                        {n.source && <span className="notif-source">来源: {n.source}</span>}
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

export default StatusBar;
