# 多 WebView 回归矩阵——E5.5#41-#44

> **目的：** E5.5 完成后，对整个多 WebView 栈做系统回归。不是"每个功能点一次"——是**分层、结构化**的回归。

## 第 1 层：基础设施——WebView 生命周期（E5.5#41）

| # | 场景 | 操作 | 预期 | 状态 |
|:--:|:--|:--|:--|:--:|
| 1.1 | 插件 WebView 创建 | 打开一个插件标签页 | `getAllIds()` 包含该 pluginId | [ ] |
| 1.2 | 插件 WebView 销毁 | 关闭标签页 → 60s 后 | `getAllIds()` 不再包含该 pluginId | [ ] |
| 1.3 | Grace period | 关闭标签页 → 5s 内重开 | WebView 复用（不创建新的） | [ ] |
| 1.4 | Grace period 到期 | 关闭标签页 → 等待 65s | WebView 被销毁（任务管理器少一个 renderer） | [ ] |
| 1.5 | 崩溃恢复 | `chrome://crash` 在插件 WebView DevTools | 壳 WebView 继续运行，插件 WebView 60s 后重建 | [ ] |
| 1.6 | 卸载插件 | 卸载 → 对应 WebView 立即销毁 | `getAllIds()` 不含该 pluginId | [ ] |
| 1.7 | notifyReady | 打开插件标签页 → 等待加载 | `readyWebViewIds.has(pluginId) === true` | [ ] |
| 1.8 | webViewBoundsReady | WebView 创建后 bounds IPC 完成 | `webViewBoundsReady.has(pluginId) === true` | [ ] |
| 1.9 | React fallback | WebView 加载超时 5s | React 组件显示（不再是 placeholder） | [ ] |
| 1.10 | StrictMode 双重 mount | React 18 StrictMode 下开/关插件 | `readyWebViewIds` 无重复/幽灵 ID | [ ] |

## 第 2 层：通信——IPC 通路（E5.5#42）

| # | 场景 | 操作 | 预期 | 状态 |
|:--:|:--|:--|:--|:--:|
| 2.1 | push 队列 | 插件 WebView 调 `linkdesk.commands.execute` | 命令在壳 WebView 执行 | [ ] |
| 2.2 | broadcast 广播 | IpcBridge 广播 `contextKey:changed` | 所有 WebView 收到（壳 + 所有插件 WebView 的 DevTools 都能看到） | [ ] |
| 2.3 | lastBroadcasts 回放 | 新 WebView 连接 → IpcBridge 回放最近 50 条广播 | 新 WebView 的 contextKey 状态正确 | [ ] |
| 2.4 | p2p 通信 | 两个插件 WebView 直接通信（不经过壳） | 目标插件收到消息，其他插件不收到 | [ ] |
| 2.5 | 广播积压 | 快速切换标签页（每秒 5 次 × 持续 10s） | IpcBridge 无 push 队列溢出 | [ ] |
| 2.6 | 插件未就绪 | 发送 push 到未 ready 的插件 | 队列缓冲 → ready 后释放 | [ ] |

## 第 3 层：UI——用户交互（E5.5#43）

| # | 场景 | 操作 | 预期 | 状态 |
|:--:|:--|:--|:--|:--:|
| 3.1 | 文件树右键菜单 | 右键文件树节点 | ContextMenu 可见（在壳 WebView 之上） | [ ] |
| 3.2 | 编辑器右键菜单 | 在编辑器中右键 | ContextMenu 可见 | [ ] |
| 3.3 | Dialog 确认框 | 删除文件 → 确认框 | Dialog 可见，确认/取消回调送达 | [ ] |
| 3.4 | Toast 通知 | 操作成功 → Toast 出现 | Toast 在壳侧显示 | [ ] |
| 3.5 | 快捷键 Ctrl+C | 焦点在插件 WebView → Ctrl+C | 快捷键在壳注册，通过 IpcBridge 发到插件 | [ ] |
| 3.6 | 快捷键 Ctrl+W | 关闭当前标签页 | 壳 WebView 收到 → 关闭（不依赖插件 WebView 焦点） | [ ] |
| 3.7 | Command Palette | Ctrl+Shift+P | 命令面板可见（在 OverlayWindow 中） | [ ] |
| 3.8 | 标签页拖拽 | 拖拽标签页到新的分屏区 | 拖拽毛玻璃在 OverlayWindow 中显示 | [ ] |

## 第 4 层：稳定性——长时间运行（E5.5#44）

| # | 场景 | 操作 | 预期 | 状态 |
|:--:|:--|:--|:--|:--:|
| 4.1 | 内存积累 | 创建/销毁插件 WebView × 100 次 | heap 增量 < 50MB（GC 回收成功） | [ ] |
| 4.2 | IPC 泄漏 | 创建/销毁 WebView × 100 次 | `ipcRenderer.listenerCount()` 不无限增长 | [ ] |
| 4.3 | 多 WebView 并发 | 同时打开 5+ 插件标签页 | CPU 不超过 30%（idle），renderer 进程数正确 | [ ] |
| 4.4 | 内存阈值 | 手动分配 1GB+ 内存（`new ArrayBuffer(1024**3)`） | windowManager 触发 flushGracePeriods，未激活 WebView 被销毁 | [ ] |
| 4.5 | 崩溃不影响其他 | 在插件 WebView DevTools 中执行 `process.crash()` | 壳 WebView 继续工作，其他插件不受影响 | [ ] |
| 4.6 | StrictMode 长期运行 | React StrictMode 下运行 30 分钟 | 无 console.error/warning 累积 | [ ] |

## 覆盖所有已知 bug

每个回归场景对应一个已知 bug：

| 回归 # | 对应 bug | 来源 |
|:--|:--|:--|
| 1.8 | webViewBoundsReady 未完成 → React 提前隐藏 fallback | [[e5-multi-webview-6-bugs]] Bug 1 |
| 1.7 | notifyReady 事件在 onReady 注册前到达 | [[e5-multi-webview-6-bugs]] Bug 4 |
| 2.1 | push 队列——插件进程调壳命令 → 命令在壳执行 | [[e5-multi-webview-abandoned]] Bug 3/4 |
| 3.1-3.2 | 右键菜单被壳遮挡 | [[e5-multi-webview-abandoned]] Bug 1 & 2 |
| 3.3-3.4 | Dialog/Toast 被壳遮挡 | [[e5-multi-webview-abandoned]] Bug 2 |
| 1.1-1.4 | WebView 创建/销毁生命周期 | [[e5-multi-webview-abandoned]] Bug 6 |
| 2.3 | lastBroadcasts 回放——状态恢复正确 | [[multi-webview-root-cause]] 模式 3 |
| 4.3 | 多 WebView 并发 CPU | [[multi-webview-pitfalls-and-solutions]] 陷阱 7 |
| 4.5 | 崩溃隔离 | [[e5-multi-webview-abandoned]] bug 范围 |

## 验证流程

1. **Layer 1（生命周期）**——先跑，任何失败 = 多 WebView 基础设施破损，不继续
2. **Layer 2（通信）**——基础设施正常后，验证所有 IPC 通路
3. **Layer 3（UI）**——IPC 通路正常后，验证用户可见的交互
4. **Layer 4（稳定性）**——最后跑，长时间测试

**每一层未通过 → 不进入下一层。**

## 相关

- [[e5-multi-webview-abandoned]]
- [[e5-multi-webview-6-bugs]]
- [[multi-webview-root-cause]]
- [[multi-webview-pitfalls-and-solutions]]
