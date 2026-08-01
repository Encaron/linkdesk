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

import { FileDecorationRegistry } from "@src/core/FileDecorationRegistry";
import type { FileTreeModel, ExplorerItem } from "./FileTreeModel";

export class FileTreeDecorationService {
  private _model: FileTreeModel;
  private _unsub: (() => void) | null = null;

  constructor(model: FileTreeModel) {
    this._model = model;
  }

  /** 激活——订阅注册中心变更，变更时触发模型重渲染 */
  attach(): void {
    this._unsub = FileDecorationRegistry.onDidChange(() => {
      // 清掉已加载节点的 decoration 缓存——下次 getChildren/rerender 重新查询
      this._invalidateRoots();
      this._model.onDidChange.fire();
    });
  }

  /** 停用——取消订阅 */
  detach(): void {
    this._unsub?.();
    this._unsub = null;
  }

  /** 查询并应用单个文件的装饰——由 getChildren 调用 */
  decorate(item: ExplorerItem): void {
    if (!FileDecorationRegistry.hasProviders()) return;
    item.decoration = FileDecorationRegistry.getDecoration(item.uri) ?? undefined;
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
