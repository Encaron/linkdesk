# Phase 4 终端插件化设计

> 2026-07-19。把 TerminalView 950 行单体从核心代码里摘出来，变成 `plugins/terminal/` 下的视图插件。
> 关联：[V3-插件系统与UI重构设计.md](V3-插件系统与UI重构设计.md) / [V3-Phase4-欢迎页设计.md](V3-Phase4-欢迎页设计.md)

---

## 目录

1. [现状分析](#1-现状分析)
2. [目标结构](#2-目标结构)
3. [迁移步骤](#3-迁移步骤)
4. [风险点与对策](#4-风险点与对策)
5. [验证清单](#5-验证清单)

---

## 1. 现状分析

### 1.1 TerminalView 的依赖关系

```
TerminalView.tsx (950 行)
├── CM6 接收区 (cmView ref)                ← 迁移：保持，无变化
├── Monaco 发送栏 (monacoRef)              ← 迁移：保持，无变化
├── handleSend()                           ← 迁移：保持，无变化
│   ├── 编码模式 (Text/HEX)
│   ├── HEX 校验 (AutoFormatHexInput)
│   ├── Monaco getValue
│   ├── 发送历史 (SendHistory)
│   ├── 定时发送 (autoRepeat)
│   ├── CM6 蓝色回显 (appendLine)
│   └── Rust invoke("send_data")
├── RingBuffer 消费 (rAF drainAll)         ← 迁移：保持，无变化
├── useTauriEvent("serial-data")           ← 迁移：保持，无变化
├── 暂停/恢复 (isPaused / buffer)           ← 迁移：保持，无变化
├── 搜索 (SearchBar + CM6 decorations)      ← 迁移：保持，无变化
├── 导出 (showSaveFilePicker)              ← 迁移：保持，无变化
├── 行数裁剪 (MaxLogLines = 2000)          ← 迁移：保持，无变化
├── 快捷发送 (QuickSendBar)                ← 迁移：保持，无变化
├── 实时过滤 (FilterBar)                   ← 迁移：保持，无变化
├── 侧栏设置 (TerminalSidebar)             ← 迁移：保持，无变化
│   ├── 时间戳格式
│   ├── 消息回显 / 行号 / 系统消息
│   ├── 换行符 / 定时发送 / 发送后清空
│   └── 编码 (接收/发送)
├── 系统日志 (SystemLogArea)               ← 迁移：保持，无变化
└── TopBar 串口控制                         ← **迁移到终端内部工具栏（新增）**
    ├── COM 口下拉框 (invoke("list_ports"))
    ├── 波特率选择
    ├── 打开/关闭按钮 (invoke("open_port") / invoke("close_port"))
    └── DTR/RTS toggle（如果有）
```

### 1.2 哪些东西和核心耦合

| 耦合点 | 位置 | 处理 |
|---|---|---|
| `renderTabContent()` 硬编码 `case "terminal"` | `MainContent.tsx` | **删掉。** 改为查 `viewRegistry` |
| `createInitialTabState()` 创建 terminal | `useTabManager.ts` | **改为创建 welcome** |
| `reduceCloseTab()` terminal 保底 | `useTabManager.ts` | **改为 welcome 保底** |
| `reduceRestoreLayout()` 确保至少一个 terminal | `useTabManager.ts` | **改为确保至少一个 welcome** |
| `TabBar.tsx` 最后一个 terminal [×] 清空接收区 | `TabBar.tsx` | **改为 welcome 保底逻辑** |
| TopBar 串口选择/打开按钮 | `TopBar.tsx` | **删 TopBar 文件。** 串口控制移入终端插件 |
| `useTauriEvent("serial-data")` | `TerminalView` | **保留在终端插件内。** 核心只注册命令，不调用 |
| `invoke("send_data")` / `invoke("open_port")` 等 | Rust 端 | **保持不动。** 任何插件都能 invoke——核心只是注册了 Tauri command |

### 1.3 哪些东西完全不动

- `DataConverter.ts` — 纯函数，和串口无关，终端插件继续 import
- `ProtocolParser.ts` — 同上
- `RingBuffer.ts` — 同上
- `PreferenceService.ts` — 同上
- 所有 CSS 变量 — 同上
- i18n 系统 — 同上
- ThemeEngine — 同上
- keep-alive 机制 — 同上
- SplitNode 树 — 同上

### 1.4 Phase 4 同步新建（搬家时一并产出，不单独排）

- **`src/core/useSendData.ts`** — 发送管道 hook。从 `TerminalView.performSend` 提取，`onEcho` / `onHistory` / `onError` 由调用方注入。Phase 5 卡片直接 import 复用
- **`src/core/types.ts`** — `Tab` 新增 `pluginId: string` 字段。`sourceId` 字段预留（= tab.id，Phase 5 卡片绑定数据源用）

---

## 2. 目标结构

```
移动前（Phase 3.5）                         移动后（Phase 4）

src/                                       src/
├── components/                            ├── components/
│   ├── TopBar.tsx          ← 整个文件删除   │   ├── TabBar.tsx
│   ├── TabBar.tsx                          │   ├── MainContent.tsx
│   ├── MainContent.tsx                     │   ├── IconBar.tsx (动态化)
│   ├── IconBar.tsx                         │   └── ...
│   ├── views/                              │
│   │   ├── TerminalView.tsx  ← 移走         plugins/
│   │   ├── TerminalSidebar.tsx ← 移走       └── terminal/
│   │   └── ...                             ├── plugin.json
│   └── ...                                ├── index.tsx      ← TerminalView 内容
├── core/                                  ├── sidebar.tsx    ← TerminalSidebar
│   ├── DataConverter.ts                    ├── toolbar.tsx    ← TopBar 串口控制（移入）
│   ├── ProtocolParser.ts                   └── ...
│   ├── RingBuffer.ts
│   └── PreferenceService.ts               src/ (核心 import terminal)
└── hooks/                                 ├── hooks/
    ├── useTabManager.ts    ← 3 处修改      │   └── useTabManager.ts
    └── ...                                ├── core/
                                           │   └── ... (不动)
                                           └── pluginLoader/
                                               └── viewRegistry.ts  ← 新增
```

### 2.1 plugin.json（终端插件）

```json
{
  "type": "view",
  "name": "终端",
  "version": "1.0.0",
  "icon": "terminal",
  "iconSource": "codicon",
  "description": "串口数据收发——接收区（CM6）+ 发送栏（Monaco）+ 侧栏设置",
  "author": "官方",
  "entry": "index.tsx",
  "sidebar": "sidebar.tsx",
  "tabBehavior": {
    "confirmOnClose": "关闭此标签页将断开串口连接"
  },
  "statusBar": [
    { "id": "connection", "icon": "circle-filled", "label": "", "align": "left", "onClick": "focusTerminal" },
    { "id": "stats", "label": "TX:0  RX:0", "align": "left" }
  ],
  "recommends": [
    { "plugin": "workspace", "reason": "配合卡片可视化数据" }
  ]
}
```

---

## 3. 迁移步骤

### Step A: 核心侧——删耦合 + 改行为声明（~40 行改）

| # | 文件 | 改动 |
|---|---|---|
| A1 | `useTabManager.ts` | `createInitialTabState()` → 创建 welcome（通过 `tabBehavior.isFallback` 查找） |
| A2 | `useTabManager.ts` | `reduceCloseTab()` → terminal 保底改为 welcome 保底（`tabBehavior.isFallback`） |
| A3 | `useTabManager.ts` | `reduceRestoreLayout()` → 确保 welcome 而非 terminal |
| A4 | `MainContent.tsx` | `renderTabContent()` → 删所有硬编码 `case`，走 `viewRegistry.get(tab.pluginId).component` |
| A5 | `TabBar.tsx` | terminal [×] 清空逻辑 → 改为 welcome 保底 |
| A6 | `App.tsx` | `import TopBar` → 删。`import TerminalView` → 删 |
| A7 | `useTabManager.ts` | 单例去重逻辑 → 从 `type === "settings"` 改为 `tabBehavior.singleton` |
| A8 | `useTabManager.ts` | `Tab.type` 保留为过渡字段，新增 `pluginId`；旧布局恢复时自动补 `pluginId` |

### Step B: 终端侧——搬文件 + 解耦（改 import，不改逻辑）

| # | 操作 |
|---|---|
| B1 | 创建 `plugins/terminal/` 目录 |
| B2 | 创建 `plugins/terminal/plugin.json` |
| B3 | `TerminalView.tsx` → `plugins/terminal/index.tsx` |
| B4 | `TerminalSidebar.tsx` → `plugins/terminal/sidebar.tsx` |
| B5 | TopBar 串口控制（`<select> COM口`, `<select> 波特率`, 打开按钮）→ 新建 `plugins/terminal/toolbar.tsx` |
| B6 | 修正 import 路径（`../core/DataConverter` 等 → 相对 `plugins/terminal/`） |
| B7 | **提取 `useSendData`** → `performSend` 逻辑从 `index.tsx` 移至 `src/core/useSendData.ts`，`onEcho`/`onHistory`/`onError` 由终端注入。终端行为和搬家前完全一致，但管道从此独立 |

### Step C: 插件加载器——注册（~150 行新）

| # | 操作 |
|---|---|
| C1 | 新建 `src/pluginLoader/viewRegistry.ts` — `Map<pluginId, { component, tabBehavior, statusBar, ...pluginJson }>` |
| C2 | 新建 `src/pluginLoader/loader.ts` — 启动扫描 `plugins/` → 读 `plugin.json` → Vite 独立打包 + `import()` 运行时加载 → 注册 |
| C3 | 新建 `src/pluginLoader/runtimeLoader.ts` — `import(/plugins/<pluginId>.js)` 加载编译产物 |
| C4 | `vite.config.ts` — 插件独立打包配置（`scanPluginEntries` + `external` 公共库） |
| C5 | `App.tsx` 启动时调 `initPluginLoader()` |
| C6 | `MainContent.tsx` 的 `renderTabContent()` 改为 `viewRegistry.get(tab.pluginId)?.component` |

### Step D: 顶栏移除 + 图标栏动态化（~100 行改）

| # | 操作 |
|---|---|
| D1 | 删 `TopBar.tsx` 和 `TopBar.css` |
| D2 | `App.css` — 删顶栏 grid row，图标栏+侧栏从窗口顶部开始 |
| D3 | `IconBar.tsx` — 删硬编码 `iconTypes`，改为 `usePluginLoader().getViewPlugins()` |
| D4 | 语言/主题按钮 → 移到 `StatusBar.tsx` 右下角 |
| D5 | 通知铃铛 → 新增在 `StatusBar.tsx` |

### Step E: 测试更新（~30 行改）

| # | 操作 |
|---|---|
| E1 | `useTabManager.test.ts` — "默认 1 组 1 终端" → "默认 1 组 1 欢迎页" |
| E2 | `useTabManager.test.ts` — "终端保底不能关" → "欢迎页保底不能关" |
| E3 | `useTabManager.test.ts` — 恢复布局后"确保至少一个终端" → "确保至少一个 welcome" |

---

## 4. 风险点与对策

| # | 风险 | 后果 | 对策 |
|---|---|---|---|
| R1 | TerminalView 的 import 路径批量改错 | CM6/Monaco 加载失败，终端白屏 | 迁移后第一步：验证 CM6 渲染 + Monaco 输入 + Enter 发送。三项通过 = import 正确 |
| R2 | Vite 独立打包 + `import()` 运行时加载 | 已解决——Vite 构建时将 `plugins/` 下入口独立打包，运行时 `import(/plugins/<id>.js)` 加载。开发阶段 HMR 即时生效 | ✅ 方案已定，见 [设计评审](V3-Phase4-设计评审与改进.md#2-问题-1vite-动态-import) |
| R3 | TopBar 串口控制移入终端后，`invoke` 调用路径变化 | 打不开串口 | `invoke` 是全局的——Tauri command 注册在 Rust 端，`invoke("open_port")` 从哪调都一样。不改 Rust 一行代码 |
| R4 | 终端插件文件名/import 和旧测试冲突 | 测试失败 | Step E 只改测试描述和初始状态，不删测试逻辑 |
| R5 | TerminalView 的 Monaco 初始化依赖 TopBar 的某种时序 | Monaco 不渲染 | TopBar 不应该影响 Monaco 初始化——它们是独立的。但如果真出现了，terminal/toolbar.tsx 在 TerminalView mount 时同步初始化 |

---

## 5. 验证清单

```
☐ 启动 V3 → 看到欢迎页（不是空白窗口）
☐ 点 [+] → 选"终端" → 终端标签页打开
☐ 接收区 CM6 正常渲染，等宽字体，行号显示
☐ 发送栏 Monaco 正常渲染，输入文字，Enter 发送
☐ 发送后 CM6 出现蓝色回显行
☐ 接收数据（接 STM32）→ 白色行正常显示
☐ 系统日志正常工作（打开串口 → 灰色消息）
☐ 暂停/恢复 正常
☐ 搜索（Ctrl+F）高亮匹配
☐ 导出日志 正常
☐ 快捷发送药丸 正常
☐ 实时过滤 正常
☐ 侧栏设置：时间戳/回显/行号/换行符/定时发送/编码 → 全部真实生效
☐ 关闭终端标签页 → 确认弹窗 → 串口断开
☐ 卸载终端插件 → 图标栏 📟 消失 → 欢迎页照常 → 插件管理显示 [安装]
☐ 重新安装终端插件 → 📟 回来 → 终端标签页正常
☐ 91 个单元测试全部通过（或更新后的等价测试）
☐ 欢迎页保底：关闭所有标签页 → 欢迎页自动显示
```

---

*先改 20 行核心 + 搬文件 + 验证 CM6 渲染。最坏回滚：git checkout。*
