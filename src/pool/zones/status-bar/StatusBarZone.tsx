/**
 * StatusBarZone——E5.7#8。状态栏 React Zone——壳 StatusBar + NotificationCenter 迁入池。
 *
 * 数据全部来自 layout.statusBar（壳侧已合并三源/算好分隔线/翻译/分组——显示文本铁律）。
 * 池 = 哑渲染器：
 *   - 左区：插件条目（分隔线壳侧算好）+ Chord 提示字符串（壳构建）
 *   - 右区：插件条目 + 通知中心（铃铛 + 面板）
 *   - 插件 statusBarComponent（serial-monitor TX/RX 计数）——PoolStatusBarComponent 懒加载
 *   - 通知操作回传（events 往返）：面板开闭/单条关闭/全部清除/动作点击——壳侧执行
 *     （ToastAction.onClick 是壳侧闭包，不可序列化——usePoolSync 订阅 notif:* 通道）
 *
 * 与壳行为差异（诚实注记）：
 *   ① E5.8#107 浮层权威：面板已收敛为壳同款 OverlayPortal（进 #overlay-root，外部点击/Escape
 *      由 OverlayPortal 统一处理）——原「fixed + document mousedown」手动实现删除。
 *   ② 通知面板关闭期间 toast 继续出现在右下角——setToastsSuppressed 由壳在 notif:panel
 *      事件里执行（面板打开 → 隐藏 toast），语义与壳一致。
 */

import { Fragment, useState, useRef, useEffect } from "react";
import type { StatusBarLayout, PoolStatusBarItem } from "../../../core/types/pool/poolLayout";
import PoolStatusBarComponent from "../../shared/pool-status-bar/PoolStatusBarComponent";
import { executePoolCommand } from "../../commands/executePoolCommand";
import OverlayPortal from "../../../components/shared/overlay-portal/OverlayPortal";
import "./StatusBarZone.css";

/** 池 → 壳通知事件——usePoolSync 订阅（壳侧 dismissToast/setToastsSuppressed/action.onClick） */
function emitNotif(channel: string, payload?: unknown) {
  window.linkdesk?.events?.emit(channel, payload);
}

function StatusBarZone({ statusBar }: { statusBar: StatusBarLayout }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const bellRef = useRef<HTMLButtonElement>(null);

  // 面板开闭 → 壳（setToastsSuppressed + 标记已读）。首帧跳过——避免 mount 即发 false。
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) { firstRenderRef.current = false; return; }
    emitNotif("notif:panel", panelOpen);
  }, [panelOpen]);

  // 左/右分列——switch 判别（eslint E5.5#10 规则拦 `=== "小写字面量"`，tag 判别用 switch 不误报）
  const leftItems: PoolStatusBarItem[] = [];
  const rightItems: PoolStatusBarItem[] = [];
  for (const item of statusBar.items) {
    switch (item.align) {
      case "left": leftItems.push(item); break;
      default: rightItems.push(item); break;
    }
  }

  const renderItem = (item: PoolStatusBarItem) => {
    const content = (
      <>
        {item.icon && <span className={`codicon codicon-${item.icon}`} />}
        {item.label}
      </>
    );
    const inner = item.component ? (
      <PoolStatusBarComponent pluginId={item.pluginId} />
    ) : item.onClick ? (
      <button
        className="status-bar-btn"
        title={item.title || item.label}
        onClick={() => executePoolCommand(item.onClick!)}
      >
        {content}
      </button>
    ) : (
      // 壳非可点击条目无 title 属性（span 纯文本）——照搬
      <span className="status-text">{content}</span>
    );
    return (
      <Fragment key={`${item.pluginId}:${item.id}`}>
        {item.dividerBefore && <span className="status-divider" />}
        {inner}
      </Fragment>
    );
  };

  const { notif } = statusBar;

  return (
    <div className="status-bar">
      {/* 左区：插件贡献项 + Chord 提示（壳 StatusBar 同款结构） */}
      <div className="status-bar-left">
        {leftItems.map(renderItem)}
        {statusBar.chordLabel && (
          <>
            <span className="status-divider" />
            <span className="status-text status-chord">{statusBar.chordLabel}</span>
          </>
        )}
      </div>

      {/* 右区：插件贡献项 + 通知中心（壳 NotificationCenter 迁入） */}
      <div className="status-bar-right">
        {rightItems.map(renderItem)}
        <button
          ref={bellRef}
          className={`status-bar-btn status-bar-notif-btn${notif.unread > 0 ? " has-notifications" : ""}`}
          onClick={() => setPanelOpen(!panelOpen)}
          title={notif.bellTitle}
        >
          <span className="codicon codicon-bell" />
          {notif.unread > 0 && (
            <span className="status-bar-notif-badge">{notif.unread}</span>
          )}
        </button>

        {panelOpen && (
          <OverlayPortal onClose={() => setPanelOpen(false)} triggerRef={bellRef}>
            <div className="status-bar-notif-panel">
            <div className="notif-panel-header">
              <span className="notif-panel-title">{notif.panelTitle}</span>
              <div className="notif-panel-toolbar">
                {notif.groups.length > 0 && (
                  <button className="notif-panel-clear" onClick={() => emitNotif("notif:clearAll")}>
                    {notif.clearLabel}
                  </button>
                )}
              </div>
            </div>
            {notif.groups.length === 0 ? (
              <div className="notif-panel-empty">{notif.emptyLabel}</div>
            ) : (
              <div className="notif-panel-list">
                {notif.groups.map((group) => (
                  <div key={group.key}>
                    <div className="notif-panel-section-header">
                      <span className="notif-source-group-label">{group.label}</span>
                      {group.unread > 0 && (
                        <span className="notif-source-group-badge">{group.unread}</span>
                      )}
                    </div>
                    {group.items.map((item) => (
                      <div key={item.id} className="notif-panel-item">
                        {/* 🔥 2026-09-05 对齐 VS Code：详情行先放 DOM（details-first）。与 .notif-panel-item
                            column-reverse 组合后 = 视觉消息行在上、按钮在下；键盘 Tab 序仍按钮先到（DOM 序决定
                            焦点序，与 column-reverse 视觉无关）——VS Code notificationsViewer.ts renderTemplate 同款
                            （原实现主行先放 + column-reverse = 视觉按钮跑消息上面，与 VS Code 正好相反）。 */}
                        {(item.sourceLabel || item.actions.length > 0) && (
                          <div className="notif-details-row">
                            {item.sourceLabel && <span className="notif-source">{item.sourceLabel}</span>}
                            {item.actions.length > 0 && (
                              <div className="notif-actions-row">
                                {item.actions.map((a, i) => (
                                  <button
                                    key={i}
                                    className={`notif-action-btn ${a.isPrimary ? "primary" : "secondary"}`}
                                    onClick={() => emitNotif("notif:action", { id: item.id, index: i })}
                                  >
                                    {a.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="notif-main-row">
                          <span className={`codicon ${item.iconClass} notif-icon`} />
                          <span className="notif-panel-msg">{item.message}</span>
                          {item.timeLabel && (
                            <span className="notif-panel-time">{item.timeLabel}</span>
                          )}
                          <button
                            className="notif-panel-dismiss"
                            onClick={() => emitNotif("notif:dismiss", item.id)}
                            title={notif.dismissTitle}
                          >
                            <span className="codicon codicon-close" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
            </div>
          </OverlayPortal>
        )}
      </div>
    </div>
  );
}

export default StatusBarZone;
