# Phase 7a — 多 WebView 架构

> 2026-07-22。从 [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) §二 7a 展开。
> 引用 [Phase 5.5 ErrorBoundary 增强计划](../phase5.5_交互对标/V3-Phase5.5-ErrorBoundary增强计划.md) §六——多 WebView 是防线第四层。
>
> **性质：** 进程级隔离——对标 VS Code Extension Host。Phase 6 的 ErrorBoundary 是安全气囊（崩了兜底），多 WebView 是防火墙（崩了不波及）。

---

## 一、物理现实——单 WebView 的硬天花板

Phase 5.5 ErrorBoundary 增强计划 §二 列了四类攻击。多 WebView 改变了什么：

| 攻击类型 | 单 WebView（Phase 1-6） | 多 WebView（Phase 7+） |
|------|------|------|
| React render 异常 | ErrorBoundary 捕获 → fallback | ErrorBoundary 捕获 → fallback（不变） |
| `while(true){}` 死循环 | **整个软件卡死**——同线程 JS 全停 | **只死那个插件**——其他 WebView 继续跑 |
| 内存泄漏 | 全局 JS heap 膨胀 | 泄漏限制在插件自己的 WebView 内 |
| `window` / DOM 篡改 | 无法防御（同 JS context） | 每个插件独立 context——篡改只影响自己 |
| 插件卸载 | React 组件 unmount | **整个 WebView 销毁**——物理清空 JS heap |

---

## 二、自由度原则——Encaron 定调

> **多 WebView 不影响插件"能做什么"（广度自由度），只影响"做一件事要几步"（步骤自由度）。**

```
单 WebView：
  读串口状态 → useSerialContext() → 一行 import

多 WebView：
  读串口状态 → IPC 请求 → 壳返回状态 → 三行桥接代码

差异 = AI 多写两行代码。不是能力变少，是路径变长。
```

**Phase 7 的应对：** IPC 代码生成模板。声明"我需要读串口状态"→ AI 生成 IPC 调用。人看到的仍然是 `const status = useSerialContext()`——Hook 内部走 IPC 还是直接 import，调用方不感知。

---

## 三、架构设计

### 3.1 WebView 拓扑

```
┌─────────────────────────────────────────┐
│              壳 WebView                   │
│  App.tsx / IconBar / SidePanel / TabBar  │
│  + 核心服务（Config/Command/Menu/Events） │
│  + 数据管道（DataPipeline）              │
└──────┬──────────┬──────────┬────────────┘
       │ IPC      │ IPC      │ IPC
       ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ terminal │ │ file-tree│ │  theme   │
│ WebView  │ │ WebView  │ │ browser  │
│          │ │          │ │ WebView  │
└──────────┘ └──────────┘ └──────────┘
```

- **壳 WebView：** 标签页 + 分屏 + 图标栏 + 侧栏 + 状态栏 + 所有核心服务
- **插件 WebView：** 只有插件自己的 React 组件。通过 IPC 使用核心服务
- **数据管道：** 数据到达壳 WebView → 通过 IPC 推给订阅的插件 WebView

### 3.2 IPC 协议

```typescript
// IPC 消息格式（壳 ↔ 插件 WebView）
interface IpcMessage {
  type: "request" | "response" | "event";
  id: string;            // 请求-响应配对 ID
  channel: string;       // "config:get" / "command:execute" / "data:push"
  payload: unknown;
  error?: string;
}

// 壳侧——IpcBridge（在壳 WebView 中运行）
class IpcBridge {
  // 配置
  async getConfig(key: string): Promise<unknown>;
  async setConfig(key: string, value: unknown): Promise<void>;

  // 命令
  async executeCommand(id: string, ...args: unknown[]): Promise<unknown>;

  // 数据
  onData(callback: (data: DataPacket) => void): Disposable;

  // 事件
  onEvent(event: string, callback: (payload: unknown) => void): Disposable;
}
```

### 3.3 插件侧的消费

```typescript
// plugins/terminal/index.tsx —— 在多 WebView 中运行
// 改前（单 WebView）：
import { useSerialContext } from "./SerialContext";
const { status, openSource } = useSerialContext();

// 改后（多 WebView）：
import { ipc } from "@src/core/IpcBridge";  // ← 这是 AI 生成的模板代码
const { status, openSource } = useIpcSerialContext(); // ← Hook 封装了 IPC

// useIpcSerialContext 内部：
function useIpcSerialContext() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    // 订阅壳侧的 SourceState 变化
    const sub = ipc.onEvent("source-state-changed", (payload) => {
      setStatus(payload);
    });
    // 初始值
    ipc.executeCommand("source:getStatus").then(setStatus);
    return () => sub.dispose();
  }, []);
  return {
    status,
    openSource: (name, config) => ipc.executeCommand("source:open", { name, config }),
    closeSource: () => ipc.executeCommand("source:close"),
  };
}
```

**关键：** `useIpcSerialContext` 和原来的 `useSerialContext` 接口完全相同——调用方不需要知道下面是 IPC 还是直接 import。**这是 AI 的工作——不是插件开发者的工作。**

---

## 四、Tauri v2 实现

### 4.1 Rust 侧（`lib.rs`）

```rust
// 壳 WebView = 默认 WebView（tauri.conf.json 的 main window）
// 插件 WebView = 运行时动态创建

use tauri::WebviewBuilder;

#[tauri::command]
fn create_plugin_webview(plugin_id: String) -> Result<(), String> {
    let app_handle = ...;  // Tauri AppHandle
    let webview = WebviewBuilder::new(
        "plugin-webview",  // label
        tauri::WebviewUrl::App(format!("index.html?pluginId={}", plugin_id).into()),
    )
    .auto_resize()
    .build()?;
    Ok(())
}

#[tauri::command]
fn destroy_plugin_webview(plugin_id: String) -> Result<(), String> {
    // 找到对应 label 的 WebView → close
}
```

### 4.2 IPC 通道

Tauri v2 的 WebView 间通信走 `events`：

```typescript
// 壳 WebView → 插件 WebView
import { emit } from "@tauri-apps/api/event";
emit(`plugin:${pluginId}:ipc`, { type: "response", id: "1", channel: "config:get", payload: "dark" });

// 插件 WebView 监听
import { listen } from "@tauri-apps/api/event";
listen(`plugin:${pluginId}:ipc`, (event) => { ... });
```

---

## 五、迁移策略

### 5.1 现有插件迁移（7a 步 4）

| 插件 | IPC 调用 | 改动量 |
|------|------|:--:|
| terminal | useSerialContext → useIpcSerialContext + useSendData → ipc.send | 中（~50 行） |
| marketplace | 读 plugin.json 列表 → ipc.getConfig | 低（~10 行） |
| settings | 读/写配置 → ipc.getConfig / ipc.setConfig | 低（~10 行） |

### 5.2 新插件——零迁移成本

7b 文件树、7c 主题浏览器、7d 通知面板——全在独立 WebView 里诞生。不需要先单线程再改 IPC。

---

## 六、和 ErrorBoundary 的关系

| | ErrorBoundary（P6a） | 多 WebView（P7a） |
|------|------|------|
| 级别 | 组件级 | 进程级 |
| 挡什么 | React render 异常 | 死循环 / 内存泄漏 / DOM 篡改 |
| 崩了怎样 | 那个组件显示 fallback | 那个插件的整个 WebView 显示 fallback |
| 对标 | VS Code "Reload" 按钮 | VS Code Extension Host 进程 |

**两层不替代——互补：**
- ErrorBoundary → 挡住 90% 的崩溃（render 异常）
- 多 WebView → 挡住剩下的 10%（死循环/内存泄漏/DOM 篡改）

---

## 七、验证标准

```
1. terminal / marketplace / settings 各在独立 WebView 中
   → Chrome DevTools → Elements → 三个独立的 <webview> 或 iframe 元素

2. terminal render() 抛异常
   → 只有终端崩了 → [重试] 只重载终端 WebView
   → 设置标签页 / 插件市场 / 文件树 全部正常

3. terminal 写 while(true){}
   → 只有终端 WebView 卡死
   → 设置还能打开 → 齿轮菜单还能卸载终端

4. 卸载 terminal → 对应 WebView 销毁 → JS heap 回收到基线
   → 之前的内存泄漏全部清空

5. IPC 延迟：
   → 串口收发（数据管道 IPC 推送）→ 无明显延迟（< 16ms per frame）
```

---

## 八、相关文档

- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — 主设计文档
- [Phase 5.5 ErrorBoundary 增强计划](../phase5.5_交互对标/V3-Phase5.5-ErrorBoundary增强计划.md) — 多 WebView 是防线第四层（§六）
- [多 WebView 迁移规则](memory:multi-webview-migration-rules.md) — Phase 6 起遵守的 import 规则
