# E3j #77a-77b：events 归一化 + 双份渲染无害共存

> 2026-07-28。E3j #77（终端数据上桌）的补完——#77a 归一化 + #77b 双份渲染。
> 两任务合写一份文档——#77a 是纯重构铺垫，#77b 消费它。

---

## 背景

### 当前状态

#77 给 `preload-plugin.ts` 加了 `events.on/emit`，让插件能收发大厅事件。串口监视器收到数据后 `emit('serial:rawData', ...)` → 主进程广播 → 所有插件 WebView 可订阅。

测试时发现壳崩溃，根因：串口监视器有**双份渲染**：

| 实例 | 运行环境 | preload | events.emit |
|------|---------|---------|:--:|
| WebView 实例 | 独立 WebContentsView | preload-plugin.js | ✅ 存在 |
| React fallback | 壳主窗口 DOM | preload-shell.js | ❌ 不存在（#77 前） |

壳里的 fallback 实例调 `events.emit` → 壳 preload 没这个方法 → 崩溃。

### 临时修复（已完成）

给 `preload-shell.ts` 补了 `events.on/emit` + `plugin:push` 监听器。不崩了。但留下两个问题：

1. **未归一化**：`events.on/emit` + 订阅管理的代码在 `preload-plugin.ts` 和 `preload-shell.ts` 各写一遍——复制粘贴。改一处忘一处 = 又一个缝 bug。
2. **重复发射**：两个实例都收到串口数据 → 两个实例都 `emit('serial:rawData')` → 协议插件收到**重复数据**（每包两次）。

---

## #77a：events 归一化——提取共享模块

### 目标

一份代码，两处 import。消复制粘贴。

### 设计

新建 `electron/event-system.ts`：

```typescript
export function createEventSystem(ipcRenderer, options): { on, emit }
```

- `subscriptions: Map<channel, Set<callback>>` ——内部管理
- `ipcRenderer.on('plugin:push', ...)` ——集中分发
- `extraHandlers` ——可选额外处理器（theme:changed CSS 注入 / lang:changed 缓存）
- 返回 `{ on, emit }` ——标准 API

**preload-plugin.ts 使用：**
```typescript
const events = createEventSystem(ipcRenderer, {
  logPrefix: 'preload-plugin',
  extraHandlers: {
    'theme:changed': (payload) => { /* CSS 变量注入 */ },
    'lang:changed': (payload) => { /* 缓存 + 通知订阅者 */ },
  },
});
```

**preload-shell.ts 使用：**
```typescript
const events = createEventSystem(ipcRenderer, {
  logPrefix: 'preload-shell',
  // 无 extraHandlers——壳不需要 theme:changed / lang:changed 自动处理
});
```

### 改动清单

| 文件 | 操作 | 行数 |
|------|------|:--:|
| `electron/event-system.ts` | 🆕 新建 | ~80 |
| `electron/preload-plugin.ts` | 删旧手写，改 import | -40/+10 |
| `electron/preload-shell.ts` | 删旧手写，改 import | -17/+5 |

### 验证

- `npm run check` 零错误
- 串口监视器收发正常
- 壳 DevTools `events.on('serial:rawData', ...)` 收到数据
- 主题/语言切换正常（extraHandlers 不变）

---

## #77b：双份渲染无害共存——fallback 只渲染不发射

### #58/#58e 完整历史——为什么这个问题捅了 4 次

双份渲染不是今天才有的。从 E3f 做多 WebView 开始，它反复出问题、反复修、反复回退：

```
#58d d1c8685  feat: MainContent 集成，React 组件换空 div
       ad8f4d1  → 有问题
       ──→ revert (d1c8685) 🔙 第一条回退

#58e 21cd866  feat: 关掉 React fallback——有 WebView 的插件不再渲染 React 副本
       67da5da  fix: ref 改 useState——修第二帧空白 bug
       → 修完还是空白
       ca5c538  revert 🔙 第二条回退——用 git checkout 逐 commit 二分定位根因

       a52085f  fix: 正确实现——WebView ready 信号驱动 React fallback 切换
             6 文件信号链：WebView 渲染完→notifyReady→壳收到→切空 div
       fffac1c  fix: ErrorBoundary + requestAnimationFrame 保底
             plugin-shell 崩了不发 ready→fallback 继续兜底

E3j #77 现在     events.emit 触发壳 fallback 的 SerialContext→崩溃
       d14bfe4  fix: 壳 preload 加 events.on/emit（临时止血）
```

**为什么每次都捅到这里：** 双份渲染的根因是 `_initIPC()` 是模块级的——一次初始化，永不清理。#58e 的 ready 信号链能在 WebView 就绪后把 DOM 换成空 div，但 `ipcRenderer.on` 监听器已经注册了，清不掉。这次 #77 加了 `events.emit`，监听器从"只是浪费 CPU"变成"会爆炸"。

**#77b 和之前的区别：** 不试图关掉渲染、不依赖异步 ready 信号。从 `_initIPC` 一开始就用 `isPluginWebView` 守卫区分身份——不是"后来关掉"，是"一开始就知道自己是谁"。

### 教训回顾

**#58e 尝试过"关掉 React fallback"——失败了。** 回退原因：

> WebView 就绪后自然覆盖 React 组件——不需要手动关掉 React 渲染。React 是安全网。
> **渐进增强 ≠ 断崖切换。** 正确做法：保持 React fallback 永远渲染。WebView 通过 `setVisible(true)` + `setBounds` 覆盖在上面。用户看到的是 WebView 内容，但 React 始终兜底。

结论：**React fallback 是安全网，不能关。**

### 问题

不关 fallback，但 fallback 实例在**重复工作**：

| 行为 | WebView 实例 | shell fallback 实例 | 结果 |
|------|:--:|:--:|------|
| 渲染 UI（CM6、工具栏） | ✅ | ✅（被 WebView 盖住） | 无害 |
| 订阅串口数据 | ✅ | ✅ | 无害（写入隐藏 DOM） |
| **emit('serial:rawData')** | ✅ | ✅ | **重复！协议插件收到两份** |

### 设计

**shell fallback 只做安全网该做的事——渲染 UI 骨架。数据和事件留给 WebView 实例处理。**

判别方法参考已有 #58e 信号链（commit `a52085f`）：
- `preload-plugin.ts` 有 `pluginViews.notifyReady` ——插件 WebView 专有
- `preload-shell.ts` 有 `pluginViews.onReady` ——壳专有（接收 ready 信号用）
- `notifyReady` 不存在于壳 → 用这个区分

**为什么和 #58e 不冲突：** #58e 的信号链是异步的——WebView 加载完才发 ready → 壳切到空 `<div>`。
但在 ready 之前，壳的 React 已经跑了一遍 `SerialContext._initIPC()`。
`_initIPC` 是模块级的（`_initialized` guard），一旦初始化就永不清理。
即使壳后来切到空 div、组件 unmount，IPC 监听器仍在。

所以 #77b 的 `isPluginWebView` 守卫在更早的时机（`_initIPC` 时）就区分了身份——从一开头就不发射，不依赖 ready 信号时序。

在 `SerialContext._initIPC()` 中：

```typescript
// #77b：仅 WebView 实例推数据到大厅——shell fallback 不发射，避免重复
const isPluginWebView = typeof (window as any).linkdesk?.pluginViews?.notifyReady === 'function';

s.onData?.((text: string) => {
  // 两个实例都接收数据用于自身显示（fallback 是安全网）
  // 但只有 WebView 实例发射到大厅——避免协议插件收到重复数据
  if (isPluginWebView) {
    (window as any).linkdesk?.events?.emit("serial:rawData", {
      sourceName: _sharedState.sourceName,
      text,
    });
  }
});
```

**为什么安全网仍然有效：** WebView 崩了 → `notifyReady` 不会被调用 → 但 React fallback 照样渲染 UI → 用户至少能看到界面框架和以前的输出。数据虽然不推大厅，但自己的显示仍然正常（`onData` 回调继续写 ringBuffer）。

### 改动清单

| 文件 | 操作 | 行数 |
|------|------|:--:|
| `plugins/serial-monitor/src/SerialContext.tsx` | `onData` emit 加 `isPluginWebView` 守卫 | +4 |

### 验证

- `npm run check` 零错误
- 串口监视器收发正常
- 壳 DevTools `events.on('serial:rawData', ...)` → 收到数据
- 协议插件订阅 `serial:rawData` → 收到数据

### 🔥 #77b 实际结果与教训

**实测推翻了设计假设。** 串口数据不是"两处都到"——只到**打开串口的那个 webContents**。
当前场景下数据到壳 → emit 在壳 → 不重复。#77b 的守卫反而把唯一管道堵了。

**已回退守卫**（commit `3eea884`）。正确的结论：
- 串口数据只到一个地方（谁 openPort 谁收数据）→ 不存在重复 emit
- 崩的根因是壳缺 `events.emit`（#77a 修复），不是重复
- #77b 的设计文档保留作为记录——假设如何被推翻、为什么守卫是错的
