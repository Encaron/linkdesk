# 旧 Bug 预警与新生风险——写给未来写代码的 AI

> 2026-07-24。**Tauri 时代 437 个 commit，超过 100 个已修复 bug。这份文档不是庆祝胜利——是防止这些 bug 在 Electron 新架构下借尸还魂，或者在新架构的接缝处长出新的。**
>
> **Encaron 的原话：** "换成新架构后，有多少老 bug 可能会再次发生？这些需要提前预防。我举个例子，插件市场卸载我给它提交了无数个 commit，大部分都是为了解决要么点击卸载后需要全屏刷新、要么点击卸载后不起作用。还有标签栏行为以及侧栏行为的 bug。侧栏和图标栏和主栏之间的各种交互逻辑有没有可能产生新 bug？还有持久化保存、拖动图标之后保存、弹窗之类的，好多，而且有可能会产生新 bug。"
>
> **数据来源：** `git log --oneline --all`（437 commits）+ `memory/v3-pitfalls.md`（B1-B86）+ `docs/01-Tauri_P1至P5.5/P6-交互对标/P6-Bug修复完整记录.md`（A/B/C/D/E/F/G/H/N/S 类 48 个）。
>
> **此文写给未来写代码的 AI——每一个字都是用血的教训换来的。读三遍再写第一行代码。**

---

## 一、核心结论

> **E1 换地基（Tauri→Electron）消灭了约 25% 的旧 bug 根源，但约 55% 的 bug 是框架无关的逻辑/交互缺陷——会在新架构下以新面目重现。还有约 20% 是新架构独有的全新风险。**

---

## 二、架构变化——什么没了，什么来了

### 消失的东西（Tauri 特有——相关 bug 永远消灭）

| Tauri 时代 | Electron 时代 | 消灭的 bug |
|---|---|---|
| Rust 后端（751 行）：`serial.rs`/`plugins.rs`/`lib.rs` | Node.js main process | **H1**（MCU 断电死循环抢锁）、**B61**（Rust 硬编码 UTF-8 解码）、`fs::rename` 跨目录文件锁（**卸载 9 轮根因**） |
| `invoke()` IPC | `window.linkdesk.*` (contextBridge + ipcRenderer.invoke) | invoke 异步时序相关的竞态 |
| Tauri `listen()` (generation counter) | `ipcRenderer.on/off` | **B11**（StrictMode double-mount 重复注册）、**G4**（listen 泄漏） |
| `window.confirm()`/`window.prompt()` 被禁用 | 原生可用（但不应依赖——用 DialogService） | **B83**（confirm 静默返回 false）、**B80**（prompt React 批处理破坏） |
| Vite `import.meta.glob` 文件锁 | `linkdesk://` 协议 + 独立构建产物 | **卸载 bug 的根因——Windows 文件锁** |
| `@tauri-apps/plugin-fs` | Node.js `fs` via IPC | **B36**（Tauri v2 双权限体系 capabilities+scope）、**B47**（`isTauri()` 误判） |
| 单 WebView（物理限制） | 多 WebContentsView（E3a） | 插件间 JS 上下文污染、死循环全崩 |
| `add_child` (unstable) | `WebContentsView` (stable, Electron 30+) | API 不稳定导致的神秘行为 |
| Tauri `capabilities.json` 权限系统 | Electron 无此限制 | **B36**（fs 插件 IPC 被拒）、**B48**（identifier 改名→数据丢失） |
| `npx tauri dev` HMR 特殊行为 | Electron dev 标准模式 | **B75**（Vite `watch.ignored` 导致 plugin.json 不热更新）、**B82**（tauri dev vs vite 行为差异） |

### 新来的东西（Electron 特有——全新风险类别）

| 新东西 | 位置 | 带来的新风险 |
|---|---|---|
| Node.js main process | `electron/` | 主进程崩 = 整个应用崩。比 Rust panic 更难调试（JS 堆栈不完整） |
| `contextBridge` + `preload.ts` | `electron/preload/` | API 在 React mount 之前必须就绪——时序竞态 |
| `WebContentsView`（多进程） | E3a | 每个插件独立进程——IPC 延迟、内存开销、DevTools 分散 |
| `linkdesk://` 协议 | E1 步 5 | 自定义协议安全——XSS、路径遍历 |
| `serialport` npm | `electron/services/` | 原生模块编译——Electron Node 版本必须匹配 |
| `electron-builder` | 打包 | 原生模块重建、ASAR 打包、代码签名 |
| 跨进程主题/语言同步 | E3b/E3c | CSS 变量需要推到所有 WebView——漏一个就出现"黑白混合" |

### 不变的东西（框架无关——所有相关 bug 模式都可能重现）

| 层 | 状态 | 相关 bug 数量 |
|---|---|---|
| React 组件（壳 UI + 4 个插件） | 100% 保留 | ~40 个 |
| 核心 Registry（Command/Config/Menu/Protocol/Keybinding/CoreEvents） | 100% 保留 | ~15 个 |
| 标签页/分屏系统（useTabManager, SplitNode） | 100% 保留 | ~20 个 |
| CSS 变量体系 | 100% 保留 | ~8 个 |
| i18n 体系 | 100% 保留 | ~5 个 |
| 三栏布局（图标栏/侧栏/主区） | 100% 保留 | ~15 个 |
| 数据管道（RingBuffer → ProtocolParser → DataDispatch） | 保留，E3a 需跨进程 | ~8 个 |

---

## 三、全量 Bug 分类——按模式而非编号

> **以下按 bug 根因模式分类，不按 Phase 5.5 编号。每个模式覆盖了 Tauri 时代的所有相关 bug。每类标注"Electron 时代风险等级"。**

### 🔴 模式 1：持久化错乱——读/写/恢复/同步不一致

> **这是 Tauri 时代最大的单一 bug 来源。从 Phase 3 到 Phase 5.5，持久化相关的 bug 反复出现。**
>
> **Electron 时代风险：🔥🔥🔥🔥🔥——不变。多 WebView 后 localStorage 隔离是新坑。**

**全量 bug 清单：**

| Bug | Phase | 症状一句话 | 根因模式 |
|:--|:--|------|------|
| F5 布局丢失 | P3 | 标签页、分屏 F5 后全丢 | Tauri 异步写盘竞态窗口 |
| B3 | P5.5 | F5 后 session 丢失，标签页僵尸 | 布局持久化但 session 不持久化——两套持久化生命周期不一致 |
| B36 | P4.1 | 快捷发送/图标顺序/布局重启后丢失 | Tauri v2 双权限体系（capabilities + scope） |
| B47 | P4.3 | `npm run dev` savePrefs 报错 | `_useLocalStorage` 初始 false + `isTauri()` 误判——环境检测不可靠 |
| B48 | P4.3 | identifier 改名后数据全空 | `appDataDir` 路径变了——数据迁移没做 |
| B55 | P5e | F5 后终端 12 设置回退默认值 | 两个异步写操作竞态——默认值后到达覆盖持久化值 |
| B63 | P5f | 强调色 F5 后回退蓝色 | init 只读了 theme/language，漏了 accentColor |
| B64 | P5f | 强调色 B63 修复后仍旧 F5 变蓝 | **异步竞态**：`applyAccentColor` 同步，`applyTheme` 异步覆盖 |
| B66 | P5f | PluginStateService 和 ConfigurationService 往同一个 `settings.json` 写——互相覆盖 | 两个服务各写各的，无协调 |
| B67 | P5f | quickSends 绕过 ConfigurationService 走 PreferenceService | 多套持久化路径——ConfigService vs Prefs vs localStorage |
| B68 | P5f | beforeunload 和 LayoutService 各写各的 `v3_layout` | 两套序列化路径可能不同步 |
| B77 | P5h | 重装后图标 F5 跳回老位置 | `iconOrder` 异步持久化——`await` 排在 React 重渲染微任务之后 |
| B82 | P5.5 | `npx tauri dev` 删会话不关标签页 | 布局恢复后 `_terminalCounter` 归零——计数器与持久化数据不同步 |
| G3 | P5.5 | F5 后 ID 碰撞 | 模块级计数器归零但恢复数据保留旧 ID |
| G6 | P5.5 | `toLayoutData` setState hack 读状态 | Concurrent Mode 下 updater 异步→读到 undefined |

**根本问题：** 项目历史上同时存在 4 套持久化机制（`localStorage.setItem`、`PreferenceService`、`ConfigurationService`、Tauri `writeTextFile`），互相不知道对方在写什么、什么时候写、写完别人能不能读到。

**Electron 时代适用性：** 100%。E2c FileService 必须成为**唯一**的持久化入口。多 WebView 后还多了一个坑：壳 WebView 的 localStorage ≠ 插件 WebView 的 localStorage。

**预防规则：**

1. **E2c FileService = 唯一持久化入口。** 禁止 `localStorage.setItem` 直接写关键数据。localStorage 仅用于非关键缓存（窗口位置等）
2. **读写时序统一：** 先更新内存 → 同步渲染 → 异步落盘。落盘失败不影响 UI
3. **恢复后计数器同步：** 每次从持久化恢复数据后，扫描所有已用 ID，将对应计数器设为 `max + 1`
4. **持久化数据归属明确：** 壳级数据（layout/iconOrder/theme）→ 壳 WebView 的 FileService；插件数据 → 壳侧 `.linkdesk/plugins/<id>/`——**不能存在插件 WebView 的 localStorage 里**（卸载 = 全丢）
5. **E1 迁移时特别注意：** Tauri `invoke()` 的持久化调用全部改为 `window.linkdesk.filesystem.*`

---

### 🔴 模式 2：插件生命周期——注册/注销不对称 + 事件时机错误

> **第二大 bug 来源。卸载一个插件涉及 N 个注册表（commands/keybindings/menus/configurations/icons/views/cards/channels/sessions/串口）+ M 个消费者（IconBar/Sidebar/StatusBar/marketplace/PluginDetailView/Settings Editor）。漏清理任何一个 = 一个 bug。**
>
> **Electron 时代风险：🔥🔥🔥🔥🔥——多 WebView 让生命周期管理更复杂。**

**全量 bug 清单：**

| Bug | Phase | 症状一句话 | 根因模式 |
|:--|:--|------|------|
| 卸载 9 轮 | P4-P5.5 | 点卸载不生效/需刷新/按钮无反应/文件未移动 | Rust `fs::rename` 文件锁 + 前端事件时机 + 错误静默吞掉 |
| B70 | P5e | 卸载后 Settings Editor 仍显示终端 12 项设置 | `unregisterConfiguration()` 存在但零调用——死代码 |
| B71 | P5e | 窄窗口设置页竖排单字符 | `overflow-wrap: break-word`——不相关但同批修复 |
| B72 | P5e | 卸载重装后图标回老位置 | `iconOrder` 有 PreferenceService 兜底读——卸载时不同步清理 |
| B76 | P5h | 卸载→撤销→"加载失败"| `enablePlugin` 错导向 `loadPluginRuntime`（plugin://协议）而非 `loadPlugin`（Vite chunk） |
| B77 | P5h | 重装后图标 F5 跳回老位置 | `iconOrder` 异步写入在 `registerViewPlugin` 之后 |
| B1(5.5-0a) | P5.5 | Settings Editor 打开 N 次后变慢 | `onDidChangeConfiguration` 从不取消订阅——listener 泄漏 |
| B2(5.5-0a) | P5.5 | 卸载后命令面板/右键菜单/快捷键仍有残留 | 6 个 `unregister*` 函数从未被调用——只清理了 3/9 注册表 |
| B3(5.5-0a) | P5.5 | `unregisterPluginKeybindings` 参数被忽略 | `Keybinding` 没有 `pluginId` 字段——字符串比较误删 |
| E5 | P5.5 | 卸载终端 session 残留 + 串口未关闭 | lifecycle 不知道 terminal 的清理需求 |
| G14 | P5.5 | 卸载后详情页仍显示"已安装" | 不订阅 `onDidUnregister` |
| G15 | P5.5 | Toast 撤销无错误处理 | dynamic import 失败无 catch |
| G16 | P5.5 | 手动删目录不自动卸载 | 文件监控单向——只检测新增，不检测删除 |
| G17 | P5.5 | `isSidebarPrimaryView` 死代码 | 被替代但未删除 |
| B78 | P5h | 热加载后图标重复 | 文件监控 + 加载路径不一致 |
| B5(B84 fix) | P5.5 | `invokeBeforeCloseTab` 归一化前三条关闭路径不一致 | TabBar ✕/中键/Ctrl+W 各有独立逻辑 |
| N5 | P5.5 | 重装插件不加载 | 重装后 manifest 缓存未刷新 |

**根本问题：** 插件生命周期涉及 N 个注册表 × M 个消费者。注册和注销不对称——注册时自动，注销时手动。事件触发时机（文件移动前 vs 后）影响消费者能否读到正确状态。

**Electron 时代适用性：** 100%。E3a 多 WebView 后：
- 插件 WebContentsView 被销毁时，`onWillUninstall` 的消费端在**壳 WebView** 中运行——跨进程清理
- 如果插件 WebView 已崩溃，清理链还能执行吗？
- Node.js `fs.cp` + `fs.rm` 替代 Rust `fs::rename`——根因消灭。但事件时机问题不变（文件移动前 vs 后发事件）

**预防规则：**

1. **每新增一个 registerXxx → 立即写对应的 unregisterXxx + 在 onWillUninstall 中接线**
2. **`performUninstall()` 单入口原则**——齿轮菜单/详情页/工具栏统一走这个函数。这是 9 轮修复的终极教训
3. **事件触发在文件操作之后**——消费者需要读到新状态（文件已移动）
4. **清理顺序：** 先清注册表（不可逆），再清文件（可逆）。文件操作失败时可以回滚注册表
5. **卸载 = 移文件 + 清注册表 + 清持久化状态。** 三个操作缺一不可

---

### 🔴 模式 3：侧栏↔图标栏↔主栏（标签页）三栏交互不同步

> **第三大 bug 来源。三栏交互路径多、状态散落、同步要求高。**
>
> **Electron 时代风险：🔥🔥🔥🔥——E3a 后跨进程同步，路径更长。**

**全量 bug 清单：**

| Bug | Phase | 症状一句话 | 根因模式 |
|:--|:--|------|------|
| B37 | P4.1 | plugin-detail 标签页路由到终端组件 | `renderTabContent` 先匹配 `tab.pluginId`="terminal"→路由错误 |
| B38 | P4.1 | 标签页同名 → IconBar 双重高亮 | plugin-detail 的 pluginId 污染 IconBar 高亮逻辑 |
| B39 | P4.1 | 侧栏跟着标签页切换跳走 | `useEffect` 在 activeTabType 变时清 sidebarView |
| B40 | P4.1 | 双击侧栏不能固定标签页 | onClick/onDoubleClick 竞态 + pinned 未传播 |
| B80 | P5.5 | 侧栏快速点击丢事件 | DOM click 事件：mousedown A + mouseup B → target = 共同祖先 |
| B81 | P5.5 | `flushSync` 弯路 | AI 误诊为 React 竞态——实际是 B80 的 DOM 事件问题 |
| A2/N1 | P5.5 | 改名→标签栏标题不更新 | `handleRename` 只更新 session.name，不更新 tab.label |
| A4 | P5.5 | ✕ 关标签页→侧栏点 session 重开不了 | `focusTab` 找不到已关闭的 tab→静默失败 |
| A5 | P5.5 | 标签栏点标签页→主区内容不变 | `handleFocusTab` 不更新 `_activeSessionId` |
| B2(侧栏) | P5.5 | 侧栏点会话→主区内容不变 | 所有 TerminalView 读同一个 global `activeSession`——C1 |
| C1 | P5.5 | 两个终端标签页永远显示同一条数据 | 模块级 `_activeSessionId` 被所有 TerminalView 共享 |
| D4 | P5.5 | 侧栏 +新建 不弹标签页 | TabActionsContext 缺 focusTab+closeTab |
| D5 | P5.5 | 侧栏删会话不关标签页 | 同上——session↔tab 同步不完整 |
| E2 | P5.5 | 标签栏 [+] 菜单创建无 session 的终端标签页 | `viewPlugins` 未按 `viewRole` 过滤 |
| B4 | P5.5 | 欢迎页点终端卡片→蹦出空白标签页 | `handleShortcutClick` 不检查 `viewRole` |
| N2 | P5.5 | 图标栏点"插件市场"→只切侧栏不开标签页 | `handleIconClick` 只 dispatch openSidebarView |
| F1 | P5.5 | viewRole 未被所有消费端统一过滤 | 多个入口各自判断，无统一函数 |
| B82 | P5.5 | 删会话不关标签页/关 A 删 B | `closeTab` 用 `tab.id` 找——ID 碰撞后找错 |

**根本问题：** 三栏之间的状态链接通过多个独立变量（`activeTabId`/`activeSessionId`/`sidebarView`/`detailPluginId`/`activeGroupId`）维护——没有统一的"当前上下文"模型。每个操作路径独立维护这些变量，漏同步一个 = 一个 bug。

**Electron 时代适用性：** 100%。E3a 多 WebView 后：
- 侧栏在壳 WebView 里
- 标签栏在壳 WebView 里
- 标签页**内容**在插件 WebView 里
- session 数据在壳还是插件？——E3a 设计时必须明确

**预防规则：**

1. **每个 sidebarPrimary 插件必须实现双向同步：** 侧栏→标签页（focusTab）+ 标签页→侧栏（active 状态同步）
2. **`sourceId` 是 session↔tab 的唯一可靠链接**——不要依赖 `session.id === tab.id`
3. **所有"列出插件"的入口必须统一用 `getTabCreatableViews()`**——过滤 sidebarPrimary
4. **侧栏列表条目用 `onMouseDown` 不用 `onClick`**——对标 VS Code Explorer（B80 教训）
5. **不要用 `flushSync`**——React 官方警告在 event handler 中用可能出 bug

---

### 🔴 模式 4：React 闭包过期 + 异步时序竞态

> **贯穿 Tauri 时代的持续问题。React state 异步更新 + useCallback 闭包 + 事件回调 = stale value。**
>
> **Electron 时代风险：🔥🔥🔥🔥🔥——更高。IPC 响应延迟多了一个异步层。**

**全量 bug 清单：**

| Bug | Phase | 症状一句话 | 根因模式 |
|:--|:--|------|------|
| B11 | P2.5 | 接收区每行数据显示两次 | Tauri `listen()` Promise + StrictMode double-mount + generation counter |
| B22 | P3 | 分屏/合屏终端清屏 | 递归 flex 嵌套→React unmount/mount→CM6 销毁 |
| B33 | P4 | 跨组移动终端标签页→数据重置 | B22 同根——tab pane 嵌套在 pool 内，跨父节点 move→unmount |
| B42 | P4.2 | PluginDetailView 白屏崩溃 | hooks 放在条件 return 之后→hooks 数量变化 |
| B43 | P4.2 | 图标栏拖拽完全不可用 | `useEffect` 依赖每帧变化的 `ordered`→每帧重注册监听 |
| B49 | P5c | Ctrl+Shift+P 不工作（4 轮） | 两个 capture handler dispatch 同一 toggle 事件→toggle×2=开→关 |
| B51 | P5c | 命令面板 7 个命令全无效 | 动态 `import()` 的 `.then()` 晚于组件 mount→placeholder 覆盖真实 handler |
| B55 | P5e | F5 后终端设置回退默认值 | 两个异步写操作竞态——默认值后到达覆盖持久化值 |
| B58 | P5e | 侧栏切 HEX 后接收区仍显示文本 | `useTauriEvent` callbackRef 时序——多层 ref 间接 |
| B64 | P5f | 强调色 F5 后仍旧变蓝 | 同步 `applyAccentColor` 被异步 `applyTheme` 覆盖 |
| B73 | P5f | 终端 ErrorBoundary"模块加载失败" | 重构变量 `prefs.xxx`→`xxx`，两处漏改→ReferenceError |
| B74 | P5f | F5 后 ErrorBoundary 仍在 | Vite 热更新缓存——新增文件后模块图未更新 |
| B77 | P5h | 重装后图标 F5 跳回 | `await` 异步持久化排在 React 重渲染微任务之后 |
| B86 | P5.5 | 首次打开串口失败 | `useCallback` 闭包里 `portName` 还是 `""`→setState+invoke 同一事件循环 |
| G7 | P5.5 | Monaco Enter 键无反应 | `onKeyDown` handler 闭包捕获 mount 时的 `handleSend`（sendValue=""） |
| E4 | P5.5 | `_receiveMode` 多视图冲突 | 模块级变量——所有 TerminalView 共享，最后渲染者决定值 |
| E9 | P5.5 | `appendLine` 多余 deps | `useCallback([timestampFormat])` 但函数体内未使用——不必要的重建 |
| E10 | P5.5 | `closeWithAnimation` 多余 deps | `useCallback([tabs])` 但函数体内未使用 |
| G5 | P5.5 | render 期间修改 ref | 组件函数体中直接写 ref——Concurrent Mode 不安全 |
| G6 | P5.5 | `toLayoutData` setState hack | updater 可能异步调度→`data=undefined`→`data!` 崩溃 |

**根本问题：** React state 是异步的，但事件回调/定时器/IPC 回调需要**此时此刻**的值。闭包捕获的是**渲染时**的值，不是**调用时**的值。

**Electron 时代适用性：** 120%。IPC 多了一个异步层：
- 插件 WebView 发 IPC → 等壳响应（~1-10ms）→ 期间 React state 已变 → 回调里读到旧值
- `ipcRenderer.invoke()` 返回 Promise——和 `setState` 一样是异步的

**预防规则：**

```typescript
// ❌ 任何 DOM/IPC/定时器回调里用到 React state
useEffect(() => {
  ipc.onEvent("port-status", (status) => {
    if (status.portName !== currentPortName) { ... }  // 闭包旧值！
  });
}, []);

// ✅ 用 ref 桥接
const portNameRef = useRef(portName);
portNameRef.current = portName;
useEffect(() => {
  ipc.onEvent("port-status", (status) => {
    if (status.portName !== portNameRef.current) { ... }  // 永远最新
  });
}, []);
```

1. **任何 IPC 回调里用到 React state → 默认用 ref 桥接。** 不用犹豫
2. **setState + IPC 调用在同一个事件循环 → 先 setState 的值用 ref 传给 IPC。** 不要依赖 state 已更新
3. **useCallback deps 里只放"真正决定回调要不要重建"的东西**——其他用 ref
4. **动态 import() 不用于需要同步注册的模块**——Registry 走静态 import
5. **所有 hooks 放在组件顶层、条件 return 之前**——React Rules of Hooks 铁律

---

### 🔴 模式 5：CSS/样式——硬编码、变量未定义、跨主题不一致

> **Electron 时代风险：🔥🔥🔥——E3b 主题引擎跨进程广播是新坑。**

**全量 bug 清单：**

| Bug | Phase | 症状一句话 | 根因模式 |
|:--|:--|------|------|
| B1-B3 | P2-3 | 侧栏控件列不齐/字体叠叠乐/快捷发送换行不齐 | CSS 弹性布局无归一化约束 |
| B7-B10 | P2-5 | CM6 搜索面板 UI 与暗色主题格格不入 | 原生面板 CSS 不可定制 |
| B29 | P4 | 状态栏占屏幕 3/4 高度 | `grid-template-rows: auto 1fr auto` 无明确视口锚点 |
| B30 | P4 | 状态栏高度过高（28px vs 22px） | 不照抄 VS Code 的精确值 |
| B41 | P4.1 | 标签栏中文被切 | min-width 不够——没对标 VS Code fit(120)→shrink(80) |
| B46 | P4.2 | CSS 硬编码 hex 颜色 | 新增时图方便直接写 hex |
| B56 | P5e | Settings Editor 导航无选中指示 | CSS 变量 `--bg`/`--fg` 未在任何主题中定义→透明 |
| B71 | P5e | 窄窗口设置竖排单字符 | `overflow-wrap: break-word` 对连字符英文按字符断行 |

**Electron 时代适用性：** CSS 变量体系不变——所有旧规则继续适用。新风险：E3b 跨进程主题广播——壳切换主题后，必须推 CSS 变量到所有插件 WebView。漏一个→"黑白混合"。

---

### 🔴 模式 6：数据管道/串口——I/O 边界竞态与错误处理

> **Electron 时代风险：🔥🔥🔥🔥——Node.js serialport 替代 Rust serialport-rs，线程模型完全不同。**

**全量 bug 清单：**

| Bug | Phase | 症状一句话 | 根因模式 |
|:--|:--|------|------|
| B4-B6 | P2-5 | CM6 装饰偏移/搜索/面板交互 | CM6 API 不熟——非串口特有 |
| B24 | P3.5 | 关串口后仍有残留数据 | 前后端双层防御缺失 |
| B26 | P3.5 | 暂停消息双重显示 | 暂停逻辑 + 关闭逻辑竞态 |
| B58 | P5e | HEX 模式显示文本 | 中文值"HEX"≠代码检查 `"hex"` |
| B60 | P5e | HEX 发送模式从未生效 | 同上——值归一化问题 |
| B61 | P5e | GBK/Shift-JIS 数据乱码 | Rust 硬编码 `String::from_utf8_lossy()` |
| H1 | P5.5 | MCU 断电→软件卡死 | Rust `read_loop` 死循环抢锁 + `close_port` flush 在锁内 |
| H2 | P5.5 | 空串 ID→数据丢弃+按钮不工作 | `"" \|\| default` vs `"" ?? default`——falsy 陷阱 |
| H3 | P5.5 | 系统消息消失 | 迁移漏了 `onDidChangeConfiguration` 事件订阅 |
| E3 | P5.5 | 多 TerminalView 命令操作错窗口 | 所有 TerminalView 注册同 namespace 命令→最后覆盖 |
| E8 | P5.5 | 改接收编码无效 | `getReceiveCoding()` 仍读 ConfigurationService→C4a 迁移遗漏 |
| C2 | P5.5 | 全局串口单例 | Rust `SerialState` 单例——一次只能一个连接 |

**Electron 时代适用性：** 部分：
- H1（死循环抢锁）→ Node.js serialport 事件驱动，没有阻塞锁。**不会再现**
- B61（硬编码 UTF-8）→ Node.js `Buffer.toString('gbk')` 原生支持。**不会再现**
- E3（命令路由）→ E3a 多 WebView 后**更复杂**——每个插件 WebView 注册命令到壳
- E8（迁移遗漏）→ E1 迁移时 `invoke()`→`window.linkdesk.*` **最高风险**——50 处改动，每处都可能遗漏
- H2（falsy 陷阱）→ **永远适用**——`""`/`0`/`false` 是合法值但被当 falsy

---

### 🔴 模式 7：拖拽/分屏——DOM 定位、事件模型、React 保持存活

> **Electron 时代风险：🔥🔥——不变。逻辑完全在 React 侧。**

**全量 bug 清单：**

| Bug | Phase | 症状一句话 | 根因模式 |
|:--|:--|------|------|
| B12 | P3 | 跨标签栏移动无效 | `findOtherContainer` 回调签名与实际数据不匹配 |
| B13 | P3 | 单 tab 组分屏→空面板 | `sourceRemaining.length === 0` 未阻止分屏 |
| B14 | P3.x | 3+ 面板不渲染 | SplitPane 只展开一层 |
| B15a/b | P3.x | 毛玻璃越界/不区分中央边缘 | `elementFromPoint` 不可靠 |
| B16 | P3.x | drop zone 与 VS Code 不一致 | 自创 closest-edge 算法——应照抄 VS Code |
| B17 | P3.x | 面板内容坍缩 | child div 缺 `display:flex` |
| B21 | P3.x | 毛玻璃指示左、松手落在右 | `replaceLeafWithBranch` 丢失方向信息 |
| B22 | P3 | 分屏清屏 | 递归 flex 嵌套→unmount CM6 |
| B33 | P4 | 跨组移动→数据重置 | B22 同根——tab pane 嵌套 |
| B34 | P4 | 拖影被毛玻璃遮挡 | portal→document.body + zIndex:99999 |
| B35 | P4 | 多级分屏 resize 错位 | branchIndex 定位不精确 |
| G1 | P5.5 | 合屏标签页消失 | `reduceUnsplit` 直接 filter 掉 group→数据丢失 |
| G10 | P5.5 | 3+ 面板拖拽目标随机 | `findOtherContainer` 返回 boolean 而非 groupId |
| G11 | P5.5 | duplicateTab 跨组 ID 碰撞 | 只检查当前 group 不检查全局 |

**核心教训：**
1. **不要自创算法——照抄 VS Code。** `SPLIT_THRESHOLD=0.25` + 左右优先，几行 if-else
2. **有状态组件的 DOM 不要跨父节点移动。** 绝对定位平铺是唯一解（B22/B33 教训）
3. **React 跨父节点移动一定 unmount/remount**——portal 也救不了

---

### 🔴 模式 8：`||` vs `??`——falsy 值陷阱

> **Electron 时代风险：🔥🔥🔥🔥🔥——永远适用。IPC 返回值有更多 falsy 可能性。**

| Bug | Phase | 症状一句话 |
|:--|:--|------|
| H2 | P5.5 | `session.id=""`→所有 `if("")`=false→数据丢弃 |
| G22 | P5.5 | `parseInt("0") \|\| 1000`→0 变成 1000 |

**规则：**
- ID/名称 fallback → `||`（空串是非法 ID）
- 数值默认（含 0） → `isNaN(n) ? default : n`
- 对象/可选字段 → `??`（语义更精确）
- **Electron IPC 返回值特别注意**——`ipcRenderer.invoke()` 可能返回 `""`/`0`/`false`/`null`/`undefined`

---

### 🔴 模式 9：迁移不完整——改了 A 漏了 B

> **Electron 时代风险：🔥🔥🔥🔥🔥🔥🔥——最高。E1 是整个项目史上最大的一次迁移。**

**模式特征：** 把数据从 Store A 迁到 Store B，改了读写路径但漏了订阅路径或操作路径。

| Bug | Phase | 症状一句话 | 遗漏类型 |
|:--|:--|------|------|
| H3 | P5.5 | 系统消息消失 | 迁移删了 `onDidChangeConfiguration` 订阅——**漏了事件路径** |
| E8 | P5.5 | 改接收编码无效 | C4a 迁移 ConfigurationService→session，`App.tsx` 的 `getReceiveCoding()` 仍读旧源——**漏了操作路径** |
| F3 | P5.5 | C4a 迁移残留 | 12 项设置逐个审计，漏了 receiveCoding、receiveMode——**审计范围不完整** |
| B73 | P5f | `prefs.xxx`→`xxx` 重构，两处漏改→ReferenceError | grep 不彻底——**变量重命名残留** |

**预防规则（E1 迁移时每次 `invoke()`→`window.linkdesk.*`）：**

```
grep 三类引用：
1. 读（invoke/getConfigurationValue/getPreference）
2. 写（invoke/setConfigurationValue/savePrefs）
3. 订阅（listen/onDidChange/useTauriEvent/useEffect deps）

漏一类 = 漏 Bug。H3 就是漏了第 3 类。
```

---

### 🟡 模式 10：CSS 布局/样式——暗色主题、原生控件、字宽

> 已吸收到模式 5。Electron 时代不变。

### 🟡 模式 11：键盘/快捷键——capture handler、事件传播、WebView 吞键

> **Electron 时代风险：🔥🔥——Electron WebContentsView 的键盘事件可能和 Tauri WebView 行为不同。**

| Bug | Phase | 症状一句话 |
|:--|:--|------|
| B49 | P5c | Ctrl+Shift+P 不工作（4 轮） |
| B50 | P5c | 右键菜单项全部重复 |
| B52 | P5c | 命令面板切窗口不消失 |
| B53 | P5c | 齿轮菜单 Escape 后 focus ring |
| B54 | P5c | 命令面板从非终端标签页打不开 |

**预防：**
- 全局快捷键放 App.tsx 顶层 capture handler
- 用 `e.code` 不用 `e.key`——WebView 下 `e.key` 不可靠
- 每个 capture handler matched 时必须 `stopImmediatePropagation()`

---

## 四、Electron 全新风险——Tauri 时代不存在的 bug 类别

### 4.1 IPC 可靠性（🔥🔥🔥🔥🔥）

Tauri `invoke()` 是单进程调用。Electron `ipcRenderer.invoke()` 走 `contextBridge`→主进程→返回。

- 主进程忙→invoke 排队
- WebContentsView 销毁→Promise 永远不 resolve
- 两个 invoke 并发→响应顺序≠请求顺序

**预防：** 每个 invoke 加超时。IpcBridge 请求队列串行化（E3a #27）。

### 4.2 WebContentsView 生命周期（🔥🔥🔥🔥）

创建异步、销毁异步。WebView 崩溃时壳必须能检测。

**状态机：** `creating → loading → ready → destroying → crashed`

### 4.3 preload 时序（🔥🔥🔥）

`preload.ts` 在 React mount 之前运行。出错→`window.linkdesk` undefined→所有调用报错。这个错误不进 ErrorBoundary。

### 4.4 跨进程数据同步（🔥🔥🔥🔥 E3b/E3c）

主题切换→广播到所有 WebView。新 WebView 创建后需主动查询当前主题。

### 4.5 localStorage 隔离（🔥🔥🔥🔥）

多 WebView = 多个独立 localStorage。插件数据不能存插件自己的 localStorage——卸载=清空。

**规则：** 壳级数据→壳 FileService。插件数据→`.linkdesk/plugins/<id>/`。

### 4.6 Electron 打包（🔥🔥）

原生模块（serialport, i2c-bus）需针对 Electron 的 Node 版本重新编译。

---

## 五、最危险的迁移步骤

| 步骤 | 风险 | 为什么 |
|:--|:--:|------|
| **E1 步 4：接前端 API** | 🔥🔥🔥🔥🔥 | ~50 处 `invoke()`→`window.linkdesk.*`。整个迁移中 bug 密度最高的步骤 |
| **E3a 步 30：terminal 迁移到独立 WebView** | 🔥🔥🔥🔥🔥 | 最复杂的插件——串口/session/多标签页/侧栏联动。C1-E5 所有教训要重新验证 |
| **E3 步 E3b/E3c：主题/语言跨进程** | 🔥🔥🔥🔥 | 看似简单，实则最多边界——WebView 正在加载时收不到广播 |

---

## 六、给 AI 的预防清单

### 写任何代码前

- [ ] 这个逻辑在 Tauri 时代出过 bug 吗？→ grep 本文档的对应模式
- [ ] 涉及多个模块/进程吗？→ **接缝处是 bug 高发区**（H1-H3 教训）
- [ ] 用了模块级变量？→ 多实例时会串扰吗？
- [ ] 有异步操作？→ 失败时前端状态会撕裂吗？

### 涉及 IPC/事件回调

- [ ] 回调里用了 React state？→ **用 ref 桥接**（G7/B86 教训）
- [ ] 这个 IPC 可能永远不返回吗？→ 加 timeout
- [ ] 需要支持多播吗？→ 不能单回调覆盖（E3 教训）

### 修改插件生命周期

- [ ] 新增 registerXxx？→ **立即写 unregisterXxx + onWillUninstall 接线**
- [ ] 改了卸载逻辑？→ 所有入口统一走 `performUninstall()`
- [ ] 事件触发在文件操作之后？→ 消费者需要读到新状态

### 持久化

- [ ] 数据归属：壳还是插件？→ 存在正确的地方
- [ ] 恢复后计数器同步了？→ 扫描已用 ID，max+1 重置计数器
- [ ] 多 WebView 后：插件数据不能存在插件 localStorage

### 迁移（每次改底层调用）

- [ ] grep 了三类引用？→ 读（get*）、写（set*）、订阅（onDid*/listen*）
- [ ] 改了变量名？→ grep 旧名字确认零残留

### 提交前

```bash
npx tsc --noEmit
npx vitest run
git diff --stat
grep -r "||" src/ | grep -v "|| {"  # 审查 || 用于默认值
grep -r "ipcRenderer.on\|ipcRenderer.invoke" src/  # 每个有错误处理？
grep -r "localStorage" src/  # 确认存储位置正确
```

---

## 七、最后的话

> Encaron 在这个项目上投入了数百小时。437 个 commit，100+ 个已修复 bug，每一个都是实打实的用户伤害。Tauri 时代从零建起了完整的通用容器基础设施。
>
> 迁移到 Electron 不是重写——是**换地基**。React 代码不变，CSS 变量不变，i18n 不变，Registry 体系不变，标签页/分屏系统不变。**变的只是底层：`invoke()` → `window.linkdesk.*`，`listen()` → `ipcRenderer.on()`，Rust → Node.js。**
>
> 但正因为在换地基，每写一行新代码都有两个风险：
> 1. 旧代码里已经修过的 bug 模式，在新代码里以新面目重现（§三 10 个模式）
> 2. 新地基自身的特性产生全新 bug（§四 6 个新风险类别）
>
> **小补快走。每批 ~150 行。交一个验一个。** Encaron 不需要完美的架构文档——他需要一个能跑、不崩、操作不出 bug 的软件。
>
> 以上。

---

> **关联阅读：**
> - `../01-Tauri_P1至P5.5/P6-交互对标/P6-Bug修复完整记录.md` — Phase 5.5 48 个 bug 完整记录
> - `../../CLAUDE.md` — 硬约束 + 反模式
> - `memory: v3-pitfalls` — B1-B86 全踩坑记录（最详细）
> - `memory: uninstall-bug-recurring` — 卸载 bug 9 轮史
> - `memory: seam-bugs-are-real-bugs` — 接缝处是 bug 高发区
> - `memory: react-stale-closure-setstate-invoke` — B86 教训
> - `memory: quality-commandments` — Encaron 的终极质量要求
> - `memory: sidebar-tab-bidirectional-sync` — 侧栏↔标签页双向同步规则
> - `memory: nullish-vs-falsy-boundary` — `||` vs `??`
> - `E1_Electron迁移_暂定/06-实施顺序.md` — 执行分层与纪律
> - `E3_多WebView与壳收尾_暂定/01-E3a-多WebView进程隔离.md` — IPC 协议与 WebView 管理
