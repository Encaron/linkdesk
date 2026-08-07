# IPC 监听器生命周期审计——E5.5#0c

> 📖 **两个已知 bug 模式：**
> 1. [[contextbridge-isolated-world-bug]]——`contextBridge.exposeInMainWorld` 的对象在 preload 隔离世界不可用
> 2. [[e5-multi-webview-6-bugs]] Bug 4——`notifyReady` IPC 在 React useEffect 注册 `onReady` 之前到达，事件静默丢失

## Bug 模式 1：contextBridge 隔离世界

```
preload 隔离世界（preload-plugin.ts）
  ↓ contextBridge.exposeInMainWorld('linkdesk', {...})
渲染进程主世界（插件 React 代码）
  window.linkdesk ✅  这里可以访问

preload 隔离世界的 ipcRenderer.on 回调：
  window.linkdesk ❌  隔离世界和主世界 window 不互通！
```

**正确做法（已修复）：**

```typescript
// 模块级变量——两个世界共享同一个引用
const _handlers = new Map();  // preload 隔离世界可访问
contextBridge.exposeInMainWorld('linkdesk', {
  handle: (ch, fn) => _handlers.set(ch, fn)  // 主世界调 handle → 隔离世界的 _handlers 变
});
ipcRenderer.on('plugin:request', (event, data) => {
  const handler = _handlers.get(data.channel);  // 直接读模块级变量 ✅
});
```

## Bug 模式 2：notifyReady 竞态

```
时间线：
  t=0ms  WebView 创建
  t=50ms plugin-shell-main.tsx 加载完毕 → notifyReady() → IPC 到主进程
  t=51ms 主进程转发 plugin-view:ready 到壳
  t=52ms 壳 preload-shell.ts 收到事件 → push 到 _readyBuffer
  
  t=100ms React mount → MainContent useEffect → 注册 onReady 回调
  t=101ms onReady 回调被调用 → 回放 _readyBuffer → pluginId 加入 readyWebViewIds
  
  如果没有 t=52ms 的缓冲：
  t=51ms 事件到达 → 此时 onReady 还没注册 → 事件丢失 → pluginId 永不加入 readyWebViewIds
```

**正确做法（已修复——preload-shell.ts）：**

```typescript
// 模块级常驻监听 + 缓冲回放
const _readyBuffer: string[] = [];
let _onReadyCallback: ((pluginId: string) => void) | null = null;

// 常驻——不管 React mount 了没有，事件不会丢
ipcRenderer.on('plugin-view:ready', (_event, pluginId) => {
  if (_onReadyCallback) {
    _onReadyCallback(pluginId);  // 回调已注册 → 直接调
  } else {
    _readyBuffer.push(pluginId);  // 还没注册 → 缓冲
  }
});

// onReady 注册时回放缓冲
contextBridge.exposeInMainWorld('linkdesk', {
  pluginViews: {
    onReady: (cb) => {
      _onReadyCallback = cb;
      _readyBuffer.forEach(id => cb(id));  // 回放
      _readyBuffer.length = 0;
    }
  }
});
```

## 审计范围

### 1. preload-plugin.ts——所有 IPC 监听器

- [ ] `ipcRenderer.on` 全部在模块顶层（`createEventSystem` 封装内），不在 React useEffect
- [ ] IP C 回调中访问的状态全部用模块级变量，不通过 `window.linkdesk` 回读
- [ ] `createEventSystem` 内部正确缓冲 mount 前事件

### 2. preload-shell.ts——壳侧监听器

- [ ] `_readyBuffer` 缓冲模式正确——`onReady` 注册前事件不丢失
- [ ] `plugin-view:ready` 监听器常驻（模块级，不在 contextBridge 回调内）
- [ ] 其他需要缓冲的 IPC 事件（如有）使用相同模式

### 3. IpcBridgeHandler.ts——壳侧 React 监听器

- [ ] `_refCount` 引用计数正确——StrictMode 双重 mount/unmount 不导致双重注册（E5#103 已修复）
- [ ] `useEffect` cleanup 正确调 `unregisterIpcBridgeHandler()`
- [ ] 无模块级 `_initialized` guard 阻止第二次 mount 注册

### 4. 硬约束检查

- [ ] 硬约束#19：无模块级 `_initialized` guard + IPC 监听器注册
- [ ] 硬约束#20：preload 脚本 IPC 监听器在模块顶层，用缓冲+回放

## 验证

- [ ] `grep "ipcRenderer\.on" electron/preload-*.ts` → 全部在模块顶层或 createEventSystem 内
- [ ] preload 代码中无 `window.linkdesk` 回读（contextBridge 隔离世界 bug 不复现）
- [ ] IpcBridgeHandler 在 StrictMode 下无双重注册 warning
- [ ] `notifyReady` 在任何时序下都正确送达（快速启动 + 慢速启动）

## 相关

- [[contextbridge-isolated-world-bug]]
- [[e5-multi-webview-6-bugs]] Bug 4
- [[webview-ready-whitelist-lifecycle]]
