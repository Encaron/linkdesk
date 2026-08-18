/**
 * Pool preload viewContainer 域——DTO 白名单 + toViewMetaDto 剥壳 + viewContainer 命名空间。
 * E5.8#0d.10-4c：自 preload-pool.ts 拆出——池侧真 IPC（问壳侧 ViewContainerService 注册表），
 * 写方向白名单剥 render/actions/pinnedContent 函数字段（invoke 结构化克隆抛 DataCloneError）。
 * 依赖方向：viewcontainer → electron/ipc（channels）；无 src import（构建边界，DTO 形状对齐）。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';

// DTO 形状与 src/core/services/layout/ViewContainerService.ts 的可序列化子集对齐
// ——preload 不 import src（构建边界）。字段清单与 IpcBridgeHandler.toViewDto（读方向）同一套。
type ViewContainerDtoShape = {
  id: string;
  title: string;
  icon?: string;
  location?: string;
  hideIfEmpty?: boolean;
  order?: number;
  mergeHeaderWhenSingle?: boolean;
};

type ViewDtoShape = {
  id: string;
  title: string;
  role?: string;
  when?: string;
  order?: number;
  collapsed?: boolean;
  canToggleVisibility?: boolean;
  canMoveView?: boolean;
  hideByDefault?: boolean;
  titleDescription?: string;
  singleViewPaneContainerTitle?: string;
  minHeight?: number;
  showActions?: string;
  titleTooltip?: string;
  badge?: string | number;
};

/** 写方向白名单——插件 descriptor 中可跨 IPC 的公开元数据字段（render/actions/pinnedContent
 *  是函数/React 节点——invoke 结构化克隆抛错，池侧剥掉；壳侧更新保留原 render）。 */
function toViewMetaDto(descriptor: Record<string, unknown>): Record<string, unknown> {
  return {
    id: descriptor.id,
    title: descriptor.title,
    role: descriptor.role,
    when: descriptor.when,
    order: descriptor.order,
    collapsed: descriptor.collapsed,
    canToggleVisibility: descriptor.canToggleVisibility,
    canMoveView: descriptor.canMoveView,
    hideByDefault: descriptor.hideByDefault,
    titleDescription: descriptor.titleDescription,
    singleViewPaneContainerTitle: descriptor.singleViewPaneContainerTitle,
    minHeight: descriptor.minHeight,
    showActions: descriptor.showActions,
    titleTooltip: descriptor.titleTooltip,
    badge: descriptor.badge,
  };
}

/** viewContainer 命名空间——真 IPC 查询/更新（元数据单向流：壳注册表 = 真相源 → pushLayout 推池渲染） */
export function buildViewContainer() {
  return {
    getViewContainer: (id: string): Promise<ViewContainerDtoShape | undefined> =>
      ipcRenderer.invoke(IPC.viewContainer.getContainer, id),
    getViews: (containerId: string): Promise<ViewDtoShape[]> =>
      ipcRenderer.invoke(IPC.viewContainer.getViews, containerId),
    getView: (viewId: string): Promise<ViewDtoShape | undefined> =>
      ipcRenderer.invoke(IPC.viewContainer.getView, viewId),
    registerView: (pluginId: string, containerId: string, descriptor: Record<string, unknown>): Promise<void> =>
      ipcRenderer.invoke(IPC.viewContainer.registerView, pluginId, containerId, toViewMetaDto(descriptor)),
  };
}
