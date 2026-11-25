/**
 * 设备会话注册表（Block 3a）——**设备生命周期的唯一真源**（住壳主进程）。
 *
 * 规格：`docs/04-软件更新/待抉择池/通用能力底盘/03-设备会话共享契约.md §八`。
 * 来源：serial 1.0.46 实机踩通的五个 bug（状态撒谎/僵尸句柄/失败污染/非属主关闭/回执不派生权威态）。
 *
 * 六条不变式（⛔ 少一条就会退回串口那五类 bug）：
 *   ① 先验证后提交——transport.open 抛错 ⇒ 不建会话（失败零副作用）；
 *   ② 属主唯一——同一 deviceKey 已有活会话 ⇒ 他主 EBUSY、同主幂等返回（⛔ 自动关先开者）；
 *   ③ 幂等释放——先摘账再 close；重复 release ⇒ already:true；
 *   ④ 僵尸摘账——会话在但 handle.isOpen()===false ⇒ stale，acquire/recover 先摘再开；
 *   ⑤ 被动丢失——拔线/错误只让 handle 变死，会话留为 stale（⛔ 自动无限重连）；
 *   ⑥ 非属主操作——release 非本属主 ⇒ EBADARGS，⛔ 作用到别人会话。
 *
 * 本模块零 IO、零 electron 依赖（时间/ID 可注入）——纯逻辑可单测；transport 由调用方注册。
 */

import type { DeviceHandle, DeviceTransport } from './transport.js';
import { DEVICE_ERROR_CODES as C, codedDeviceError } from './codes.js';

/** 会话四字段（⊕ sessionId）——**契约形状**，插件 ⛔ 自缓存 open */
export interface DeviceState {
  deviceKey: string;
  open: boolean;
  /** 设备在不在：null = 探测不了（⛔ 当 false） */
  devicePresent: boolean | null;
  /** 会话在但句柄已死（拔线/错误）——`recover` 可自愈 */
  stale: boolean;
  /** 该 deviceKey 当前属主会话 id；无会话 = null */
  ownerSessionId: string | null;
  sessionId?: string;
}

export interface AcquireRequest {
  deviceKey: string;
  transport: string;
  /** 插件自声明（主进程无法从 sender 识别插件——与既有 serial ownerPluginId 同口径） */
  ownerPluginId: string;
  params?: Record<string, unknown>;
}

interface SessionRecord {
  sessionId: string;
  deviceKey: string;
  transportId: string;
  ownerPluginId: string;
  params: Record<string, unknown>;
  handle: DeviceHandle;
  openedAt: number;
}

export interface DeviceSessionRegistryOptions {
  now?: () => number;
  /** sessionId 生成器（测试用；默认 `dev_` ＋ 8 位 hex） */
  newId?: () => string;
}

function defaultNewId(): string {
  let s = '';
  for (let i = 0; i < 8; i += 1) s += '0123456789abcdef'[Math.floor(Math.random() * 16)];
  return `dev_${s}`;
}

export function createDeviceSessionRegistry(opts: DeviceSessionRegistryOptions = {}) {
  const now = opts.now ?? (() => Date.now());
  const newId = opts.newId ?? defaultNewId;
  const transports = new Map<string, DeviceTransport>();
  /** deviceKey → 会话（一个设备同时只有一条活会话——属主唯一） */
  const byKey = new Map<string, SessionRecord>();
  const byId = new Map<string, SessionRecord>();

  const requireTransport = (id: string): DeviceTransport => {
    const t = transports.get(id);
    if (!t) {
      throw codedDeviceError(C.BAD_ARGS, `未知 transport "${id}"——已注册：${[...transports.keys()].join(' / ') || '（无）'}`,
        '设备类插件在 acquire 时点名 transport；壳只提供已装配的（serial/tcp）');
    }
    return t;
  };

  const toState = async (rec: SessionRecord): Promise<DeviceState> => {
    const open = rec.handle.isOpen();
    let devicePresent: boolean | null = null;
    const t = transports.get(rec.transportId);
    if (t?.probe) {
      try {
        devicePresent = await t.probe(rec.deviceKey);
      } catch {
        devicePresent = null; // 探不了 ⇒ 不硬判
      }
    }
    return {
      deviceKey: rec.deviceKey,
      open,
      devicePresent,
      stale: !open,
      ownerSessionId: rec.sessionId,
      sessionId: rec.sessionId,
    };
  };

  /** 摘账（byId/byKey 同步删——顺序即判据：先摘再关，重复调用安全） */
  function forget(rec: SessionRecord): void {
    if (byId.get(rec.sessionId) === rec) byId.delete(rec.sessionId);
    if (byKey.get(rec.deviceKey) === rec) byKey.delete(rec.deviceKey);
  }

  return {
    registerTransport(t: DeviceTransport): void {
      transports.set(t.id, t);
    },

    /** 已注册 transport 清单（describe/doctor 用） */
    transportIds(): string[] {
      return [...transports.keys()];
    },

    async acquire(req: AcquireRequest): Promise<{ sessionId: string; state: DeviceState }> {
      if (!req || typeof req.deviceKey !== 'string' || !req.deviceKey) {
        throw codedDeviceError(C.BAD_ARGS, 'acquire 需要 deviceKey（非空字符串）');
      }
      if (typeof req.ownerPluginId !== 'string' || !req.ownerPluginId) {
        throw codedDeviceError(C.BAD_ARGS, 'acquire 需要 ownerPluginId（插件自声明）');
      }
      const transport = requireTransport(req.transport);

      const existing = byKey.get(req.deviceKey);
      if (existing && existing.handle.isOpen()) {
        if (existing.ownerPluginId === req.ownerPluginId) {
          return { sessionId: existing.sessionId, state: await toState(existing) }; // ② 同主幂等
        }
        throw codedDeviceError(C.BUSY, `设备 "${req.deviceKey}" 已被会话占用`,
          '同一设备同时只归一个会话；要接管请让属主先 release（⛔ 自动关先开者）',
          { ownerSessionId: existing.sessionId, ownerPluginId: existing.ownerPluginId });
      }
      if (existing) forget(existing); // ④ 僵尸先摘账

      const params = req.params ?? {};
      const handle = await transport.open(req.deviceKey, params); // ① 失败零副作用（异常直接上抛）

      // ② 竞态兜底：open 期间别人抢先建了会话
      const raced = byKey.get(req.deviceKey);
      if (raced && raced.handle.isOpen()) {
        await handle.close().catch(() => {});
        if (raced.ownerPluginId === req.ownerPluginId) {
          return { sessionId: raced.sessionId, state: await toState(raced) };
        }
        throw codedDeviceError(C.BUSY, `设备 "${req.deviceKey}" 已被会话占用`, undefined, {
          ownerSessionId: raced.sessionId, ownerPluginId: raced.ownerPluginId,
        });
      }
      if (raced) forget(raced);

      let sessionId = newId();
      while (byId.has(sessionId)) sessionId = newId();
      const rec: SessionRecord = {
        sessionId,
        deviceKey: req.deviceKey,
        transportId: req.transport,
        ownerPluginId: req.ownerPluginId,
        params,
        handle,
        openedAt: now(),
      };
      byId.set(sessionId, rec);
      byKey.set(req.deviceKey, rec);
      return { sessionId, state: await toState(rec) };
    },

    /** ③ 幂等释放：先摘账再 close；非属主可传 ownerPluginId 校验（⑥） */
    async release(sessionId: string, ownerPluginId?: string): Promise<{ released: true; already?: true }> {
      const rec = byId.get(sessionId);
      if (!rec) return { released: true, already: true };
      if (ownerPluginId !== undefined && rec.ownerPluginId !== ownerPluginId) {
        throw codedDeviceError(C.BAD_ARGS, `会话 "${sessionId}" 不属于插件 "${ownerPluginId}"`,
          '非属主不得关闭他主会话；请让属主自己 release', { ownerPluginId: rec.ownerPluginId });
      }
      forget(rec);
      await rec.handle.close().catch(() => {}); // 设备可能已断电——释放仍算成功
      return { released: true };
    },

    /** 状态读数：四字段全部从权威态派生（⛔ 回执照抄缓存） */
    async getState(filter: { deviceKey?: string; ownerPluginId?: string } = {}): Promise<{ sessions: DeviceState[] }> {
      const recs = (filter.deviceKey
        ? [byKey.get(filter.deviceKey)].filter((r): r is SessionRecord => !!r)
        : [...byKey.values()])
        .filter((r) => !filter.ownerPluginId || r.ownerPluginId === filter.ownerPluginId);
      const sessions: DeviceState[] = [];
      for (const rec of recs) sessions.push(await toState(rec));
      return { sessions };
    },

    /** ⑤ 自愈：句柄死了就按原参数重开；活的会话回 recovered:false（⛔ 无谓重开） */
    async recover(sessionId: string, ownerPluginId?: string): Promise<{ recovered: boolean; sessionId?: string; ms: number }> {
      const rec = byId.get(sessionId);
      if (!rec) {
        throw codedDeviceError(C.NO_SESSION, `会话 "${sessionId}" 不存在（已释放或进程重启）`,
          '先 device.getState 看现状，再重新 acquire（⛔ 猜 sessionId）');
      }
      // Block 3a 复核：不变式 6 扩到 recover——非属主不得让别人的会话重开
      if (ownerPluginId !== undefined && rec.ownerPluginId !== ownerPluginId) {
        throw codedDeviceError(C.BAD_ARGS, `会话 "${sessionId}" 不属于插件 "${ownerPluginId}"`,
          '非属主不得恢复他主会话', { ownerPluginId: rec.ownerPluginId });
      }
      if (rec.handle.isOpen()) return { recovered: false, ms: 0 };
      forget(rec);
      const t = requireTransport(rec.transportId);
      const t0 = now();
      const handle = await t.open(rec.deviceKey, rec.params).catch((e: unknown) => {
        throw codedDeviceError(C.DEVICE, `恢复失败：${e instanceof Error ? e.message : String(e)}`,
          '设备可能仍未插回/不可达；稍后再 recover（⛔ 自动无限重连）', { deviceKey: rec.deviceKey });
      });
      let nextId = newId();
      while (byId.has(nextId)) nextId = newId();
      const next: SessionRecord = { ...rec, sessionId: nextId, handle, openedAt: now() };
      byId.set(nextId, next);
      byKey.set(next.deviceKey, next);
      return { recovered: true, sessionId: nextId, ms: now() - t0 };
    },

    /** 卸载连坐：关闭某插件全部会话（幂等，单条失败不阻断其余） */
    async closeByOwner(pluginId: string): Promise<void> {
      const owned = [...byId.values()].filter((r) => r.ownerPluginId === pluginId);
      for (const rec of owned) {
        await this.release(rec.sessionId, pluginId).catch(() => {});
      }
    },

    /** 宿主内部面：按 deviceKey 取当前会话 id（legacy 通道如 serial:closePort 用） */
    sessionIdFor(deviceKey: string): string | null {
      return byKey.get(deviceKey)?.sessionId ?? null;
    },

    /** 宿主内部面：全部会话的属主视图（卸载连坐旧面 getPortOwners 用） */
    sessions(): Array<{ sessionId: string; deviceKey: string; ownerPluginId: string }> {
      return [...byId.values()].map((r) => ({ sessionId: r.sessionId, deviceKey: r.deviceKey, ownerPluginId: r.ownerPluginId }));
    },

    /** 读数（doctor/测试用） */
    size(): number {
      return byId.size;
    },

    /** 测试用清空（不 close——假 transport 自己收拾） */
    clear(): void {
      byId.clear();
      byKey.clear();
    },
  };
}
