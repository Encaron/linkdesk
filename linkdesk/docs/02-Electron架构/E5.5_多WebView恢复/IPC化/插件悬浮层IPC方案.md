# 插件悬浮层 IPC 方案——E5.5#11-#15

> 📖 **背景：** 多 WebView 下插件渲染的 ContextMenu/Dialog/Toast/SelectBox 等悬浮层 DOM 被限制在当前 WebContentsView 内——CSS z-index 无法跨越 OS 级位图层。
> **方向：** 所有 HTML 悬浮层走 IPC → 壳 WebView（临时）或 OverlayWindow（根治）渲染。

## 被影响的组件

| 组件 | 位置 | 当前渲染 | 多 WebView 行为 | IPC 化 |
|:--|:--|:--|:--|:--|
| **ContextMenu** | plugin → shell 交互 | 壳 React | ✅ 已 IPC 化（E5#69）——`menu:showContextMenu` | E5.5#11 验证 |
| **DialogService** | 插件代码 | 当前插件调用 `window.linkdesk.dialog.show()` | ✅ 已有 IPC——`dialog:show` | E5.5#12 验证 |
| **Toast** | 插件代码 | 壳级 `window.linkdesk.toast.show()` | ✅ 已有 IPC——`toast:show` | E5.5#14 验证 |
| **SelectBox** | plugins/ 内部 | 插件 React 渲染 | 🔴 限制在插件 WebView 内 | E5.5#15 切 IPC |
| **OverlayPortal** | plugins/ 内部 | ReactDOM.createPortal → document.body | 🔴 portal 到的是插件 WebView 的 body | E5.5#15 切 IPC |
| **InlineInput** | plugins/ 内部 | 插件 React 渲染 | 🟡 部分受限制 | 评估是否需要 |

## 方案：IPC 透传 + 壳渲染

### 通用模式

```
插件 WebView:
  window.linkdesk.overlay.show({
    type: 'contextMenu' | 'dialog' | 'toast' | 'selectBox',
    pluginId: 'my-plugin',
    props: { ... }  // 组件 props 序列化
  })
       ↓ IPC (plugin:request → IpcBridge → shell:response)
壳 WebView:
  OverlayManager 收到 → 渲染对应组件
  → 用户交互（点击/选择/确认）
  → 结果 IPC 回插件:
  window.linkdesk.overlay.onResponse(response)
```

### 需要序列化的数据结构

ContextMenu props → 已由 IpcBridge 处理 ✅
Dialog props → `{ title, message, buttons, type }` → 简单对象 ✅
Toast props → `{ message, type, duration }` → 简单对象 ✅
SelectBox props → `{ options, selected, onChange }` → **onChange 是回调函数，需要 IPC 返回**

`onChange` 回调 IPC 化：
```typescript
// 插件侧
window.linkdesk.overlay.showSelectBox({
  options: ['COM1', 'COM3', 'COM4'],
  selected: 'COM3',
  requestId: generateId(),  // UUID，关联回调
});
// 等待 response
window.linkdesk.overlay.onResponse('selectBox', requestId, (result) => {
  if (result.action === 'select') {
    setPort(result.value);  // React setState
  }
});
```

每个 IPC 化的悬浮层需要一个 `requestId` 关联请求-响应，因为可能有多个并发的悬浮层。

## E5.5#11 ContextMenu 验证

ContextMenu 已经 IPC 化（E5#69），在多 WebView 下需要验证：

- [ ] 文件树右键 → ContextMenu 正确显示（在壳 WebView 中渲染）
- [ ] 编辑器右键 → ContextMenu 正确显示
- [ ] 菜单项点击 → IPC 回调正确送达插件 WebView
- [ ] 子菜单 → 嵌套展开正确
- [ ] 菜单键盘导航 → ↑↓ Enter Escape 正常

## E5.5#12 Dialog 验证

- [ ] `window.linkdesk.dialog.showConfirm('确认删除？')` → Dialog 在壳 WebView 渲染
- [ ] 确认/取消回调正确送达插件
- [ ] 自定义按钮（三按钮：保存/不保存/取消）→ 正确处理

## E5.5#13 插件自定义弹窗 IPC 化

**仅限插件内部使用、不需要跨 WebView 可见的弹窗**（如 Monaco 编辑器的代码补全弹出框）→ **不需要** IPC 化。它们在插件自己的 WebView 内合理。

**需要 IPC 化的：** 任何需要覆盖壳 WebView 区域的悬浮层。

E5.5#13 只 IPC 化真的被壳遮挡的弹窗。不碰 Monaco suggest widget、文件树内联编辑等——它们在插件自己的 WebView 里工作正常。

## E5.5#14 Toast 验证

- [ ] 插件调用 `window.linkdesk.toast.show('操作成功', 'success')` → Toast 在壳侧显示
- [ ] Toast 自动消失 → 不影响插件 WebView 状态
- [ ] 多个 Toast 不重叠

## E5.5#15 SelectBox/OverlayPortal IPC 化

- [ ] SelectBox 下拉列表显示在壳 WebView 中（不在插件 WebView 内被截断）
- [ ] 选中回调正确送达插件
- [ ] OverlayPortal → 切换到 OverlayWindow 渲染（E5.5#38-#40 后）

## 验证

- [ ] 所有 IPC 化悬浮层在插件 WebView 不可见时也能显示（验证真正在壳 WebView 渲染）
- [ ] 无重复渲染——壳和插件不同时显示同一个弹窗
- [ ] requestId 无碰撞——并发悬浮层正确处理

## 相关

- [E5#69 MenuRegistry IPC](linkdesk/src/core/registry/MenuRegistry.ts)
- [IpcBridge.ts](linkdesk/electron/ipc-bridge.ts) PROXY_CHANNELS
