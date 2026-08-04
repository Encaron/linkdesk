# E5 执行清单——已完成任务（单 WebView 压缩版）

> 2026-08-04。E5 🎉。原 78 任务，多 WebView 实验后回退单 WebView。本清单只列已完成项，小任务合并为一行概括。

---

## 第 1 层：壳通信骨架 ✅

### ShellEvents + 四区域解耦（E5#1–#8）
- ShellEvents 类型系统 + 类型安全 emit/on + 单例 `shellEvents` → IconBar/SidePanel/MainContent/StatusBar 四区域互不 import，只走事件 | `ShellEvents.ts` + 四组件 ~100 行
- App.tsx 去胶水化——删 15 个 props，`useTabManager` 搬 MainContent，`TabActionsContext` 收割 | App.tsx −200 行

### LayoutEngine（E5#9）
- `LayoutEngine` 类——docked/floating zone 坐标计算 + 默认布局（iconbar 42 + sidebar 280 + main flex + statusbar 24）| `LayoutEngine.ts` ~150 行

### React Fallback 退役（E5#10–#11）
- 多 WebView 双条件关停（`readyWebViewIds && webViewBoundsReady`）+ 5s 超时兜底 + 白名单逐插件验收（serial-monitor/settings/marketplace/file-tree/editor）→ 最终删白名单 | `MainContent.tsx` ~50 行
- 6 个 WebView 生命周期 bug 全部修复（bounds sync 依赖/无标签页超时/webViewTimeout 不可逆/notifyReady 竞态/setVisible 时序/WebView bounds 覆盖标签栏）

### 多 WebView 生命周期归一化（E5#81–#83）
- `useWebViewSync` hook 抽取——4 effect + 3 state 归一化 | `useWebViewSync.ts` 190 行
- bounds 计算 callback ref 替代 `querySelector` | `MainContent.tsx` ~10 行
- IPC 监听器注册位置规则 + ESLint `no-module-level-ipc-listener` | `eslint.config.js` + CLAUDE.md

### keep-alive 修复（E5#40）
- `display:none` → `opacity:0` + `pointerEvents:none`——Monaco 光标不丢 | `TabPanePositioner.tsx` 3 行

### 侧栏行为归一化（E5#48–#49）
- 同图标再点 toggle 折叠/展开（和 ◀/▶ 行为一致）| `SidePanel.tsx` ~20 行

---

## 三通信机制 ✅

### 广播 + 请求 + 推流（E5#61–#67）
- `events` 审计加固 + `source` 字段 | `event-system.ts` + `ipc-bridge.ts`
- `requestToPlugin` 双向请求通道 + `invokeBeforeClose` 改用 IPC | `ipc-bridge.ts` + `viewRegistry.ts` ~30 行
- `p2p.send/on` 插件间定向推流 | `ipc-bridge.ts` + `preload-plugin.ts` ~20 行
- 弹窗归一化——`linkdesk.dialog.confirm/alert` 走 IPC | 4 文件 ~25 行

### linkdesk.* API 补全（E5#68–#72）
- `linkdesk.tabs`——create/openOrFocus/focus/close 等 7 方法 | proxy channel + IpcBridgeHandler + preload ~25 行
- `linkdesk.menu`——registerItems/getItems | 同上 ~15 行
- `linkdesk.contextKey`——set | 同上 ~10 行
- `linkdesk.pluginState`——get/set | 同上 ~15 行
- `linkdesk.pluginState.onChange`——跨 WebView 订阅（E5#84f Layer 2）| 同上 ~20 行
- ESLint `no-restricted-imports`——禁止插件 import @src/core | `eslint.config.js` ~15 行
- 迁移 5 插件 10 文件的 import→API（E5#68d/#69e/#70e/#71e）

### 主进程数据推送多 WebView 化（E5#74）
- `serial-handlers.ts`/`lsp-handlers.ts`/`file-handlers.ts`——数据广播到所有插件 WebView | 3 文件 ~20 行
- `event-system.ts` 重写——去 subscriptions Map dispatch | ~50 行

### 三机制文档 + 类型（E5#66）
- `多WebView三通信机制.md` 重写 + `linkdesk-api.ts` 类型补全 + `01-插件API契约.md` 完整重写（20 命名空间）| 3 文件 ~400 行

---

## 跨 WebView 状态同步 ✅

### serial-monitor 状态桥（E5#84a–#84f）
- `sourceId` IPC 通道——`pluginRequest.handle('openSession')` + 双模式 `ipcSourceId ?? propSourceId` | `index.tsx` + `MainContent.tsx` ~20 行
- 窗口缩放 bounds 实时重算 | `useWebViewSync.ts` 6 行
- 多标签页 sourceId 覆盖修复 | `MainContent.tsx` 3 行
- **E5#84f 核心：** `useSerialSessions._notify()` 加 `events.emit` 广播 + `_ensureInit()` 加订阅——壳侧栏↔插件主区状态实时同步 | `useSerialSessions.ts` ~12 行

### 弹窗 z-order（E5#84g）
- `DialogService` 加 `_hideAllPluginViews()`——弹窗前 setBounds 屏幕外 + setVisible | `DialogService.ts` ~30 行
- MainContent 加 `dialog:visibility` 监听器恢复 WebView | `MainContent.tsx` ~15 行

---

## 单 WebView 回退 ✅

### 回退方案
- `loader.ts` 注释两行 `pluginViews.create()`——停止创建 WebContentsView | 2 行
- 多 WebView 资产 ~1,000 行全部保留（`WindowManager`/`PluginViewRegistry`/`IpcBridge`/`preload-plugin`/`plugin-shell-main`/`useWebViewSync`），取消注释即可恢复
- 回退原因：8 bug——弹窗/毛玻璃被原生视图盖住（z-order 无解）、侧栏/主区状态不同步、设置插件无内容、串口对话覆盖、状态灯不亮

### API 补全——插件去 @src/core import（E5#85）
- 新增 `linkdesk.path`（normalize/join/basename/dirname/extname）、`linkdesk.filesystem` 扩展（listDir/exists/mkdir/copy/remove/watch）、`linkdesk.workspace`（getFolders/getActive）| `preload-*.ts` + `ipc-bridge.ts` + `IpcBridgeHandler.ts` ~60 行
- 插件迁移——66→42 import，editor/file-tree 14 文件替换为 linkdesk.* API | ~50 行
- `preload-shell.ts` 补 `config`/`commands`（修复侧栏 `lk.configuration.get()` 崩溃）| ~25 行
- ESLint 升级 warn→error + vitest mock 基础设施 | `eslint.config.js` + `vitest.setup.ts` ~80 行

### 拖拽分屏恢复（E5#5e-ii-f）
- `handleDropSplit`/`handleDropCopySplit` 从 App.tsx stub 搬进 MainContent——拖标签页到主区边缘分屏 | `MainContent.tsx` +35 行 / `App.tsx` −30 行

---

## 迁移 + 测试（E5#11f–#11l）
- 5 插件逐验收 WebView 独立（serial-monitor/settings/marketplace/file-tree/editor）
- editor 双模式组件 + Monaco 0×0 初始化修复 + 4 bug 修复后白名单删除
- vitest 365 测试 358 通过（7 预存失败）

---

## 最终状态

| 指标 | 数值 |
|---|---|
| 已完成任务 | ~70/78 |
| 代码行数 | ~3,000 行（含多 WebView 保留资产） |
| linkdesk.* API | 20 命名空间 |
| ESLint 规则 | `error` 级拦截 `ConfigurationService`/`pathUtils` import |
| 测试 | 358/365 通过 |
| 多 WebView | 回退——资产保留 ~1,000 行，取消注释即可恢复 |
