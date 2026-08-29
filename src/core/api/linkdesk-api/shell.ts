/**
 * linkdesk-api 壳侧/池控制域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9d）。
 * bridge/pool/window/shell/hotExit/getFilePath 六命名空间面 verbatim（E5.8#22 审视 N1 修正：
 * 双端注入面 = 必选；唯一真壳独有 bridge + 唯一池侧独有 hotExit 保留 `?` 可选）。
 * 依赖方向：shell → types/ipc（bridge/poolActions）+ types/pool（poolLayout）；被聚合器交叉组装。
 */

import type { BridgeRequestPayload } from "../../types/ipc/bridge";
import type { PoolLayout, PoolTab } from "../../types/pool/poolLayout";
import type { PoolTabAction, ShellTabAction } from "../../types/ipc/tabActions";
import type { SidebarAction } from "../../types/ipc/sidebarActions";
import type { PoolQuickPickAction, PoolToastAction, PoolDialogAction, PoolFloatingPanelAction, MemoryPressureData, CreatePoolWindowRequest, PoolWindowBoundsPayload, TabBarRectsPayload, TabBarViewportRect, TabDragPositionPayload, ShellTabDragPosition, AdsorbHintPayload, AdsorbIndexPayload } from "../../types/ipc/poolActions";

/** 壳↔插件中继/池控制/窗口/壳级命令/热退出暂存命名空间面——双端注入面（bridge 真壳独有 / hotExit 池侧独有） */
export interface ShellAPI {
  /** 壳↔插件通信中继——壳 preload 独有 */
  bridge?: {
    onRequest(cb: (req: BridgeRequestPayload) => void): () => void;
    respond(requestId: string, result?: unknown, error?: string): void;
    broadcast(channel: string, payload: unknown): void;
    notifyConfigChanged(key: string, value: unknown): void;
  };

  /** 池控制——壳 preload：推送布局 + 注册池→壳动作回调；池 preload：收布局 + 发动作。双端各实现自己那半（方法级子集面，surfaces.ts） */
  pool: {
    // ── 壳侧（池 preload 无） ──
    /** E5.8#43-2：windowId 可选定向推送（缺省 'main'）——壳窗口注册表遍历按 id 推送各窗布局 */
    pushLayout(layout: PoolLayout, windowId?: string): void;
    /** E5.8#43-1 A3：回调收 windowId（主池='main'，脱出池=壳生成 id）——壳据 id 定向推该窗布局 */
    onReady(cb: (windowId: string) => void): () => void;
    toggleDevTools(): void;
    onSidebarAction(cb: (action: SidebarAction) => void): () => void;
    // E5.8#44-B：壳侧收 action = ShellTabAction（主进程按 sender 注入 sourceWindowId——#43-4 权威窗口身份）
    onTabAction(cb: (action: ShellTabAction) => void): () => void;
    // E5.8#44-B：池→壳 TabBar viewport rects 上报（吸附/释放并窗命中检测数据源）——windowId 由主进程注入
    onTabBarRects(cb: (payload: TabBarRectsPayload) => void): () => void;
    // E5.8#44-C：池→壳 拖拽位置上报（拎起后 mousemove 全程）——sourceWindowId 由主进程注入（壳排除源窗命中）
    onDragPosition(cb: (pos: ShellTabDragPosition) => void): () => void;
    // E5.8#44-C：壳→池 吸附提示（目标窗 TabBar 插入指示/清除）——windowId 壳命中解析后定向推送（#46.10 载荷带 viewport 坐标）
    pushAdsorbHint(hint: AdsorbHintPayload, windowId: string): void;
    // E5.8#46.10：池→壳 吸附插入缝隙回传（壳侧——windowId 由主进程注入，壳存吸附注册表供释放并窗精确落位）
    onAdsorbIndex(cb: (payload: AdsorbIndexPayload) => void): () => void;
    pushQuickPick(data: unknown): void;
    onQuickPickAction(cb: (action: PoolQuickPickAction) => void): () => void;
    pushToast(data: unknown): void;
    onToastAction(cb: (action: PoolToastAction) => void): () => void;
    pushDialog(data: unknown): void;
    onDialogAction(cb: (action: PoolDialogAction) => void): () => void;
    // E5.8#37（Phase 8 类型 B）：壳内悬浮面板——pushPanel 哑渲染数据 + 动作回传
    pushFloatingPanel(data: unknown): void;
    onFloatingPanelAction(cb: (action: PoolFloatingPanelAction) => void): () => void;
    onMemoryPressure(cb: (data: MemoryPressureData) => void): () => void;
    // ── E5.8#43-1（A4）：多窗口底座——壳驱动创建/关闭池窗 + 监听 OS 关窗（主进程执行窗口生命周期）──
    createWindow(opts: CreatePoolWindowRequest): void;
    closeWindow(windowId: string): void;
    onWindowClosed(cb: (windowId: string) => void): () => void;
    // ── E5.8#43-3：主→壳 池窗 bounds 变更（moved/resized 上报）——壳注册表更新 + 落盘浮窗位置（I9-14）──
    onWindowBoundsChanged(cb: (payload: PoolWindowBoundsPayload) => void): () => void;
    // ── 池侧（壳 preload 无） ──
    onLayout(cb: (layout: PoolLayout) => void): () => void;
    ready(): void;
    sidebarAction(action: SidebarAction): void;
    tabAction(action: PoolTabAction): void;
    // E5.8#44-B：池→壳 TabBar viewport rects 上报（池侧——MainZone useTabDrag 报告 getBoundingClientRect）
    tabBarRects(rects: TabBarViewportRect[]): void;
    // E5.8#44-C：池→壳 拖拽位置上报（池侧——useDragReorder 拎起后 mousemove 上报，壳吸附命中）
    dragPosition(pos: TabDragPositionPayload): void;
    // E5.8#44-C：壳→池 吸附提示订阅（池侧——MainZone 订阅目标窗 TabBar 插入指示/清除）
    onAdsorbHint(cb: (hint: AdsorbHintPayload) => void): () => void;
    // E5.8#46.10：池→壳 吸附插入缝隙回传（池侧——目标池算竖线落点后上报，壳释放并窗精确落位）
    adsorbIndex(payload: { groupId: string; insertIndex: number }): void;
    // ── E5.8#30.16（P8）：通用「beforeClose 可取消」通道（池侧）──
    // 插件注册 handler（自己定逻辑：弹确认/清理资源/返回 boolean 决定是否允许关标签页）；
    // GroupTabBar 关闭路径 `await beforeClose`——handler 返回 false（或 Promise<false>）则关闭被取消。
    registerBeforeClose(pluginId: string, handler: (tab: PoolTab) => boolean | Promise<boolean>): void;
    unregisterBeforeClose(pluginId: string): void;
    beforeClose(pluginId: string, tab: PoolTab): Promise<boolean>;
  };

  /** 窗口控制——TitleBar 按钮映射，双端注入（11 方法同通道，共享模块 electron/window-namespace.ts） */
  window: {
    minimize(): void;
    maximize(): void;
    unmaximize(): void;
    close(): void;
    /** E5.7#79：缩放因子 → 主进程 setZoomFactor(池 WCV) */
    setZoom(factor: number): void;
    toggleDevTools(): Promise<void>;
    isMaximized(): Promise<boolean>;
    onMaximizeChange(cb: (maximized: boolean) => void): () => void;
    /** E5.8#46.18：OS 级置顶（盖过其他应用）——true 置顶 / false 解除；按 sender 路由宿主窗 */
    setAlwaysOnTop(pinned: boolean): void;
    isAlwaysOnTop(): Promise<boolean>;
    onAlwaysOnTopChange(cb: (pinned: boolean) => void): () => void;
  };

  /** 壳级命令——revealInOS / openInTerminal / startDrag，双端注入 */
  shell: {
    showItemInFolder(p: string): Promise<void>;
    openInTerminal(dirPath: string, terminalExe?: string, customCommand?: string): Promise<void>;
    startDrag(filePath: string, iconPath?: string): void;
  };

  /** 热退出暂存——编辑器未保存内容落盘（E5.7#53）。`?`：池侧独有（壳 preload 不注入） */
  hotExit?: {
    save(filePath: string, content: string): Promise<void>;
    load(filePath: string): Promise<string | null>;
    clear(filePath: string): Promise<void>;
  };

  /** OS 拖入文件路径获取——双端注入 */
  getFilePath: (file: File) => string;
}
