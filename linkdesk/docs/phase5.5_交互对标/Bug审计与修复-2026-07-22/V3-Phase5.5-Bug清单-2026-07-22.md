# Phase 5.5c 终端侧栏 Bug 清单

> 2026-07-22。代码审查 + Encaron 实测反馈。`phase5.5` 分支。
>
> ⚠️ **本清单已通过六条质量原则审查（精益求精/归一化/插件自由/VS Code 化/AI 友好/易操作）。修法已定稿——新 AI 进场后可直接按本节执行，不需要重新争论方案。**
>
> **新 AI 前置阅读：** `CLAUDE.md` + memory `[[phase5.5c-progress]]` + `[[quality-commandments]]` + `[[core-ignorance-principle]]`。修法细节已在每个 bug 的"修法"栏注明，代码量和涉及文件也已标注。
>
> 🔥 **2026-07-24 更新——卸载 bug 根因已定位：** Rust `fs::rename` 跨目录移动在 Windows + Vite dev server 下失败（ERROR_ACCESS_DENIED）。详见 memory `[[uninstall-bug-recurring]]`。9 轮修复历史、结构性改进方案（invoke 统一日志/卸载单入口/Rust error→前端 toast）待做。

---

## ✅ 已修复（实测发现——不在原始 49 个中）

> 2026-07-22 Encaron 实测发现。三个都是**系统边界接缝处**的 bug——硬件边界、API 约定边界、迁移边界。
> 共性：代码审查能发现逻辑错误，但发现不了"I/O 不响应会怎样"、"tabId 传空串会怎样"——这些需要**实际跑起来**。

| # | Bug | 根因 | 修法 | commit |
|:--|------|------|------|:--|
| **H1** | MCU 断电/不响应 → 打开串口 → 整个软件卡死（鼠标转圈） | `read_loop` 读错误不休眠→死循环抢锁；`close_port` flush 在锁内→设备不响应时阻塞所有命令 | ① Err 分叉处理，先 drop lock 再 sleep 100ms ② port.take() 取出口→锁外 flush | `a803bcc` |
| **H2** | 新建会话→开串口→MCU 数据不显示 + 侧栏收发设置按钮全部不工作 | `createTab` 返回 `""`→`??` 放过空串→`session.id=""`→`!""`=true 丢弃所有数据；`if("")`=false 按钮不工作 | `??` → `\|\|`（空串触发自动生成 ID） | `a803bcc` |
| **H3** | 切换"行号显示""消息回显"等设置→接收区不再出现系统提示 | C4a 迁移删除了 `onDidChangeConfiguration` 订阅，漏了副作用（设置变更→打印系统消息） | prevRef 对比恢复 6 项设置的变更提示 | `a803bcc` |

**H1-H3 暴露的系统性问题：** 141 个单元测试零失败，但没有端到端流程测试（创建会话→开串口→收发→切换设置）。三个 bug 都在**模块之间的接缝处**——不上手跑根本发现不了。修完后加了 10 个 session 边界测试，serial.rs 的 mock 测试留给 Phase 6。

---

## ✅ 已修复（2026-07-22/23 实操发现——session 交互层）

> Encaron 实测发现。共性：**侧栏列表条目垂直紧邻的物理特性**触发了 DOM 事件规范的边缘行为；**两个独立计数器 + 布局持久化**导致 ID 碰撞。

| # | Bug | 根因 | 修法 | commit |
|:--|------|------|------|:--|
| **B80** | 侧栏快速连续点击不同会话→偶尔无反应（标签栏不跟随切换） | mousedown A + mouseup B → click target = 共同祖先。条目级 `onClick` 不存在于祖先 | `onClick` → `onMouseDown`——对标 VS Code Explorer。按钮/input 加 `onMouseDown` stopPropagation | `161136b` |
| **B81** | `flushSync` 弯路——误诊为 React state 竞态 | AI 在 React 软件层猜：批处理/竞态/微任务——忽略了 DOM 事件层的物理限制 | 清掉 `flushSync`。React 官方警告 "in event handlers may cause bugs" | `b3b4ed4` |
| **B82** | 删侧栏会话不关标签页 / 关 A 删 B（仅 `npx tauri dev`，`npx vite` 正常） | 布局持久化恢复旧 terminal-N→`_terminalCounter` 归零→新建同名 ID 碰撞→`closeTab(session.id)` 找到旧 tab | ① `closeTabBySourceId`——用 `sourceId` 找 tab；② 布局恢复后同步 `_terminalCounter` | `4be450a` |
| **B83** | `npx tauri dev` 删会话无确认弹窗 | Tauri v2 WebView 禁用 `window.confirm()`→静默返回 `false` | Phase 6 改自定义弹窗组件。当前 `confirm` 返回 `false`→不执行删除（安全侧） | — |
| **B84** | `App.tsx` 硬编码 `useState("COM3")`——祖传默认值，V1/V2 源码均无此硬编码 | Phase 5f 迁移时 AI 删了 `prefs?.lastPort \|\|` 前缀，留下裸 `"COM3"` | 改为 `useState("")`，配合步 5 端口自动填充——第一个可用端口自动选中 | 待 commit |

**B80-B84 暴露的系统性问题：** ① `sourceId` 是 session↔tab 唯一可靠链接——`tab.id === session.id` 的假设在持久化场景下不成立；② 模块级计数器在重启后归零，但持久化数据保留旧 ID——任何类似模式（database connection ID、file handle ID）都会踩同样的坑。

## 相关记忆更新

- [VS Code Source Reference](vscode-source-reference.md) — 新增"刻骨铭心"节：刁钻 bug 先 curl VS Code 源码
- [User Profile](user-profile.md) — 新增"硬件直觉"优势：物理思维对软件调试的降维打击
- [V3 Pitfalls](v3-pitfalls.md) — B80-B83 已追加
- [插件UI写法规约](插件UI写法规约.md) — §7：侧栏列表选中用 `onMouseDown`，对标 VS Code Explorer

---

## 📋 复现结果汇总（2026-07-22 Encaron 实测）

> 按 bug 清单逐条复现。**19 确认 + 3 部分确认（A2/B4/G23）+ 1 已修复（G9）+ 1 日志无法确认（G21）+ 7 条件不足 + 3 代码级无法测 + 12 未测。**

### ✅ 确认复现（20 个）

| Bug | 用户反馈 |
|:--|------|
| **A1** | 测试1 添加快捷发送 CMD1→测试2 新建→测试2 底下也出现 CMD1；返回测试1→测试1 的 CMD1 也消失了 |
| **A3+B1** | 打开端口后仍显示"打开"二字，按钮颜色不变，UI 无任何变化 |
| **A4** | ✕ 关标签页→侧栏点 session→无反应 ✅ |
| **A5** | 点标签页→标签栏高亮变了但主区内容不变 ✅ |
| **B4** | 部分确认——欢迎页点终端→侧栏变终端 ✅，但标签页显示"会话已失效"（非"蹦空白标签页"——用户侧栏本就在插件市场，主区只有欢迎页） |
| **E1** | ✕ 关标签页→直接关了无确认 ✅。额外发现：关闭标签页后通过开始菜单打开终端→串口仍在运行（标签页关了但串口没断） |
| **E2** | 标签栏 [+] → 点终端 → 创建"终端"标签页显示"会话已失效" ✅。用户问：是不是归一化问题？ |
| **E3** | 创建对话1+对话2 → 用侧栏返回对话1不行（A5 联动问题已确认）→ Ctrl+Shift+P 复制→确实复制出内容。额外发现：两个会话连接同一 COM 口；再插一个 COM 口→两个标签页都强制变成新端口，切不回旧端口 |
| **E4** | 全部复现成功。用户认为和多视图共用 COM 口有关 |
| **E5** | 卸载终端→侧栏两个会话条目仍在 ✅，主屏标签页消失 ✅。重装后→欢迎页点终端→发现串口仍开着，数据正常收发（卸载时未关串口） |
| **E8** | UTF-8 改 GB2312→汉字不变乱码（应乱码）✅ |
| **G1** | 分屏合屏→标签页消失 ✅ |
| **G3** | F5 刷新→侧栏清空→新建 Terminal-1→弹出标签页→关闭只关新建的，刷新前的不关（之前已修过标签页 ID 碰撞） |
| **G7** | Monaco 按 Enter→无反应→点发送按钮正常 ✅ |
| **G10** | 3 面板拖拽目标错误 ✅ |
| **G14** | 复杂变体——图标栏点插件市场不打开插件市场标签页（只能通过欢迎页→开始→插件市场）。详情页卸载→图标栏消失 ✅，待安装出现 ✅。重装后详情页刷新 ✅ |
| **G21** | 发日志文件。暂停 8 秒缓冲 105 条→继续后全部补回。数据速率太低（13行/秒），bug 的 16ms 过渡窗口碰不到。需高速率（115200 波特率）才能触发 |
| **G22** | 输入 0→变 1000 ✅。用户问：是之前的保护措施吗？ |
| **G23** | 拔掉所有 COM 口→下拉框仍显示 COM3→点打开→Rust 报错"系统找不到指定的文件"。Rust 正确拒绝了，但下拉框没刷新为空。**和原分析不同——根因从"前端校验缺失"调整为"端口列表轮询后 UI 未同步清空"** |
| **G16** | 手动移到 .disabled→10s 无变化→需 F5 手动刷新 ✅ |

### ⚠️ 部分确认（2 个）

| Bug | 用户反馈 |
|:--|------|
| **A2** | 改名不串扰 ✅（改一个不影响另一个）。但**标签栏标题不跟着改名** ❌——这是 bug 清单未覆盖的新现象（只说了串扰，没说标签栏不同步） |
| **B4** | 见上——行为存在但不完全匹配 bug 清单描述 |

### ✅ 已修复（1 个）

| Bug | 用户反馈 |
|:--|------|
| **G9** | 不符合——卸载后状态栏+图标栏全部消失，重装后显示。用户说"应该是之前修过，你看 git 历史"。需查 git 确认是哪个 commit 修的，以及代码归一性是否有问题 |

### ❓ 待确认（0 个——G12/G23 已重新归类）

| Bug | 用户反馈 |
|:--|------|
| **G12** | 改 version 为 "1.beta"→软件内版本变为 1.beta。用户："我不知道在你看来这属不属于"——非法 semver 被显示为字面量（1.beta）而非映射为 1.0.0。`compareVersions` 的比较 bug 只在版本比对时触发（如检查更新），正常使用不可见。留到 Phase 6 统一引入 semver 校验 |

### ⚠️ 日志无法确认（1 个）

| Bug | 用户反馈 |
|:--|------|
| **G21** | 发日志文件。暂停 8 秒缓冲 105 条→继续后全部补回。数据速率太低（13行/秒），bug 的 16ms 过渡窗口碰不到（13×0.016≈0.2行）。需 115200 波特率（300+行/秒）才能触发。代码级分析认为 bug 存在，实测无法验证 |

### ⚠️ 条件不足无法复现（7 个）

| Bug | 原因 |
|:--|------|
| **A6** | 测不了——当前只有一个协议（bracket） |
| **G2** | 无法测——当前无 dirty flag 系统（Phase 6 才有） |
| **G4** | 不会看状态栏 rx/tx——用户说"若代码有问题，你改就行了" |
| **G5** | 看不懂 Concurrent Mode——用户说不会测 |
| **G6** | 同上 |
| **G8** | 不会测——需 Rust invoke 失败条件 |
| **G11** | Shift+拖拽复制标签页用不了 |
| **G13** | 无法测——Phase 7 plugin:// 协议才暴露 |

### 📄 代码级问题无法感知（3 个——已在复现手册标注）

| Bug | 性质 |
|:--|------|
| **E6** | tabActions 永远不会为 null |
| **E7** | activeSessionId 始终有值 |
| **E9/E10** | 仅性能差异，不可感知 |

### 🔍 未测（12 个——G 类代码级 + 视觉类）

G15/G17/G18/G19/G20/G24 + E6/E7/E9/E10 + D1-D5（已修复）+ C1/C2（架构级，C1 是所有多标签页 bug 的根因）

---

## 🔴 A 类——数据完整性问题（session 数据错误/串扰）

### A1. 新建会话的快捷发送不新鲜——从旧 session 串过来了　✅ 复现确认

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

### A2. 改一个会话的名 → 另一个会话名也变了　⚠️ 部分复现——串扰未发生，但标签栏标题不同步

**现象：** 侧栏中把"新对话1"改名为"新对话" → "新对话2"也跟着变成了"新对话"。标签栏标题不变（仍显示旧名）。

> **🟡 2026-07-22 Encaron 实测：** 改名不串扰 ✅（改"新对话1"→"新对话2"不变）。但**标签栏标题不跟着改名** ❌——`handleRename` 更新了 session.name 但 tab.label 没更新。这确认了"可能原因 A"。**可能原因 B（同 ID 串扰）未复现。**

**根因分析（待定位）：**

可能原因 A——标签栏标题不同步：`sidebar.tsx` `handleRename` 只更新了 `session.name`（`updateSession(id, { name })`），没有同步更新标签栏的 `tab.label`。需要调用 `tabIdentity` 或标签栏更新机制。　✅ **已确认**

可能原因 B——两个会话名同时变：`updateSession` 逻辑确认无误（按 ID 匹配），但如果两个 session 的 ID 相同（旧代码创建的 session 用自增计数器，与 tab 系统计数器不同步），`_sessions.map` 会同时匹配到两个。　❌ **未复现**

**修法：**
1. `handleRename` 中调用 TabActions 更新标签栏标题（需要 `updateTabLabel` API）
2. 确认 session.id === tab.id 一一对应（A3 相关）

---

### A3. 两个终端会话的 COM 口同步——选 COM13 两个都变，选不回 COM3　✅ 复现确认（连同 B1）

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

### A4. 标签栏 ✕ 关标签页后，侧栏点 session 不能重开标签页 ❌ 行为缺失　✅ 复现确认

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

### A5. 标签栏点终端标签页 → 不更新 `_activeSessionId`　✅ 复现确认

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

### A6. 协议选择器是全局单例——影响所有 session　⚠️ 无法复现（当前只有一个协议）

**现象：** 在 session A 里把协议从"方括号"换成别的 → 所有 session 的协议都变了。

**根因：** `ControlPanel.tsx:66-74` `handleProtocolChange` 调 `setActiveProtocol(protocolId)`——这是 `ProtocolRegistry` 的全局 setter（`_activeProtocolId`）。虽然也更新了 `session.protocol`，但全局状态已被覆盖。下次切到另一个 session 时，协议下拉框的值和全局活跃协议不一致。

**修法：** `handleProtocolChange` 不再调 `setActiveProtocol()`。协议的激活/使用按 session 读取（`activeSession.protocol`），不经过全局 `_activeProtocolId`。`ProtocolRegistry` 的 `_activeProtocolId` 仅为无 session 时的 fallback。

---

## 🟡 B 类——UI 状态不同步（显示不反映实际状态）

### B1. 打开串口后侧栏仍显示"未配置"，按钮颜色不变　✅ 复现确认（同 A3）

**现象：** 新建会话 → 打开串口 → 侧栏会话项副标题仍是"未配置"（应显示"115200 · bracket"），ControlPanel 连接按钮仍是灰色（应变为绿色/高亮）。

**根因（同 A3）：** 用户打开端口时 `session.port` 为空串。
- `handleToggleOpen` → `activeSession.port` 为空 → 跳过 sync → `toggleOpen()` 在 `state.portName` 上打开
- 端口实际打开了（`isOpen = true`），但 `connected = isOpen && state.portName === activeSession.port` = `true && "COM3" === ""` = `false`
- 侧栏副标题：`session.port ? ... : "未配置"` → `""` 是 falsy → 显示"未配置"

**修法：** 同 A3 修法 1——`handleToggleOpen` 中自动填充 session.port。

---

### B2. 侧栏点会话不聚焦标签页（实测仍不工作）　✅ 复现确认（C1 根因）

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

### B3. F5 刷新 → 标签页恢复但 session 全丢 → "会话已失效"　✅ 复现确认

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

> ⚠️ **Phase 6 过渡标注：** 此 bug 的根因是会话持久化被设计为 Phase 6 功能（见 `V3-Phase6-终端会话持久化.md`——依赖 Phase 6a FileService + WorkspaceService）。5.5c 提前上线了会话功能但持久化层还没做。方案 A 是 **stopgap**——Phase 6 `SessionService` 上线后，`loadSessions()` 自然恢复会话，F5 后 zombie 标签页问题消失。届时这个临时重建逻辑应被正式的 FileService 加载替换。详见 Phase 6 文档 §八"不做的东西"——短期 stopgap 在 Phase 6 完成时移除。

---

### B4. 欢迎页点终端卡片 → 直接开标签页（不尊重 viewRole）　⚠️ 部分复现

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

---

## 🔴 E 类——第二轮代码审查新发现（2026-07-22）

> 以下 bug 通过完整代码审查发现——从标签栏、终端、插件适配三个维度逐行 trace 所有操作路径。
> 审查覆盖了 `App.tsx` / `useTabManager.ts` / `tabIdentity.ts` / `TabBar.tsx` / `MainContent.tsx` / `SidePanel.tsx` / `WelcomeView.tsx` / `CommandRegistry.ts` / `PluginLifecycle` / `LayoutService` / `SerialContext` / `ProtocolRegistry` 以及 `plugins/terminal/` 下全部 4 个源文件。

### E1. `confirmOnClose` 从 plugin.json 完全被忽略——关闭确认形同虚设　✅ 复现确认

**现象：** terminal 的 `plugin.json` 声明了 `"confirmOnClose": "关闭此标签页将断开串口连接"`，但任何关闭路径都不弹确认。

**根因：** `getTabBehavior()` 在 `useTabManager.ts` 中只在两处被调用：
- L201：`getTabBehavior(type).singleton`——单例去重
- L221：`getTabBehavior(t.type).isFallback`——预览替换

**`confirmOnClose` 从未被任何代码读取。** 全链路分析：

| 关闭路径 | 文件 | 行为 |
|:--|------|------|
| 标签栏 × 按钮 | `TabBar.tsx:357-366` | `closeWithAnimation(tab.id)` → 不检查 confirmOnClose |
| 中键点击标签 | `TabBar.tsx:342-347` | `closeWithAnimation(tab.id)` → 不检查 confirmOnClose |
| Ctrl+W | `App.tsx:610-620` | 只弹 dirty 确认 → 不检查 confirmOnClose |
| 侧栏 ✕ 删会话 | `sidebar.tsx:191-206` | 弹硬编码确认（`"关闭会话「{{name}}」？"`）→ 不读 plugin.json |

**操作路径：**
1. 用户打开终端标签页 + 连接串口
2. 点标签栏 × 或按 Ctrl+W
3. 标签页直接关闭——无任何确认提示
4. 串口仍在后台连接（标签页关了但 `isOpen` 仍在 App state）

**修法：** 三种方案：
- **A（推荐）：** TabBar `closeWithAnimation` 中调 `getTabBehavior(tab).confirmOnClose`——如果存在则弹 `window.confirm`，确认后才调 `onCloseTab`。对标 VS Code：`workbench.editor.closeWithConfirmation`。
- **B：** `reduceCloseTab` 返回 `reason: "confirmOnClose"` 让调用方处理。❌ 状态 reducer 不应包含 UI 逻辑。
- **C：** App.tsx Ctrl+W handler 中加检查。❌ 只有一处，TabBar ×/中键仍需单独处理。

推荐 A——在 TabBar 层统一处理，一处修改覆盖所有 UI 关闭路径。Ctrl+W 也需单独加（因为不经过 TabBar）。

---

### E2. 标签栏 [+] 菜单创建无 session 的终端标签页——僵尸标签页　✅ 复现确认

**现象：** 点标签栏 + 按钮 → 弹出菜单中有"终端" → 点击 → 创建终端标签页，标题"终端"，内容"会话已失效"。

**根因：** `TabBar.tsx:82-91` `PlusMenu` 列出所有 `viewPlugins`（包括 terminal）：
```typescript
const viewPlugins = getViewPlugins();
const items = [
    ...viewPlugins.map((p) => ({
        label: p.manifest.name,
        type: p.pluginId,
    })),
    ...
];
```
点击 → `onCreateTab("terminal")` → `createTab("terminal")` → 创建标签页但不创建 session → TerminalView 的 `activeSession` 为 null → 显示"会话已失效"。

**同根 bug：** B4（WelcomeView 欢迎页卡片不尊重 viewRole）。共同根因：代码在多个地方列出"所有插件"但未按 `viewRole` 过滤。

**操作路径：**
1. 任意标签页打开 → 点标签栏 + 按钮
2. 弹出菜单显示"终端"
3. 点"终端" → 创建空白标签页
4. 标签页内容显示"会话已失效"

**修法：**
1. `PlusMenu` 中过滤：`viewPlugins.filter(p => getViewRole(p.pluginId) !== "sidebarPrimary")`
2. 对标 VS Code：Explorer（sidebarPrimary）不出现在编辑器 [+] 菜单中
3. B4（WelcomeView）同修——`handleShortcutClick` 中检查 `viewRole`

---

### E3. 多 TerminalView 命令处理器竞态——最后一个 mount 的实例赢得所有命令　✅ 复现确认

**现象：** 两个终端标签页（tab A 和 tab B）。tab B 后打开。命令面板执行"清空接收区"→ 清空的是 tab B 的 CM6，即使当前聚焦的是 tab A。

**根因：** `index.tsx:656-798` 每个 TerminalView mount 时通过 `registerCommand("terminal", ...)` 注册 12 个命令 handler。`CommandRegistry.ts:44-52` 重注册时覆盖 handler：
```typescript
if (_commands.has(command.id)) {
    const existing = _commands.get(command.id)!;
    existing.handler = command.handler;
    existing.title = command.title;
    return;
}
```
所有 handler 通过 `terminalCmdRef.current` 引用本地 TerminalView 的 `cmView`/`quickSends` 等。最后一个 mount 的 TerminalView 的 handler 覆盖之前的。

**操作路径：**
1. 新建"新对话1"（tab A，terminal-1）
2. 新建"新对话2"（tab B，terminal-2）——此时 B 的 handler 覆盖 A
3. 点侧栏"新对话1"切回 A
4. Ctrl+Shift+P → "清空接收区" → 清空的是 B 的内容，不是 A

**影响范围：** 全部 12 个终端命令（复制/全选/清空/暂停/快捷发送回填/编辑/删除/清空发送区/导出日志/切换发送模式/切换回显/切换行号）。

**修法：**
- **短期（C1 前）：** 每个 TerminalView 用唯一 namespace 注册命令（如 `terminal-${tabId}`）并在 menu contribution 中也用动态 namespace。❌ 改动大
- **推荐：** C1 修完后，命令 handler 从 `activeSessionId` 对应的 TerminalView 的 ref 读取。或者用 `executeCommand` 传递 `sourceId`，handler 通过 `getSessionById(sourceId)` 找到正确的 view。
- **更简单的方案：** 命令 handler 不持有 cmView ref，而是通过 `document.querySelector` 找到当前活跃的 CM6 实例。❌ hacky

实际上，C1 修复后架构变化：每个 TerminalView 绑定自己的 session（通过 `sourceId`），不再依赖全局 `activeSession`。但命令 handler 的竞态问题依然存在，因为所有 TerminalView 仍共享 `"terminal"` namespace。

**最佳方案：** 命令 handler 改为按 `activeSessionId` 路由——handler 内部检查"当前活跃 session 对应的 TerminalView 是我吗？" 如果不是，委托给正确的 TerminalView。或者更简单的：handler 内用 `getActiveSessionId()` 找到 session，然后通过 session 数据操作（而非直接操作 cmView）。

---

### E4. `_receiveMode` 模块变量多视图冲突　✅ 复现确认

**现象：** TerminalView A 设置 receiveMode="text"，TerminalView B 设置 receiveMode="hex"。串口数据到达时，A 和 B 都显示 HEX 格式。

**根因：** `index.tsx:59` 模块级变量 `let _receiveMode: string = "text"`——所有 TerminalView 实例共享。渲染时每个 TerminalView 写 `_receiveMode = receiveMode`，最后一个渲染者决定值。Tauri event handler（L401）读 `_receiveMode` 决定显示格式。

```typescript
// L59——模块级，所有实例共享
let _receiveMode: string = "text";

// L390——每个 TerminalView 渲染时覆盖
_receiveMode = receiveMode;

// L406——Tauri event handler 读取
const displayText = _receiveMode === "hex" ? toHexDisplay(payload) : payload;
```

**操作路径：**
1. 新建两个终端会话 A 和 B
2. 侧栏切到 B → 收发设置 → 接收模式改为 HEX
3. 侧栏切回 A
4. 发送串口数据 → A 也显示 HEX 格式（因为 B 最后渲染，写了 `_receiveMode = "hex"`）

**修法：** C1 修复后，每个 TerminalView 绑定自己的 session。Tauri event handler 中改为按 session 读取 receiveMode：
```typescript
// 伪代码
useTauriEvent("serial-data", (payload) => {
    const sid = getActiveSessionId();
    if (!sid) return;
    const session = getSessionById(sid);
    const displayText = session?.receiveMode === "hex" ? toHexDisplay(payload) : payload;
    ringBuffer.current.write({...});
});
```
但这样所有 ringBuffer 都会收到数据（当前行为）。正确的做法是：每个 TerminalView 的 Tauri handler 检查"这个数据是给我的吗？"——但串口数据是广播的，没有目标 session。

**从根源上：** `_receiveMode` 改为 `Map<sessionId, receiveMode>`，Tauri handler 遍历所有 session 并为每个 session 的 ringBuffer 写入对应格式的数据。或者更简单：raw 数据始终以原始格式写入 ringBuffer，格式化延迟到 `appendLine` 时（那时已知 session 的 receiveMode）。

---

### E5. 终端插件卸载后 session 状态残留 + 串口未关闭　✅ 复现确认

**现象：** 插件市场卸载终端插件 → toast 提示"已卸载：终端" → 但 `_sessions` 数组仍保留旧数据，`_activeSessionId` 仍指向旧 session。如果串口之前打开着，仍然保持连接。

**根因：** `lifecycle.ts` 的 `onWillUninstall` 消费端清理了 6 个注册表（commands/keybindings/menus/protocols/cards/channels），但**没有调用 `useTerminalSessions` 的 `resetAll()`**。

设计文档 `V3-Phase5.5-设计.md:1146` 明确写了：
```
resetAll() { _sessions = []; _activeSessionId = null; notify(); },
// ← 供 lifecycle 的 onWillUninstall 调用
```

但此接线从未实现。`lifecycle.ts` 不知道 `useTerminalSessions` 的存在（它只处理通用注册表）。

此外，App.tsx 的串口状态（`isOpen`/`portName`/`baudRate`）是 App 级 state，终端插件卸载不影响它。串口在 Rust 后端仍保持连接。

**修法：**
1. `useTerminalSessions.ts` 导出 `resetAllSessions()` 模块级函数（非 hook 方法）
2. 终端插件在 `onWillUninstall` 时订阅 PluginLifecycle 事件 → 调 `resetAllSessions()`
3. 终端插件还应在此事件中关闭串口（如果已连接）：`invoke("close_port")`

或者更通用的方案：
- `PluginLifecycle.onWillUninstall` 中追加消费端：调用 `window.dispatchEvent(new CustomEvent("v3-plugin-cleanup", { detail: { pluginId } }))`
- 终端插件在自身的初始化中 listen 此事件

---

### E6. `handleCreate` 缺少错误处理——tabActions 为 null 或 createTab 返回空时静默失败

**现象：** 如果 `TabActionsContext.Provider` 未挂载（理论上不应该，但防御性代码缺失），点侧栏"+ 新建"无任何反应，无错误提示。

**根因：** `sidebar.tsx:170-181`：
```typescript
const handleCreate = useCallback(() => {
    const n = sessionCountRef.current + 1;
    const name = window.prompt(...);
    if (name && name.trim() && tabActions) {
      const tabId = tabActions.createTab("terminal", { label: name.trim(), pinned: true });
      createSession(name.trim(), tabId);  // ← 如果 tabId 是空字符串呢？
    }
    // tabActions 为 null → 静默跳过，无 toast/console.warn
}, [t, createSession, tabActions]);
```

`reduceCreateTab` 在找不到 targetGroup 时返回 `createdId: ""`（`useTabManager.ts:239`）。虽然正常流程不会触发（targetGroupId 默认 = activeGroupId），但防御性代码缺失。

**修法：**
1. `tabActions` 为 null 时 toast 错误
2. `createTab` 返回空时 toast 错误，不创建 session

---

### E7. `saveQuickSends` 在 `activeSessionId` 为 null 时静默失败

**现象：** 用户在快捷发送栏添加/编辑/删除 → 点击保存 → 无反应。无 toast，无 console.warn。

**根因：** `index.tsx:223-228`：
```typescript
const saveQuickSends = useCallback((updated: Record<string, string>) => {
    if (activeSessionId) {
      updateSession(activeSessionId, { quickSends: updated });
    }
    // activeSessionId 为 null → 静默跳过
}, [activeSessionId, updateSession]);
```

**修法：** `activeSessionId` 为 null 时 `console.warn` + toast 错误提示。

---

### E8. App.tsx 串口操作仍读 ConfigurationService 的 receiveCoding——C4a 后成断引用　✅ 复现确认

**现象：** 用户在侧栏收发设置中将"接收编码"从 UTF-8 改为 GB2312 → 打开串口 → Rust 后端仍以 UTF-8 解码数据。

**根因：** `App.tsx:412-415`：
```typescript
function getReceiveCoding(): string {
    try { return getConfigurationValue<string>("terminal.receiveCoding") ?? "UTF-8"; }
    catch { return "UTF-8"; }
}
```

C4a 将终端 12 项设置从 ConfigurationService 迁移到 per-session（`useTerminalSessions`）。`terminal.receiveCoding` 在 ConfigurationService 中不再有值（无 `registerConfiguration` 注册）。`getConfigurationValue` 返回 undefined → 永远 fallback 到 "UTF-8"。

同时，`ControlPanel.tsx:76-87` `handleToggleOpen` 在打开端口前同步 `portName` 和 `baudRate` 到 SerialContext，但**不同步 `receiveCoding`**。

**操作路径：**
1. 新建会话 → 侧栏收发设置 → 接收编码改为 GB2312
2. ControlPanel 选 COM3 → 点"打开"
3. `ControlPanel.handleToggleOpen` 同步 portName/baudRate → 调 `toggleOpen()`
4. `App.tsx.handleToggleOpen` → `invoke("open_port", { ..., encoding: getReceiveCoding() })` → encoding 始终为 "UTF-8"
5. 串口数据以 UTF-8 解码——GB2312 中文显示乱码

**修法：**
1. `App.tsx.handleToggleOpen` 改为从 `SerialContext` 接收 `encoding` 参数（而非自己读 ConfigurationService）
2. `SerialContext.actions.toggleOpen` 签名改为 `(encoding?: string) => Promise<void>`
3. `ControlPanel.handleToggleOpen` 中同步 `receiveCoding`：`await toggleOpen(activeSession.receiveCoding)`
4. 删除 `getReceiveCoding()` 函数

---

### E9. `appendLine` useCallback 依赖了未使用的 `timestampFormat`

**现象：** 改变侧栏时间戳格式 → `appendLine` 函数引用变化 → rAF drain 循环重启（不必要的性能开销）。

**根因：** `index.tsx:337-375`：
```typescript
const appendLine = useCallback((text, color) => {
    // timestampFormat 未在函数体内使用！
    // 时间戳已在 Tauri event handler 中通过 formatTimestamp(fmt) 生成，
    // appendLine 只负责追加到 CM6 + 添加颜色装饰
}, [timestampFormat, showEcho, separateSystemLog]);  // ← timestampFormat 多余
```

`timestampFormat` 在 deps 中但函数体内未引用。时间戳格式化在 event handler（L401-412）中已完成。

**修法：** 从 deps 中移除 `timestampFormat`。`appendLine` 只在 `showEcho` 或 `separateSystemLog` 变化时才应重建。

---

### E10. 标签栏 TabBar `closeWithAnimation` 依赖了未使用的 `tabs`

**现象：** 标签页列表每次变化（新增/删除/重排）→ `closeWithAnimation` 函数引用变化。

**根因：** `TabBar.tsx:192-201`：
```typescript
const closeWithAnimation = useCallback(
    (tabId: string) => {
      setExitingTabId(tabId);
      setTimeout(() => {
        onCloseTab(tabId);
        setExitingTabId(null);
      }, 120);
    },
    [tabs, onCloseTab]  // ← tabs 在函数体内未使用
  );
```

**修法：** 从 deps 中移除 `tabs`。保留 `[onCloseTab]`。

---

## 🟣 F 类——系统性问题（跨模块、需全局审计）

> 以下不是单个 bug，而是贯穿多个模块的系统性缺陷。每个都需要全局 grep + 逐点审计。

### F1. `viewRole` 未被所有消费端统一过滤——sidebarPrimary 插件泄漏到非侧栏入口

**现象：** 多个"打开视图"的入口列出了所有插件，不区分 viewRole。`sidebarPrimary` 插件（如终端）的本意是"主交互在侧栏，不需要独立标签页"，但它们仍出现在：
- B4：欢迎页快捷卡片 → 点击创建空白终端标签页
- E2：标签栏 [+] 弹出菜单 → 点击创建空白终端标签页

**根因：** 代码中有多处调用 `getViewPlugins()` 列出"所有视图插件"，但各处独立判断（或不判断）viewRole。没有一个统一的"获取可创建为标签页的插件列表"函数。

**潜在受影响点（需全局 grep 审计）：**
- `WelcomeView.tsx:26` — `getViewPlugins()` — **已确认 B4**
- `TabBar.tsx:83` — `getViewPlugins()` (PlusMenu) — **已确认 E2**
- 命令面板的"打开视图"命令列表
- 快捷键绑定的视图切换
- 未来任何新增的"列出所有插件"功能

**修法：**
1. `viewRegistry.ts` 新增 `getTabCreatableViews()`——过滤掉 `viewRole === "sidebarPrimary"` 的插件
2. 所有消费端统一使用此函数，而非各自过滤
3. 对标 VS Code：Explorer 视图不出现在"打开编辑器"命令列表中

---

### F2. `plugin.json` 声明字段与运行时消费脱节——声明了但没人读

**现象：** 插件在 `plugin.json` 中声明了行为，但运行时代码不消费这些声明。已确认案例：
- E1：`tabBehavior.confirmOnClose` —— `getTabBehavior()` 只在 singleton/isFallback 路径被调用，confirmOnClose 从未被读取

**潜在受影响字段（需逐个 grep 审计）：**

| plugin.json 字段 | 注册位置 | 消费端 | 状态 |
|:--|------|------|:--:|
| `tabBehavior.singleton` | `viewRegistry.ts:58` `getTabBehavior()` | `useTabManager.ts:201` | ✅ 已接线 |
| `tabBehavior.isFallback` | `viewRegistry.ts:58` `getTabBehavior()` | `useTabManager.ts:221` | ✅ 已接线 |
| `tabBehavior.confirmOnClose` | `viewRegistry.ts:58` `getTabBehavior()` | **无处消费** | 🔴 E1 |
| `iconLocation` | `viewRegistry.ts:102` `getIconLocation()` | `IconBar.tsx` | ❓ 待验证 |
| `keepSidebarOnFocus` | `viewRegistry.ts:120` `hasKeepSidebarOnFocus()` | `tabIdentity.ts:210` `shouldKeepSidebarOnFocus()` | ❓ 待验证 |
| `statusBar` | `viewRegistry.ts:65` `getStatusBarContributions()` | `StatusBar.tsx` | ❓ 待验证 |
| `viewRole` | `viewRegistry.ts:107` `getViewRole()` | `App.tsx:382` `handleIconClick` | ⚠️ 部分——漏 WelcomeView/TabBar |

**修法：**
1. 全局 grep `getTabBehavior` 的所有调用点 → 确认 singleton/isFallback/confirmOnClose 三个字段都有对应逻辑
2. 全局 grep `getIconLocation` → 确认 IconBar 正确消费
3. 全局 grep `getStatusBarContributions` → 确认 StatusBar 正确消费
4. 全局 grep `getViewRole` → 确认所有"列出插件"的地方都过滤了 sidebarPrimary
5. 对标 VS Code：`package.json` contributes 的每个字段都有对应的 `I*Service` 消费

---

### F3. C4a 迁移不完整——ConfigurationService → session 的数据迁移漏了写路径

**现象：** C4a 将终端 12 项设置从 `ConfigurationService` 迁移到 `useTerminalSessions`（per-session），但迁移只覆盖了**读写设置值的代码路径**（sidebar 写 → session → TerminalView 读），漏了**使用设置值的操作路径**（如打开串口时传 encoding）。

已确认案例：
- E8：`App.tsx:413` `getReceiveCoding()` 仍从 `getConfigurationValue("terminal.receiveCoding")` 读——此 key 在 ConfigurationService 中已无值
- **H3** ✅ 已修复 (`a803bcc`)：`onDidChangeConfiguration` 事件订阅被删除——设置变更不再打印系统消息（"行号显示：开/关"等）。修法：`index.tsx` 用 prevRef 对比恢复 6 项设置的变更提示。

**潜在受影响项（C4a 迁移的 12 项设置逐个审计）：**

| 设置项 | 读写路径（sidebar→session→view） | 操作路径（实际使用时） | 状态 |
|:--|------|------|:--:|
| `receiveCoding` | ✅ session 读写 | 🔴 `App.tsx` 仍读 ConfigurationService | E8 |
| `sendCoding` | ✅ session → `sendCtxRef` | ✅ `useSendData` 从 ref 读 | ✅ |
| `sendMode` | ✅ session → `sendCtxRef` | ✅ `useSendData` 从 ref 读 | ✅ |
| `lineEnding` | ✅ session → `sendCtxRef` | ✅ `useSendData` 从 ref 读 | ✅ |
| `timestampFormat` | ✅ session → `tsFormatRef` | ✅ Tauri event handler 从 ref 读 | ✅ |
| `showEcho` | ✅ session → `showEchoRef` | ✅ `appendLine` 从 ref 读 | ✅ |
| `showLineNumbers` | ✅ session → Compartment | ✅ CM6 effect 从 ref 读 | ✅ |
| `separateSystemLog` | ✅ session → render | ✅ `appendLine` 从 render 值读 | ✅ |
| `autoRepeat` | ✅ session → useEffect | ✅ 定时器 effect 从 render 值读 | ✅ |
| `repeatInterval` | ✅ session → useEffect | ✅ 定时器 effect 从 render 值读 | ✅ |
| `autoClear` | ✅ session → handleSend | ✅ `handleSend` 从 render 值读 | ✅ |
| `receiveMode` | ✅ session → `_receiveMode` | ⚠️ 模块变量——E4 | E4 |

**修法：**
1. 修复 E8：`receiveCoding` 从 session 读 → 传入 `open_port` 的 encoding 参数
2. 修复 E4：`_receiveMode` 模块变量 → 按 session 读取
3. 删除 `App.tsx` 中残留的 `getConfigurationValue("terminal.*")` 调用
4. 删除 `useTerminalSessions.ts` 中 A1 的 `getConfigurationValue("terminal.quickSends")` 临时桥接
5. 全局 grep `getConfigurationValue.*terminal\.` → 确保零残留
6. ✅ H3 已修：全局 grep `onDidChangeConfiguration` 消费端——确认 ConfigurationService 事件订阅也被迁移

---

## 📋 修复优先级（更新）

| 优先级 | Bug | 理由 |
|:--:|------|------|
| 🔥🔥🔥 | **C1** per-tab session 绑定 | 所有多标签页内容混乱的根因。修完 A5、B2、E3、E4 自动消失或大幅简化 |
| 🔥🔥🔥 | **E1** confirmOnClose 忽略 | 用户数据安全——关闭标签页静默断开串口，无任何提示 |
| 🔥🔥 | **A3 + B1** port 不自动填充 | 用户第一个操作就踩到——新建会话→开端口→"未配置" |
| 🔥🔥 | **B3** F5 标签页恢复但 session 丢失 | 用户自然操作——F5 是最常用的刷新方式 |
| 🔥🔥 | **F1** viewRole 未统一消费 | 系统性问题——E2+B4 同根，需全局 grep 审计 |
| 🔥🔥 | **E8** receiveCoding 断引用 | C4a 迁移不完整——用户改编码无效，数据乱码 |
| 🔥🔥 | **A1** 快捷发送串扰 | 数据完整性问题——旧数据漏到新会话 |
| 🔥🔥 | **A4** 标签栏 ✕ 变僵尸 session | 用户自然操作路径——点标签 ✕ 是标准行为 |
| 🔥🔥 | **F3** C4a 迁移遗留残留 | 系统性问题——全局 grep `terminal\.` 清残留 |
| 🔥 | **A5** 标签栏点不更新 activeSession | C1 修完自动消失 |
| 🔥 | **A2** 改名串扰 + 标签栏不同步 | 需同时修 session name → tab label 同步 |
| 🔥 | **E3** 多 TerminalView 命令竞态 | C1 修完后架构变化——需重新设计命令路由 |
| 🔥 | **E4** _receiveMode 多视图冲突 | C1 修完后需改为按 session 读 receiveMode |
| 🔥 | **E5** 插件卸载后 session 残留 | 内存泄漏 + 串口泄漏 |
| 🔥 | **F2** plugin.json 声明脱节 | 系统性问题——需全局审计所有 tabBehavior/statusBar/iconLocation 消费端 |
| 🟡 | **A6** 协议全局单例 | 当前只有一个协议（bracket），暂时不暴露 |
| 🟡 | **C2** 全局串口 | Phase 7 多串口——当前不修 |
| 🟢 | **E6** handleCreate 缺错误处理 | 防御性——正常流程不触发 |
| 🟢 | **E7** saveQuickSends 静默失败 | 防御性——正常流程不触发 |
| 🟢 | **E9** appendLine 多余 deps | 性能——不影响功能 |
| 🟢 | **E10** closeWithAnimation 多余 deps | 性能——不影响功能 |

---

## 🔵 G 类——第三轮深度代码审查（2026-07-22，4 Agent 并行 + 手动交叉验证）

> 审查范围扩展至 Phase 1-5 全部基础设施。4 个 agent 并行审计：
> - Agent 1: `src/` 全部基础设施（硬编码 plugin ID 残留、生命周期泄漏、竞态条件）
> - Agent 2: `plugins/terminal/` 深度——逻辑边界/null 安全/React 规则
> - Agent 3: `useTabManager` / `splitTree` / `TabBar` / `MainContent` / `TabPanePositioner`
> - Agent 4: `pluginLoader/` + `viewRegistry` / `lifecycle` / `IconBar` / `StatusBar` / `PluginDetailView`
>
> 手动交叉验证：`ConfigurationService` / `StorageService` / `ContextKeyService` / `CommandRegistry` / `MenuRegistry` / `KeybindingRegistry` / `CoreEvents` / `RingBuffer` / `useTauriEvent` / `v3Api`

### G1. `reduceUnsplit` 静默销毁被移除面板的全部标签页——数据丢失　✅ 复现确认

**现象：** 用户分屏为左右两个面板，各有一个终端标签页。收起右侧面板 → 右侧标签页和其绑定的 session 全部消失，session 数据无法恢复。

**根因：** `useTabManager.ts:562-579` `reduceUnsplit` 直接 `filter` 掉整个 group：
```typescript
const newGroups = prev.groups.filter((g) => g.id !== groupId);
```
VS Code 对标行为：收起面板时，被收起面板的标签页应合并到存活面板中。

**修法：** 在 remove group 之前，将该 group 的 tabs 移到 `survivingSiblingGroupId` 对应的 group 中。更新存活 group 的 `activeTabId`。

---

### G2. `reduceForceCloseTab` 形同虚设——dirty 标记从未被清除　⚠️ 无法复现（Phase 6 dirty flag）

**现象：** 用户 Ctrl+W 关闭 dirty 标签页 → 弹"有未保存的修改，确定关闭？"→ 点确定 → 标签页仍然关不掉，静默失败。

**根因：** `useTabManager.ts:361-366` `reduceForceCloseTab` 做浅拷贝 `{ ...prev }` 但不清理 dirty 标记。`reduceCloseTab` 仍然读到 `tab.dirty = true` → 返回 `{ closed: false, reason: "dirty" }`。

**操作路径：** 见 `App.tsx:617-618`——用户确认后的 `forceCloseTab` 从未生效。

**修法：** `reduceForceCloseTab` 中先清零目标 tab 的 dirty：
```typescript
const cleanedGroups = prev.groups.map(g => ({
  ...g, tabs: g.tabs.map(t => t.id === tabId ? { ...t, dirty: false } : t)
}));
return reduceCloseTab({ ...prev, groups: cleanedGroups }, tabId);
```

---

### G3. 模块级计数器与恢复的布局不同步——F5 后 ID 碰撞　✅ 复现确认（部分）

**现象：** F5 刷新 → 布局恢复 `terminal-1`、`terminal-2` → 用户新建会话 → 新 tab ID 也是 `terminal-1`（计数器从 0 开始）→ 两个标签页同 ID → React key 冲突 / closeTab 关错。

**根因：** `tabIdentity.ts:41-51` `_terminalCounter`、`_workspaceCounter`、`_fallbackCounter` 是模块级变量，F5 后重置为 0。但 `LayoutService` 恢复的布局可能包含已被占用的 ID。

**修法：** `reduceRestoreLayout` 恢复后扫描所有 tab ID，提取数字后缀，将对应计数器设为 `max + 1`。

---

### G4. App.tsx 串口统计 `listen()` 未使用 generation counter——StrictMode 泄漏　⚠️ 无法复现（不会看 rx/tx）

**现象：** React StrictMode 或 HMR 下，`serial-stats` 的第一个 Tauri listener 泄漏——永不取消。

**根因：** `App.tsx:482-489`：
```typescript
useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<...>("serial-stats", (event) => { ... })
      .then((fn) => { unlisten = fn; }).catch(() => {});
    return () => { unlisten?.(); };
}, []);
```
StrictMode double-mount：第一次 mount 的 `listen()` Promise 未 resolve，cleanup 中 `unlisten?.()` = undefined → 跳过。Promise 后来 resolve → 赋值给已被丢弃的局部变量 `unlisten` → 此 listener 永不取消。

项目已有正确的 `useTauriEvent` hook（带 generation counter），但此处未使用。

**修法：** 替换为 `useTauriEvent("serial-stats", callback)`。

---

### G5. `useTabManager` render 期间修改 ref——违反 React 规则　⚠️ 无法复现（不会测 Concurrent Mode）

**现象：** `useTabManager.ts:748-754` 在组件函数体中直接写 `lastFocusedByType.current`（非 useEffect 内）：
```typescript
for (const tab of tabState.groups.flatMap((g) => g.tabs)) {
    const key = tab.pluginId ?? tab.type;
    if (!lastFocusedByType.current.has(key)) {
      lastFocusedByType.current.set(key, tab.id);
    }
}
```
React Concurrent Mode 下 render 可能被丢弃并重放，ref 状态不可靠。

**修法：** 移到 `useEffect` 中，在 commit 后更新 ref。

---

### G6. `toLayoutData()` 通过 setState hack 读状态——Concurrent Mode 下彻底失效　⚠️ 无法复现（同上）

**现象：** `useTabManager.ts:897-908` `toLayoutData` 用 `setTabState(prev => { data = prev; return prev })` "偷读"当前状态。依赖 updater 同步执行 + `return prev` bail-out。Concurrent Mode 下 updater 可能异步调度 → `data` 仍为 `undefined` → `data!` 非空断言崩溃。

**修法：** 用 `useRef` 存最新 tabState（对标 App.tsx `tabStateRef` 模式），`toLayoutData` 从 ref 读。

---

### G7. Monaco Enter 键 handler 闭包过期——键入文字后 Enter 无反应　✅ 复现确认

**现象：** TerminalView mount 时 Monaco 发送框为空。用户输入 `AT\r\n` 后按 Enter → 无反应，不发送。点"发送"按钮 → 正常发送。

**根因：** `index.tsx:912-933` `handleEditorMount` 仅 Monaco mount 时调用一次。内部 `editor.onKeyDown` handler 捕获了 mount 时的 `handleSend`（此时 `sendValue=""`）。后续 `handleSend` 随 `sendValue`/`autoClear` 变化而重建，但 `onMount` 不重触发 → Enter 键永远调旧的 `handleSend` → `if (!sendValue.trim()) return` 提前退出。

**修法：** `handleSend` 通过 ref 桥接：
```typescript
const handleSendRef = useRef(handleSend);
handleSendRef.current = handleSend;
// handleEditorMount 内：handleSendRef.current()
// deps 改为 []（稳定引用）
```

---

### G8. 插件卸载先执行前端清理再调 Rust——Rust 失败导致前端撕裂状态　⚠️ 无法复现（不会测）

**现象：** 卸载插件 → Rust `invoke("uninstall_plugin")` 失败（权限不足/目录锁定）→ 但前端已清除 iconOrder、注销 config、forceClose 所有标签页、注销 registries → 插件在前端完全消失但文件仍在磁盘 → 用户无法恢复，只能 F5。

**根因：** `loader.ts:729-738` 执行顺序：
1. `cachePluginMetadata("uninstalled")` → 缓存标记已卸载
2. `PluginLifecycle.onWillUninstall.fire()` → 消费端清理 iconOrder/config/registries/tabs
3. `await invoke("uninstall_plugin")` → **可能抛异常**
4. `unregisterViewPlugin()` + `onDidUninstall.fire()` → 只有 invoke 成功才执行

**修法：** 将步骤 1-2 移到 invoke 成功之后。先确认 Rust 操作成功，再清理前端状态。

---

### G9. StatusBar 不响应插件安装/卸载——状态陈旧　✅ 已修复（commit 待查）

> **🟢 2026-07-22 Encaron 实测：** 不符合——卸载终端后状态栏+图标栏全部消失，重装后显示。之前已修过。用户提到需要查 git 确认是哪个 commit 修的，以及代码归一性是否有问题（为什么 bug 清单会误报——说明代码审计时漏了什么）。

**现象：** 插件市场安装新插件 → 图标栏出现新图标 ✅（IconBar 订阅了 `onDidRegister`）→ 但状态栏不更新 ❌（StatusBar 未订阅任何生命周期事件）→ 需要切换标签页等触发父组件重渲染才刷新。

**根因：** `StatusBar.tsx` 渲染时读 `getStatusBarContributions()` 但不订阅 `onDidRegister`/`onDidUnregister`/`onPluginLifecycleChange`。对标 IconBar（`IconBar.tsx:67-71`）已有正确的订阅模式。

**修法：** StatusBar 加 `useEffect` 订阅 `onPluginLifecycleChange`，触发本地 version state 强制重渲染。

---

### G10. `compareVersions` 将非数字段静默当作 0——`"1.beta" == "1.0.0"` 判等　✅ 复现确认

**现象：** 插件版本 `"1.beta.3"` 与 `"1.0.3"` 被 `compareVersions` 视为相等。非标准 semver 字符串被静默接受。

**根因：** `semverUtils.ts:11-19`：`a.split(".").map(Number)` 将非数字转为 NaN。`NaN || 0` → 0。两个不同的版本号被映射到相同的数字数组。

**修法：** 加 `isValidSemver(v)` 校验函数，拒绝非法版本号。Phase 6 引入完整的 semver pre-release 支持。

---

### G11. 标签页拖到其他面板时目标选择随机（3+ 面板）　✅ 复现确认

**现象：** 3 个分屏面板（A/B/C）。从 B 拖标签页到 C → 标签页出现在 A（而非 C）。

**根因：** `TabBar.tsx:253-268` `findOtherContainer` 只返回 `boolean`（鼠标是否在某个 TabBar 上），不返回具体哪个 group。`MainContent.tsx:144` fallback 选第一个非源 group：
```typescript
const otherGroupId = allLeafIds.find((id) => id !== group.id);
```

**修法：** `findOtherContainer` 返回 `string | null`（目标 groupId）。`useDragReorder` 和 `onMoveToOther` 传递此 groupId。

---

### G12. `duplicateTab` ID 碰撞检查只限同组——跨组可能碰撞　⚠️ 无法复现（Shift+拖拽用不了）

**现象：** workspace `workspace-main` 在 Group A → 从 Group B 复制同一个 workspace → 产生同 ID `workspace-main` → 两个标签页同 key。

**根因：** `useTabManager.ts:502`：`if (group.tabs.some(t => t.id === copy.id))` 只检查当前 group，不检查全局。

**修法：** 改为全局检查：`new Set(allTabs(prev).map(t => t.id)).has(copy.id)`。

---

### G13. `loadPluginRuntime` 和 `loadPlugin` 功能不对等——`mode`/`resources` 缺失　⚠️ 无法复现（Phase 7）

**现象：** 运行时（plugin:// 协议）安装的协议插件或资源插件 → `manifest.mode` 和 `manifest.resources` 被忽略 → 协议解析器不注册。

**根因：** `loader.ts:382-459` `loadPluginRuntime` 未处理 `mode` 和 `resources` 字段。`loadPlugin`（line 344-352）有这些检查。同一份 manifest 在不同加载路径下行为不同——V2.6 归一化违规。

**修法：** 将 `mode`/`resources` 处理提取为共享函数，两个加载路径统一调用。

---

### G14. PluginDetailView 在插件被卸载后不刷新——用户看到幽灵详情页　✅ 复现确认（复杂变体）

> **🟡 2026-07-22 Encaron 实测——额外发现更深的 bug：** 图标栏点"插件市场"图标**不打开插件市场标签页**——只切换侧栏显示已安装/内置列表，主区不变。要打开插件市场标签页**只能通过欢迎页→开始→插件市场**。这本身可能是一个独立的 bug（图标栏的插件市场点击行为不符合预期）。

**现象：** 用户打开插件 X 的详情页 → 另一个标签页中卸载插件 X → 详情页仍显示"已安装 ✓"，卸载按钮仍可见。

**根因：** `PluginDetailView.tsx:42-44` `installedIds` 用 `useMemo(..., [])`——空 deps，永远不更新。组件不订阅 `onDidUnregister`。

**修法：** 订阅 `onDidUnregister` → 过滤 `pluginId` 匹配 → 触发 re-render。

---

### G15. Toast 撤销操作——动态 import loader 无错误处理　📄 代码级（无法感知）

**现象：** 卸载插件 → toast "已卸载：终端 [撤销]" → 点撤销 → 模块加载失败时静默失败。

**根因：** `lifecycle.ts:136-141`：`import("./loader").then(...)` 无 `.catch()`。dynamic import 失败时撤销操作无反馈。

**修法：** 加 `.catch(() => pushToast({ message: "撤销失败，请重试", severity: "error" }))`。

---

### G16. 文件监控不检测已删除的插件目录——删除后插件仍存活　✅ 复现确认

**现象：** 手动删除插件目录 → 插件在 UI 中仍然存在（图标栏、已加载列表）→ 直到 F5 才消失。

**根因：** `loader.ts` `startPluginWatcher` 只检测 NEW 插件（在文件系统中但不在 `loadedPluginIds`），不检测反向：已加载但文件系统已删除。

**修法：** 每次轮询时比对：`loadedPluginIds` 中有但文件系统中没有 → 触发 disable/uninstall 流程。

---

### G17. `isSidebarPrimaryView` 死代码——被 `getViewRole` 替代但未删除

**现象：** `viewRegistry.ts:115-117` 定义的函数，全代码库零调用。

**根因：** Phase 5.5a 引入 `getViewRole()` 作为统一入口，但旧的 `isSidebarPrimaryView()` 未清理。

**修法：** 删除函数。

---

### G18. `CoreEvents` 5 个 Emitter 实例——定义但从未使用（死代码）

**现象：** `CoreEvents.ts:59-74` 定义了 `onDidChangeConfiguration`、`onDidChangePortState`、`onDidChangeTheme`、`onDidChangeActiveTab`、`onDidReceiveData` 共 5 个 Emitter——全代码库零订阅。

与当前仍活跃的 `CUSTOM_EVENTS`（window.dispatchEvent 模式）形成两套事件系统共存的局面。

**修法：** Phase 6 迁移或用 TODO 标注。当前应加 `// Phase 6: migrate CUSTOM_EVENTS to CoreEvents` 注释。

---

### G19. `formatTimestamp` 函数两份拷贝——归一化违规

**现象：** `useSendData.ts:51-59` 和 `index.tsx:1192-1200` 有完全相同的 `formatTimestamp` 实现。

**修法：** 提取到 `src/utils/timestamp.ts`，两处删除重复代码。

---

### G21. rAF drain 循环 pause→unpause 过渡期数据丢失　⚠️ 日志无法确认（数据速率不够触发条件）

> **🟡 2026-07-22 Encaron 实测：** 发了日志文件。暂停约 8 秒，缓冲 105 条数据，继续后全部补回（"补回暂停期间的 105 条数据"）。日志看不出丢失。原因：数据速率太低（约 13 行/秒），而 bug 的丢失窗口约 16ms——13 行/秒 × 0.016 秒 ≈ 0.2 行，概率上基本不会触发。需要在 115200 波特率下（每秒 300+ 行）才能暴露。**代码级分析认为 bug 存在，但本次实测无法验证。**

**现象：** 用户暂停接收 → 继续接收 → 暂停期间的 1 帧数据（~16ms）丢失。

**根因：** `index.tsx:466-481` `handlePause` 先排空 `pausedBuffer`，再 `setPaused(false)` 触发 React 重渲染。旧 rAF 循环（`paused=true` 闭包）在 effect cleanup 前可能再跑一帧，将数据写入已被清空的 `pausedBuffer`。新 rAF 循环（`paused=false`）启动后不再读 `pausedBuffer` → 这一帧数据永久丢失。

**修法：** `handlePause` 在 `setPaused(false)` 前额外 drain 一次 ringBuffer，确保过渡期数据不丢失。

---

### G22. `repeatInterval` 输入框拒绝 0——`parseInt("0") || 1000` = 1000　✅ 复现确认

**现象：** 用户在间隔输入框输入 0 → 自动变成 1000。

**根因：** `sidebar.tsx:343`：`parseInt(e.target.value) || 1000`。`parseInt("0") = 0` 是 falsy → `|| 1000` 返回 1000。

**修法：** `const v = parseInt(e.target.value); mkSetter("repeatInterval")(isNaN(v) ? 1000 : v)`。

---

### G23. 拔掉所有 COM 口后下拉框不刷新——仍显示已不存在的端口　⚠️ 部分确认（现象和原分析不同）

> **🟡 2026-07-22 Encaron 实测：** 拔掉所有 COM 口 → 新建对话 → 下拉框仍显示 COM3 → 点打开 → Rust 报错"系统找不到指定的文件"。**Rust 正确拒绝了**（端口不存在），但下拉框没有刷新为空——显示了已拔掉的 COM3。
>
> **和原分析的区别：** 原 bug 清单写的是"portName 为空时静默用残留值打开"——但实测发现 Rust 端会报错拒绝，bug 实际上在**前端轮询端口列表后没有清空下拉框**。根因从"前端校验缺失"调整为"端口列表轮询后 UI 未同步清空已消失的端口"。
>
> **操作路径：** 拔掉所有 COM 口 → 2 秒轮询 `list_ports` 返回空列表 → 但 `ports` state 更新后下拉框未正确反映（可能因为 `portName` state 未同步清空）。

---

### G24. CM6 主题含 15+ 处硬编码 rgba 颜色——违反 CSS 变量规则

**现象：** `index.tsx:62-79` 和 `TerminalView.css` 中大量硬编码颜色。

**根因：** CM6 的 `EditorView.theme()` 和 CSS 文件中使用了 `rgba(255,255,255,0.04)`、`#FFD700` 等硬编码值，不响应主题切换。

**修法：** 统一迁移到 CSS 变量（如 `--cm-active-line-bg`、`--paused-banner-color`）。

---

### G20. `StorageService` 跨平台路径 bug——硬编码反斜杠

**现象：** `StorageService.ts:143`：
```typescript
const dir = path.substring(0, path.lastIndexOf("\\"));
```
Windows 以外的平台会得到空字符串或不正确的目录。

**修法：** 用 `@tauri-apps/api/path` 的 `dirname()` 或检查 `/` 和 `\` 两种分隔符。

---

## 📋 最终修复优先级（三轮合并）

| 优先级 | Bug | 类别 | 理由 |
|:--:|------|:--:|------|
| 🔥🔥🔥 | **G1** reduceUnsplit 销毁标签页 | 🔴数据丢失 | 用户分屏后合屏 → 标签页全部消失 |
| 🔥🔥🔥 | **G2** forceCloseTab 形同虚设 | 🔴功能失效 | Dirty 标签页永远关不掉 |
| 🔥🔥🔥 | **C1** per-tab session 绑定 | 🔴架构 | 所有多标签页混乱的根因 |
| 🔥🔥🔥 | **G3** 计数器与布局不同步 | 🔴F5 ID 碰撞 | F5 后新建标签页和恢复的标签页同 ID |
| 🔥🔥🔥 | **E1** confirmOnClose 忽略 | 🔴功能缺失 | 关闭确认机制完全无效 |
| 🔥🔥 | **G7** Monaco Enter 闭包过期 | 🔴功能失效 | 键盘发送是终端核心操作 |
| 🔥🔥 | **G8** 卸载顺序错误 | 🔴撕裂状态 | Rust 失败后前端无法恢复 |
| 🔥🔥 | **A3+B1** port 不自动填充 | 🔴UX | 用户第一个操作就踩到 |
| 🔥🔥 | **B3** F5 session 丢失 | 🔴数据丢失 | 最常用的刷新操作 |
| 🔥🔥 | **E8** receiveCoding 断引用 | 🔴功能失效 | 改编码无效，数据乱码 |
| 🔥🔥 | **F1** viewRole 未统一消费 | 🔴系统性问题 | B4+E2 同根 |
| 🔥🔥 | **G4** Tauri listen 泄漏 | 🔴内存泄漏 | StrictMode 下 listener 泄漏 |
| 🔥🔥 | **G6** toLayoutData hack | 🔴崩溃风险 | Concurrent Mode 下可能崩溃 |
| 🔥🔥 | **G9** StatusBar 不响应 | 🔴UI 不同步 | 插件安装/卸载后状态栏不更新 |
| 🔥🔥 | **G10** 拖拽目标随机 | 🔴功能错误 | 3+ 面板跨组拖拽目标错误 |
| 🔥 | **A4** 侧栏重开标签页 | 🔴UX | 标签栏✕后点 session 无反应 |
| 🔥 | **A1** 快捷发送串扰 | 🔴数据完整 | 旧数据漏到新会话 |
| 🔥 | **A2** 改名不同步标签栏 | 🔴UI | 改 session 名标签栏不变 |
| 🔥 | **E3** 命令竞态 | 🔴功能 | 多 TerminalView 命令操作错窗口 |
| 🔥 | **E4** _receiveMode 冲突 | 🔴功能 | 多视图数据格式取决于最后渲染者 |
| 🔥 | **E5** 插件卸载残留 | 🔴内存泄漏 | Session+串口残留 |
| 🔥 | **F3** C4a 迁移残留 | 🔴完整性 | 全局 grep `terminal\.` 清理 |
| 🔥 | **G5** render 期间改 ref | 🟡并发风险 | Concurrent Mode 不安全 |
| 🔥 | **G11** dupeTab 跨组碰撞 | 🟡ID 碰撞 | 多面板时复制标签页可能碰撞 |
| 🔥 | **G12** semver NaN 判等 | 🟡健壮性 | 非法版本号静默接受 |
| 🔥 | **G13** loadPluginRuntime 不对等 | 🟡归一化 | 两套加载路径功能不一致 |
| 🟡 | **A6** 协议全局单例 | 低风险 | 当前只有一个协议 |
| 🟡 | **C2** 全局串口 | Phase 7 | Rust 端重构 |
| 🟡 | **F2** plugin.json 声明脱节 | 系统性问题 | 全局审计 |
| 🟡 | **G14** PluginDetailView 幽灵页 | UI 延迟 | 卸载后详情页不刷新 |
| 🟡 | **G15** Toast 撤销无错误处理 | 健壮性 | Dynamic import 失败无反馈 |
| 🟡 | **G16** 文件监控单向 | 功能缺失 | 删插件目录不自动卸载 |
| 🟢 | **E6/E7/E9/E10** 防御性/性能 | 低优先级 | 整理时顺手修 |
| 🟢 | **G17** isSidebarPrimaryView 死代码 | 清理 | 直接删除 |
| 🟢 | **G18** CoreEvents 死代码 | 清理 | 加 TODO 或删除 |
| 🟢 | **G19** formatTimestamp 重复 | 归一化 | 提取工具函数 |
| 🟢 | **G20** StorageService 反斜杠 | 跨平台 | 非 Windows 才暴露 |

---

## 📊 三轮审查最终结论

| 审查轮次 | 方法 | 发现 |
|:--|------|:--|
| 第一轮 | 13 条操作路径手动 trace | A 类 6 + B 类 4 + C 类 2 = 12 个 |
| 第二轮 | 17 条路径 + 全文件逐行读 | E 类 10 + F 类 3 = 13 个 |
| **第三轮** | **4 Agent 并行 + 手动交叉验证** | **G 类 20 个** |
| **总计** | **覆盖 15+ 文件、60+ 操作路径** | **45 个活跃 bug（A6+B4+C2+E10+F3+G20）** |

**2026-07-22 最终审查结论：**

> 5.5c 的核心矛盾（C1——TerminalView 单例模式 vs 多标签页）仍是必须最先修的架构缺陷。但本轮审查揭示了一个更深的系统性问题：**Phase 1-5 的基础设施中存在多处"写了但没接线"（CoreEvents、isSidebarPrimaryView、confirmOnClose）、"接错了但没人发现"（forceCloseTab、toLayoutData、Monaco Enter）、"能工作但碰巧"（counter 不同步、ref 在 render 中改）的模式。**
>
> 这些不是 5.5c 引入的新 bug——它们从一开始就存在。5.5c 的多标签页只是放大了已有问题（命令竞态、receiveMode 冲突），而深度审查让隐藏问题浮出水面。
>
> 按 root cause 分类：
> - **代码写了但未接线：** E1（confirmOnClose）、E5（resetAll）、G9（StatusBar）、G17（死代码）、G18（CoreEvents 死代码）
> - **接线了但有逻辑错误：** G1（reduceUnsplit）、G2（forceCloseTab）、G7（Monaco Enter）、G10（拖拽目标）、G12（dupeTab）
> - **碰巧能工作：** G3（counter 不同步）、G4（listen 泄漏）、G5（render 改 ref）、G6（toLayoutData hack）、G20（反斜杠）
> - **迁移不完整：** E8（receiveCoding）、F3（C4a 残留）、G13（loadPluginRuntime 不对等）
> - **架构未跟上：** C1（per-tab 绑定）、E3（命令竞态）、E4（receiveMode 冲突）

---

## 🔍 审查覆盖的操作路径（第二轮扩充）

| # | 操作 | 覆盖？ | 发现 |
|:--|------|:--:|------|
| 1 | 侧栏 + 新建 → 命名 → 回车 | ✅ | A1 快捷发送串扰、B2 focusTab 调用正确但 C1 导致内容不变、**E6 缺错误处理** |
| 2 | ControlPanel 选端口 → 打开 | ✅ | A3+B1 端口不自动填充、A6 协议全局、**E8 receiveCoding 断引用** |
| 3 | 侧栏点会话切换 | ✅ | B2 + C1 所有 TerminalView 共享 activeSession |
| 4 | 标签栏点标签页切换 | ✅ | **A5** handleFocusTab 不更新 _activeSessionId |
| 5 | 标签栏 ✕ 关闭标签页 | ✅ | **A4** 僵尸 session、**E1 confirmOnClose 忽略** |
| 6 | 侧栏 ✕ 删会话 | ✅ | D5 已修——closeTab+removeSession（但确认消息硬编码，非 plugin.json） |
| 7 | 侧栏 F2 / ✎ 改名 | ✅ | A2 待定位 |
| 8 | Ctrl+W 关标签页 | ✅ | 同 A4 + **E1 confirmOnClose 忽略** |
| 9 | F5 刷新 | ✅ | D2 已修——串口状态同步；B3 session 丢失；**E8 receiveCoding 断引用（刷新后 encoding 回 UTF-8）** |
| 10 | 右键菜单复制/全选 | ✅ | D1 已修；**E3 多实例命令竞态（复制/全选可能操作错窗口）** |
| 11 | 命令面板 toggle 命令 | ✅ | D3 已修；**E3 多实例竞态（toggle 可能切换错窗口的设置）** |
| 12 | 快捷发送添加/编辑/删除 | ✅ | A1 串扰、**E7 静默失败（activeSessionId null 时）** |
| 13 | 收发设置区改值 | ✅ | 数据流正确——sidebar write → session → index read；**E4 receiveMode 多视图冲突** |
| 14 | 标签栏 [+] 菜单点终端 | ✅ | **E2** 创建无 session 的僵尸标签页 |
| 15 | 标签栏中键关闭 | ✅ | **E1** confirmOnClose 忽略 |
| 16 | 插件市场卸载终端 | ✅ | **E5** session 残留 + 串口未关闭 |
| 17 | 串口数据到达 | ✅ | **E4** _receiveMode 多视图冲突——数据格式取决于最后渲染的视图 |

---

## 📊 审查结论

**第一轮：13 条操作路径 → A 类 6 个、B 类 4 个、C 类 2 个、D 类 5 个（已修）。共 12 个活跃 bug。**

**第二轮：扩充至 17 条操作路径，逐行 trace App.tsx / useTabManager / tabIdentity / TabBar / MainContent / SidePanel / WelcomeView / CommandRegistry / PluginLifecycle / LayoutService / ProtocolRegistry / SerialContext + plugins/terminal/ 下全部 4 个源文件。新增 E 类 10 个 bug + F 类 3 个系统性问题。**

**活跃 bug 总计：25 个（A 类 6 + B 类 4 + C 类 2 + E 类 10 + F 类 3）。**

**2026-07-22 逻辑澄清：**
> 标签栏 ✕ = 只关视图不删数据（对标 VS Code 关闭编辑器 ≠ 删文件）。侧栏 ✕ = 真正删除 session + 关标签页。A4 是"缺失功能——点 session 应重开标签页"，不是"标签栏关标签页是 bug"。文档已据此修正。

核心矛盾（不变）：5.5c 的 `sidebarPrimary` 启用了多标签页，但 `TerminalView` 仍用 5.5c 之前的单例模式（`activeSession` 是全局 getter）。**C1（per-tab session 绑定）是必须修的架构缺陷**——它是一切多标签页混乱的根源。修完后 A5、B2、E3、E4 自动消失或大幅简化。

**新发现的系统性问题：**
- **viewRole 未被统一消费**：E2（TabBar [+]）、B4（WelcomeView）都是列出所有插件但不按 viewRole 过滤。需要全局 grep 所有 `getViewPlugins()` 调用点并逐一审计。
- **plugin.json 声明与运行时脱节**：E1（confirmOnClose）声明了但无代码消费。需审计所有 tabBehavior/statusBar/iconLocation 等声明字段是否都有运行时消费。
- **C4a 迁移不完整**：E8（receiveCoding 断引用）说明从 ConfigurationService → session 的迁移漏了 App.tsx 的串口操作路径。

---

## 🔗 Bug 依赖关系——复现后的修正（2026-07-22 Encaron 实测）

> 🔥 **修 bug 前先读本节。** 代码审查发现的 49 个 bug 中，许多不是独立事件——有些是同一根因的症状群，有些是一环套一环的因果链。按独立事件逐个修会反复返工。

### 因果链（修前置 → 后置自动消失或可测）

```
C1 (全局 activeSession——🔥 必须第一个修)
  │
  ├── 直接导致 ──→ A5  标签栏点标签页内容不变
  ├── 直接导致 ──→ B2  侧栏点会话主区内容不变
  ├── 直接导致 ──→ E3  命令操作错窗口（A5 挡着所以测不全）
  └── 直接导致 ──→ E4  接收模式多视图冲突

A4 + A5 (侧栏点不开标签页 + 标签栏切不了内容)
  │
  └── 用户被迫走歪路：从"开始菜单"重新打开终端
        │
        └── 暴露了 ──→ E1 链：标签页虽然关了但串口还在跑
                        （用户原文："由此可见，bug是一环套一环的"）

C1 修完后自动回归：
  - A5 消失（TerminalView 不读全局 activeSession）
  - B2 消失（侧栏点会话→focusTab→TerminalView 显示自己的 session）
  - E4 消失（_receiveMode 改按 session 读，不需要模块变量）
  - E3 简化（命令路由改为按 activeSessionId 找对应的 TerminalView）
```

### 症状群（同一根因，一次修改修一片）

| 根因 | 症状群 | 一次修 |
|:--|------|:--:|
| **`session.port` 从不自动填充** | A3（两个会话 COM 口同步）+ B1（侧栏"未配置"）+ G23（空 port 打开） | ✅ |
| **C4a 迁移残留** (F3) | E8（receiveCoding 断引用）+ A1（快捷发送串扰）+ H3（系统消息消失 ✅） | ✅ |
| **viewRole 未统一消费** (F1) | B4（欢迎页僵尸标签）+ E2（PlusMenu 僵尸标签）+ **N2（图标栏不打开插件市场标签页）** | ✅ |
| **串口生命周期无管理** | E1（关闭无确认）+ E5（卸载不关串口）+ **N3（✕ 关标签页串口继续跑）** | 分开修① |
| **多终端共享 COM 口** (C2) | E3（两个会话一个端口）+ **N4（插入新设备两个都强制切换）** + E4（接收模式覆盖） | Phase 7 |

> ① E1/E5 虽然都涉及"断开"，但 E1 在 TabBar/App 层（UI 关闭路径），E5 在 lifecycle/插件层（卸载路径）——两处代码不同，需要分别修。

---

## 🆕 复现中新暴露的 Bug（2026-07-22 Encaron 实测）

> 以下 4 个不在原始 49 个中——代码审计时漏了。

| # | Bug | 为什么审计漏了 | 严重度 |
|:--|------|------|:--:|
| **N1** | 改 session 名→标签栏标题不更新 | A2 审计聚焦"可能原因 B（同 ID 串扰）"，没发现"可能原因 A（标签栏同步缺失）"才是真因 | 🔥 |
| **N2** | 图标栏点"插件市场"→不打开插件市场标签页，只切侧栏 | 审计了 G14（详情页幽灵），但没测图标栏入口——以为图标栏点插件市场和欢迎页效果一样 | 🔥 |
| **N3** | ✕/Ctrl+W 关终端标签页→串口继续跑（后台仍收发） | E1 审计聚焦 confirmOnClose 弹窗缺失，没关注"确认后是否真断开" | 🔥🔥 |
| **N4** | 两个会话连同一 COM 口→插入新设备→两个标签页都强制切到新端口，切不回旧端口 | A3 审计了"端口列表刷新导致下拉框同步"，但没测"插入新 COM 设备"触发路径 | 🔥🔥 |

### N1-N4 根因速查

**N1** — `sidebar.tsx` `handleRename` 只调 `updateSession(id, { name })`，不调 tab 系统的 label 更新。需 `tabActions.updateTabLabel(sessionId, newName)`。

**N2** — `App.tsx` `handleIconClick` 对插件市场的处理可能只 dispatch 了 `openSidebarView` 事件，没有处理"如果已经看到侧栏，点图标应打开标签页"的情况。或者插件市场本身 `viewRole` 声明为 `sidebarPrimary` 导致被过滤——需查 plugin.json。

**N3** — 所有关闭路径（TabBar ✕/Ctrl+W/侧栏✕）只关视图不关串口。对标 VS Code：关闭终端标签页时应自动断开连接。需在 terminal 的 `onWillUnmount` 或 tab 关闭回调中调 `invoke("close_port")`。

**N4** — `SerialContext` 的 2 秒轮询刷新 `ports` 列表→两个 ControlPanel 都重渲染→两个下拉框都显示新列表的第一个端口。根因同 A3（`session.port` 不绑定），但触发路径不同（设备热插拔 vs 初始创建）。

---

## 🤖 执行路线图（复现后修正版）

### 前置准备
1. 读 `CLAUDE.md` + memory `[[phase5.5c-progress]]` + `[[quality-commandments]]` + `[[core-ignorance-principle]]`
2. 读本文件完整 bug 清单 + **本节 bug 依赖关系**
3. 读 `plugins/terminal/` 下全部源文件 + `App.tsx`（handleIconClick/handleFocusTab）+ `TabBar.tsx`
4. 确认 `tsc --noEmit` 零错误 + `vitest run` 全过（151 个）

### 执行顺序（严格——因果链约束）

| 步 | Bug | 为什么这一步 | 预计改动 | 涉及文件 | 验证 |
|:--:|------|------|:--:|------|------|
| **1** | **C1** per-tab session 绑定 | 🔥 7 个 bug 的根因——不先修这个，A5/B2/E3/E4 全挡着测不了 | ~+40/−15 行 | `index.tsx` `useTerminalSessions.ts` `ControlPanel.tsx` `MainContent.tsx` | 两个终端标签页各显示自己的内容 |
| **2** | **A5+B2** 标签页/侧栏切换联动 | C1 修完这两自动消失——验证 C1 修对了 | ~0（C1 附带） | 同上 | 侧栏点会话→主区切换；点标签页→主区切换 |
| **3** | **E8** receiveCoding 断引用 | C4a 迁移残留——改编码无效是用户高频操作 | ~+10/−5 行 | `App.tsx` `ControlPanel.tsx` `SerialContext.tsx` | 改接收编码→开端口→中文编码正确 |
| **4** | **B3** F5 session 恢复 | F5 是最常用操作，当前标签页在但 session 丢（半截状态） | ~+15 行 | `useTerminalSessions.ts` + `App.tsx` | F5 后标签页+session 同步恢复 |
| **5** | **A3+B1+G23** port 自动填充（症状群） | 用户第一个操作就踩到——新建→开端口→"未配置" | ~+5 行 | `ControlPanel.tsx` | 新建→开端口→侧栏显示端口信息+按钮变色 |
| **6** | **A1** 快捷发送清理 | 删迁移桥接——新会话只应有默认 AT | ~−20 行 | `useTerminalSessions.ts` | 新会话只有默认 AT 快捷发送 |
| **7** | **F1 症状群** B4+E2+N2 viewRole 统一消费 | 三个入口都漏了 viewRole 过滤——一次 `getTabCreatableViews` 修三处 | ~+10 行 | `viewRegistry.ts` `WelcomeView.tsx` `TabBar.tsx` `App.tsx`（N2） | 欢迎页/PlusMenu/图标栏不出现 terminal 标签页 |
| **8** | **E1** confirmOnClose 接线 | 关闭确认机制完全无效——用户数据安全 | ~+15 行 | `TabBar.tsx` `App.tsx`（Ctrl+W） | 关终端标签页→弹确认框 |
| **9** | **A4** 侧栏重开标签页 | 用户自然操作——✕ 关标签页后点 session 应重开 | ~+10 行 | `sidebar.tsx` | 标签栏✕关→侧栏点→标签页重开 |
| **10** | **A2+N1** 改名同步标签栏 | A2（串扰）未复现，但 N1（标签栏不同步）是新发现 | ~+15 行 | `sidebar.tsx` + `TabActionsContext.ts` + `App.tsx` | 改名后标签栏标题同步更新 |
| **11** | **E3+E4** 命令竞态 + receiveMode | C1 修完后架构允许——命令按 activeSessionId 路由、receiveMode 从 session 读 | ~+20/−10 行 | `index.tsx` | 多标签页命令操作正确窗口 |
| **12** | **E5+N3** 串口生命周期 | E5（卸载不关）+ N3（关标签页不关）——两处代码但同一原则：视图消失=断开 | ~+15 行 | `lifecycle.ts` `useTerminalSessions.ts` `index.tsx` | 卸载/关标签页→串口自动关闭 |
| **13** | **F2** plugin.json 声明审计 | confirmOnClose 已接线（步 8），审计剩余字段消费端 | ~+5 行 + grep | `iconLocation`/`keepSidebarOnFocus`/`statusBar` | grep 确认每个字段都有消费端 |
| **14** | **F3** C4a 迁移残留清理 | E8+A1 已修（步 3+6），删最后残留 | ~−10 行 | `App.tsx` `useTerminalSessions.ts` | grep `terminal\.` 零残留 |
| **15** | **G1** reduceUnsplit 数据丢失 | 分屏合屏→标签页全部消失（数据丢失） | ~+15 行 | `useTabManager.ts` | 合屏后标签页合并到存活面板 |
| **16** | **G7** Monaco Enter 键 | 终端核心操作——Enter 发送无效 | ~+5 行 | `index.tsx`（ref 桥接） | Monaco 按 Enter→发送 |
| **17** | **G3** 计数器与布局同步 | F5 后 ID 碰撞 | ~+10 行 | `tabIdentity.ts` `useTabManager.ts` | F5 后新建不碰撞 |

### 后续批次（步 18+）

| 步 | Bug | 理由 |
|:--:|------|------|
| 18 | G10 拖拽目标错误 | 3+ 面板时跨面板拖拽目标随机 |
| 19 | G14 插件详情页幽灵 | 卸载后详情页不刷新 |
| 20 | G22 repeatInterval 0→1000 | `||` 陷阱——和 H2 同根 |
| 21 | G21 暂停/继续丢数据 | rAF drain 过渡期 |
| 22 | G16 文件监控单向 | 删目录不自动卸载 |
| 23 | G4 串口统计 listen 泄漏 | 改用 useTauriEvent |
| 24 | G5 render 期间改 ref | 移入 useEffect |
| 25 | G6 toLayoutData setState hack | 改用 ref |
| 26 | G19 formatTimestamp 归一化 | 提取工具函数 |
| 27 | G20 StorageService 反斜杠 | 跨平台 |
| 28 | G12 dupeTab 跨组碰撞 | 全局 ID 检查 |
| 29 | G15 Toast 撤销 catch | 防御性 |
| 30 | G17/G18 死代码清理 | isSidebarPrimaryView + CoreEvents |

### 每一步完成后机械验证
```bash
npx tsc --noEmit    # 零错误
npx vitest run      # 151 测试全过
git diff --stat     # 确认只动了该动的文件
```

### 不做的事
- ❌ A6（协议全局单例）——当前只有一个协议（bracket），不暴露
- ❌ C2 + N4（全局串口 + 热插拔切换）——Phase 7 Rust 端重构
- ❌ 重写 TerminalView——只改 session 绑定层，不改 CM6/Monaco/数据管道核心逻辑
- ❌ E6/E7（防御性错误处理）——正常流程不触发，低优先级
- ❌ E9/E10（多余 deps）——不影响功能，整理时顺手修
- ❌ G9 StatusBar——已修复（App 重渲染级联自然生效），需确认归一性后决定是否加固
- ❌ G12 semver——用户实测 "1.beta" 显示为字面量而非映射为 1.0.0，说明当前行为是可接受的（不静默改写），Phase 6 引入完整的 semver 校验即可
- ❌ G2 forceCloseTab——Phase 6 dirty flag 系统引入后再测

### 完成标准
- tsc 零错误 + 151 测试全过
- 用户双击跑验收清单全部通过
- 标签栏 × = 弹确认框（如有 confirmOnClose）→ 关视图 + **断开串口** ✅
- 侧栏 × = 弹确认 → 删 session 关标签页 ✅
- 侧栏点 session = reopen 标签页 ✅
- 侧栏改名 → 标签栏标题同步更新 ✅
- F5 后标签页恢复 + session 自动重建 + receiveCoding 正确 ✅
- 欢迎页 / [+] 菜单 / 图标栏不出现 terminal 标签页（sidebarPrimary 过滤）✅
- 多标签页时命令操作正确的 TerminalView ✅
- 卸载终端插件 → session 清空 + 串口关闭 ✅
- 关终端标签页 → 串口断开 ✅
- 两个终端标签页各连各的端口（当前限制：同一 COM 口；Phase 7 多端口）✅
- `grep -r 'getConfigurationValue.*terminal\.' src/` 返回空 ✅
- `grep -r 'getViewPlugins()' src/` 每个调用点都审计过 ✅
