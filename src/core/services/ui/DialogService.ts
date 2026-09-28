/**
 * DialogService——统一对话框入口。
 * E2c #15：归一化 ConfirmDialog + 壳级弹窗，替代 window.confirm()。
 * M1 `AI#5`：加**在途弹窗读取面**（`getPendingDialogs`）——「有个 confirm/alert 正弹着、在等什么」
 *   可读，Promise 语义零改动（读取 ≠ 事件式改造）。
 *
 * 设计依据：docs/02-Electron架构/E2_底层加固与侧栏扩展_暂定/03-E2c-基础设施缺口.md §三
 * VS Code 对标：vscode.window.showWarningMessage / showInformationMessage
 */

import i18n from "../../../i18n"; // M1 AI#5：按钮文案 i18n 缺省（与 bridges.ts 同源——见 resolveDialogButtons）
import type { PoolPendingDialog } from "../../types/pool/poolDialog";

/* ── 类型 ── */

export interface DialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: "info" | "warning" | "error";
  /** E6#71c 富内容槽——插件自绘确认内容。视图引用（pluginId+viewId 声明寻址 →
   *  壳解析 renderPath 推池 DialogHost 挂载）+ 不透明 payload（壳不解释）。
   *  present 时确认框内容 = 插件视图（标题/正文/默认按钮由视图自画），弹窗机制不变。 */
  content?: {
    /** 内容归属插件（壳经 ViewContainerService.getView 复合寻址） */
    pluginId: string;
    /** 内容视图声明 id（contributes.views 注册） */
    viewId: string;
    /** 不透明载荷——结构克隆过 IPC，内容视图经 dialogHost.current() 读 */
    payload?: unknown;
  };
}

export interface QuickPickItem {
  label: string;
  description?: string;
  detail?: string;
}

export interface InputBoxOptions {
  prompt: string;
  value?: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined;
}

/* ── 渲染器注册（UI 组件挂载时注册） ── */

type ConfirmRenderer = (options: DialogOptions) => Promise<boolean>;
type AlertRenderer = (options: DialogOptions) => Promise<void>;
type QuickPickRenderer = (items: QuickPickItem[]) => Promise<string | undefined>;
type InputBoxRenderer = (options: InputBoxOptions) => Promise<string | undefined>;

let _confirmR: ConfirmRenderer | null = null;
let _alertR: AlertRenderer | null = null;
let _quickPickR: QuickPickRenderer | null = null;
let _inputBoxR: InputBoxRenderer | null = null;

/** UI 层注册渲染函数——DialogHost 组件挂载时调用。
 *  E5.8#10：壳级 UI 渲染器（应用生命周期，非插件作用域）——返 disposer 不 track。
 *  引用级守卫——dispose 不得抹掉后注册者的渲染器（QuickPick/InputBox 未传则不碰）。 */
export function registerDialogRenderers(
  confirm: ConfirmRenderer,
  alert: AlertRenderer,
  quickPick?: QuickPickRenderer,
  inputBox?: InputBoxRenderer,
): () => void {
  _confirmR = confirm;
  _alertR = alert;
  if (quickPick) _quickPickR = quickPick;
  if (inputBox) _inputBoxR = inputBox;
  return () => {
    if (_confirmR === confirm) _confirmR = null;
    if (_alertR === alert) _alertR = null;
    if (quickPick && _quickPickR === quickPick) _quickPickR = null;
    if (inputBox && _inputBoxR === inputBox) _inputBoxR = null;
  };
}

/* ── 公共 API ── */

/**
 * 按钮文案解析——**显示文本铁律的唯一落点**（显式传入优先，否则 i18n 缺省）。
 *
 * 🔴 M1 `AI#5` 抽出本函数的原因：读取面（`getPendingDialogs`）要说「在等哪几个按钮、文案是什么」，
 * 而推送面（`src/App/bridges.ts` 的 `pushOpen`）**也在解析同一组文案**。两处各写一遍
 * `options.confirmLabel ?? i18n.t("确定")` = 两把尺子，迟早一处改了另一处没改，读取面开始说假话。
 * ⇒ 收口到这一个函数，推送面同笔改用它。
 */
export function resolveDialogButtons(options: DialogOptions, isAlert = false): string[] {
  if (options.content) return []; // 富内容模式：按钮由插件视图自画（壳不知道有几条——不猜）
  const confirmLabel = options.confirmLabel ?? i18n.t("确定");
  // alert 只有一个按钮（DialogHost 不渲染取消）——读取面与画面对齐，不虚报第二条
  return isAlert ? [confirmLabel] : [confirmLabel, options.cancelLabel ?? i18n.t("取消")];
}

/* ── M1 `AI#5`：在途弹窗登记（读取面） ── */

/**
 * 🔴 **单槽是现状的诚实描述，不是设计目标**：壳→池弹窗链路（`src/App/bridges.ts` 的 `pending` 单槽）
 * 同一时刻只承载一条，第二次 `confirm` 会覆盖前一条的 settle 闭包（那条 Promise **永不结算**——
 * 既有缺陷，登记在案）。本格只做「读得到」，**不改 Promise 语义**（改成事件式会破坏所有既有调用方）
 * ⇒ 这里如实登记「最后打开的那一条」，不假装有队列。
 */
let _pending: PoolPendingDialog | null = null;

function toPending(kind: "confirm" | "alert", options: DialogOptions): PoolPendingDialog {
  return {
    kind,
    title: options.title,
    message: options.message,
    buttons: resolveDialogButtons(options, kind === "alert"),
    ...(options.content
      ? { content: { pluginId: options.content.pluginId, viewId: options.content.viewId } }
      : {}),
  };
}

/**
 * M1 `AI#5`：在途弹窗清单——**至多一条**（见 `_pending` 的 🔴）。
 * 空数组 = 此刻没有弹窗（`confirm`/`alert` 的 Promise 一旦结算，登记即撤）。
 */
export function getPendingDialogs(): PoolPendingDialog[] {
  return _pending ? [_pending] : [];
}

/**
 * 渲染器未注册的兜底（`confirm` / `confirmContent` 共腿）——同步 window.confirm 包成 Promise。
 * ⚠️ 兜底路径**不登记**在途（见 `_pending`：登记了就是永久谎言——那条 Promise 早就结算完了）。
 */
function fallbackConfirm(options: DialogOptions): Promise<boolean> {
  console.warn("[DialogService] Confirm 渲染器未注册——fallback 到 window.confirm()");
  return Promise.resolve(window.confirm(`${options.title}\n${options.message}`));
}

/**
 * 在途登记 ＋ 交渲染器（finally 撤登记——渲染器无论正常结算还是抛错都不留悬空登记）。
 * `_confirmR` 已由调用方确认存在（本函数是收口，不是入口）。
 */
async function awaitConfirm(options: DialogOptions): Promise<boolean> {
  _pending = toPending("confirm", options);
  try {
    return await _confirmR!(options);
  } finally {
    _pending = null;
  }
}

/**
 * 确认对话框——替代 window.confirm()。
 * 返回 true = 用户点确认，false = 取消/关闭。
 */
export async function confirm(options: DialogOptions): Promise<boolean> {
  // E5.7#17：渲染器由 App.tsx 桥注册——pushDialog → 池 DialogHost 哑渲染。
  // E5.7#44：E5#84g 的 _hideAllPluginViews（弹窗前隐藏 per-tab 插件 WebView）已删——
  // 插件 WebView 消亡 + 弹窗本身渲染在池内，隐藏逻辑失去对象。
  if (!_confirmR) return fallbackConfirm(options);
  return awaitConfirm(options);
}

/**
 * E6#71c 富内容确认——插件自绘确认内容（content 视图），机制同 confirm()（居中/遮罩/Esc/trap/结算）。
 * 返回 true = 用户点确认，false = 取消/关闭。渲染器未注册兜底 window.confirm（同 confirm() 同款）。
 */
export async function confirmContent(options: DialogOptions): Promise<boolean> {
  if (!options.content) return confirm(options); // 无 content ⇒ 退化为普通 confirm（登记由 confirm 自己管）
  if (!_confirmR) return fallbackConfirm(options);
  return awaitConfirm(options);
}

/**
 * 提示对话框——纯通知，只有一个"确定"按钮。
 */
export async function alert(options: DialogOptions): Promise<void> {
  if (!_alertR) {
    console.warn("[DialogService] Alert 渲染器未注册——fallback 到 window.alert()");
    window.alert(`${options.title}\n${options.message}`);
    return;
  }
  // ⚠️ kind 靠**显式传参**判（不能读 options.type——那是 info/warning/error 的视觉严重度，
  //    与「确认框还是提示框」不是一回事）。toPending 按 kind 收窄按钮数。
  _pending = toPending("alert", options);
  try {
    return await _alertR(options);
  } finally {
    _pending = null;
  }
}

/**
 * QuickPick 选择框——对标 VS Code window.showQuickPick()。
 */
export async function showQuickPick(items: QuickPickItem[]): Promise<string | undefined> {
  if (!_quickPickR) return undefined;
  return _quickPickR(items);
}

/**
 * 输入框——对标 VS Code window.showInputBox()。
 */
export async function showInputBox(options: InputBoxOptions): Promise<string | undefined> {
  if (!_inputBoxR) return undefined;
  return _inputBoxR(options);
}

/**
 * 🔥 兼容旧 API——E2c #15 迁移期间使用。
 * 返回 boolean（旧代码期望），底层走 confirm()。
 */
export async function showConfirm(message: string): Promise<boolean> {
  return confirm({ title: "", message });
}
