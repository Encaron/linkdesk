# Phase 7d — 壳完善与抛光

> 2026-07-22。从 [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) §二 7d 展开（后半——壳完善 + 通知 + 通用 API + 视觉 + 兼容）。

---

# 第一部分：壳完善

## 一、标题栏暗色化 + ☰ 汉堡菜单

**对标 VS Code 浏览器版：** VS Code 桌面版有完整菜单栏，浏览器版用顶栏左侧的 ☰ 图标收起来。LinkDesk 对标浏览器版——☰ 汉堡菜单，不占一整行。

**Phase 7 只建四个菜单——核心无知原则：**

VS Code 的八个菜单（File / Edit / Selection / View / Go / Run / Terminal / Help）是 VS Code 自己的功能决定的。LinkDesk 的核心不知道未来有没有 Run/Debug、有没有代码编辑器的 Go to File。**开空菜单等着未来功能 = V2.6 模式。**

| VS Code 有 | LinkDesk Phase 7 | 为什么 |
|------|:--:|------|
| **Terminal** | ❌ | 终端是插件，不应该在核心菜单栏占据顶级位置 |
| **Run** | ❌ | 无调试/任务系统 |
| **Go** | ❌ | 代码编辑器的功能，代码编辑器插件自己贡献 |
| **Selection** | ❌ | 只有 Select All——放 Edit 里就够了 |

```
┌──────────────────────────────────────────────────┐
│ ☰  COM3 ▼  115200 ▼  [● 打开]     中/EN  ☀  ⚙  │
├────┬──────────┬─────────────────────────────────┤
│    │          │                                  │
```

点 ☰ 弹出：

```
  File
    ├ Open Folder…          Ctrl+K Ctrl+O
    ├ Open Recent ▼
    ├ ─────────────
    ├ Import Workspace…
    ├ Export Workspace…
    ├ ─────────────
    ├ Exit                  Alt+F4

  Edit
    ├ Undo                  Ctrl+Z
    ├ Redo                  Ctrl+Y
    ├ ─────────────
    ├ Cut                   Ctrl+X
    ├ Copy                  Ctrl+C
    ├ Paste                 Ctrl+V
    ├ Select All            Ctrl+A

  View
    ├ Command Palette…      Ctrl+Shift+P
    ├ Toggle Sidebar        Ctrl+B
    ├ Settings…             Ctrl+,
    ├ ─────────────
    ├ Theme ▼
    │   ├ Dark
    │   ├ Light
    │   └ Browse Themes…

  Help
    ├ About
    ├ Open Log Folder
```

**以后能加新菜单吗？能。** ☰ 菜单和右键菜单走同一套 `MenuService`，不存在"写死"：

```typescript
// ☰ 只是一个多了一层分组的 ContextMenu 消费端
<HamburgerMenu />
  → MenuService.getMenuItems("menuBar")
    → 核心注册了 File / Edit / View / Help 四个组
      → Phase 7+ 终端插件贡献 submenu：
        { "submenus": [{ "id": "terminalMenu", "label": "终端" }],
          "menus": { "menuBar": ["terminalMenu"], "terminalMenu": ["terminal.new"] } }
        → ☰ 自动多出"终端"顶级菜单，一行代码不改
```

**关键：** ☰ 只是一个消费端，底层和 ContextMenu、齿轮菜单共享完全相同的 `MenuService.getMenuItems()`。右键加新项不需要改框架，菜单栏加新组也不需要。

**实现——消费 Phase 5 的 CommandRegistry + MenuService：**

```typescript
// 菜单结构声明（不是硬编码——每一项引用 CommandRegistry 里的命令）
const MENU_BAR = [
  {
    id: "File",
    items: [
      { command: "workbench.action.openFolder" },
      { command: "workbench.action.openRecent" },
      { separator: true },
      { command: "workbench.action.importWorkspace" },
      { command: "workbench.action.exportWorkspace" },
      { separator: true },
      { command: "workbench.action.exit" },
    ]
  },
  {
    id: "Edit",
    items: [
      { command: "editor.action.undo" },
      { command: "editor.action.redo" },
      { separator: true },
      { command: "editor.action.cut" },
      { command: "editor.action.copy" },
      { command: "editor.action.paste" },
    ]
  },
  { id: "View", items: [...] },
  { id: "Help", items: [...] },
]

// ☰ 组件渲染（~80 行）
// 每个 item → CommandRegistry.get(item.command)
//   → 拿 title → 显示菜单文字
//   → 拿 keybinding → 显示快捷键提示（Ctrl+K Ctrl+O）
//   → 点击 → CommandRegistry.execute(item.command)
```

**标题栏暗色化：** Tauri v2 的 `tauri.conf.json` 支持窗口主题暗色 → Windows 11 标题栏变暗。独立于 ☰ 汉堡菜单。

**未来扩展：** 设置中加 `"menuStyle": "hamburger" | "menubar"`。默认 `hamburger`，后期可实现 Tauri 原生菜单栏替代 ☰。两个模式共享同一份菜单结构声明，切换只改渲染方式。

---

## 二、Workspace 导入导出

**导入：** Tauri dialog 选 `.linkdesk-workspace` 文件（实际是 zip/JSON）→ 解压到 workspace 目录 → WorkspaceService.addFolder → 文件树刷新。

**导出：** WorkspaceService.activeFolder → 打包 `workspace.json` + `.linkdesk/settings.json` + 卡片数据 → 另存为。~50 行。

---

## 三、欢迎页集成

```
状态 A：未打开文件夹
  → 文件树区域显示 "打开文件夹" 按钮 + recentFolders 列表
  → 欢迎页的"最近"区域同步显示

状态 B：已打开文件夹
  → 文件树显示文件夹内容
  → 标题栏显示文件夹名（对标 VS Code 窗口标题）

状态 C：用户关闭文件夹
  → 回到状态 A
```

Phase 4 的欢迎页已有 `recentViews`（最近打开的标签页）。加 `recentFolders`（最近打开的文件夹）。

---

# 第二部分：通知系统全功能

## 四、通知进度条（~50 行）

**对标 VS Code：** `vscode.window.withProgress()`。

```typescript
// NotificationService 新方法
showProgress(title: string, options?: {
  cancellable?: boolean;
  total?: number;
}): ProgressHandle

interface ProgressHandle {
  report(increment: number, message?: string): void;
  finish(message?: string): void;
  cancel(): void;
}
```

## 五、通知来源过滤 / Do Not Disturb（~40 行）

**对标 VS Code：** `notifications.doNotDisturbMode` 设置 + 按来源过滤。

```typescript
setDoNotDisturb(enabled: boolean): void;
setSourceFilter(pluginId: string, enabled: boolean): void;
```

plugin.json 可声明通知来源：
```json
{
  "contributes": {
    "notificationSources": [
      { "id": "terminal.portErrors", "label": "串口错误", "defaultEnabled": true }
    ]
  }
}
```

## 六、"Don't show again" 持久化（~10 行）

通知按钮加 `isCloseAffordance: true` → `localStorage` 持久化标记 → 下次不弹。

## 七、完整 Notification Center 面板（~100 行）

铃铛图标 → 通知列表（未读/已读、按时间排序、按 source 分组）。

```
┌─────────────────────────────┐
│ 🔔 通知 (3)           ✕ 清除 │
├─────────────────────────────┤
│ 📟 终端  串口连接已断开  2分钟前│
│ 🧩 市场  已安装 3 个插件 10分钟前│
│ ⚙ 系统  设置已保存      1小时前│
└─────────────────────────────┘
```

## 八、通知 source 归类（~30 行）

`getNotificationsBySource(): Map<string, Notification[]>` → 面板按插件分组渲染。

---

# 第三部分：通用 API

## 九、动态 StatusBarItem（运行时创建）（~50 行）

**现状：** StatusBarItem 只能通过 manifest `contributes.statusBar` 静态声明。

**对标 VS Code：** `vscode.window.createStatusBarItem()`。

```typescript
import { createStatusBarItem } from "../src/core/StatusBarService";

function MyView() {
  useEffect(() => {
    const item = createStatusBarItem("myPlugin.cursorPos", {
      label: "行 1, 列 1", align: "right", priority: 10,
    });
    return () => item.dispose();  // unmount → 自动移除
  }, []);
}
```

## 十、插件 i18n 注册（内联翻译）（~40 行）

**现状：** 插件用 `t()` 和核心共用 i18next——没有自带翻译文件机制。

```json
// plugin.json
{ "contributes": { "languages": [{ "id": "zh", "path": "zh.json" }] } }
```

loader 检测 → `i18next.addResourceBundle(lang, pluginId, json)`。插件 t() 先查自己的翻译表。

## 十一、Toggle 命令动态标题

**现状：** 命令面板 toggle 类命令 title 是静态字符串，不随状态变化：
- `terminal.toggleEcho` — 永远"关闭消息回显"（不管当前是开是关）
- `terminal.toggleSendMode` — 永远"切换到 HEX 发送"

**对标 VS Code：** `toggle` 语义命令根据 context key 自动换 title。

**方案：** `registerCommand` 支持 `titleWhen` 可选字段：

```typescript
registerCommand("terminal", {
  id: "terminal.toggleEcho",
  title: "关闭消息回显",
  titleWhen: { "true": "打开消息回显", "false": "关闭消息回显" },
  stateKey: "terminal.showEcho",
  // ...
});
```

命令面板渲染时读 `stateKey` → 匹配 `titleWhen` → 显示对应文案。

---

# 第四部分：视觉 + 兼容

## 十二、contributes.icons（共享图标）（~30 行）

插件贡献图标 → 其他插件使用：

```json
// 插件 A 贡献
{ "contributes": { "icons": { "stm32-chip": { "description": "STM32 芯片图标", "default": { "fontPath": "icons.woff", "fontCharacter": "\\e001" } } } } }

// 插件 B 使用
{ "icon": "stm32-chip", "iconSource": "shared" }
```

## 十三、标题栏汉堡菜单 ☰ 完整版（~100 行）

Phase 7 做基础四组（File/Edit/View/Help）。此任务补：
- 快捷键提示（菜单项右侧灰字）
- 禁用态灰显（when 条件不满足）
- 插件动态贡献的顶级菜单组

## 十四、V2 配置导入（~60 行）

V2 `prefs.json` → V3 `settings.json` 迁移。`文件 → 导入 → V2 配置...` → Tauri dialog → 映射表转换。

---

## 十五、任务清单

### 壳完善

| # | 任务 | 说明 |
|:--:|------|------|
| 1 | 欢迎页集成——"打开文件夹"入口 + recentFolders | UI 完善 |
| 2 | 标题栏暗色化 + ☰ 基础四组（File/Edit/View/Help） | 壳功能 |
| 3 | Workspace 导入导出 | 壳功能 |

### 通知系统

| # | 任务 | 说明 |
|:--:|------|------|
| 4 | 通知进度条 | 通知增强 |
| 5 | 通知来源过滤 / Do Not Disturb | 通知增强 |
| 6 | "Don't show again" 持久化 | 通知增强 |
| 7 | 完整 Notification Center 面板 | 通知增强 |
| 8 | 通知 source 归类（按插件分组） | 通知增强 |

### 通用 API

| # | 任务 | 说明 |
|:--:|------|------|
| 9 | 动态 StatusBarItem（运行时创建） | 通用 API |
| 10 | 插件 i18n 注册（内联翻译） | 通用 API |
| 11 | Toggle 命令动态标题 | 命令面板 |

### 视觉 + 兼容

| # | 任务 | 说明 |
|:--:|------|------|
| 12 | contributes.icons（共享图标） | 视觉 |
| 13 | 标题栏 ☰ 完整版（快捷键提示 + 禁用态灰显 + 插件菜单） | 视觉 |
| 14 | V2 配置导入 | 兼容 |

---

## 十六、Phase 6 已消化的工作量

以下旧 P6e/P6.5 项目已被 Phase 6 提前完成，7d 不再做：

| 已消化 | 去处 |
|------|------|
| SerialContext 迁出 core/ | P6b 终端归一化 |
| 术语迁移 portOpen → sourceOpen | P6b 终端归一化 |
| Chord 快捷键（Ctrl+K Ctrl+S） | P6c 基础设施缺口 |
| keybindings.json 用户自定义 | P6c 基础设施缺口 |
| DialogService（替换 window.confirm） | P6c 基础设施缺口 |
| 命令面板模糊搜索 | P6c 基础设施缺口 |
| Toggle 命令动态标题 | Phase 5.5 已修 (`f476c21`) ✅ |

**7d 实际工作量比旧 P6e+P6.5 减少了 7 项。**

---

## 十七、多 WebView 注意事项

### 通知

- NotificationService 在壳 WebView 中运行
- 插件通过 IPC 发通知：`ipc.notify({ title, message, source: pluginId })`
- Notification Center 面板在壳 WebView 中渲染

### 标题栏 ☰

- ☰ 菜单在壳 WebView 中渲染
- 插件通过 IPC 扩展菜单：`ipc.registerMenu("menuBar", { ... })`

---

## 十八、相关文档

- [LinkDesk-Phase7-设计.md](./LinkDesk-Phase7-设计.md) — Phase 7 主设计
- [LinkDesk-Phase7-Profile与激活.md](./LinkDesk-Phase7-Profile与激活.md) — 7d 前半（Profile + 激活）
- [LinkDesk-Phase6-基础设施缺口.md](../phase6_底层加固/LinkDesk-Phase6-基础设施缺口.md) — 已消化旧 P6e 的 5 项
- [LinkDesk-Phase6-终端归一化.md](../phase6_底层加固/LinkDesk-Phase6-终端归一化.md) — 已消化旧 P6e 的 2 项
