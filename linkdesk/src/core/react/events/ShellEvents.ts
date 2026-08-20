/**
 * ShellEvents 类型系统——壳内通信唯一类型定义。
 *
 * 🔥 新 AI 必读：这是 LinkDesk 的通信契约，单一真相源。
 *   新插件需要新通信 → 在这里的 EventPayloadMap 加一行 → tsc 自动检查 emit/on 签名。
 *   三步流程：
 *     1. 在此文件的 EventPayloadMap 加类型定义
 *     2. 发送方调 shellEvents.emit("新事件", payload)
 *     3. 接收方调 shellEvents.on("新事件", callback)
 *   不改壳架构，不加分支代码。这是正常开发流程，不是 hack。
 *   详见 docs/03-插件制造/07-插件间通信.md §九
 *
 * E5#1a：壳内四个区域（IconBar / SidePanel / MainContent / StatusBar）
 * 只通过这张表通信——不 import 对方。
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
  /** 侧栏折叠/展开请求——两个生产者归一到一个真相源：
   *  ① 池 ◀/▶ 按钮（usePoolSync 转发）② 壳命令 workbench.action.toggleSidebarVisibility（Ctrl+B）。
   *  App 侧栏宿主状态机 doCollapse 执行（E5.7#10 三条折叠路径之一）。无 payload。 */
  "sidebar:toggle": void;
  /** 底部面板显隐切换请求（E5.8#31）——生产方 = 壳命令 workbench.action.togglePanel（Ctrl+J）。
   *  App usePanelHost 消费：翻转 panelVisible + 立即落盘 layout.json。无 payload。 */
  "panel:toggle": void;
  /** 底部面板视图聚焦请求（E5.8#34.5 panel.reveal 通用 API）——生产方 = IpcBridgeHandler/panel 域
   *  （插件 linkdesk.panel.reveal(viewId)）。App usePanelReveal 消费：面板隐藏则展开 +
   *  切到该视图 + 隐藏视图恢复可见。payload = 目标 viewId。无贡献插件时消费方 no-op。 */
  "panel:reveal": { viewId: string };
  /** 底部面板视图升级主区标签页请求（E5.8#35.5 panel.moveToEditor 通用 API）——生产方 = IpcBridgeHandler/panel 域
   *  （插件 linkdesk.panel.moveToEditor(viewId)）+ 池 PanelZone 右键「移至主区标签页」（面板视图 tab 右键）。
   *  App usePanelMoveToEditor 消费：createTab 活动 group 尾部 + 面板内移除（setVisible false 落盘）。
   *  payload = 目标 viewId。无贡献插件时消费方 no-op。 */
  "panel:moveToEditor": { viewId: string };

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

  // ── TabActions 桥接（E5#5e-ii-f fix：SidePanel 中插件通过 TabActionsContext 调标签页操作）──
  "tab:create": { type: string; opts?: Record<string, unknown> };
  "tab:openOrFocus": { type: string; opts?: Record<string, unknown> };
  "tab:focus": { tabId: string };
  "tab:close": { tabId: string };
  "tab:focusBySourceId": { sourceId: string };
  "tab:updateLabelBySourceId": { sourceId: string; label: string };
  "tab:closeBySourceId": { sourceId: string };

  // ── 编辑器（跨文件跳转）──
  /** F12/跨文件跳转——目标编辑器消费 pendingReveal。不依赖 isActive 变化 */
  "editor:revealRequested": { filePath: string };

  // ── 视图容器（E5#44c shellMenus 提供方 → E5#60 SidePanel 消费方）──
  "view:toggleCollapse": { containerId: string };
  "view:resetPosition": { containerId: string };
  "view:toggleVisibility": { viewId: string; containerId?: string };
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
 *
 * E5#1b：类型安全 emit/on。
 * E5#1c：dev 模式事件追踪 + 防重入 guard（Bug E5-1c）。
 */
export class ShellEventBus {
  // E5.7#98：异质事件表——每键 payload 类型不同，存 unknown 兜底（订阅处按事件键窄化）
  private _emitters = new Map<string, Emitter<unknown>>();
  /** 🛡️ 防重入——同一事件正在处理中时跳过，防死循环（Bug E5-1c） */
  private _processing = new Set<string>();
  /** 🛡️ E5#7h5：事件缓冲——emit 早于 on 时缓存，新订阅者回放最近一次 payload */
  private _buffer = new Map<string, unknown>();

  /** 发送事件。tsc 检查 payload 类型。🛡️ 同事件防重入——handler 内 emit 同事件 → 跳过。 */
  emit<K extends keyof ShellEvents>(event: K, payload: ShellEvents[K]): void {
    if (this._processing.has(event)) return;
    // 始终缓存——即使当前无订阅者，后来的 on 也能回放
    this._buffer.set(event, payload);
    this._processing.add(event);
    try {
      const emitter = this._emitters.get(event);
      if (!emitter) return;

      if (process.env.NODE_ENV === "development") {
        const start = performance.now();
        emitter.fire(payload);
        const elapsed = (performance.now() - start).toFixed(1);
        const payloadStr = typeof payload === "object" ? JSON.stringify(payload) : String(payload);
        console.log(`[ShellEvents] emit "${event}" → ${payloadStr} (${elapsed}ms)`);
      } else {
        emitter.fire(payload);
      }
    } finally {
      this._processing.delete(event);
    }
  }

  /**
   * 订阅事件。tsc 检查 handler 签名。
   * 返回 unsubscribe 函数——调用方必须在 useEffect cleanup 中调用（Bug E5-1b 防线）。
   * 🛡️ 订阅时回放缓冲区中该事件的最近一次 payload——防 emit 早于 on 的时序丢失。
   */
  on<K extends keyof ShellEvents>(
    event: K,
    handler: (payload: ShellEvents[K]) => void,
  ): () => void {
    if (!this._emitters.has(event)) {
      this._emitters.set(event, new Emitter<unknown>());
    }
    // 回放缓冲——新订阅者立即收到最近一次 emit 的值
    if (this._buffer.has(event)) {
      handler(this._buffer.get(event) as ShellEvents[K]);
    }
    // 表存 unknown 而订阅方是 ShellEvents[K]——协变缺口在唯一注册点窄化（E5.7#98）
    return this._emitters.get(event)!.event(handler as (data: unknown) => void);
  }

  /** 移除某个事件的所有订阅者 */
  dispose(event: keyof ShellEvents): void {
    const emitter = this._emitters.get(event);
    if (emitter) {
      emitter.dispose();
    }
    this._emitters.delete(event);
    this._buffer.delete(event);
  }
}

/** 全局单例——壳内通信唯一枢纽（E5#2b） */
export const shellEvents = new ShellEventBus();
