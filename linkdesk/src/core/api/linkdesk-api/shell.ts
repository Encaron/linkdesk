/**
 * linkdesk-api 壳侧/池控制域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9d）。
 * bridge/pool/window/shell/hotExit/getFilePath 六命名空间面 verbatim（E5.8#22 审视 N1 修正：
 * 双端注入面 = 必选；唯一真壳独有 bridge + 唯一池侧独有 hotExit 保留 `?` 可选）。
 * 依赖方向：shell → types/ipc（bridge/poolActions）+ types/pool（poolLayout）；被聚合器交叉组装。
 */

import type { BridgeRequestPayload } from "../../types/ipc/bridge";
import type { PoolLayout, PoolTab } from "../../types/pool/poolLayout";
import type { PoolTabAction } from "../../types/ipc/tabActions";
import type { SidebarAction } from "../../types/ipc/sidebarActions";
import type { PoolQuickPickAction, PoolToastAction, PoolDialogAction, MemoryPressureData } from "../../types/ipc/poolActions";

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
    pushLayout(layout: PoolLayout): void;
    onReady(cb: () => void): () => void;
    toggleDevTools(): void;
    onSidebarAction(cb: (action: SidebarAction) => void): () => void;
    onTabAction(cb: (action: PoolTabAction) => void): () => void;
    pushQuickPick(data: unknown): void;
    onQuickPickAction(cb: (action: PoolQuickPickAction) => void): () => void;
    pushToast(data: unknown): void;
    onToastAction(cb: (action: PoolToastAction) => void): () => void;
    pushDialog(data: unknown): void;
    onDialogAction(cb: (action: PoolDialogAction) => void): () => void;
    onMemoryPressure(cb: (data: MemoryPressureData) => void): () => void;
    // ── 池侧（壳 preload 无） ──
    onLayout(cb: (layout: PoolLayout) => void): () => void;
    ready(): void;
    sidebarAction(action: SidebarAction): void;
    tabAction(action: PoolTabAction): void;
    // ── E5.8#30.16（P8）：通用「beforeClose 可取消」通道（池侧）──
    // 插件注册 handler（自己定逻辑：弹确认/清理资源/返回 boolean 决定是否允许关标签页）；
    // GroupTabBar 关闭路径 `await beforeClose`——handler 返回 false（或 Promise<false>）则关闭被取消。
    registerBeforeClose(pluginId: string, handler: (tab: PoolTab) => boolean | Promise<boolean>): void;
    unregisterBeforeClose(pluginId: string): void;
    beforeClose(pluginId: string, tab: PoolTab): Promise<boolean>;
  };

  /** 窗口控制——TitleBar 按钮映射，双端注入（8 方法同通道，共享模块 electron/window-namespace.ts） */
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
