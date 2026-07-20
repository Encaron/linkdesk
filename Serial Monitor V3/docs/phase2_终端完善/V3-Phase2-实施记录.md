# Serial Monitor V3 开发计划

> 2026-07-18，基于 [V3设计方案.md](../phase1_架构设计/V3设计方案.md) 编写。
> **2026-07-18 修订 1：Step 8（顶栏+状态栏）提前并入 Step 2 布局骨架；i18n 基础设施（react-i18next + t()）从 Step 2 起全量使用。**
> **2026-07-18 修订 2：Phase 重排——Phase 2 改为终端完善（Phase 1 后续），原卡片架构后移到 Phase 3，OLED → Phase 4，设置 → Phase 5。**
> **2026-07-18 修订 3：Phase 重排——Phase 3 改为标签页+分屏系统（卡片的前置基础设施），完整设计拆入独立文档 `V3-Phase3-标签页分屏设计.md`。卡片→Phase 4，OLED→Phase 5，设置→Phase 6。**
## 三、Phase 2：终端完善（Phase 1 后续）

### 为什么 Phase 2 不做卡片

Phase 1 的终端视图**骨架完整但多处有壳无实**：HEX 模式选了不生效、定时发送 toggle 在那没 timer、COM 口枚举写了但没调、发送历史完全没有、行号 toggle 不工作、编码切换不走真实编码器、TX/RX 计数器是硬编码。

对照 V2 收发界面逐项排查后，整理出 **P0 5 项 + P1 7 项 + P2 6 项 = 18 项基础功能**，另有 **4 项新架构红利**（Phase 2 后期可选）。Phase 2 的目标：**用 V3 替代 V2 做日常串口调试。**

**优先级：P0 → P1 → P2 → 🌟 新架构红利。** 先做到和 V2 功能对等并跑通，再做 WPF 做不到的事。

#### ⚠️ AI 友好约束（贯穿 Phase 2 所有实现）

1. **所有用户可配置的数据走 PreferenceService → prefs.json。** 快捷发送预设、终端设置、未来 Command Palette 注册表——AI 改 JSON 就能改配置，不动 React 源码。
2. **快捷发送的 prefs.json 格式必须是平铺 key-value：**
   ```json
   "quickSends": { "AT": "AT\r\n", "查询WiFi": "AT+CWLAP\r\n" }
   ```
   不做嵌套数组——AI 一眼看懂的格式。
3. **PreferenceService 写入时不做格式转换。** 读到什么写回什么——AI 手改的 JSON 不会因为程序重新序列化而变形。
4. **文件监听 → PreferenceService 对比 → UI 自动刷新。** Phase 3 接入 Tauri 文件系统后，AI 改 `prefs.json` 保存 → V3 不重启就生效。和设计方案 §1.5 一致。

### P0 — 真正影响使用

#### 1. 发送历史

V2 有 `RecordSendHistory()`——最近 20 条，下拉菜单回填到发送框。V3 目前输入发送后就没了。

**实施：**
- `SendHistory` 组件：Monaco 发送栏右侧下拉按钮 [+]
- 点击弹出最近 20 条列表，选中回填到发送框
- 上下键（ArrowUp/ArrowDown）在 Monaco 中浏览历史
- 历史存 PreferenceService（内存中，暂不持久化——和 V2 一致）

**参照：** V2 `MainWindow.xaml.cs` 的 `RecordSendHistory` + `btnHistory_Click`

#### 2. COM 口枚举 + 热插拔

Rust `list_ports` 命令已就绪，但 TopBar 硬编码 `COM3`。

**实施：**
- TopBar 挂载时调 `invoke("list_ports")` 填充下拉框
- `setInterval` 每 2 秒刷新端口列表（热插拔检测）
- 当前端口消失 → 自动清空选择 + 系统消息提示

#### 3. HEX 模式真的工作

侧栏有文本/HEX 切换，但 `handleSend` 永远用 `TextEncoder`，接收也永远是文本。

**实施——发送侧：**
- HEX 模式下 `handleSend` 调 `DataConverter.HexToBytes(sendValue)` → 字节写串口
- HEX 输入自动格式化（`AutoFormatHexInput`）：
  - 过滤非法字符（只保留 `[0-9A-Fa-f]`）
  - 大写
  - 每两个字符插一个空格
  - 无效字符出现时显示黄色警告条（V2 `tbHexWarning`）
- HEX 模式下编码选择框禁用（HEX 不需要编码）

**实施——接收侧：**
- `appendLine` 中检查 `receiveMode`
- HEX 模式：`DataConverter.BytesToHex(bytes)` → CM6 显示 hex dump
- 文本模式：保持现有行为

**参照：** V2 `MainWindow.xaml.cs` `AutoFormatHexInput` / `SendRaw` / `OnLineReceived`

#### 4. 定时发送真的工作

侧栏 toggle + 间隔输入框已就绪，但没有 timer 逻辑。

**实施：**
- `useEffect` 监听 `autoRepeat` 和 `repeatInterval`
- `autoRepeat=true` → `setInterval(() => handleSend(), repeatInterval)`
- `autoRepeat=false` → `clearInterval`
- 发送区为空时跳过（不发空内容）

#### 5. 波特率/端口运行时切换

V2 允许不关串口改波特率。V3 TopBar 的 select 没有 onChange 逻辑。

**实施：**
- 波特率下拉框 onChange → `invoke("open_port", { portName, baudRate: newBaud })` 重建连接
- 端口下拉框 onChange → 同上
- 切换期间状态圆点短暂变黄（"切换中"），300ms 后恢复绿
- 重建期间 RingBuffer 不清空（保留切换前的残留数据）

### P1 — 体验缺陷

#### 6. CM6 行号 toggle 生效

侧栏 `showLineNumbers` toggle 存在，但 CM6 `lineNumbers()` 初始化后不能动态关（技术债务 #3）。

**实施：** CM6 `reconfigure`——用 `EditorView.dispatch` 替换 extensions 中的 `lineNumbers()` 插件：
```ts
// 动态开关行号
view.dispatch({
  effects: StateEffect.appendConfig.of(showLineNumbers ? lineNumbers() : [])
})
```
或使用 `Compartment` 包裹 `lineNumbers()` 实现动态替换。

#### 7. 编码切换真的工作

侧栏选了 GBK，收发还是 UTF-8。

**实施——发送侧：**
- `handleSend` 中按 `sendCoding` 选编码器
- UTF-8/ASCII/Latin-1：用 `TextEncoder`
- GBK：前端用 `encoding-rs` WASM 或降级为 Rust 侧 `encoding_rs` crate 编码后返回字节

**实施——接收侧：**
- `appendLine` 中按 `receiveCoding` 调 `DataConverter.BytesToText(bytes, encoding, byteBuffer)`
- GBK 多字节边界处理已在 DataConverter 中实现（从 V2 照搬）

**参照：** V2 `DataConverter.TextToBytes` / `BytesToText`

#### 8. 系统消息 emit

系统消息区域（`SystemLogArea`）已写好但从未收到数据——串口打开/关闭/错误时没有 emit 系统消息。

**实施：**
- Rust 侧：`open_port` / `close_port` 成功后 emit `serial-system` 事件
- 前端 `listen("serial-system")` → `appendLine(msg, "system")`
- 消息内容参照 V2：
  - 打开成功：`"串口 COM3 已打开（115200, 8N1）"`
  - 关闭：`"串口已关闭"`
  - 错误：`"⚠ 串口错误: {message}"`
  - HEX 输入警告：`"⚠ HEX 输入包含无效字符: {...}"`

#### 9. TX/RX 真实计数

状态栏硬编码 `txBytes={1234}` `rxBytes={56789}`。

**实施：**
- Rust `send_data` 成功后 emit 已发送字节数
- Rust 读线程每次读完更新累计字节数，emit 到前端
- 前端维护 `txBytes` / `rxBytes` state，实时更新 StatusBar
- 右键点击状态栏流量 → 重置计数

#### 10. 接收区右键菜单

CM6 已有默认复制/全选，需补充自定义命令。

**实施：**
- CM6 `EditorView.dom` 上监听 `contextmenu` 事件
- 自定义菜单（React Portal 渲染）：复制 / 全选 / 清空 / 暂停
- 菜单样式和暗色主题一致，`border-radius: 6px`，`box-shadow`

#### 11. 快捷发送管理

三个硬编码药丸，[+] 按钮是摆设。

**实施：**
- 快捷发送列表从 PreferenceService 读取（持久化到 prefs.json `quickSends` 字段）
- [+] 按钮 → 弹出输入框（名称 + 内容）
- 右键药丸 → 弹出菜单（编辑 / 删除 / 上移 / 下移）
- 删除前确认（V2 无确认，V3 加一个 toast "已删除 {name}"）
- 药丸支持拖拽排序（可选，P1 先不做）

**参照：** V2 `QuickSend.cs` 387 行

#### 12. CM6 搜索面板替换

CM6 原生搜索面板英文标签、字号偏小、布局复古，CSS 只能覆盖背景色（v3-pitfalls B10）。

**方案：自建 React 搜索条**

不依赖 `search()` 扩展的原生面板 UI。利用 CM6 的 `SearchCursor` 类做程序化搜索 + 已有装饰系统做高亮。

```
┌──────────────────────────────────────────────┐
│ 🔍 [___________]  < 1/15 >  ☑Aa  ☑.*  ×   │  ← React 组件
├──────────────────────────────────────────────┤
│  CM6 接收区（所有匹配高亮 + 当前匹配跳转）      │
└──────────────────────────────────────────────┘
```

**实施：**
- `SearchCursor` 遍历文档找所有匹配位置
- 用已有的 `lineDecoField` 装饰系统标记所有匹配（黄色半透明底）
- 当前匹配用不同颜色（橙色边框）
- Ctrl+F → 打开搜索条，Esc → 关闭，Enter → 下一个匹配
- 大小写敏感 / 正则 两个 toggle
- 匹配计数 `1/15`

**涉及文件：** `src/components/SearchBar.tsx`（新建） + `TerminalView.tsx`（更新）

### P2 — 细节打磨

| # | 项目 | 说明 |
|:--|------|------|
| 13 | **新数据闪烁** | 新行到达时 50ms 半透明蓝底→消失。CM6 decoration 临时加 `background: rgba(0,120,212,0.15)` 然后移除 |
| 14 | **连接状态过渡** | 状态圆点 `transition: background-color 300ms`，灰→绿渐变（目前是瞬间切换） |
| 15 | **DTR/RTS UI** | TopBar 或侧栏加两个 toggle（Rust `set_dtr`/`set_rts` 命令已就绪） |
| 16 | **数据位/停止位/校验** | 串口打开对话框加这三项（V2 有这功能）。Rust `serialport` crate 支持这些参数 |
| 17 | **发送栏多行** | Monaco 单行模式不支持 Shift+Enter 换行。方案 A：切 textarea（丢掉语法高亮，省 150KB）；方案 B：允许 Monaco 扩展到多行（`scrollBeyondLastLine` + `lineNumbers: "off"`） |
| 18 | **📡 协议筛选器** | 按协议类型过滤接收区显示。V2 有 9 种子协议独立开关。V3 先做基础版：全部 / 仅协议消息 / 仅普通文本 |

### 🌟 新架构红利（P0+P1 完成后再做）

以下功能 V2 受限于 WPF 做不起或做不了，V3 的 Web 技术栈让它们变成低成本。**非 Phase 2 核心，不阻塞日常可用目标。**

#### 19. 实时过滤

不是搜索跳转，是 `grep` 式的持续过滤——输入关键字，接收区只显示匹配行，其余全部折叠。删掉关键字全部恢复。

**为什么 V2 做不到：** AvalonEdit 的 DocumentLine 是物理行，隐藏行 = 从文档删除 + 记录位置 + 恢复时插回——hack，不是功能。

**为什么 V3 能做到：** CM6 decorations 可以给不匹配的行 `display: none`。数据全在 document 里，过滤只改变渲染。搭配已有装饰系统，核心逻辑 ~50 行。

**实施：**
```
┌──────────────────────────────────────────────┐
│ 🔍 [POWER________]  ☑Aa  12 行匹配           │  ← React 过滤条
├──────────────────────────────────────────────┤
│  CM6 接收区（仅显示含 POWER 的行，其余折叠）   │
└──────────────────────────────────────────────┘
```
- 输入关键词 → `SearchCursor` 找所有匹配行号
- 不匹配的行用 `Decoration.line({ attributes: { class: "cm-line-hidden" } })` 隐藏
- `cm-line-hidden { display: none; height: 0; }`
- 实时响应用户输入（debounce 150ms），大数据量下也稳定

**涉及文件：** 可复用搜索条组件 + `TerminalView.tsx`

#### 20. 多视图 tab

同一份 RingBuffer 数据，三个渲染镜头：

```
[原始文本] [HEX 视图] [过滤: POWER]
```

三个 tab 是三个独立 React 组件，各自从 RingBuffer drain 副本消费。切 tab 不丢数据、不重建。

**为什么 V2 做不到：** AvalonEdit 单 document 架构——文本和 HEX 切换是清空+重建。三个并行镜头意味着三份文档拷贝+三方同步。

**为什么 V3 能做到：** RingBuffer drainAll 后 Pub/Sub 分发给多个消费者。每个视图组件维护自己的渲染状态。

**实施：**
- RingBuffer 改 `subscribe(listener)` 模式（当前 `drainAll` 是独占消费）
- `TabBar` 组件：三个 tab 按钮 + 高亮当前
- 每个 tab 对应一个 `TerminalTab` 组件实例，各自持有 CM6/虚拟列表 view

#### 21. Command Palette

`Ctrl+Shift+P` → 命令面板，模糊匹配所有操作：

```
> hex
  切换 HEX 模式
  切换 HEX 发送
> clear
  清空接收区
  清空发送区
```

**为什么 V2 做不到：** V2 连搜索都没好好做——`SearchPanel.Open()` 了就没了。命令面板需要命令注册表 + 模糊搜索 + 键盘导航 + 弹出 UI，至少 500 行 WPF。

**为什么 V3 能做到：** React 组件的组合天性。一个 `input` + 扁平命令列表 + `String.includes` 过滤。~100 行。

**实施：**
- `CommandRegistry`：扁平 `{ id, label, category, action }` 数组
- `CommandPalette` React 组件：`useEffect` 监听 Ctrl+Shift+P → 显示 → `input.focus()` → 用户输入过滤 → Enter 执行 → Esc 关闭
- 初始注册所有已有操作：清空接收区、清空发送区、暂停/恢复、导出日志、HEX/文本切换

#### 22. 发送区语法高亮

Monaco Editor 已经在 Phase 1 加载了（~150KB），它的核心能力是语法高亮——目前完全没用上。

注册 V3 协议 tokenizer 后：
```
[chip_temp, 42.5]
 ~~~~~~~    ~~~~
 蓝色(ID)   绿色(数值)

[!blue_led, switch, 蓝色LED]
 ~~~~~~~~   ~~~~~~  ~~~~~~
 粉色(!)    橙色    字符串
```

**实施：**
- Monaco `setMonarchTokensProvider` 注册 V3 协议 language
- 20 行 token 规则：`[...]` 结构 → `id` / `!id` / `number` / `string`
- Phase 7 主题切换时 token 颜色跟着 CSS 变量走

**涉及文件：** `src/languages/v3-protocol.ts`（新建）+ `TerminalView.tsx`（注册 language）

### Phase 2 验证清单

```
☑ COM 口自动枚举，下拉框显示实际 COM 口列表
☑ 定时发送：勾选 → 按间隔自动发；取消 → 停
☑ HEX 发送：输入 "FF 00 AB" → 串口收到 3 字节
☑ HEX 接收：MCU 发字节 → 接收区显示 hex dump
☑ 发送历史：发送一条 → 下拉框出现 → 点击回填
☑ 行号 toggle：侧栏取消勾选 → 行号消失；勾选 → 出现
☑ 编码切换：选 GBK → 收发用 GBK；选 UTF-8 → UTF-8
☑ 系统消息：打开/关闭串口 → 系统消息区显示灰色消息
☑ TX/RX 计数：发 100 字节 → TX 显示 100；收数据 → RX 实时更新
☑ 右键菜单：接收区右键 → 复制/全选/清空/暂停
☑ 快捷发送管理：添加预设 → 点击发送 → 右键编辑/删除
☑ 搜索：Ctrl+F → React 搜索条出现 → 输入关键词 → 匹配高亮 → Esc 关闭
☑ 状态圆点灰→绿 300ms 渐变
⬜ 新数据 50ms 蓝色闪烁（P2 打磨项，不阻塞）
⬜ DTR/RTS UI（Rust 命令就绪，Phase 7 加）
⬜ 数据位/停止位/校验（Rust serialport 支持，需要时加）
☑ 发送栏 Shift+Enter 换行 / Enter 发送

---（🌟 新架构红利，P0+P1 完成后）---
☑ 实时过滤：输入关键字 → 不匹配行折叠 → 删除恢复
⬜ 多视图 tab：原始/HEX/过滤三个 tab（Phase 3 或独立迭代）
☑ Command Palette：Ctrl+Shift+P → 模糊搜索 → 执行命令
☑ 发送区语法高亮：卡片 ID 蓝色 / 数值绿色 / ! 定义粉色
```

