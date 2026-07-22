# Phase 6a — 插件运行时安全

> 2026-07-22。从 [LinkDesk-Phase6-设计.md](./LinkDesk-Phase6-设计.md) §二 6a 展开。
> 引用 [Phase 5.5 ErrorBoundary 增强计划](../phase5.5_交互对标/V3-Phase5.5-ErrorBoundary增强计划.md) 的完整分析。
>
> **性质：** 安全气囊——不限制插件能力，崩了兜底，不崩不存在。零架构改动。

---

## 一、现状

| 渲染点 | ErrorBoundary 覆盖 | 文件 |
|------|:--:|------|
| 主区插件视图 | ✅ 有 | `MainContent.tsx:64` |
| 主区壳视图（欢迎页/插件详情）| ❌ 无 | `MainContent.tsx:52-56` |
| 侧栏 | ❌ 无 | `SidePanel.tsx:43` |
| JS 主线程死循环 | ❌ 无检测 | — |
| 内存泄漏 | ❌ 无监控 | — |

**当前 ErrorBoundary（`ErrorBoundary.tsx`）只有 39 行：** `getDerivedStateFromError` → 显示静态文字"模块加载失败，请重启应用"。没有 pluginId、没有 componentDidCatch 日志、没有重试按钮。

---

## 二、ErrorBoundary 增强

### 2.1 组件改动

```typescript
// ErrorBoundary.tsx — 改动后

interface Props {
  children: ReactNode;
  pluginId?: string;           // ← 新增：用于 fallback 显示插件名
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;         // ← 新增：保存错误对象用于重试
}

class ErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // AI 友好——完整 stack trace 输出到控制台
    const label = this.props.pluginId ? `[${this.props.pluginId}]` : "[unknown]";
    console.error(`${label} 插件崩溃`, error, errorInfo.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="error-boundary-fallback">
          <p>{this.props.pluginId
            ? i18n.t(`「${this.props.pluginId}」已崩溃`)
            : i18n.t("模块加载失败")}</p>
          <button onClick={this.handleRetry}>
            {i18n.t("重试")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### 2.2 覆盖点

**主区壳视图（MainContent.tsx:50-56）：**
```tsx
// 改前：
if (tab.type === "plugin-detail") {
  return <PluginDetailView ... />;  // 崩了白屏
}

// 改后：
if (tab.type === "plugin-detail") {
  return (
    <ErrorBoundary pluginId={tab.detailPluginId}>
      <PluginDetailView ... />
    </ErrorBoundary>
  );
}
```

**侧栏（SidePanel.tsx:43）：**
```tsx
// 改前：
return <SidebarComponent />;  // 崩了侧栏白屏，整个侧栏没了

// 改后：
return (
  <ErrorBoundary pluginId={effectivePluginId}>
    <SidebarComponent />
  </ErrorBoundary>
);
```

**现有主区插件（MainContent.tsx:64）：**
```tsx
// 改前：
<ErrorBoundary>  // 没传 pluginId，崩了不知道是谁
  <plugin.component ... />
</ErrorBoundary>

// 改后：
<ErrorBoundary pluginId={tab.pluginId}>
  <plugin.component ... />
</ErrorBoundary>
```

### 2.3 对标 VS Code

VS Code 扩展崩溃 → 扩展 Host 进程重启 → 主窗口显示 "Extension XXX has been deactivated" + "Reload" 按钮。

LinkDesk ErrorBoundary → fallback 显示"「终端」已崩溃 [重试]" + 控制台 stack。没有进程隔离（单 WebView），但 React Error Boundary 能做到组件级隔离——崩掉的组件卸载，其他组件不受影响。

### 2.4 对齐六项原则

| 原则 | 体现 |
|------|------|
| 精益求精 | 不是"有个 ErrorBoundary 就行"——显示插件名、输出完整 stack、能重试 |
| 归一化 | 所有插件渲染点用同一个 ErrorBoundary 组件（当前主区有、侧栏无——归一化缺失） |
| 插件自由 | ErrorBoundary 不限制插件能力，只在崩溃后兜底 |
| VS Code 化 | 对标 VS Code 扩展崩溃的 "Reload" 按钮 |
| AI 友好 | componentDidCatch 输出完整 error stack → AI 能用 stack trace 定位问题 |
| 易操作 | 用户看到插件名 + 一键重试 |

---

## 三、Rust 心跳看门狗

### 3.1 为什么在 Phase 6

JS 主线程死循环（`while(true){}`）→ 同线程内任何防御代码和攻击代码一起死。唯一检测手段：另一个线程（Rust）等心跳超时。

### 3.2 实现

**TS 端（`src/hooks/useHeartbeat.ts`，~30 行）：**
```typescript
// App.tsx mount 时启动，unmount 时停止
export function useHeartbeat() {
  useEffect(() => {
    const interval = setInterval(() => {
      invoke("heartbeat").catch(() => {});  // 静默——Tauri IPC 失败说明前端死了
    }, 500);
    return () => clearInterval(interval);
  }, []);
}
```

**Rust 端（`src-tauri/src/lib.rs`，~50 行）：**
```rust
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

static LAST_HEARTBEAT: AtomicU64 = AtomicU64::new(0);

#[tauri::command]
fn heartbeat() {
    let now = Instant::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    LAST_HEARTBEAT.store(now, Ordering::Relaxed);
}

// 在 tauri::Builder 的 setup 中启动监控线程：
std::thread::spawn(|| {
    loop {
        std::thread::sleep(Duration::from_secs(1));
        let last = LAST_HEARTBEAT.load(Ordering::Relaxed);
        let now = Instant::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;
        if now - last > 2000 && last != 0 {
            // 弹出原生对话框
            // Tauri v2 api::dialog::message: "应用无响应" [刷新] [等待]
        }
    }
});
```

### 3.3 限制

**这是检测，不是恢复。** Rust 不能杀掉 JS 死循环。用户只能点"刷新"重启软件。对标 VS Code：VS Code 的 Extension Host 进程可以单独杀掉重启——LinkDesk 单 WebView 做不到。这是 Tauri 平台硬边界，Phase 7 多 WebView 才能做到进程级隔离。

---

## 四、内存监控

### 4.1 实现（`src/hooks/useMemoryMonitor.ts`，~30 行）

```typescript
// App.tsx mount 时启动
export function useMemoryMonitor() {
  const baselines = useRef(new Map<string, number>());

  useEffect(() => {
    const interval = setInterval(() => {
      if (!performance.memory) return;  // 非 Chromium 不可用

      const used = performance.memory.usedJSHeapSize;
      const limit = performance.memory.jsHeapSizeLimit;

      // 全局 heap > 80% 限制 → 告警
      if (used / limit > 0.8) {
        toast.warning(`内存使用 ${(used/1024/1024).toFixed(0)}MB / ${(limit/1024/1024).toFixed(0)}MB`);
      }
    }, 10000);  // 每 10 秒采样

    return () => clearInterval(interval);
  }, []);
}

// 插件 mount → 记录基线
export function recordMount(pluginId: string) {
  if (!performance.memory) return;
  baselines.current.set(pluginId, performance.memory.usedJSHeapSize);
}

// 插件 unmount → 对比基线
export function recordUnmount(pluginId: string): MemoryDelta {
  if (!performance.memory) return { delta: 0 };
  const baseline = baselines.current.get(pluginId);
  if (baseline === undefined) return { delta: 0 };
  const current = performance.memory.usedJSHeapSize;
  baselines.current.delete(pluginId);
  return { delta: current - baseline };
}
```

### 4.2 限制

- `performance.memory` 只在 Chromium 内核可用（Tauri Windows 被 WebView2 支持）
- 只是检测趋势，不能定位泄漏源
- mount/unmount 的对比精度受 GC 影响（GC 运行时机不确定）

---

## 五、防线对插件自由度的实际影响

**关键区分：** 防线是"安全气囊"还是"门禁"？

| 防线 | 类型 | 对插件开发的影响 |
|------|------|------|
| Error Boundary | 安全气囊 | 零影响。崩了兜底，不崩不存在 |
| Rust 心跳看门狗 | 安全气囊 | 零影响。后台运行 |
| 内存监控 | 安全气囊 | 零影响。后台采样 |

**一条不跨越的线：** 不定义 `@linkdesk/api` 作为唯一合法 import 入口。`@src/` 永远开放。防御是安全气囊，不是笼子。

---

## 六、相关文档

- [LinkDesk-Phase6-设计.md](./LinkDesk-Phase6-设计.md) — 主设计文档
- [Phase 5.5 ErrorBoundary 增强计划](../phase5.5_交互对标/V3-Phase5.5-ErrorBoundary增强计划.md) — 四层防线完整分析（含多 WebView 迁移规则）
- [LinkDesk-Phase7-多WebView架构.md](../phase7_多WebView与编辑能力/LinkDesk-Phase7-多WebView架构.md) — Phase 7 的进程级隔离（ErrorBoundary 的下一层）
