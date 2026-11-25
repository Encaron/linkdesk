/**
 * 设备会话 IPC 处理器（Block 3a）——`device:*` 四个动作全部落到 `deviceSessions`。
 *
 * 回执一律 `{ok:true,...}` / `{ok:false,code,message,hint?,details?}` 信封：
 * Electron 的 `invoke` 只保留 Error.message，custom props（code/details）会丢；插件要可判读码
 * 就必须自己带信封（与 T14 的返回式错误同一理由）。
 *
 * 复核口径（2026-11-25 调度台四点）：
 *   ① 属主由宿主校验：recover 也验属主；池侧调用必须带 ownerPluginId（壳内 scope=host 例外）；
 *   ② 可见性：池侧 getState 只返回自己属主的会话（壳/doctor 用 scope=host 看全量）；
 *   ③ 码单源：`codes.ts`（EDEVICE/EBUSY/ENOSESSION/EBADARGS/ECAPABILITY）；
 *   ④ 能力闸：池侧 acquire 的 transport 必须在该插件声明的 `deviceTransports` 内；
 *      未声明 = 只给存量 `serial`（serial API 早已授权），`tcp` 必须显式声明。
 *
 * 规格：`docs/04-软件更新/待抉择池/通用能力底盘/03-设备会话共享契约.md §八`。
 */

import { ipcMain } from 'electron';
import { deviceSessions } from '../../services/deviceSession/index.js';
import { DEVICE_ERROR_CODES as C, codedDeviceError } from '../../services/deviceSession/codes.js';
import { createTcpTransport } from '../../services/deviceSession/tcpTransport.js';
import type { DeviceAcquireConfig, DeviceReply } from '../../../src/core/types/ipc/device';
import { isLoadedPlugin, pluginDeviceTransports } from '../../plugins/plugin-manifest-loader.js';
import { IPC } from '../channels.js';

let _registered = false;

function ok<T extends object>(extra: T): DeviceReply<T> {
  return { ok: true, ...extra };
}

function fail(e: unknown, fallback: string = C.DEVICE): DeviceReply<never> {
  const err = e as { code?: unknown; message?: unknown; hint?: unknown; details?: unknown };
  return {
    ok: false,
    code: typeof err?.code === 'string' && err.code ? err.code : fallback,
    message: e instanceof Error ? e.message : String(e),
    ...(typeof err?.hint === 'string' && err.hint ? { hint: err.hint } : {}),
    ...(err?.details !== undefined ? { details: err.details } : {}),
  };
}

/** 池侧调用必须带属主（scope=host 只有壳 preload 会带） */
function requirePoolOwner(payload: { scope?: unknown; ownerPluginId?: unknown }): string | null {
  if (payload && payload.scope === 'host') return null;
  const owner = payload && typeof payload.ownerPluginId === 'string' ? payload.ownerPluginId : '';
  if (!owner) throw codedDeviceError(C.BAD_ARGS, '池侧调用必须带 ownerPluginId（宿主据此校验属主与能力）', '见 03 §8.2');
  return owner;
}

/** ④ 能力闸：未声明的插件只保留存量 serial；tcp 等必须显式声明 */
function assertTransportCapability(owner: string, transport: string): void {
  if (owner === '__shell__') return; // legacy 无主打开（serial-service 内部）
  // 未知属主（测试标签 / 未安装 id）没法查清单——放行并留给宿主后续收紧；
  // 已装插件未声明 ⇒ 只保留存量 serial（serial API 早已授权）。
  if (!isLoadedPlugin(owner)) return;
  const declared = pluginDeviceTransports(owner);
  const allowed = declared ?? ['serial'];
  if (!allowed.includes(transport)) {
    throw codedDeviceError(C.CAPABILITY,
      `插件 "${owner}" 未声明 transport "${transport}"（已声明：${allowed.join(' / ')}）`,
      `在 plugin.json 根字段加 "deviceTransports": ["${transport}"]；未声明默认只给 serial（存量）`,
      { transport, allowed });
  }
}

export function registerDeviceHandlers(): void {
  if (_registered) return;
  _registered = true;

  // Block 3a：第二个 transport（验收用的「第二个作者」样本走它）
  deviceSessions.registerTransport(createTcpTransport());

  ipcMain.handle(IPC.device.acquire, async (_event, cfg: DeviceAcquireConfig): Promise<DeviceReply<{ sessionId: string; state: unknown }>> => {
    try {
      const owner = requirePoolOwner(cfg);
      if (owner) {
        if (cfg.ownerPluginId !== owner) throw codedDeviceError(C.BAD_ARGS, 'ownerPluginId 与调用上下文不一致', '⛔ 替他人 acquire');
        assertTransportCapability(owner, cfg.transport);
      }
      const r = await deviceSessions.acquire(cfg);
      return ok({ sessionId: r.sessionId, state: r.state });
    } catch (e) {
      return fail(e);
    }
  });

  ipcMain.handle(
    IPC.device.release,
    async (_event, sessionId: string, payload?: { ownerPluginId?: string; scope?: string }): Promise<DeviceReply<{ released: true; already?: true }>> => {
      try {
        const owner = requirePoolOwner(payload ?? {});
        return ok(await deviceSessions.release(sessionId, owner ?? undefined));
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IPC.device.getState,
    async (_event, payload?: { deviceKey?: string; ownerPluginId?: string; scope?: string }): Promise<DeviceReply<{ sessions: unknown[] }>> => {
      try {
        const owner = requirePoolOwner(payload ?? {});
        return ok(await deviceSessions.getState({
          ...(payload?.deviceKey ? { deviceKey: payload.deviceKey } : {}),
          ...(owner ? { ownerPluginId: owner } : {}), // ② 池侧只看自己
        }));
      } catch (e) {
        return fail(e);
      }
    },
  );

  ipcMain.handle(
    IPC.device.recover,
    async (_event, sessionId: string, payload?: { ownerPluginId?: string; scope?: string }): Promise<DeviceReply<{ recovered: boolean; sessionId?: string; ms: number }>> => {
      try {
        const owner = requirePoolOwner(payload ?? {});
        return ok(await deviceSessions.recover(sessionId, owner ?? undefined)); // ① recover 也验属主
      } catch (e) {
        return fail(e);
      }
    },
  );
}
