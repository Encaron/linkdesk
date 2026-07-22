/**
 * 插件窗口 API——对标 VS Code vscode.window.showQuickPick / showInputBox / showInformationMessage。
 * Phase 5 盲区 7（P0）：插件需要统一的选择框/输入框/确认框——不走 window.confirm()（UI 丑陋且阻塞）。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §盲区7
 * VS Code 对标：vscode.window.showQuickPick / showInputBox / showWarningMessage
 * VS Code 源码：src/vs/platform/dialogs/common/dialogs.ts — IDialogService
 *
 * 实现：React 组件 + Promise。插件调 API → 渲染弹窗 → 用户操作 → resolve Promise。
 * 所有弹窗走同一个 DialogService，统一 UI、统一键盘导航、统一失焦关闭。
 */

/* ── 类型 ── */

export interface QuickPickItem {
  label: string;
  description?: string;
  detail?: string;
}

export interface InputBoxOptions {
  prompt: string;
  value?: string;
  placeholder?: string;
  validate?: (value: string) => string | undefined; // 返回 undefined = 通过，返回 string = 错误信息
}

/* ── 回调注册（UI 组件挂载时注册渲染函数） ── */

type QuickPickRenderer = (items: QuickPickItem[]) => Promise<string | undefined>;
type InputBoxRenderer = (options: InputBoxOptions) => Promise<string | undefined>;
type ConfirmRenderer = (message: string, buttons?: string[]) => Promise<number>; // 返回按钮索引

let _quickPickRenderer: QuickPickRenderer | null = null;
let _inputBoxRenderer: InputBoxRenderer | null = null;
let _confirmRenderer: ConfirmRenderer | null = null;

/** UI 层注册渲染函数——DialogHost 组件挂载时调用 */
export function registerDialogRenderers(
  quickPick: QuickPickRenderer,
  inputBox: InputBoxRenderer,
  confirm: ConfirmRenderer
): void {
  _quickPickRenderer = quickPick;
  _inputBoxRenderer = inputBox;
  _confirmRenderer = confirm;
}

/** UI 层注销渲染函数 */
export function unregisterDialogRenderers(): void {
  _quickPickRenderer = null;
  _inputBoxRenderer = null;
  _confirmRenderer = null;
}

/* ── 公共 API（插件调用） ── */

/**
 * 显示 QuickPick 选择框——对标 VS Code window.showQuickPick()。
 * 返回用户选中的 item label，取消返回 undefined。
 */
export async function showQuickPick(items: QuickPickItem[]): Promise<string | undefined> {
  if (!_quickPickRenderer) {
    console.warn("[DialogService] QuickPick 渲染器未注册——请在 App 中挂载 DialogHost");
    return undefined;
  }
  return _quickPickRenderer(items);
}

/**
 * 显示输入框——对标 VS Code window.showInputBox()。
 * 返回用户输入的字符串，取消返回 undefined。
 */
export async function showInputBox(options: InputBoxOptions): Promise<string | undefined> {
  if (!_inputBoxRenderer) {
    console.warn("[DialogService] InputBox 渲染器未注册——请在 App 中挂载 DialogHost");
    return undefined;
  }
  return _inputBoxRenderer(options);
}

/**
 * 显示确认框——对标 VS Code window.showInformationMessage()。
 * 返回按钮索引（0 = 第一个按钮，通常 "确定"），关闭返回 -1。
 */
export async function showConfirm(
  message: string,
  buttons: string[] = ["确定", "取消"]
): Promise<number> {
  if (!_confirmRenderer) {
    console.warn("[DialogService] Confirm 渲染器未注册——fallback 到 window.confirm()");
    return window.confirm(message) ? 0 : 1;
  }
  return _confirmRenderer(message, buttons);
}
