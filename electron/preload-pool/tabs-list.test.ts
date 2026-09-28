/**
 * M1 `AI#3` 单测——池侧 tabs.list 读取面。
 *
 * 两条判据：① 走**既有** `plugins:call` 门面（零新增 IPC 通道——命名空间矩阵不红）；
 * ② 与壳镜像的八个写方法**并存**（list 搬出镜像块后不许把镜像方法一起搬丢）。
 * 通道名 / 载荷全虚构（硬约束 21）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
/* jscpd:ignore-start -- 池 preload 测试样板：`vi.mock('electron')` 必须在本文件自己的顶层（模块图按文件隔离，
   helper 抽到共享文件也照样要在每个文件里 hoist 一次），故与 notifications.test.ts 同形，故意重复。 */
import type { IpcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import type { EventSystemApi } from '../ipc/event-system';

const { ipcMock } = vi.hoisted(() => ({ ipcMock: { invoke: vi.fn(), on: vi.fn() } }));

vi.mock('electron', () => ({ ipcRenderer: ipcMock as unknown as IpcRenderer }));

import { buildTabs } from './namespaces-workspace';

const { eventsMock } = vi.hoisted(() => ({
  eventsMock: { on: vi.fn(() => () => { /* 退订 */ }), emit: vi.fn() },
}));
const events = eventsMock as unknown as EventSystemApi;
/* jscpd:ignore-end */

beforeEach(() => {
  ipcMock.invoke.mockClear();
  eventsMock.on.mockClear();
});

describe('M1 AI#3：tabs.list 读取面', () => {
  it('list → plugins:call 门面，方法名 listTabs，零参数（读取无副作用）', async () => {
    const snapshot = { windows: [] };
    ipcMock.invoke.mockResolvedValueOnce(snapshot);

    await expect(buildTabs(events).list()).resolves.toBe(snapshot);
    expect(ipcMock.invoke).toHaveBeenCalledWith(IPC.plugins.call, 'listTabs');
    expect(ipcMock.invoke.mock.calls[0]).toHaveLength(2);
  });

  it('写方法一个不少（list 只是加法——八个镜像方法照旧走各自 tabs:* 通道）', () => {
    const api = buildTabs(events) as unknown as Record<string, unknown>;
    for (const name of [
      'create', 'openOrFocus', 'focus', 'close',
      'focusBySourceId', 'updateLabelBySourceId', 'closeBySourceId', 'onDidChangeActiveTab',
    ]) {
      expect(typeof api[name], `tabs.${name} 丢了`).toBe('function');
    }
    expect(typeof api.list).toBe('function');
  });

  it('写方法仍走 tabs:* 通道（list 不许把写路径也拐进 plugins:call）', async () => {
    await buildTabs(events).focus('tab-demo-1');
    expect(callArg(0)).toBe(IPC.tabs.focus);
    expect(callArg(1)).toBe('tab-demo-1');
  });
});

/** 取某次 invoke 的第 i 个实参（0=channel，1 起才是载荷） */
function callArg(i: number): unknown {
  return ipcMock.invoke.mock.calls[0]![i];
}
