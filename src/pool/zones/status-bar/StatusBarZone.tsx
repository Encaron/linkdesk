/**
 * StatusBarZone——E5.7#8。状态栏 React Zone——壳 StatusBar + NotificationCenter 迁入池。
 *
 * 数据全部来自 layout.statusBar（壳侧已合并三源/算好分隔线/翻译/分组——显示文本铁律）。
 * 池 = 哑渲染器：
 *   - 左区：插件条目（分隔线壳侧算好）+ Chord 提示字符串（壳构建）
 *   - 右区：插件条目 + 通知中心（铃铛 + 面板）
 *   - 插件自绘状态栏组件（E6#17d：manifest appearsIn.statusBar 声明发 component marker）——PoolStatusBarComponent 懒加载（serial-monitor 连接灯）
 *   - 通知操作回传（events 往返）：面板开闭/单条关闭/全部清除/动作点击——壳侧执行
 *     （ToastAction.onClick 是壳侧闭包，不可序列化——usePoolSync 订阅 notif:* 通道）
 *
 * E6#72 通知面归一：右下窄小卡（ToastHost）整删后，本面板是**唯一通知面**。
 *   - 消息/来源可拖选复制、长句整句换行（#72b）；进度类通知画 3px 进度条（#72c）；
 *     重要通知（失败/警告/带按钮/长驻/进度）由壳请求自动展开（#72d）。
 *   - 壳侧 `setNotifPanelOpen` 只是「面板开合镜像」（原「隐藏 toast」语义随小卡删除失效），
 *     autoOpen 门禁消费它——面板已开就不再重复请求展开。
 *
 * 与壳行为差异（诚实注记）：
 *   E5.8#107 浮层权威：面板已收敛为壳同款 OverlayPortal（进 #overlay-root，外部点击/Escape
 *   由 OverlayPortal 统一处理）——原「fixed + document mousedown」手动实现删除。
 */

import { Fragment, useState, useRef, useEffect, useCallback } from "react";
import type { StatusBarLayout, PoolStatusBarItem } from "../../../core/types/pool/poolLayout";
import PoolStatusBarComponent from "../../shared/pool-status-bar/PoolStatusBarComponent";
import { executePoolCommand } from "../../commands/executePoolCommand";
import OverlayPortal from "../../../components/shared/overlay-portal/OverlayPortal";
import {
  notifPanelTransition,
  isPanelExpanded,
  type NotifPanelEvent,
  type NotifPanelTransition,
} from "./notifPanelState";
import "./StatusBarZone.css";

/** 池 → 壳通知事件——usePoolSync 订阅（壳侧 dismissToast/setNotifPanelOpen/action.onClick） */
function emitNotif(channel: string, payload?: unknown) {
  window.linkdesk?.events?.emit(channel, payload);
}

function StatusBarZone({ statusBar }: { statusBar: StatusBarLayout }) {
  // E6#73a：面板三态（idle/open/minimized）**唯一状态表示**——见 `notifPanelState.ts` 头注。
  // 初值 idle = 「七条迁移」第 7 行（池重建 / 重启 → 强制复位）——池重建 = 本组件重新挂载，
  // 复位是结构性成立的，不需要额外的 reset 事件。
  // ⚠️ `markSeen` 随状态一起存：它是**本次迁移**的属性（同一个 open，点铃铛来要认账、唤醒来不认账），
  // 不能由状态本身推出来；放进同一个 state 值 = 状态与它是原子的，不会错配。
  const [panel, setPanel] = useState<NotifPanelTransition>({ state: "idle", markSeen: false });
  const bellRef = useRef<HTMLButtonElement>(null);

  // **唯一迁移入口**——组件内任何地方不得绕过它改面板状态。
  // updater 保持纯函数（硬约束 6：不在 setState 函数式更新器里写副作用），发给壳的动作放下方 effect。
  const dispatch = useCallback((event: NotifPanelEvent) => {
    setPanel((prev) => notifPanelTransition(prev.state, event));
  }, []);

  // 迁移 → 壳（三态镜像 + 本次是否认账）。首帧跳过——避免 mount 即发 idle。
  // ⚠️ 已知边界：跳过首帧 ⇒ 池崩溃重建后壳侧镜像**不会**被本组件的重新挂载刷新（镜像卡住，
  // 卡在 minimized 时重要通知不再自动弹）。复位归第三批 E6#73l——见 `notifPanelState.ts` 头注。
  const firstRenderRef = useRef(true);
  useEffect(() => {
    if (firstRenderRef.current) { firstRenderRef.current = false; return; }
    emitNotif("notif:panel", { state: panel.state, markSeen: panel.markSeen });
  }, [panel]);

  // E6#72d：重要通知自动展开——壳在 notif.autoOpen 里请求，此处只认 **false→true 边沿**
  // （持续 true 不反复动作，用户手动关掉后也不会被同一条通知立刻弹回来）。
  // 边沿如何复位：autoOpen 的门禁之一是壳侧「面板已开」→ emit 上去后镜像变 true → 表达式回落
  // false → 边沿复位，下一条新的重要通知再触发。（E6#73a 起唤醒**不再**顺手认账，回落靠开合镜像，
  // 不再靠 unread 归零——见 `notifPanelState.ts` 的两条认账路径。）
  const prevAutoOpenRef = useRef(false); // 前值对比，不参与渲染（硬约束 17 允许用途）
  const wantAutoOpen = statusBar.notif.autoOpen === true;
  useEffect(() => {
    if (wantAutoOpen && !prevAutoOpenRef.current) dispatch({ type: "wake" });
    prevAutoOpenRef.current = wantAutoOpen;
  }, [wantAutoOpen, dispatch]);

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
    const inner = item.componentRenderPath ? (
      <PoolStatusBarComponent pluginId={item.pluginId} renderPath={item.componentRenderPath} />
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
        {/* E6#73a：铃铛是**进**面板的入口——已展开时点它**无迁移**（§五 A 七条表里没有
            `OPEN →(铃铛)→ …`）。出面板的唯一动作是头部「最小化」。原来这里是 `!panelOpen` 开关，
            那样等于又加了一条「点一下关掉」的路——正是 R3-1 抱怨的「所有按钮都在管关掉」。 */}
        <button
          ref={bellRef}
          className={`status-bar-btn status-bar-notif-btn${notif.unread > 0 ? " has-notifications" : ""}`}
          onClick={() => dispatch({ type: "bell" })}
          title={notif.bellTitle}
        >
          <span className="codicon codicon-bell" />
          {notif.unread > 0 && (
            <span className="status-bar-notif-badge">{notif.unread}</span>
          )}
        </button>

        {isPanelExpanded(panel.state) && (
          <OverlayPortal onClose={() => dispatch({ type: "minimize" })} triggerRef={bellRef}>
            <div className="status-bar-notif-panel">
            <div className="notif-panel-header">
              <span className="notif-panel-title">{notif.panelTitle}</span>
              <div className="notif-panel-toolbar">
                {/* 一个管**内容**（清消息，面板不关），一个管**面板**（收起，什么都不丢）。
                    「最小化」不加 codicon：用户前两轮反复说「没有最小化这个东西」，那就把字写出来，
                    别让人猜图标含义（蓝图 05 §三 注 1）。 */}
                {notif.groups.length > 0 && (
                  <button className="notif-panel-action" onClick={() => emitNotif("notif:clearAll")}>
                    {notif.clearLabel}
                  </button>
                )}
                <button className="notif-panel-action" onClick={() => dispatch({ type: "minimize" })}>
                  {notif.minimizeLabel}
                </button>
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
                        {/* E6#72c：进度行——DOM 位置在详情行之后、主行之前；配合 column-reverse
                            视觉落点 = 主行下方、详情行上方（原 71i 画在窄卡上，窄卡删后落点改这里）。
                            确定态（percent 有值）= 定宽填充；不定态 = 强调色块扫动。 */}
                        {item.progress === true && (
                          <div className="notif-progress">
                            {typeof item.percent === "number" ? (
                              <div
                                className="notif-progress-fill"
                                // 钳 0-100——DTO 契约宽容，畸形 percent（负/超 100/NaN 后段）不撑破布局
                                style={{ width: `${Math.max(0, Math.min(100, item.percent))}%` }}
                              />
                            ) : (
                              <div className="notif-progress-indeterminate" />
                            )}
                          </div>
                        )}
                        <div className="notif-main-row">
                          <span className={`codicon ${item.iconClass} notif-icon`} />
                          <span className="notif-panel-msg">{item.message}</span>
                          {item.timeLabel && (
                            <span className="notif-panel-time">{item.timeLabel}</span>
                          )}
                          {/* E6#73a：**进行中的行不渲染 ×**——任务不许被随手一点就消失（§五 C）。
                              它只能由创建它的句柄收掉（壳侧 `notif:dismiss` 已同判据兜底，两条路径都拦得住）。
                              ⚠️ 73d 加「等待安装中」分段后，排队行同样属于「尚无结果」，此处判据要一并放宽。 */}
                          {item.progress !== true && (
                            <button
                              className="notif-panel-dismiss"
                              onClick={() => emitNotif("notif:dismiss", item.id)}
                              title={notif.dismissTitle}
                            >
                              <span className="codicon codicon-close" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {/* E6#73f（S3/A6）：本组被「每来源 5 条」上限折叠掉的条数——**说明性脚注，不可点**
                        （折叠掉的条目已不在 toast 库里，点了无事可做；不加 codicon 以免长得像通知行）。
                        放组尾而非组头：组内按时间倒序，尾 = 最老那端，「较早的」在拓扑上诚实。 */}
                    {group.foldedLabel && (
                      <div className="notif-panel-folded">{group.foldedLabel}</div>
                    )}
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
