# E3a — 多 WebView 进程隔离

> 2026-07-24。从旧 P7a 迁移，适配 Electron。
> **性质：** 进程级隔离——对标 VS Code Extension Host。E2 的 ErrorBoundary 是安全气囊（崩了兜底），多 WebView 是防火墙（崩了不波及）。
> **API 变化：** Tauri `add_child`（unstable）→ Electron `WebContentsView`（stable，Electron 30+）。

---

## 一、物理现实——单 WebView 的硬天花板

| 攻击类型 | 单 WebView（E1-E2） | 多 WebView（E3+） |
|------|------|------|
| React render 异常 | ErrorBoundary 捕获 → fallback | ErrorBoundary 捕获 → fallback（不变） |
| `while(true){}` 死循环 | **整个软件卡死** | **只死那个插件** |
| 内存泄漏 | 全局 JS heap 膨胀 | 泄漏限制在插件自己的 WebView 内 |
| `window` / DOM 篡改 | 无法防御（同 JS context） | 每个插件独立 context |
| 插件卸载 | React 组件 unmount | **整个 WebContentsView 销毁**——物理清空 JS heap |

---

## 二、自由度原则

> **多 WebView 不影响插件"能做什么"（广度自由度），只影响"做一件事要几步"（步骤自由度）。**

```
单 WebView：读串口状态 → useSerialContext() → 一行 import
多 WebView：读串口状态 → IPC 请求 → 壳返回状态 → 三行桥接代码
差异 = AI 多写两行代码。不是能力变少，是路径变长。
```

---

## 三、架构设计

### 3.1 WebView 拓扑

```
┌──────────────────────────────────────────────┐
│             壳 BrowserWindow                   │
│  App.tsx / IconBar / SidePanel / TabBar      │
│  + 核心服务（Config/Command/Menu/Events）     │
│  + 数据管道（DataPipeline）                  │
└──────┬──────────┬──────────┬─────────────────┘
       │ IPC      │ IPC      │ IPC
       ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐
│ terminal │ │ file-tree│ │  theme   │
│ WebView  │ │ WebView  │ │ browser  │
└──────────┘ └──────────┘ └──────────┘
```

- **壳 BrowserWindow：** 标签页 + 分屏 + 图标栏 + 侧栏 + 状态栏 + 所有核心服务
- **插件 WebContentsView：** 只有插件自己的 React 组件。通过 IPC 使用核心服务
- **数据管道：** 数据到达壳 WebView → 通过 IPC 推给订阅的插件 WebView

### 3.2 IPC 协议

```typescript
interface IpcMessage {
  type: "request" | "response" | "event";
  id: string;
  channel: string;
  payload: unknown;
  error?: string;
}

// 壳侧——IpcBridge
class IpcBridge {
  async getConfig(key: string): Promise<unknown>;
  async setConfig(key: string, value: unknown): Promise<void>;
  async executeCommand(id: string, ...args: unknown[]): Promise<unknown>;
  onData(callback: (data: DataPacket) => void): Disposable;
  onEvent(event: string, callback: (payload: unknown) => void): Disposable;
}
```

### 3.3 插件侧的消费

```typescript
// 改前（单 WebView）：
import { useSerialContext } from "./SerialContext";
const { status, openSource } = useSerialContext();

// 改后（多 WebView）：
import { useIpcSerialContext } from "@src/core/IpcBridge";
const { status, openSource } = useIpcSerialContext();

// useIpcSerialContext 内部——接口和原来完全相同
function useIpcSerialContext() {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    const sub = ipc.onEvent("source-state-changed", setStatus);
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

**关键：调用方不感知 IPC。**

---

## 四、Electron 实现

### 4.1 WindowManager（`electron/services/window-manager.ts`，~200 行）

```typescript
class WindowManager {
  private pluginViews = new Map<string, WebContentsView>();

  createPluginView(pluginId: string): void {
    const view = new WebContentsView({
      webPreferences: {
        preload: join(__dirname, 'preload-plugin.js'),
        contextIsolation: true,
        nodeIntegration: false,
      }
    });
    view.webContents.loadURL(`linkdesk://${pluginId}/dist/index.html`);
    shellWindow.contentView.addChildView(view);
    this.pluginViews.set(pluginId, view);
  }

  destroyPluginView(pluginId: string): void {
    const view = this.pluginViews.get(pluginId);
    if (view) {
      shellWindow.contentView.removeChildView(view);
      view.webContents.close();
      this.pluginViews.delete(pluginId);
    }
  }

  focusPluginView(pluginId: string): void { /* ... */ }
}
```

### 4.2 preload 差异

| preload | 暴露的 API | 说明 |
|------|------|------|
| `preload-shell.ts` | 全部 `window.linkdesk.*` | 壳需要完整系统能力 |
| `preload-plugin.ts` | 精选子集 | 不暴露 `plugins.*`（不能安装/卸载）、`window.*`（不能创建/关闭 WebView）、`dialog.*` |

### 4.3 IPC 通道

Electron `ipcRenderer.invoke` / `ipcMain.handle`：

```typescript
// 壳 → 插件（壳发起 IPC 请求插件数据）
ipcRenderer.sendTo(pluginView.webContents, 'plugin:ipc', { ... });

// 插件 → 壳（插件请求核心服务）
ipcRenderer.invoke('plugin:ipc', { channel: 'config:get', ... });
```

---

## 五、现有插件迁移

| 插件 | IPC 调用 | 改动量 |
|------|------|:--:|
| terminal | useSerialContext → useIpcSerialContext + useSendData → ipc | ~50 行 |
| marketplace | 读 plugin.json 列表 → ipc | ~10 行 |
| settings | 读/写配置 → ipc | ~10 行 |

---

## 六、任务清单

### 底座——WindowManager

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 24 | WindowManager——WebContentsView 创建/销毁/聚焦（壳侧生命周期） | ~110 | 创建→`contentView.addChildView`→关闭→`webContents.close()` 无泄漏 |
| 25 | PluginViewRegistry——插件 ID→WebContentsView 映射 + bounds 管理 + 重载 | ~90 | Map 增删查 + 重载后 pluginId 不变 |

### 通信——IpcBridge

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 26 | IpcBridge——核心服务代理（Config/Command/Menu 的 IPC handler 注册） | ~100 | `ipcRenderer.invoke('plugin:ipc', ...)` → 壳侧 handler → 返回结果 |
| 27 | IpcBridge——事件管道（Events/Data 的 push 通道 + 请求队列串行化） | ~50 | 串口数据推送到插件 WebView，<16ms 延迟 |

### 插件侧

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 28 | preload-plugin.ts——插件侧精选 API（无 `plugins.*`/`window.*`/`dialog.*`） | ~80 | contextBridge 白名单审计 |
| 29 | MainContent 改为 WebContentsView placeholder 管理 | ~100 | 壳标签页切换 → WebContentsView 显隐 |

### 现有插件迁移——逐个独立

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 30 | terminal 插件迁移——useSerialContext→useIpcSerialContext + useSendData→ipc | ~50 | 终端收发不变 |
| 31 | marketplace 插件迁移——plugin.json 列表读 IPC | ~10 | 插件市场列表正常 |
| 32 | settings 插件迁移——配置读写 IPC | ~10 | 设置页读写正常 |
| **合计** | | **~590 行** | |

> 三个插件迁移拆开——terminal 的 IPC 失败不影响 marketplace/settings 的验证。

---

## 七、验证标准

```
1. terminal / marketplace / settings 各在独立 WebContentsView
   → Chrome DevTools → 三个独立进程

2. terminal render() 抛异常
   → 只有终端崩了 → [重试] 只重载终端 WebView
   → 设置标签页 / 插件市场 全部正常

3. terminal 写 while(true){}
   → 只有终端 WebView 卡死
   → 设置还能打开 → 齿轮菜单还能卸载终端

4. 卸载 terminal → 对应 WebContentsView 销毁 → JS heap 回收到基线

5. IPC 延迟：串口收发 → 无明显延迟（< 16ms per frame）
```

---

## 附录：多 WebView 七个坑与对策

> 来源：旧 P7 分析文档。每个坑对 Electron 同样适用——变的只是 `add_child` → `WebContentsView`。

| # | 坑 | 频率 | 严重度 | 对策 |
|:--:|------|:--:|:--:|------|
| 1 | **CSS 变量同步**——切主题时 N 个 WebView 逐个广播，先收到的和后收到的差几十毫秒 | 低频（只切主题时） | 低 | 广播 + 版本号防乱序。人眼对颜色变化感知远慢于 IPC 延迟（<5ms） |
| 2 | **IPC 竞态**——插件 A 写数据的同时插件 B 查询状态，B 拿到旧值 | 低频（只读写交叉时） | 低 | 壳侧请求队列串行化——模拟 JS 单线程行为 |
| 3 | **内存**——每个插件 WebContentsView ~60-130MB。6 个全开 ~500-700MB | 持续 | 可控 | 按需激活 + 关闭销毁。装了 30 个 ≠ 跑 30 个。对标 VS Code 同等规模 ~1GB |
| 4 | **调试地狱**——每个插件独立 DevTools，跨进程调用链断在 IPC 边界 | 开发时 | 中 | Tracing 结构化日志——每个 IPC 消息带 traceId，壳侧汇总到统一日志视图 |
| 5 | **插件开发体验倒退**——从 `import` 直接用到走 IPC 桥接 | 写插件时 | 低 | Hook 签名不变——`useSerialContext()` 内部走 IPC 还是直接 import，调用方不感知。AI 生成桥接代码 |
| 6 | **视觉接缝**——WebContentsView 嵌入壳窗口，边缘可能有像素级偏移 | 持续 | 中 | `setBounds` 像素对齐 + `background-color` 匹配。Electron `WebContentsView` 的 bounds 管理比 Tauri `add_child` 更成熟 |
| 7 | **插件权限**——插件不能直接 `require('child_process')`，系统能力走 `window.linkdesk` | 持续 | 高 | preload 双重设计——壳 preload 全 API，插件 preload 精选子集。contextBridge 隔离世界 |

**核心结论：** 七个坑的解法都在 E1-E3 设计中内置了——CSS 同步在 E3b、IPC 队列在 E3a、按需激活在 E3d、Tracing 在 E3a、Hook 不变在 E3a、视觉在 E3a、权限在 E1 preload 设计。不存在"没考虑到"的坑。

---

> **← E3 索引：** `00-README.md`
> **→ 下一份：** `02-E3b-主题引擎跨进程.md`
