/**
 * ViewContainerService 内部模型——自 ViewContainerService.ts 拆出（E5.8#0d.10-11b）。
 * 容器级状态（对标 VS Code ViewContainerModel）——跟踪每容器活跃 view 集合。
 * _hidden 属主 + activeViewDescriptors/setVisible/isVisible/removePluginViews verbatim。
 * 依赖方向：model → types（ViewDescriptor）+ CoreEvents（Emitter）；被聚合器实例化。
 */

import { Emitter } from "../../../react/events/CoreEvents";
import type { ViewDescriptor } from "./types";

/**
 * 容器级状态——跟踪每个容器的活跃 view 集合。
 * 内部类，不暴露给插件作者。SidePanel 消费。
 */
export class ViewContainerModel {
  /** 此容器注册的全部 view（含不可见的） */
  allViewDescriptors: ViewDescriptor[] = [];
  /** 当前显式隐藏的 view id 集合（用户手动切换）——E5.8#34：构造种子来自 hidden.ts 持久化 */
  private _hidden: Set<string>;
  /** 活跃 view 变更事件 */
  readonly onDidChangeActiveViewDescriptors = new Emitter<{
    added: ViewDescriptor[];
    removed: ViewDescriptor[];
  }>();

  constructor(initialHidden: ReadonlySet<string> = new Set()) {
    this._hidden = new Set(initialHidden);
  }

  /** 获取当前可见的 view（满足 when 条件 + 未被用户隐藏） */
  get activeViewDescriptors(): ViewDescriptor[] {
    return this.allViewDescriptors
      .filter((v) => !this._hidden.has(v.id))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /** 设置单个 view 的可见性（用户手动切换或 when 条件变化） */
  setVisible(viewId: string, visible: boolean): void {
    const wasHidden = this._hidden.has(viewId);
    if (visible && wasHidden) {
      this._hidden.delete(viewId);
      const view = this.allViewDescriptors.find((v) => v.id === viewId);
      if (view) {
        this.onDidChangeActiveViewDescriptors.fire({ added: [view], removed: [] });
      }
    } else if (!visible && !wasHidden) {
      this._hidden.add(viewId);
      const view = this.allViewDescriptors.find((v) => v.id === viewId);
      if (view) {
        this.onDidChangeActiveViewDescriptors.fire({ added: [], removed: [view] });
      }
    }
  }

  /** 查询单个 view 是否可见 */
  isVisible(viewId: string): boolean {
    return !this._hidden.has(viewId);
  }

  /** 移除指定插件的所有 view */
  removePluginViews(pluginId: string): ViewDescriptor[] {
    const removed: ViewDescriptor[] = [];
    this.allViewDescriptors = this.allViewDescriptors.filter((v) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 内部标记字段
      if ((v as any)._pluginId === pluginId) {
        removed.push(v);
        this._hidden.delete(v.id);
        return false;
      }
      return true;
    });
    return removed;
  }
}
