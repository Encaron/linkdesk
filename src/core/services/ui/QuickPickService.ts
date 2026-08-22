/**
 * QuickPickService — 归一化浮动面板服务
 *
 * E5.5#7 Phase 5。壳侧单例——E5.7#15 起 App 桥序列化 DTO 推池 QuickPickHost 渲染，
 * 所有浮层内容通过此服务切换 mode + props。
 *
 * 对标 VS Code QuickInputService。
 */

import type { PoolQuickPickItem } from "../../types/pool/poolQuickPick";

// ── 类型 ──

/** QuickPick 展示模式 */
type QuickPickMode = "commands" | "theme" | "language" | "devtools" | "custom";

export interface QuickPickState<T = unknown> {
  open: boolean;
  mode: QuickPickMode;
  items: T[];
  placeholder: string;
  prefix?: string;
  /** 搜索文本提取（用于模糊匹配） */
  getSearchText: (item: T) => string;
  /** React key 提取 */
  getKey: (item: T) => string;
  onSelect: (item: T) => void;
  onHighlight?: (item: T) => void;
  onClose: () => void;
  /** E5.7#15：聪慧→哑桥——壳侧把 item 序列化成池可渲染的纯数据 DTO（显示文本铁律：壳侧 t() 解析）。
   *  必填——池 QuickPickHost 只认识 DTO，函数/ReactNode 无法过 IPC。 */
  serialize: (item: T) => PoolQuickPickItem;
  /** E5.7#15：行内按钮动作——池回传 actionId，壳侧重解析 item 后执行 */
  onItemAction?: (item: T, actionId: string) => void;
}

// ── 单例 ──

type Listener = () => void;

// E5.7#98：异质状态单例——存 unknown 兜底（QuickPickState 默认参数即 unknown），
// 读侧 getState<T> 按消费方类型窄化
let _state: QuickPickState<unknown> | null = null;
const _listeners = new Set<Listener>();

function notify(): void {
  for (const fn of _listeners) fn();
}

export const QuickPickService = {
  /** 展示浮层——替换当前状态 */
  show<T>(state: Omit<QuickPickState<T>, "open">): void {
    // 函数字段 T→unknown 协变缺口——窄化到存储类型（E5.7#98）
    _state = { ...state, open: true } as QuickPickState<unknown>;
    notify();
  },

  /** 关闭浮层 */
  hide(): void {
    _state = null;
    notify();
  },

  /** 返回当前状态（React 组件读取） */
  getState<T>(): QuickPickState<T> | null {
    return _state as QuickPickState<T> | null;
  },

  /** 订阅变更——返回取消函数 */
  onChange(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};
