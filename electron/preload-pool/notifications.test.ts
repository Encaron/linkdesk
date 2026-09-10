/**
 * E6#73f（S6）单测——池侧 notifications.show 句柄隔离。
 *
 * 修前：壳 showNotification 只在 `options.progress === true` 时返回句柄 id，
 * 池侧 `if (!handleId) return undefined` ⇒ persistent 的失败通知（带 [重试]）拿不到句柄，
 * 用户手动重试成功后那条「安装失败」撤不下来，一直长驻跟成功互相打脸，攒成失败墙。
 * 修后：一律返回 id → 池侧恒包 {update,finish,cancel} 三家，契约 Promise<NotificationHandle>（非可选）。
 *
 * 方法名 / 载荷全虚构（硬约束 21），不指向真实插件。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcRenderer } from 'electron';
import { IPC } from '../ipc/channels';

const { ipcMock } = vi.hoisted(() => ({ ipcMock: { invoke: vi.fn(), on: vi.fn() } }));

vi.mock('electron', () => ({ ipcRenderer: ipcMock as unknown as IpcRenderer }));

import { buildNotifications } from './namespaces-workspace';

/** 取某次 invoke 的第 i 个实参（0=channel，1=method，2 起才是载荷） */
const callArg = (n: number, i: number) => ipcMock.invoke.mock.calls[n]![i];

beforeEach(() => {
  ipcMock.invoke.mockClear();
});

describe('E6#73f S6：notifications.show 一律返回句柄', () => {
  it('非 progress（壳回 id）→ 仍拿到完整句柄（修前这里返回 undefined）', async () => {
    ipcMock.invoke.mockResolvedValueOnce('toast-7');
    const handle = await buildNotifications().show('演示消息 装失败了', {
      type: 'error',
      persistent: true,
      actions: [{ label: 'Retry', command: 'demo-plugin.retry' }],
    });

    expect(handle).toBeTruthy();
    expect(typeof handle.update).toBe('function');
    expect(typeof handle.finish).toBe('function');
    expect(typeof handle.cancel).toBe('function');
  });

  it('句柄三家都把 handleId 带到壳（按 id 寻址，一条通知只归属创建它的句柄）', async () => {
    ipcMock.invoke.mockResolvedValueOnce('toast-9');
    const handle = await buildNotifications().show('演示消息', { progress: true });

    await handle.update('演示消息 解压中', 40);
    await handle.finish('演示消息 装好了');
    await handle.cancel();

    expect(callArg(1, 0)).toBe(IPC.plugins.call);
    expect(callArg(1, 1)).toBe('updateNotification');
    expect(callArg(1, 2)).toBe('toast-9');
    expect(callArg(1, 3)).toBe('演示消息 解压中');
    expect(callArg(1, 4)).toBe(40);

    expect(callArg(2, 1)).toBe('finishNotification');
    expect(callArg(2, 2)).toBe('toast-9');
    expect(callArg(3, 1)).toBe('cancelNotification');
    expect(callArg(3, 2)).toBe('toast-9');
  });

  it('show 把 message/options 原样透传壳（actions 走结构化克隆）', async () => {
    ipcMock.invoke.mockResolvedValueOnce('toast-1');
    await buildNotifications().show('演示消息', { type: 'warning', actions: [{ label: 'Retry', command: 'demo-plugin.retry' }] });

    expect(callArg(0, 0)).toBe(IPC.plugins.call);
    expect(callArg(0, 1)).toBe('showNotification');
    expect(callArg(0, 2)).toBe('演示消息');
    expect(callArg(0, 3)).toEqual({ type: 'warning', actions: [{ label: 'Retry', command: 'demo-plugin.retry' }] });
  });
});
