/**
 * QuickPickService — 归一化浮动面板服务
 *
 * E5.5#7 Phase 5。壳侧单例——App.tsx 只渲染一个 QuickPick 组件，
 * 所有浮层内容通过此服务切换 mode + props。
 *
 * 对标 VS Code QuickInputService。
 */

import type { ReactNode } from "react";

// ── 类型 ──

/** QuickPick 展示模式 */
export type QuickPickMode = "commands" | "theme" | "language" | "devtools" | "custom";

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
  // E3.5 slot props
  renderLabel?: (item: T) => ReactNode;
  renderCategory?: (item: T) => ReactNode;
  renderDetail?: (item: T) => ReactNode;
  renderDetailRight?: (item: T) => ReactNode;
  renderItemActions?: (item: T, isSelected: boolean) => ReactNode;
}

// ── 单例 ──

type Listener = () => void;

let _state: QuickPickState<any> | null = null;
const _listeners = new Set<Listener>();

function notify(): void {
  for (const fn of _listeners) fn();
}

export const QuickPickService = {
  /** 展示浮层——替换当前状态 */
  show<T>(state: Omit<QuickPickState<T>, "open">): void {
    _state = { ...state, open: true } as QuickPickState<any>;
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
