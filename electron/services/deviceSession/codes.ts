/**
 * 宿主语义码（Block 3a 设备会话 ＋ Block 3b 事件总线）——**壳内唯一字面量来源**。
 *
 * 为什么单独一份：`EDEVICE/EBUSY/ENOSESSION/EBADARGS` 是宿主（不是插件）产生的码；
 * 03 §8.2 要求它们可判读、可测试。⛔ 在 registry/handlers/preload 各写一遍字面量。
 *
 * 与 `@linkdesk/contracts` 的 `SHELL_ERROR_CODES` 关系：那组是"壳命令面"保留码（EVIEWREQUIRED…），
 * 本组是设备会话子系统的码。后续若要升为全局保留码，由 B/C 在本表基础上并入 contracts（⛔ 反向抄）。
 */

export const DEVICE_ERROR_CODES = Object.freeze({
  /** 开设备失败 / 设备不可达 */
  DEVICE: 'EDEVICE',
  /** 属主冲突（同一 deviceKey 已有他主活会话） */
  BUSY: 'EBUSY',
  /** 未知 sessionId（已释放/进程重启） */
  NO_SESSION: 'ENOSESSION',
  /** 坏参 / 非属主操作 */
  BAD_ARGS: 'EBADARGS',
  /** 插件未声明该 transport 能力（Block 3a 能力闸） */
  CAPABILITY: 'ECAPABILITY',
  /** 事件未在 manifest 声明（Block 3b 发布鉴权） */
  EVENT_UNDECLARED: 'EEVENTUNDECLARED',
});

export type DeviceErrorCode = (typeof DEVICE_ERROR_CODES)[keyof typeof DEVICE_ERROR_CODES];

/** 构造带码错误（唯一实现——registry 与 IPC handler 共用，⛔ 各写一份） */
export function codedDeviceError(code: DeviceErrorCode, message: string, hint?: string, details?: unknown): Error & {
  code: DeviceErrorCode; hint?: string; details?: unknown;
} {
  const e = new Error(message) as Error & { code: DeviceErrorCode; hint?: string; details?: unknown };
  e.code = code;
  if (hint) e.hint = hint;
  if (details !== undefined) e.details = details;
  return e;
}
