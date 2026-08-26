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
import type { ThemeChangedPayload, AccentChangedPayload, FontFaceSpec } from '../../src/core/types/ipc/events';
import { onLangChanged } from './language';
import { ensureSurfaceZonesObserver, measureSurfaceZones } from './surface-zones';

// ── E5.8#50.17：资产字体 @font-face 复刻——池是独立文档，壳注册的 @font-face 不生效；
//    壳随 theme:changed 广播 fontFaces 表，池侧注入单一 `<style data-ld-font-faces>`（整表替换，幂等）。
const FONT_FACES_STYLE_ID = 'ld-font-faces';
function applyFontFaces(fontFaces?: FontFaceSpec[]): void {
  let style = document.getElementById(FONT_FACES_STYLE_ID) as HTMLStyleElement | null;
  if (!fontFaces || fontFaces.length === 0) {
    style?.remove();
    return;
  }
  if (!style) {
    style = document.createElement('style');
    style.id = FONT_FACES_STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = fontFaces
    .map(
      (f) =>
        `@font-face{font-family:"${f.family}";src:url("${f.url}")` +
        `${f.format ? ` format("${f.format}")` : ''};font-display:swap}`
    )
    .join('');
}

// ── E5.7#37：心跳 pong——主进程 5s ping，模块顶层自动回复 ──
// 硬约束 20：模块顶层注册（contextBridge.exposeInMainWorld 之前）。
// 刻意不经 React/命名空间 API：pong 必须在 React mount 前就存在——池加载窗口（主进程
// 10s 超时）内 preload 一旦执行即可回复，否则加载中的池被心跳误判卡死误杀。
// 主线程阻塞时事件循环停转，pong 自然停发 = 卡死信号（这正是心跳要检测的）。
// 池命名空间不暴露 onPing 消费 API——零消费方即死代码（无死代码原则），需要时再加。
ipcRenderer.on(IPC.pool.ping, () => {
  ipcRenderer.send(IPC.pool.pong);
});

// ── E5.8#72：pool 侧陈旧键差集清理（对标壳侧 commitTokens `_lastCommittedKeys`）──
// 壳侧 ThemeEngine commitTokens 每次提交前 removeProperty 上次写过、本次没写的键；
// pool 侧 theme:changed 此前只 setProperty 新变量、从不清理 → 切主题后文档根残留旧主题键
// （bubble surface-radius:999 切 dark 不恢复、极光玻璃深紫顶栏残留、宋体残留 = 用户痛点 3/4/6）。
// 用户所见全在 pool WCV，池侧残留即永久显示（无 :root 变体兜底）——必须同机制差集清理。
// 边界（E5.8 Phase 11.15 R3 根治后）：`--surface-<zone>-bg-position`/`--surface-bg-size` 由
// surface-zones 自写自清（唯一所有者）、不在广播 variables 键集内，差集天然隔离不误删；
// `--surface-bg-zones`/`--surface-bg-image`/`--surface-bg-repeat` 归壳引擎广播（zones 标记），
// 在广播键集内、被差集正常管理。旧注释曾称三组键全不在广播——错（R3 前 size/position 正因
// 在广播里才被每次重应用覆盖、盖掉池侧量测坐标，此即切片错位根因）。
let _lastPoolThemeKeys: string[] | null = null;

// E5.8#89 E2：zones 量测触发签名——surface-bg-zones/image/repeat 三键不变 = 量测结果不会变，
// 跳过量测（6× getBoundingClientRect 强制重排）。玻璃/圆角滑杆 tick 广播全量 token 中三键恒不变 → 零量测。
// 初始 "" 恒 ≠ 首广播 → 首切 zones 主题必量测；换 zone 图/切主题 → 签名变化 → 重量测。
let _lastZoneSignature = '';

/** events 命名空间——createEventSystem + theme/accent/lang 三个 CSS 注入 extraHandler */
export function createPoolEvents(): EventSystemApi {
  return createEventSystem(ipcRenderer, {
    logPrefix: 'preload-pool',
    extraHandlers: {
      [IPC.theme.changed]: (payload) => {
        const { themeType, variables, fontFaces } = payload as ThemeChangedPayload;
        try {
          const root = document.documentElement;
          const vars = (variables ?? {}) as Record<string, string>;
          root.setAttribute('data-theme', themeType ?? 'dark');
          // E5.8#72：清上一次广播写过、本次没写的陈旧键——换配方/换主题无残留
          if (_lastPoolThemeKeys) {
            for (const key of _lastPoolThemeKeys) {
              if (!(key in vars)) root.style.removeProperty(`--${key}`);
            }
          }
          for (const [k, v] of Object.entries(vars)) {
            root.style.setProperty(`--${k}`, v);
          }
          _lastPoolThemeKeys = Object.keys(vars);
          // E5.8#50.17：资产字体 @font-face 复刻（池独立文档）；载荷无 fontFaces → 清空上次注入
          applyFontFaces(fontFaces);
          // E5.8#89 E2：量测触发去耦——zones 相关变量不变 → 跳过（零强制重排）。
          // 拖玻璃/圆角滑杆 tick 广播全量 token 中 zones 三键不变 → 0× getBoundingClientRect；
          // 仅 zones 配置变化（切主题/换 zone 图）触发量测；窗口 resize/布局变化由 ResizeObserver 自补。
          const zoneSignature = [
            vars['surface-bg-zones'] ?? '',
            vars['surface-bg-image'] ?? '',
            vars['surface-bg-repeat'] ?? '',
          ].join('|');
          if (zoneSignature !== _lastZoneSignature) {
            _lastZoneSignature = zoneSignature;
            ensureSurfaceZonesObserver();
            measureSurfaceZones();
          }
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
