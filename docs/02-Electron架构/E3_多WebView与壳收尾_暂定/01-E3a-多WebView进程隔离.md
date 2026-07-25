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

    // 🔥 崩溃检测——插件 WebView 崩了触发壳侧清理链（模式 2 预防）
    view.webContents.on('crashed', (event) => {
      console.error(`[WindowManager] 插件 "${pluginId}" WebContentsView 崩溃`);
      // 触发清理链——unregister + 持久化状态清理
      PluginLifecycle.onWillUninstall.fire({ pluginId, reason: 'crashed', displayName: pluginId });
      // 销毁崩溃的 WebView——释放资源
      this.destroyPluginView(pluginId);
    });

    view.webContents.on('destroyed', () => {
      // WebContentsView 被外部关闭（非崩溃）——同样清理
      this.pluginViews.delete(pluginId);
    });

    // 🔥 新 WebView 创建后——主动推送当前主题/语言/配置（新风险 4 预防）
    // 在 loadURL 之前注入初始状态——避免新 View 在下次广播前用默认值
    view.webContents.on('did-finish-load', () => {
      const currentTheme = ThemeEngine.getCurrentTheme();
      const currentLang = i18next.language;
      view.webContents.send('theme:changed', { themeId: currentTheme.id, variables: currentTheme.variables });
      view.webContents.send('lang:changed', { lang: currentLang, resources: i18next.getResourceBundle(currentLang, null) });
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

  // 🔧 开发辅助——多 WebView 调试时逐个打开 DevTools，不自动弹 6 个窗口
  toggleDevTools(pluginId: string): void {
    const view = this.pluginViews.get(pluginId);
    if (view && !app.isPackaged) {
      if (view.webContents.isDevToolsOpened()) {
        view.webContents.closeDevTools();
      } else {
        view.webContents.openDevTools({ mode: 'detach' });
      }
    }
  }
}
```

### 4.2 preload 差异

| preload | 暴露的 API | 说明 |
|------|------|------|
| `preload-shell.ts` | 全部 `window.linkdesk.*` | 壳需要完整系统能力 |
| `preload-plugin.ts` | 精选子集 | 不暴露 `plugins.*`（不能安装/卸载）、`window.*`（不能创建/关闭 WebView）、`dialog.*`。**暴露 `filesystem.readTextFile`/`writeTextFile`（受限——只能读写 `.linkdesk/plugins/<id>/` 下的文件）** |

### 4.3 IPC 通道

Electron `ipcRenderer.invoke` / `ipcMain.handle`：

```typescript
// 壳 → 插件（壳发起 IPC 请求插件数据）
ipcRenderer.sendTo(pluginView.webContents, 'plugin:ipc', { ... });

// 插件 → 壳（插件请求核心服务）
ipcRenderer.invoke('plugin:ipc', { channel: 'config:get', ... });
```

### 4.4 资源休眠——后台 WebView 降频 + 内存压力检测（~40 行）

**对标 VS Code：** VS Code 的 Extension Host 有 30s 内存采样（RSS > 800MB × 3 → 重启）。Electron 的 `WebContents` 原生支持 `setBackgroundThrottling`——Chromium 自动降频隐藏页面的定时器和绘制。

```typescript
// electron/services/window-manager.ts —— WindowManager 新增方法

// 标签页切换时调——活跃的解除限流，隐藏的降频
setThrottling(pluginId: string, isVisible: boolean): void {
  const view = this.pluginViews.get(pluginId);
  if (!view) return;
  view.webContents.setBackgroundThrottling(!isVisible);
}

// 每 30s 采样所有插件 WebView 的内存
async checkMemoryPressure(): Promise<void> {
  let totalRSS = 0;
  for (const [pluginId, view] of this.pluginViews) {
    const mem = await view.webContents.getProcessMemoryInfo();
    totalRSS += mem.residentSet;
  }
  // RSS > 1GB → toast "内存占用较高，建议关闭不活跃插件"
  if (totalRSS > 1024 * 1024 * 1024) {
    shellWindow.webContents.send('system:memory-pressure', { totalRSS });
  }
}
```

**何时休眠：** 标签页后台超过 5 分钟 → `setBackgroundThrottling(true)`。用户切回该标签页 → `setBackgroundThrottling(false)`。不销毁 WebContentsView——保留状态，只降频。

**Why 不是销毁：** 销毁后重建需要重新加载 JS → 用户切回标签页时延迟不可接受。对标浏览器标签页休眠——保留进程，降频不销毁。

### 4.5 保活宽限期——关闭标签页延迟销毁 WebView（~25 行）

**问题：** 关闭标签页立刻销毁 WebView 太激进——用户手滑关错终端，0.5 秒后重开，结果整个 WebView 要重建（加载 HTML → 解析 JS → 渲染组件 → 恢复状态），延迟不可接受。

**对标 VS Code：** Extension Host 在所有编辑器标签页关闭后仍然存活——因为扩展可能还在跑后台任务。

**设计：** 关闭标签页 → 先隐藏 WebView → 启动 60s 倒计时 → 超时则真正 `webContents.close()` 销毁。期间重开标签页 → 取消倒计时 → WebView 恢复显示，零重建延迟。

```typescript
// electron/services/window-manager.ts —— WindowManager 新增

private graceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** 关闭标签页——不立即销毁，保留 WebView 60s */
scheduleViewDestroy(pluginId: string): void {
  const view = this.pluginViews.get(pluginId);
  if (!view) return;
  // 先隐藏 + 降频
  view.setVisible(false);
  view.webContents.setBackgroundThrottling(true);

  // 启动 60s 保活宽限期
  const timer = setTimeout(() => {
    this.destroyPluginView(pluginId);
    this.graceTimers.delete(pluginId);
  }, 60_000);
  this.graceTimers.set(pluginId, timer);
}

/** 重开标签页——如果在宽限期内则复用 WebView */
cancelViewDestroy(pluginId: string): boolean {
  const timer = this.graceTimers.get(pluginId);
  if (timer) {
    clearTimeout(timer);
    this.graceTimers.delete(pluginId);
    const view = this.pluginViews.get(pluginId);
    if (view) {
      view.setVisible(true);
      view.webContents.setBackgroundThrottling(false);
      return true;  // 复用成功，零重建
    }
  }
  return false;  // 已销毁，需新建
}
```

**内存压力联动：** `checkMemoryPressure()` 检测到 RSS > 1GB → 无视宽限期，立即销毁所有处于保活期的 WebView——内存安全优先。

### 4.6 关闭标签页时的 keep-alive 策略

针对不同插件采用不同策略——由 `plugin.json` 行为声明决定：

| tabBehavior 声明 | 关闭行为 | 原因 |
|------|------|------|
| `singleton: true`（终端） | 保留 60s 宽限期 | 用户最常开关终端，重开要即时要看到串口状态 |
| 无声明（文件树/地图） | 立刻销毁 | 无状态需要保留——文件树下次打开重新 `listDir()` 即可 |
| `isFallback: true`（欢迎页） | 永不销毁 | 壳兜底——场上无标签页时自动出现 |

> 此策略写入 WindowManager 的 `scheduleViewDestroy()`——读取 PluginViewRegistry 的 manifest 判断宽限期时长。

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
| 25a | **资源休眠——后台 WebView 降频 + 内存压力检测** | ~40 | 隐藏标签页→`setBackgroundThrottling(true)`；每 30s `getProcessMemoryInfo()` 采样；RSS > 阈值 → toast + 建议关闭不活跃插件 |
| 25b | 🆕 **保活宽限期——关闭标签页延迟销毁 WebView** | ~25 | 关闭→60s 倒计时→重开复用零重建→超时销毁；内存压力→立刻销毁 |

### 通信——IpcBridge

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 26 | IpcBridge——核心服务代理（Config/Command/Menu 的 IPC handler 注册） | ~100 | `ipcRenderer.invoke('plugin:ipc', ...)` → 壳侧 handler → 返回结果 |
| 27 | IpcBridge——事件管道（Events/Data 的 push 通道 + 请求队列串行化） | ~50 | 串口数据推送到插件 WebView，<16ms 延迟 |

### 插件侧

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 28 | preload-plugin.ts——插件侧精选 API（无 `plugins.*`/`window.*`/`dialog.*`，含 `filesystem` 受限读写） | ~80 | contextBridge 白名单审计 + **IPC 回调模板（ref 桥接 + cleanup + 超时）** |
| 29 | MainContent 改为 WebContentsView placeholder 管理 | ~100 | 壳标签页切换 → WebContentsView 显隐 |

### 壳侧归一化

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 29a | **SidebarTabSync——侧栏↔标签页三向同步归一化** | ~30 | 侧栏点 session→主区切换→侧栏高亮同步 |

**为什么需要 #29a：** 模式 3（三栏交互不同步）是 Tauri 时代第三大 bug 来源（18 个 bug）。根因是 SidePanel/TabBar/MainContent 各自维护 "用户选择了哪个内容" 的状态同步逻辑——三份拷贝，漏同步一个=一个 bug。

```typescript
// src/core/SidebarTabSync.ts —— ~30 行
// 单一真相源——侧栏↔标签页↔图标栏全部调它

export function activateSidebarItem(sourceId: string, pluginId: string): void {
  // 1. 聚焦/创建对应的标签页
  const tab = TabActionsContext.focusOrCreateTab(pluginId, sourceId);
  // 2. 标签栏高亮对应标签页
  TabActionsContext.setActiveTab(tab.id);
  // 3. 侧栏高亮对应条目（如果侧栏是 tagFollower 模式）
  //    对标 VS Code——Explorer 中点击文件→编辑器打开→Explorer 中该文件高亮
  SidebarActions.setActiveSourceId(sourceId);
}

// 消费端（改前→改后）：
// SidePanel.tsx:    onMouseDown → activateTab(sourceId)  → activateSidebarItem(sourceId, pluginId)
// TabBar.tsx:       onTabClick → setActiveTab(tabId)     → activateSidebarItem(tab.sourceId, tab.pluginId)
// IconBar.tsx:      onIconClick → handlePluginClick(id)  → activateSidebarItem(..., id)
// MainContent.tsx:  tab switch → 通知侧栏                  → SidebarActions.setActiveSourceId(...)
```

**对标 VS Code：** VS Code 的 `EditorService.openEditor()` 是单一入口——Explorer/Tabs/Breadcrumbs 全部走它。`SidebarTabSync.activateSidebarItem()` 同理。

### 现有插件迁移——逐个独立

| # | 任务 | 行数 | 独立验证 |
|:--:|------|:--:|------|
| 30 | terminal 插件迁移——useSerialContext→useIpcSerialContext + useSendData→ipc | ~50 | 终端收发不变 |
| 31 | marketplace 插件迁移——plugin.json 列表读 IPC | ~10 | 插件市场列表正常 |
| 32 | settings 插件迁移——配置读写 IPC | ~10 | 设置页读写正常 |
| 32a | 🆕 **workspace 插件迁移**——卡片网格 IPC | ~10 | 工作台卡片正常 |
| **合计** | | **~670 行** | |

> 四个插件迁移拆开——terminal 的 IPC 失败不影响 marketplace/settings/workspace 的验证。
> #29a SidebarTabSync 在 #30 之前做——终端迁移验证依赖侧栏↔标签页同步正确。
> ⚠️ **2026-07-24 再审计发现：** 原迁移清单只有 3 个插件（terminal/marketplace/settings），漏了 workspace。workspace 插件同样需要迁移到独立 WebContentsView。

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

🔥 旧 Bug 回归测试（多 WebView 后原 Tauri 时代 bug 会以新面目重现）：
6. C1 回归——两个终端标签页 → 侧栏会话列表点 A → 主区显示 A 不是 B
   （C1 根因：单 WebView 时代模块级 `_activeSessionId` 共享 → E3a 后每个标签页在独立 WebContentsView，但 session 数据和 IPC 通道仍需正确隔离）
7. B86 回归——首次打开串口 → ControlPanel "打开" 按钮正常工作
   （B86 根因：useCallback 闭包 portName 为空 → E3a 后 IPC invoke 多一层异步，类似问题可能重现）
8. 模式 4 预防——IPC 回调中用到 React state 的全部用 ref 桥接
   → grep "ipcRenderer.on\|ipc.onEvent" 逐条检查回调内是否引用了 React state → 全用 ref
9. 新 WebView 创建后 → 主动拉取当前主题/语言 → 新 View 颜色和语言与壳一致
   （新风险 4——不主动拉取 = 新 View 在下次广播前用默认主题/语言）
10. 插件 WebView 崩溃 → 壳侧清理链执行 → 注册表无残留（新风险 2）
    → 模拟：在插件 console 执行 process.crash() → 壳检测到 crashed → 清理注册表
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
