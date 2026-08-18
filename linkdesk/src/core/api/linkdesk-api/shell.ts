/**
 * linkdesk-api 壳侧/池控制域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9d）。
 * bridge/pool/window/shell/hotExit/getFilePath 六命名空间面 verbatim（均为壳 preload 独有 `?` 可选面）。
 * 依赖方向：shell → types/ipc（bridge/poolActions）+ types/pool（poolLayout）；被聚合器交叉组装。
 */

import type { BridgeRequestPayload } from "../../types/ipc/bridge";
import type { PoolLayout } from "../../types/pool/poolLayout";
import type { PoolTabAction } from "../../types/ipc/tabActions";
import type { SidebarAction } from "../../types/ipc/sidebarActions";
import type { PoolQuickPickAction, PoolToastAction, PoolDialogAction, MemoryPressureData } from "../../types/ipc/poolActions";

/** 壳↔插件中继/池控制/窗口/壳级命令/热退出暂存命名空间面——壳 preload 独有面 + 池控制双端合一 */
export interface ShellAPI {
  /** 壳↔插件通信中继——壳 preload 独有 */
  bridge?: {
    onRequest(cb: (req: BridgeRequestPayload) => void): () => void;
    respond(requestId: string, result?: unknown, error?: string): void;
    broadcast(channel: string, payload: unknown): void;
    notifyConfigChanged(key: string, value: unknown): void;
  };

  /** 池控制——壳 preload：推送布局 + 注册池→壳动作回调；池 preload：收布局 + 发动作。双端合一面对齐 wire */
  pool?: {
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
  };

  /** 窗口控制——TitleBar 按钮映射，壳 preload 独有 */
  window?: {
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

  /** 壳级命令——revealInOS / openInTerminal / startDrag，壳 preload 独有 */
  shell?: {
    showItemInFolder(p: string): Promise<void>;
    openInTerminal(dirPath: string, terminalExe?: string, customCommand?: string): Promise<void>;
    startDrag(filePath: string, iconPath?: string): void;
  };

  /** 热退出暂存——编辑器未保存内容落盘（E5.7#53） */
  hotExit?: {
    save(filePath: string, content: string): Promise<void>;
    load(filePath: string): Promise<string | null>;
    clear(filePath: string): Promise<void>;
  };

  /** OS 拖入文件路径获取 */
  getFilePath?: (file: File) => string;
}
