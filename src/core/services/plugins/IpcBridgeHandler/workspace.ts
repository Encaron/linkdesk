/**
 * IpcBridgeHandler 工作区/视图容器域——自 IpcBridgeHandler.ts 拆出（E5.8#0d.10-10d）。
 * workspace 六 channel + viewContainer 四 channel + toViewDto（ViewDescriptor → 可序列化 DTO）
 * + 三订阅（_workspaceUnsub/_workspaceActiveUnsub/_viewsUnsub 属主）verbatim。
 * 依赖方向：workspace → WorkspaceService/ViewContainerService + linkdesk-api（LinkDeskAPI 订阅类型）；被聚合器委派。
 */

import {
  getWorkspaceFolders, getActiveWorkspace, onDidChangeFolders, setActiveWorkspace,
  openFolder, addFolder, removeFolder, onDidChangeActiveWorkspace,
} from "../../layout/WorkspaceService"; // E5#85 + E5.6#11.5-A
import { ViewContainerService, type ViewDescriptor } from "../../layout/ViewContainerService"; // E5.6#19e
import type { LinkDeskAPI } from "../../../api/linkdesk-api";

let _workspaceUnsub: (() => void) | null = null; // E5.5#7 Bug B fix：工作区变更广播
let _workspaceActiveUnsub: (() => void) | null = null; // E5.6#11.5-A：活跃工作区变更广播
let _viewsUnsub: (() => void) | null = null; // E5.6#19e：ViewContainerService 视图变更广播

/**
 * E5.7#58：ViewDescriptor → 可序列化 DTO——剥 render/actions/pinnedContent（函数/React 节点，
 * IPC 结构化克隆拒绝）+ _pluginId/_renderPath（注册表内部标记，非插件 API 面）。
 * 与 preload-pool 的 viewContainer 写方向白名单同一套公开字段对齐（读方向）。
 */
export function toViewDto(v: ViewDescriptor): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 内部标记字段剥壳
  const { render: _render, actions: _actions, pinnedContent: _pinned, _pluginId: _pid, _renderPath: _rp, ...pub } = v as any;
  return pub;
}

// ── 工作区变更广播──

export function subscribeWorkspace(linkdesk: LinkDeskAPI): void {
  // E5.5#7 Bug B fix：工作区变更广播——编辑器 TS 影子 model 需重扫
  _workspaceUnsub = onDidChangeFolders(() => {
    try { linkdesk.events?.emit("workspace:changed", {}); } catch { /* 静默 */ }
  });
  // E5.6#11.5-A：活跃工作区变更广播——池插件订阅 onDidChangeActiveWorkspace
  _workspaceActiveUnsub = onDidChangeActiveWorkspace((uri) => {
    try { linkdesk.events?.emit("workspace:activeChanged", { uri }); } catch { /* 静默 */ }
  });
}

export function unsubscribeWorkspace(): void {
  _workspaceUnsub?.();
  _workspaceUnsub = null;
  _workspaceActiveUnsub?.();
  _workspaceActiveUnsub = null;
}

// ── ViewContainerService 视图变更广播──

export function subscribeViews(linkdesk: LinkDeskAPI): void {
  // E5.6#19e：ViewContainerService 视图变更广播——池侧市场/文件树感知视图注册/卸载
  // E5.7#58 修复：① 通道名改 camelCase——与 marketplace 订阅 "viewContainer:changed" 对齐
  // （连字符版自 #19e 落地起订阅方零触发）；② payload 走 toViewDto——剥 render/actions/
  // pinnedContent + 内部标记（原实现只剥 render，未来 actions 含 React 节点时 events.emit
  // 的 IPC 结构化克隆会抛 DataCloneError）
  _viewsUnsub = ViewContainerService.onDidChangeViews.event(({ containerId, views }) => {
    try { linkdesk.events?.emit("viewContainer:changed", { containerId, views: views.map(toViewDto) }); } catch { /* 静默 */ }
  });
}

export function unsubscribeViews(): void {
  _viewsUnsub?.();
  _viewsUnsub = null;
}

/** workspace:* 六 channel 处理器 */
export async function handleWorkspaceChannel(channel: string, args: unknown[]): Promise<unknown> {
  switch (channel) {
    // ── E5#85：workspace——插件查询工作区信息 ──
    case "workspace:getFolders":
      return getWorkspaceFolders();
    case "workspace:getActive":
      return getActiveWorkspace();
    // ── E5.6#11.5-A：扩展 workspace——池插件写工作区操作 ──
    case "workspace:setActive": {
      const [uri] = args as [string];
      setActiveWorkspace(uri);
      // 广播到所有 Pool——池插件订阅 onDidChangeActiveWorkspace
      try { window.linkdesk?.events?.emit("workspace:activeChanged", { uri }); } catch { /* 静默 */ }
      break;
    }
    case "workspace:openFolder":
      await openFolder();
      break;
    case "workspace:addFolder": {
      const [path] = args as [string];
      addFolder(path);
      break;
    }
    case "workspace:removeFolder": {
      const [path] = args as [string];
      removeFolder(path);
      break;
    }
    default:
      throw new Error(`未知的 bridge channel: ${channel}`);
  }
}

/** viewContainer:* 四 channel 处理器 */
export async function handleViewContainerChannel(channel: string, args: unknown[]): Promise<unknown> {
  switch (channel) {
    // ── E5.7#58：viewContainer——池插件查询/更新壳侧视图注册表（元数据 DTO）──
    case "viewContainer:getContainer": {
      const [id] = args as [string];
      return ViewContainerService.getViewContainer(id);
    }
    case "viewContainer:getViews": {
      const [containerId] = args as [string];
      return ViewContainerService.getViews(containerId).map(toViewDto);
    }
    case "viewContainer:getView": {
      // E5.8#41.9.2：IPC 链加 pluginId（#41.8 §4 调用方 #2 方案 A）——复合键精确寻址，避免裸 id 歧义
      const [pluginId, viewId] = args as [string, string];
      const view = ViewContainerService.getView(pluginId, viewId);
      return view ? toViewDto(view) : undefined;
    }
    case "viewContainer:registerView": {
      // 池侧 preload 已白名单剥壳（render/actions/pinnedContent 不可过 invoke）——
      // 到达此处的 DTO 只有公开元数据。壳侧注册表对缺 render 的更新保留原 render
      // （ViewContainerService.registerView 内置逻辑）——元数据更新语义，渲染组件不受影响。
      const [pluginId, containerId, descriptor] = args as [string, string, Record<string, unknown>];
      ViewContainerService.registerView(pluginId, containerId, descriptor as unknown as ViewDescriptor);
      break;
    }
    default:
      throw new Error(`未知的 bridge channel: ${channel}`);
  }
}
