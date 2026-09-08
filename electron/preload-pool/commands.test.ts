/**
 * E6#62e 单测——池侧 on-command 激活（命令 miss → import 属主插件入口 → 重试一次）。
 *
 * 验证四条行为：
 * ① 壳占位转发（executeRequest → executeLocal）miss → _commandMissHandler(owner) import 属主入口
 *    （测试里 handler 模拟 entry 顶层副作用 registerCommand）→ 重试命中 → executeResult 回传结果；
 * ② 激活后仍 miss（entry 顶层无该命令——命令在视图组件注册的 inherent 边界）→ reject「未在池内注册」回传 error；
 * ③ executeCommand 直调（池→池/壳）miss：激活命中走池侧 handler，不 fallback 壳 IPC；
 * ④ executeCommand 直调二次 miss / 激活回调返回 false → fallback IPC.commands.execute（带原始含 token 参）。
 *
 * 命令 ID 恒虚构（硬约束 21：demo-plugin 属主 + .say/.ping/.nope 名），不指向真实插件。
 */
import { describe, it, expect, vi } from 'vitest';
import type { IpcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import type { EventSystemApi } from '../ipc/event-system';

// ── electron ipcRenderer 假实现（commands.ts 顶层 import ipcRenderer，必须先行 mock）──
const { ipcMock } = vi.hoisted(() => {
  const ipcMock = {
    invoke: vi.fn(() => Promise.resolve(undefined)),
    on: vi.fn(),
  } as unknown as {
    invoke: ReturnType<typeof vi.fn>;
    on: ReturnType<typeof vi.fn>;
  };
  return { ipcMock };
});

vi.mock('electron', () => ({ ipcRenderer: ipcMock as unknown as IpcRenderer }));

import { buildCommands } from './commands';

/** 假事件系统——捕获 executeRequest 单 handler；triggerAsync 等异步链跑完（sendExecuteResult 在其内） */
function buildFakeEvents(): {
  triggerAsync: (payload: unknown) => Promise<void>;
} {
  let handler: ((payload: unknown) => void | Promise<void>) | undefined;
  const api = {
    on: vi.fn((_channel: string, cb: (payload: unknown) => void | Promise<void>) => {
      handler = cb;
      return () => {};
    }),
    triggerAsync: async (payload: unknown) => {
      if (handler) await handler(payload);
    },
  };
  return api as unknown as EventSystemApi & { triggerAsync: (payload: unknown) => Promise<void> };
}

describe('池侧 on-command 激活（E6#62e）', () => {
  beforeEach(() => {
    ipcMock.invoke.mockClear();
  });

  it('壳占位转发 miss → handler import 属主入口注册后重试命中 → executeResult 回传结果', async () => {
    const events = buildFakeEvents();
    const commands = buildCommands(events);
    const activated: string[] = [];
    // 模拟池 renderer 注册的激活回调——handler 里 registerCommand 模拟 entry 顶层副作用
    commands._setCommandMissHandler(async (pluginId) => {
      activated.push(pluginId);
      commands.registerCommand(`${pluginId}.say`, () => 'pong');
      return true;
    });

    await events.triggerAsync({ requestId: 'r1', commandId: 'demo-plugin.say', args: [] });

    expect(activated).toEqual(['demo-plugin']);
    const resultCall = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.executeResult);
    expect(resultCall?.[1]).toBe('r1');
    expect(resultCall?.[2]).toEqual({ result: 'pong' });
  });

  it('激活后仍 miss（命令在视图组件注册的 inherent 边界）→ reject 错误回传 executeResult', async () => {
    const events = buildFakeEvents();
    const commands = buildCommands(events);
    // entry import 完成但该命令 handler 不在 entry 顶层——激活重试仍 miss → 未在池内注册
    commands._setCommandMissHandler(async () => true);

    await events.triggerAsync({ requestId: 'r2', commandId: 'demo-plugin.nope', args: [] });

    const resultCall = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.executeResult);
    expect(resultCall?.[1]).toBe('r2');
    expect((resultCall?.[2] as { error?: string })?.error).toContain('未在池内注册');
  });

  it('未注册激活回调 → executeRequest miss 直 reject', async () => {
    const events = buildFakeEvents();
    buildCommands(events); // 不注册 _setCommandMissHandler

    await events.triggerAsync({ requestId: 'r3', commandId: 'demo-plugin.nope', args: [] });

    const errorCall = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.executeResult);
    expect(errorCall?.[1]).toBe('r3');
    expect((errorCall?.[2] as { error?: string })?.error).toContain('未在池内注册');
  });

  it('executeCommand 直调 miss → 激活命中走池侧 handler，不 fallback 壳 IPC', async () => {
    const events = buildFakeEvents();
    const commands = buildCommands(events);
    commands._setCommandMissHandler(async (pluginId) => {
      commands.registerCommand(`${pluginId}.ping`, () => 42);
      return true;
    });

    const result = await commands.executeCommand('demo-plugin.ping');

    expect(result).toBe(42);
    expect(ipcMock.invoke.mock.calls.some((c) => c[0] === IPC.commands.execute)).toBe(false);
  });

  it('executeCommand 直调二次 miss → fallback 壳 IPC 带原始含 token 参数', async () => {
    const events = buildFakeEvents();
    const commands = buildCommands(events);

    await commands.executeCommand('demo-plugin.nope', undefined, 'realArg');

    const executeCall = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.execute);
    expect(executeCall?.[1]).toBe('demo-plugin.nope');
    expect(executeCall?.[2]).toBe(undefined); // token 占位原样保留
    expect(executeCall?.[3]).toBe('realArg');
  });

  it('激活回调返回 false → 不重试直接 fallback', async () => {
    const events = buildFakeEvents();
    const commands = buildCommands(events);
    commands._setCommandMissHandler(async () => false);

    await commands.executeCommand('demo-plugin.nope');

    const executeCall = ipcMock.invoke.mock.calls.find((c) => c[0] === IPC.commands.execute);
    expect(executeCall?.[1]).toBe('demo-plugin.nope');
  });
});
