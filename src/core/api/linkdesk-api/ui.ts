/**
 * linkdesk-api UI 域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9c）。
 * notifications/menu/contextKey/dialog/quickPick/quickPickHost/toast/dialogHost 八命名空间面 verbatim。
 * 依赖方向：ui → ./types（MenuItemDescriptor/NotificationHandle）+ types/ipc|pool + MenuRegistry；被聚合器交叉组装。
 */

import type { MenuItemDescriptor, NotificationHandle } from "./types";
import type { DialogOpenOptions } from "../../types/ipc/dialogs";
import type { ManifestMenuItem } from "../../registry/commands/MenuRegistry";
import type { PoolToastData } from "../../types/pool/poolToast";
import type { PoolQuickPickData, PluginQuickPickOptions, PluginQuickPickRequest } from "../../types/pool/poolQuickPick";
import type { PoolDialogData } from "../../types/pool/poolDialog";
import type { PoolFloatingPanelData } from "../../types/pool/poolFloatingPanel";

/** UI 浮层/菜单/通知命名空间面——对标 VS Code vscode.window + ContextKey + 池内 QuickPick/Toast/Dialog 宿主桥 */
export interface UiAPI {
  /** 通知——插件弹出壳侧 toast，对标 VS Code vscode.window.showInformationMessage */
  notifications: {
    /** 弹出通知。progress=true 时返回 ProgressHandle（含 update/finish/cancel） */
    show(message: string, options?: { type?: "info" | "warning" | "error"; progress?: boolean }): Promise<NotificationHandle | undefined>;
  };

  /** E5#69：菜单——插件声明式读写 */
  menu: {
    registerItems(menuId: string, pluginId: string, items: ManifestMenuItem[]): Promise<void>;
    getItems(menuId: string, context?: Record<string, unknown>): Promise<MenuItemDescriptor[]>;
  };

  /** E5#70：ContextKey——插件 SET 状态供壳 when 子句读 */
  contextKey: {
    set(key: string, value: unknown): Promise<void>;
    _getValue?(key: string): unknown;
  };

  /** E5#67：弹窗——确认/提示/文件选择 */
  dialog: {
    confirm(message: string): Promise<boolean>;
    alert(message: string): Promise<void>;
    /** 文件/目录选择器——对标 Tauri dialog.open（E5.7#73：openFile 为插件侧规范名，本方法保留给既有消费方） */
    open(opts?: DialogOpenOptions): Promise<string | null>;
    /** 打开文件选择器——返回用户选中路径，取消 → null。安全由主进程控制 */
    openFile(opts?: DialogOpenOptions): Promise<string | null>;
  };

  /** E5.7#63：插件 quickPick 选择器——池内本地桥（零 IPC，QuickPickHost 渲染）。结算 null → undefined */
  quickPick: {
    show(opts: PluginQuickPickOptions): Promise<unknown>;
  };

  /** E5.7#63：QuickPick 宿主渲染桥——池 QuickPickHost 消费（壳 preload 无此面） */
  quickPickHost: {
    registerHost(fn: (req: PluginQuickPickRequest, settle: (key: string | null) => void) => void): () => void;
    onShow(cb: (data: PoolQuickPickData) => void): () => void;
    select(key: string): void;
    highlight(key: string): void;
    close(): void;
    itemAction(key: string, actionId: string): void;
  };

  /** E5.7#16：Toast 哑渲染订阅——池 ToastHost 消费（壳 preload 无此面） */
  toast: {
    onShow(cb: (data: PoolToastData) => void): () => void;
    dismiss(id: string): void;
    action(id: string, actionId: string): void;
  };

  /** E5.7#17：Dialog 哑渲染订阅——池 DialogHost 消费（壳 preload 无此面）。命名 dialogHost——
   * dialog 命名空间已是插件侧 confirm/alert/open API */
  dialogHost: {
    onShow(cb: (data: PoolDialogData) => void): () => void;
    confirm(): void;
    cancel(): void;
  };

  /** E5.8#37（Phase 8 类型 B）：悬浮面板哑渲染订阅——池 FloatingPanelHost 消费（壳 preload 无此面）。
   * 命名 floatingPanelHost——面板请求 API（panel.revealFloating）归 PanelAPI，宿主渲染桥归本面 */
  floatingPanelHost: {
    onShow(cb: (data: PoolFloatingPanelData) => void): () => void;
    /** 动作回传——open-in（在主窗口中打开）/ close，壳侧 settle（业务语义壳侧重解析） */
    action(actionId: string): void;
  };
}
