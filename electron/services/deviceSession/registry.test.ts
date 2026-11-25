/**
 * DeviceSessionRegistry 单测（Block 3a）——**六条不变式各带负控**（纯逻辑，不起窗口）。
 *
 * 负控必须真红（改实现就红）：
 *   · 去掉 acquire 的属主分支 ⇒ ② EBUSY 用例红；
 *   · release 改成「先 close 再摘账」/ 不删 byKey ⇒ ③ 幂等用例红（第二次 release 找不到/close 两次）；
 *   · 僵尸分支改成直接复用旧 session ⇒ ④ 用例红（open 只 1 次）；
 *   · recover 不摘旧账 ⇒ ⑤ 用例红（byKey 仍指旧记录）。
 */

import { describe, expect, it } from 'vitest';
import { createDeviceSessionRegistry } from './registry.js';
import type { DeviceHandle, DeviceTransport } from './transport.js';

interface FakeHandle extends DeviceHandle {
  kill(): void;
}

function fakeTransport(opts: { failOpen?: boolean; present?: boolean | null; noProbe?: boolean; throwProbe?: boolean } = {}) {
  const opens: string[] = [];
  const closes: string[] = [];
  const handles: FakeHandle[] = [];
  const t: DeviceTransport = {
    id: 'fake',
    async open(key: string) {
      opens.push(key);
      if (opts.failOpen) throw new Error('boom');
      let open = true;
      const h: FakeHandle = {
        isOpen: () => open,
        close: async () => { open = false; closes.push(key); },
        kill: () => { open = false; },
      };
      handles.push(h);
      return h;
    },
    ...(opts.noProbe ? {} : {
      async probe() {
        if (opts.throwProbe) throw new Error('probe failed');
        return opts.present ?? true;
      },
    }),
  };
  return { t, opens, closes, handles };
}

function setup(opts: Parameters<typeof fakeTransport>[0] = {}) {
  const reg = createDeviceSessionRegistry({ now: () => 1000, newId: (() => { let i = 0; return () => `dev_${++i}`; })() });
  const fake = fakeTransport(opts);
  reg.registerTransport(fake.t);
  return { reg, ...fake };
}

describe("① 先验证后提交：open 失败不建会话（零副作用）", () => {
  it('transport.open 抛错 ⇒ acquire 抛、getState 为空、无 sessionId 泄漏', async () => {
    const { reg } = setup({ failOpen: true });
    await expect(reg.acquire({ deviceKey: 'COM9', transport: 'fake', ownerPluginId: 'p' })).rejects.toThrow('boom');
    expect(reg.size()).toBe(0);
    await expect(reg.getState()).resolves.toEqual({ sessions: [] });
  });
});

describe('② 属主唯一：他主 EBUSY / 同主幂等', () => {
  it('他主再 acquire ⇒ EBUSY（details 带属主会话）', async () => {
    const { reg } = setup();
    const a = await reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'serial' });
    await expect(reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'other' }))
      .rejects.toMatchObject({ code: 'EBUSY', details: { ownerSessionId: a.sessionId, ownerPluginId: 'serial' } });
  });

  it('同主再 acquire ⇒ 返回同一 sessionId，transport.open 只一次', async () => {
    const { reg, opens } = setup();
    const a = await reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'serial' });
    const b = await reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'serial' });
    expect(b.sessionId).toBe(a.sessionId);
    expect(opens).toEqual(['COM3']);
  });
});

describe('③ 幂等释放：先摘账再关，重复 release 不抛', () => {
  it('release 两次 ⇒ 第二次 already:true，close 只一次', async () => {
    const { reg, closes } = setup();
    const a = await reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'serial' });
    expect(await reg.release(a.sessionId)).toEqual({ released: true });
    expect(await reg.release(a.sessionId)).toEqual({ released: true, already: true });
    expect(closes).toEqual(['COM3']);
    expect(reg.size()).toBe(0);
  });
});

describe('④ 僵尸摘账：句柄死 ⇒ stale，acquire 先摘再开', () => {
  it('句柄死了 ⇒ getState open:false/stale:true；同主 acquire ⇒ 新会话、open 第二次', async () => {
    const { reg, handles, opens } = setup();
    const a = await reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'serial' });
    handles[0].kill();
    const st = await reg.getState({ deviceKey: 'COM3' });
    expect(st.sessions[0]).toMatchObject({ open: false, stale: true, ownerSessionId: a.sessionId });

    const b = await reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'serial' });
    expect(b.sessionId).not.toBe(a.sessionId);
    expect(opens).toHaveLength(2);
    expect(b.state).toMatchObject({ open: true, stale: false });
  });
});

describe('⑤ 被动丢失与 recover 自愈', () => {
  it('拔线（句柄死）⇒ recover 重开成功，返回新 sessionId ＋ 耗时', async () => {
    const { reg, handles, opens } = setup();
    const a = await reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'serial' });
    handles[0].kill();
    const r = await reg.recover(a.sessionId);
    expect(r.recovered).toBe(true);
    expect(r.sessionId).not.toBe(a.sessionId);
    expect(r.ms).toBeGreaterThanOrEqual(0);
    expect(opens).toHaveLength(2);
    await expect(reg.getState({ deviceKey: 'COM3' })).resolves.toMatchObject({ sessions: [{ open: true, sessionId: r.sessionId }] });
  });

  it('活的会话 recover ⇒ recovered:false（⛔ 无谓重开）', async () => {
    const { reg, opens } = setup();
    const a = await reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'serial' });
    await expect(reg.recover(a.sessionId)).resolves.toEqual({ recovered: false, ms: 0 });
    expect(opens).toHaveLength(1);
  });

  it('未知 sessionId ⇒ ENOSESSION（⛔ 猜）', async () => {
    const { reg } = setup();
    await expect(reg.recover('dev_nope')).rejects.toMatchObject({ code: 'ENOSESSION' });
  });
});

describe('⑥ 非属主操作被拒', () => {
  it('非属主 release ⇒ EBADARGS，会话仍开、句柄未关', async () => {
    const { reg, closes } = setup();
    const a = await reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'serial' });
    await expect(reg.release(a.sessionId, 'other')).rejects.toMatchObject({ code: 'EBADARGS' });
    expect(closes).toEqual([]);
    await expect(reg.getState({ deviceKey: 'COM3' })).resolves.toMatchObject({ sessions: [{ open: true }] });
  });
});

describe('状态四字段与探测口径', () => {
  it('devicePresent=false ⇒ 如实；probe 抛错/未实现 ⇒ null（⛔ 当 false）', async () => {
    const absent = setup({ present: false });
    const a = await absent.reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'serial' });
    expect(a.state.devicePresent).toBe(false);

    const noProbe = setup({ noProbe: true });
    const b = await noProbe.reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'serial' });
    expect(b.state.devicePresent).toBeNull();

    const throwProbe = setup({ throwProbe: true });
    const c = await throwProbe.reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'serial' });
    expect(c.state.devicePresent).toBeNull();
  });
});

describe('装卸与边界', () => {
  it('closeByOwner 只关本属主会话', async () => {
    const { reg, closes } = setup();
    await reg.acquire({ deviceKey: 'COM1', transport: 'fake', ownerPluginId: 'a' });
    await reg.acquire({ deviceKey: 'COM2', transport: 'fake', ownerPluginId: 'b' });
    await reg.closeByOwner('a');
    expect(closes).toEqual(['COM1']);
    expect(reg.size()).toBe(1);
  });

  it('未知 transport / 缺 deviceKey / 缺 ownerPluginId ⇒ EBADARGS', async () => {
    const { reg } = setup();
    await expect(reg.acquire({ deviceKey: 'X', transport: 'nope', ownerPluginId: 'p' })).rejects.toMatchObject({ code: 'EBADARGS' });
    await expect(reg.acquire({ deviceKey: '', transport: 'fake', ownerPluginId: 'p' })).rejects.toMatchObject({ code: 'EBADARGS' });
    await expect(reg.acquire({ deviceKey: 'X', transport: 'fake', ownerPluginId: '' })).rejects.toMatchObject({ code: 'EBADARGS' });
  });
});

describe('宿主内部面（legacy 通道对接）', () => {
  it('sessionIdFor / sessions 与实际会话一致；释放后消失', async () => {
    const { reg } = setup();
    const a = await reg.acquire({ deviceKey: 'COM1', transport: 'fake', ownerPluginId: 'serial' });
    expect(reg.sessionIdFor('COM1')).toBe(a.sessionId);
    expect(reg.sessionIdFor('COM9')).toBeNull();
    expect(reg.sessions()).toEqual([{ sessionId: a.sessionId, deviceKey: 'COM1', ownerPluginId: 'serial' }]);
    await reg.release(a.sessionId);
    expect(reg.sessionIdFor('COM1')).toBeNull();
    expect(reg.sessions()).toEqual([]);
  });
});

describe('可见性与 recover 属主（Block 3a 复核口径）', () => {
  it('getState 按 ownerPluginId 过滤；不传则全量（宿主内部用）', async () => {
    const { reg } = setup();
    await reg.acquire({ deviceKey: 'A', transport: 'fake', ownerPluginId: 'p1' });
    await reg.acquire({ deviceKey: 'B', transport: 'fake', ownerPluginId: 'p2' });
    const all = await reg.getState();
    expect(all.sessions).toHaveLength(2);
    const own = await reg.getState({ ownerPluginId: 'p1' });
    expect(own.sessions.map((s) => s.deviceKey)).toEqual(['A']);
  });

  it('非属主 recover ⇒ EBADARGS（不变式 6 扩到 recover）', async () => {
    const { reg, handles } = setup();
    const a = await reg.acquire({ deviceKey: 'COM3', transport: 'fake', ownerPluginId: 'p1' });
    handles[0].kill();
    await expect(reg.recover(a.sessionId, 'p2')).rejects.toMatchObject({ code: 'EBADARGS' });
    // 属主自己仍可恢复
    await expect(reg.recover(a.sessionId, 'p1')).resolves.toMatchObject({ recovered: true });
  });
});
