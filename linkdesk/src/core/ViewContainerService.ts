/**
 * ViewContainerService —— 侧栏容器桌子。
 * 对标 VS Code IViewContainersRegistry + IViewsRegistry + IViewDescriptor。
 *
 * 核心准入三条全满足：
 * 1. 多提供方——任何插件可 registerView(containerId, descriptor) 往任意容器注册 view
 * 2. 多消费方——SidePanel + 未来底部面板 + 未来辅助侧栏都可以 getViews(containerId)
 * 3. 桌子不知道内容——不知道 FOLDERS 是文件树、不知道"收发设置"是串口的
 *
 * 🔴 RegistryBase 自动处理程序排序说明：
 * ES 模块提升意味着 ViewContainerService 构造函数在 lifecycle.ts 主体代码之前运行。
 * 因此自动 unregisterAll 在 PLUGIN_REMOVED dispatch 之前执行。
 * revertContainerIfCurrent 从 getViewPlugin().manifest 读数据（非 ViewContainerService），
 * 且 E36#4.7 的显式处理程序作为安全网——第二次 unregisterAll 调用是幂等的。
 *
 * @see [[hall-architecture-model]] §桌子管理规则
 * @see E36#1 ViewContainerService 类
 */

import { Emitter } from "./CoreEvents";
import { RegistryBase } from "./RegistryBase";
import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "./PluginStateService";
import { registerOnApply } from "./ConfigurationApplier";

/* ── 类型定义 ── */

/** 容器所在位置。对标 VS Code ViewContainerLocation。 */
export type ViewContainerLocation = "sidebar" | "panel" | "auxiliarybar";

/** 容器描述符——对标 VS Code IViewContainerDescriptor */
export interface ViewContainerDescriptor {
  /** 容器 ID。命名：a-z + 连字符。如 "explorer" / "marketplace" / "serial-monitor" */
  id: string;
  /** 侧栏 header 显示的标题。如 "资源管理器" */
  title: string;
  /** 容器图标——覆盖插件自身的图标。可选。 */
  icon?: string;
  /** 位置。默认 'sidebar'。 */
  location?: ViewContainerLocation;
  /** 无活跃 view 时自动隐藏容器。对标 VS Code hideIfEmpty。默认 false。 */
  hideIfEmpty?: boolean;
  /** 同位置内的排序权重。小值靠前。 */
  order?: number;
  /** 容器内只有一个 view 时，隐藏 view header——标题合并到容器 header。
   *  对标 VS Code mergeViewWithContainerWhenSingleView */
  mergeHeaderWhenSingle?: boolean;
}

/** View 描述符——对标 VS Code IViewDescriptor */
export interface ViewDescriptor {
  /** View 唯一 ID。如 "folders" / "sessions" / "settings" */
  id: string;
  /** 显示标题——SidebarSection 的 header 文字。可为空字符串（不显示折叠头） */
  title: string;
  /** React 组件 */
  render: React.ComponentType;
  /** 🆕 E36#ROLE：容器角色——替代 title="" hack。默认 "section"。
   *  "toolbar" = 粘顶，不被 section 覆盖。 "section" = 有折叠头，同级替换。 */
  role?: "toolbar" | "section";
  /** Context key when 条件——满足时才显示。null = 始终显示。对标 VS Code IViewDescriptor.when */
  when?: string;
  /** 同容器内的排序权重。小值在上。对标 VS Code IViewDescriptor.order */
  order?: number;
  /** 初始折叠状态。true = 首次渲染时折叠。对标 VS Code IViewDescriptor.collapsed */
  collapsed?: boolean;
  /** 用户可通过 Views 子菜单切换可见性。对标 VS Code IViewDescriptor.canToggleVisibility */
  canToggleVisibility?: boolean;
  /** 用户可将此 view 移到其他容器。对标 VS Code IViewDescriptor.canMoveView */
  canMoveView?: boolean;
  /** 默认隐藏——用户需手动从 Views 菜单开启。对标 VS Code IViewDescriptor.hideByDefault */
  hideByDefault?: boolean;
  /** 折叠头右侧的操作按钮。ReactNode——不可在 plugin.json 声明，仅命令式 registerView 使用 */
  actions?: React.ReactNode;
  /** 🆕 PinnedSlot——粘顶内容。壳在 Section header 下方渲染，position:sticky。每次渲染调用——内容动态变化 */
  pinnedContent?: () => React.ReactNode;
  /** 标题旁的副文字。对标 VS Code ViewPane.titleDescription */
  titleDescription?: string;
  /** 单 view 且容器 mergeHeaderWhenSingle 时，容器 header 显示此标题替代容器 title。
   *  对标 VS Code singleViewPaneContainerTitle */
  singleViewPaneContainerTitle?: string;
  /** E4V#45——拖拽 resize 最小高度（px）。不声明默认 100 */
  minHeight?: number;
  /** 控制 actions 的显隐时机。对标 VS Code ViewPaneShowActions */
  showActions?: "always" | "whenExpanded" | "default";
  /** 标题 hover tooltip——标题截断时显示完整文字。对标 VS Code titleContainerHover */
  titleTooltip?: string;
  /** 标题右侧标记——数字/短文字（如已安装数量 "15"）。对标 VS Code IViewDescriptor.badge */
  badge?: string | number;
}

/** 容器变更事件 */
export interface ViewContainerChangeEvent {
  added: ViewContainerDescriptor[];
  removed: ViewContainerDescriptor[];
}

/** E4V#44——View 空状态占位内容。对标 VS Code IViewContentDescriptor。
 *  通用——不限于"欢迎"：搜索无结果/串口未连接/加载失败 等都走此机制。 */
export interface ViewEmptyContentDescriptor {
  viewId: string;
  containerId: string;
  /** 占位内容——view 无数据/不满足条件时显示 */
  content: React.ReactNode;
  /** Context key when 条件。null = 始终显示 */
  when?: string;
}

/** View 变更事件 */
export interface ViewChangeEvent {
  containerId: string;
  views: ViewDescriptor[];
}

/** 活跃 View 变更事件 */
export interface ActiveViewChangeEvent {
  containerId: string;
  added: ViewDescriptor[];
  removed: ViewDescriptor[];
}

/* ── 内部模型——对标 VS Code ViewContainerModel ── */

/**
 * 容器级状态——跟踪每个容器的活跃 view 集合。
 * 内部类，不暴露给插件作者。SidePanel 消费。
 */
class ViewContainerModel {
  /** 此容器注册的全部 view（含不可见的） */
  allViewDescriptors: ViewDescriptor[] = [];
  /** 当前显式隐藏的 view id 集合（用户手动切换） */
  private _hidden = new Set<string>();
  /** 活跃 view 变更事件 */
  readonly onDidChangeActiveViewDescriptors = new Emitter<{
    added: ViewDescriptor[];
    removed: ViewDescriptor[];
  }>();

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

/* ── ViewContainerService ── */

export class ViewContainerServiceClass extends RegistryBase {
  /** 容器注册表——containerId → descriptor */
  private _containers = new Map<string, ViewContainerDescriptor>();
  /** 容器 model 注册表——containerId → model */
  private _models = new Map<string, ViewContainerModel>();
  /** 容器归属——containerId → 声明此容器的 pluginId */
  private _containerOwner = new Map<string, string>();
  /** 全局 view id → containerId 反向索引 */
  private _viewIndex = new Map<string, string>();
  /** E4V#44——view 空状态占位内容注册表——viewId → descriptor */
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
      // 更新归属——可能是声明式覆盖占位
      this._containerOwner.set(descriptor.id, pluginId);
      return;
    }
    this._containers.set(descriptor.id, { ...descriptor });
    this._containerOwner.set(descriptor.id, pluginId);
    this.markPlugin(pluginId);

    // 确保 model 存在
    if (!this._models.has(descriptor.id)) {
      const model = new ViewContainerModel();
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
    }

    this._viewIndex.set(descriptor.id, containerId);
    this._updateActiveViews(containerId);

    this.onDidChangeViews.fire({
      containerId,
      views: [...model.allViewDescriptors],
    });
  }

  /** 获取容器全部已注册 view（含不可见的）。对标 VS Code IViewsRegistry.getViews */
  getViews(containerId: string): ViewDescriptor[] {
    // 懒加载持久化排序
    if (!this._restoredOrder.has(containerId)) {
      this._restoredOrder.add(containerId);
      this.loadViewOrder(containerId);
    }
    const model = this._models.get(containerId);
    if (!model) return [];
    return [...model.allViewDescriptors].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  private _restoredOrder = new Set<string>();

  /** 获取容器当前可见的 view。对标 VS Code ViewContainerModel.activeViewDescriptors */
  getActiveViews(containerId: string): ViewDescriptor[] {
    // 懒加载持久化排序——首次访问此容器时恢复
    if (!this._restoredOrder.has(containerId)) {
      this._restoredOrder.add(containerId);
      this.loadViewOrder(containerId);
    }
    // 🔥 Bug 4 防线——空容器返回 [] 不抛错
    const model = this._models.get(containerId);
    if (!model) return [];
    return model.activeViewDescriptors;
  }

  /** 按 view id 查找。对标 VS Code IViewsRegistry.getView */
  getView(id: string): ViewDescriptor | undefined {
    const containerId = this._viewIndex.get(id);
    if (!containerId) return undefined;
    const model = this._models.get(containerId);
    if (!model) return undefined;
    return model.allViewDescriptors.find((v) => v.id === id);
  }

  /* ═══ E4V#44 View 空状态占位内容 ═══ */

  /** 注册 view 的空状态占位内容。对标 VS Code IViewContentDescriptor。
   *  view 无数据时（when 条件匹配）→ 壳渲染此 content 替代 view.render()。 */
  registerViewEmptyContent(containerId: string, viewId: string, content: React.ReactNode, when?: string): void {
    this._emptyContents.set(viewId, { containerId, viewId, content, when });
  }

  /** 获取 view 的空状态占位内容，无注册返回 undefined */
  getViewEmptyContent(viewId: string): ViewEmptyContentDescriptor | undefined {
    return this._emptyContents.get(viewId);
  }

  /* ═══ E4V#46 View 折叠持久化 ═══ */

  /** 加载持久化的折叠状态 */
  loadCollapsedState(): Set<string> {
    const saved = getPluginStateValue<string[]>(APP_PLUGIN_ID, "collapsedViews") ?? [];
    return new Set(saved);
  }

  /** 保存单个 view 折叠状态 */
  setCollapsed(viewId: string, collapsed: boolean): void {
    const saved = this.loadCollapsedState();
    if (collapsed) saved.add(viewId);
    else saved.delete(viewId);
    setPluginStateValue(APP_PLUGIN_ID, "collapsedViews", [...saved]).catch(() => {});
  }

  /** 查询 view 是否持久化为折叠 */
  isCollapsed(viewId: string): boolean {
    return this.loadCollapsedState().has(viewId);
  }

  /** 折叠状态版本号——resetCollapsedState 时递增 → SectionStack 用 key={version} 强制 remount SidebarSection */
  private _collapseVersion = 0;

  get collapseVersion(): number { return this._collapseVersion; }

  /** E4V#46——一键清除全部折叠持久化 */
  resetCollapsedState(): void {
    console.log("[resetCollapsedState] ★ CALLED");
    setPluginStateValue(APP_PLUGIN_ID, "collapsedViews", []).catch(() => {});
    this._collapseVersion++;
    console.log("[resetCollapsedState] collapseVersion =", this._collapseVersion, "models:", [...this._models.keys()]);
    for (const [containerId] of this._models) {
      console.log("[resetCollapsedState] _updateActiveViews for", containerId);
      this._updateActiveViews(containerId);
    }
  }

  /** 🔥 onDidChangeActiveViews 订阅计数——被谁订阅 */
  get _activeViewsSubCount(): number {
    return (this.onDidChangeActiveViews as any)._listeners?.length ?? -1;
  }

  /* ═══ 可见性 ═══ */

  /** 设置 view 可见性（用户手动切换或 when 条件变化）。
   *  对标 VS Code ViewContainerModel.setVisible */
  setVisible(containerId: string, viewId: string, visible: boolean): void {
    const model = this._models.get(containerId);
    if (!model) return;
    model.setVisible(viewId, visible);
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
    (view as any).order = maxOrder + 1;
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
    model.allViewDescriptors.forEach((v, i) => { (v as any).order = i; });
    // 持久化——按 container 存 viewOrder
    const viewOrder = model.allViewDescriptors.map(v => v.id);
    setPluginStateValue(APP_PLUGIN_ID, `viewOrder.${containerId}`, viewOrder).catch(() => {});
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
    model.allViewDescriptors.forEach((v, i) => { (v as any).order = i; });
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
        // 清理 view 索引
        for (const v of removed) {
          this._viewIndex.delete(v.id);
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
      const model = new ViewContainerModel();
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

// E4V#46——一键重置侧栏布局：清空折叠持久化 → 回到 plugin.json 默认
registerOnApply("workbench.resetSidebarLayout", () => {
  ViewContainerService.resetCollapsedState();
});
