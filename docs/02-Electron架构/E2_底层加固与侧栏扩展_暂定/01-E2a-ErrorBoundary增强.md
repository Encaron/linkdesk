# E2a — ErrorBoundary 增强

> 2026-07-24。从旧 P6a 迁移，适配 Electron。
> **性质：安全气囊——不限制插件能力，崩了兜底，不崩不存在。** 零架构改动，纯 TS/React。

---

## 一、现状

| 渲染点 | ErrorBoundary 覆盖 | 文件 |
|------|:--:|------|
| 主区插件视图 | ✅ 有 | `MainContent.tsx:64` |
| 主区壳视图（欢迎页/插件详情）| ❌ 无 | `MainContent.tsx:52-56` |
| 侧栏 | ❌ 无 | `SidePanel.tsx:43` |
| JS 主线程死循环 | ❌ 无检测 | — |
| 内存泄漏 | ❌ 无监控 | — |

当前 ErrorBoundary 只有 39 行：`getDerivedStateFromError` → 显示静态文字 "模块加载失败，请重启应用"。没有 pluginId、没有 componentDidCatch 日志、没有重试按钮。

---

## 二、任务清单

### 任务 1：ErrorBoundary 增强（~50 行）

**文件：** `src/components/shared/ErrorBoundary.tsx`

| 改动 | 说明 |
|------|------|
| 加 `pluginId?: string` prop | fallback 显示 "「终端」已崩溃 [重试]" |
| 加 `componentDidCatch` | 控制台输出完整 error stack（AI 友好） |
| 加 `handleRetry` + `[重试]` 按钮 | 对标 VS Code "Reload" 按钮 |
| `fallback` prop | 允许调用方自定义 fallback UI |

### 任务 2：主区壳视图包 ErrorBoundary（~10 行）

**文件：** `src/components/MainContent.tsx`

- 欢迎页 → `<ErrorBoundary pluginId="welcome">`
- 插件详情 → `<ErrorBoundary pluginId={tab.detailPluginId}>`

### 任务 3：侧栏包 ErrorBoundary（~5 行）

**文件：** `src/components/SidePanel.tsx`

```tsx
// 改后：
<ErrorBoundary pluginId={effectivePluginId}>
  <SidebarComponent />
</ErrorBoundary>
```

### 任务 4：现有主区插件补 pluginId（~5 行）

**文件：** `src/components/MainContent.tsx`

```tsx
// 改后：
<ErrorBoundary pluginId={tab.pluginId}>
  <plugin.component ... />
</ErrorBoundary>
```

### 任务 5：心跳看门狗——Electron 版（~50 行）

**旧 P6a 是 Rust 心跳。新框架：Electron main process 心跳检测。**

**TS 端（`src/hooks/useHeartbeat.ts`，~30 行）：**

```typescript
// App.tsx mount 时启动
export function useHeartbeat() {
  useEffect(() => {
    const interval = setInterval(() => {
      window.linkdesk.events.heartbeat();
    }, 500);
    return () => clearInterval(interval);
  }, []);
}
```

**Electron main 端（`electron/main.ts`，~20 行）：**

```typescript
let lastHeartbeat = Date.now();

ipcMain.on('heartbeat', () => {
  lastHeartbeat = Date.now();
});

setInterval(() => {
  if (Date.now() - lastHeartbeat > 2000 && lastHeartbeat !== 0) {
    dialog.showMessageBox({
      type: 'warning',
      title: '应用无响应',
      message: 'LinkDesk 界面无响应',
      buttons: ['刷新', '等待']
    }).then(({ response }) => {
      if (response === 0) app.relaunch();
    });
  }
}, 1000);
```

**限制：** 这是检测，不是恢复。JS 死循环只能检测到，无法杀掉。E3（多 WebView）后可以只重载死循环的 WebView。

### 任务 6：内存监控（~30 行）

**文件：** `src/hooks/useMemoryMonitor.ts`（新建）

```typescript
export function useMemoryMonitor() {
  const baselines = useRef(new Map<string, number>());

  useEffect(() => {
    const interval = setInterval(() => {
      if (!performance.memory) return;
      const used = performance.memory.usedJSHeapSize;
      const limit = performance.memory.jsHeapSizeLimit;
      if (used / limit > 0.8) {
        toast.warning(`内存使用 ${(used/1024/1024).toFixed(0)}MB / ${(limit/1024/1024).toFixed(0)}MB`);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, []);
}

// 插件 mount → 记录基线
export function recordMount(pluginId: string) {
  if (!performance.memory) return;
  baselines.current.set(pluginId, performance.memory.usedJSHeapSize);
}

// 插件 unmount → 对比基线
export function recordUnmount(pluginId: string): { delta: number } {
  if (!performance.memory) return { delta: 0 };
  const baseline = baselines.current.get(pluginId);
  if (baseline === undefined) return { delta: 0 };
  baselines.current.delete(pluginId);
  return { delta: performance.memory.usedJSHeapSize - baseline };
}
```

**限制：** `performance.memory` 只在 Chromium 内核可用。只检测趋势，不能定位泄漏源。GC 运行时机影响 mount/unmount 对比精度。

---

## 三、汇总

| # | 任务 | 文件 | 行数 |
|:--:|------|------|:--:|
| 1 | ErrorBoundary 增强 | `ErrorBoundary.tsx` | +50/−10 |
| 2 | 主区壳视图包 ErrorBoundary | `MainContent.tsx` | +10 |
| 3 | 侧栏包 ErrorBoundary | `SidePanel.tsx` | +5 |
| 4 | 主区插件补 pluginId | `MainContent.tsx` | +5 |
| 5 | 心跳看门狗（Electron 版） | `useHeartbeat.ts` + `electron/main.ts` | +50 |
| 6 | 内存监控 | `useMemoryMonitor.ts` | +30 |
| **合计** | | | **~140 行** |

---

## 四、验证标准

```
ErrorBoundary：
  故意在 terminal 插件 render() 抛异常
    → fallback 显示 "「终端」已崩溃 [重试]"
    → 控制台输出完整 error stack
    → 其他标签页正常交互
    → 侧栏同理

心跳：
  终端插件写 while(true){}
    → 2s 后弹出原生对话框 "应用无响应" [刷新] [等待]
    → 点刷新 → 软件重启
    （E3 后改为只重载死循环的 WebView）

内存监控：
  全局 JS heap > 80% 限制 → toast 告警
  插件 mount → 记录基线，unmount → 对比
```

---

## 五、防线对插件自由度的实际影响

| 防线 | 类型 | 对插件开发的影响 |
|------|------|------|
| Error Boundary | 安全气囊 | 零影响。崩了兜底，不崩不存在 |
| 心跳看门狗 | 安全气囊 | 零影响。后台运行 |
| 内存监控 | 安全气囊 | 零影响。后台采样 |

**一条不跨越的线：** 不定义 `@linkdesk/api` 作为唯一合法 import 入口。防御是安全气囊，不是笼子。

---

> **← E2 索引：** `00-README.md`
> **→ 下一份：** `02-E2b-终端归一化.md`
