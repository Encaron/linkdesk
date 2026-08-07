# 多 WebView 根因 9 条模式——E5.5#7e

> 📖 **来源：** [[multi-webview-root-cause]]——9 条模式，每条都是"单 WebView 假设 vs 多 WebView 现实"。
> E5.5#7e 逐条验收——确认所有根因模式已在代码层面消除。

## 9 条模式 + 验收标准

### 模式 1：模块级变量状态共享

**单 WebView 假设：** `const _store = new Map()` → 所有代码共享同一个实例。
**多 WebView 现实：** 每个 WebContentsView 有自己的 JS 堆，各自有 `_store` 副本。

**验收：**
- [ ] 所有跨 WebView 共享的模块级状态已迁移到 IPC（见 [[模块级状态审计]] 审计结果）
- [ ] 仅 WebView 本地的缓存未迁移（有注释说明）
- [ ] 新代码不走 `const _state = {}` 跨组件共享模式

### 模式 2：import 核心模块 = 在错误进程操作

**单 WebView 假设：** `import { registerMenuItems } from '@src/core'` → 影响全局 MenuRegistry。
**多 WebView 现实：** 在插件 WebView 中 import → 操作的是插件进程的 `_menus` 副本。

**验收：**
- [ ] 插件代码中所有有副作用的 import @src/core 已切 window.linkdesk.* API（见 [[通信合规审计]] 审计结果）
- [ ] ESLint `no-core-import-in-plugin` warn 数降低（不含例外）

### 模式 3：React Context = 壳内限定

**单 WebView 假设：** `<ThemeContext.Provider>` 包裹所有 React 组件 → 所有组件都能 `useContext(ThemeContext)`。
**多 WebView 现实：** React Context 不跨 WebView。壳的 Context 在壳 WebView 内，插件 WebView 有自己的 React 根组件，不同 Provider 链。

**验收：**
- [ ] 需要跨 WebView 的配置值走 IPC（`config:get/set` + `config:changed` 广播）
- [ ] 仅壳 WebView 内的 UI 组件可以用 Context（壳级 React 树仍未变）
- [ ] 插件 WebView 通过 `window.linkdesk.configuration.get()` 获取配置——API 已暴露在 preload-plugin.ts

### 模式 4：同步函数调用 = 只在当前 WebView 有效

**单 WebView 假设：** `editorService.openFile(path)` → 直接在同一个线程打开文件。
**多 WebView 现实：** 插件 WebView 调 `editorService.openFile` → 操作的是插件进程的 editorService 实例 → 和壳的编辑器不是同一个。

**验收：**
- [ ] 所有服务调用走 IpcBridge.PROXY_CHANNELS（43 个通道已就绪）
- [ ] 插件 `window.linkdesk.editor.open(path)` → `window.linkdesk.commands.execute('editor.open', {path})` → IpcBridge → 壳 WebView
- [ ] 无插件代码直接 import EditorService 实例

### 模式 5：localStorage = 每个 WebView 独立

**单 WebView 假设：** `localStorage.setItem` → 应用级持久化。
**多 WebView 现实：** 每个 WebView 有独立 localStorage。侧栏写、主区读 = 读不到。

**验收：**
- [ ] 跨 WebView 持久化迁移到 `linkdesk.pluginState` API（E5#71）
- [ ] 插件 `localStorage.setItem` 桥接（如实现）→ 透明转发到 pluginState
- [ ] 见 [[localStorage双份]] 验证清单

### 模式 6：CSS 只对当前 WebView 生效

**单 WebView 假设：** 全局 CSS `body { background: var(--bg) }` 影响所有内容。
**多 WebView 现实：** 每个 WebView 有独立的 CSSOM。壳的主题变量不自动带到插件 WebView。

**验收：**
- [ ] preload-plugin.ts 注入 `theme:changed` 监听 → 更新 `document.documentElement.style`
- [ ] `theme-sync.ts` 正确广播 CSS 变量到插件 WebView
- [ ] 插件加载时立即获取当前主题（不等第一次广播）
- [ ] 切换主题 → 插件 WebView 边框/背景同步（非即时——有 IPC 延迟是正常的）

### 模式 7：焦点系统 = 跨 WebView 盲区

**单 WebView 假设：** `document.activeElement` 能判断任何组件的焦点状态。
**多 WebView 现实：** 焦点在一个 WebView 时，另一个的 `document.activeElement` 是 `document.body`。

**验收：**
- [ ] 快捷键系统（壳 WebView）正确注册——不受插件 WebView 焦点影响
- [ ] `isEditableElementFocused()` DOM 检测只用在壳 WebView
- [ ] 插件 WebView 的输入框不会误触发壳的快捷键拦截
- [ ] `contextKey._getValue` 正确区分壳和插件 WebView（仅 injected in preload-plugin.ts）

### 模式 8：崩溃隔离 ≠ 静默恢复

**单 WebView 假设：** 不存在的概念——一个 renderer 崩溃 = 整个应用白屏。
**多 WebView 现实：** 插件 WebView 崩溃（`render-process-gone`）时壳继续运行。但可能存在 React 组件不知道 WebView 死了、IPC 消息队列堆积等问题。

**验收：**
- [ ] `render-process-gone` handler → grace period 60s → 清理后重建（WindowManager 已有）
- [ ] 壳侧 `useWebViewSync` hook 收到崩溃事件 → setWebViewTimeout → React fallback 显示
- [ ] 崩溃插件的 IPC 队列被清空（不阻塞其他插件）
- [ ] windowManager.getMetrics() 中已崩插件的内存占用归零

### 模式 9：进程管理 = 不可见复杂度

**单 WebView 假设：** 不存在的概念。
**多 WebView 现实：** 需要管理 N 个 WebContentsView 的生命周期——创建/销毁/可见性/内存。WindowManager 已实现大部分，但需要验证在长时间运行下的内存积累。

**验收：**
- [ ] WindowManager.createPluginView → destroy → recreate 循环无内存泄漏（1000 次循环后 heap < 1.5× 基准）
- [ ] `scheduleViewDestroy` 60s grace period 后正确销毁
- [ ] `cancelViewDestroy` 取消 pending 销毁（重新打开插件）
- [ ] `flushGracePeriods` 内存阈值触发后正确回收
- [ ] 11 个插件同时运行时，总 renderer 进程 ≤ 3（未激活插件分享 WebView 资源？或按需创建？）

## 验证方法

对每条模式：
1. **阅读理解**——看代码确认没有违反模式
2. **行为验证**——手动触发边缘情况，观察控制台无报错
3. **审计 grep**——grep 模式关键词（`import.*@src/core`、`localStorage.`、`document.activeElement` 等）→ 确认无违规

## 相关

- [[multi-webview-root-cause]]
- [[e5-multi-webview-abandoned]] 8 bug 和 9 条模式的一一对应
- [[e5-multi-webview-6-bugs]] 6 个生命周期 bug 和 6 条模式的对应
