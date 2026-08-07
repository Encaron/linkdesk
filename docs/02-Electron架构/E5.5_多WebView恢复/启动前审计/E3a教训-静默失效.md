# E3a 教训——静默失效——E5.5#0d + #1e

> 📖 **来源：** [[multi-webview-not-done-lesson]]——E3a 多 WebView 迁移。全部 13 项检查打勾完成，但 `registerPlugin()` 从未被调用。`getAllIds()` 返回 `[]`。多 WebView 从未真正运行过。
> ——Encaron："不要被表象骗了。代码在那不代表在工作。"

## E3a 发生了什么

```
E3a 目标：把 ~800 行多 WebView 代码从 E2 迁移到 E3 新架构。

做完的 13 项：
  ✅ WindowManager 初始化正确
  ✅ PluginViewRegistry 注册表正常
  ✅ IpcBridge 实例化无报错
  ✅ preload-plugin.ts 暴露了 linkdesk.* API
  ✅ useWebViewSync.ts hook 逻辑正确
  ✅ MainContent 双条件回退正确
  ✅ loader.ts 中 createPluginView() 被调用
  ✅ ... 等等 13 项全部打勾

实际结果：
  getAllIds() → []（空数组）
  所有 WebView 都未创建

根因：
  registerPlugin() 在主进程正常运行
  但 loader.ts 中使用的是 pluginViewRegistry.create() 的壳侧桥接
  桥接函数检查了 'plugin-view:create' handler 存在 → 存在
  但 ipcRenderer.invoke('plugin-view:create', id) → 主进程没有注册这个 handler！
  → 静默返回 undefined → 不报错
  → 没有 WebView 被创建
  → 所有 React 组件原地 fallback 到单 WebView 模式
  → 肉眼看上去一切正常。菜单正常。配置正常。编辑器正常。
  → 但这是一个单 WebView 应用，不是多 WebView。
```

## 关键教训

### 1. "存在" ≠ "工作"

```typescript
const handler = ipcMain._events['plugin-view:create'];
console.log(handler);  // undefined ← 没有注册
// 但下面的代码从不检查 handler 是否存在
const result = await ipcRenderer.invoke('plugin-view:create', pluginId);
// result → undefined ← 静默
```

### 2. 静默失效是最危险的失效

多 WebView bug 的特点：
- ❌ 不崩溃（`render-process-gone` 是唯一会 crash 的事件）
- ❌ 不报错（IPC invoke 成功，只是返回 undefined）
- ❌ 不白屏（React fallback 回到单 WebView 模式，一切"看着正常"）
- ❌ 不降性能（单 WebView 性能本来就正常）
- ✅ 只是功能静默消失——菜单不弹、挂件不工作、状态不同步

### 3. 端到端验证是唯一可信的

不要信代码。不要信打勾。不要信 `console.log`。

```typescript
// 唯一可信的验证：行为测试
const ids = await window.linkdesk.pluginViews.getAllIds();
console.assert(ids.length > 0, '多 WebView 未启动');
console.assert(ids.includes('file-tree'), 'file-tree 插件 WebView 未创建');

// 在 process monitor 里看到多出一个 renderer 进程 ← 这才算真多 WebView
```

## E5.5 防御措施

### E5.5#0d：取消注释前——端到端验证

在执行 `E5.5#1`（取消注释）之前，先跑这个脚本：

```typescript
// electron/test/multi-webview-e2e.ts (临时——验证后删除)
async function verifyMultiWebViewChain() {
  // 1. 主进程 handler 注册
  const handlers = ipcMain.eventNames().filter(n => n.toString().startsWith('plugin-view:'));
  console.assert(handlers.length >= 7, `期望 7 个 plugin-view:* handler，实际 ${handlers.length}: ${handlers}`);
  
  // 2. 壳 preload 暴露
  const createFn = contextBridge.exposedInMainWorld('linkdesk')?.pluginViews?.create;
  console.assert(typeof createFn === 'function', 'pluginViews.create 未暴露到壳 preload');
  
  // 3. 端到端：创建 → 获取 ID
  const result = await ipcRenderer.invoke('plugin-view:create', 'test-e2e');
  console.assert(result, 'plugin-view:create 调用失败——返回 undefined');
  
  // 4. 端到端：getAllIds
  const ids = await ipcRenderer.invoke('plugin-view:getAllIds');
  console.assert(ids.includes('test-e2e'), `创建的 View 不在 getAllIds 中: ${ids}`);
  
  // 5. 清理
  await ipcRenderer.invoke('plugin-view:destroy', 'test-e2e');
  
  console.log('✅ 全链路验证通过——多 WebView 基础设施在工作');
}
```

### E5.5#1e：取消注释后——行为验证

```typescript
// 取消注释后立即验证，不等 UI
const verifyPluginWebView = (pluginId: string) => {
  // 1. IPC 调用成功
  const createResult = await window.linkdesk.pluginViews.create(pluginId);
  console.assert(createResult, `创建 WebView 失败: ${pluginId}`);
  
  // 2. getAllIds 能查到
  const ids = await window.linkdesk.pluginViews.getAllIds();
  console.assert(ids.includes(pluginId), `创建的 View 不在列表: ${pluginId}`);
  
  // 3. notifyReady 能送达（等待最多 2s）
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('notifyReady 超时 2s')), 2000);
    window.linkdesk.pluginViews.onReady((id) => {
      if (id === pluginId) { clearTimeout(timeout); resolve(); }
    });
  });
  
  // 4. push 队列能接收消息
  const queue = window.linkdesk.pluginViews.pushQueue(pluginId);
  console.assert(queue, `push 队列创建失败: ${pluginId}`);
  
  // 5. readyWebViewIds 包含插件（壳侧 useWebViewSync hook 已接收）
  console.assert(readyWebViewIds?.has(pluginId), `readyWebViewIds 不包含: ${pluginId}`);
};

// 对第一个内置插件（如 editor）跑完整验证
await verifyPluginWebView('editor');
console.log('✅ 首个插件 WebView 创建验证通过——多 WebView 已恢复');
```

## 验证清单

- [ ] E5.5#0d：取消注释前——7 个 handler 全部注册，create→getAllIds→destroy 全链路
- [ ] E5.5#1e：取消注释后——首个插件 WebView 创建→ready→push 队列→readyWebViewIds 全链路
- [ ] 任务管理器显示多出至少 1 个 renderer 进程（Windows: 任务管理器 / macOS: 活动监视器）
- [ ] `console.log(window.linkdesk.pluginViews.getAllIds())` 在 DevTools 中返回非空数组

## 相关

- [[multi-webview-not-done-lesson]]
- [[e5-multi-webview-abandoned]]
- [[ai-pre-commit-checklist]]——机械检查清单
