# Phase 5.5 实施计划——Phase 5 验收修复 + 三栏交互对标 VS Code + 终端侧栏重设计

> 2026-07-21。2026-07-21 修订：5 个 Agent 并行审计（[验收报告](../phase5_应用基础设施/V3-Phase5-最终验收报告.md)）发现 4 个 Blocking + 9 个 Quick Wins——必须修在 5.5 功能之前。

> ⚠️ **双 AI 并行协作声明——此文档正在被两个 AI 同时修改。**
>
> - **AI-A（文档设计者）：** 正在重写 §三（5.5c 终端侧栏布局）和 §八（对标 PlatformIO 终端布局）——将 Phase 5 规划阶段的草稿升级为正式执行规格。
> - **AI-B（代码执行者）：** 正在从 5.5-0a 开始逐步修复代码，最终会到达 5.5c。
>
> **如果你是 AI-B：** 在到达 5.5c 之前，如果发现此文档在你两次读取之间内容变了——不要慌，不是你的幻觉，是 AI-A 在同步改。**等你执行完 5.5a+5.5b 之后，重新 Read 一次 §三 和 §八，拿到 AI-A 交付的最终版终端布局规格，再开始 5.5c。**
>
> **如果你是 AI-A：** §三（5.5c）和 §八（终端布局）是你负责的区域。其余章节（⓪ 5.5-0a/0b、一 5.5a、二 5.5b、四 实施顺序、五 Bug 修复、六 通用交互范式、七 不做清单、九 已知问题+验证清单、十 验收修复清单）属于 AI-B 的领地——不要改。

> Phase 4 的三栏交互为终端定制——"图标=标签页，侧栏=设置表单"。
> Phase 5 建了 Settings Editor，终端 12 个设置项可以迁走了。
> Phase 5.5 做四件事（4 层子阶段）：**⓪ Phase 5 验收修复 14 项** → ① `viewRole` 声明替代硬编码（框架层）→ ② `<SidebarSection>` 通用组件（UI 基础设施）→ ③ 终端侧栏重设计（消费者）。

> 🔥 **禁止写死插件 ID——反模式清单。** 以下代码模式在 Phase 5.5 及之后的所有 Phase 中**绝对不能出现**。Phase 5g 已经把 `TabType` 从 8 个联合类型改成 `string`、`BOTTOM_ICONS` 改成 `plugin.json` 的 `iconLocation` 声明——目的就是消灭这些模式。如果执行本 Phase 时想写以下任何一行，停下来——改用 plugin.json 声明。
>
> ```typescript
> // ❌ 禁止——用 plugin.json viewRole 声明替代
> if (pluginId === "terminal") { ... }
> if (pluginId === "file-tree" || pluginId === "marketplace") { ... }
> switch (pluginId) { case "terminal": ...; case "settings": ... }
>
> // ❌ 禁止——用 viewRegistry 查 plugin.json 声明替代
> BOTTOM_ICONS = new Set(["settings"]);
> PLUGIN_ICON_PATH = { terminal: "...", workspace: "..." };
> if (isSidebarOnlyView(pluginId)) { ... }  // ← 5.5a 的目标就是删掉这个函数
>
> // ❌ 禁止——用 ConfigurationService + plugin.json 声明替代
> if (pluginId === "terminal") { setConfigurationValue("terminal.timestampFormat", ...) }
>
> // ✅ 正确——通用路径，不认 pluginId
> const role = getViewRole(pluginId);  // 从 plugin.json 读，不 switch
> const iconLocation = getViewPlugin(pluginId)?.iconLocation ?? "top";  // plugin.json 声明
> const settings = ConfigurationRegistry.getProperties(pluginId);  // 注册表驱动
> ```
>
> **提交前 grep：** `git diff --staged | grep -E 'pluginId === "|case ".*":|BOTTOM_ICONS|PLUGIN_ICON_PATH'` → 必须返回空。

>
> **性质：** 最后一个改框架的 Phase 是 5h。5.5 是 5h→6 之间的桥梁——建好 viewRole 机制后，Phase 6 文件树/Git/数据库浏览器全走 `sidebarPrimary`，不需要再碰 `App.tsx`。
>
> **对标：** VS Code 三栏模型（Activity Bar → Side Bar → Editor）。LinkDesk 在 5.5 后和 VS Code 完全对齐——没有例外。

---

## 子阶段总览

| 子阶段 | 内容 | 性质 | 净行数 | 依赖 |
|:--:|------|:--:|:--:|------|
| **5.5-0a** | **4 Blocking 修复——监听器泄漏/僵尸注册/快捷键误删/semver 重复** | **修复（第一个 commit）** | ~80 | 无 |
| **5.5-0b** | **9 Quick Wins + Prefs 删除——常量提取/LogChannel/cleanup 补漏** | **修复（第二个 commit）** | ~70 | 5.5-0a（Blocking 先修） |
| **5.5a** | `viewRole` 声明系统 | 框架层 | ~50 | 5.5-0b（代码库干净） |
| **5.5b** | `<SidebarSection>` 通用组件 | UI 基础设施 | ~60 | 5.5-0b |
| **5.5c** | 终端侧栏重设计——2 个 SidebarSection（会话列表 + 收发设置），按会话隔离 | 消费者 | ~+40 | 5.5a + 5.5b |

**5.5-0a 必须在最前面——B1 SettingsView 监听器泄漏、B2 6 个 unregister 从不调用、B3 快捷键误删全插件——这三项会让 5.5a-5.5c 的新功能建在错误基础上。** 0b（Quick Wins + Prefs 删除）紧接其后——两个 commit 完成全部 14 项修复，然后从一个 A- 级代码库开始 5.5 核心工作。

---

## ⓪a 5.5-0a — 4 Blocking 修复（第一个 commit，~50 分钟）

> 来源：[V3-Phase5-最终验收报告](../phase5_应用基础设施/V3-Phase5-最终验收报告.md) §四。
> 不修会直接导致 5.5a-5.5c 的新功能出错。先修这 4 个——它们是阻断性的。

### Blocking（4 项）

| # | 问题 | 文件 | 修法 | 验收 |
|:--:|------|------|------|------|
| **B1** | SettingsView `onDidChangeConfiguration` 从不取消订阅——每次 mount 泄漏一个 listener | `SettingsView.tsx:50-54` | cleanup 中调 `unsubscribe()` | mount→unmount→remount×3 → `_changeListeners.size === 1` |
| **B2** | 6 个 `unregister*` 定义但从不调用——卸载插件后命令面板/快捷键/右键菜单残留僵尸数据 | `lifecycle.ts` `initLifecycleConsumers()` | `onWillUninstall` 消费端追加 6 行 import+unregister | 安装含 commands+keybindings+menus 的插件 → 卸载 → 检查各注册表 pluginId 条目为零 |
| **B3** | `unregisterPluginKeybindings(_pluginId)` 参数被忽略——`source === "plugin"`（字符串）会误删所有插件快捷键 | `KeybindingRegistry.ts:131-138` | `_pluginId`→`pluginId`，条件改为 `source === pluginId`（精确匹配） | 注册插件 A+B 快捷键 → 卸载 A → B 的快捷键仍在 |
| **B4** | `versionGte` + `compareVersions` 两处实现相同算法——改一处漏一处 | `loader.ts:83-91` + `viewRegistry.ts:44-52` | 提取到 `semverUtils.ts`，`versionGte` 内部调 `compareVersions` | 现有行为不变 |

### 5.5-0a 验证关卡

```
[ ] npx tsc --noEmit 零错误
[ ] npx vitest run 141+ 测试全过
[ ] 人工：安装有 commands+keybindings+menus 的插件 → 卸载 → 检查命令面板/快捷键/右键菜单无残留
[ ] 人工：SettingsView mount→unmount→remount×3 → _changeListeners.size === 1
[ ] 人工：注册插件 A+B 快捷键 → 调 unregisterPluginKeybindings("A") → A 的被移除、B 的仍在
[ ] git commit: "fix(5.5-0a): 4 Blocking——监听器泄漏/僵尸注册/快捷键误删/semver 归一化"
```

---

## ⓪b 5.5-0b — 9 Quick Wins + Prefs 删除（第二个 commit，~105 分钟）

> Blocking 修完后做——常量提取、LogChannel 迁移、cleanup 补漏、Prefs 删除。不阻塞但显著提升代码质量。

### Quick Wins（9 项）

| # | 问题 | 文件 | 修法 |
|:--:|------|------|------|
| **B5** | `"welcome"` 硬编码 10+ 处 | 多个文件 | 提取 `FALLBACK_PLUGIN_ID` 常量到 `viewRegistry.ts` |
| **B6** | `loader.ts` 17 处 `console.log` 绕过 LogChannel | `loader.ts` | `createLogChannel("pluginLoader")`，全部替换为 `channel.appendLine()` |
| **B7** | `"app"` 硬编码 10+ 处 | 多个文件 | 提取 `APP_PLUGIN_ID` 常量到 `PluginStateService.ts` |
| **B8** | 3 个 CustomEvent 名称无常量——拼错一端就断裂 | `coreCommands.ts` 等 | 提取 `CUSTOM_EVENTS` 常量（Phase 6 再迁到 Emitter） |
| **B9** | Toast TTL 裸数字 10 处 | `loader.ts`/`lifecycle.ts` | 提取 `TOAST_TTL_ERROR/SUCCESS/INFO` 常量到 `toastConstants.ts` |
| **B10** | `getAppVersion()` 硬编码 `"3.0.0"`——注释说读 package.json 但实际不是 | `loader.ts:78-80` | 加 TODO Phase 6：`// TODO Phase 6：从 package.json 动态读取，发版前手动更新此行` |
| **B11** | `useTabManager` 返回 16 个函数无分组注释 | `useTabManager.ts:909-928` | return 语句加分组注释（生命周期/布局/持久化/工具） |
| **B12** | `mountGlobalKeybindings()` 返回值丢弃——HMR 重复注册 | `App.tsx:203` | startup useEffect cleanup 中调 `cleanupKeybindings()` |
| **B13** | Plugin watcher `setInterval` 永不停止 | `App.tsx:200` | startup useEffect cleanup 中调 `stopPluginWatcher()` |

### 追加：PreferenceService 正式删除（B14）

| # | 问题 | 文件 | 修法 |
|:--:|------|------|------|
| **B14** | `Prefs.window` + `Prefs.pluginsInstallPath` 残余——PreferenceService 是僵尸对象 | `PreferenceService.ts` 等 | `window`→`StorageService`（key `"windowState"`）；`pluginsInstallPath`→`PluginStateService`；删 `PreferenceService.ts` |

> 验收报告 D7 原标 Phase 6。提前到 5.5-0b——B5-B9 已经在做常量提取和清理，Prefs 迁移是同类"打扫战场"工作。

### 5.5-0b 验证关卡

```
[ ] npx tsc --noEmit 零错误
[ ] npx vitest run 141+ 测试全过（常量提取不改变行为）
[ ] git grep "PreferenceService" 源文件目录返回空
[ ] git grep '"welcome"' src/ 返回 0（仅 FALLBACK_PLUGIN_ID 常量定义处一次）
[ ] git grep '"app"' src/core/ src/pluginLoader/ 返回 0（仅 APP_PLUGIN_ID 常量定义处一次）
[ ] git commit: "fix(5.5-0b): 9 Quick Wins + Prefs 删除——常量提取/LogChannel/cleanup 补漏"
```

---

---

## 一、5.5a — viewRole 声明系统

### 目标

替掉 `isSidebarOnlyView` 硬编码函数（`tabIdentity.ts:166-170`），改为 `plugin.json` 的 `viewRole` 字段声明。

### viewRole 定义

| 值 | 图标点击行为 | 侧栏 | 标签页 | 适用插件 |
|---|------------|------|--------|---------|
| `sidebarPrimary`（默认） | Toggle 侧栏——不直接创建标签页 | 显示该插件的侧栏内容 | 由侧栏内操作触发创建（如点会话、双击文件） | 终端、文件树、Git、卡片工作台 |
| `tabOnly` | 直接打开/聚焦标签页 | 不清除已有侧栏（`keepSidebarOnFocus`） | 图标点击即创建 | 设置、插件详情页 |

`tabPrimary` 已移除——零例外。

### 涉及文件

| 文件 | 操作 | 改动 |
|------|------|:--:|
| `src/utils/tabIdentity.ts` | **删** `isSidebarOnlyView` 函数 | -8 |
| `src/App.tsx` | `handleIconClick` 简化——读 `viewRole` 替代 `isSidebarOnlyView` 分支 | ~20 |
| `src/pluginLoader/viewRegistry.ts` | 注册时默认 `viewRole: "sidebarPrimary"`（plugin.json 未声明时） | ~5 |
| `docs/插件开发/plugin.schema.json` | `viewRole` 字段已就绪 ✅（5g 已加） | 0 |
| `plugins/marketplace/plugin.json` | 显式声明 `"viewRole": "tabOnly"` | +1 |
| `plugins/settings/plugin.json` | 显式声明 `"viewRole": "tabOnly"` | +1 |
| `plugins/terminal/plugin.json` | 显式声明 `"viewRole": "sidebarPrimary"` | +1 |
| `plugins/welcome/plugin.json` | 检查 `tabBehavior.isFallback` 是否已覆盖行为（欢迎页不需要 viewRole） | 0 |

### 验证

```
1. 点 📟 → 侧栏显示终端侧栏内容（不直接开标签页）
2. 点 🛒 → 侧栏显示市场列表（不直接开标签页）——行为不变
3. 点 ⚙ → 直接打开设置标签页（不开侧栏）——行为不变
4. 新写一个 mock 插件，plugin.json 不声明 viewRole → 默认 sidebarPrimary
5. CI: npx vitest run 全部通过
```

### 代码变更

```typescript
// === 删：src/utils/tabIdentity.ts ===
// 删除 isSidebarOnlyView 函数及导出

// === 改：src/App.tsx handleIconClick ===
const handleIconClick = (pluginId: string) => {
  const viewRole = viewRegistry.get(pluginId)?.viewRole ?? "sidebarPrimary";
  
  if (viewRole === "sidebarPrimary") {
    // Toggle 侧栏——对标 VS Code Activity Bar
    setSidebarView((prev) => (prev === pluginId ? null : pluginId));
    // 标签页由侧栏内操作触发（点会话/双击文件），不在这里创建
  } else if (viewRole === "tabOnly") {
    // 直接开标签页——对标 VS Code 设置
    openOrFocusTab(pluginId);
  }
};

// === 改：src/pluginLoader/viewRegistry.ts ===
// registerPlugin 时：
if (!manifest.viewRole) {
  manifest.viewRole = "sidebarPrimary"; // 默认值
}
```

---

## 二、5.5b — `<SidebarSection>` 通用组件

### 目标

建一个 ~60 行的通用可折叠侧栏区块组件。终端先用，Phase 6 文件树/Git/数据库浏览器全复用。

### API

```typescript
// src/components/shared/SidebarSection.tsx
interface SidebarSectionProps {
  title: string;               // 区块标题（如"控制面板"、"会话列表"、"设置"）
  collapsible?: boolean;       // 是否可折叠，默认 true
  defaultOpen?: boolean;       // 默认展开/合上，默认 true
  badge?: string | number;     // 右侧标记（如 "(3)"）
  actions?: ReactNode;         // 右侧操作按钮（如 [✎] [+ 新建]）
  children: ReactNode;         // 区块内容
}
```

### 对标 VS Code

```
VS Code Explorer 侧栏:
  ▼ 工作区文件夹 (2)     ← SidebarSection title="工作区文件夹" badge="(2)" defaultOpen=true
    ├── src/
    └── tests/
  ▶ 大纲                 ← SidebarSection title="大纲" defaultOpen=false
  ▶ 时间线               ← SidebarSection title="时间线" defaultOpen=false

LinkDesk 终端侧栏:
  ▼ 终端会话 (3)  [+ 新建] ← SidebarSection title="终端会话" badge="(3)" actions={<新建按钮>}
    ├── COM3 PID调试
    └── COM5 CAN监控
  ▶ 控制面板       [编辑]  ← SidebarSection title="控制面板" defaultOpen=false actions={<编辑>}
  ▶ 设置                   ← SidebarSection title="设置" defaultOpen=false
```

### 涉及文件

| 文件 | 操作 | 行数 |
|------|------|:--:|
| `src/components/shared/SidebarSection.tsx` | **新建**——可折叠逻辑 + 三角箭头 CSS 旋转 | ~40 |
| `src/components/shared/SidebarSection.css` | **新建**——header 高度/颜色/hover 效果/三角过渡动画 | ~25 |

### CSS 关键常量（对标 VS Code）

```css
.sidebar-section-header {
  height: 22px;              /* VS Code: 22px section header */
  padding: 0 8px;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  font-size: 11px;           /* VS Code: 11px */
  font-weight: 600;          /* VS Code: 600 */
  text-transform: uppercase; /* VS Code: uppercase */
  color: var(--sidebar-section-header-fg);
}

.sidebar-section-header:hover {
  color: var(--sidebar-section-header-hover-fg);
}

.sidebar-section-arrow {
  transition: transform 0.1s ease;  /* 三角旋转动画 */
}
.sidebar-section-arrow.collapsed {
  transform: rotate(-90deg);        /* ▶ → ▼ */
}
```

### 验证

```
1. 独立测试：3 个 SidebarSection 组合——一个默认展开、一个默认合上、一个带 badge "(5)"
2. 点击 header → 折叠/展开 → 三角箭头旋转动画
3. 折叠后 children 不渲染（或 display:none）
4. actions slot 渲染正常（按钮可点击，事件不冒泡到折叠）
5. 纯 UI 组件——不 import 任何 core 模块
```

---

## 三、5.5c — 终端侧栏重设计

> 2026-07-21 重写——AI-A 交付执行规格。旧草稿（"工具栏迁入侧栏 + 5 个 Section"）废弃。
> 核心洞察：**不同 COM 口设备需要不同的收发参数。** COM3 是 AT 模块（回显开），COM4 是 GPS 模块（回显关）。
> 因此 12 个设置项不是全局配置——是**每个会话的属性**。侧栏的"资源"是会话，侧栏只做会话管理 + 当前会话的收发设置。
>
> **三项已确认的设计决策（用户 2026-07-21）：**
> 1. 控制面板（COM/波特率/协议/连接）→ **主区顶部**——每标签页自包含，对标 VS Code 终端面板的 shell 选择器
> 2. 快捷发送 → **按会话隔离**——CAN 会话和 AT 会话各有一组
> 3. 发送栏 → **主区底部**（不改——Monaco 是内容创作，和 CM6 同在标签页内）

### 3.1 对标模型

```
VS Code Explorer                    LinkDesk 终端
─────────────────────              ─────────────────────
📁 Explorer 侧栏                     📟 终端侧栏
  ├─ 文件列表 (CRUD)                  ├─ 会话列表 (CRUD)
  ├─ 双击文件 → 开编辑器               ├─ 点会话 → 切换终端标签页
  └─ F2 改名 → 标签页标题同步           └─ F2 改名 → 标签页标题同步

主区编辑器标签页                       主区终端标签页
  ├─ 编辑器专属工具栏                    ├─ 控制面板 (COM/波特率/协议/连接)
  ├─ 文件内容 (Monaco)                  ├─ CM6 接收区
  └─ 编辑器专属面板                      ├─ 快捷发送药丸 (按会话)
                                      └─ Monaco 发送栏
```

### 3.2 侧栏——2 个 SidebarSection

```
┌────────────────────────────┐
│                            │
│ ▼ 终端会话 (3)       [+ 新建] │  ← SidebarSection，defaultOpen=true
│                            │     badge=会话数，actions=[+ 新建] 按钮
│ ● COM3 PID调试      [✎][✕] │  ← 选中态（深色背景）。hover 时才显示 [✎][✕]
│    115200 · 方括号           │  ← 副标题：波特率 + 协议（灰色小字）
│                            │     点会话行 → 切换标签页 + 下方"收发设置"联动
│   COM5 CAN监控       [✎][✕] │  ← 未选中态
│    500000 · 方括号           │     ✎ → inline 编辑→回车确认→标签页标题同步
│                            │     ✕ → 关闭会话+标签页（最后会话显示空状态）
│   COM7 空闲                 │
│    未配置                    │
│                            │
├────────────────────────────┤
│                            │
│ ▼ 收发设置                   │  ← SidebarSection，defaultOpen=true
│                            │     内容完全随上方选中的会话切换
│   时间戳  [HH:mm:ss:fff ▼] │  ← 12 项——当前选中会话的属性
│   消息回显          [✓]     │     COM3 回显开、COM5 回显关——互不干扰
│   行号显示          [✓]     │     每项 onChange → 直接改 session 对象
│   系统消息独立显示    [✓]     │     立即生效（不需要点"应用"）
│   换行符      [\r\n ▼]     │
│   定时发送          [ ]     │
│   间隔(ms)      [1000]     │  ← 仅 autoRepeat=true 时显示
│   发送后清空         [ ]     │
│   接收模式    [文本 ▼]      │
│   接收编码  [UTF-8 ▼]      │
│   发送模式    [文本 ▼]      │
│   发送编码  [UTF-8 ▼]      │  ← sendMode=hex 时 disabled
│                            │
└────────────────────────────┘
```

**侧栏只做两件事：会话列表 + 收发设置。** 没有控制面板（在主区），没有快捷发送（在主区），没有收发统计（Phase 7 做）。对标 VS Code Explorer：上半是文件列表，下半如果有 `Outline`/`Timeline` 是树视图——这里下半是当前会话的属性编辑。

**收发设置联动规则：**
```
侧栏选中 "COM3 PID调试" → 收发设置区显示 COM3 的 12 个值
侧栏选中 "COM5 CAN监控" → 收发设置区立即切换为 COM5 的值
没有选中任何会话 → 收发设置区不渲染（或显示灰色占位）
```

### 3.3 主区——每标签页自包含

```
┌──────────────────────────────────────────────┐
│ [COM3 ▼] [115200 ▼] [方括号协议 ▼]            │ ← 控制面板（迁自 toolbar.tsx）
│ [● 已连接] [断开] [⏸ 暂停] [清空] [导出] [🔍]  │ ← 操作按钮行
├──────────────────────────────────────────────┤
│                                              │
│  CM6 接收区                                   │
│  (flex: 1，占满剩余高度)                       │
│                                              │
├──────────────────────────────────────────────┤
│ [AT] [AT+CWLAP] [AT+MQTT] [+ 添加]           │ ← 快捷发送（当前会话专属）
├──────────────────────────────────────────────┤
│ > Monaco 发送栏                     [清空] [发送]│ ← 发送栏（不变）
└──────────────────────────────────────────────┘
```

**和旧设计的关键区别：** 控制面板留在主区。用户切到另一个标签页后想断连/改波特率——不需要点回 📟，直接在标签页内操作。对标 VS Code 终端面板的 shell 选择器。

**未连接状态：**
```
│ [COM3 ▼] [115200 ▼] [方括号协议 ▼]            │
│ [● 打开]                                      │ ← 只有打开按钮，其他按钮不显示
├──────────────────────────────────────────────┤
│                    ⋮                          │
│  选择串口设备并打开连接以开始                    │ ← CM6 区显示引导文字（对标 VS Code welcome view）
│                    ⋮                          │
```

**无可用串口状态：**
```
│ [无可用串口] [115200 ▼]                       │ ← 下拉框 disabled
│ [● 打开] (disabled)                           │
```

### 3.4 会话数据结构（内存态——Phase 6 持久化）

```typescript
// plugins/terminal/useTerminalSessions.ts
interface TerminalSession {
  id: string;                    // = tabId，一一对应
  name: string;                  // 用户可编辑，"新会话" = 默认
  port: string;                  // COM 口名称，"" = 未选
  baudRate: string;              // "115200"
  protocol: string;              // 协议插件 ID，"bracket"
  connected: boolean;

  // ── 12 项收发设置 ← 每会话独立 ──
  timestampFormat: string;       // "HH:mm:ss:fff" | "HH:mm:ss" | "无"
  showEcho: boolean;
  showLineNumbers: boolean;
  separateSystemLog: boolean;
  lineEnding: string;            // "\r\n" | "\n" | "\r"
  autoRepeat: boolean;
  repeatInterval: number;        // 1000
  autoClear: boolean;
  receiveMode: string;           // "text" | "hex"
  receiveCoding: string;         // "UTF-8" | "GB2312" | "Shift-JIS" | "Latin-1"
  sendMode: string;              // "text" | "hex"
  sendCoding: string;            // "UTF-8" | "GB2312" | "Shift-JIS" | "Latin-1"

  // ── 快捷发送 ← 按会话 ──
  quickSends: Record<string, string>;  // { "AT": "AT\r\n", "AT+CWLAP": "AT+CWLAP\r\n" }
}
```

**默认值来源**：新建会话时，`useTerminalSessions` 内部定义 `DEFAULT_SESSION_SETTINGS` 常量。不从 `ConfigurationService` 读（12 项不再是全局配置）。不从 `plugin.json` 读（`contributes.configuration` 的 `default` 仅作文档参考）。

**Phase 6 持久化：** `useTerminalSessions` 增加 `loadSessions()` / `saveSessions()` 调用 `FileService`。5.5 不做——F5 刷新会话全部消失（预期行为）。

### 3.5 交互流

**新建会话：**
```
侧栏 [+ 新建] 按钮
  → prompt 模态/内联输入："新会话名称？"，默认值 "新会话 N"（N 递增）
  → 回车确认
  → createSession(name, defaults) → 新 session 对象（id=tabId，所有设置=默认值）
  → openTab(tabId, terminal) → 主区显示空白终端（未连接状态）
  → 标签栏: [📟 新会话 N]
  → 侧栏自动选中新会话 → 收发设置区显示默认值
```

**切换会话：**
```
侧栏点 "COM5 CAN监控"
  → setActiveSession(sessionId)
  → focusTab(tabId) → 主区切换终端标签页
  → 控制面板显示该会话的 COM/波特率/协议状态
  → CM6 显示该标签页的内容（keep-alive，不丢失）
  → 快捷发送条切换为该会话的快捷发送
  → 侧栏收发设置区刷新为该会话的 12 个值
```

**改名（F2 / hover ✎）：**
```
侧栏选中 "COM3 PID调试" → F2（或 hover → 点 ✎）
  → 会话名变为内联 <input>，自动 focus + 选中全部文本
  → 回车确认 / Esc 取消
  → session.name = "PID调试"
  → reduceUpdateTabLabel(tabId, "PID调试")
  → 标签栏: [📟 PID调试]
```

**删除会话（hover ✕）：**
```
侧栏 hover "COM7 空闲" → 出现 [✕] → 点 ✕
  → 确认弹窗："关闭会话「COM7 空闲」？"
  → 确认：
    → 如果 connected → 先断开串口
    → closeTab(tabId)
    → removeSession(sessionId)
    → 如果是最后一个会话 → 侧栏显示空状态："暂无会话 [+ 新建]"
    → 如果删除的是当前选中 → 自动选中相邻会话
```

**改变收发设置：**
```
侧栏"收发设置"区 → 改消息回显 Toggle → off
  → session.showEcho = false
  → 当前终端标签页立即生效（不点"应用"）
  → 如果用户切到 COM5 再切回 COM3 → showEcho 仍是 false（值绑在 session 上）

切换 Timeline：
  用户操作 → session.xxx 变化 → CM6/发送行为立即生效
  不需要"应用"/"确定"按钮——对标 VS Code 设置编辑器的即时生效
```

### 3.6 组件树

```
TerminalSidebar (重写，~100 行)
├── SidebarSection "终端会话" (defaultOpen=true, badge=count, actions={<新建按钮>})
│   ├── SessionListItem × N
│   │   ├── 连接状态点 (● 绿色=已连接, ○ 灰色=未连接)
│   │   ├── 会话名（可 F2 内联编辑）
│   │   ├── 副标题（波特率 + 协议，灰色小字）
│   │   └── HoverActions (✎ 改名 / ✕ 删除，仅 hover 时显示)
│   └── EmptyState ("暂无会话，[+ 新建] 开始")
│
└── SidebarSection "收发设置" (defaultOpen=true)
    └── SessionSettings (12 个 Toggle/Select/Input，读当前 session 的值)
        └── 每个 onChange → 直接 mutate session + notify TerminalView 重渲染

TerminalView/index.tsx (瘦身，~1000 行)
├── ControlPanel (重构自 toolbar.tsx）
│   ├── COM 口下拉框 + 波特率下拉框 + 协议下拉框
│   ├── 连接/断开按钮（含连接状态点）
│   ├── 暂停/清空/导出/搜索/筛选按钮
│   └── SearchBar (条件渲染)
├── CM6 接收区 (flex: 1，主要空间)
│   ├── 未连接引导文字
│   └── 暂停遮罩条
├── QuickSendBar (读 session.quickSends)
│   ├── 药丸按钮 × N
│   ├── 添加/编辑内联表单
│   └── 右键菜单（ContextMenu）
└── SendBar
    ├── Monaco 单行编辑
    ├── 发送历史下拉
    └── 清空/发送按钮

useTerminalSessions.ts (新建，~60 行)
├── sessions: TerminalSession[]
├── activeSessionId: string
├── createSession(name): TerminalSession
├── removeSession(id)
├── updateSession(id, patch)
└── getSession(id): TerminalSession | undefined
```

### 3.7 涉及文件

| 文件 | 操作 | 净变动 | 说明 |
|------|------|:--:|------|
| `plugins/terminal/sidebar.tsx` | **重写** | ~100 | 2 个 SidebarSection：会话列表 + 收发设置 |
| `plugins/terminal/sidebar.css` | **重写** | ~40 | 旧表单样式全部替换 |
| `plugins/terminal/index.tsx` | **瘦身** | -200 | 工具栏逻辑迁入 ControlPanel；快捷发送/发送栏保留但改为读 session |
| `plugins/terminal/toolbar.tsx` | **重构** → `ControlPanel.tsx` | ~80 | COM/波特率/协议/连接操作，每标签页一份 |
| `plugins/terminal/toolbar.css` | 改名 → `ControlPanel.css` | 0 | 样式不变 |
| `plugins/terminal/useTerminalSessions.ts` | **新建** | ~60 | 会话 CRUD + 默认设置常量的 hook |
| `plugins/terminal/plugin.json` | 改 | +1 | `viewRole: "sidebarPrimary"`（替代旧 `"tabOnly"`） |
| `plugins/terminal/plugin.json` | 删 | -40 | **移除 `contributes.configuration` 12 项**（设置不再是全局——Settings Editor 不渲染终端设置） |
| **净变动** | | **~ +40 行** | |

### 3.8 和 Settings Editor / ConfigurationService 的关系

**终端 12 项设置从 Settings Editor 移除。** 理由：

1. 不同 COM 口设备需要不同的收发参数——不是全局配置
2. 会话是内存对象，不属于 `ConfigurationService` 管辖（`ConfigurationService` 管的是跨会话的全局设置）
3. 设置唯一入口是侧栏——和 VS Code Explorer 侧栏一致：文件属性在侧栏改，不在 Settings Editor 改

**但 `contributes.configuration` 的 `properties` 保留在 `plugin.json` 中**——作为会话默认值的**模板定义**（`default` 字段）。`useTerminalSessions` 的 `createSession()` 可以从中提取默认值。Settings Editor 的渲染逻辑判断 `"scope": "session"` 或等效标记后跳过不渲染。或者更简单的做法——`useTerminalSessions` 内部写死默认值常量，不依赖插件清单。由实现者选择。

**`ConfigurationService` 中终端相关的 12 个 key 不再使用。** `index.tsx` 从 `useConfiguration("terminal.xxx")` 改为 `session.xxx`。`useConfiguration` hook 不再出现在终端代码中（除非终端有真正的全局设置，如"最大会话数"——Phase 6+）。

### 3.9 状态归属总结

| 状态 | 归属 | 读写方式 |
|------|:--:|------|
| 会话列表 | `useTerminalSessions` hook | CRUD |
| 每个会话的 12 个设置 | `session.xxx` 字段 | 侧栏 Toggle/Select onChange → mutate |
| 每个会话的快捷发送 | `session.quickSends` | 药丸 CRUD |
| 每个会话的 COM/波特率/协议 | `session.port/baudRate/protocol` | 控制面板下拉框 |
| 当前 COM 硬件连接 | `SerialContext`（全局，Rust 后端） | `toggleOpen()` |
| 当前选中哪个会话 | `useTerminalSessions.activeSessionId` | 侧栏点会话 / 标签页切换 |
| 当前活跃标签页 | 标签页系统 `activeTabId` | `focusTab()` |

### 3.10 验证清单

```
[ ] 点 📟 → 侧栏显示会话列表（不是设置表单、不是控制面板）——如果无会话显示空状态
[ ] [+ 新建] → 输入名称 → 标签栏出现新标签页 → 侧栏自动选中 → 收发设置区显示默认值
[ ] 侧栏选中 "COM3 PID调试" → 收发设置区刷新为该会话的 12 个值
[ ] 侧栏改消息回显 Toggle → off → 主区终端立即不显示回显
[ ] 侧栏切到 "COM5 CAN监控" → 收发设置区切换 → COM5 的回显仍是 on（互不干扰）
[ ] 侧栏 F2 → 内联编辑 → 回车 → 标签页标题同步更新
[ ] 侧栏 hover 会话行 → [✎] [✕] 出现 → 点 ✕ → 确认 → 标签页关闭
[ ] 删除最后一个会话 → 侧栏显示空状态 "暂无会话，[+ 新建] 开始"
[ ] 主区顶部控制面板：选 COM3 → 选波特率 → 点 [● 打开] → CM6 接收区有数据
[ ] 主区快捷发送：[AT] 药丸 → 点 → 发送 → CM6 回显
[ ] 主区发送栏：输文字 → Enter → 发送 → CM6 回显
[ ] 新建第二个会话 → COM5 → 不同的快捷发送列表 → 两个会话互不干扰
[ ] F5 刷新 → 所有会话消失（5.5 内存态——预期行为）
[ ] Settings Editor 搜索 "终端" → 零结果（终端设置从 Settings Editor 移除）
[ ] git grep "useConfiguration.*terminal" -- plugins/terminal/ → 返回空
[ ] git grep '"terminal"' src/core/ → 返回零
[ ] npx tsc --noEmit 零错误
[ ] npx vitest run 全部通过
```

---

## 四、实施顺序

```
5.5-0a: 4 Blocking（第一个 commit，~50 分钟）
  │   B1 监听器泄漏 / B2 僵尸注册 / B3 快捷键误删 / B4 semver 归一化
  │
5.5-0b: 9 Quick Wins + Prefs 删除（第二个 commit，~105 分钟）
  │   B5-B13 常量提取+LogChannel+cleanup / B14 Prefs 迁移
  │   修完后代码库从 B+ 升至 A-
  │
  ▼
┌──────────┐
│  5.5a    │  框架层——viewRole 声明
│  ~50 行   │  改 App.tsx + plugin.json
└────┬─────┘
     │
     ├──────────┐
     ▼          ▼
┌──────────┐  ┌──────────────┐
│  5.5c    │  │    5.5b      │  ← 5.5a 和 5.5b 可以并行
│  ~+40 行  │  │   ~60 行      │
│ 终端重设计 │◄─┤  SidebarSection│     5.5c 消费两者
└──────────┘  └──────────────┘
```

**实际建议顺序：** 5.5-0a → 5.5-0b → 5.5a → 5.5b → 5.5c（顺序做更安全。0a/0b 先确保代码库干净。5.5a 确保 viewRole 机制正确。5.5b 建好组件。5.5c 最后一气呵成）

### 5.5 完成后的终端去特权化验证

Phase 5.5c 完成后必须验证：**终端不是特权插件。** 这些检查确保没有遗留"因为这是终端所以特殊处理"的代码路径——如果有，就是以后的 V2.6 种子。

```
[ ] 卸载终端插件 → 图标栏终端图标消失 → 侧栏消失 → 已打开的终端标签页全部关闭 → 主区无残留
[ ] 卸载终端插件 → App.tsx 不报任何错误（没有 import 终端、没有 switch on "terminal"）
[ ] 卸载终端插件 → 安装一个纯 sidebarPrimary 第三方插件 → 图标点击行为正确（切侧栏，不蹦标签页）
[ ] 卸载终端插件 → Prefs/ConfigurationService 无 terminal.* 键残留
[ ] git grep '"terminal"' src/core/ → 返回零（核心不知道终端存在）
[ ] git grep '"terminal"' src/pluginLoader/ → 返回零（loader 不特殊处理终端）
[ ] grep -r "terminal" src/App.tsx → 返回零
[ ] grep -r "terminal" src/components/MainContent.tsx → 返回零
```

> 这不是针对终端的测试——这是**任意插件的去特权化测试模板。** Phase 6 文件树完成后也跑同一套：卸载文件树 → core/ 无 "file-tree" 残留。

---

## 五、Bug 修复（5.5-0 已覆盖 → 5.5c 嵌入）

5.5-0（Phase 5 验收修复）已将全部 14 项 bug 作为第一个 commit 修掉。5.5c 期间只处理一个终端专属 bug：

| Bug | 现象 | 根因 | 修法 |
|-----|------|------|------|
| **终端 COM 口多实例隔离** | 新建终端标签页继承上一个终端的 COM 口状态 | 终端侧栏全局共享 COM 口状态——未按会话隔离 | 5.5c 重写侧栏时，每个会话独立持有自己的 COM 状态 |

---

## 六、通用交互范式——5.5c 验证后产出

> 详见 [通用交互范式](V3-Phase5.5-通用交互范式.md)——已提前写好。5.5c 完成后对照验证。

核心规则：
- **标签栏 = 导航**（切换当前在看什么）
- **侧栏 = 管理**（增删改查插件自己的资源）
- **主区 = 内容**（渲染/交互/编辑）
- **改名走侧栏，不走标签栏**——对标 VS Code Explorer 侧栏改名

---

## 七、Phase 5.5 不做的东西

| 不做 | 理由 |
|------|------|
| 侧栏拖拽宽度调整 | Phase 4 已实现可拖拽，不做额外改动 |
| 侧栏位置切换（左/右） | Phase 7+ |
| Activity Bar 位置切换（上/下/左/右） | Phase 7+——当前默认左侧，不做死 |
| 侧栏多 tab 切换（Explorer/Search/Git 小标签） | 当前每个图标一个侧栏内容，够用 |
| 终端会话持久化（.session.json） | 依赖 Phase 6 FileService——届时做 |
| 终端会话模板 | Phase 7+ |
| 远程会话（SSH/串口服务器） | Phase 8+ |
| 终端 PTY | 串口是当前主要用例，PTY 可选插件不进核心 |

---

## 八、和 Phase 5g / 5h 的关系

- **5g（类型系统去硬编码）** 已经加了 `viewRole` 到 `plugin.schema.json`。5.5a 是消费这个字段——App.tsx 真正读它。
- **5h（运行时动态加载）** 保证了新装插件 `viewRole` 声明即时生效——不需要 F5 刷新。
- 5.5a 是 5g+5h 的第一个真实消费者——证明"plugin.json 字段驱动行为"这条路走得通。

---

## 九、相关文档

- [Phase 5.5 设计分析——三栏交互对标](V3-Phase5.5-三栏交互对标.md)
- [Phase 5.5 终端侧栏进化](V3-Phase5.5-终端侧栏两次进化.md)
- [Phase 5.5 通用交互范式](V3-Phase5.5-通用交互范式.md)
- [Phase 5.5 已知问题](V3-Phase5.5-已知问题.md)
- [Phase 5 设计](../phase5_应用基础设施/V3-Phase5-设计.md)
- [Phase 6 设计](../phase6_编辑能力/V3-Phase6-设计.md)
