/**
 * Pool preload 事件域——心跳 pong + events 命名空间（含 theme/accent/lang CSS 注入）。
 * E5.8#0d.10-4b：自 preload-pool.ts 拆出——createEventSystem 池侧配置（extraHandlers 三件套：
 * theme/accent 直改 document 根 CSS 变量，lang 经 onLangChanged 单点写入 language 域）。
 * 心跳 pong（E5.7#37）模块级注册——必须在 contextBridge 前存在，React mount 前即可回复。
 * 依赖方向：events → electron/ipc（createEventSystem/channels）+ language（onLangChanged）；无反向。
 */

import { ipcRenderer } from 'electron';
import { IPC } from '../ipc/channels';
import { createEventSystem, type EventSystemApi } from '../ipc/event-system';
import type { ThemeChangedPayload, AccentChangedPayload } from '../../src/core/types/ipc/events';
import { onLangChanged } from './language';
import { ensureSurfaceZonesObserver, measureSurfaceZones } from './surface-zones';

// ── E5.7#37：心跳 pong——主进程 5s ping，模块顶层自动回复 ──
// 硬约束 20：模块顶层注册（contextBridge.exposeInMainWorld 之前）。
// 刻意不经 React/命名空间 API：pong 必须在 React mount 前就存在——池加载窗口（主进程
// 10s 超时）内 preload 一旦执行即可回复，否则加载中的池被心跳误判卡死误杀。
// 主线程阻塞时事件循环停转，pong 自然停发 = 卡死信号（这正是心跳要检测的）。
// 池命名空间不暴露 onPing 消费 API——零消费方即死代码（无死代码原则），需要时再加。
ipcRenderer.on(IPC.pool.ping, () => {
  ipcRenderer.send(IPC.pool.pong);
});

/** events 命名空间——createEventSystem + theme/accent/lang 三个 CSS 注入 extraHandler */
export function createPoolEvents(): EventSystemApi {
  return createEventSystem(ipcRenderer, {
    logPrefix: 'preload-pool',
    extraHandlers: {
      [IPC.theme.changed]: (payload) => {
        const { themeType, variables } = payload as ThemeChangedPayload;
        try {
          const root = document.documentElement;
          root.setAttribute('data-theme', themeType ?? 'dark');
          for (const [k, v] of Object.entries(variables as Record<string, string>)) {
            root.style.setProperty(`--${k}`, v);
          }
          // E5.8#50.29/50.31：zones 模式下按本窗 DOM 量测切片坐标（+ ResizeObserver 重算）
          ensureSurfaceZonesObserver();
          measureSurfaceZones();
        } catch (e) {
          console.error('[preload-pool] theme:changed CSS 注入失败:', e);
        }
      },
      'accent:changed': (payload) => {
        const { variables } = payload as AccentChangedPayload;
        try {
          const root = document.documentElement;
          for (const [k, v] of Object.entries(variables as Record<string, string>)) {
            root.style.setProperty(k, v);
          }
        } catch (e) {
          console.error('[preload-pool] accent:changed CSS 注入失败:', e);
        }
      },
      'lang:changed': (payload) => {
        onLangChanged(payload as { lang: string; resources: Record<string, unknown> });
      },
    },
  });
}
