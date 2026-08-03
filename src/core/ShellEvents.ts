/**
 * ShellEvents 类型系统——壳内通信唯一类型定义。
 * E5#1a：壳内四个区域（IconBar / SidePanel / MainContent / StatusBar）
 * 只通过这张表通信——不 import 对方。
 *
 * 加新事件 = 在这里加一行。tsc 自动检查所有 emit/on 的签名。
 *
 * 命名约定：`domain:action`——domain 标识事件归属（icon/sidebar/tab/statusbar/zone/workspace/file/plugin）。
 *
 * 设计依据：docs/02-Electron架构/E5_核心归一化与壳重构_待执行/01-壳通信骨架/ShellEvents类型系统.md
 */

/**
 * 壳内事件类型表。
 * key = 事件名（"namespace:camelCase"），value = payload 类型。
 */
export interface ShellEvents {
  // ── 图标栏（IconBar）──
  /** 用户点击图标栏图标。payload = pluginId */
  "icon:selected": string;
  /** 开始拖拽图标排序。payload = pluginId */
  "icon:drag-start": string;
  /** 拖拽排序完成。payload = 新 pluginId 顺序数组 */
  "icon:reordered": string[];

  // ── 侧栏（SidePanel）──
  /** 侧栏展开/折叠。payload = 是否正在打开 */
  "sidebar:toggled": boolean;
  /** 侧栏容器切换。payload = 当前活跃 containerId，null = 无活跃容器。
   *  IconBar 订阅此事件更新高亮——不需要知道具体是谁触发的切换。 */
  "sidebar:containerChanged": string | null;

  // ── 标签页（MainContent）──
  /** 标签页切换。payload = 新聚焦的标签页信息 */
  "tab:focused": { pluginId: string; tabId: string };

  // ── 状态栏（StatusBar）──
  /** 状态栏条目更新。payload = 新条目列表 */
  "statusbar:update": StatusBarEntry[];

  // ── 布局（LayoutEngine）──
  /** 壳区域大小变化。payload = 区域 ID + 新 bounds */
  "zone:resized": { zone: string; bounds: { x: number; y: number; width: number; height: number } };

  // ── 工作区（WorkspaceService）──
  /** 活跃工作区切换。payload = activeWorkspaceUri */
  "workspace:changed": string;

  // ── 外部事件（E5#54a 标签页生命周期——TabManager 集中订阅）──
  /** 文件被删除——TabManager 关闭对应标签页 */
  "file:deleted": { filePath: string };
  /** 文件被重命名——TabManager 更新标签页路径 */
  "file:renamed": { oldPath: string; newPath: string };
  /** 插件被移除——TabManager 关闭该插件的所有标签页 */
  "plugin:removed": { pluginId: string };
  /** 工作区文件夹被移除——TabManager 关闭该文件夹下的标签页 */
  "workspace:folderRemoved": { folderUri: string };
}

/** 状态栏条目类型——对标 VS Code StatusBarItem */
export interface StatusBarEntry {
  id: string;
  text: string;
  tooltip?: string;
  alignment: "left" | "right";
  priority?: number;
}

/* ── E5#1b：类型安全事件总线 ── */

import { Emitter } from "./CoreEvents";

/**
 * 类型安全的壳内事件总线。
 * 基于现有 Emitter 基础设施——不改底层，只加类型层。
 *
 * emit/on 均由 ShellEvents 接口约束——写错签名 → tsc 当场报错。
 */
export class ShellEventBus {
  private _emitters = new Map<string, Emitter<any>>();

  /** 发送事件。tsc 检查 payload 类型。 */
  emit<K extends keyof ShellEvents>(event: K, payload: ShellEvents[K]): void {
    const emitter = this._emitters.get(event);
    if (!emitter) return;
    emitter.fire(payload);
  }

  /**
   * 订阅事件。tsc 检查 handler 签名。
   * 返回 unsubscribe 函数——调用方必须在 useEffect cleanup 中调用。
   */
  on<K extends keyof ShellEvents>(
    event: K,
    handler: (payload: ShellEvents[K]) => void,
  ): () => void {
    if (!this._emitters.has(event)) {
      this._emitters.set(event, new Emitter<any>());
    }
    return this._emitters.get(event)!.event(handler);
  }
}
