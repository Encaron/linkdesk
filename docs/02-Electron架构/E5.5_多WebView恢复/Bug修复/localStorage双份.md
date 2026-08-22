# localStorage 双份——E5.5#8

> 📖 **来源：** [[e5-multi-webview-abandoned]] Bug 5——localStorage 是 origin-based。多 WebView 加载同一个 origin（file:// 或 custom protocol）→ 每个 WebView 有独立的 localStorage → 插件在侧栏写的 localStorage 数据，主区打开时读到的是自己的副本。

## Bug 机制

```
单 WebView：
  插件 A localStorage.setItem('key', 'val')
  下次打开插件 A  → localStorage.getItem('key') → 'val' ✅

多 WebView：
  侧栏插件 A WebView (pid=1001):
    localStorage.setItem('key', 'val')   // 写入 WebView 1001 的 localStorage
  Tab 4 打开插件 A WebView (pid=1002):
    localStorage.getItem('key') → null  // WebView 1002 的 localStorage 是独立的
    → 状态丢了 ← 静默
```

**触发条件：**
1. 同一个插件同时在侧栏和主区打开（两个独立的 WebContentsView）
2. 同一个插件在不同标签页打开（每个标签页可能是独立的 WebView，取决于 reuse 策略）
3. `plugin-view:destroy` 销毁后再创建新的 WebView——旧 localStorage 随 WebView 销毁

## 防范方向

### 临时方案（E5.5#8a）：document storage

如果插件仅少量 key-value 状态，用 Electron 的 `session.defaultSession` 或者用 `window.linkdesk.pluginState` API（已有 E5#71 基础设施）。

```typescript
// 插件代码改动（兼容 localStorage 接口）
// 替换：
localStorage.setItem('myKey', JSON.stringify(value));
const data = JSON.parse(localStorage.getItem('myKey') || '{}');

// 为：
window.linkdesk.pluginState.set('myKey', value);       // IPC → 主进程文件持久化
const data = window.linkdesk.pluginState.get('myKey');  // IPC → 从主进程读
```

### 根治方案（E5.5#8b）：pluginState API 增强

E5#71 的 `pluginState` API 已在主进程持久化，只需加两条增强：

1. **`onDidChange` 事件：** 另一个 WebView 修改后通知
   ```typescript
   window.linkdesk.pluginState.onDidChange('myKey', (newValue) => {
     // 更新 React state，触发重渲染
     setLocalState(newValue);
   });
   ```

2. **`backfillLocalStorage()` 桥接：** 自动迁移现有 localStorage 调用
   ```typescript
   // 插件 bootstrap 调用一次
   window.linkdesk.pluginState.backfillLocalStorage();
   // → 创建 Proxy 替换 window.localStorage
   // → 所有 getItem/setItem 透明转发到 pluginState IPC
   // → 插件代码不用改
   ```

## 受影响插件审计

```bash
grep -rn "localStorage" plugins/
```

预计受影响的调用点：
- 主题设置 (`plugins/builtin/editor/src/services/theme-sync.ts` 中使用 localStorage？需要确认)
- 串口监视器的会话记录
- 文件树展开/折叠状态（已在 E5 迁移到 pluginState？）

## 验证

- [ ] 侧栏插件 A 写入 > 主区标签页打开插件 A → 读到相同数据
- [ ] 插件 A WebView 销毁重建 → 数据保留
- [ ] `localStorage` 桥接（如实现）→ `setItem` 调用实际落地到主进程文件
- [ ] `onDidChange` → 一个 WebView 改数据 → 另一个 WebView 立即收到更新

## 相关

- [[e5-multi-webview-abandoned]] Bug 5
- [[multi-webview-root-cause]] 模式 5: 持久化存储
- `linkdesk.pluginState` API（E5#71）
