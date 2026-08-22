# 插件开发指南——Pool 模型版

> 📖 对应执行清单：[E5.6#77](../E5.6-执行清单.md)
> 📖 通信铁律：[[plugin-communication-standard]]

---

## 核心规则

1. **不 import `@src/core`**——全走 `window.linkdesk.*` IPC
2. **`pluginState` 用 `tabId` 做 scope key**——防同插件多标签页覆盖
3. **`sourceId` prop 是标签页唯一载荷**——文件路径/端口名/…
4. **ContextMenu/Dialog/Toast/SelectBox**——走 `linkdesk.*` IPC，OverlayWindow 渲染
5. **Pool 崩溃后自动恢复**——插件 mount 后从 `sourceId` 恢复状态

## Props

```typescript
interface PluginComponentProps {
  tabId: string;       // 标签页唯一 ID
  sourceId?: string;   // 载荷
  isActive: boolean;   // 是否活跃
}
```

## DevTools

F12 → 选择对应的 Pool DevTools（SidebarPool 或 MainPool）

## 与单WebView 时代的差异

**零差异。** `window.linkdesk.*` 签名完全一样。
