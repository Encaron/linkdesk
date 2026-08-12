/**
 * OverlayWindow preload 脚本——E5.6#21c。
 *
 * OverlayWindow = 哑渲染器。不执行业务逻辑，不知道渲染的内容是什么。
 * 对标 Pool 的 Path B 哲学——壳推布局，池被动渲染。
 * 这里：壳推 OverlayCommand，OverlayWindow 被动渲染对应浮层容器。
 *
 * API 表面（contextBridge 白名单）：
 *   ✅ overlay.ready()     — 就绪信号（缓冲回放——防 IPC 早于 React mount 竞态）
 *   ✅ overlay.onCommand() — 接收渲染命令
 *   ✅ events.on()          — 主题/语言被动接收
 *   ❌ filesystem / tabs / commands / workspace / clipboard ——不需要
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 🔥 缓冲回放——对标 preload-pool.ts 的 _layoutBuffer + onLayout 模式
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * 壳的 overlay:render IPC 可能在 React mount 前到达。
 * overlay.ready() 调用前——所有命令入 _commandBuffer。
 * overlay.onCommand(cb) 注册后先回放缓冲中的命令，再切换到实时推送。
 */

import { contextBridge, ipcRenderer } from 'electron';

// ── 缓冲回放 ──
const _commandBuffer: Array<{ requestId: string; type: string; payload: unknown }> = [];
let _onCommandCallback: ((cmd: { requestId: string; type: string; payload: unknown }) => void) | null = null;
let _ready = false;

// ── overlay.ready()——就绪信号 ──
function ready(): void {
  if (_ready) return;
  _ready = true;
  // 回放缓冲中的命令
  if (_onCommandCallback) {
    for (const cmd of _commandBuffer) {
      try { _onCommandCallback(cmd); } catch { /* contextBridge 回调静默失败 */ }
    }
    _commandBuffer.length = 0;
  }
}

// ── overlay.onCommand(cb)——React mount 时注册回调 ──
function onCommand(cb: (cmd: { requestId: string; type: string; payload: unknown }) => void): void {
  _onCommandCallback = cb;
  // 如果 ready() 在 onCommand() 之前被调用——立即回放
  if (_ready && _commandBuffer.length > 0) {
    for (const cmd of _commandBuffer) {
      try { cb(cmd); } catch { /* 静默 */ }
    }
    _commandBuffer.length = 0;
  }
}

// ── 监听 overlay:render IPC——来自主进程中继 ──
ipcRenderer.on('overlay:render', (_event, data: { requestId: string; type: string; payload: unknown }) => {
  if (_ready && _onCommandCallback) {
    // 实时模式——直接推给 React
    try { _onCommandCallback(data); } catch { /* 静默 */ }
  } else {
    // 缓冲模式——React 还未就绪
    _commandBuffer.push(data);
  }
});

// ── 事件监听——主题/语言被动接收（对标 preload-pool extraHandlers）──
// 🔥 已知限制（E5.6#21 自检）：IpcBridge.broadcast() 当前不覆盖 OverlayWindow——
// plugin:push 不会到达此进程。#23 实施时壳侧需显式推送 theme:changed/lang:changed
// 到 OverlayWindow（对标壳 pushLayout 给 Pool 的模式）。
// 简化实现：直接监听 IPC channel，不引入完整 event-system.ts。
const _eventCallbacks = new Map<string, Set<(payload: unknown) => void>>();

ipcRenderer.on('plugin:push', (_event, data: { channel: string; payload: unknown }) => {
  const cbs = _eventCallbacks.get(data.channel);
  if (cbs) {
    for (const cb of cbs) {
      try { cb(data.payload); } catch { /* 静默 */ }
    }
  }
});

const events = {
  on(channel: string, cb: (payload: unknown) => void): () => void {
    let cbs = _eventCallbacks.get(channel);
    if (!cbs) { cbs = new Set(); _eventCallbacks.set(channel, cbs); }
    cbs.add(cb);
    return () => { cbs?.delete(cb); };
  },
};

// ── 向壳发用户操作结果──
function sendResult(requestId: string, type: string, result: unknown): void {
  ipcRenderer.send('overlay:forward-to-shell', { requestId, type, result });
}

// ── contextBridge 暴露 ──
contextBridge.exposeInMainWorld('linkdesk', {
  overlay: { ready, onCommand, sendResult },
  events,
});
