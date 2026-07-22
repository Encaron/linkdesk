# Phase 5.5c 修 Bug 执行计划

> 2026-07-22 制定。2026-07-23 更新进度。
> 小步快走——每步修完 → 立刻测 → 确认无误 → 下一步。
> 发现新 bug → 即时开支线 → 记录 → 回到主线。
>
> **当前进度：主线 步 1-8 ✅ 完成 + B80-B83 ✅ 修复。下一步 → 步 9（E1 关闭确认弹窗）。剩余 7 主线 + 18 后续 = 25 步。**

---

## 🔥 实操发现的新 bug（B80-B83，不在原始 49 个中）

> 2026-07-22/23 Encaron 实测发现。已全部修复并记录。

| # | Bug | commit | 修复日期 |
|:--|------|:--|:--|
| **B80** | 侧栏快速点击丢事件——`onClick`→`onMouseDown`（对标 VS Code Explorer） | `161136b` | 07-22 |
| **B81** | `flushSync` 弯路清理——从 `focusTabBySourceId` 移除此反模式 | `b3b4ed4` | 07-22 |
| **B82** | 删侧栏会话不关标签页/关A删B——ID碰撞 + `closeTabBySourceId` | `4be450a` | 07-23 |
| **B83** | Tauri WebView 禁用 `window.confirm()`→删除无确认（Phase 6 改自定义弹窗） | 暂不修 | 07-23 |
| **B78** | 工作台多实例标签页 id 碰撞（`tabIdentity.ts` 加计数器） | `ba49853` | 07-22 前 |

**B80-B82 新增的通用 API：**
- `TabActions.focusTabBySourceId(sourceId)` — 按 sourceId 聚焦标签页
- `TabActions.closeTabBySourceId(sourceId)` — 按 sourceId 关闭标签页（和 focus 对称）
- 布局恢复后自动同步 `_terminalCounter`（`App.tsx` 启动流程）
- `插件UI写法规约.md` §7：侧栏列表选中用 `onMouseDown`

---

## 执行原则

1. **一步只动一个概念。** 不混修——改 session 绑定就只改 session 绑定，不改编码参数。
2. **每步可独立验证。** 修完立刻有办法确认"修好了"——不需要等到后面步骤。
3. **先修根子后修叶子。** C1 是一切的基础——不先修它，后面测都测不了。
4. **删代码优先于写代码。** 纯删除（A1/F3）零风险，先做。
5. **症状群一起修。** A3+B1+G23 同一根因，一次 commit 解决，不拆三步。
6. **遇阻即停。** 如果某步修完测试不过 → 停止 → 分析 → 可能的开支线。

---

## 主线：15 步

### 第〇批：战前检查（不编号，每次修 bug 前都跑）

```bash
npx tsc --noEmit    # 必须零错误
npx vitest run      # 必须 151 全过
```

---

### 第一批：地基——C1（1 步）

> **为什么这步必须第一个：** C1 修完 → A5/B2 自动消失 → E4/E3 变成可修 → 多标签页场景终于可以正常测试了。不修 C1，后面 6 个 bug 要么没法测要么修了也白修。

#### 步 1：C1 — per-tab session 绑定　✅ 已完成（`3fce64a` `519abfc`）

**做什么：** TerminalView 不再读全局"当前活跃会话"，改为用标签页 ID 找到"属于我这个标签页的会话"。

**改什么：**
- `plugins/terminal/useTerminalSessions.ts` — 新增 `useSession(sourceId)` hook
- `plugins/terminal/index.tsx` — `TerminalView` 改用 `useSession(sourceId)` 而非全局 `activeSession`
- `plugins/terminal/ControlPanel.tsx` — 同

**预计改动量：** ~+40/−15 行

**立刻怎么测：**
1. 新建"会话A"和"会话B"
2. 点标签栏"会话A"→ 主区是不是显示会话A的内容？
3. 点标签栏"会话B"→ 主区是不是显示会话B的内容？
4. 侧栏点"会话A"→ 主区也跟着切吗？

**如果出问题：**
- 旧标签页 sourceId 和 session.id 不匹配 → 开支线：加防御——getSessionById 返回 null 时自动创建 session
- `useSession` hook 不触发重渲染 → 开支线：检查 notify 机制

---

### 第二批：验证 C1 副作用（2 步——只验证，不改代码）

#### 步 2：验证 A5 消失——点标签页内容跟着切　✅ Encaron 实测通过

**测什么：** 两个终端标签页 → 点标签栏切换 → 主区内容跟着变

**预期：** 自动好了。如果没好 → C1 没修对，回步 1。

#### 步 3：验证 B2 消失——侧栏点会话主区跟着切　✅ Encaron 实测通过

**测什么：** 侧栏点"会话B"→ 主区切到会话B

**预期：** 自动好了。如果没好 → 检查 `handleSelectSession` 的 `setActiveSession` 是否正确联动。

---

### 第三批：零风险删代码（1 步）

#### 步 4：A1 — 删快捷发送迁移逻辑　✅ 已完成（`25e48a5`）

**做什么：** 删 `_migratedQuickSends` 模块变量和 `getDefaultQuickSends()` 函数。新会话永远用默认快捷发送。

**改什么：** `plugins/terminal/useTerminalSessions.ts` — 纯删除 ~−20 行

**立刻怎么测：**
1. 新建"测试1"→ 快捷发送栏只有默认 AT → 添加一个 CMD1
2. 新建"测试2"→ 快捷发送栏只有默认 AT（没有 CMD1）
3. 返回"测试1"→ CMD1 还在

**如果出问题：** 几乎不可能——删的是迁移桥接代码，正常流程不经过它。

---

### 第四批：端口症状群（1 步修 3 个）

#### 步 5：A3+B1+G23 — 端口自动填充　✅ 已完成（`182bf93`）

**做什么：** 打开串口时，如果会话还没记录端口号，自动填上。拔掉设备后下拉框正确清空。

**改什么：** `plugins/terminal/ControlPanel.tsx` — ~+5 行

**立刻怎么测：**
1. 新建会话 → 直接点"打开"（不手动选 COM 口）→ 侧栏显示端口信息了吗？按钮变绿了吗？
2. 两个会话各开 COM3 → 各自独立吗？（当前单串口限制——两个会话连同一物理端口是预期行为，Phase 7 前不改）
3. 拔掉所有 COM 口 → 下拉框变空了吗？

**如果出问题：**
- 端口列表轮询和 port 自动填充的时序冲突 → 开支线：检查 SerialContext 2 秒轮询和 handleToggleOpen 的执行顺序

---

### 第五批：设置生效（1 步）

#### 步 6：E8 — 接收编码从会话读取　✅ 已完成（待 commit）

**做什么：** 打开串口时，编码参数从会话的 `receiveCoding` 取，不再从旧配置系统取（那个已经没值了）。

**改什么：** `ControlPanel.tsx` + `SerialContext.tsx` + `App.tsx` — ~+10/−5 行

**立刻怎么测：**
1. 侧栏改接收编码为 GB2312
2. 打开串口
3. MCU 发中文数据 → 乱码了没？（UTF-8 数据用 GB2312 解码 → 应该乱码）
4. 改回 UTF-8 → 中文恢复正常

**如果出问题：**
- `toggleOpen` 签名改了但某处调用没更新 → tsc 会报错
- encoding 参数传到 Rust 但没生效 → 开支线：检查 Rust `open_port` 的 encoding 参数处理

---

### 第六批：入口过滤——基础设施（2 步）

#### 步 7：F1 — 新增 `getTabCreatableViews` 统一过滤函数　✅ 已完成（`d95b460`）

**做什么：** 在 viewRegistry 中新增一个函数——"哪些插件可以作为标签页打开"。后续所有入口都通过它过滤，不再各自手写判断。

**改什么：** `src/pluginLoader/viewRegistry.ts` — ~+5 行

**立刻怎么测：** 这个函数本身不改变行为——只是定义了一个工具。tsc 零错误即可。

**如果出问题：** 几乎没有——只是新增一个导出函数。

#### 步 8：B4+E2 — 所有入口改用 `getTabCreatableViews`　✅ 已完成（`f4e3d0e`）

**做什么：**
- `WelcomeView.tsx` — 欢迎页快捷卡片过滤掉侧栏专属插件
- `TabBar.tsx` — PlusMenu [+] 菜单过滤掉侧栏专属插件
- `App.tsx` — 图标栏点击时检查 viewRole（修 N2）

**改什么：** 三个文件各 ~+3 行

**立刻怎么测：**
1. 欢迎页 → 点终端卡片 → 只开侧栏？没蹦标签页？
2. 标签栏 [+] → 菜单里没有"终端"？
3. 图标栏点"插件市场"→ 打开插件市场标签页了吗？（N2 修复）

**如果出问题：**
- 某个插件从菜单里消失了但用户需要它 → 检查该插件的 viewRole 声明是否正确
- N2（图标栏插件市场）行为仍不对 → 开支线：检查 `handleIconClick` 对插件市场 pluginId 的特殊处理

---

### 第七批：标签页生命周期（3 步）

#### 步 9：E1 — 关闭确认弹窗

**做什么：** ✕ 关标签页 / 中键关 / Ctrl+W → 先检查插件有没有声明"关闭时要确认"→ 有就弹确认框。

**改什么：** `TabBar.tsx` + `App.tsx`（Ctrl+W 路径）— ~+15 行

**立刻怎么测：**
1. 终端标签页连接串口 → 点 ✕ → 弹出"关闭此标签页将断开串口连接"了吗？
2. 点取消 → 标签页没关？
3. 点确定 → 标签页关了？
4. 工作台标签页（没声明 confirmOnClose）→ 点 ✕ → 直接关了？

**如果出问题：**
- `window.confirm` 不够好看 → 记 TODO：Phase 6 换自定义弹窗
- 确认后标签页动画卡住 → 开支线：检查 `closeWithAnimation` 和 confirm 的时序

#### 步 10：A4 — 侧栏重开标签页

**做什么：** 标签栏 ✕ 关标签页后，侧栏点那个会话 → 重新打开标签页（对标 VS Code 点文件重开编辑器）。

**改什么：** `plugins/terminal/sidebar.tsx` — ~+10 行

**立刻怎么测：**
1. 终端标签页开着 → 标签栏 ✕ 关了它
2. 侧栏点那个会话 → 标签页重新打开了？
3. 内容还是原来的会话数据吗？

**如果出问题：**
- `openOrFocusTab` 创建的标签页 ID 和 session ID 不同 → 开支线：需要 `updateSession(oldId, { id: newTabId })` 重新配对

#### 步 11：A2+N1 — 改名同步标签栏

**做什么：** 侧栏改会话名 → 标签栏标题跟着变。

**改什么：**
- `src/hooks/TabActionsContext.ts` — 新增 `updateTabLabel(tabId, label)` API
- `plugins/terminal/sidebar.tsx` — 改名后调 `updateTabLabel`
- `src/hooks/useTabManager.ts` — 实现 `reduceUpdateTabLabel`

**改什么：** 三个文件 ~+15 行

**立刻怎么测：**
1. 侧栏"新对话1"→ F2 改名为"温度监控"
2. 标签栏标签页标题变成"温度监控"了吗？
3. "新对话2"的标题没变吧？

**如果出问题：**
- `updateTabLabel` 不触发重渲染 → 检查 tab state 是否正确返回新引用
- 标签栏标题变了但侧栏没变 → 检查 session.name 和 tab.label 双向同步

---

### 第八批：多标签页正确性——C1 修完后才能做（2 步）

#### 步 12：E4 — 接收模式从会话读取

**做什么：** `_receiveMode` 模块变量删掉——从 session 读接收模式，每个会话独立。

**改什么：** `plugins/terminal/index.tsx` — ~+10/−10 行

**立刻怎么测：**
1. 会话A 设接收模式=文本，会话B 设=HEX
2. 切到会话A → 串口数据以文本显示？
3. 切到会话B → 串口数据以 HEX 显示？

**如果出问题：**
- 所有会话同时收到数据但需要不同格式化 → 开支线：Tauri event handler 广播 raw 数据 → 每个 TerminalView 根据自己的 session.receiveMode 格式化

#### 步 13：E3 — 命令路由到正确的 TerminalView

**做什么：** Ctrl+Shift+P 执行终端命令时，命令作用于"当前活跃会话对应的那个 TerminalView"，而不是"最后一个 mount 的 TerminalView"。

**改什么：** `plugins/terminal/index.tsx` — ~+20/−10 行

**立刻怎么测：**
1. 会话A 和 会话B 两个标签页 → 切到会话A
2. 在会话A 的 CM6 里选中一些文字
3. Ctrl+Shift+P → 复制 → 粘贴到记事本 → 是会话A 的内容吗？
4. 切到会话B → 清空接收区 → 只有会话B 的接收区清空了？

**如果出问题：**
- 命令执行时 activeSessionId 为空 → 加防御：toast 提示"没有活跃的终端会话"
- cmView 已被销毁但 Map 没清理 → 检查 useEffect cleanup

---

### 第九批：串口生命周期——关了就断开（2 步）

#### 步 14：E5+N3 — 标签页关 / 插件卸载 → 断开串口

**做什么：**
- 关终端标签页 → 自动断开串口
- 卸载终端插件 → 自动断开串口 + 清空所有会话

**改什么：** `plugins/terminal/index.tsx` + `plugins/terminal/useTerminalSessions.ts` — ~+15 行

**立刻怎么测：**
1. 打开串口 → ✕ 关标签页 → 确认弹窗 → 确定 → 串口断开了吗？（Rust 状态）
2. 打开串口 → 插件市场卸载终端 → 串口断开了吗？
3. 重装终端 → session 列表是空的吗？（清干净了）

**如果出问题：**
- 关标签页时另一个标签页还在用同一串口 → 当前单串口限制，关就断（和 VS Code 终端行为一致）
- `invoke("close_port")` 异步竞态 → 开支线：Rust 端已有幂等保护（port 为 None 时 no-op），如果仍出问题需检查 Rust 侧

#### 步 15：B3 — F5 刷新后会话自动恢复

**做什么：** 终端插件 mount 时检查——"有没有对应我这个标签页 ID 的会话？"没有就自动创建一个。

**改什么：** `plugins/terminal/index.tsx` — ~+10 行

**立刻怎么测：**
1. 新建"新对话1"→ F5 刷新
2. 标签栏恢复"新对话1"标签页了吗？
3. 内容还是"会话已失效"吗？→ 应该自动创建了会话，显示正常终端界面
4. 侧栏会话列表里有"新对话1"吗？

**如果出问题：**
- 自动创建的会话没有继承刷新前的设置 → 这是预期行为（Phase 6 持久化才恢复设置）
- 多个 TerminalView 同时 mount → 竞态创建多个同名 session → 开支线：加防重创建检查

---

## 支线预案（修主线过程中可能触发）

| 触发条件 | 支线内容 | 优先级 |
|:--|------|:--:|
| 步 1 发现 session 和 tab ID 不匹配 | 加 session-id 一致性防御（`getSessionById` null → 自动创建） | 🔥 |
| 步 8 发现 N2（图标栏插件市场）根因更深 | 可能涉及插件市场自身的 viewRole 声明或 handleIconClick 特殊逻辑 | 🔥 |
| 步 13 发现命令路由在特定场景失效 | 补 cmViewMap 的健壮性（WeakMap + dispose 清理） | 🟡 |
| 步 14 发现串口关闭竞态 | Rust 端 close_port 加更完善的幂等保护 | 🟡 |
| 任何步 tsc 报错 | 停下来先修类型错误——不改逻辑 | 🔥 |
| 任何步 vitest 失败 | 停下来先修测试——可能是测试本身需要更新 | 🔥 |

---

## 第二批（主线 15 步之后——G 类机械修复）

| 步 | Bug | 改动 | 风险 |
|:--:|------|:--:|:--:|
| 16 | G7 Monaco Enter | ~+5 行 ref 桥接 | 低 |
| 17 | G22 0→1000 | ~+1 行 | 零 |
| 18 | G1 合屏丢标签页 | ~+15 行 | 中 |
| 19 | G3 计数器同步 | ~+10 行 | 低 |
| 20 | G10 拖拽目标 | ~+10 行 | 低 |
| 21 | G14 详情页幽灵 | ~+5 行订阅 | 低 |
| 22 | G16 文件监控双向 | ~+10 行 | 中 |

## 第三批（代码质量——无用户感知变化）

| 步 | Bug | 改动 |
|:--:|------|:--:|
| 23 | F2 声明审计 | grep + 补漏 |
| 24 | F3 残留清理 | ~−10 行删除 |
| 25 | G19 formatTimestamp 归一 | 提取公共函数 |
| 26 | G4 Tauri listen 泄漏 | 改用 useTauriEvent |
| 27 | G5 render 改 ref | 移入 useEffect |
| 28 | G6 toLayoutData hack | 改用 ref |
| 29 | G17 删死代码 | 删 isSidebarPrimaryView |
| 30 | G20 跨平台路径 | 反斜杠改 dirname |
| 31 | G15 toast 撤销 catch | ~+3 行 |
| 32 | G12 dupeTab 全局检查 | ~+5 行 |
| 33 | G18 CoreEvents TODO | ~+1 行注释 |

---

## 每步执行模板

```
1. 读相关代码（3 分钟 max）
2. 改（小步，尽量 < 20 行）
3. npx tsc --noEmit  → 零错误
4. npx vitest run    → 151 全过
5. git diff --stat   → 确认只动了该动的文件
6. git commit         → 一条 commit 只修一个概念
7. 告诉用户测什么    → 用户双击验证
8. 用户确认          → 下一步
```

---

## 不做的事（明确排除）

- ❌ 一口气修多个 bug
- ❌ 跳过 tsc/vitest 直接 commit
- ❌ "顺手"修计划外的 bug（发现了记录为支线，回来继续主线）
- ❌ 重构范围超出 bug 修复所需
- ❌ 改 Rust 代码（除步 14 可能需要调 close_port 幂等性）
- ❌ 动 `V3-Phase5.5-设计.md` 的架构决策
