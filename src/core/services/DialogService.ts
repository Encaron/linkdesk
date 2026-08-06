/**
 * DialogService——统一对话框入口。
 * E2c #15：归一化 ConfirmDialog + 壳级弹窗，替代 window.confirm()。
 *
 * 设计依据：docs/02-Electron架构/E2_底层加固与侧栏扩展_暂定/03-E2c-基础设施缺口.md §三
 * VS Code 对标：vscode.window.showWarningMessage / showInformationMessage
 */

import { shellEvents } from "../react/ShellEvents";

/* ── 类型 ── */

export interface DialogOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: "info" | "warning" | "error";
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

/** UI 层注册渲染函数——DialogHost 组件挂载时调用 */
export function registerDialogRenderers(
  confirm: ConfirmRenderer,
  alert: AlertRenderer,
  quickPick?: QuickPickRenderer,
  inputBox?: InputBoxRenderer,
): void {
  _confirmR = confirm;
  _alertR = alert;
  if (quickPick) _quickPickR = quickPick;
  if (inputBox) _inputBoxR = inputBox;
}

/** UI 层注销渲染函数 */
export function unregisterDialogRenderers(): void {
  _confirmR = null;
  _alertR = null;
  _quickPickR = null;
  _inputBoxR = null;
}

/* ── E5#84g：插件 WebView 是原生视图（WebContentsView），z-order 高于所有 HTML 元素。
 *   弹窗前：移到屏幕外 + setVisible(false)——双重保险确保弹窗不被遮挡。
 *   弹窗后：emit dialog:visibility → MainContent 重算 bounds 恢复正确位置和可见性。── */

/** 屏幕外坐标——把 WebView 移到用户不可见的位置（比 0×0 更可靠） */
const OFF_SCREEN = { x: -10000, y: -10000, width: 1, height: 1 };

async function _hideAllPluginViews(): Promise<void> {
  const pv = (window as any).linkdesk?.pluginViews;
  if (!pv) return;
  try {
    const ids: string[] = await pv.getAllIds();
    if (ids.length === 0) return;
    await Promise.all(ids.map((id) => Promise.all([
      pv.setVisible(id, false).catch(() => {}), // 非关键操作——多 WebView 已回退，失败不阻塞
      pv.setBounds(id, OFF_SCREEN).catch(() => {}), // 非关键操作——多 WebView 已回退，失败不阻塞
    ])));
    await new Promise((r) => setTimeout(r, 50));
  } catch { /* pluginViews 不可用 */ }
}

/* ── 公共 API ── */

/**
 * 确认对话框——替代 window.confirm()。
 * 返回 true = 用户点确认，false = 取消/关闭。
 */
export async function confirm(options: DialogOptions): Promise<boolean> {
  // E5#84g：隐藏原生 WebContentsView，露出 HTML 弹窗
  await _hideAllPluginViews();
  try {
    if (!_confirmR) {
      console.warn("[DialogService] Confirm 渲染器未注册——fallback 到 window.confirm()");
      return window.confirm(`${options.title}\n${options.message}`);
    }
    return _confirmR(options);
  } finally {
    // 通知 MainContent 重算 bounds/visibility——恢复正确的 WebView 可见性
    shellEvents.emit("dialog:visibility", { open: false });
  }
}

/**
 * 提示对话框——纯通知，只有一个"确定"按钮。
 */
export async function alert(options: DialogOptions): Promise<void> {
  await _hideAllPluginViews();
  try {
    if (!_alertR) {
      console.warn("[DialogService] Alert 渲染器未注册——fallback 到 window.alert()");
      window.alert(`${options.title}\n${options.message}`);
      return;
    }
    return _alertR(options);
  } finally {
    shellEvents.emit("dialog:visibility", { open: false });
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
