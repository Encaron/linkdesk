/**
 * keyboard-router.ts — 主进程全局键盘拦截
 *
 * E5.5#7 Phase 4。多 WebView 下，Electron 键盘事件只发给聚焦的 WebContentsView。
 * 插件 WebView 聚焦时壳 keydown 监听收不到 → 全局快捷键全部失效。
 *
 * 方案：主进程 before-input-event 在所有 WebContents 上拦截
 * → 同步查表（壳同步的 keyCache）→ 命中则 preventDefault + 转发壳执行。
 *
 * 架构：
 *   1. 壳同步快捷键表到主进程（keyboard:syncShortcuts）
 *   2. 主进程维护 chord 状态机（与壳 CHORD_TIMEOUT 同值）
 *   3. before-input-event 命中 → preventDefault + send('keyboard:executeShortcut')
 */

import { BrowserWindow, WebContentsView, app, type Event, type Input } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { PluginViewRegistry } from './plugin-view-registry.js';

// ── 诊断日志（写 protocol-debug.log——与 renderer console-message 同文件）──

let _debugLog = false; // 生产静默，排查问题时改 true
function debug(msg: string): void {
  if (!_debugLog) return;
  const ts = new Date().toISOString();
  const line = `[${ts}] [keyboard-router] ${msg}`;
  console.error(line);
  try {
    const logFile = path.join(app.getPath('userData'), 'protocol-debug.log');
    fs.appendFileSync(logFile, line + '\n');
  } catch { /* ignore */ }
}

// ── 类型（主进程侧——不依赖壳 renderer 模块）──

interface KeyboardInput {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  key: string;
  code: string;
}

interface KeybindingSyncData {
  shortcuts: string[];
  chordPrefixes: string[];
  chordCombos: string[];
}

// ── 常量——与 KeybindingRegistry.CHORD_TIMEOUT 同值 ──

const CHORD_TIMEOUT = 2000;

// ── 特殊键映射——与壳 KeybindingRegistry.KEY_MAP 一致 ──

const KEY_MAP: Record<string, string> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Escape: 'escape', Enter: 'enter', Tab: 'tab', Backspace: 'backspace',
  Delete: 'delete', Home: 'home', End: 'end', PageUp: 'pageup', PageDown: 'pagedown',
  ' ': 'space',
};

const MODIFIER_KEYS = new Set(['control', 'shift', 'alt', 'meta']);
const MODIFIER_ORDER = ['ctrl', 'shift', 'alt', 'meta'];

// ── 快捷键表（IPC 同步）──

let keyCache = {
  shortcuts: new Set<string>(),
  chordPrefixes: new Set<string>(),
  chordCombos: new Set<string>(),
};

// ── 防抖：50ms 内同一 keyString 不重复转发（Electron 偶发 before-input-event 双触发）──

let _lastForwarded = { keyString: '', time: 0 };

function shouldDedup(keyString: string): boolean {
  const now = Date.now();
  if (keyString === _lastForwarded.keyString && (now - _lastForwarded.time) < 50) {
    return true;
  }
  _lastForwarded = { keyString, time: now };
  return false;
}

// ── Chord 状态机（主进程侧——与壳 _chordState 并行但独立）──

let _chordState: { isPending: false } | { isPending: true; firstKey: string; timer: ReturnType<typeof setTimeout> } =
  { isPending: false };

function clearMainChord(): void {
  if (_chordState.isPending) {
    clearTimeout(_chordState.timer);
    _chordState = { isPending: false };
  }
}

/** Electron Input → 壳 KeyboardInput 形状 */
function inputToKeyboardInput(input: Input): KeyboardInput {
  return {
    ctrlKey: input.control,
    shiftKey: input.shift,
    altKey: input.alt,
    metaKey: input.meta,
    key: input.key,
    code: input.code,
  };
}

/** 纯数据 → 规范化快捷键字符串——与壳 keyboardInputToKeyString 逻辑一致 */
function keyboardInputToKeyString(input: KeyboardInput): string {
  const parts: string[] = [];
  if (input.ctrlKey) parts.push('ctrl');
  if (input.shiftKey) parts.push('shift');
  if (input.altKey) parts.push('alt');
  if (input.metaKey) parts.push('meta');

  if (!input.key) return '';
  const key = KEY_MAP[input.key] ?? input.key.toLowerCase();
  if (MODIFIER_KEYS.has(key)) return '';

  parts.push(key);
  return parts
    .sort((a, b) => {
      const ai = MODIFIER_ORDER.indexOf(a);
      const bi = MODIFIER_ORDER.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    })
    .join('+');
}

// ── 公开 API ──

/** 壳通过 IPC 同步快捷键表到主进程 */
export function syncKeybindings(data: KeybindingSyncData): void {
  keyCache.shortcuts = new Set(data.shortcuts);
  keyCache.chordPrefixes = new Set(data.chordPrefixes);
  keyCache.chordCombos = new Set(data.chordCombos);
  debug(`syncKeybindings: ${data.shortcuts.length} shortcuts, ${data.chordPrefixes.length} chordPrefixes, ${data.chordCombos.length} chordCombos`);
  debug(`  shortcuts sample: ${data.shortcuts.slice(0, 5).join(', ')}`);
  debug(`  chordPrefixes: ${data.chordPrefixes.join(', ')}`);
}

/** 处理单个 before-input-event——同步查表 + chord 状态机 */
function handleBeforeInput(event: Event, input: Input, mainWindow: BrowserWindow): void {
  if (input.type !== 'keyDown') return;
  if (input.isAutoRepeat) return; // key repeat 不触发快捷键——防止 toggle 型命令重复翻转

  const ki = inputToKeyboardInput(input);
  const keyString = keyboardInputToKeyString(ki);
  if (!keyString) {
    debug(`before-input: key="${input.key}" code="${input.code}" ctrl=${input.control} shift=${input.shift} alt=${input.alt} → modifier-only, skip`);
    return;
  }
  debug(`before-input: key="${input.key}" code="${input.code}" ctrl=${input.control} shift=${input.shift} alt=${input.alt} → "${keyString}" | inShortcuts=${keyCache.shortcuts.has(keyString)} inChordPrefix=${keyCache.chordPrefixes.has(keyString)} chordPending=${_chordState.isPending}`);

  const forward = () => {
    if (shouldDedup(keyString)) {
      debug(`  → dedup skip: "${keyString}" already forwarded within 50ms`);
      return;
    }
    debug(`  → SEND keyboard:executeShortcut to shell`);
    mainWindow.webContents.send('keyboard:executeShortcut', ki);
  };

  // ── Chord 第二键 ──
  if (_chordState.isPending) {
    debug(`chord-2nd: "${keyString}" (pending firstKey="${_chordState.firstKey}")`);
    // 同一按键重复（key repeat）→ 忽略
    if (keyString === _chordState.firstKey) {
      event.preventDefault();
      return;
    }
    const firstKey = _chordState.firstKey;
    clearMainChord();
    const fullChord = `${firstKey} ${keyString}`;
    debug(`  fullChord="${fullChord}" in cache? ${keyCache.chordCombos.has(fullChord)}`);
    if (keyCache.chordCombos.has(fullChord)) {
      event.preventDefault();
      forward();
      return;
    }
    // chord 第二键不匹配 → 仍转发壳（壳侧显示错误提示）
    event.preventDefault();
    forward();
    return;
  }

  // ── Chord 第一键 ──
  if (keyCache.chordPrefixes.has(keyString)) {
    debug(`  → chord-1st match: "${keyString}", entering chord state`);
    event.preventDefault();
    _chordState = {
      isPending: true,
      firstKey: keyString,
      timer: setTimeout(clearMainChord, CHORD_TIMEOUT),
    };
    forward();
    return;
  }

  // ── 单键匹配 ──
  if (keyCache.shortcuts.has(keyString)) {
    debug(`  → single-key match: "${keyString}", forwarding to shell`);
    event.preventDefault();
    forward();
    return;
  }

  // 不是已知快捷键 → 放行给插件 WebView
  debug(`  → no match, pass through`);
}

/**
 * 初始化键盘路由——在 WindowManager + PluginViewRegistry 创建后调用。
 * 仅在插件 WebContentsView 上注册 before-input-event（壳自己的 keydown listener 正常工作）。
 * Monkey-patch pluginViewRegistry.registerPlugin 确保动态创建的插件也自动注册。
 */
export function initKeyboardRouting(
  mainWindow: BrowserWindow,
  pluginViewRegistry: PluginViewRegistry,
): void {
  const registerOnView = (view: WebContentsView): void => {
    view.webContents.on('before-input-event', (event, input) => {
      handleBeforeInput(event, input, mainWindow);
    });
  };

  // 已有插件 WebView
  for (const pluginId of pluginViewRegistry.getAllPluginIds()) {
    const view = pluginViewRegistry.getView(pluginId);
    if (view) registerOnView(view);
  }

  // 动态创建的插件 WebView——monkey-patch registerPlugin
  const _origRegister = pluginViewRegistry.registerPlugin.bind(pluginViewRegistry);
  pluginViewRegistry.registerPlugin = (pluginId: string, url: string, force?: boolean) => {
    const view = _origRegister(pluginId, url, force);
    registerOnView(view);
    return view;
  };
}
