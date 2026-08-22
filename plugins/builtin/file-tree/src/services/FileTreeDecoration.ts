/**
 * FileTreeDecoration——文件装饰器消费。
 * E4V#31：订阅 linkdesk.decorations.onDidChange（E5.7#60 池内本地注册表）→全量重查已加载节点→
 * 触发模型重渲染→FileTreeNode 渲染 badge。
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

const lk = window.linkdesk;

export class FileTreeDecorationService {
  private _model: FileTreeModel;
  private _unsub: (() => void) | null = null;

  constructor(model: FileTreeModel) {
    this._model = model;
  }

  /** 激活——订阅注册中心变更，重查全部已加载节点后触发重渲染 */
  attach(): void {
    this._unsub = lk.decorations?.onDidChange(() => {
      // 注册/注销即全量刷新（VS Code 同款）——只清缓存 + fire 不够：已加载节点不会再走
      // getChildren（装饰器只在新节点创建时调用）→ 徽标永不出现在已有节点上。
      // 侧栏切走再切回也不重查——SidebarZone keep-alive（display:none）不重挂载视图。
      void this._redecorateLoaded().catch((e: unknown) => {
        console.error("[file-tree] 装饰全量刷新失败:", e);
        this._model.onDidChange.fire(); // 失败也重渲染——已覆盖的节点显示最新结果
      });
    }) ?? null;
  }

  /** 停用——取消订阅 */
  detach(): void {
    this._unsub?.();
    this._unsub = null;
  }

  /** 查询并应用单个文件的装饰——由 getChildren 调用（新节点懒加载路径） */
  async decorate(item: ExplorerItem): Promise<void> {
    // 新节点路径配置逐项读（批量小、调用简单）；全量刷新路径走 _redecorateLoaded 批量读
    const colorsOn = (await lk.configuration.get<boolean>("explorer.decorations.colors")) ?? true;
    const badgesOn = (await lk.configuration.get<boolean>("explorer.decorations.badges")) ?? true;
    await this._applyDecoration(item, colorsOn, badgesOn);
  }

  /**
   * 全量重查已加载节点（roots + 递归 children !== null）后 fire 一次——FileTree.tsx
   * 订阅 model.onDidChange 重渲染。provider 事件给的 uris 不做细粒度过滤——全量重查始终
   * 正确（折叠的子树也在内：折叠/展开不重查，跳过会残留陈旧徽标——验证三的折叠场景）。
   */
  private async _redecorateLoaded(): Promise<void> {
    // E4V#34g3/g4: 尊重 decorations.colors / decorations.badges 开关——每批只读一次
    //（decorate 的逐项 2×IPC 在树大时太慢）
    const colorsOn = (await lk.configuration.get<boolean>("explorer.decorations.colors")) ?? true;
    const badgesOn = (await lk.configuration.get<boolean>("explorer.decorations.badges")) ?? true;
    const visit = async (item: ExplorerItem): Promise<void> => {
      await this._applyDecoration(item, colorsOn, badgesOn);
      if (item.children) {
        for (const child of item.children) await visit(child);
      }
    };
    for (const root of this._model.roots) await visit(root);
    this._model.onDidChange.fire();
  }

  /** 查询单个节点并落盘 decoration——无 provider 时清空（注销后徽标立即消失） */
  private async _applyDecoration(item: ExplorerItem, colorsOn: boolean, badgesOn: boolean): Promise<void> {
    const deco = await lk.decorations?.getDecoration(item.uri);
    item.decoration = deco ? {
      ...(colorsOn && deco.color ? { color: deco.color } : {}),
      ...(badgesOn && deco.badge ? { badge: deco.badge } : {}),
      tooltip: deco.tooltip,
      propagate: deco.propagate,
    } : undefined;
  }
}
