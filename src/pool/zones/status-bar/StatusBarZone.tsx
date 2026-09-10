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
 *   E5.8#107 浮层权威：面板已收敛为壳同款 OverlayPortal（进 #overlay-root）——原
 *   「fixed + document mousedown」手动实现删除。
 *   E6#73b：关法只剩两个——面板内「最小化」与 Esc（`closeOnOutsideClick={false}`，
 *   点别处不关，R5-3）；Esc 还受「只关最上层浮层」约束（`overlayLayer.ts`）。
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
import { scanNotifLive, NOTIF_LIVE_THROTTLE_MS, type NotifLiveSeen } from "./notifLiveRegion";
import "./StatusBarZone.css";

/** 池 → 壳通知事件——usePoolSync 订阅（壳侧 dismissToast/setNotifPanelOpen/action.onClick） */
function emitNotif(channel: string, payload?: unknown) {
  window.linkdesk?.events?.emit(channel, payload);
}

/** 面板 id——铃铛 `aria-controls` 指过来的目标（E6#73k J1）。**不是可翻译文案**，故用常量不占 i18n key */
const NOTIF_PANEL_ID = "status-bar-notif-panel";

/** DTO 契约宽容：畸形 percent（负 / 超 100 / 非有限）不撑破布局，也不喂给读屏器 */
function clampPercent(percent: number): number {
  return Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0;
}

function StatusBarZone({ statusBar }: { statusBar: StatusBarLayout }) {
  // E6#73a：面板三态（idle/open/minimized）**唯一状态表示**——见 `notifPanelState.ts` 头注。
  // 初值 idle = 「八条迁移」第 7 行（池重建 / 重启 → 强制复位）——池重建 = 本组件重新挂载，
  // 复位是结构性成立的，不需要额外的 reset 事件。
  // ⚠️ `markSeen` 随状态一起存：它是**本次迁移**的属性（同一个 open，点铃铛来要认账、唤醒来不认账），
  // 不能由状态本身推出来；放进同一个 state 值 = 状态与它是原子的，不会错配。
  const [panel, setPanel] = useState<NotifPanelTransition>({ state: "idle", markSeen: false });
  const bellRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { notif } = statusBar;

  // E6#73k（J5）：面板是否**由用户亲手打开**——铃铛点击（`markSeen:true`）为真，唤醒（`wake`）为假。
  //
  // 这一个表达式同时决定两件事，两件都要求「唤醒开的不算」：
  //   ① 焦点进面板——唤醒是**程序化**打开，用户此刻可能正在文本框里打字，
  //      抢焦点即打断输入（设计 skill `toast-accessibility`：toasts must not steal focus）；
  //   ② 关闭时归还焦点——只有「进去过」才谈得上「还回来」，否则关面板会凭空把焦点拽到铃铛上。
  //
  // ⚠️ 不新开一个 `openedByUser` state：`markSeen` 本就是「本次迁移是否由用户在看」的既有载体
  //   （`notifPanelState.ts` 第 1/3 行 ✅ vs 第 2/4 行 ❌），再存一份就多了一个会与它脱节的真值源。
  const expanded = isPanelExpanded(panel.state);
  const openedByUser = expanded && panel.markSeen;

  // E6#73k（J5）：焦点进面板 / 关闭归还铃铛。
  //
  // **焦点落在面板容器上，不落在第一个按钮上**（容器 `tabIndex={-1}`）：面板里第一个可聚焦元素是
  // 「清除已完成」——把焦点停在它上面，用户一进来随手一个 Enter 就把通知清了。
  // 落在容器上则 Enter 无副作用，读屏器还会先把 `role="dialog"` 的名字念出来。
  //
  // **不做 Tab 焦点陷阱**：本面板是非模态的（点外面不关、无遮罩、`closeOnOutsideClick={false}`），
  // 非模态浮层圈住 Tab 会把用户关在里面。Esc 与「最小化」两个出口照旧（§五 A 第 5/6 行）。
  //
  // 归还的守卫 `activeElement` 判空：清理函数跑在**面板已卸载之后**，若用户早已用鼠标点去了别处，
  // 此刻焦点就是 `body`——只在「焦点真的没了」时才还，绝不把用户从别处拽回来。
  // （这个守卫还挡掉了 StrictMode 的开发期双跑：那是容器自己拿着焦点，不走归还分支。）
  useEffect(() => {
    if (!openedByUser) return;
    panelRef.current?.focus();
    // 铃铛节点在 effect 跑的那一刻就已挂载且此后不再重挂（它不随面板开合卸载），
    // 故在这里取出节点交给清理用——不在清理里现读 `bellRef.current`（那是 lint 明确拦的写法，
    // 且清理跑在面板卸载之后，届时再读谁都不知道 ref 指向哪一版）
    const bell = bellRef.current;
    return () => {
      const active = document.activeElement;
      if (active && active !== document.body) return;
      bell?.focus();
    };
  }, [openedByUser]);

  // E6#73k（J2）：动作播报活区的内容——**常挂载**（见下方 JSX：活区在状态栏里，不在面板里）。
  // 面板关着时面板内的任何东西都不在 DOM 上，活区若挂在面板里，就变成「开了面板才听得见通知」——
  // 恰恰把最需要播报的场景（面板没开、后台装完了）排除在外。
  const [announcement, setAnnouncement] = useState("");
  const liveSeenRef = useRef<NotifLiveSeen | null>(null); // 台账；null = 首次扫描只建基线
  const liveLastRef = useRef(0); // 上次真播的时刻（前值对比，不参与渲染——硬约束 17 允许用途）
  const livePendingRef = useRef(""); // 节流窗口内被压住的最新一句（拖尾播出，见下）
  const liveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const scan = scanNotifLive(liveSeenRef.current, notif);
    liveSeenRef.current = scan.seen;
    if (!scan.announce) return;

    // 节流策略：窗口内**不丢终态，只丢中间帧**——把最新一句存起来，窗口一到就播。
    // 因此「装完了」这类终态不会因为恰好撞上进度跳动而被吃掉。
    const now = Date.now();
    const elapsed = now - liveLastRef.current;
    if (elapsed >= NOTIF_LIVE_THROTTLE_MS) {
      liveLastRef.current = now;
      setAnnouncement(scan.announce);
      return;
    }
    livePendingRef.current = scan.announce;
    if (liveTimerRef.current !== null) return;
    liveTimerRef.current = window.setTimeout(() => {
      liveTimerRef.current = null;
      liveLastRef.current = Date.now();
      setAnnouncement(livePendingRef.current);
    }, NOTIF_LIVE_THROTTLE_MS - elapsed);
  }, [notif]);

  // 卸载清定时器——池崩溃重建/应用关闭时不许留一个会对已卸载组件 setState 的回调
  useEffect(
    () => () => {
      if (liveTimerRef.current !== null) window.clearTimeout(liveTimerRef.current);
    },
    [],
  );

  // **唯一迁移入口**——组件内任何地方不得绕过它改面板状态。
  // updater 保持纯函数（硬约束 6：不在 setState 函数式更新器里写副作用），发给壳的动作放下方 effect。
  const dispatch = useCallback((event: NotifPanelEvent) => {
    setPanel((prev) => notifPanelTransition(prev.state, event));
  }, []);

  // 迁移 → 壳（三态镜像 + 本次是否认账）——**含 mount 那一帧**（E6#73l 崩溃复位）。
  //
  // 为什么 mount 也要发：本组件重新挂载 = **池渲染进程是新的**（crash-recovery 分支 1）⇒ `panel`
  // 初值回到 idle，可壳侧那份镜像还停在上一个池留下的值上。它若停在 `open`，壳侧 `autoOpen` 的
  // 门禁（「面板已开就不再请求展开」）就**恒为假** ⇒ 此后任何重要通知都不再自动弹，而界面上
  // 完全看不出哪里坏了。这一发就是把镜像拉回 idle。
  //
  // 🔴 **这不是一条迁移**（`notifPanelState.ts` 第 7 行「池重建 → 复位」仍然无事件）：
  // 池侧状态本就是 `useState` 初值、复位结构性成立；本行只是把**池侧的当前真值**播给壳侧镜像
  // ——是「同步」不是「迁移」，故不进迁移表，也不产生认账。首启时壳侧镜像初值已是 idle，幂等空操作。
  useEffect(() => {
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
        {/* E6#73a / E6#75：铃铛是**收/开双通开关**——收起时点它开、已展开时点它收起（§五 A 第 8 行
            `OPEN →(铃铛)→ MINIMIZED`，与头部「最小化」逐字同义：收起、什么都不丢）。
            ⚠️ 73a 一度把它改成「只进不出」（理由是「又一条『关掉』的路 = R3-1 抱怨的所有按钮都在管关掉」），
            **2026-09-11 用户亲口推翻**——R3-1 抱怨的是清除/× 把通知**毁掉**，收起不毁任何东西。
            这里本就是 `dispatch({type:"bell"})` 一条线，双通全靠状态机那张表，本组件不参与判态。 */}
        {/* E6#73k（J1）：铃铛此前只有 `title`——读屏器拿到的是一个装饰性字形加一个裸数字
            （「3」），既不知道这是个按钮、也不知道按下去会开什么。四件补齐，与 `PanelZone`
            的现成写法同款：可读名 / 有弹出层 / 展开态 / 指向谁。
            `aria-label` 直接取 `bellTitle`（未读时壳已算成「3 条通知」）——**不新增契约字段**：
            同一句话当 tooltip 是它、当可读名也是它，两处各写一份才会漂移。 */}
        <button
          ref={bellRef}
          className={`status-bar-btn status-bar-notif-btn${notif.unread > 0 ? " has-notifications" : ""}`}
          onClick={() => dispatch({ type: "bell" })}
          title={notif.bellTitle}
          aria-label={notif.bellTitle}
          aria-haspopup="dialog"
          aria-expanded={expanded}
          aria-controls={expanded ? NOTIF_PANEL_ID : undefined}
        >
          <span className="codicon codicon-bell" />
          {notif.unread > 0 && (
            <span className="status-bar-notif-badge">{notif.unread}</span>
          )}
        </button>

        {/* E6#73b ①：点面板外面**不关**（18 档 §五 A / R5-3 用户原话）——`closeOnOutsideClick={false}`
            只摘掉外部点击这一条；Esc 照旧（发 `minimize`，语义 = 最小化不是关闭，§五 A 第 6 行）。 */}
        {isPanelExpanded(panel.state) && (
          <OverlayPortal
            onClose={() => dispatch({ type: "minimize" })}
            closeOnOutsideClick={false}
            triggerRef={bellRef}
          >
            {/* E6#73k（J1/J5）：面板此前是个裸 `div`——读屏器读不出「这是一个浮层、叫什么名字」。
                `role="dialog"` + `aria-label`（取面板标题）补上语义；`tabIndex={-1}` 让 J5 能把
                焦点**落在容器上**（而不是落在「清除已完成」按钮上）。**不带 `aria-modal`**：
                本面板非模态——不遮罩、点外面不关、Tab 不被圈住，标成 modal 是撒谎。 */}
            <div
              id={NOTIF_PANEL_ID}
              ref={panelRef}
              className="status-bar-notif-panel"
              role="dialog"
              aria-label={notif.panelTitle}
              tabIndex={-1}
            >
            <div className="notif-panel-header">
              <div className="notif-panel-heading">
                <span className="notif-panel-title">{notif.panelTitle}</span>
                {/* E6#73d：安装摘要（「3 项进行中 · 另有 4 项等待安装中」）——没有在途安装时壳不带此字段 */}
                {notif.summaryLabel && (
                  <span className="notif-panel-summary">{notif.summaryLabel}</span>
                )}
              </div>
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
            {notif.groups.length === 0 && (notif.sections?.length ?? 0) === 0 && !notif.resultLabel ? (
              <div className="notif-panel-empty">{notif.emptyLabel}</div>
            ) : (
              <div className="notif-panel-list">
                {/* E6#73d：在途安装两段（进行中 → 等待安装中），固定序排在结果区之前（18 档 §五 I.4）。
                    段内按入队先后 —— 壳侧 job 表原序透传，池**不排序**：排队位次跳变会让用户
                    刚瞄到的行"跑"到别处，比不排序更糟。 */}
                {(notif.sections ?? []).map((section) => (
                  <div key={section.key}>
                    <div className="notif-task-section-header">
                      <span className="notif-task-section-label">{section.label}</span>
                      {/* 贯穿到右端的细线——任务段靠**结构**分隔，不靠加大字号/加重字色
                          （来源分组标题是纯标签、无分隔线，两者一眼可分，且不引出新字号档）。 */}
                      <span className="notif-task-section-rule" />
                    </div>
                    {section.items.map((row) => (
                      <div key={row.id} className="notif-panel-item">
                        {/* E6#73d（C4）：DOM 序 = 视觉序（主行 → 进度 → 详情动作）。此前靠
                            `column-reverse` 翻转视觉，拖选复制出来的文本与屏幕从上到下相反。 */}
                        <div className="notif-main-row">
                          <span className={`codicon ${row.iconClass} notif-icon`} />
                          <span className="notif-panel-msg">{row.name}</span>
                          <span className="notif-job-status">{row.statusLabel}</span>
                        </div>
                        {/* 进度条只在有真值时画——排队行没有在途工作，画条是撒谎（壳已保证不带 percent）。
                            E6#73k（J3）：补 `role="progressbar"` ——此前是个裸 div，读屏器完全读不到
                            「这里有一条正在走的进度」。可读名取插件名（哪件事在跑），值文案取壳算好的
                            状态短语（「下载中 62%」，含阶段 + 百分数，比单念一个数字有用）。 */}
                        {typeof row.percent === "number" && (
                          <div
                            className="notif-progress"
                            role="progressbar"
                            aria-label={row.name}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={clampPercent(row.percent)}
                            aria-valuetext={row.statusLabel}
                          >
                            <div
                              className="notif-progress-fill"
                              style={{ width: `${clampPercent(row.percent)}%` }}
                            />
                          </div>
                        )}
                        {row.cancellable && row.cancelLabel && (
                          <div className="notif-details-row">
                            <div className="notif-actions-row">
                              {/* E6#73d：任务行**唯一**的显式动作。用 secondary 而非 primary——
                                  失败行的 [重试] 才是要用户立刻做的那个，取消不能抢它的视线。
                                  ⚠️ 常显不挂 hover：藏起来的取消 = 找不到的取消（挂死的安装要让用户救得回来）。 */}
                              <button
                                className="notif-action-btn secondary"
                                onClick={() => emitNotif("notif:cancelJob", { jobId: row.id })}
                              >
                                {row.cancelLabel}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                    {section.foldedLabel && (
                      <div className="notif-panel-folded">{section.foldedLabel}</div>
                    )}
                  </div>
                ))}
                {/* E6#73d：第三段固定标题「已有结果」——三段（进行中 → 等待安装中 → 已有结果）永不重排
                    （18 档 §五 I.4）。结果**行**就是下面按来源分组的那批（同一批 toast），故此处只出头，
                    不再多一层容器：`groups` 之上多包一个 div 会把来源分组的间距语义整个挪位。
                    右端计数由壳算（数 job 终态，不数面板行——见 NotifLayout.resultSummary 注释）。 */}
                {notif.resultLabel && (
                  <div className="notif-task-section-header">
                    <span className="notif-task-section-label">{notif.resultLabel}</span>
                    <span className="notif-task-section-rule" />
                    {notif.resultSummary && (
                      <span className="notif-task-section-count">{notif.resultSummary}</span>
                    )}
                  </div>
                )}
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
                        {/* E6#73d（C4）：DOM 序 = 视觉序（主行 → 进度 → 详情动作）。
                            ⚠️ **这是对 VS Code 的一次有意偏离**（notificationsViewer.ts renderTemplate
                            是 details-first + `flex-direction: column-reverse` 把视觉翻回来，2026-09-05 曾照抄）。
                            偏离理由（2026-09-10 拍板：主动偏离必须写明理由）：column-reverse 让**拖选复制**
                            出来的文本顺序与屏幕从上到下相反，用户复制一条安装失败通知会得到按钮文字在前的乱序串；
                            照抄 VS Code ≠ 逐字节复刻 DOM，视觉结果一致（消息在上、按钮在下）而复制行为正确才是目的。 */}
                        <div className="notif-main-row">
                          <span className={`codicon ${item.iconClass} notif-icon`} />
                          <span className="notif-panel-msg">{item.message}</span>
                          {item.timeLabel && (
                            <span className="notif-panel-time">{item.timeLabel}</span>
                          )}
                          {/* E6#73a：**进行中的行不渲染 ×**——任务不许被随手一点就消失（§五 C）。
                              它只能由创建它的句柄收掉（壳侧 `notif:dismiss` 已同判据兜底，两条路径都拦得住）。
                              ⚠️ E6#73d 已把「尚无结果」的入口整个挪走：进行中/等待安装中的行现在由
                              上方 job 段渲染（那里根本没有 ×，只有显式 [取消安装]）——本判据此后只需
                              覆盖 toast 侧的进度类通知（插件自己发的 `progress:true`）。 */}
                          {item.progress !== true && (
                            <button
                              className="notif-panel-dismiss"
                              onClick={() => emitNotif("notif:dismiss", item.id)}
                              title={notif.dismissTitle}
                              // E6#73k（J1）：按钮里只有一枚 codicon 字形（私有区码位，读屏器念不出名），
                              // 无 `aria-label` 时它就是个没名字的「按钮」——用户不知道按下去会删什么。
                              aria-label={notif.dismissTitle}
                            >
                              <span className="codicon codicon-close" />
                            </button>
                          )}
                        </div>
                        {/* E6#72c：进度行——视觉落点 = 主行**下方**（原 71i 画在窄卡上，窄卡删后落点改这里）。
                            确定态（percent 有值）= 定宽填充；不定态 = 强调色块扫动。 */}
                        {item.progress === true && (
                          <div
                            className="notif-progress"
                            role="progressbar"
                            aria-label={item.message}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            // E6#73k（J3）：`percent` 有值才给 `aria-valuenow`——**不给即是「不定态」**，
                            // 这是 ARIA 判定的不确定进度表达（读屏器念「忙碌」而非编一个百分比出来）。
                            // 插件自己发的 progress 通知多半不带 percent，此前读屏器连条都听不见。
                            {...(typeof item.percent === "number"
                              ? { "aria-valuenow": clampPercent(item.percent) }
                              : {})}
                          >
                            {typeof item.percent === "number" ? (
                              <div
                                className="notif-progress-fill"
                                // 钳 0-100——DTO 契约宽容，畸形 percent（负/超 100/NaN 后段）不撑破布局
                                style={{ width: `${clampPercent(item.percent)}%` }}
                              />
                            ) : (
                              <div className="notif-progress-indeterminate" />
                            )}
                          </div>
                        )}
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

      {/* E6#73k（J2）：动作播报活区——**常驻**，不是面板的一部分。
          放在面板里就成了「开了面板才听得见通知」，恰好把最该播的场景（面板没开、后台装完了）排除掉。
          `role="status"` + `aria-live="polite"`：排队等当前朗读结束，不打断用户（对比 `assertive` 会抢话）。
          内容由 `scanNotifLive` 判变化 + 节流按 2s 上（见 `notifLiveRegion.ts`）。
          ⚠️ 视觉上不可见（`.notif-sr-live`）——它是耳朵的通道，不是眼睛的。 */}
      <div className="notif-sr-live" role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
    </div>
  );
}

export default StatusBarZone;
