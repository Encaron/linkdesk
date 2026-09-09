/**
 * DialogService——统一对话框入口。
 * E2c #15：归一化 ConfirmDialog + 壳级弹窗，替代 window.confirm()。
 *
 * 设计依据：docs/02-Electron架构/E2_底层加固与侧栏扩展_暂定/03-E2c-基础设施缺口.md §三
 * VS Code 对标：vscode.window.showWarningMessage / showInformationMessage
 */

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
 * 确认对话框——替代 window.confirm()。
 * 返回 true = 用户点确认，false = 取消/关闭。
 */
export async function confirm(options: DialogOptions): Promise<boolean> {
  // E5.7#17：渲染器由 App.tsx 桥注册——pushDialog → 池 DialogHost 哑渲染。
  // E5.7#44：E5#84g 的 _hideAllPluginViews（弹窗前隐藏 per-tab 插件 WebView）已删——
  // 插件 WebView 消亡 + 弹窗本身渲染在池内，隐藏逻辑失去对象。
  if (!_confirmR) {
    console.warn("[DialogService] Confirm 渲染器未注册——fallback 到 window.confirm()");
    return window.confirm(`${options.title}\n${options.message}`);
  }
  return _confirmR(options);
}

/**
 * E6#71c 富内容确认——插件自绘确认内容（content 视图），机制同 confirm()（居中/遮罩/Esc/trap/结算）。
 * 返回 true = 用户点确认，false = 取消/关闭。渲染器未注册兜底 window.confirm（同 confirm() 同款）。
 */
export async function confirmContent(options: DialogOptions): Promise<boolean> {
  if (!options.content) return confirm(options);
  if (!_confirmR) {
    console.warn("[DialogService] Confirm 渲染器未注册——fallback 到 window.confirm()");
    return window.confirm(`${options.title}\n${options.message}`);
  }
  return _confirmR(options);
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
  return _alertR(options);
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
