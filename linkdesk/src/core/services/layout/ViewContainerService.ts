/**
 * ViewContainerService —— 侧栏容器桌子（聚合器门面）。
 * 对标 VS Code IViewContainersRegistry + IViewsRegistry + IViewDescriptor。
 *
 * 核心准入三条全满足：
 * 1. 多提供方——任何插件可 registerView(containerId, descriptor) 往任意容器注册 view
 * 2. 多消费方——SidePanel + 未来底部面板 + 未来辅助侧栏都可以 getViews(containerId)
 * 3. 桌子不知道内容——不知道 FOLDERS 是文件树、不知道"收发设置"是串口的
 *
 * 🔴 RegistryBase 自动处理程序排序说明（E5.8#12 更新）：
 * unregisterAll 经 markPlugin disposer 在 onWillUninstall.fire 的 tracker 逆序回滚时执行；
 * PLUGIN_REMOVED（标签页/侧栏关闭通知）由 loader 在 fire 之前分发（notifyPluginRemoved）——
 * 故 dispatch 时 viewRegistry/ViewContainerService 数据均在。revertContainerIfCurrent 读
 * getViewPlugin().manifest（非 ViewContainerService）——双路径均无顺序依赖。
 *
 * E5.8#0d.10-11：聚合器角色——类型层/内部模型/折叠持久化迁到 ViewContainerService/ 同名夹
 * 3 子模块（types.ts 7 接口 + 1 类型 / model.ts ViewContainerModel _hidden 属主 / collapsed.ts 折叠持久化）。
 * 聚合器保留 ViewContainerServiceClass 主类全部方法——共享私有状态（_containers/_models/_viewIndex/
 * _containerOwner/_emptyContents + 3 Emitter + RegistryBase 钩子）是类的本质组织，非人为堆叠；
 * 折叠三方法薄委派 *Core。外部消费方（SidePanel/workspace.ts 等）导入路径零变更。
 *
 * @see [[hall-architecture-model]] §桌子管理规则
 * @see E36#1 ViewContainerService 类
 */

import { Emitter } from "../../react/events/CoreEvents";
import { RegistryBase } from "../../registry/RegistryBase";
import {
  getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID,
} from "../plugins/PluginStateService";
// E5.8#0d.10-11a：类型层 verbatim 迁出到 ViewContainerService/types.ts——import（本地使用）+ re-export（外部消费方路径零变更）
import type {
  ViewContainerLocation,
  ViewContainerDescriptor,
  ViewDescriptor,
  ViewContainerChangeEvent,
  ViewEmptyContentDescriptor,
  ViewChangeEvent,
  ActiveViewChangeEvent,
} from "./ViewContainerService/types";
// E5.8#12：re-export 收窄——仅 ViewDescriptor 有外部消费方（sidebar-panel.ts 直引）。
// 其余 6 型（ViewContainerLocation/Descriptor/ChangeEvent/EmptyContent/ViewChangeEvent/
// ActiveViewChangeEvent）零显式消费方（消费方靠单例方法签名结构推断类型，不按名 import）——
// 死代码当场删；需要时直引 ./ViewContainerService/types。
export type { ViewDescriptor };
// E5.8#0d.10-11b：内部模型类 verbatim 迁出到 ViewContainerService/model.ts（_hidden 属主 + active 计算）
import { ViewContainerModel } from "./ViewContainerService/model";
// E5.8#0d.10-11c：折叠持久化域（唯一不碰实例私有状态的独立域）→ 委派式拆分，Core 后缀区分模块函数
import {
  loadCollapsedState as loadCollapsedStateCore,
  setCollapsed as setCollapsedCore,
  isCollapsed as isCollapsedCore,
} from "./ViewContainerService/collapsed";
// E5.8#34：隐藏持久化域——同折叠模式（loadHiddenState 种子模型 + setHidden 落盘）
import {
  loadHiddenState,
  setHidden,
} from "./ViewContainerService/hidden";
// E5.8#41.9.1：视图复合键域——`(pluginId, viewId)` 复合键 = 视图身份唯一来源（两插件同名视图共存不互踩）
import { viewKey, splitViewKey } from "./ViewContainerService/keys";

/* ── ViewContainerService ── */

// E5.8#12：消费端 2b（ViewContainerServiceClass.unregisterAll 显式调用）已删——unregisterAll 现在
// 经 markPlugin disposer 在 tracker 逆序回滚时自动执行（单例内部自触发）。类本身零外部消费者——
// 取消 export（死代码当场删），仅保留单例 ViewContainerService 出口。
class ViewContainerServiceClass extends RegistryBase {
  /** 容器注册表——containerId → descriptor */
  private _containers = new Map<string, ViewContainerDescriptor>();
  /** 容器 model 注册表——containerId → model */
  private _models = new Map<string, ViewContainerModel>();
  /** 容器归属——containerId → 声明此容器的 pluginId */
  private _containerOwner = new Map<string, string>();
  /** E5.8#41.9.1：视图反向索引——`pluginId:viewId` 复合键 → containerId。
   *  复合键 = 视图身份唯一来源（两插件同名 viewId 共存互不踩，见 keys.ts） */
  private _viewIndex = new Map<string, string>();
  /** E4V#44——view 空状态占位内容注册表——`pluginId:viewId` 复合键 → descriptor（同名视图空态各存各的） */
  private _emptyContents = new Map<string, ViewEmptyContentDescriptor>();

  /* ── 事件 ── */

  /** 容器注册/注销事件 */
  readonly onDidChangeContainers = new Emitter<ViewContainerChangeEvent>();
  /** 某容器 views 集合发生变化 */
  readonly onDidChangeViews = new Emitter<ViewChangeEvent>();
  /** 某容器活跃 views 集合发生变化 */
  readonly onDidChangeActiveViews = new Emitter<ActiveViewChangeEvent>();

  constructor() {
    super();
  }

  /* ═══ 容器管理 ═══ */

  /** 注册容器——返回已存在的同 ID 容器（幂等）。
   *  对标 VS Code IViewContainersRegistry.registerViewContainer */
  registerViewContainer(pluginId: string, descriptor: ViewContainerDescriptor): void {
    const existing = this._containers.get(descriptor.id);
    if (existing) {
      // 幂等——同 ID 容器已存在，更新 title（可能从占位升级为正式声明）
      Object.assign(existing, descriptor);
      // E5.8#41.9.1：容器归属首主保有——归属已存在且 pluginId 不同 → 保留首主 + fail-loud
      //（无条件覆盖会让后声明者成为属主 → 卸载删错容器，见 #41.8 碰撞面 #7）
      const owner = this._containerOwner.get(descriptor.id);
      if (owner && owner !== pluginId) {
        console.error(
          `[ViewContainer] 容器 "${descriptor.id}" 已归属插件 "${owner}"，插件 "${pluginId}" 的声明被忽略（首主保有——卸载不会删错容器）。`
        );
      } else {
        this._containerOwner.set(descriptor.id, pluginId);
      }
      return;
    }
    this._containers.set(descriptor.id, { ...descriptor });
    this._containerOwner.set(descriptor.id, pluginId);
    this.markPlugin(pluginId);

    // 确保 model 存在
    if (!this._models.has(descriptor.id)) {
      // E5.8#34：种子持久化隐藏态——重启后仍保持（hidden.ts 同 collapsed.ts 模式）
      const model = new ViewContainerModel(loadHiddenState());
      model.onDidChangeActiveViewDescriptors.event((change) => {
        this.onDidChangeActiveViews.fire({
          containerId: descriptor.id,
          added: change.added,
          removed: change.removed,
        });
      });
      this._models.set(descriptor.id, model);
    }

    this.onDidChangeContainers.fire({ added: [{ ...descriptor }], removed: [] });
  }

  /** 获取容器描述符。对标 VS Code IViewContainersRegistry.get */
  getViewContainer(id: string): ViewContainerDescriptor | undefined {
    return this._containers.get(id);
  }

  /** 获取指定位置的全部容器。对标 VS Code IViewContainersRegistry.getViewContainers */
  getViewContainers(location?: ViewContainerLocation): ViewContainerDescriptor[] {
    const all = Array.from(this._containers.values());
    if (!location) return [...all].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    return all
      .filter((c) => (c.location ?? "sidebar") === location)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /* ═══ View 管理 ═══ */

  /** 注册 view——同一 pluginId+id 重复调用 = 更新。
   *  对标 VS Code IViewsRegistry.registerViews */
  registerView(pluginId: string, containerId: string, descriptor: ViewDescriptor): void {
    // 🔥 Bug 1 防线——空 containerId 守卫
    if (!containerId) {
      console.warn("[ViewContainer] registerView: containerId 为空");
      return;
    }
    this._ensureContainer(containerId);
    this.markPlugin(pluginId);

    // 给 descriptor 打上 _pluginId 标记——unregisterAll 时用到
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 内部标记字段
    (descriptor as any)._pluginId = pluginId;

    const model = this._models.get(containerId)!;
    const existing = model.allViewDescriptors.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 内部标记字段
      (v) => v.id === descriptor.id && (v as any)._pluginId === pluginId
    );

    if (existing) {
      // 🔥 Bug 1 防线——更新已有、不创建第二条记录
      const oldRender = existing.render;
      Object.assign(existing, descriptor);
      // 保留原 render——如果新 descriptor 未提供 render
      if (!descriptor.render) {
        existing.render = oldRender;
      }
    } else {
      model.allViewDescriptors.push(descriptor);
      // E5.8#41.9.1：注册期撞 id 探测——异 pluginId 同 viewId 共存时对后注册者 fail-loud 点名两 pluginId。
      // 共存合法（复合键各占各的），但解析链用裸 id 时会歧义——对标 #24.6 失败必出声。
      const collided = model.allViewDescriptors.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 内部标记字段
        (v) => v.id === descriptor.id && (v as any)._pluginId !== pluginId
      );
      if (collided) {
        console.error(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 内部标记字段
          `[ViewContainer] 视图 id 撞名：插件 "${pluginId}" 注册 view "${descriptor.id}" 已与插件 "${(collided as any)._pluginId}" 同名共存（容器 "${containerId}"）。已共存（复合键 ${viewKey(pluginId, descriptor.id)}），但解析链用裸 id 时会歧义——请显式携带 pluginId 解析。`
        );
      }
    }

    // E5.8#41.9.1：复合键索引——`(pluginId, viewId)` 唯一，两插件同名 viewId 永不互踩（#41.8 碰撞面 #1 正主）
    this._viewIndex.set(viewKey(pluginId, descriptor.id), containerId);
    this._updateActiveViews(containerId);

    this.onDidChangeViews.fire({
      containerId,
      views: [...model.allViewDescriptors],
    });
  }

  private _restoredOrder = new Set<string>();

  /** 懒加载持久化排序 + 取模型——getViews/getActiveViews 共用（E5.8#1c 去重）。空容器返回 undefined */
  private restoreOrder(containerId: string): ViewContainerModel | undefined {
    if (!this._restoredOrder.has(containerId)) {
      this._restoredOrder.add(containerId);
      this.loadViewOrder(containerId);
    }
    const model = this._models.get(containerId);
    if (!model) return undefined;
    return model;
  }

  /** 获取容器全部已注册 view（含不可见的）。对标 VS Code IViewsRegistry.getViews */
  getViews(containerId: string): ViewDescriptor[] {
    const model = this.restoreOrder(containerId);
    if (!model) return [];
    return [...model.allViewDescriptors].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /** 获取容器当前可见的 view。对标 VS Code ViewContainerModel.activeViewDescriptors */
  getActiveViews(containerId: string): ViewDescriptor[] {
    // 🔥 Bug 4 防线——空容器返回 [] 不抛错
    const model = this.restoreOrder(containerId);
    if (!model) return [];
    return model.activeViewDescriptors;
  }

  /** E5.8#41.9.1：声明扫描基元——按裸 viewId 匹配复合键索引（#41.8 §4.1 §4.2）。
   *  唯一命中 → 返回；**多命中 → fail-loud 点名全部 (pluginId, viewId) 对 + undefined（绝不静默 no-op）**；
   *  零命中 → undefined。裸 id 全局查已废弃（#41.8 碰撞面 #2），#41.9.2 将废弃为 getView(pluginId, viewId)
   *  精确寻址——本基元供 revealFloating 声明扫描复用。 */
  getView(id: string): ViewDescriptor | undefined {
    const matches: Array<{ pluginId: string; containerId: string }> = [];
    for (const [key, containerId] of this._viewIndex) {
      const [pluginId, viewId] = splitViewKey(key);
      if (viewId === id) matches.push({ pluginId, containerId });
    }
    if (matches.length === 0) return undefined;
    if (matches.length > 1) {
      console.error(
        `[ViewContainer] 裸 viewId "${id}" 解析到 ${matches.length} 个视图（${matches.map((m) => `"${m.pluginId}:${id}"`).join("、")}）——歧义，调用方必须携带 pluginId 精确寻址或插件改名（#41.8）。`
      );
      return undefined;
    }
    const { pluginId, containerId } = matches[0];
    const model = this._models.get(containerId);
    if (!model) return undefined;
    return model.allViewDescriptors.find(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 内部标记字段
      (v) => v.id === id && (v as any)._pluginId === pluginId
    );
  }

  /* ═══ E4V#44 View 空状态占位内容 ═══ */

  /** 注册 view 的空状态占位内容。对标 VS Code IViewContentDescriptor。
   *  view 无数据时（when 条件匹配）→ 壳渲染此 content 替代 view.render()。
   *  E5.8#41.9.1：签名加 pluginId——`(pluginId, viewId)` 复合键（同名视图空态各存各的）。当前零外部消费方。 */
  registerViewEmptyContent(pluginId: string, containerId: string, viewId: string, content: React.ReactNode, when?: string): void {
    this._emptyContents.set(viewKey(pluginId, viewId), { pluginId, containerId, viewId, content, when });
  }

  /** 获取 view 的空状态占位内容，无注册返回 undefined。
   *  E5.8#41.9.1：签名加 pluginId——精确寻址同名视图的空态。 */
  getViewEmptyContent(pluginId: string, viewId: string): ViewEmptyContentDescriptor | undefined {
    return this._emptyContents.get(viewKey(pluginId, viewId));
  }

  /* ═══ E4V#46 View 折叠持久化（委派 ViewContainerService/collapsed 域） ═══ */

  /** 加载持久化的折叠状态 */
  loadCollapsedState(): Set<string> {
    return loadCollapsedStateCore();
  }

  /** 保存单个 view 折叠状态 */
  setCollapsed(viewId: string, collapsed: boolean): void {
    setCollapsedCore(viewId, collapsed);
  }

  /** 查询 view 是否持久化为折叠 */
  isCollapsed(viewId: string): boolean {
    return isCollapsedCore(viewId);
  }

  /* ═══ 可见性 ═══ */

  /** 设置 view 可见性（用户手动切换或 when 条件变化）。
   *  对标 VS Code ViewContainerModel.setVisible */
  setVisible(containerId: string, viewId: string, visible: boolean): void {
    const model = this._models.get(containerId);
    if (!model) return;
    model.setVisible(viewId, visible);
    // E5.8#34：隐藏态持久化——重启保持（面板容器切换器 + 侧栏「视图」子菜单共用此入口）
    setHidden(viewId, !visible);
  }

  /** E5#44d：切换 view 可见性——Views 子菜单消费 */
  toggleViewVisibility(containerId: string, viewId: string): void {
    const visible = this.isVisible(containerId, viewId);
    this.setVisible(containerId, viewId, !visible);
  }

  /** 查询 view 可见性。对标 VS Code ViewContainerModel.isVisible */
  isVisible(containerId: string, viewId: string): boolean {
    const model = this._models.get(containerId);
    if (!model) return false;
    return model.isVisible(viewId);
  }

  /** E4V#48——跨容器迁移 view。对标 VS Code ViewContainerModel.moveView。
   *  newIndex 可选——不传则追加到末尾。 */
  moveView(viewId: string, fromContainerId: string, toContainerId: string, newIndex?: number): void {
    if (fromContainerId === toContainerId) return;
    const fromModel = this._models.get(fromContainerId);
    if (!fromModel) return;
    const idx = fromModel.allViewDescriptors.findIndex((v) => v.id === viewId);
    if (idx === -1) return;
    const [view] = fromModel.allViewDescriptors.splice(idx, 1);
    // 确保目标容器存在
    this._ensureContainer(toContainerId);
    const toModel = this._models.get(toContainerId)!;
    // 追加到末尾——order 设为目标容器最大值 + 1（getActiveViews 按 order 排序）
    const maxOrder = toModel.allViewDescriptors.reduce((max, v) => Math.max(max, v.order ?? 0), 0);
    view.order = maxOrder + 1;
    const insertAt = newIndex ?? toModel.allViewDescriptors.length;
    toModel.allViewDescriptors.splice(insertAt, 0, view);
    // 更新两个容器的活跃 views
    this._updateActiveViews(fromContainerId);
    this._updateActiveViews(toContainerId);
    this.onDidChangeViews.fire({ containerId: fromContainerId, views: [...fromModel.allViewDescriptors] });
    this.onDidChangeViews.fire({ containerId: toContainerId, views: [...toModel.allViewDescriptors] });
  }

  /* ═══ E4V#47 View 排序 ═══ */

  /** 重排 container 内 view 顺序——拖 header 到新位置。
   *  newIndex 为目标位置（0 = 最前）。对标 VS Code ViewContainerModel.moveView。 */
  reorderView(containerId: string, viewId: string, newIndex: number): void {
    const model = this._models.get(containerId);
    if (!model) return;
    const idx = model.allViewDescriptors.findIndex((v) => v.id === viewId);
    if (idx === -1 || idx === newIndex) return;
    const [moved] = model.allViewDescriptors.splice(idx, 1);
    model.allViewDescriptors.splice(newIndex, 0, moved);
    // 更新 order 字段
    model.allViewDescriptors.forEach((v, i) => { v.order = i; });
    // 持久化——按 container 存 viewOrder
    const viewOrder = model.allViewDescriptors.map(v => v.id);
    setPluginStateValue(APP_PLUGIN_ID, `viewOrder.${containerId}`, viewOrder).catch((e) => { console.error("[ViewContainer] 保存视图排序失败:", e); });
    this._updateActiveViews(containerId);
    this.onDidChangeViews.fire({ containerId, views: [...model.allViewDescriptors] });
  }

  /** 加载持久化的 view 排序——应用到 allViewDescriptors */
  loadViewOrder(containerId: string): void {
    const model = this._models.get(containerId);
    if (!model) return;
    const savedOrder = getPluginStateValue<string[]>(APP_PLUGIN_ID, `viewOrder.${containerId}`);
    if (!savedOrder || savedOrder.length === 0) return;
    // 按持久化的顺序重排
    const orderMap = new Map(savedOrder.map((id, i) => [id, i]));
    model.allViewDescriptors.sort((a, b) => {
      const ao = orderMap.get(a.id);
      const bo = orderMap.get(b.id);
      if (ao !== undefined && bo !== undefined) return ao - bo;
      if (ao !== undefined) return -1;
      if (bo !== undefined) return 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
    model.allViewDescriptors.forEach((v, i) => { v.order = i; });
    this._updateActiveViews(containerId);
  }

  /* ═══ 清理（RegistryBase 钩子） ═══ */

  /** 清理插件在此桌子上的所有登记项 */
  unregisterAll(pluginId: string): void {
    const removedContainers: ViewContainerDescriptor[] = [];

    // 遍历所有容器 → 移除该插件的 view
    for (const [containerId, model] of this._models) {
      const removed = model.removePluginViews(pluginId);
      if (removed.length > 0) {
        // 清理 view 索引——E5.8#41.9.1：复合键删除（`pluginId:viewId` 只删自己插件的条目）
        for (const v of removed) {
          this._viewIndex.delete(viewKey(pluginId, v.id));
        }
        this._updateActiveViews(containerId);
        this.onDidChangeViews.fire({
          containerId,
          views: [...model.allViewDescriptors],
        });
      }

      // 容器 views 全空 + 容器本身是该插件声明 → 移除容器
      if (
        model.allViewDescriptors.length === 0 &&
        this._containerOwner.get(containerId) === pluginId
      ) {
        const container = this._containers.get(containerId);
        if (container) {
          removedContainers.push({ ...container });
          this._containers.delete(containerId);
          this._containerOwner.delete(containerId);
          this._models.delete(containerId);
        }
      }
    }

    if (removedContainers.length > 0) {
      this.onDidChangeContainers.fire({ added: [], removed: removedContainers });
    }
  }

  /* ═══ 内部辅助 ═══ */

  /** 确保容器 model 存在——容器未声明时自动创建占位 */
  private _ensureContainer(containerId: string): void {
    if (!this._models.has(containerId)) {
      // 自动创建占位容器——等 registerViewContainer 正式声明时更新 title
      if (!this._containers.has(containerId)) {
        this._containers.set(containerId, {
          id: containerId,
          title: containerId, // 占位 title
        });
        this.onDidChangeContainers.fire({
          added: [{ id: containerId, title: containerId }],
          removed: [],
        });
      }
      // E5.8#34：占位容器同样种子持久化隐藏态（与 registerViewContainer 同源）
      const model = new ViewContainerModel(loadHiddenState());
      model.onDidChangeActiveViewDescriptors.event((change) => {
        this.onDidChangeActiveViews.fire({
          containerId,
          added: change.added,
          removed: change.removed,
        });
      });
      this._models.set(containerId, model);
    }
  }

  /** 刷新活跃 view 并 fire 事件 */
  private _updateActiveViews(containerId: string): void {
    const model = this._models.get(containerId);
    if (!model) return;
    const active = model.activeViewDescriptors;
    this.onDidChangeActiveViews.fire({
      containerId,
      added: active,
      removed: [],
    });
  }
}

/** 全局单例 */
export const ViewContainerService = new ViewContainerServiceClass();
