# Phase 5.5c Bug 多维分类

> 2026-07-22。同一批 bug，五种切法。每种切法回答不同的问题。
> 
> | 切法 | 回答的问题 |
> |:--|------|
> | 一、按代码位置 | **在哪改？** |
> | 二、按根因类型 | **为什么有这个 bug？从源头防重复？** |
> | 三、按用户感知 | **用户看到什么现象？** |
> | 四、按修复模式 | **怎么修？需要什么级别的改动？** |
> | 五、按 VS Code 对标 | **VS Code 怎么做的？我们是照抄还是自己特有的？** |

---

## 一、按代码位置——"在哪改"

> 回答：改终端插件还是改核心？改了会影响其他插件吗？

### A. 终端插件内部（`plugins/terminal/`）

| Bug | 改什么 |
|:--|------|
| C1 | `index.tsx` — TerminalView 用 `sourceId` 找 session，不读全局 `activeSession` |
| A1 | `useTerminalSessions.ts` — 删 `_migratedQuickSends` 迁移逻辑 |
| A3+B1+G23 | `ControlPanel.tsx` — 打开端口时自动填充 `session.port` |
| A4 | `sidebar.tsx` — `handleSelectSession` 改用 `openOrFocusTab` |
| E3+E4 | `index.tsx` — 命令按 activeSessionId 路由；`_receiveMode` 从 session 读 |
| E5+N3 | `index.tsx` + `useTerminalSessions.ts` — TerminalView unmount 关串口；生命周期清 session |
| G7 | `index.tsx` — `handleSend` 用 ref 桥接，Monaco Enter 不调过期闭包 |
| E8 | `ControlPanel.tsx` + `SerialContext.tsx` — 编码参数从 session 传入 `toggleOpen` |

**特点：** 改这些不影响其他插件。改了之后终端自己更干净。

### B. 核心基础设施（`src/`）

| Bug | 改什么 |
|:--|------|
| F1 (B4+E2+N2) | `viewRegistry.ts` 新增 `getTabCreatableViews()` — 统一过滤 `sidebarPrimary` 插件 |
| E1 | `TabBar.tsx` + `App.tsx` — 所有关闭路径读 `confirmOnClose` |
| G1 | `useTabManager.ts` — `reduceUnsplit` 合屏前把标签页移到存活面板 |
| G3 | `tabIdentity.ts` — 恢复布局后扫描已有 ID，同步计数器 |
| G10 | `TabBar.tsx` — `findOtherContainer` 返回目标 groupId |
| G12 | `useTabManager.ts` — `duplicateTab` ID 碰撞检查扩展到全局 |
| G16 | `loader.ts` — 文件监控双向检测（新增 + 删除） |
| G4 | `App.tsx` — 串口统计 listener 改用 `useTauriEvent` |
| G5 | `useTabManager.ts` — ref 写入移到 `useEffect` |
| G6 | `useTabManager.ts` — `toLayoutData` 从 ref 读而非 setState hack |

**特点：** 改这些所有插件受益——工作台、地图、数据库浏览器都能用 `confirmOnClose`、`getTabCreatableViews` 等。

### C. 终端↔核心接口（需要两边配合）

| Bug | 终端侧 | 核心侧 |
|:--|------|------|
| A2+N1 | `sidebar.tsx` — 改名时调 `updateTabLabel` | `TabActionsContext.ts` — 新增 `updateTabLabel` API |
| B3 | `index.tsx` — mount 时检查 session 是否存在，不存在就创建 | 无需改动（核心只恢复标签页，插件自恢复数据） |
| E2（PlusMenu） | 无 | `TabBar.tsx` — PlusMenu 用 `getTabCreatableViews` 过滤 |
| E8 | `ControlPanel.tsx` — 传入 encoding | `SerialContext.tsx` — `toggleOpen` 接收 encoding 参数；`App.tsx` — 用参数而非 ConfigurationService |
| F2 | 无 | 全局 grep 审计 `tabBehavior`/`iconLocation`/`statusBar` 等声明字段的消费端 |
| F3 | `useTerminalSessions.ts` — 删 `getConfigurationValue` 桥接 | `App.tsx` — 删 `getReceiveCoding()` |

**特点：** 核心提供通用基础设施，终端使用它。核心不检测终端 pluginId。

---

## 二、按根因类型——"为什么有这个 bug"

> 回答：不是"怎么修"，而是"为什么会发生"。从源头分类，防止同类 bug 再次出现。

### A. 架构缺陷——设计时就没考虑多标签页

| Bug | 根因 |
|:--|------|
| **C1** | TerminalView 写成单例模式（全局 `activeSession`），5.5c 启用多标签页后矛盾暴露 |
| **E3** | 命令注册用固定 namespace `"terminal"`，多个 TerminalView 共享——最后一个覆盖前面的 |
| **E4** | `_receiveMode` 是模块变量——所有 TerminalView 共用一个"黑板" |
| **A5** | `handleFocusTab` 只切换标签页系统状态，不通知 session 系统 |
| **B2** | 侧栏 `handleSelectSession` 设了 `_activeSessionId` 但所有 TerminalView 读同一个全局值 |

**共同特征：** 代码在单标签页时代"逻辑没问题"，多标签页时代"架构不支持"。**这类 bug 只有在多标签页场景下才暴露。**

**预防：** 任何模块级可变状态（`let _xxx`、模块级 `Map`、全局单例）→ 立刻问"两个标签页时对吗？"

---

### B. 写了没接线——plugin.json 声明了但代码没读

| Bug | 声明了什么 | 谁没读 |
|:--|------|------|
| **E1** | `"confirmOnClose": "关闭此标签页将断开串口连接"` | TabBar ✕ / 中键 / Ctrl+W 三处都没读 |
| **F2 (全类)** | `iconLocation` / `keepSidebarOnFocus` / `statusBar` | 需逐个审计——不确定是否有遗漏 |
| **G17** | 无（反过来——`isSidebarPrimaryView` 函数定义了但没人调用） | 死代码 |

**共同特征：** 两个人分别做了两半工作——一个人写了声明，一个人写了框架，但没对接。

**预防：** plugin.json 每加一个新字段 → grep 确认全代码库至少有一个消费端。

---

### C. 接了但逻辑错——代码执行了但结果不对

| Bug | 逻辑错在哪 |
|:--|------|
| **G1** | `reduceUnsplit` 直接 `filter` 掉 group——标签页应该合并，不应该销毁 |
| **G2** | `reduceForceCloseTab` 浅拷贝但没清 dirty 标记——`reduceCloseTab` 仍然读到 `dirty=true` |
| **G7** | Monaco `onKeyDown` handler 捕获了 mount 时的 `handleSend` 闭包——后续 `handleSend` 变了但 handler 不更新 |
| **G10** | `findOtherContainer` 只返回 boolean 不返回具体是哪个面板——多面板时 fallback 选错 |
| **G12** | `duplicateTab` ID 碰撞检查只查当前 group——跨 group 可能重名 |
| **G22** | `parseInt("0") \|\| 1000`——`0` 是 falsy，被当作"没填" |

**共同特征：** 逻辑写出来了，但在边界条件下结果错误。

**预防：** 每个条件判断 → 自问"空值/0/负数/多实例时对吗？"

---

### D. 迁移不完整——改了一个系统漏了另一个

| Bug | 迁移了什么 | 漏了什么 |
|:--|------|------|
| **E8** | C4a 把 12 项终端设置从 ConfigurationService 迁到 per-session | App.tsx 打开串口的编码参数仍从 ConfigurationService 读——那个已没值 |
| **A1** | C4a 把 `quickSends` 迁到 session | 留了 `_migratedQuickSends` 模块变量做一次性迁移——新会话都继承旧数据 |
| **H3** ✅ | C4a 迁移设置读写路径 | 漏了 `onDidChangeConfiguration` 事件订阅——设置变更不打印系统消息 |
| **F3 (全类)** | C4a 迁移了 12 项设置 | 存留残留：`getReceiveCoding()` 函数 + `getConfigurationValue` 桥接 |

**共同特征：** 一个数据源拆成两个 → grep 了一个数据源的引用漏了另一个。

**预防（来自 [[seam-bugs-are-real-bugs]]）：** 迁移时审计三类引用——**读（get*）、写（set*）、订阅（onDid*/listen*）**。漏一类 = 漏 Bug。

---

### E. 碰巧工作——现在没炸但基础不牢

| Bug | 为什么碰巧能工作 | 什么时候会炸 |
|:--|------|------|
| **G3** | 计数器从 0 开始，F5 前标签页 ID 也是从 0 开始——碰巧不碰撞 | F5 前有 terminal-1 ~ terminal-5，F5 后新建 → ID 碰撞 |
| **G9** ✅ | StatusBar 不订阅插件事件，但父组件重渲染时它跟着重渲染了 | React.memo 优化父组件 → StatusBar 不更新 |
| **G4** | `listen()` 异步 + StrictMode double-mount → 只有第二次 mount 的 listener 存活（第一个泄漏了但不影响功能） | 累积泄漏多了 → 内存增长；HMR 热重载多次 → RX/TX 计数异常 |
| **G5** | render 期间改 ref 在当前 React 版本下没问题 | React Concurrent Mode → render 被丢弃重放 → ref 状态错 |
| **G6** | `setState(prev => { data = prev; return prev })` 在当前同步渲染下能读到值 | Concurrent Mode 异步调度 → `data` 仍为 undefined → 崩溃 |
| **G20** | `"\\"` 硬编码反斜杠——Windows 恰好用反斜杠 | Mac/Linux 上 `lastIndexOf("\\")` 返回 -1 |

**共同特征：** 代码"能跑"，但依赖了当前环境的某个特性（同步渲染、Windows 路径、父组件行为）。

**预防：** 代码审查时看到"依赖隐式假设"的代码 → 标注"碰巧工作"。

---

### F. 防御缺失——正常流程没事，极端情况静默失败

| Bug | 什么极端情况 | 后果 |
|:--|------|------|
| **E6** | `tabActions` 为 null（理论上不可能） | 点新建无反应，无任何提示 |
| **E7** | `activeSessionId` 为 null 时保存快捷发送 | 静默跳过，无提示 |
| **G15** | Toast 撤销 → `import("./loader")` 失败 | 静默失败，用户不知道撤销是否成功 |
| **G8** | Rust `invoke("uninstall_plugin")` 抛异常 | 前端已清理但后端未清理 → 撕裂状态 |
| **G16** | 手动删插件目录 | 插件在前端仍存活，直到 F5 |
| **G13** | `loadPluginRuntime` 不处理 `mode`/`resources` | plugin:// 协议安装的插件行为不一致 |

**共同特征：** 正常操作路径下百年不遇，但一旦触发用户完全不知道发生了什么。

**预防：** 每个 `if` 的 `else` 分支 → 要么处理，要么 `console.warn` + toast。

---

### G. 归一化违规——同一逻辑在多处实现

| Bug | 重复了什么 |
|:--|------|
| **G19** | `formatTimestamp` 在 `useSendData.ts` 和 `index.tsx` 各有一份完全相同的实现 |
| **G18** | `CoreEvents` 5 个 Emitter + `CUSTOM_EVENTS`（window.dispatchEvent）——两套事件系统并存 |
| **B4+E2+N2** | viewRole 过滤逻辑在 WelcomeView/TabBar/App.tsx 三处各自实现（或没实现） |

**共同特征：** 同一个概念（时间戳格式化/事件/视图列表过滤）有多个副本或多套机制。

**预防：** 写新功能前 → grep 关键词 → 确认没有已有的实现可以复用。

---

## 三、按用户感知——"用户看到什么"

> 回答：从用户的第一人称视角分类。

### A. "我点了，没反应"

| Bug | 用户做了什么 | 发生了什么 |
|:--|------|------|
| A4 | 侧栏点会话 | 标签页不重开 |
| A5 | 点标签栏标签页 | 主区内容不切换 |
| B2 | 侧栏点会话 | 主区内容不切换 |
| E2 | 标签栏 [+] 点终端 | 创建空白标签页（不是"没反应"而是"错了"） |
| E6 | 侧栏点 + 新建 | 静默失败（极端情况） |
| G7 | Monaco 按 Enter | 不发送 |

### B. "显示的东西不对"

| Bug | 用户看到了什么 | 应该看到什么 |
|:--|------|------|
| B1 | 侧栏"未配置"，按钮不变色 | 端口信息和绿色按钮 |
| A2/N1 | 侧栏改名后标签栏标题不变 | 标签栏标题跟着改 |
| G9 | 装/卸载插件后状态栏不变 | 状态栏实时更新 |
| G14 | 卸载插件后详情页仍显示"已安装" | 显示"未安装" |
| B3 | F5 后标签页显示"会话已失效" | 标签页正常可用 |
| G12 | 非法版本号被显示/比较 | 被拒绝或警告 |

### C. "数据串了/丢了"

| Bug | 用户感知 |
|:--|------|
| A1 | 新会话出现旧会话的快捷发送 |
| A3 | 两个会话的 COM 口同步变化 |
| N4 | 插入新设备→两个会话都强制切换端口 |
| E4 | B 改成 HEX → A 也显示 HEX |
| G1 | 分屏合屏→标签页消失 |
| G21 | 暂停→继续→少了一帧数据 |
| E8 | 改 GB2312 编码→仍以 UTF-8 解码 |

### D. "关了还在跑"

| Bug | 用户感知 |
|:--|------|
| E1 | ✕ 关标签页→没确认→直接关了 |
| N3 | ✕ 关标签页→串口还在后台收发 |
| E5 | 卸载终端插件→串口还在连 |
| G2 | Ctrl+W 关 dirty 标签页→确认了但关不掉 |

### E. "操作结果不对"

| Bug | 用户感知 |
|:--|------|
| E3 | Ctrl+Shift+P 复制→复制了隔壁标签页的内容 |
| G10 | 拖标签页到右边面板→出现在左边 |
| G22 | 输入 0→变成 1000 |
| G23 | 没选 COM 口点打开→行为不确定 |

### F. "感知不到"（代码层面）

| Bug | 为什么感知不到 |
|:--|------|
| E6/E7/E9/E10 | 防御性缺失 / 多余依赖——不影响功能 |
| G4/G5/G6 | Concurrent Mode / StrictMode——当前 React 版本不触发 |
| G8/G13/G15/G16 | 需要特殊条件（权限不足 / Phase 7 / 网络断开） |
| G17/G18/G19/G20 | 死代码 / 归一化 / 跨平台——当前环境不触发 |
| G12 (semver) | 非法版本号显示为字面量——用户可能不觉得是 bug |

---

## 四、按修复模式——"怎么修"

> 回答：修这个 bug 需要什么级别的改动？是删代码、改一行、还是重构架构？

### A. 纯删除（只减不增，零风险）

| Bug | 删什么 |
|:--|------|
| A1 | `_migratedQuickSends` + `getDefaultQuickSends()` 函数 |
| F3（部分） | `App.tsx` 的 `getReceiveCoding()` 函数 + `useTerminalSessions.ts` 的 `getConfigurationValue` 桥接 |
| G17 | `isSidebarPrimaryView` 死代码 |
| G19 | 提取 `formatTimestamp` 到公共模块后，删两处重复 |

**特点：** 不会引入新 bug——删的是已经没人用或不该用的代码。

### B. 局部逻辑修正（改一行或几行）

| Bug | 改什么 |
|:--|------|
| G7 | `handleEditorMount` 内 `handleSend` → `handleSendRef.current()` |
| G22 | `parseInt(v) \|\| 1000` → `isNaN(v) ? 1000 : v` |
| G23 | 加 `if (!session.port) { return }` guard |
| E7 | `activeSessionId` null 时 toast 错误 |
| A3+B1 | `handleToggleOpen` 中一行 `updateSession(id, { port: state.portName })` |
| G10 | `findOtherContainer` 返回 `string \| null` 而非 `boolean` |
| G12 | `duplicateTab` 碰撞检查从 `group.tabs.some` → `allTabs.has` |
| G20 | `lastIndexOf("\\\\")` → `dirname()` |

**特点：** 改动范围明确——就事论事修一个逻辑错误。

### C. 接线（把声明和代码连起来）

| Bug | 接什么 |
|:--|------|
| E1 | `getTabBehavior(tab).confirmOnClose` → TabBar 关闭路径 + Ctrl+W |
| F2 | grep 审计 `tabBehavior`/`iconLocation`/`keepSidebarOnFocus`/`statusBar` → 缺消费端则补 |
| E5 | `onWillUninstall` → `resetAllSessions()` + `invoke("close_port")` |
| G9 | StatusBar 订阅 `onPluginLifecycleChange`（如确认未订阅） |
| G14 | PluginDetailView 订阅 `onDidUnregister` |

**特点：** 设计意图早已存在（plugin.json 声明 / 设计文档），只是电线没接上。

### D. 重构（改架构模式）

| Bug | 重构什么 |
|:--|------|
| **C1** | TerminalView 单例模式 → per-tab 绑定模式（`sourceId` → `useSession(sourceId)`） |
| **E4** | `_receiveMode` 模块变量 → 从 session 读取 |
| **E3** | 命令 handler 闭包捕获 cmView → `Map<sessionId, EditorView>` 路由 |
| **F1** | 三处各自过滤 viewRole → 统一 `getTabCreatableViews()` |
| **G6** | `toLayoutData` setState hack → ref |
| **G5** | render 期间写 ref → `useEffect` 写 |

**特点：** 不是"改一行"，是"改一个模式"。影响面大但结构更清晰。

### E. 新增 API（核心加通用能力）

| Bug | 新增什么 API |
|:--|------|
| A2+N1 | `tabActions.updateTabLabel(tabId, label)` — 通用标签页改名 |
| A4 | 已有 `openOrFocusTab` — 只需改用 |
| B3 | 无需新 API — 插件自恢复模式 |
| G18 | Phase 6 决定：统一到 `CoreEvents` 或 `CUSTOM_EVENTS` |

**特点：** 给核心加了能力——以后所有插件都能用。但必须确保 API 不绑定任何特定插件 ID。

---

## 五、按 VS Code 对标——"VS Code 怎么做"

> 回答：这个 bug 对应的 VS Code 行为是什么？我们是照抄还是自己特有的？

### A. VS Code 已有此模式——照抄

| Bug | VS Code 怎么做的 | LinkDesk 翻译 |
|:--|------|------|
| **C1** | `ITerminalInstance` ↔ `TerminalEditorInput` ↔ Editor Tab 三层绑定 | `Session` ↔ `sourceId`(tab.id) ↔ TerminalView |
| **A4** | Explorer 点文件 → reopen 编辑器（`openEditor`） | `openOrFocusTab` |
| **E1** | `workbench.editor.closeWithConfirmation` + `ConfirmOnKill` | `confirmOnClose` 声明 → TabBar 消费 |
| **F1** | Explorer（sidebarPrimary）不出现在"打开编辑器"命令中 | `getTabCreatableViews` 过滤 `sidebarPrimary` |
| **B4/E2** | 同上 | 同上 |
| **G1** | 关闭编辑器组→编辑器合并到相邻组（`mergeAllGroups`） | `reduceUnsplit` 移 tabs 到存活 group |
| **E3** | `ITerminalService.activeInstance` → 命令发给活跃终端 | `activeSessionId` → `Map<sessionId, EditorView>` |

**特点：** 不需要发明——VS Code 已经验证了。直接翻译成 LinkDesk 的架构语言。

### B. LinkDesk 特有（串口硬件相关）

| Bug | 为什么 VS Code 没有 |
|:--|------|
| **A3+B1** | VS Code 终端连 Shell 进程，没有"选 COM 口"这回事 |
| **E8** | VS Code 终端编码由 Shell 决定，不经过配置系统 |
| **N3/N4** | 同上——硬件热插拔是串口场景特有 |
| **G21** | 串口流式数据缓冲——VS Code 终端是 Shell 进程，不经过 rAF drain 循环 |
| **A1** | 快捷发送是串口场景特有功能 |
| **E5** | 插件卸载关硬件资源——VS Code 扩展卸载不需要关物理设备 |

**特点：** 这部分不能照抄 VS Code——需要自己判断。但设计原则仍然对标 VS Code（如：关闭即断开、资源随生命周期清理）。

### C. Phase 延期的（等后续 Phase 自然解决）

| Bug | 为什么延期 |
|:--|------|
| **B3** | VS Code 有 `terminal.integrated.persistentSession`——LinkDesk Phase 6 SessionService 上线后天然恢复 |
| **G2** | VS Code 有 `EditorInput.isDirty()`——LinkDesk Phase 6 文件编辑器引入 dirty flag |
| **A6** | VS Code 终端的 shell type 是 per-instance 的——LinkDesk Phase 7 多协议后自然修复 |
| **C2** | VS Code 可以同时开多个终端连不同远程——LinkDesk Phase 7 端口池重构 |
| **G13** | VS Code 的 `loadPluginRuntime` 等价——LinkDesk Phase 7 plugin:// 协议启用后对齐 |

**特点：** 现在修是"临时方案"，后续 Phase 会被正式方案替换。但现在不修用户没法用→需要 stopgap（临时桥接）。

---

## 分类方法之间的关系

同一 bug 在不同切法下的位置：

| Bug | 代码位置 | 根因 | 用户感知 | 修复模式 | VS Code 对标 |
|:--|:--:|:--:|:--:|:--:|:--:|
| **C1** | A 终端内部 | A 架构缺陷 | A 点了没反应 | D 重构 | A 照抄 |
| **A1** | A 终端内部 | D 迁移不完整 | C 数据串了 | A 纯删除 | B 特有 |
| **A2/N1** | C 接口层 | A 架构缺陷 | B 显示不对 | E 新增 API | A 照抄 |
| **A3+B1** | A 终端内部 | A 架构缺陷 | B 显示不对 | B 局部修正 | B 特有 |
| **A4** | A 终端内部 | A 架构缺陷 | A 点了没反应 | B 局部修正 | A 照抄 |
| **A5** | A 终端内部 | A 架构缺陷 | A 点了没反应 | — C1 附带 | A 照抄 |
| **B2** | A 终端内部 | A 架构缺陷 | A 点了没反应 | — C1 附带 | A 照抄 |
| **B3** | C 接口层 | A 架构缺陷 | B 显示不对 | D 重构 | C 延期 |
| **B4** | B 核心 | G 归一化 | B 显示不对 | C 接线 | A 照抄 |
| **E1** | B 核心 | B 写了没接线 | D 关了还在跑 | C 接线 | A 照抄 |
| **E2** | B 核心 | G 归一化 | A 点了没反应 | C 接线 | A 照抄 |
| **E3** | A 终端内部 | A 架构缺陷 | E 操作不对 | D 重构 | A 照抄 |
| **E4** | A 终端内部 | A 架构缺陷 | C 数据串了 | D 重构 | B 特有 |
| **E5** | A 终端内部 | B 写了没接线 | D 关了还在跑 | C 接线 | B 特有 |
| **E8** | C 接口层 | D 迁移不完整 | C 数据串了 | B 局部修正 | B 特有 |
| **N3** | A 终端内部 | B 写了没接线 | D 关了还在跑 | C 接线 | B 特有 |
| **N4** | A 终端内部 | A 架构缺陷 | C 数据串了 | B 局部修正 | B 特有 |
| **G1** | B 核心 | C 逻辑错 | C 数据丢了 | B 局部修正 | A 照抄 |
| **G3** | B 核心 | E 碰巧工作 | B 显示不对 | B 局部修正 | A 照抄 |
| **G7** | A 终端内部 | C 逻辑错 | A 点了没反应 | B 局部修正 | B 特有 |
| **G9** | B 核心 | E 碰巧工作 | B 显示不对 | C 接线 | A 照抄 |
| **G10** | B 核心 | C 逻辑错 | E 操作不对 | B 局部修正 | A 照抄 |
| **G21** | A 终端内部 | C 逻辑错 | C 数据丢了 | B 局部修正 | B 特有 |
| **G22** | A 终端内部 | C 逻辑错 | E 操作不对 | B 局部修正 | B 特有 |
| **G14** | B 核心 | B 写了没接线 | B 显示不对 | C 接线 | A 照抄 |

---

## 从分类中看到的规律

### 1. 架构缺陷集中在终端插件内部

A 类根因（架构缺陷）的 bug —— C1, A5, B2, E3, E4, A3+B1, N4 —— 全部是终端插件代码。核心的标签页系统本身是正确的——它支持多标签页，只是终端插件没利用好。

**结论：修终端，不动核心架构。**

### 2. "写了没接线"集中在核心基础设施

B 类根因（写了没接线）的 bug —— E1, E5, G14, F2 —— 主要是核心提供了框架（plugin.json 声明 / 生命周期事件）但没接入实际的 UI 行为。

**结论：给核心补电线，所有插件受益。**

### 3. "碰巧工作"有系统性——核心的 React 模式需要加固

G4/G5/G6 都是核心 React 代码不规范——不正确的 `listen()` 用法、render 期间副作用、setState hack。这些在 StrictMode/Concurrent Mode 下会炸。

**结论：核心 React 规范化——用 `useTauriEvent`/`useRef`/`useEffect` 正确模式。**

### 4. 终端特有的都是硬件交互

A3+B1, E8, N3, N4, E5, G21 都是串口硬件相关。VS Code 没有这些所以不能照抄。

**结论：硬件交互部分自己设计，但设计原则对标 VS Code（资源随生命周期、关闭即断开）。**

### 5. 归一化违规是最容易预防的

G17/G18/G19/F1 都是"已经有了但没用/写了多份"。预防成本极低——grep 关键词就能发现。

**结论：写新代码前先 grep。AI 审计时这是第一道检查。**
