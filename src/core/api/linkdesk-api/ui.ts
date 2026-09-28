/**
 * linkdesk-api UI 域——自 linkdesk-api.ts 拆出（E5.8#0d.10-9c）。
 * notifications/menu/contextKey/dialog/quickPick/quickPickHost/dialogHost/floatingPanelHost 八命名空间面 verbatim。
 * 依赖方向：ui → ./types（MenuItemDescriptor/NotificationHandle）+ types/ipc|pool + MenuRegistry；被聚合器交叉组装。
 */

import type { MenuItemDescriptor, NotificationHandle, PluginToastAction } from "./types";
import type { DialogOpenOptions, DialogContentOpenOptions } from "../../types/ipc/dialogs"; // E6#71c 富内容确认参数
import type { ManifestMenuItem } from "../../registry/commands/MenuRegistry";
import type { PoolQuickPickData, PluginQuickPickOptions, PluginQuickPickRequest } from "../../types/pool/poolQuickPick";
import type { PoolDialogData, PoolPendingDialog } from "../../types/pool/poolDialog";
import type { PoolFloatingPanelData } from "../../types/pool/poolFloatingPanel";
import type { NotifLayout } from "../../types/pool/poolLayout"; // M1 AI#1：读取面返回 = 面板 DTO 本身

/** UI 浮层/菜单/通知命名空间面——对标 VS Code vscode.window + ContextKey + 池内 QuickPick/Dialog/FloatingPanel 宿主桥 */
export interface UiAPI {
  /** 通知——插件弹通知（E6#72：唯一通知面 = 铃铛宽通知面板，右下窄卡链路已整删），对标 VS Code vscode.window.showInformationMessage */
  notifications: {
    /** 弹出通知，**一律返回句柄**（含 update/finish/cancel）——E6#73f（S6）句柄隔离：
     *  此前只在 progress:true 时返回句柄 ⇒ persistent 的失败通知（带 [重试]）撤不下来，
     *  用户手动重试成功后那条「安装失败」仍长驻，面板变成失败墙（18 档 A3/E4）。
     *  ⇒ 一条通知只能被**创建它的那个句柄**更新/删除，不管它是不是进度条。
     *  E6#13.5：options.actions 带主动作按钮——点击走壳 executeCommand(action.command, action.args)，
     *  命令 handler 插件自注册。不传 actions → 无按钮（现状）。error 类自动停留 8s。
     *  E6#71j：options.persistent=true 长驻通知——不自动消失、等用户手动点 ×（错误诊断类用）;
     *  常驻上限**按来源分桶**各 5 条（E6#73f S3），超出顶掉同来源最老的并给汇总提示 */
    show(message: string, options?: {
      type?: "info" | "warning" | "error";
      /** true → 进度通知：update 可带 0-100 百分比驱动真进度条（E6#71i） */
      progress?: boolean;
      /** true → 长驻通知：不自动消失（E6#71j）；错误诊断/需用户决定的场景用 */
      persistent?: boolean;
      actions?: PluginToastAction[];
      /** E6#73g（S5）生产者身份 id——**机器读的归属键，不含人类文案**（人类可读名由壳解析）。
       *  面板**按来源分组**、每组各 5 条常驻配额都以此为键；不传 → 全落「其他」组。
       *  插件传自己的插件 id；壳自身域用 `app.<域>`（如 `app.update`）。
       *  ⚠️ **做不到自动注入**——池是单进程共享 realm，所有插件共用同一个 `window.linkdesk`，
       *  preload 无从知道「这次 show() 是哪个插件的树发的」⇒ **只能作者显式报**。
       *  ⚠️ 老插件不填就仍然全落「其他」组：这是**新契约**，要作者重新发布才生效。 */
      source?: string;
    }): Promise<NotificationHandle>;

    /**
     * M1 `AI#1`：**只读列举**——面板里现在有什么（条数 / 未读 / 每条内容与按钮 / 唤醒与存活判据）。
     *
     * 🔴 为什么必须是这一个形状：返回的就是**铃铛宽面板的 DTO 本体**（`NotifLayout`，与
     * `pool.onLayout` 的 `statusBar.notif` 同一个 `buildNotif(t)` 产出）——**不是**另算一份摘要。
     * 两把尺子必然打架：AI 读到的分组/未读/文案若与屏幕上画的不同，读取面就成了假信息源。
     * 设计原文（M1 路线 B）也承认布局快照里**已在推**这份数据，只是「没开门」；本方法就是那扇门，
     * 而门后接的仍是同一份实现（⛔ 不 fork 第二把尺）。
     *
     * ⚠️ **脱出窗也拿得到**：本方法经 `plugins:call` 问**壳**（壳持全量状态），不读本窗那份布局子集
     * ——脱出窗的 `statusBar` 是策略表裁掉的，走布局就会答「没有通知」。
     *
     * ⚠️ 文案类字段（`bellTitle`/`panelTitle`/分组 label/`timeLabel`…）**已由壳按当前语言 `t()` 解析**，
     * 调用方原样显示即可（显示文本铁律）。
     */
    list(): Promise<NotifLayout>;

    /**
     * M1 `AI#1`：**变更订阅**——通知面（新增/更新/收掉/认账/面板开合）有变化就回调。
     *
     * 🔴 **信号无载荷**：回调**不带**快照——带了就等于把「数据」从第二条路推一遍，池侧便会有人直接
     * 用信号里的数据、而不去问权威（`list()`），于是又长出第二把尺。本订阅只回答
     * 「**现在变了**」，要答案请 `list()`（与 `watchFile`/`events.on` 那套「状态推流 + 按需拉」
     * 的分工一致）。
     *
     * 传输 = 壳 `events.emit("notif:changed")` → 主进程广播 → 池 `events.on`（**无新增 IPC 通道**，
     * 命名空间矩阵 §3 通道计数不动）。⚠️ 广播默认存 payload 供新池重放 ⇒ 新起的池可能收到一条
     * 「陈旧的变更信号」——本订阅是幂等重取语义（收到就 `list()`），无害。
     *
     * @returns 退订函数
     */
    subscribe(cb: () => void): () => void;
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
    /** E6#71c：富内容确认——确认框内容 = 插件自绘视图（content 视图声明寻址 + 不透明 payload）。
     *  弹窗机制同 confirm（居中/遮罩/Esc/焦点锁/点遮罩取消）；内容排版与按钮由插件视图自画
     *  （对标 VS Code「对话框是壳、内容插件定」）。title/message 兜底——content 视图解析
     *  失败时壳回落纯文字确认（弹窗仍出，不静默死）。返回 true = 确认，false = 取消/关闭。 */
    confirmContent(options: DialogContentOpenOptions): Promise<boolean>;
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

  /** E5.7#17：Dialog 哑渲染订阅——池 DialogHost 消费（壳 preload 无此面）。命名 dialogHost——
   * dialog 命名空间已是插件侧 confirm/alert/open API */
  dialogHost: {
    onShow(cb: (data: PoolDialogData) => void): () => void;
    /** E6#71c：当前打开的 Dialog 数据——富内容视图挂载后经 dialogHost.current()?.content?.payload
     *  取数（content 模式才可读；无打开/已关闭 → null）。壳 preload 无此面（池内本地读）。 */
    current(): PoolDialogData | null;
    /**
     * M1 `AI#5`：**在途弹窗清单**——「有没有 confirm/alert 正弹着、在等什么」。
     *
     * 与 `current()` 的分工：`current()` 读的是**本进程收到的哑渲染数据**（`open:false` 即已关；
     * 内容已按池要画的形态给全）；`pending()` 读的是**壳侧 DialogService 的在途请求**
     * （`options` 原形 + `kind` + 按钮文案）——两个面问的是同一件事的不同切面，
     * 故**都留着**：`pending()` 多给出「这是谁问的 / 富内容视图的 pluginId+viewId / 按钮有几条」。
     *
     * 🔴 **单槽是现状的诚实描述，不是设计目标**：壳→池弹窗链路（`src/App/bridges.ts` 的 `pending`）
     * 同一时刻只承载一条，第二次 `confirm` 会覆盖前一条的 settle 闭包（那条 Promise 永不结算——
     * **既有缺陷**）。M1 只做「读得到」，**不改 Promise 语义** ⇒ 本方法如实报「最后打开的那一条」。
     * 空数组 = 此刻没有弹窗。
     *
     * ⚠️ 富内容确认（E6#71c）模式下**按钮由插件视图自画**，壳不知道有几条 ⇒
     * `buttons` 为空数组、`content` 给出视图身份——⛔ 不要拿「确定/取消」去猜（编数据）。
     *
     * ⚠️ `buttons` 的**序 = 声明序**（`resolveDialogButtons` 恒为 `[确认, 取消]`），**不是屏幕上的左右位**
     * ——2026-09-28 CDP 实证：屏幕上次按钮画左、主按钮画右，本数组恒确认在前。
     * 想动手就按序号调 `confirm()` / `cancel()`，⛔ 别拿视觉位置对号入座。
     */
    pending(): Promise<PoolPendingDialog[]>;
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
