# Phase 4 设计评审与改进

> 2026-07-19。对 Phase 4 现有设计的全面评审——逐条讨论、逐条给出方案、逐条修改现有文档。
> 关联：[V3-Phase4-插件系统与UI重构设计.md](V3-Phase4-插件系统与UI重构设计.md) / [V3-Phase4-终端插件化设计.md](V3-Phase4-终端插件化设计.md) / [V3-Phase4-欢迎页设计.md](V3-Phase4-欢迎页设计.md)

---

## 目录

1. [总体结论](#1-总体结论)
2. [问题 1：Vite 动态 import](#2-问题-1vite-动态-import)
3. [问题 2：二进制协议 Rust 加载](#3-问题-2二进制协议-rust-加载)
4. [问题 3：Tab.type 泄漏核心概念](#4-问题-3tabtype-泄漏核心概念)
5. [问题 4：欢迎页不是插件](#5-问题-4欢迎页不是插件)
6. [问题 5：多终端数据管道](#6-问题-5多终端数据管道)
7. [问题 6：状态栏动态化时机](#7-问题-6状态栏动态化时机)
8. [问题 7：插件开发体验](#8-问题-7插件开发体验)
9. [问题 8：recentWorkspaces 空字段](#9-问题-8recentworkspaces-空字段)
10. [问题 9：handleSend 耦合](#10-问题-9handlesend-耦合)
11. [问题 10：插件详情页格式](#11-问题-10插件详情页格式)
12. [现有文档修改清单](#12-现有文档修改清单)

---

## 1. 总体结论

设计方向正确，无需推翻。以下 10 个问题是对细节的深化——每个都有具体方案和文档修改产出。

**核心原则（用户反复强调）：**
- 精工匠造，慢工出细活——不为了省事埋雷
- AI 友好——一个概念一个名字，一份数据一个源头
- 归一化——不引入新文件格式、新存储位置、新注册机制
- 不能出 v2.6 那种"大规模返工"——架构接口要想清楚再动手

---

## 2. 问题 1：Vite 动态 import

### 现状

原设计文档 §4 列了 A/B/C 三种方案但未做选择。

### 讨论

所谓"动态 import"问题本质是：`plugins/terminal/index.tsx` 是 React 组件，核心壳如何加载它？

| 方案 | 通俗理解 | 加新插件要重启吗？ |
|---|---|---|
| A: `import.meta.glob` | 和 `src/` 下文件一样，构建时打包进 bundle | 要（重新构建） |
| B: Tauri asset 协议 | 运行时当外部资源按需加载 | 不用 |
| C: npm workspace | 每个插件是独立包，构建时一起编译 | 要 |

### 结论：构建时打包 + 运行时加载——双路径

**对标 VS Code 的实际行为：** 用户装 Claude Code 插件——市场点安装 → 图标栏出现 → 点进去 → 即刻使用，没重启。中文语言包才需要 Reload。区别在于：Claude Code 的 `.vsix` 里是编译后的 JS，Extension Host 直接加载；语言包改的是主窗口 UI 字符串，必须 Reload 才能全量刷新。

**本软件对标这个体验：**

| 来源 | 格式 | 加载方式 | 要重启吗？ |
|---|---|---|---|
| 出厂预装（终端/设置/欢迎页） | 源码 `.tsx`，构建时随 `vite build` 打包 | `import()` 构建产物 | 不——已在 bundle |
| 插件市场安装（`.v3p`） | 编译后的 `plugin.js` | Tauri fs 读取 → Blob URL → `import()` | **不**——对标 VS Code 装扩展 |
| 开发中改插件源码 | 源码 `.tsx`，Vite HMR | HMR 热更新 | 不——保存即生效 |
| 拖入源码文件夹（社区开发者分享） | 源码 `.tsx`，未编译 | 需重新 `vite build` | 要——和 VS Code 装源码扩展需 `npm run compile` 一样 |
| 纯 JSON（主题/语言） | `.json` | Tauri fs watch + 热注册 | 不——即拖即用 |

**关键设计：插件市场分发的是编译后的 JS，不是源码。** 和 VS Code 的 `.vsix` 一样——用户拿到的是可立即执行的产物，不需要构建步骤。

### 实现：双路径加载

```typescript
// src/pluginLoader/runtimeLoader.ts

// 路径 1：构建时已知的插件 → 直接 import 构建产物
// Vite 把 plugins/ 下每个插件独立打包为 dist/plugins/<pluginId>.js
async function loadBuiltinPlugin(pluginId: string) {
  const module = await import(`/plugins/${pluginId}.js`)
  return module.default
}

// 路径 2：运行时安装的插件（.v3p 解压后）→ 读文件 → Blob URL → import
// 对标 VS Code Extension Host 加载 .vsix 中的编译产物
async function loadRuntimePlugin(pluginPath: string) {
  const { readTextFile } = await import('@tauri-apps/plugin-fs')
  const code = await readTextFile(`${pluginPath}/plugin.js`)
  const blob = new Blob([code], { type: 'text/javascript' })
  const url = URL.createObjectURL(blob)
  try {
    const module = await import(url)
    return module.default
  } finally {
    URL.revokeObjectURL(url)
  }
}

// 加载器统一入口
async function loadViewPlugin(pluginId: string): Promise<React.ComponentType<{ isActive: boolean }> | null> {
  // 先尝试构建产物路径
  try { return await loadBuiltinPlugin(pluginId) } catch {}
  // 再尝试运行时路径（.v3p 安装的）
  try { return await loadRuntimePlugin(`plugins/${pluginId}`) } catch {}
  return null
}
```

### 加载流程（和 VS Code 对标）

```
VS Code                           本软件
───────                           ──────
扩展源码 (src/)                    插件源码 (plugins/*.tsx)
  ↓ npm run compile                  ↓ vite build
编译产物 (out/)                    编译产物 (dist/plugins/*.js)
  ↓ 打包                            ↓ 打包
.vsix (zip)                        .v3p (zip)
  ↓ 市场安装                         ↓ 市场安装 / 拖入
Extension Host import()            运行时 import(Blob URL)
  ↓                                ↓
即时可用 ✅                         即时可用 ✅
```

### 现有文档改动

- `V3-Phase4-插件系统与UI重构设计.md` §4：删 A/B/C 选项列表，替换为本方案
- 技术风险表（`V3-Phase4-终端插件化设计.md` §4 R2）：从"待验证"改为"已解决"

---

## 3. 问题 2：二进制协议 Rust 加载

### 现状

原设计给 binary 协议插件画了 `parser.rs` 放在 Rust 侧——但 Rust 不支持运行时动态加载 `.rs` 文件。

### 讨论

这是一个架构空腔。承认 binary 协议插件在 Phase 4 不可行需要诚实面对。但未来确实需要。

### 结论：Phase 4 只做 text，未来走 WASM

**Phase 4 做的事：**
- 协议插件只实现 `mode: "text"`（前端 `parseLine`）
- `mode: "binary"` 字段保留在 `plugin.json` 规范中，但加载器跳过，toast "二进制协议插件需要更高版本支持"
- 方括号协议保持内置在 `src/core/ProtocolParser.ts`，不急于插件化——等 Phase 5 卡片就绪后第一个真正的协议插件有东西可测

**未来（Phase 6+）的 binary 方案是 WASM：**

```
plugins/protocol-binary-frame/
├── plugin.json    → { "type": "protocol", "mode": "binary" }
├── parser.wasm    → Rust 编译的 WASM（前端执行，近原生性能）
└── index.ts       → WASM 加载器 + parseBinary() 包装
```

WASM 优势：跨平台、前端执行不需 Tauri 侧插件系统、性能近原生。

### 现有文档改动

- `V3-Phase4-插件系统与UI重构设计.md` §7：binary mode 标注 "Phase 6+ WASM 方案"
- `V3-Phase4-插件系统与UI重构设计.md` §9.4：删除 "binary 协议插件目录结构" 中的 `parser.rs`，改为 `parser.wasm`（Phase 6+ 标注）

---

## 4. 问题 3：Tab.type 泄漏核心概念

### 现状

`TabType = "terminal" | "workspace" | "oled" | "settings" | "editor"` 散在核心代码的 20+ 处。

核心代码做的事：
- `type === "terminal"` → 保底（不能关最后一个）
- `type === "settings" | "oled"` → 单例去重
- `renderTabContent()` 硬编码 switch case

如果未来有人写 GPS 地图插件，核心代码需要加新 case——这正是 v2.6 式返工的温床。

### 结论：核心不认插件名，只认行为声明

**`plugin.json` 新增 `tabBehavior` 字段：**

```json
// plugins/welcome/plugin.json
{ "tabBehavior": { "isFallback": true } }

// plugins/settings/plugin.json
{ "tabBehavior": { "singleton": true } }

// plugins/terminal/plugin.json
{ "tabBehavior": { "confirmOnClose": "关闭此标签页将断开串口连接" } }

// plugins/gps-map/plugin.json —— 未来的社区插件
{ "tabBehavior": {} }  // 零特殊行为，核心零改动
```

| 行为 | 含义 | 谁声明 |
|---|---|---|
| `isFallback` | 场上无标签页时自动创建此标签页，且不可关闭 | 只有 welcome |
| `singleton` | 全局只有一个此类型标签页，创建时去重 | 设置 |
| `confirmOnClose` | 关闭前弹出确认对话框，值为提示文本 | 终端 |

**核心代码变化：**

```typescript
// 改前
if (allTabs(prev).length === 1 && tab.type === "terminal") { ... }     // ❌
if (type === "settings" && all.some(t => t.type === type)) { ... }     // ❌

// 改后
const b = viewRegistry.get(tab.pluginId)?.tabBehavior
if (allTabs(prev).length === 1 && b?.isFallback) { ... }               // ✅
if (b?.singleton && allTabs(prev).some(t => t.pluginId === pluginId))  // ✅
```

**Phase 4 过渡态：**

```typescript
interface Tab {
  id: string
  type: string       // 保留——旧布局兼容，旧代码不坏
  pluginId: string    // 新增——核心查 registry 走这个
  label: string
}
```

旧布局恢复时自动补 `pluginId`：`type === "terminal" ? "terminal" : type`。

### 效果

Phase 4 之后任何人写新视图插件，核心代码一行不动。`TabType` union 不新增值，`renderTabContent` 无新 case，`reduceCreateTab` 无新 if。

### 现有文档改动

- `V3-Phase4-插件系统与UI重构设计.md` §2.4 "关键变化" 表格：更新为基于 `tabBehavior` 的方案
- `V3-Phase4-插件系统与UI重构设计.md` §9.2 T8：更新——`type` 保留但不作为规则判断依据
- `V3-Phase4-插件系统与UI重构设计.md` §4 `plugin.json` 字段表：新增 `tabBehavior` 字段说明
- `V3-Phase4-终端插件化设计.md` §2.1 `plugin.json`：新增 `tabBehavior`
- 所有子文档中 `Type = "terminal"` 的硬编码引用：改为走 registry

---

## 5. 问题 4：欢迎页不是插件

### 现状

"一切皆插件"——但欢迎页是核心壳的兜底 UI，不在 `viewRegistry` 里，不在图标栏上，不可卸载。

### 讨论

用户用浏览器新标签页比喻——Chrome 的 `chrome://newtab` 不是扩展，是浏览器壳的一部分。欢迎页同理。

### 结论：确认——欢迎页是核心壳的兜底 UI

- 不注册到 `viewRegistry`
- 不被插件加载器管理
- 不在图标栏出现
- 不可卸载
- 通过 `tabBehavior.isFallback: true` 声明（见问题 3）——核心读这个行为来保底，不是硬编码 `type === "welcome"`

### 现有文档改动

- `V3-Phase4-欢迎页设计.md`：新增一节"为什么欢迎页不是视图插件"——解释壳兜底的职责

---

## 6. 问题 5：多终端数据管道

### 现状

当前架构假设"一个数据源 → 一个 RingBuffer → 多个卡片消费"。终端变成插件后，用户可以打开多个终端标签页（COM3、COM4），每个都是独立数据源。卡片如何知道数据来自哪个终端？

### 结论：Phase 4 留 `sourceId`，Phase 5 启用

**Phase 4 不做实现层面的改动，只留接口：**

```typescript
// 终端标签页创建时，分配 sourceId
interface TerminalTabState {
  sourceId: string  // = tab.id，目前只有一个终端所以用不到
  ringBuffer: RingBuffer
}

// 未来卡片声明数据源绑定（Phase 5）
interface CardDefinition {
  cardId: string
  sourceId: string  // 绑定到哪个终端
}
```

- 每个终端标签页 = 一个独立的数据源实例（自己的 RingBuffer、自己的串口连接）
- 关闭终端 → 检查是否有卡片依赖此 sourceId → 有则警告
- Phase 4 只有一个终端标签页，sourceId 字段是未使用的——但字段已经在那里

### 现有文档改动

- `V3-Phase4-终端插件化设计.md` §3.3：多终端场景描述中加入 sourceId 概念
- `V3-Phase4-插件系统与UI重构设计.md` §3.3 "串口生命周期规则"：补充 sourceId 绑定说明

---

## 7. 问题 6：状态栏动态化时机

### 讨论

最初建议推迟到 Phase 5+。用户反馈：提早规划好不是挺好吗？

### 结论：保留设计，Phase 4 只实现终端需要的部分

```json
// plugins/terminal/plugin.json
{
  "statusBar": [
    { "id": "connection", "icon": "circle-filled", "label": "", "onClick": "focusTerminal" },
    { "id": "txrx", "label": "TX:0  RX:0" }
  ]
}
```

**Phase 4 实现：**
- 状态栏渲染框架支持插件贡献（从左到右：核心全局项 → 插件贡献项）
- 核心全局项：`中:EN`、`☀`、`🔔`
- 终端插件贡献：连接状态 + TX/RX
- `plugin.json` 的 `statusBar` 规范写入文档

Phase 4 只有终端一个插件贡献状态栏，实施量很小——但框架是对的。

### 现有文档改动

- 无需改动（设计文档 §3.6 已经正确）

---

## 8. 问题 7：插件开发体验

### 现状

原设计没有插件开发文档和 `plugin.json` 的 JSON Schema。

### 结论：三份文档 + 一份 Schema

对标 VS Code（`package.json` 规范 + Extension API 文档 + `yo code` 脚手架），本软件不需要脚手架，但需要：

| VS Code 有 | 本软件对标 | Phase 4 |
|---|---|---|
| `package.json` 规范 | `plugin.json` 字段规范 + JSON Schema | ✅ |
| Extension API 文档 | 插件接口契约文档 | ✅ |
| `yo code` 脚手架 | 不需要——建一个文件夹就是插件 | ❌ |

**Phase 4 产出：**

```
docs/插件开发/
├── plugin.json规范.md          ← 每个字段含义、示例、必需/可选
├── 视图插件开发.md              ← { isActive } props / keep-alive / 可用 hooks
├── 协议插件开发.md              ← parseLine() 签名 / detect() 可选方法 / 示例
└── plugin.schema.json          ← JSON Schema，plugin.json 的 $schema 引用它
```

不需要 debugger、不需要 sandbox、不需要 dev tool。四份文件，够了。

### 现有文档改动

- `V3-Phase4-插件系统与UI重构设计.md` §4：`plugin.json` 规范独立为 `docs/插件开发/plugin.json规范.md`
- 新增 `docs/插件开发/` 目录及其内容（Phase 4 Step 1 产出）

---

## 9. 问题 8：recentWorkspaces 空字段

### 现状

原设计在 `prefs.json` 加 `recentWorkspaces: []`，但 Phase 5 才实现 workspace，整个 Phase 4 都是空数组。

### 讨论

用户指出：等终端插件化后，"最近"区域不就可以出现终端了吗？

### 结论：改为 `recentViews`

```json
// prefs.json
{
  "recentViews": ["terminal", "settings", "workspace:pid_tuning"]
  // 不只是 workspace——任何视图都可以是"最近"
}
```

Phase 4 就有用——用户打开终端 → `recentViews` 记录；关闭软件再启动 → 欢迎页"最近"区域出现终端入口。不需要等 Phase 5。

### 现有文档改动

- `V3-Phase4-欢迎页设计.md` §2.2：`recentWorkspaces` 改为 `recentViews`，数据类型改为 `{ pluginId: string; label: string; workspaceName?: string }[]`
- `V3-Phase4-欢迎页设计.md` §3.3：更新交互逻辑——不只是 workspace 能进最近
- `V3-Phase4-数据迁移.md` §1.2：`recentWorkspaces` → `recentViews`

---

## 10. 问题 9：handleSend 耦合

### 现状

`TerminalView.tsx` 的 `performSend`（545 行）同时碰 7 样东西：

```
编码模式 → HEX 校验 → Monaco getValue → 历史记录 → CM6 回显 → 定时发送 → Rust invoke
```

Phase 2.5 尝试拆过 SendBar → 放弃，因为耦合太深。Phase 4 把 TerminalView 搬进 `plugins/terminal/` 只是搬家，没解耦。

### 结论：Phase 4 搬家时同步解耦——提取 `useSendData`

```typescript
// src/core/useSendData.ts —— Phase 4 新建
// 终端用，未来卡片也用，同一份发送逻辑

interface SendPipelineHooks {
  onEcho: (text: string) => void        // CM6 回显 或 卡片自己的显示
  onHistory: (text: string) => void     // 发送历史 或 no-op
  onError: (msg: string) => void        // 错误提示
}

function useSendData(prefs: TerminalPrefs, hooks: SendPipelineHooks) {
  // 返回 { performSend, sendHex, sendText }
  // 逻辑和现在 TerminalView 里的完全一样
  // 但 onEcho / onHistory / onError 由调用方注入
}
```

```typescript
// plugins/terminal/index.tsx —— 终端用
const { performSend } = useSendData(prefs, {
  onEcho: (text) => appendLine(text, "sent"),
  onHistory: (text) => recordHistory(text),
  onError: (msg) => appendLine(msg, "system"),
})

// plugins/card-slider/index.tsx —— 未来卡片用（Phase 5）
const { performSend } = useSendData(prefs, {
  onEcho: (text) => cardRef.current?.showSent(text),
  onHistory: () => {},  // 卡片不需要发送历史
  onError: (msg) => toast(msg),
})
```

**关键：搬家不改逻辑，但 `performSend` 同时提取到 `src/core/`。** Phase 5 卡片接发送能力时零改动——直接 import `useSendData`。

### 现有文档改动

- `V3-Phase4-终端插件化设计.md` §1.3 "完全不动"：`useSendData` 加入列表
- `V3-Phase4-终端插件化设计.md` §3 Step B：新增 B7——提取 `useSendData` 到 `src/core/`
- `V3-Phase4-插件系统与UI重构设计.md` §9.2 T7：标注已在 Phase 4 解决

---

## 11. 问题 10：插件详情页格式

### 现状

原设计有插件详情标签页，但格式未严格定义。

### 讨论

对标 VS Code——点扩展 → 新标签页，有介绍、功能、更新日志、依赖。VS Code 用 `package.json` + `README.md` 两文件。

### 结论：`plugin.json` 本身就是详情页数据源

不引入第二个文件格式。VS Code 的两文件模式（`package.json` + `README.md`）对标后发现本软件插件简单到一份 JSON 够用：

```json
{
  "type": "view",
  "name": "终端",
  "version": "1.0.0",
  "icon": "terminal",
  "iconSource": "codicon",
  "description": "串口数据收发——接收区（CM6）+ 发送栏（Monaco）+ 侧栏设置。\n\n支持文本/HEX 双模式，快捷发送，实时过滤。",
  "author": "官方",

  "changelog": [
    { "version": "1.0.0", "date": "2026-07-19", "changes": ["初始发布"] }
  ],

  "tabBehavior": {
    "confirmOnClose": "关闭此标签页将断开串口连接"
  },

  "recommends": [
    { "plugin": "workspace", "reason": "配合卡片可视化数据" }
  ],

  "entry": "index.tsx",
  "sidebar": "sidebar.tsx"
}
```

详情标签页渲染逻辑：

```
插件管理中点"终端"
  → createTab("plugin-detail", { pluginId: "terminal" })
  → PluginDetailView 组件
    → 读 pluginRegistry.get("terminal") → 所有字段已在 plugin.json
    → 渲染：图标 + 名称 + 版本 + 作者 + 描述（支持多行） + 推荐列表 + 更新日志 + [安装/卸载] 按钮
```

**AI 友好：** AI 生成一个插件只需要写 `plugin.json` + `index.tsx`，没有第三种文件格式要学。描述就是 `description` 字段，截图将来在 `screenshots` 数组里加，更新日志就是 `changelog` 数组。

### 现有文档改动

- `V3-Phase4-插件系统与UI重构设计.md` §6.1：详情页布局示例更新——所有信息来自 `plugin.json`
- `V3-Phase4-插件系统与UI重构设计.md` §4 `plugin.json` 字段表：新增 `changelog`、`screenshots`（预留）字段

---

## 12. 现有文档修改清单

以下是在本次评审后需要对现有 5 份设计文档做的具体修改：

### 12.1 `V3-Phase4-插件系统与UI重构设计.md`（主文档）

| 位置 | 改动 |
|---|---|
| §2.4 "关键变化" 表格 | `Tab.type` 方案更新：保留 `type` 作为过渡，新增 `pluginId` + `tabBehavior` |
| §4 插件加载器 | 删 A/B/C 三选一，替换为 `import.meta.glob` 方案；区分 `.tsx`（需重启）和 `.json`（热加载） |
| §4 `plugin.json` 字段表 | 新增 `tabBehavior`、`changelog`、`screenshots`（预留）字段 |
| §7 数据源插件 | binary mode 标注 "Phase 6+ WASM 方案" |
| §9.2 T7 handleSend | 标注已在 Phase 4 解决——`useSendData` 提取 |
| §9.2 T8 Tab.type | 更新——核心不 switch on type，走 registry + tabBehavior |
| §9.4 ~L53 | binary 协议插件目录结构：`parser.rs` → `parser.wasm`（Phase 6+ 标注） |

### 12.2 `V3-Phase4-终端插件化设计.md`

| 位置 | 改动 |
|---|---|
| §1.3 "完全不动" | 新增 `useSendData`（仍不动——提取到 core 而非删除） |
| §2.1 `plugin.json` | 新增 `tabBehavior.confirmOnClose`、`statusBar` |
| §3 Step A | A1-A3 改为 "创建/保底 welcome" 逻辑走 `tabBehavior.isFallback` |
| §3 Step B | 新增 B7——提取 `performSend` 到 `src/core/useSendData.ts` |
| §3.3 多终端场景 | 补充 `sourceId` 概念 |
| §4 风险表 R2 | "待验证" → "已解决——`import.meta.glob`" |

### 12.3 `V3-Phase4-欢迎页设计.md`

| 位置 | 改动 |
|---|---|
| 新增一节 "为什么欢迎页不是视图插件" | 解释壳兜底职责——对标浏览器新标签页 |
| §2.2 `prefs.json` | `recentWorkspaces` → `recentViews` |
| §2.3 "为什么不新建 welcome.json" | 补充：欢迎页是壳 UI，不是插件，但欢迎页上的快捷入口数据来自插件注册表 |
| §5 边界情况 | 新增 W11——安装了 10+ 视图插件时 grid 自动换行 + 垂直滚动 |

### 12.4 `V3-Phase4-数据迁移.md`

| 位置 | 改动 |
|---|---|
| §1.2 Phase 4 `prefs.json` 结构 | `recentWorkspaces` → `recentViews` |
| §1.3 自动迁移逻辑 | 字段名同步 |
| §4 检查清单 | 新增 "`recentViews` 迁移正确" |

### 12.5 `V3-Phase4-测试策略.md`

| 位置 | 改动 |
|---|---|
| §2.1 插件加载器测试 | 新增 L7——`import.meta.glob` 构建产物包含所有视图插件模块 |
| §2.2 插件状态测试 | 新增 S5——`.tsx` 插件新增后需重启生效，`.json` 插件即时生效 |
| §2.3 欢迎页保底测试 | W1—W4 `type` 改为 `pluginId` + `tabBehavior.isFallback` |

### 12.6 新增文件

| 文件 | 内容 |
|---|---|
| `docs/插件开发/plugin.json规范.md` | 所有字段定义、示例、必需/可选 |
| `docs/插件开发/plugin.schema.json` | JSON Schema 文件 |
| `docs/插件开发/视图插件开发.md` | `{ isActive }` 契约、keep-alive、可用 hooks |
| `docs/插件开发/协议插件开发.md` | `parseLine()` / `detect()` 签名 + 完整示例 |

---

*以上方案已和用户逐条讨论确认。Phase 4 设计文档现可据此更新。*
