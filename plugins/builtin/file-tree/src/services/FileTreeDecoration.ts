/**
 * FileTreeDecoration——文件装饰器消费。
 * E4V#31：订阅 FileDecorationRegistry.onDidChange→触发模型重渲染→FileTreeNode 渲染 badge。
 *
 * 对标 VS Code fileDecorations.ts 的消费端。
 * 插件注册 FileDecorationProvider（如 Git 的 M/U/A），文件树通过此模块消费。
 *
 * 使用：
 *   const deco = new FileTreeDecorationService(model);
 *   deco.attach();   // FoldersView mount
 *   deco.detach();    // FoldersView unmount
 */

import type { FileTreeModel, ExplorerItem } from "./FileTreeModel";

const lk = (window as any).linkdesk;

export class FileTreeDecorationService {
  private _model: FileTreeModel;
  private _unsub: (() => void) | null = null;

  constructor(model: FileTreeModel) {
    this._model = model;
  }

  /** 激活——订阅注册中心变更，变更时触发模型重渲染 */
  attach(): void {
    this._unsub = lk.decorations?.onDidChange(() => {
      // 清掉已加载节点的 decoration 缓存——下次 getChildren/rerender 重新查询
      this._invalidateRoots();
      this._model.onDidChange.fire();
    }) ?? null;
  }

  /** 停用——取消订阅 */
  detach(): void {
    this._unsub?.();
    this._unsub = null;
  }

  /** 查询并应用单个文件的装饰——由 getChildren 调用 */
  async decorate(item: ExplorerItem): Promise<void> {
    // E5.6#11.5g7：hasProviders() 优化去掉——IPC 查询无 provider 时自然返回 null
    const deco = await lk.decorations?.getDecoration(item.uri);
    if (!deco) return;
    // E4V#34g3/g4: 尊重 decorations.colors / decorations.badges 开关
    const colorsOn = await lk.configuration.get("explorer.decorations.colors") ?? true;
    const badgesOn = await lk.configuration.get("explorer.decorations.badges") ?? true;
    item.decoration = {
      ...(colorsOn && deco.color ? { color: deco.color } : {}),
      ...(badgesOn && deco.badge ? { badge: deco.badge } : {}),
      tooltip: deco.tooltip,
      propagate: deco.propagate,
    };
  }

  /** 递归清掉子树 decoration 缓存——provider 变更后强制重新查询 */
  private _invalidateRoots(): void {
    for (const root of this._model.roots) {
      this._invalidateItem(root);
    }
  }

  private _invalidateItem(item: ExplorerItem): void {
    item.decoration = undefined;
    if (item.children) {
      for (const child of item.children) this._invalidateItem(child);
    }
  }
}
