# E5.5#3g React Fallback 双跑问题——方案

> 2026-08-08。来源：E5.5#3d 验证时发现 WebView 偏移后 React fallback 透出——深层问题是多 WebView 下插件在壳 JS 堆跑了一次。

## 问题

[MainContent.tsx:100-123](linkdesk/src/components/MainContent.tsx#L100-L123) `renderTabContent` 三态：

| 状态 | 条件 | 当前渲染 | 问题 |
|---|---|---|---|
| 超时兜底 | `webViewTimeout.has(id)` | `<plugin.component />` | 插件在壳 JS 堆跑——注册 IPC/命令/监听器 |
| 加载中 | 未 ready 也未超时 | `<plugin.component />` | 同上——双跑：壳 + WebView 各渲染一次 |
| 就绪 | `ready + boundsReady` | 空 `<div>` | ✅ 正常 |

**根因：** `<plugin.component />` 是完整的插件 React 组件（EditorView/SerialMonitorView 等）。在壳 JS 堆渲染它会执行插件的所有副作用——IPC 监听器注册、命令注册、配置监听、状态初始化。这些在 WebView 里再跑一次 → 双注册。

**单 WebView 下没问题：** 因为根本没有 WebView——壳 React 树就是唯一的运行环境。fallback = 正常渲染。

**多 WebView 下有问题：** 插件在自己的 WebContentsView 里跑，壳侧不应该跑任何插件代码。

## 现状代码

```typescript
// MainContent.tsx:100-123
if (tab.pluginId) {
  if (webViewTimeout?.has(tab.pluginId)) {
    const plugin = getViewPlugin(tab.pluginId);
    if (plugin) {
      return <plugin.component ... />  // ← 插件在壳侧跑
    }
  }
  if (readyWebViewIds?.has(tab.pluginId) && webViewBoundsReady?.has(tab.pluginId)) {
    return <div className="plugin-webview-placeholder" />;  // ← 空 div，WebView 覆盖
  }
  const plugin = getViewPlugin(tab.pluginId);
  if (plugin) {
    return <plugin.component ... />  // ← 插件在壳侧跑
  }
}
```

三段中两段会渲染 `<plugin.component />`——调 `getViewPlugin()` 拿 React 组件，在壳侧 mount。

## 方案

**原则：** 壳侧零插件代码执行。`getViewPlugin(tab.pluginId)` 只用于取 `plugin.manifest.name`（显示插件名），不渲染 `.component`。

### 改后三态

```
状态1：加载中（WebView 未 ready，未超时）
  → <div className="plugin-loading">
      <div className="plugin-loading-skeleton" />  ← CSS 骨架屏动画
    </div>

状态2：就绪（WebView ready + bounds 确认）
  → <div className="plugin-webview-placeholder" />  ← 不变

状态3：超时（5s 后 WebView 仍未就绪）
  → <div className="plugin-loading-failed">
      <p>插件 "{pluginName}" 加载超时</p>
      <button onClick={retryCreate}>重试</button>  ← 调 pv.create() 重建 WebView
    </div>
```

### 代码改动

**文件：** `src/components/MainContent.tsx:100-123`，~30 行改 ~25 行

**逻辑：**

```typescript
if (tab.pluginId) {
  const plugin = getViewPlugin(tab.pluginId);
  const pluginName = plugin?.manifest?.name ?? tab.pluginId;

  // 双条件就绪 → 空 div（WebView 覆盖在上面）
  if (readyWebViewIds?.has(tab.pluginId) && webViewBoundsReady?.has(tab.pluginId)) {
    return <div key={tab.id} className="plugin-webview-placeholder" />;
  }

  // 超时 → 错误提示 + 重试按钮
  if (webViewTimeout?.has(tab.pluginId)) {
    return (
      <div key={tab.id} className="plugin-loading-failed">
        <p>{i18n.t('插件 "{{name}}" 加载超时', { name: pluginName })}</p>
        <button onClick={() => window.linkdesk?.pluginViews?.create?.(tab.pluginId!)}>
          {i18n.t("重试")}
        </button>
      </div>
    );
  }

  // 加载中 → 骨架屏（零插件代码）
  return (
    <div key={tab.id} className="plugin-loading">
      <div className="plugin-loading-skeleton" />
      <span className="plugin-loading-name">{pluginName}</span>
    </div>
  );
}
```

**骨架屏 CSS：** `plugin-loading-skeleton`——柔和的脉冲动画（`@keyframes pulse`），宽度 60%、高度 16px、`border-radius: 4px`、`background: var(--bg-card)`。不涉及任何插件代码。

**删除：** 不再 import `getViewPlugin` 用于渲染 `.component`——只用于取 `manifest.name` 显示插件名。`ErrorBoundary` 不再包裹插件组件（因为壳侧不再渲染插件组件）。

## 影响

- **壳侧零插件副作用**：`useEffect`/`ipcRenderer.on`/命令注册只在 WebView 内执行一次
- **加载体验**：骨架屏比空白好，比"看到插件 UI 然后突然消失"好（不会有闪一下的错觉）
- **超时可恢复**：重试按钮调 `pv.create()` 重建 WebView，不需要关掉标签页重新打开
