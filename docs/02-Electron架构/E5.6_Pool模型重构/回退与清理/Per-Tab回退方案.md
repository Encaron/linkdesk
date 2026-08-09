# Per-Tab 回退方案

> 📖 对应执行清单：[E5.6#0a, E5.6#1-#4, E5.6#31-#36](../E5.6-执行清单.md)
> 📖 E5.5 原始实现：[04-PerTab-WebView-设计.md](../../E5.5_多WebView恢复/04-PerTab-WebView-设计.md)

---

## 1. 回退范围

E5.5#9a-#9m 共 13 个子任务。在 e5.6 分支全部回退。

### 需要回退的文件和行

| 文件 | E5.5#9 改动 | 回退操作 |
|:--|:--|:--|
| `electron/window-manager.ts` | 加 `rekeyInstance`/`findGraceInstance`/`graceTimers` | 删 |
| `electron/plugin-view-registry.ts` | 加 `rekeyInstance`/instanceId 路由 | 删 |
| `electron/ipc-bridge.ts` | `pushToPlugin`/`requestToPlugin` instanceId 参数 | 参数改为 tabId |
| `electron/ipc/plugin-view-handlers.ts` | 9 个 handler | 替换为 4 个 pool handler |
| `electron/preload-shell.ts` | `pluginViews.*` 命名空间 + ready buffer | 替换为 `pool.*` |
| `electron/preload-plugin.ts` | `notifyReady`/`pluginInstance` | 替换为 `pool.onLayout`/`pool.ready` |
| `src/hooks/useWebViewSync.ts` | 3 Effect + 3 Set + ResizeObserver + 宽限期 | **整文件删除** |
| `src/components/MainContent.tsx` | useWebViewSync 集成 + 空div占位 | 改为 syncLayoutToPools |
| `src/plugin-shell-main.tsx` | 多 WebView 模式 | 删多 WebView 分支 |
| `src/pluginLoader/loader.ts` | `pluginViews.create()` 调用 | 注释掉 |

### 不需要回退的

| 文件 | E5.5#9 改动 | 原因 |
|:--|:--|:--|
| `src/core/services/LayoutEngine.ts` | `resizeZone`/`setZoneWidth` | 仍需要——双Pool bounds管理 |
| `src/App.tsx` | zoneBounds + SidePanel 自适应 | 保留——壳 layout 逻辑不变 |
| `src/components/SidePanel.tsx` | props.width | 保留——壳侧栏容器仍需要 |

---

## 2. 执行计划

### Phase 1：禁用（不删代码）

1. loader.ts——注释 `pluginViews.create()`
2. MainContent.tsx——跳过 useWebViewSync
3. 插件回壳渲染

Phase 1 不改删现有代码——只是不调用。

### Phase 8：删除

确认双Pool模型稳定后，删 E5.5#9 全部遗留代码。
