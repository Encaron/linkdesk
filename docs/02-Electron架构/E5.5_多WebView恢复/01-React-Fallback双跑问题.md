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

删掉两处 `<plugin.component />`。`getViewPlugin()` 只取 `manifest.name` 显示插件名，不渲染组件。

**改后：**

```typescript
if (tab.pluginId) {
  const pluginName = getViewPlugin(tab.pluginId)?.manifest?.name ?? tab.pluginId;

  if (webViewTimeout?.has(tab.pluginId)) {
    return <div key={tab.id} className="plugin-timeout">
      {i18n.t('插件 "{{name}}" 加载超时', { name: pluginName })}
    </div>;
  }

  // 加载中 + 就绪 → 统一空 div（WebView 覆盖）
  return <div key={tab.id} className="plugin-webview-placeholder" />;
}
```

**改动量：** `MainContent.tsx:100-123`，删 20 行，写 8 行。不 import `ErrorBoundary`（不再需要）。

## 影响

- 壳侧零插件副作用
- 加载中：空 div（和就绪态一样），没有"插件 UI 闪一下再消失"的错觉
- 超时：静态文本显示插件名，不再 mount 插件 React 组件
