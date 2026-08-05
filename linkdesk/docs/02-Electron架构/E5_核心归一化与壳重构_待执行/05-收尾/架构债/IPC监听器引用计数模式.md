# IPC 监听器引用计数模式

> 2026-08-06。E5 技术债。
> 位于 E5 收尾 → `05-收尾/架构债/`

---

## 一、问题

`IpcBridgeHandler.ts` 用了模块级 `_initialized` boolean guard 防止 StrictMode 双重注册。但硬约束 #19 要求改为引用计数模式——mount +1 / unmount -1 / 归零时清理。

当前单 WebView 下只 mount 一次不出问题，但模式本身是隐患——如果未来组件多次 mount/unmount（如热加载），第二次 mount 时 `_initialized=true` → IPC handler 不再注册 → 静默失效。

---

## 二、根因

硬约束 #19 的教训来自 E3j #81：模块级 `_initialized` guard 在 WebView fallback 场景中，IPC 监听器注册后永不清理 → 壳 fallback 切空 div 后成为僵尸回调 → IPC 事件来了处理不存在的 DOM → 静默报错。

当前 IpcBridgeHandler 只在 mount 时注册一次 (`_initialized` 设为 true)，但 React StrictMode 或热加载可能让组件多次 mount → 第二次 mount 不会注册 handler。

---

## 三、修复方案

`_initialized` boolean → `_refCount` number：

```typescript
// IpcBridgeHandler.ts
let _refCount = 0;

export function registerIpcHandlers(): void {
  _refCount++;
  if (_refCount > 1) return; // 已注册——只加引用计数
  
  ipcRenderer.on("bridge:config:changed", handleConfigChanged);
  ipcRenderer.on("bridge:plugin:push", handlePluginPush);
  // ... 其他 IPC 监听器
}

export function unregisterIpcHandlers(): void {
  _refCount = Math.max(0, _refCount - 1);
  if (_refCount > 0) return; // 还有引用——保留
  
  ipcRenderer.removeListener("bridge:config:changed", handleConfigChanged);
  ipcRenderer.removeListener("bridge:plugin:push", handlePluginPush);
  // ... 
}
```

**React 端：**

```typescript
// 使用 IpcBridgeHandler 的组件
useEffect(() => {
  registerIpcHandlers();
  return () => unregisterIpcHandlers();
}, []);
```

---

## 四、可能遇到的问题

### 1. 注册和注销的对称性

**风险：** `useEffect` cleanup 在 StrictMode 下调用顺序是 mount → unmount → mount。第一次 mount 注册 → unmount 注销 → 第二次 mount 注册。引用计数工作正常（1→0→1）。

**缓解：** ESLint `linkdesk/no-module-level-ipc-listener` 已拦截模块级 IPC 注册——改为 useEffect 后由规则机械保障。

### 2. 多个组件引用同一 handler

**风险：** 如果两个组件各自 `useEffect` 注册 IpcBridgeHandler，第二个 mount 时 `_refCount > 1` → 跳过注册（已注册）→ 正确。第一个 unmount 时 `_refCount > 0` → 保留 → 正确。最后一个 unmount 时 `_refCount === 0` → 注销 → 正确。

**缓解：** 引用计数天然支持多消费者。

### 3. 和 preload 层 handler 的关系

**风险：** IpcBridgeHandler 是在渲染进程注册的 IPC 监听器。preload 层的 `ipcRenderer.on` 在 `contextBridge.exposeInMainWorld` 之前注册——不受此影响。两套机制独立。

**缓解：** 硬约束 #20 覆盖 preload 层（模块顶层注册+缓冲回放）。本修复只针对渲染进程内的 IpcBridgeHandler。

---

## 五、涉及文件

| 文件 | 改动 |
|:--|:--|
| `src/core/services/IpcBridgeHandler.ts` | `_initialized` → `_refCount` + `registerIpcHandlers/unregisterIpcHandlers` |
| 使用 IpcBridgeHandler 的组件 | `useEffect` 中调 register/unregister |

**改动量：** ~20 行。

---
