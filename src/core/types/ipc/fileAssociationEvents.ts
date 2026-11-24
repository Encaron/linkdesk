/**
 * 文件关联域的**广播事件名**（2026-11-24 A6）。
 *
 * 与 `IPC.fileAssociation.*`（invoke 通道）分开：本名走 `window.linkdesk.events.emit` →
 * `plugin:push` 分发，池侧 `events.on` 订阅；没有 `ipcMain.handle` 登记。
 * 壳写入覆盖表后发一次，池 preload 收到即重读 `fileAssociation.getOverrides()`（推归一化快照，
 * ⛔ 不把宿主配置键/原始表形状漏给插件）。
 */
export const FILE_ASSOCIATION_OVERRIDES_CHANGED = "fileAssociation:overridesChanged";
