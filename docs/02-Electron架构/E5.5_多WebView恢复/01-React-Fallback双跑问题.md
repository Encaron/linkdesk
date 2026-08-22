# E5.5#5d React Fallback 双跑问题——方案

> 2026-08-08。

## 问题

[MainContent.tsx:100-123](linkdesk/src/components/MainContent.tsx#L100-L123) `renderTabContent` 三段中两段渲染 `<plugin.component />`：

```typescript
if (webViewTimeout?.has(tab.pluginId)) {
  return <plugin.component />  // ← 超时时插件在壳侧跑
}
if (ready + boundsReady) {
  return <div />  // ← 空 div，WebView 覆盖
}
return <plugin.component />  // ← 加载中插件在壳侧跑
```

多 WebView 下插件代码不应在壳 JS 堆执行——插件在自己的 WebContentsView 里跑。壳侧渲染 `<plugin.component />` → IPC 监听器/命令/副作用在壳和 WebView 各注册一次 → 双注册。

## 方案

**原则：** 壳侧零插件代码执行。加载中/超时不渲染任何插件组件——直接展示欢迎页。欢迎页是壳视图、零插件代码、Ctrl+Shift+P 可用。

### 改后三态

```
状态1：加载中（WebView 未 ready，未超时）
  → 欢迎页（壳视图）

状态2：就绪（WebView ready + bounds 确认）
  → 空 div，WebView 覆盖（不变）

状态3：超时（WebView 已超时）
  → 欢迎页（壳视图）
```

### 代码改动

**文件：** `src/components/MainContent.tsx:100-123`

```typescript
if (tab.pluginId) {
  // WebView ready + bounds 确认 → 空 div（WebView 覆盖在上面）
  if (readyWebViewIds?.has(tab.pluginId) && webViewBoundsReady?.has(tab.pluginId)) {
    return <div key={tab.id} className="plugin-webview-placeholder" />;
  }

  // 加载中 / 超时 → 欢迎页（壳视图，零插件代码，Ctrl+Shift+P 可用）
  const WelcomeView = SHELL_VIEWS["welcome"];
  if (WelcomeView) {
    return createElement(WelcomeView, { key: tab.id, isActive });
  }
}
```

### 删除

- `getViewPlugin(tab.pluginId)` 不再用于获取 `.component`
- 不再 import `ErrorBoundary` 用于包裹插件组件（壳侧不再渲染插件组件）
- `webViewTimeout` 不再影响渲染决策（欢迎页本身不区分加载中/超时）

## 影响

- **壳侧零插件副作用**：`useEffect`/`ipcRenderer.on`/命令注册只在 WebView 内执行一次
- **无需用户操作**：不需要切换标签页来恢复——WebView 就绪后自动切换为空 div，WebView 覆盖在上面
- **欢迎页可用**：加载期间可用 Ctrl+Shift+P 打开命令面板、切换主题等
- **实现简洁**：~10 行改动，无新技术、无 CSS
