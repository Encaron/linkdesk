/**
 * StatusBarService——动态状态栏项运行时管理。
 * 对标 VS Code `vscode.window.createStatusBarItem()`。
 *
 * 静态声明（plugin.json `contributes.statusBar`）仍由 viewRegistry 管理——
 * 本服务管运行时创建/更新/销毁的动态项。StatusBar.tsx 合并两源。
 *
 * 设计依据：[[phase4-design-decisions]]——核心不认 pluginId，但 status bar 项
 * 需要归属到插件以支持自动清理。pluginId 仅用于生命周期管理，不用于渲染决策。
 */

import type { StatusBarItem } from "../../api/types";
import { Emitter } from "../../react/events/CoreEvents";
import { trackRegistration } from "../../registry/registrationTracker";

/* ── 动态状态栏项——运行时可变字段 ── */

export interface DynamicStatusBarItem extends StatusBarItem {
  pluginId: string;
}

/* ── 公开句柄——创建者持有，调 dispose() 销毁 ── */

export interface StatusBarItemHandle {
  /** 销毁此项——从状态栏移除 + 触发重渲染 */
  dispose(): void;
  /** 更新 label / icon / align / onClick——触发重渲染 */
  update(options: Pick<DynamicStatusBarItem, "label"> & Partial<Omit<DynamicStatusBarItem, "pluginId" | "label">>): void;
}

/* ── 内部存储 ── */

/** pluginId → itemId → DynamicStatusBarItem */
const _items = new Map<string, Map<string, DynamicStatusBarItem>>();

/** 状态栏重渲染通知 */
export const onDidChangeStatusBar = new Emitter<void>();

/* ── 公开 API ── */

/** 创建动态状态栏项。返回句柄——调用方保存引用，unmount/dispose 时调 dispose()。 */
export function createStatusBarItem(
  pluginId: string,
  id: string,
  options: Pick<DynamicStatusBarItem, "label"> & Partial<Omit<DynamicStatusBarItem, "pluginId">>,
): StatusBarItemHandle {
  const item: DynamicStatusBarItem = {
    pluginId,
    id,
    label: options.label,
    align: options.align ?? "left",
    icon: options.icon,
    onClick: options.onClick,
    configurable: options.configurable,
  };

  // 存入插件桶
  let bucket = _items.get(pluginId);
  if (!bucket) {
    bucket = new Map();
    _items.set(pluginId, bucket);
  }
  bucket.set(id, item);
  onDidChangeStatusBar.fire();

  const handle: StatusBarItemHandle = {
    dispose() {
      const b = _items.get(pluginId);
      if (!b) return;
      b.delete(id);
      if (b.size === 0) _items.delete(pluginId);
      onDidChangeStatusBar.fire();
    },
    update(options) {
      // 更新已存储 item 的可变字段
      const b = _items.get(pluginId);
      const stored = b?.get(id);
      if (!stored) return;
      if (options.label !== undefined) stored.label = options.label;
      if (options.align !== undefined) stored.align = options.align;
      if (options.icon !== undefined) stored.icon = options.icon;
      if (options.onClick !== undefined) stored.onClick = options.onClick;
      if (options.configurable !== undefined) stored.configurable = options.configurable;
      onDidChangeStatusBar.fire();
    },
  };
  // E5.8#10：卸载自动回滚——同一 handle 的 dispose 入 tracker（dispose 幂等，重放无害）
  trackRegistration(pluginId, handle.dispose);
  return handle;
}

/** 获取所有动态状态栏项（StatusBar.tsx 消费） */
export function getDynamicStatusBarItems(): DynamicStatusBarItem[] {
  const result: DynamicStatusBarItem[] = [];
  for (const [, bucket] of _items) {
    for (const item of bucket.values()) {
      result.push(item);
    }
  }
  return result;
}

/** 清空全部（测试用） */
export function clearStatusBarItems(): void {
  _items.clear();
}
