/**
 * FloatingPanelService——E5.8#37（Phase 8 壳内悬浮面板 类型 B）。
 *
 * 聪慧→哑桥（DialogService 同款——归一化不重造）：壳 pushPanel 序列化 DTO → 池
 * FloatingPanelHost 哑渲染（显示文本铁律——标题/动作文案壳侧 t() 解析后推送，池原样渲染）。
 * 内容 = 插件视图——DTO 带 pluginId/renderPath，池经 PluginComponent 按 viewId 寻址视图注册表
 * 渲染（壳不持渲染器——#37 验收）。Promise settle 闭包留壳——池只回传动作类型，壳侧重解析。
 *
 * 单实例语义（I8-10）：同 viewId 聚焦（已开 = no-op）、异 viewId 替换（旧 pending settle 'replaced'）。
 * 面板身份开关键（I8-2 toggle——无面板→开/同视图→关/他面板→替换）由消费者实现：
 * #38 先查 getCurrentFloatingPanelViewId() === 自己的 viewId → 相等 closePanel()，否则 pushPanel()。
 *
 * 语言切换文案重推（2026-08-22 用户点修③）：pushPanel 存最近 open DTO 底稿，消费者订阅 i18n
 * languageChanged 调 refreshPanelText(title, actions) 重推——DTO 带 refresh 标记，池跳过焦点获取。
 *
 * 状态：renderer/当前 viewId/pending/currentOpen 都是壳侧注册态（组件/消费者生命周期内）——本服务零 IPC，
 * 订阅走 App/bridges.ts（硬约束 19）；同 DialogService 模块级注册模式。
 */

import type {
  FloatingPanelBounds,
  PoolFloatingPanelData,
  PoolFloatingPanelButton,
  PoolFloatingPanelGeometry,
} from "../../types/pool/poolFloatingPanel";

/* ── 类型 ── */

/** 面板请求——消费者（#38 Settings 命令）构造，标题/动作文案已 t() 解析 */
export interface FloatingPanelOptions {
  /** 面板身份——单实例语义按 (viewId, pluginId) 复合键裁决（I8-10，E5.8#41.16：两插件同名 viewId 并存不互踩） */
  viewId: string;
  /** 标题——壳侧 t() 已解析 */
  title: string;
  /** 内容插件——壳不持渲染器，池经 PluginComponent(pluginId, renderPath) 渲染 */
  pluginId: string;
  /** 内容视图 renderPath——池视图注册表寻址 */
  renderPath: string;
  /** 标题栏动作按钮（open-in/maximize/close——壳 t() 解析） */
  actions: PoolFloatingPanelButton[];
}

/** 面板关闭原因（pushPanel promise settle 语义——DialogService 同款） */
export type FloatingPanelCloseReason =
  | "open-in"       // 「在主窗口中打开」——消费者应把该视图开成标签页（#38 接线）
  | "close"         // 关闭按钮 / Esc / 遮罩点击
  | "replaced"      // 被他面板替换（异 viewId 再 push）
  | "programmatic"; // closePanel() 程序化关闭

/* ── 渲染器注册（App/bridges.ts 挂载时注册） ── */

type FloatingPanelRenderer = (data: PoolFloatingPanelData) => void;

let _renderer: FloatingPanelRenderer | null = null;

/** UI 层注册渲染器——bridges.ts 桥在 App 挂载时调用。引用级守卫——dispose 不得抹掉后注册者。 */
export function registerFloatingPanelRenderer(renderer: FloatingPanelRenderer): () => void {
  _renderer = renderer;
  return () => {
    if (_renderer === renderer) _renderer = null;
  };
}

/* ── 单实例状态（I8-10） ── */

let _currentViewId: string | null = null;
/** E5.8#41.16：当前面板内容插件——复合键身份（_currentViewId 同名视图并存时区分谁在面板里，I8-2 toggle 判据） */
let _currentPluginId: string | null = null;

/** 最近一次 open DTO 底稿——refreshPanelText（语言切换文案刷新）重推用，关闭即清 */
let _currentOpen: Extract<PoolFloatingPanelData, { open: true }> | null = null;

interface Pending {
  promise: Promise<FloatingPanelCloseReason>;
  settle: (reason: FloatingPanelCloseReason) => void;
}

let _pending: Pending | null = null;

/** 当前面板 viewId——身份开关键（I8-2）查询用：null = 无面板 */
export function getCurrentFloatingPanelViewId(): string | null {
  return _currentViewId;
}

/** E5.8#41.16：当前面板内容插件 id——复合键身份查询（decideFloatingPanelReveal 判同面板用）：null = 无面板 */
export function getCurrentFloatingPanelPluginId(): string | null {
  return _currentPluginId;
}

/**
 * 打开/聚焦悬浮面板——返回面板关闭原因（settle 语义，DialogService 同款）。
 * 单实例（I8-10）：同 (viewId, pluginId) 聚焦（已开 = no-op，复用现有 promise）、异复合键替换（旧 promise settle 'replaced'）。
 * E5.8#41.16：复合键——两插件同名 viewId（双设置套都 viewId="settings"）并存时，builtin 面板 + push demo
 * 是「异插件 → 替换内容」，不是「同视图聚焦」（裸 viewId 裁决会把 demo 面板误判为已开 → 不渲染）。
 */
export function pushPanel(options: FloatingPanelOptions): Promise<FloatingPanelCloseReason> {
  if (_currentViewId === options.viewId && _currentPluginId === options.pluginId && _pending) {
    // I8-10 同复合键聚焦——已开同一面板，复用现有 promise（消费者 await 仍会在关闭时收到原因）
    return _pending.promise;
  }
  // 异复合键替换——settle 旧 promise（避免旧消费者永远挂起）
  if (_pending) {
    const p = _pending;
    _pending = null;
    p.settle("replaced");
  }
  _currentViewId = options.viewId;
  _currentPluginId = options.pluginId;
  _lastGeometry = null; // M2 AI#20：新面板的几何未知——作废旧镜像，等池渲染后上报（防读到上一个面板的几何）
  let settle!: (reason: FloatingPanelCloseReason) => void;
  const promise = new Promise<FloatingPanelCloseReason>((resolve) => { settle = resolve; });
  _pending = { promise, settle };
  const data: Extract<PoolFloatingPanelData, { open: true }> = {
    open: true,
    viewId: options.viewId,
    title: options.title,
    pluginId: options.pluginId,
    renderPath: options.renderPath,
    actions: options.actions,
  };
  _currentOpen = data; // refreshPanelText 重推底稿
  _renderer?.(data);
  return promise;
}

/**
 * 语言切换文案重推——面板已开，仅标题/动作文案变化（i18n.languageChanged → 消费者重解析后调用）。
 * 重推 DTO 带 refresh 标记 → 池跳过焦点获取（I8-8 首次打开才入焦点）；身份/几何不变，不 settle promise。
 */
export function refreshPanelText(title: string, actions: PoolFloatingPanelButton[]): void {
  if (!_currentOpen) return; // 面板未开 → no-op（语言切换时面板不一定开着）
  _renderer?.({ ..._currentOpen, title, actions, refresh: true });
}

/**
 * M2 `AI#20`：设定悬浮面板几何（**非鼠标路径**——位置/高度可精确设定，AI 不必拖）。
 * 面板未开 → no-op（⛔ 不凭几何无中生有开面板；开面板归 pushPanel / revealFloating）。
 *
 * 🔴 **只推不存**：`bounds` 是一次性指令，⛔ 不写进 `_currentOpen` 底稿——否则随后的
 * `refreshPanelText`（语言切换重推）会带上这条**旧**几何，把用户后来拖过的面板弹回去。
 * 几何真相源在池（只有它知道面板此刻真在哪），壳这一侧不留第二把尺（见 `reportGeometry`）。
 */
export function setBounds(bounds: Partial<FloatingPanelBounds> | null): void {
  if (!_currentOpen) return;
  // refresh:true —— 面板已开，这是一次「重推不重开」：池跳过焦点获取（与语言切换重推同一条通道语义）
  _renderer?.({ ..._currentOpen, bounds, refresh: true });
}

/* ── M2 `AI#20`：几何镜像（可读面）── */

/** 池上报的**最近一次落定**几何——面板渲染/钳制全在池，本值只是给壳命令/CLI 看的只读镜像。 */
let _lastGeometry: PoolFloatingPanelGeometry | null = null;

/** 池几何上报落点（bridges.ts 接 `floating-panel:geometry` 后调）——覆盖式快照，无累积。 */
export function reportGeometry(geometry: PoolFloatingPanelGeometry): void {
  _lastGeometry = geometry;
}

/** 读最近一次几何（壳命令 `workbench.action.getFloatingPanelBounds` 用）。null = 无面板 / 尚未上报。
 *  ⚠️ 拖拽进行中的镜像会滞后到上一次落定值（池按「落定才上报」节流——每 pointermove 一发会打成洪水）。 */
export function getLastGeometry(): PoolFloatingPanelGeometry | null {
  return _lastGeometry;
}

/** 关闭悬浮面板（程序化）——先推 {open:false} 再 settle（dialog 桥纪律：stale close 不覆盖新开） */
export function closePanel(): void {
  _currentViewId = null;
  _currentPluginId = null;
  _currentOpen = null;
  _lastGeometry = null; // M2 AI#20：几何镜像随面板关闭清空（无面板 = 无几何；池关闭时不上报）
  _renderer?.({ open: false });
  const p = _pending;
  _pending = null;
  p?.settle("programmatic");
}

/**
 * 池动作回传——bridges.ts 接 onFloatingPanelAction 后调本函数（先推 {open:false} 再 settle）。
 * actionId：'open-in'（在主窗口中打开）/'close'（关闭按钮/Esc/遮罩）。
 */
export function handleFloatingPanelAction(actionId: string): void {
  _currentViewId = null;
  _currentPluginId = null;
  _currentOpen = null;
  _lastGeometry = null; // M2 AI#20：同 closePanel——面板已关，镜像不留旧值
  _renderer?.({ open: false });
  const p = _pending;
  _pending = null;
  p?.settle(actionId === "open-in" ? "open-in" : "close");
}
