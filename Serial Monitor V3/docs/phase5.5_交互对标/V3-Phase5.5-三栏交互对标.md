# Phase 5.5 — 三栏交互对标 VS Code + 终端布局重新设计

> 2026-07-20。
> Phase 4 的三栏交互逻辑是为终端定制的——"图标=标签页，侧栏=标签页的设置"。
> Phase 5 建了 Settings Editor，终端侧栏的 12 个设置项可以迁走了。
> Phase 5.5 做两件事：① `viewRole` 声明替代 `isSidebarOnlyView` 硬编码；② 终端侧栏从"设置表单"改为"控制面板"（对标 PlatformIO）。
> 对标 VS Code：图标 = 侧栏入口，标签页是结果不是起点。
>
> **⚠️ 前置声明：当前处于 Phase 5a，Phase 5.5 尚未开始。§八的终端布局重设计是 Phase 5 规划阶段写的草稿——到达 5.5 时，终端插件可能完全重设计为符合 VS Code 交互模型的形态，届时唯一的 `tabPrimary` 例外也可能随之消失。届时会参照 VS Code 终端面板的交互模式、PlatformIO 的侧栏布局、以及 LinkDesk 硬件调试的实际需求，重新设计终端 UI——不是基于当前草稿修修补补。**

---

## 一、当前问题

### 1.1 当前交互逻辑

```typescript
// App.tsx:211-221 — Phase 4 的三栏交互，两点硬伤
const handleIconClick = (pluginId: string) => {
  if (isSidebarOnlyView(pluginId)) {
    setSidebarView((prev) => (prev === pluginId ? null : pluginId));
  } else {
    setSidebarView(pluginId);
    openOrFocusTab(pluginId);  // ← 强制所有"非纯侧栏"插件开标签页
  }
};

// tabIdentity.ts:166-170 — 硬编码
export function isSidebarOnlyView(pluginId: string): boolean {
  return pluginId === "marketplace";  // ← 只有 market 享受这个待遇
}
```

**两个分支，一个硬编码。** 所有不是 `marketplace` 的插件点图标都强制开标签页。

### 1.2 文件树来了之后

```
点 📁（文件树）
  → isSidebarOnlyView("file-tree") → false → 走 else 分支
    → setSidebarView("file-tree") → 侧栏显示文件树 ✅
    → openOrFocusTab("file-tree") → 主区多一个空标签页 ❌

而且如果用户关掉这个空标签页 → 侧栏跟着消失 → 文件树用不了
```

根本问题：**不是交互逻辑错了，是它做了一个终端优先的假设——每个插件都有"主区内容"。** 文件树、市场、以及未来所有 PlatformIO 风格的插件——主区内容是侧栏内的操作触发的，不是图标触发的。

### 1.3 不改的话——PlatformIO 类插件全部废掉

```
数据库浏览器插件 → 点图标开空标签页，侧栏显示表列表
                  用户关掉空标签页 → 侧栏消失 → 用不了

Git 管理插件 → 同上

MCU 寄存器调试器 → 同上

包管理器插件 → 同上

每次有人写一个 sidebarPrimary 风格的插件，
就得在 isSidebarOnlyView 里加一行 pluginId === "xxx"。
这不是 V2.6 模式——这是同一行代码的 V2.6 模式。
```

---

## 二、对标 VS Code

### 2.1 VS Code 的三栏模型

```
VS Code：Activity Bar → Side Bar → Editor
─────────────────────────────────────────

图标控制侧栏。标签页是侧栏内的操作触发的，不是图标直接触发的。

点 🐜 PlatformIO → 侧栏变 PlatformIO 面板，主区不动
  侧栏里点 "Create New Project" → 主区才开新标签页
  侧栏里点 "Pick a folder" → 弹出系统文件夹选择器

点 📁 Explorer → 侧栏变文件树，主区不动
  侧栏里双击文件 → 主区开编辑器标签页

点 🧩 Extensions → 侧栏变扩展列表，主区不动
  侧栏里点扩展 → 主区开扩展详情标签页

点 ⚙ Manage (齿轮) → 不经过侧栏——直接开命令面板或设置编辑器
```

**核心：图标 = 侧栏入口，不是标签页入口。** VS Code 没有"点图标打开一个终端标签页"这种行为——终端是通过命令面板或快捷键打开的底部面板。

### 2.2 LinkDesk 的正确偏离

VS Code 的终端是底部面板，不是标签页。LinkDesk 的终端是标签页——这是**正确的设计偏离**。因为 LinkDesk 是硬件调试容器，终端是最主要的视图，用户拖拽它分屏、和其他插件并列——标签页比底部面板更合适。

终端点 📟 → 开标签页 → 侧栏显示串口设置。这条链路保留。但这不代表**所有**插件都应该走这条链路。

---

## 三、方案：`viewRole` 声明

### 3.1 三种视图角色

| viewRole | 图标点击行为 | 侧栏 | 标签页 | 对标 VS Code |
|------|------|------|------|------|
| `sidebarPrimary` | 切换侧栏，主区不动 | ✅ 主要渲染位置 | ❌ 不创建（侧栏内操作可触发）| Explorer / Extensions / PlatformIO |
| `tabPrimary` | 打开/聚焦标签页 | ✅ 辅助面板（可选）| ✅ 主要渲染位置 | Terminal（但 VS Code 终端是底部面板，LinkDesk 是标签页） |
| `tabOnly` | 打开/聚焦标签页 | ❌ 不切换侧栏 | ✅ 唯一渲染位置 | Settings Editor |

**默认值：** `"sidebarPrimary"`——对标 VS Code：图标=侧栏入口，标签页是侧栏内操作触发的，不是图标直接触发的。终端是唯一例外——显式声明 `tabPrimary`。

### 3.2 plugin.json 声明

```json
// 文件树——sidebarPrimary
{
  "name": "文件树",
  "icon": "folder",
  "iconSource": "codicon",
  "sidebar": "sidebar.tsx",
  "viewRole": "sidebarPrimary"
}

// 终端——tabPrimary（和现在行为完全一致）
{
  "name": "终端",
  "entry": "index.tsx",
  "sidebar": "sidebar.tsx",
  "statusBar": [...],
  "viewRole": "tabPrimary"
}

// 设置——tabOnly
{
  "name": "设置",
  "entry": "index.tsx",
  "viewRole": "tabOnly"
}

// 市场——sidebarPrimary（替代原来的 isSidebarOnlyView 硬编码）
{
  "name": "插件市场",
  "sidebar": "sidebar.tsx",
  "viewRole": "sidebarPrimary"
}
```

### 3.3 代码改动

**1. types.ts — 类型定义（+3 行）：**
```typescript
// PluginManifest 加字段
viewRole?: 'sidebarPrimary' | 'tabPrimary' | 'tabOnly';
```

**2. viewRegistry.ts — 存 viewRole（+1 行）：**
```typescript
interface ViewPluginEntry {
  // ... 现有字段
  viewRole: 'sidebarPrimary' | 'tabPrimary' | 'tabOnly';
}
// register 时读 manifest.viewRole ?? 'sidebarPrimary'  // 默认 VS Code 模型
```

**3. App.tsx — handleIconClick（~20 行，替换旧逻辑）：**
```typescript
const handleIconClick = useCallback(
  (pluginId: string) => {
    const plugin = getViewPlugin(pluginId);
    const role = plugin?.viewRole ?? 'sidebarPrimary'; // 默认 VS Code 模型

    switch (role) {
      case 'sidebarPrimary':
        setSidebarView(prev => prev === pluginId ? null : pluginId);
        break;
      case 'tabPrimary':
        setSidebarView(pluginId);
        openOrFocusTab(pluginId);
        break;
      case 'tabOnly':
        openOrFocusTab(pluginId);
        break;
    }
  },
  [openOrFocusTab]
);
```

**4. tabIdentity.ts — 删硬编码（-5 行）：**
```typescript
// 删除这个函数
export function isSidebarOnlyView(pluginId: string): boolean {
  return pluginId === "marketplace";
}

// 新增（可选，其他地方可能用到）
export function getViewRole(pluginId: string): 'sidebarPrimary' | 'tabPrimary' | 'tabOnly' {
  return getViewPlugin(pluginId)?.viewRole ?? 'tabPrimary';
}
```

**5. 现有插件 plugin.json 更新：**
- `plugins/marketplace/plugin.json` → 加 `"viewRole": "sidebarPrimary"`
- `plugins/terminal/plugin.json` → 加 `"viewRole": "tabPrimary"`
- `plugins/settings/plugin.json` → 加 `"viewRole": "tabOnly"`
- `plugins/workspace/plugin.json` → 加 `"viewRole": "tabPrimary"`

---

## 四、哪些地方用到 `isSidebarOnlyView`——需要迁移

```
src/hooks/tabIdentity.ts        → 删掉这个函数
src/App.tsx                     → handleIconClick 用 viewRole switch 替代
src/components/IconBar.tsx       → 不用改——IconBar 只调 handleIconClick，不直接判断
src/components/SidePanel.tsx     → 不用改——SidePanel 读 sidebarView，不关心 viewRole
src/components/MainContent.tsx   → 不用改——MainContent 只渲染标签页，不关心 viewRole
```

总计 ~50 行改动。App.tsx 一处逻辑替代，tabIdentity.ts 删一个函数，5 个 plugin.json 各加一行。

---

## 五、Phase 5.5 之后——每个 Phase 的交互都清楚了

```
Phase 5.5 完成后，后续 Phase 的插件交互逻辑全部由 plugin.json 声明决定：

Phase 6 文件树：
  viewRole: "sidebarPrimary" → 点 📁 → 侧栏切文件树
    侧栏内双击 .md → CommandRegistry.execute → 主区开文档阅读器标签页

Phase 7 卡片工作台：
  viewRole: "tabPrimary" → 点 📊 → 主区开工作台标签页 + 侧栏切卡片属性

Phase 8 OLED：
  viewRole: "tabPrimary" → 点 🖥 → 主区开 OLED 标签页 + 侧栏可选

未来任何第三方插件：
  侧栏为主的（数据库浏览器、Git、包管理器）→ "sidebarPrimary"
  标签页为主的（CAD、代码编辑器、地图）→ "tabPrimary"
  纯标签页的（PDF 阅读器）→ "tabOnly"

永远不需要再改 App.tsx 的交互逻辑。
这就是 VS Code "图标 = 侧栏入口"模型的完整落地。
```

---

## 六、和 Phase 5 / Phase 6 的关系

Phase 5.5 是 Phase 5 和 Phase 6 之间的桥梁。

**依赖 Phase 5：**
- Settings Editor 建好 → 终端 12 个设置项迁移到 `contributes.configuration`
- ConfigurationService 建好 → `useConfiguration("terminal.timestampFormat")` 替代 TerminalPrefsContext

**为 Phase 6 铺路：**
- 文件树的 `plugin.json` 写 `"viewRole": "sidebarPrimary"` 时，Phase 5.5 已经建好了 `viewRole` 机制
- 否则文件树只能被迫作为 `tabPrimary` 加载，或者给 `isSidebarOnlyView` 再加一行硬编码

**实施顺序：**
```
Phase 5 完工 → Phase 5.5（viewRole 机制 + 终端布局重设计）→ Phase 6（文件树 + 主题/语言插件化）
```

Phase 5.5 体量：viewRole ~50 行 + 终端布局重设计 ~100 行 = ~150 行净改动。对标 Phase 2.5（结构整理）和 Phase 3.5（品质打磨）——都是小 Phase，解决上一阶段遗留的架构捷径。

---

## 七、Phase 5.5 不做的东西

| 不做 | 理由 |
|------|------|
| 侧栏拖拽宽度调整 | Phase 4 已实现可拖拽，不做额外改动 |
| 侧栏位置切换（左/右） | VS Code 有这个设置，LinkDesk Phase 7+ |
| Activity Bar 位置切换（上/下/左/右） | VS Code 有这个设置，LinkDesk 不需要——硬件调试容器主视图固定左侧 |
| 侧栏多 tab 切换（Explorer/Search/Git 小标签） | VS Code 的 Side Bar 内部有 tab switcher。LinkDesk 当前每个图标一个侧栏内容，够用 |

---

## 八、终端插件布局重新设计——对标 PlatformIO

### 8.1 为什么终端在 Phase 5.5 要改布局

Phase 4 的终端继承了 V2 的布局模式：
- 侧栏 = 设置表单（时间戳格式 / 编码 / 回显 / 换行符…）
- 工具栏 = COM 口 + 波特率 + 打开按钮（内嵌在主视图顶部）
- 主视图 = CM6 接收区 + Monaco 发送栏

**问题：** Phase 5 建了 Settings Editor 后，终端侧栏里的 12 个设置项都应该迁移到 Settings Editor——它们是配置，不是操作。侧栏空出来之后放什么？把工具栏的 COM/波特率/打开按钮挪到侧栏，变成终端的**控制面板**。

### 8.2 对标 PlatformIO

**PlatformIO 的侧栏 = 控制中心 + 欢迎引导：**

```json
// PlatformIO package.json
"viewsContainers": {
  "activitybar": [{ "id": "platformio", "title": "PlatformIO", "icon": "..." }]
},
"views": {
  "platformio": [
    { "id": "platformio-ide.projectTasks", "name": "Project Tasks", "type": "tree" },
    { "id": "platformio-ide.quickAccess", "name": "Quick Access", "type": "tree" }
  ]
},
"viewsWelcome": [
  {
    "view": "platformio-ide.projectTasks",
    "contents": "You have not yet opened a PlatformIO project.\n[Pick a folder](command:...)\n[Create New Project](command:...)"
  }
]
```

**交互模式：**

```
点 🐜 PlatformIO → Side Bar 显示 PlatformIO 面板
  有项目：
    ├── Project Tasks（树）：Build / Upload / Monitor / Clean…
    └── Quick Access（树）：PIO Home / Open / New Terminal…
  无项目（viewsWelcome）：
    "You have not yet opened a PlatformIO project."
    [Pick a folder]
    [Create New Project]

  侧栏内的操作 → 触发命令 → 主区打开标签页
  "Create New Project" → 主区开 PlatformIO Home 标签页
  "Serial Monitor" → 主区开串口监视器标签页
```

**核心：侧栏 = 操作面板。主区 = 结果/输出。** 侧栏不再塞设置表单——设置走 Settings Editor。

### 8.3 终端布局新设计

**现行（V2 继承）：**

```
┌────┬──────────────────────────────────────┐
│    │ [COM3 ▼] [115200 ▼] [● 打开]         │ ← 工具栏在顶部
│ 📟  │──────────────────────────────────────│
│    │ CM6 接收区                             │
│    │                                        │
│    │                                        │
│    ├──────────────────────────────────────│
│    │ Monaco 发送栏                          │
└────┴──────────────────────────────────────┘
侧栏：时间戳格式 / 行号 / 回显 / 编码 / 换行符 / 定时发送… （设置表单）
```

**新设计（对标 PlatformIO 控制面板）：**

```
┌────┬──────────────────────────────────────┐
│    │ CM6 接收区                             │ ← 主区只有输出
│ 📟  │                                        │
│    │                                        │
│    │                                        │
└────┴──────────────────────────────────────┘

侧栏（终端控制面板）：
  ● COM3 已连接 — 115200              ← 连接状态
  [关闭]                               ← 操作按钮
  ─────────────────────────
  快捷发送：
  [AT] [AT+CWLAP] [AT+CWJAP] [+ 添加]  ← 快捷发送药丸
  ─────────────────────────
  发送栏：
  [________________________] [发送]     ← Monaco 单行发送
  ─────────────────────────
  TX: 1,234  RX: 56,789                ← 收发计数

（未连接时——对标 PlatformIO viewsWelcome）：
  "选择串口设备并打开连接以开始"
  [COM3           ▼]
  [115200         ▼]
  [● 打开]
```

**和 PlatformIO 的对应关系：**

| PlatformIO | LinkDesk 终端 |
|------|------|
| `viewsWelcome` → "Pick a folder" / "Create New Project" | 未连接 → COM口选择器 + 波特率 + 打开按钮 |
| `views.platformio` → Project Tasks 树 | 已连接 → 关闭按钮 + 快捷发送 + 发送栏 |
| `views.platformio` → Quick Access 树 | 快捷发送药丸（可编辑列表） |
| 侧栏按钮 → 命令 → 主区开标签页 | 侧栏"发送"→ invoke("send_data") → 主区 CM6 显示回显 |

### 8.4 终端插件文件变动

```
plugins/terminal/
  ├── index.tsx         ← 瘦身：删除工具栏 + 发送栏 + 快捷发送（~200 行删）
  │                        只保留 CM6 接收区 + 数据管道逻辑
  ├── toolbar.tsx       ← 删除。内容迁入 sidebar.tsx
  ├── toolbar.css       ← 删除
  ├── sidebar.tsx       ← 重写：从"设置表单"变为"控制面板"
  │                        COM/波特率/打开关闭（未连接时）
  │                        + 关闭按钮 + 快捷发送 + 发送栏（已连接时）
  ├── sidebar.css        ← 重写
  ├── statusBar.tsx      ← 不变（TX/RX 计数等状态栏贡献）
  └── plugin.json        ← 加 "viewRole": "tabPrimary"
                          加 contributes.configuration（12 个设置项迁移到 Settings Editor）
```

**为什么主区不改 `tabPrimary`：** 终端输出是用户始终需要看到的——点 📟 图标 → 主区打开/聚焦终端标签页 + 侧栏显示控制面板。这和现在一样，只是侧栏内容从"设置"变成了"控制面板"。`tabPrimary` 行为不变，侧栏内容换了。

### 8.5 设置项迁移到 Settings Editor

终端侧栏原有的 12 个设置项，全部迁移到 `plugin.json` 的 `contributes.configuration`：

```json
{
  "contributes": {
    "configuration": {
      "title": "终端",
      "properties": {
        "terminal.timestampFormat": {
          "type": "string", "default": "HH:mm:ss:fff",
          "enum": ["HH:mm:ss", "HH:mm:ss:fff", "无"],
          "description": "接收区时间戳格式"
        },
        "terminal.showLineNumbers": {
          "type": "boolean", "default": true,
          "description": "显示行号"
        },
        "terminal.showEcho": {
          "type": "boolean", "default": true,
          "description": "显示已发送消息的回显"
        },
        "terminal.encoding": {
          "type": "string", "default": "utf-8",
          "enum": ["utf-8", "gb2312", "shift-jis", "latin-1"],
          "description": "接收区字符编码"
        },
        "terminal.lineEnding": {
          "type": "string", "default": "\\r\\n",
          "enum": ["\\r\\n", "\\n", "\\r"],
          "description": "发送换行符"
        }
        // ... 其余 7 个设置项
      }
    }
  }
}
```

**终端侧栏删除的内容（~85 行 sidebar.tsx）：**
- `<Toggle>` 时间戳 / 行号 / 系统消息 / 回显 / 暂停时自动滚动 / 发送后清空
- `<Select>` 编码 / 换行符 / 定时发送间隔
- `<FormRow>` 全部 12 个设置项的渲染

**替换为：** Settings Editor 自动渲染——Phase 5 建好 Settings Editor 后，终端这 12 个配置项零代码出现。

### 8.6 改动量

| 文件 | 操作 | 行数 |
|------|------|:--:|
| `sidebar.tsx` | 重写：设置表单 → 控制面板 | ~100 |
| `sidebar.css` | 重写：表单样式 → 控制面板样式 | ~40 |
| `index.tsx` | 瘦身：删除工具栏 + 发送栏 + 快捷发送逻辑 | -200 |
| `toolbar.tsx` | 删除 | -50 |
| `toolbar.css` | 删除 | -20 |
| `plugin.json` | 加 `contributes.configuration`（12 项） | +40 |
| **净变动** | | **~ -90 行** |

代码变少，职责更清——终端 index.tsx 只管输出，侧栏只管操作，设置走 Settings Editor。
