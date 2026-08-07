# E6 服务 IPC 就绪——E5.5#46-#48

> 📖 **背景：** E6（插件生态与发布）需要三个核心服务：PluginInstallService（安装/卸载）、PluginUpdateService（更新检测）、PluginMarketplaceService（商店交互）。这三个服务为了兼容多 WebView，必须在 E5.5 中用 IPC 实现——不要等 E6 发现"import @src/core 静默失效"再返工。

**决策理由：** Encaron 没有截止日期，架构干净度优先。E6 的全部新服务从第一天就用 IPC，零返工。

## E6 服务必须 IPC 化的原因

E6 的服务被多个 WebView 消费：

| 服务 | 消费者 | 多 WebView 影响 |
|:--|:--|:--|
| **PluginInstallService** | 壳（marketplace 页）、插件（plugin 管理面板） | 插件进程中 install → 只有插件进程的 PluginInstallService 副本更新了状态 → 壳未知 |
| **PluginUpdateService** | 壳（状态栏）、插件（plugin 详情页） | 更新检测在壳进程运行 → 插件进程看不到结果 |
| **PluginMarketplaceService** | 壳（商店页）、插件（搜索面板） | 市场数据在壳缓存 → 插件重新获取一遍（浪费带宽） |

## E5.5#46——PluginInstallService IPC

```typescript
// ❌ 当前（推测——E6 未开始）：
import { installPlugin } from '@src/services/PluginInstallService';
installPlugin(filePath);  // 在哪个进程调，哪个进程的实例工作

// ✅ E5.5#46 后：
window.linkdesk.pluginManager.install(filePath);     // IPC → 主进程
window.linkdesk.pluginManager.uninstall(pluginId);   // IPC → 主进程
window.linkdesk.pluginManager.enable(pluginId);      // IPC → 主进程
window.linkdesk.pluginManager.disable(pluginId);     // IPC → 主进程
window.linkdesk.pluginManager.getStatus(pluginId);   // IPC → 主进程

// 状态变更广播——任何 WebView 都能收到
window.linkdesk.pluginManager.onDidChangeStatus(({ pluginId, status }) => {
  // 壳和插件 WebView 同步更新 UI
});
```

**主进程 handler：**
```typescript
// electron/ipc/plugin-install-handlers.ts
ipcMain.handle('plugin-manager:install', async (event, filePath) => {
  // 1. 验证文件签名（E6#28 预留坑位）
  // 2. 解压到 plugins/ 目录
  // 3. 验证 plugin.json schema
  // 4. 更新 plugin-cache.json
  // 5. 广播 plugin-manager:statusChanged
  return { success: true, pluginId };
});
```

## E5.5#47——PluginUpdateService IPC

```typescript
window.linkdesk.pluginManager.checkUpdates();          // IPC → 主进程（防重复检查）
window.linkdesk.pluginManager.getUpdateInfo(pluginId); // IPC → 读缓存
window.linkdesk.pluginManager.update(pluginId);        // IPC → 下载+解压+替换
window.linkdesk.pluginManager.onDidChangeUpdateStatus(({ pluginId, updateInfo }) => {
  // 状态栏更新：3 个插件有更新
});
```

**主进程防重复：**
```typescript
let _updateCheckPromise: Promise<UpdateResult[]> | null = null;
ipcMain.handle('plugin-manager:checkUpdates', async () => {
  if (_updateCheckPromise) return _updateCheckPromise;  // 防重复
  _updateCheckPromise = fetchUpdateManifest().then(...);
  return _updateCheckPromise;
});
```

## E5.5#48——PluginMarketplaceService IPC

```typescript
window.linkdesk.marketplace.search(keyword, { page, pageSize, category });
window.linkdesk.marketplace.getFeatured();
window.linkdesk.marketplace.getCategories();
window.linkdesk.marketplace.getPluginDetail(pluginId);
window.linkdesk.marketplace.getReviews(pluginId, { page, pageSize });
```

**缓存策略（主进程）：**
- `_searchCache: Map<string, { result, expiry }>` — 按搜索关键字缓存，60s 过期
- `_featuredCache` — 启动时获取，每 30 分钟刷新
- `_pluginDetailCache` — 按 pluginId 缓存，5 分钟过期

## IPC 通道注册

所有新的 handler 在 `electron/ipc/` 下注册：

```typescript
// electron/ipc/plugin-manager-handlers.ts
registerPluginManagerHandlers(ipcMain, pluginViewRegistry) {
  ipcMain.handle('plugin-manager:install', installHandler);
  ipcMain.handle('plugin-manager:uninstall', uninstallHandler);
  ipcMain.handle('plugin-manager:enable', enableHandler);
  ipcMain.handle('plugin-manager:disable', disableHandler);
  ipcMain.handle('plugin-manager:getStatus', getStatusHandler);
  ipcMain.handle('plugin-manager:checkUpdates', checkUpdatesHandler);
  ipcMain.handle('plugin-manager:getUpdateInfo', getUpdateInfoHandler);
  ipcMain.handle('plugin-manager:update', updateHandler);
  // marketplace
  ipcMain.handle('marketplace:search', searchHandler);
  ipcMain.handle('marketplace:getFeatured', getFeaturedHandler);
  ipcMain.handle('marketplace:getCategories', getCategoriesHandler);
  ipcMain.handle('marketplace:getPluginDetail', getPluginDetailHandler);
  ipcMain.handle('marketplace:getReviews', getReviewsHandler);
  
  // 广播
  ipcMain.on('plugin-manager:statusChanged', broadcastStatusChange);
  ipcMain.on('plugin-manager:updateStatusChanged', broadcastUpdateStatus);
}
```

**在 E5.5#49（E6 API 收口）中注册这些 handler，但 E6 阶段才实现具体逻辑。**

## 验证

- [ ] E5.5#46——`plugin-manager:*` handler 全部注册（调用返回 `{ notImplemented: true }` 也算注册）
- [ ] E5.5#47——`plugin-manager:checkUpdates` 防重复调用
- [ ] E5.5#48——`marketplace:*` handler 缓存逻辑正确
- [ ] 所有 handler 在 preload-shell.ts 中暴露
- [ ] 所有 handler 在 preload-plugin.ts 中暴露（插件也能调）

## 相关

- [E6 执行清单](../E6_插件生态与发布/E6-执行清单.md)
- [E6#28 代码签名坑位](../E6_插件生态与发布/E6-执行清单.md)
- [E6#31e LSP 路径解析——插件自带 LSP 二进制定位](../E6_插件生态与发布/E6-执行清单.md)
- [IpcBridge.ts](linkdesk/electron/ipc-bridge.ts)
