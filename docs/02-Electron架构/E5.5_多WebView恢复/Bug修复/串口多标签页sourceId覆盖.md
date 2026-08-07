# 串口多标签页 sourceId 覆盖——E5.5#9

> 📖 **来源：** [[e5-multi-webview-abandoned]] Bug 8——E5#85 已解决（ContextKey 广播）。E5.5#9 是重新验证。

## Bug 描述

多 WebView 下，同一个串口插件可以同时在多个标签页打开（每个标签页 = 独立 WebContentsView + 独立 JS 堆）：

```
侧栏: 串口插件 WebView #1 → sourceId: COM3
主区 Tab 1: 串口插件 WebView #2 → 也需要读 sourceId: COM3
主区 Tab 2: 串口插件 WebView #3 → 也需要读 sourceId: COM3
```

**原 Bug（E5#85 已修复）：**

在单 WebView 下，`sourceId` 通过 `SerialContext._sessions` 模块级变量传递：
- 侧栏打开 COM3 → `_sessions.set('terminal-1', { portName: 'COM3' })`
- 主区 Tab 1 打开 → 从 `_sessions.get('terminal-1')` 读 → COM3 ✅

多 WebView 下：
- 侧栏的 `_sessions` 和主区的 `_sessions` 是不同的 Map（不同 WebView）
- 主区 Tab 1 读 → `_sessions.get('terminal-1')` → undefined → 不知道 sourceId

**E5#85 修复后：**

`sourceId` 存储到 `linkdesk.pluginState`（E5#71 主进程文件持久化）：
- 侧栏设置 → `window.linkdesk.pluginState.set('serial-monitor', 'sourceId', 'COM3')`
- 主区 Tab 1 读取 → `window.linkdesk.pluginState.get('serial-monitor', 'sourceId')` → 'COM3' ✅

**E5.5#9 需要验证：** 多 WebView 恢复后，`pluginState` IPC 通路在跨 WebView 下正常工作。

## 验证场景

### 场景 1：侧栏打开串口 → 新建标签页有相同 sourceId

```
操作：
  1. 侧栏打开串口，选择 COM3 → 打开成功，收到数据
  2. Ctrl+Click 串口插件图标 → 在主区新标签页打开
  3. 新标签页自动填充 COM3

预期：
  - 新标签页的 sourceId 自动为 COM3
  - 不需要重新选择端口
```

### 场景 2：一个标签页关闭 → 不影响其他标签页

```
操作：
  1. 侧栏打开 COM3 → 主区 Tab 1 也打开 COM3
  2. 关闭主区 Tab 1

预期：
  - 侧栏仍正常运行，持续接收数据
  - Tab 1 的 serialService port 正确关闭（无泄漏）
  - pluginState 中的 sourceId 不受影响
```

### 场景 3：端口切换 → 所有标签页同步

```
操作：
  1. 侧栏 COM3 → 主区 Tab 1 COM3
  2. 侧栏切换到 COM4

预期：
  - pluginState.sourceId 广播更新（onDidChange）
  - 主区 Tab 1 收到广播 → 自动更新 sourceId
  - 如果有 onDidChange 回调 → UI 更新端口名显示
```

### 场景 4：两个串口插件同时工作

```
操作：
  1. 侧栏打开 COM3 → 串口插件实例 A
  2. 主区 Tab 1 打开 COM4 → 串口插件实例 B
  3. COM3 的数据流向 A，COM4 的数据流向 B

预期：
  - sourceId 不互相覆盖
  - A 的数据不泄漏到 B
  - A 关闭 → B 不受影响
```

## 验证清单

- [ ] 侧栏打开串口 → Ctrl+Click 主区新标签页 → sourceId 自动填充
- [ ] 关闭任一标签页 → 其他标签页不受影响
- [ ] 端口切换 → pluginState.onDidChange 正确广播
- [ ] 两个串口插件同时运行 → sourceId 不互相覆盖
- [ ] 插件卸载 → pluginState 正确清理（无孤立数据）

## 相关

- [[e5-multi-webview-abandoned]] Bug 8
- [[multi-webview-root-cause]] 模式 4: 数据管道同步
