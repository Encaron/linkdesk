# Phase 5.5 实施计划——三栏交互对标 VS Code + 终端侧栏重设计

> 2026-07-21。
> Phase 4 的三栏交互为终端定制——"图标=标签页，侧栏=设置表单"。
> Phase 5 建了 Settings Editor，终端 12 个设置项可以迁走了。
> Phase 5.5 做三件事（3 层子阶段）：① `viewRole` 声明替代硬编码（框架层）；② `<SidebarSection>` 通用组件（UI 基础设施）；③ 终端侧栏重设计（消费者）。
>
> **性质：** 最后一个改框架的 Phase 是 5h。5.5 是 5h→6 之间的桥梁——建好 viewRole 机制后，Phase 6 文件树/Git/数据库浏览器全走 `sidebarPrimary`，不需要再碰 `App.tsx`。
>
> **对标：** VS Code 三栏模型（Activity Bar → Side Bar → Editor）。LinkDesk 在 5.5 后和 VS Code 完全对齐——没有例外。

---

## 子阶段总览

| 子阶段 | 内容 | 性质 | 净行数 | 依赖 |
|:--:|------|:--:|:--:|------|
| **5.5a** | `viewRole` 声明系统 | 框架层（改 App.tsx + plugin.json schema） | ~50 | 5h（plugin.json 字段即时生效） |
| **5.5b** | `<SidebarSection>` 通用组件 | UI 基础设施（纯组件，不改框架） | ~60 | 无（独立组件） |
| **5.5c** | 终端侧栏重设计 | 消费者（第一个用 5.5a+5.5b 的插件） | ~100 | 5.5a + 5.5b |

**5.5a 和 5.5b 可以并行。** 5.5c 必须等前两者完成。

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

### 目标

终端侧栏从"12 项设置表单"改为"控制面板 + 会话列表"。
这是第一个消费 5.5a（viewRole）+ 5.5b（SidebarSection）的完整用例。

### 侧栏布局（重设计后）

```
┌──────────────────────┐
│                      │
│ ▼ 终端会话 (3)   [+ 新建]│  ← SidebarSection（会话列表，内存态）
│   📟 COM3 PID调试  [✎] │  ← 点击→切换标签页；✎→侧栏内改名→标签标题联动
│   📟 COM5 CAN监控   [✕] │  ← ✕→关闭会话+标签页
│   📟 COM7 空闲      [✕] │
│                      │
├──────────────────────┤
│                      │
│ ▼ 控制面板       [编辑]│  ← SidebarSection（默认展开）
│   COM口 [COM3 ▼]      │  ← 从 toolbar.tsx 迁入
│   波特率 [115200 ▼]    │
│   [● 打开]  [断开]     │
│                      │
│ ▶ 快捷发送        [编辑]│  ← SidebarSection（默认展开）
│   ┌────┬────┬────┐   │
│   │ AT │+CWLAP│+JAP│  │
│   └────┴────┴────┘   │
│   [+ 添加]            │
│                      │
│ ▶ 收发统计            │  ← SidebarSection
│   TX: 1,234  RX: 56,789│
│                      │
├──────────────────────┤
│                      │
│ ▶ 设置               │  ← SidebarSection（默认合上）
│   时间戳格式 [HH:mm:ss ▼]│  ← 读 contributes.configuration，Settings Editor 渲染
│   显示行号    [✓]       │
│   ...更多设置...        │  ← 不再手动维护 12 个表单项
│                      │
└──────────────────────┘
```

### 会话数据结构（内存态——Phase 5.5 不做持久化）

```typescript
// plugins/terminal/sidebar.tsx 内部 state
interface TerminalSession {
  id: string;            // 唯一标识（tabId）
  name: string;          // 用户可编辑的会话名
  port: string;          // COM 口（空 = 未连接）
  baudRate: number;
  protocol: string;      // 协议插件 ID
  connected: boolean;
}
```

Phase 6 才持久化为 `.session.json`——5.5 只做 UI 交互，数据结构在内存中。

### 标签页标题联动

```
侧栏改名 "COM3 PID调试" → reduceUpdateTabLabel(tabId, "COM3 PID调试")
  → 标签栏: [📟 COM3 PID调试] [📟 COM5 CAN监控]
  
侧栏删除会话 → closeTab + removeSession
侧栏新建会话 → openNewTab + addSession
```

### 涉及文件

| 文件 | 操作 | 行数 |
|------|------|:--:|
| `plugins/terminal/sidebar.tsx` | **重写**——5 个 SidebarSection + 会话状态管理 + 改名联动 | ~120 |
| `plugins/terminal/sidebar.css` | **重写**——匹配新布局 | ~40 |
| `plugins/terminal/index.tsx` | **瘦身**——删工具栏+发送栏（迁入侧栏），保留 CM6+Monaco | -180 |
| `plugins/terminal/toolbar.tsx` | **删除** | -80 |
| `plugins/terminal/toolbar.css` | **删除** | -30 |
| `plugins/terminal/plugin.json` | + `contributes.configuration` 12 项（Settings Editor 接管） | +40 |
| `plugins/terminal/useTerminalSessions.ts` | **新建**——会话 CRUD hook（增/删/改名/切换，纯内存） | ~50 |
| **净变动** | | **~ -40 行** |

### 和 Settings Editor 的关系

```
Phase 5 Settings Editor 建好了。
终端 12 个设置项 → plugin.json contributes.configuration → Settings Editor 自动渲染。
侧栏的"设置"区块不再手动写表单项——只放一个链接/入口到 Settings Editor。
或者直接放设置项（useConfiguration 读值 + ContributedSetting 渲染）。
```

### 验证

```
1. 点 📟 → 侧栏显示控制面板（不是 12 项设置表单）
2. 侧栏 COM 口选择 COM3 → 点打开 → 终端连接 → 接收区有数据
3. 侧栏改名 "PID调试" → 标签页标题变为 "📟 PID调试"
4. 新建第二个会话 → 选 COM5 → 标签栏出现两个终端标签页
5. 切换会话 → 标签页切换，侧栏 COM 口状态跟随
6. 删除会话 → 标签页关闭
7. F5 刷新 → 会话全部消失（5.5 内存态，不持久化——这是预期行为）
8. Settings Editor 里改时间戳格式 → 终端接收区格式变化
9. CI: npx vitest run 全部通过
```

---

## 四、实施顺序

```
         ┌──────────┐
         │  5.5a    │  框架层——viewRole 声明
         │  ~50 行   │  改 App.tsx + plugin.json
         └────┬─────┘
              │
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
┌──────────┐    ┌──────────────┐
│  5.5c    │    │    5.5b      │  ← 5.5a 和 5.5b 可以并行
│  ~100 行  │    │   ~60 行      │
│ 终端重设计 │◄───│  SidebarSection│     5.5c 消费两者
└──────────┘    └──────────────┘
```

**实际建议顺序：** 5.5a → 5.5b → 5.5c（顺序做更安全，5.5a 先确保 viewRole 机制正确，5.5b 建好组件，5.5c 最后一气呵成）

---

## 五、Bug 修复（嵌入 5.5c）

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
