# Phase 5.5c 修 Bug 方案审计——原则合规性分析

> 2026-07-22。在动手写任何一行代码之前，逐条对照六大原则审计 17 步执行计划。
> 每步回答四个问题：会不会引入新 bug？会不会写硬编码？符合归一化吗？影响未来插件吗？

---

## 审计总论

**17 步中：14 步干净，2 步需要设计调整，1 步需要确认。**

最危险的倾向已经在设计中避免了——"在核心代码里检测 terminal 标签页"这种硬编码没有出现在修法中。但仍有两个设计决策需要特别注意。

---

## 逐步骤审计

### 步 1：C1 — per-tab session 绑定 🔥

**做什么：** TerminalView 不再读全局 `activeSession`，改为用 MainContent 传来的 `sourceId`（即 tab.id）查自己对应的 session。

**合规性：**

| 原则 | 评分 | 分析 |
|:--|:--:|------|
| 精益求精 | ✅ | 这是"正确的架构"——标签页系统传 `sourceId` 给插件视图，插件用 `sourceId` 绑定自己的数据。之前不用 `sourceId` 才是 bug |
| 归一化 | ✅ | 所有 TerminalView 通过同一个 `useSession(id)` hook 获取自己的数据——一个入口，不是散落各处的 `_activeSessionId` 读 |
| AI 友好 | ✅ | `useSession(sourceId)` 是清晰模式："每个插件视图绑定自己的数据源"。新 AI 看到这个模式就知道怎么接 |
| 插件自由 | ✅ | 未来任何插件视图都可以用同样模式——`useMyPluginData(sourceId)`。不依赖全局状态 |
| VS Code 化 | ✅ | 对标 VS Code：每个编辑器实例有自己的 `IEditorInput`，不是全局 active editor |
| 易操作 | ✅ | 多标签页时点哪个显示哪个——用户的本能预期 |

**会不会引入新 bug？** 
- 🔶 需要防御：`getSessionById(sourceId)` 可能返回 null（旧标签页、布局恢复的僵尸标签页）。TerminalView 必须处理"没有对应 session"的情况 → 显示"会话已失效"占位 + 提供"新建会话"按钮。这个防御逻辑本身就是步 3（B3）需要的。
- 🔶 `sourceId` 和 `session.id` 的一致性——H2 修了空串问题，但如果还有旧数据残留（eg 5.5c 之前创建的 session），id 可能不匹配。需要在 `createSession` 中加一条 assert/log。

**会不会写硬编码？** ❌ 不涉及。TerminalView 是终端插件内部代码，读自己的 session 数据是天经地义的。

**对未来插件影响：** ✅ 正面——建立了"插件视图通过 sourceId 绑定数据"的标准模式。

---

### 步 2：A5+B2 — 验证 C1 修复

**做什么：** 步 1 修完后，这两个 bug 自动消失。只是验证，不写新代码。

**合规性：** 无新代码，无风险。

---

### 步 3：E8 — receiveCoding 断引用

**做什么：** 打开串口时，编码参数从 session 读取，不再从 ConfigurationService 读（那个已经没值了）。

**数据流：** `session.receiveCoding → ControlPanel → SerialContext.toggleOpen(encoding) → App.tsx → Rust open_port`

**合规性：**

| 原则 | 评分 | 分析 |
|:--|:--:|------|
| 精益求精 | ✅ | 删除了一个"读僵尸数据源"的 bug——`getConfigurationValue("terminal.receiveCoding")` 读的是已被清空的值 |
| 归一化 | ✅ | 编码设置只有一个来源：session。之前是两个来源（session 存、ConfigurationService 读）互相矛盾 |
| AI 友好 | ✅ | 数据流是线性单向的：session → ControlPanel → Context → Rust。不跳跃 |
| 插件自由 | ✅ | 未来如果有"协议分析仪"插件打开串口，同样走"自己的数据 → Context → Rust"路径 |
| VS Code 化 | ✅ | 对标 VS Code：终端配置从 `ITerminalInstance` 读，不跨过实例去读全局设置 |
| 易操作 | ✅ | 用户改编码 → 生效。不会出现"改了 GB2312 但还是 UTF-8" |

**会不会引入新 bug？** 
- 🔶 `SerialContext.toggleOpen` 当前签名不接受参数。改签名 → 所有调用点都要更新。需要 grep 全量调用点。
- ✅ 改动量小（~10 行），调用点只有 ControlPanel 一处。

**会不会写硬编码？** ❌ 不涉及。当前 App.tsx 里有 `"terminal.receiveCoding"` 这个硬编码字符串——修法**删除**它。

**对未来插件影响：** ✅ 正面——编码变成参数而非 ConfigurationService key，未来协议插件可以直接传参。

---

### 步 4：B3 — F5 session 恢复 ⚠️ 需要设计调整

**原始修法：** "恢复布局时检测 terminal 标签页 → 为每个 terminal tab 自动 createSession"

**🔴 问题：** 在 App.tsx 或 useTabManager 中检测 `tab.type === "terminal"` → **这是插件 ID 硬编码！违反核心无知原则！**

**修正方案（反转责任）：**

```
不在核心检测 terminal → 改为 TerminalView 自己负责恢复
```

具体做法：
1. 核心（App.tsx / LayoutService）保持现状——F5 后恢复所有标签页，不关心插件类型
2. TerminalView mount 时：检查 `getSessionById(sourceId)` → null？→ 自动调用 `createSession(tab.label, sourceId)` 创建新 session → 标签页不再是僵尸
3. 这个逻辑在 `plugins/terminal/index.tsx` 内部——核心完全不知道

**修正后的合规性：**

| 原则 | 评分 | 分析 |
|:--|:--:|------|
| 精益求精 | ✅ | 谁的数据谁负责恢复——终端插件恢复自己的 session，核心只恢复标签页 |
| 归一化 | ✅ | 所有"数据恢复"逻辑在各自插件里，不集中在核心 |
| AI 友好 | ✅ | 清晰模式：插件 mount → 数据不存在 → 自己建。新 AI 写插件时自然模仿 |
| 插件自由 | ✅ | 核心不检测插件类型。工作台插件未来也可以：mount 时恢复自己的卡片布局 |
| VS Code 化 | ✅ | 对标 VS Code：`ITerminalService` 恢复终端，编辑器恢复编辑器——各管各的 |

**会不会引入新 bug？** 
- 🔶 TerminalView mount 时机——多个 TerminalView 同时 mount 时可能竞态。但 `createSession` 内部有 `id ||` 防御，重复 mount 不会创建重复 session。
- ✅ B3 标签页僵尸问题消失。F5 后终端标签页立即可用。

**会不会写硬编码？** ✅ 修正后不涉及。

**对未来插件影响：** ✅ 建立了"插件自己负责数据恢复"的模式。

---

### 步 5：A3+B1+G23 — port 自动填充（症状群）

**做什么：** ControlPanel 打开端口时，如果 `session.port` 为空，自动填上当前选择的端口名。

**合规性：** 全部 ✅。逻辑在 `plugins/terminal/ControlPanel.tsx` 内部——终端插件自己的 UI 逻辑。纯局部改动，不碰核心，不碰其他插件。

**会不会引入新 bug？** 
- 🔶 如果用户有两个终端标签页，都 `port=""`，在 tab A 打开 COM3 → `sessionA.port = "COM3"` → 切换到 tab B → B 的下拉框因为 sessionB.port 为空所以显示第一个可用端口。行为正确——端口绑定到了 session A。
- ✅ 侧栏"未配置"消失 + 按钮变绿 + 不会在空 port 状态下调用 Rust。

**会不会写硬编码？** ❌ 不涉及。

---

### 步 6：A1 — 快捷发送清理

**做什么：** 删除 `_migratedQuickSends` 模块变量和 `getDefaultQuickSends()` 迁移函数。新会话默认快捷发送 = `DEFAULT_SESSION.quickSends`。

**合规性：** 全部 ✅。纯删除临时迁移代码。`getConfigurationValue` 导入也一并删除（F3 残留清理的一部分）。

**会不会引入新 bug？** ❌ 不会。迁移是一次性的——C5 删 `contributes.configuration` 时就应该删这个桥接。

**会不会写硬编码？** ❌ 不涉及。正好相反——删除了对 ConfigurationService 的硬编码桥接。

---

### 步 7：F1 症状群（B4+E2+N2）— viewRole 统一消费

**做什么：**
1. `viewRegistry.ts` 新增 `getTabCreatableViews()` → 过滤掉 `viewRole === "sidebarPrimary"` 的插件
2. `WelcomeView.tsx` — 欢迎页快捷卡片改用 `getTabCreatableViews()`
3. `TabBar.tsx` — PlusMenu 改用 `getTabCreatableViews()`
4. `App.tsx` `handleIconClick` — 检查 N2（图标栏点插件市场）

**合规性：**

| 原则 | 评分 | 分析 |
|:--|:--:|------|
| 精益求精 | ✅ | 三处消费端统一走一个函数——之前是各处自己做（或不做的）判断 |
| 归一化 | ✅ | `getTabCreatableViews()` 是唯一的"哪些插件可创建为标签页"入口。新增入口只需调这个函数 |
| AI 友好 | ✅ | AI 写新功能要列出"可创建标签页的插件"→ 自然找到这个函数，不会自己手写过滤 |
| 插件自由 | ✅ | 过滤依据是 `viewRole` 声明，不是插件 ID。新插件声明 `sidebarPrimary` → 自动被所有入口过滤 |
| VS Code 化 | ✅ | 对标 VS Code：Explorer 视图不出现在编辑器列表 |

**N2 需要额外确认：** 图标栏点"插件市场"→ 当前行为是只切侧栏。需确认插件市场的 `viewRole` 是什么。如果是 `tabOnly`，那图标栏点击时应该创建标签页；如果是 `sidebarPrimary`，那图标栏点击时应该只切侧栏。**不管哪种，行为应该和 viewRole 声明一致——目前不一致本身就是 bug。**

**会不会引入新 bug？** 
- 🔶 如果有插件声明了 `viewRole` 但忘记写或者写错了，修复后它会从某些入口消失。但这是正确行为——插件声明错了就该按声明来。需要在文档里提醒插件开发者正确声明 viewRole。
- ✅ 不会有"终端突然从 [+] 菜单消失导致用户困惑"的问题——因为终端本来就不该在 [+] 菜单里，用户点它只会创建僵尸标签页。

**会不会写硬编码？** ❌ 不涉及。正好相反——修正了三处不读 viewRole 的硬编码行为。

**对未来插件影响：** ✅ 正面——插件只需正确声明 viewRole，所有入口自动正确处理。

---

### 步 8：E1 — confirmOnClose 接线

**做什么：** TabBar ✕ / 中键关闭 / Ctrl+W 关闭前，检查 `getTabBehavior(tab).confirmOnClose`，有值则弹确认框。

**合规性：**

| 原则 | 评分 | 分析 |
|:--|:--:|------|
| 精益求精 | ✅ | plugin.json 声明的字段终于有代码消费了——"声明即行为" |
| 归一化 | ✅ | 所有关闭路径统一走 TabBar 的 `closeWithAnimation`（Ctrl+W 也改为调它，或抽公共函数） |
| AI 友好 | ✅ | 新 AI 写插件→在 plugin.json 声明 `confirmOnClose` → 标签栏自动弹确认 |
| 插件自由 | ✅ | 任何插件都可以声明 `confirmOnClose`，不限于终端 |
| VS Code 化 | ✅ | 对标 `workbench.editor.closeWithConfirmation` |

**会不会引入新 bug？** 
- 🔶 确认框用 `window.confirm`（同步阻塞）还是自定义弹窗（异步）？`window.confirm` 最简单但不够好看。暂时用 `window.confirm`——Phase 6 统一换成自定义对话框。
- ✅ 不破坏现有流程——`confirmOnClose` 为空的插件不受影响。

**会不会写硬编码？** ❌ 不涉及。`getTabBehavior(tab)` 读的是插件声明，不检测插件 ID。

**对未来插件影响：** ✅ 任何插件声明 `"confirmOnClose": "xxx"` 即可获得关闭确认功能。

---

### 步 9：A4 — 侧栏重开标签页

**做什么：** `handleSelectSession` 改为 `openOrFocusTab("terminal", { label: session.name })`——标签页不存在则创建，存在则聚焦。

**合规性：**

| 原则 | 评分 | 分析 |
|:--|:--:|------|
| 归一化 | ✅ | `openOrFocusTab` 是已有的通用 API——不是为终端新写的 |
| VS Code 化 | ✅ | 对标 VS Code Explorer：点文件 → 编辑器打开或聚焦，不存在则新建 |

**🔶 一个小问题：** `openOrFocusTab("terminal")` 中的 `"terminal"` 字符串——这是在 `sidebar.tsx`（终端插件内部）写自己的插件 ID——不算硬编码。终端插件知道自己叫 "terminal" 是正常的。但如果未来插件 ID 从 plugin.json 动态读取会更好（Phase 6 优化）。

**会不会引入新 bug？** 
- 🔶 `openOrFocusTab` 创建的标签页 ID 和 session ID 不同 → 需要把新 tab ID 写回 session。或者更干净的做法：`openOrFocusTab` 支持传入 `targetId` 参数——让调用方指定"我希望标签页的 ID 是 X"。
- 实际上：session 创建时已经 `id: tabId`，所以 session.id === tab.id。标签栏 ✕ 关的是 tab，session 保留。侧栏重开时 `openOrFocusTab` 创建新 tab（新 ID）→ 需要 `updateSession(oldId, { id: newTabId })`。
- 这是正确行为——旧 tab 已不存在，session 绑定到新 tab。

**会不会写硬编码？** ❌ 在自己的插件里引用自己的 plugin ID → 不违反核心无知原则。

**对未来插件影响：** ✅ `openOrFocusTab` 是通用 API，任何插件都可以用。

---

### 步 10：A2+N1 — 改名同步标签栏

**做什么：** `handleRename` 更新 `session.name` 后，调用 `tabActions.updateTabLabel(sessionId, newName)`。

**合规性：**

| 原则 | 评分 | 分析 |
|:--|:--:|------|
| 归一化 | ✅ | `updateTabLabel` 是标签页系统的通用 API——不是为终端特制的 |
| 插件自由 | ✅ | 未来任何插件都可以用 `updateTabLabel` 更新自己的标签页标题 |

**需要在 TabActionsContext 中新增 `updateTabLabel`。** 这个 API 是通用的——对标 VS Code 的 `editor.setLabel()`。

**会不会引入新 bug？** 
- 🔶 `updateTabLabel` 需要更新 tabState 中的 `tab.label`。如果 tab 当前不在任何 group 中（理论上不可能），静默失败。加 console.warn 即可。
- ✅ A2 串扰（改名影响其他会话）已确认不存在 → 只需修标签栏同步。

**会不会写硬编码？** ❌ 不涉及。`updateTabLabel(tabId, label)` 接收任意 tabId。

---

### 步 11：E3+E4 — 命令竞态 + receiveMode

**做什么（C1 修完后）：**
- E4：`_receiveMode` 模块变量 → `session.receiveMode` 读取
- E3：终端命令 handler 通过 activeSessionId 找到对应 TerminalView 的 cmView

**合规性：**

| 原则 | 评分 | 分析 |
|:--|:--:|------|
| 归一化 | ✅ | E4 消除了模块级可变状态——receiveMode 现在存在 session 里，唯一的真实来源 |
| AI 友好 | ✅ | 命令路由模式："命令→读 activeSessionId→找对应视图→执行"。清晰线性 |

**E3 的设计细节（需要谨慎）：**

当前 12 个终端命令 handler 在 `registerCommand` 时通过闭包捕获 cmView ref。C1 修完后，每个 TerminalView 有自己的 cmView 和 session。命令 handler 怎么找到正确的 cmView？

**方案 A（推荐）：** 终端插件维护一个 `Map<sessionId, EditorView>`（模块级 WeakMap）。每个 TerminalView mount 时注册 `map.set(sourceId, cmView)`，unmount 时清理。命令 handler 内部：`const view = cmViewMap.get(getActiveSessionId())` → 在正确的 view 上操作。

**方案 B：** 12 个命令用动态 namespace 注册（`terminal-${tabId}`）。❌ 改动大，且命令面板中会出现 12×N 条命令。

**方案 A 的合规性：**
- 归一化：✅ cmView 注册/注销模式——对标 VS Code 的 `ICodeEditorService`。
- 硬编码：❌ 无。Map 的 key 是 sessionId（string），不依赖插件 ID。
- 未来插件：✅ 任何需要"多实例+命令路由"的插件可以用同样模式。

**会不会引入新 bug？** 
- 🔶 WeakMap 的 key 是 sessionId，但如果两个 session 巧合有相同 ID（G3 未修时），map 会覆盖。但 G3 会单独修，且 H2 的 `||` 防御了空串。
- 🔶 unmount 时清理 map——如果忘记清理，命令会操作已销毁的 cmView。需要确保 useEffect cleanup 中 `map.delete(sourceId)`。

---

### 步 12：E5+N3 — 串口生命周期

**做什么：**
- E5（卸载）：终端插件监听到卸载事件 → 关闭串口 + `resetAllSessions()`
- N3（关标签页）：TerminalView unmount 时（useEffect cleanup）→ 如果此 session 的端口已打开 → 关闭串口

**🔶 需要设计决策：N3 的语义**

问题：两个终端标签页共享一个物理端口（C2 单串口限制）。关闭标签页 A 时是否断开串口？
- **选项 1：总是断开。** 标签页 A 关了 → 断串口。用户在标签页 B 需要重新打开。对标 VS Code 终端：关闭终端标签页 → 终端进程终止。
- **选项 2：仅当没有其他终端标签页在使用时断开。** 更智能但需要跨 TerminalView 协调——引入新的复杂度。
- **选项 3：断开但弹提示。** "关闭此标签页将断开串口连接，确定？" → 和 E1 的 confirmOnClose 自然衔接。

**推荐选项 3：** 和 E1 修法天然衔接。用户确认关闭 → 断串口。不需要跨 TerminalView 协调。如果用户想保留连接，点取消就行。

**合规性：**

| 原则 | 评分 | 分析 |
|:--|:--:|------|
| 归一化 | ✅ | 串口关闭逻辑在终端插件的生命周期管理中——一个地方 |
| 插件自由 | ✅ | 未来插件的"卸载时清理资源"模式：onWillUninstall → 关资源。通用模式 |
| VS Code 化 | ✅ | 对标：关闭终端 → 进程终止。卸载扩展 → 扩展停用 |

**会不会引入新 bug？** 
- 🔶 TerminalView unmount 时调用 `invoke("close_port")` 是异步的。如果用户快速关闭又打开，可能出现竞态：close_port 在 open_port 之后到达。需要在 Rust 端做幂等防御（已有的 `close_port` 已经是安全的——port 为 None 时什么都不做）。
- ✅ 不会出现"关标签页后串口幽灵"——N3 的核心诉求就是解决这个。

**会不会写硬编码？** ❌ 不涉及。

---

### 步 13-17 + 后续批次

**步 13 (F2 plugin.json 审计)：** grep 确认每个声明字段有消费端。纯审计，无代码改动风险。

**步 14 (F3 C4a 残留清理)：** 删除 A1 桥接 + `getReceiveCoding()` 函数。纯删除，无风险。

**步 15 (G1 reduceUnsplit 数据丢失)：** 在 remove group 前把 tabs 移到存活 group。这是标签页系统的通用逻辑（不检测插件类型）。✅ 无风险。

**步 16 (G7 Monaco Enter 键)：** `handleSend` 通过 ref 桥接，deps 改为 `[]`。这是 React 的标准 ref 模式——对标 React 官方文档的 `useRef` + effect 模式。✅ 无风险。

**步 17 (G3 计数器同步)：** 恢复布局后扫描 tab ID 更新计数器。在 `tabIdentity.ts` 中——标签页系统内部，不涉及插件。✅ 无风险。

**后续批次（G10/G14/G21/G22/G16/G4/G5/G6/G19/G20/G12/G15/G17/G18）：** 全部是机械修复——修逻辑错误、删死代码、提取公共函数、加防御。无架构风险。

---

## 总评

### 原则合规矩阵

| 步 | Bug | 精益求精 | 归一化 | AI友好 | 插件自由 | VS Code化 | 硬编码风险 |
|:--:|------|:--:|:--:|:--:|:--:|:--:|:--:|
| 1 | C1 | ✅ | ✅ | ✅ | ✅ | ✅ | 无 |
| 3 | E8 | ✅ | ✅ | ✅ | ✅ | ✅ | **删除**现有硬编码 |
| 4 | B3 | ✅ | ✅ | ✅ | ✅ | ✅ | ⚠️ 已修正 |
| 5 | A3+B1+G23 | ✅ | ✅ | ✅ | — | — | 无（插件内部） |
| 6 | A1 | ✅ | ✅ | ✅ | ✅ | — | **删除**现有硬编码 |
| 7 | F1 症状群 | ✅ | ✅ | ✅ | ✅ | ✅ | 无 |
| 8 | E1 | ✅ | ✅ | ✅ | ✅ | ✅ | 无 |
| 9 | A4 | ✅ | ✅ | ✅ | ✅ | ✅ | 无 |
| 10 | A2+N1 | ✅ | ✅ | ✅ | ✅ | ✅ | 无 |
| 11 | E3+E4 | ✅ | ✅ | ✅ | ✅ | ✅ | 无 |
| 12 | E5+N3 | ✅ | ✅ | ✅ | ✅ | ✅ | 无 |
| 13-17 | F2/F3/G1/G7/G3 | ✅ | ✅ | ✅ | ✅ | ✅ | 无 |

### 硬编码变化统计

| 类型 | 数量 |
|:--|:--|
| **删除**的硬编码 | 3 处（`"terminal.receiveCoding"` / `getConfigurationValue("terminal.quickSends")` / `getConfigurationValue` 桥接 import） |
| **新增**的硬编码 | **0 处** |

### 会不会引发 V2.6 式的归一化失败？

**不会。** V2.6 的教训是同一个逻辑在多个地方实现（formatTimestamp 写了两遍，配置迁移做了两套路径）。本轮修法：

- **每个概念只有一个入口：** `getTabCreatableViews()` 是唯一过滤入口、`useSession(id)` 是唯一 session 读取入口、`confirmOnClose` 只有一处检查
- **消除模块级可变状态：** `_receiveMode` / `_migratedQuickSends` → 迁移到 session 数据中
- **不引入新的全局单例：** cmViewMap 是 terminal 插件内部 WeakMap，不是跨插件共享的全局状态

### 对未来插件的唯一影响

**正面：** 本轮修复实际上**建立了多个通用模式和 API**：

1. `useDataSource(sourceId)` —— 插件视图绑定自己的数据
2. `getTabCreatableViews()` —— 统一过滤哪些插件可创建标签页
3. `updateTabLabel()` —— 通用标签页标题更新 API
4. `confirmOnClose` —— 声明式关闭确认（任何插件可用）
5. 插件 `onWillUninstall` 资源清理模式

这些模式使未来新插件的开发**更容易**、**更一致**。

---

## 结论

**17 步计划通过了六条原则审计。** 唯一的修正点是步 4（B3）——将"核心检测 terminal 标签页"反转为"TerminalView 自己恢复 session"，消除硬编码风险。其余 16 步均合规。

**不会产生 V2.6 式的后悔。** 不引入新硬编码、不引入模块级可变状态、不重复逻辑。正好相反——本轮修复会删除 3 处现有硬编码，建立 5 个通用模式。
