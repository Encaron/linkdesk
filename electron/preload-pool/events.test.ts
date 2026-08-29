/**
 * E5.8#72 单测——pool 侧 theme:changed 陈旧键差集清理。
 *
 * 壳侧 commitTokens 有 `_lastCommittedKeys` 差集 removeProperty；pool 侧此前只
 * setProperty 新变量、从不清理 → 切主题残留旧主题键（用户痛点 3/4/6）。本测试验证：
 * ① 二次广播未出现的键被 removeProperty；② 已出现键更新值；③ surface-zones 自写
 * 键（不在广播 variables 内）不被误删；④ data-theme 属性跟随。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IpcRenderer, IpcRendererEvent } from 'electron';
import { IPC } from '../ipc/channels';

// ── electron ipcRenderer 假实现（模块加载时 events.ts 顶层注册 ping 监听，必须先行 mock）──
const { ipcMock } = vi.hoisted(() => {
  const ipcMock = {
    handlers: new Map<string, Set<(event: unknown, data?: unknown) => void>>(),
    on: vi.fn((channel: string, cb: (event: unknown, data?: unknown) => void) => {
      if (!ipcMock.handlers.has(channel)) ipcMock.handlers.set(channel, new Set());
      ipcMock.handlers.get(channel)!.add(cb);
    }),
    removeListener: vi.fn((channel: string, cb: (event: unknown, data?: unknown) => void) => {
      ipcMock.handlers.get(channel)?.delete(cb);
    }),
    send: vi.fn(),
    // 测试助手：向某 IPC 通道推 data（形如主进程 webContents.send）
    emit(channel: string, data?: unknown) {
      ipcMock.handlers.get(channel)?.forEach((cb) => cb({} as IpcRendererEvent, data));
    },
  } as unknown as {
    handlers: Map<string, Set<(event: unknown, data?: unknown) => void>>;
    on: ReturnType<typeof vi.fn>;
    removeListener: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    emit(channel: string, data?: unknown): void;
  };
  return { ipcMock };
});

vi.mock('electron', () => ({ ipcRenderer: ipcMock as unknown as IpcRenderer }));
vi.mock('./surface-zones', () => ({ ensureSurfaceZonesObserver: vi.fn(), measureSurfaceZones: vi.fn() }));
vi.mock('./language', () => ({ onLangChanged: vi.fn() }));

import { createPoolEvents } from './events';

/** 向 pool 广播 theme:changed（走 createEventSystem 注册的 plugin:push 分发） */
function broadcastTheme(variables: Record<string, string>, themeType = 'dark'): void {
  ipcMock.emit(IPC.plugin.push, {
    channel: IPC.theme.changed,
    payload: { themeType, variables },
  });
}

describe('pool theme:changed 陈旧键差集清理（E5.8#72）', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme');
    // 清空 root 内联样式——jsdom 无 removeAttribute 清 style 全文，逐个键清
    const root = document.documentElement;
    for (const key of Array.from(root.style)) {
      root.style.removeProperty(key);
    }
    ipcMock.handlers.clear();
    createPoolEvents(); // 每次重建——模块级 _lastPoolThemeKeys 需与 createEventSystem 实例同步重置
  });

  it('二次广播未出现的键被 removeProperty（切主题无残留）', () => {
    const root = document.documentElement;
    broadcastTheme({ 'surface-radius': '999px', 'radius-sm': '999px', 'bg-titlebar': 'rgba(16,26,51,0.55)' });
    expect(root.style.getPropertyValue('--surface-radius')).toBe('999px');
    expect(root.style.getPropertyValue('--bg-titlebar')).toBe('rgba(16,26,51,0.55)');

    // 切无 radius/玻璃域的主题 → 旧键应全部清理
    broadcastTheme({ 'bg-window': '#1E1E1E' });
    expect(root.style.getPropertyValue('--surface-radius')).toBe('');
    expect(root.style.getPropertyValue('--radius-sm')).toBe('');
    expect(root.style.getPropertyValue('--bg-titlebar')).toBe('');
    expect(root.style.getPropertyValue('--bg-window')).toBe('#1E1E1E');
  });

  it('已出现键更新值、未出现键保留（值残留 vs 键残留分开）', () => {
    const root = document.documentElement;
    broadcastTheme({ 'font-ui': 'SimSun', 'bg-window': '#0A0A0A' });
    expect(root.style.getPropertyValue('--font-ui')).toBe('SimSun');

    // 新主题有 font-ui 但值不同 + 新增 bg-card → font-ui 更新，bg-window 被清
    broadcastTheme({ 'font-ui': '"Segoe UI"', 'bg-card': '#2D2D2D' });
    expect(root.style.getPropertyValue('--font-ui')).toBe('"Segoe UI"');
    expect(root.style.getPropertyValue('--bg-window')).toBe('');
    expect(root.style.getPropertyValue('--bg-card')).toBe('#2D2D2D');
  });

  it('空 variables 广播清空全部旧键（theme:changed 空载荷兜底）', () => {
    const root = document.documentElement;
    broadcastTheme({ 'a-key': '1', 'b-key': '2' });
    broadcastTheme({});
    expect(root.style.getPropertyValue('--a-key')).toBe('');
    expect(root.style.getPropertyValue('--b-key')).toBe('');
  });

  it('surface-zones 自写键（不在广播 variables 内）不被误删', () => {
    const root = document.documentElement;
    // 模拟 surface-zones 量测直写（不经广播 variables）
    root.style.setProperty('--surface-main-zone-bg-position', '-120px -340px');
    root.style.setProperty('--surface-bg-size', '1440px 900px');

    broadcastTheme({ 'bg-window': '#1E1E1E' });
    expect(root.style.getPropertyValue('--surface-main-zone-bg-position')).toBe('-120px -340px');
    expect(root.style.getPropertyValue('--surface-bg-size')).toBe('1440px 900px');

    // 后续广播仍不误删
    broadcastTheme({ 'bg-window': '#0A0A0A' });
    expect(root.style.getPropertyValue('--surface-main-zone-bg-position')).toBe('-120px -340px');
  });

  it('data-theme 属性跟随 themeType', () => {
    const root = document.documentElement;
    broadcastTheme({ 'bg-window': '#fff' }, 'light');
    expect(root.getAttribute('data-theme')).toBe('light');
    broadcastTheme({ 'bg-window': '#000' }, 'dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
  });

  it('variables 为 undefined 时幂等不抛错', () => {
    const root = document.documentElement;
    expect(() => ipcMock.emit(IPC.plugin.push, { channel: IPC.theme.changed, payload: { themeType: 'dark' } }))
      .not.toThrow();
    expect(root.getAttribute('data-theme')).toBe('dark');
  });
});
