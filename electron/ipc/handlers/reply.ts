/**
 * IPC 回执信封的失败构造（Block 3a/3b 共用）——Electron `invoke` 只保留 message，
 * code/hint/details 必须自己带（与 T14 返回式错误同一理由）。
 */

import type { DeviceReply } from '../../../src/core/types/ipc/device';

export function failReply(e: unknown, fallback = 'EDEVICE'): DeviceReply<never> {
  const err = e as { code?: unknown; message?: unknown; hint?: unknown; details?: unknown };
  return {
    ok: false,
    code: typeof err?.code === 'string' && err.code ? err.code : fallback,
    message: e instanceof Error ? e.message : String(e),
    ...(typeof err?.hint === 'string' && err.hint ? { hint: err.hint } : {}),
    ...(err?.details !== undefined ? { details: err.details } : {}),
  };
}
