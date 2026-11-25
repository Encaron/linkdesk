/**
 * 设备会话 wire 契约（Block 3a）——壳 ⇄ preload 的公共形状。
 *
 * 规格：`docs/04-软件更新/待抉择池/通用能力底盘/03-设备会话共享契约.md §八`。
 * ⛔ 字段语义只在 03 §8.2 定义；本文件只是可序列化副本（preload/main/API 三端同源）。
 */

/** 会话状态四字段（⊕ 两个 id）——`devicePresent:null` = transport 探不了（⛔ 当 false） */
export interface DeviceSessionState {
  deviceKey: string;
  open: boolean;
  devicePresent: boolean | null;
  stale: boolean;
  ownerSessionId: string | null;
  sessionId?: string;
}

export interface DeviceAcquireConfig {
  deviceKey: string;
  /** transport 标识：`serial`（首个）/ `tcp`（验收用） */
  transport: string;
  /** 插件自声明（主进程无法从 sender 识别插件——与 serial ownerPluginId 同口径） */
  ownerPluginId: string;
  params?: Record<string, unknown>;
}

/** preload 层回执信封：错误带可判读码（⛔ 让跨 IPC 只剩一句中文） */
export type DeviceReply<T> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string; hint?: string; details?: unknown };
