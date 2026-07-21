# Phase 5.5c 终端侧栏 Bug 清单

> 2026-07-22。代码审查 + Encaron 实测反馈。`phase5.5` 分支。

---

## 🔴 A 类——数据完整性问题（session 数据错误/串扰）

### A1. 新建会话的快捷发送不新鲜——从旧 session 串过来了

**现象：** 新会话的快捷发送区域出现了之前会话里随手创建的快捷发送内容。

**根因：** `useTerminalSessions.ts` 的 `getDefaultQuickSends()` 函数（第 126-142 行）：
```typescript
let _migratedQuickSends: Record<string, string> | null = null;

function getDefaultQuickSends(): Record<string, string> {
  if (_migratedQuickSends) return { ..._migratedQuickSends };
  // 一次性迁移——读 ConfigurationService 旧数据
  const old = getConfigurationValue("terminal.quickSends") ...
  _migratedQuickSends = old ?? DEFAULT_SESSION.quickSends;
  return { ..._migratedQuickSends };
}
```

`_migratedQuickSends` 是模块级变量，第一次调用后永不重置。如果旧 ConfigurationService 中有用户之前存的快捷发送数据（C5 删 `contributes.configuration` 前存的），所有新会话都会继承。

**修法：**
1. 删除 `_migratedQuickSends` + `getDefaultQuickSends()` 迁移逻辑
2. 新会话始终用 `{ ...DEFAULT_SESSION.quickSends }` = `{ "AT": "AT\\r\\n" }`
3. 删除 `import { getConfigurationValue } from ...`（临时桥接，设计文档明确标了 TODO Phase 5.5c C5）
4. `useTerminalSessions.ts` 代码量：~−20 行

---

### A2. 改一个会话的名 → 另一个会话名也变了

**现象：** 侧栏中把"新对话1"改名为"新对话" → "新对话2"也跟着变成了"新对话"。标签栏标题不变（仍显示旧名）。

**根因分析（待定位）：**

可能原因 A——标签栏标题不同步：`sidebar.tsx` `handleRename` 只更新了 `session.name`（`updateSession(id, { name })`），没有同步更新标签栏的 `tab.label`。需要调用 `tabIdentity` 或标签栏更新机制。

可能原因 B——两个会话名同时变：`updateSession` 逻辑确认无误（按 ID 匹配），但如果两个 session 的 ID 相同（旧代码创建的 session 用自增计数器，与 tab 系统计数器不同步），`_sessions.map` 会同时匹配到两个。

**修法：**
1. `handleRename` 中调用 TabActions 更新标签栏标题（需要 `updateTabLabel` API）
2. 确认 session.id === tab.id 一一对应（A3 相关）

---

### A3. 两个终端会话的 COM 口同步——选 COM13 两个都变，选不回 COM3

**现象：**
1. 两个终端会话，本来 COM3 可用
2. 插入 COM13 后，两个会话的端口下拉框都自动刷成 COM13
3. 无法选回 COM3

**根因：**
- `SerialContext` 是全局单例——`portName` + `ports` 列表是唯一的，所有 `ControlPanel` 实例共享
- 端口列表每 2 秒轮询 `list_ports` 刷新（`App.tsx:477`）
- 两个会话的 `session.port` 都是 `""`（DEFAULT_SESSION 默认值）
- 用户从未显式在下拉框中选端口——下拉框 `value=""` 未匹配任何 option，浏览器默认显示第一个
- 打开端口时 `handleToggleOpen` 不更新 `session.port`（因为 `activeSession.port` 是空串，sync 逻辑跳过）
- 插入新 COM 口 → `ports` 列表变化 → 两个 ControlPanel 都重渲染，下拉框都显示新的第一个端口

**修法：**
1. `handleToggleOpen` 中：打开端口时如果 `activeSession.port` 为空，自动填充当前 `state.portName`
2. `handlePortChange` 中：选择端口时正确更新 `session.port`（已有，但用户没触发）
3. 长期方案（Phase 6+）：`TerminalView` 按 `tabId` 绑定 session，不共享全局 `activeSession`

---

### A4. 标签栏 ✕ 关标签页后，侧栏点 session 不能重开标签页 ❌ 行为缺失

**现象：**
1. 标签栏 ✕ 关闭"新对话1"标签页 → 标签页消失 ✅（正确——对标 VS Code 关闭编辑器不删文件）
2. 侧栏"新对话1"仍存在 ✅（正确——session 数据没丢）
3. **点侧栏"新对话1" → 什么都没发生** ❌（应该重新打开标签页！）

**预期行为（对标 VS Code Explorer）：**
- 标签栏 ✕ = 关闭编辑器视图，文件内容还在（session 数据保留）
- 侧栏点 session = reopen 标签页
- 侧栏 ✕ = 真正删除 session + 关标签页

**根因：** `handleSelectSession` 调 `focusTab(sessionId)`——但标签页已被关闭，`focusTab` 找不到目标 tab，无事发生。应该改为：先尝试 `focusTab`，如果 tab 不存在则 `createTab` 重新创建。

**修法（sidebar.tsx `handleSelectSession`）：**
```typescript
const handleSelectSession = useCallback(
    (sessionId: string) => {
      setActiveSession(sessionId);
      if (tabActions) {
        // 先尝试聚焦已有标签页，不存在则重新创建
        const result = tabActions.openOrFocusTab("terminal", { 
          label: getSessionById(sessionId)?.name, 
          pinned: true 
        });
      }
    },
    [setActiveSession, tabActions],
  );
```

`openOrFocusTab` 的逻辑：已有 terminal 标签页 → 聚焦；没有 → 创建新的。完美匹配"重开标签页"语义。

但有一个问题：`openOrFocusTab` 按 `type="terminal"` 创建，新 tab 的 ID 和旧 session ID 不同。需要改用 `focusTab(sessionId)` 精确聚焦，失败则 `createTab` + 传入 session 的 ID。

**更精确的修法：**
```typescript
// 先尝试精确聚焦
tabActions.focusTab(sessionId); // tab 已删除 → focusTab 会报错或被忽略
// 如果 tab 不存在（focusTab 不报错也不做任何事），改用 createTab
// 实际上 focusTab 只改变 activeTabId，找不到 tab 时静默失败
```

**最终方案：** 改用 `openOrFocusTab("terminal")`。它会对标 VS Code：已有 terminal 标签页就聚焦，没有就创建。然后 session.id 需要和创建出来的 tab.id 重新配对。或者更好的做法：调用 `createTab("terminal", { label: session.name, pinned: true })`，拿到新 tabId → `updateSession(sessionId, { id: newTabId })` 重新配对。

其实更好的做法是：直接调 `handleCreate` 风格——`createTab` 然后 updateSession 的 ID。但这样不够优雅。

**推荐方案（对标 VS Code）：**
`handleSelectSession` 中：先试 `openOrFocusTab("terminal")`。如果返回 null（没有已有标签页且创建失败）→ 调 `createTab("terminal", ...)` 创建新标签页 → 把新 tabId 写回 session.id（因为旧 tab 已被删，session 需要新 tab 绑定）。

---

### A5. 标签栏点终端标签页 → 不更新 `_activeSessionId`

**现象：** 用户有两个终端标签页（tab1=新对话1，tab2=新对话2）。当前 active session 是"新对话2"。用户点标签栏的"新对话1"标签页 → `handleFocusTab` 执行 → `focusTab(tab1)` 让 tab1 可见 → 但 `_activeSessionId` 仍是"新对话2"的 ID → tab1 的 TerminalView 仍显示"新对话2"的内容。

**根因：** `App.tsx:366-374` `handleFocusTab` 只调 `focusTab(tabId)` 切换标签页系统状态，不调 `setActiveSession(tabId)` 同步 session 状态。

**操作路径：**
1. 两个终端标签页，各对应一个 session
2. 当前在看 tab2（session2）
3. 直接点 tab1 的标签（非侧栏）→ 标签栏高亮变了，但主区内容没变

**修法：** 两种方案：
- **A：** `handleFocusTab` 中检测插件类型 → 如果是 terminal → 调侧栏的 `setActiveSession(tabId)`。❌ 违反核心无知原则
- **B（推荐）：** C1 修完后此 bug 自动消失——每个 TerminalView 绑定自己的 session（不读 `_activeSessionId`），切换标签页自然显示对应 session 内容

---

### A6. 协议选择器是全局单例——影响所有 session

**现象：** 在 session A 里把协议从"方括号"换成别的 → 所有 session 的协议都变了。

**根因：** `ControlPanel.tsx:66-74` `handleProtocolChange` 调 `setActiveProtocol(protocolId)`——这是 `ProtocolRegistry` 的全局 setter（`_activeProtocolId`）。虽然也更新了 `session.protocol`，但全局状态已被覆盖。下次切到另一个 session 时，协议下拉框的值和全局活跃协议不一致。

**修法：** `handleProtocolChange` 不再调 `setActiveProtocol()`。协议的激活/使用按 session 读取（`activeSession.protocol`），不经过全局 `_activeProtocolId`。`ProtocolRegistry` 的 `_activeProtocolId` 仅为无 session 时的 fallback。

---

## 🟡 B 类——UI 状态不同步（显示不反映实际状态）

### B1. 打开串口后侧栏仍显示"未配置"，按钮颜色不变

**现象：** 新建会话 → 打开串口 → 侧栏会话项副标题仍是"未配置"（应显示"115200 · bracket"），ControlPanel 连接按钮仍是灰色（应变为绿色/高亮）。

**根因（同 A3）：** 用户打开端口时 `session.port` 为空串。
- `handleToggleOpen` → `activeSession.port` 为空 → 跳过 sync → `toggleOpen()` 在 `state.portName` 上打开
- 端口实际打开了（`isOpen = true`），但 `connected = isOpen && state.portName === activeSession.port` = `true && "COM3" === ""` = `false`
- 侧栏副标题：`session.port ? ... : "未配置"` → `""` 是 falsy → 显示"未配置"

**修法：** 同 A3 修法 1——`handleToggleOpen` 中自动填充 session.port。

---

### B2. 侧栏点会话不聚焦标签页（实测仍不工作）

**现象：** 侧栏点了"新对话2" → 标签栏指示器变了，但主区内容没切到新对话2。

**根因分析（两层）：**

**层 1——`focusTab` 是否被调用？** 已加 `handleSelectSession → tabActions?.focusTab(sessionId)`。需确认 `tabActions` 非 null、`sessionId === tabId`。

**层 2（架构层）——所有 TerminalView 读同一个 `activeSession`。** `MainContent.tsx:65` 渲染 `<plugin.component key={tab.id} isActive={isActive} />`。TerminalView 组件内部：
```typescript
const { activeSession } = useTerminalSessions();  // 模块级单例！
```
两个终端标签页各有一个 `TerminalView` 实例，但都从 `_activeSessionId` 读"当前 active session"。**`focusTab` 改变了标签页系统的 active tab，但没有改变 `_activeSessionId`。** 切换标签页后，两个 TerminalView 仍然显示同一个 session 的内容。

**修法：**
- **短期（必须立即修）：** `handleSelectSession` 中的 `setActiveSession(sessionId)` 已设置 `_activeSessionId`。但 `focusTab` 也要确保 sessionId 对应的 tab 被聚焦。
- **需要验证：** session.id 和 tab.id 是否一致（新创建的已一致，但旧的可能不一致）。

---

### B3. F5 刷新 → 标签页恢复但 session 全丢 → "会话已失效"

**现象：**
1. 新建终端会话"新对话1" → 标签页出现
2. F5 刷新
3. 侧栏会话列表清空（预期——无持久化）
4. **但标签栏里"新对话1"标签页仍在**（非预期——应同步消失）
5. 标签页内容显示"会话已失效"

**根因：** `LayoutService` 持久化所有标签页（`saveTabLayout` → `layout.json`），F5 后 `restoreLayout` 恢复标签页。但 `useTerminalSessions` 的 `_sessions` 是纯内存态，无持久化。标签页恢复了，session 没恢复 → TerminalView 读到 `activeSession = null` → 显示占位。

**操作路径：**
1. 新建"新对话1" → tab + session 都存在
2. F5 → session 丢失 → tab 仍在 → 僵尸标签页

**修法：** 三种方案：
- **A（推荐——Phase 5.5c）：** 恢复布局时检测 terminal 标签页 → 为每个 terminal tab 自动 `createSession(tab.label, tab.id)`。标签页和 session 重新配对。
- **B（Phase 6）：** 持久化 sessions 到 FileService。
- **C（临时）：** 不持久化 terminal 标签页（在 `saveTabLayout` 中过滤掉 terminal 类型）。❌ 违反用户预期——F5 后回来标签页还是应该在的。

推荐 A——最小改动，利用已有的标签页恢复机制。

---

### B4. 欢迎页点终端卡片 → 直接开标签页（不尊重 viewRole）

**现象：** 欢迎页"开始"区域有终端卡片 📟。点卡片 → 侧栏变终端侧栏 ✅，但同时蹦出一个"终端"标签页（标题"终端"，内容"会话已失效"）❌。

**根因：** `WelcomeView.tsx:35-42` `handleShortcutClick` 对所有插件统一调 `onCreateTab(pluginId)`——直接创建标签页。不检查 `viewRole`。`sidebarPrimary` 插件（如终端）应该只 toggle 侧栏，不创建标签页。

```typescript
const handleShortcutClick = (pluginId: string, displayName: string) => {
    if (onCreateTab) {
      onCreateTab(pluginId);  // ← 对所有插件都直接创建标签页！
    }
    ...
  };
```

**操作路径：**
1. 首次启动 → 欢迎页
2. 点欢迎页的终端卡片 📟
3. `createTab("terminal")` → 标签页出现（标题"终端"）
4. 没有 session → 显示"会话已失效"

**修法：** `handleShortcutClick` 读 `getViewRole(pluginId)`：
- `sidebarPrimary` → 不创建标签页，改为 dispatch `openSidebarView` 事件（让 App.tsx 的 `handleIconClick` 处理）
- `tabOnly` → 保持现有逻辑（`onCreateTab`）

注意：需要暴露 `getViewRole` 给 WelcomeView（已从 `viewRegistry` 导出）。

---

## 🟠 C 类——架构缺陷

### C1. 所有 TerminalView 读同一个 global `activeSession`——无 per-tab 绑定

**现象：** 两个终端标签页永远显示同一条数据。切换标签页只是 CSS display 切换，内容不变。

**根因：** `TerminalView` 组件：
```typescript
const { activeSession } = useTerminalSessions();
```

`activeSession` 是模块级 getter → `_sessions.find(s => s.id === _activeSessionId)`。所有 `TerminalView` 实例（无论属于哪个 tab）都共享同一个 `_activeSessionId`。

**为什么之前没发现：** `viewRole: "tabOnly"` 时，只有一个终端标签页，`activeSession` 就是它——没有矛盾。5.5c 切换到 `sidebarPrimary` 后，可以多个终端标签页共存，矛盾暴露。

**修法（Phase 5.5c 范围内）：**
- `TerminalView` 接收 `sourceId` prop（已由 `MainContent` 传入！）
- `sourceId` 就是 `tab.id` = `session.id`
- `TerminalView` 用 `sourceId` 查 session：`getSessionById(sourceId)` 而非读 `activeSession`
- **每个 TerminalView 绑定到自己的 session，而非全局 active session**
- `activeSession` 仅用于侧栏联动（侧栏点会话 → 改 `_activeSessionId` → 侧栏收发设置刷新）
- 主区 TerminalView 的 session 绑定不经过 `_activeSessionId`

**涉及文件：**
- `plugins/terminal/index.tsx` — `TerminalView` 用 `sourceId` 读 session
- `plugins/terminal/useTerminalSessions.ts` — 加 `useSession(id)` hook（按 ID 订阅单个 session）
- `plugins/terminal/ControlPanel.tsx` — 同，用 `sourceId` 绑定
- 预期净变动：~+30/−15 行

---

### C2. SerialContext 全局单例——所有会话共享同一串口

**现象：** 只能打开一个 COM 口。两个会话不能各自连接不同 COM 口。

**根因：** Rust 后端 `SerialState` 是单例 `Arc<Mutex<SerialInner>>`，一个时刻只能有一个 `port: Option<Box<dyn SerialPort>>`。前端 `SerialContext` 只有一个 `portName/isOpen`。

**修法：** Phase 7 多串口同时连接需要 Rust 端重构（端口池）。当前阶段：接受限制——一次一个物理串口连接。但要确保 UI 层面切换会话时端口设置正确联动。

---

## 🟢 D 类——已修复

| # | Bug | 修复 commit |
|:--|------|:--|
| D1 | CM6 右键复制/全选失效 | `1c80cd3` |
| D2 | F5 后串口状态不同步 | `df260e1` |
| D3 | Toggle 命令标签不随状态变 | `f476c21` |
| D4 | 侧栏 +新建 不弹标签页 | `304b6b1` |
| D5 | 侧栏删会话不关标签页 | `304b6b1` |

---

## 📋 修复优先级

| 优先级 | Bug | 理由 |
|:--:|------|------|
| 🔥🔥🔥 | **C1** per-tab session 绑定 | 所有多标签页内容混乱的根因。修完 A5、B2 自动消失 |
| 🔥🔥 | **A3 + B1** port 不自动填充 | 用户第一个操作就踩到——新建会话→开端口→"未配置" |
| 🔥🔥 | **B3** F5 标签页恢复但 session 丢失 | 用户自然操作——F5 是最常用的刷新方式 |
| 🔥🔥 | **B4** 欢迎页卡片不尊重 viewRole | 欢迎页是第一个接触点——点终端卡片蹦空白标签页 |
| 🔥🔥 | **A1** 快捷发送串扰 | 数据完整性问题——旧数据漏到新会话 |
| 🔥🔥 | **A4** 标签栏 ✕ 变僵尸 session | 用户自然操作路径——点标签 ✕ 是标准行为 |
| 🔥 | **A5** 标签栏点不更新 activeSession | C1 修完自动消失 |
| 🔥 | **A2** 改名串扰 + 标签栏不同步 | 需同时修 session name → tab label 同步 |
| 🟡 | **A6** 协议全局单例 | 当前只有一个协议（bracket），暂时不暴露 |
| 🟡 | **C2** 全局串口 | Phase 7 多串口——当前不修 |

---

## 🔍 审查覆盖的操作路径

| # | 操作 | 覆盖？ | 发现 |
|:--|------|:--:|------|
| 1 | 侧栏 + 新建 → 命名 → 回车 | ✅ | A1 快捷发送串扰、B2 focusTab 调用正确但 C1 导致内容不变 |
| 2 | ControlPanel 选端口 → 打开 | ✅ | A3+B1 端口不自动填充、A6 协议全局 |
| 3 | 侧栏点会话切换 | ✅ | B2 + C1 所有 TerminalView 共享 activeSession |
| 4 | 标签栏点标签页切换 | ✅ | **A5**（新发现）handleFocusTab 不更新 _activeSessionId |
| 5 | 标签栏 ✕ 关闭标签页 | ✅ | **A4**（新发现）僵尸 session |
| 6 | 侧栏 ✕ 删会话 | ✅ | D5 已修——closeTab+removeSession |
| 7 | 侧栏 F2 / ✎ 改名 | ✅ | A2 待定位 |
| 8 | Ctrl+W 关标签页 | ✅ | 同 A4 |
| 9 | F5 刷新 | ✅ | D2 已修——串口状态同步 |
| 10 | 右键菜单复制/全选 | ✅ | D1 已修 |
| 11 | 命令面板 toggle 命令 | ✅ | D3 已修 |
| 12 | 快捷发送添加/编辑/删除 | ✅ | A1 串扰 |
| 13 | 收发设置区改值 | ✅ | 数据流正确——sidebar write → session → index read |

---

## 📊 审查结论

**全部 13 条操作路径已覆盖。发现 A 类 6 个、B 类 4 个、C 类 2 个、D 类 5 个（已修）。共 12 个活跃 bug。**

**2026-07-22 逻辑澄清：**
> 标签栏 ✕ = 只关视图不删数据（对标 VS Code 关闭编辑器 ≠ 删文件）。侧栏 ✕ = 真正删除 session + 关标签页。A4 是"缺失功能——点 session 应重开标签页"，不是"标签栏关标签页是 bug"。文档已据此修正。

核心矛盾：5.5c 的 `sidebarPrimary` 启用了多标签页，但 `TerminalView` 仍用 5.5c 之前的单例模式（`activeSession` 是全局 getter）。**C1（per-tab session 绑定）是必须修的架构缺陷**——它是一切多标签页混乱的根源。修完后 A5、B2 自动消失，其他 bug 的严重性也会大幅降低。
