# E3d — Profile 与壳完善

> 2026-07-24。从旧 P7d（Profile与激活 + 壳完善与抛光）合并迁移，适配 Electron。
> **性质：** Profile 决定谁参与游戏，activationEvents 决定什么时候加载。壳完善 = 最后的体验打磨。
> **E3d 是架构终点——此后框架永远不改。**

---

# 第一部分：Profile 与激活

## 一、Profile 系统——插件集合的声明式管理

一个 `.linkdesk/profiles/<name>.json` 定义 "这个场景用哪些插件 + 什么设置 + 什么主题 + 哪个 workspace"。

```json
{
  "name": "STM32 PID 调参",
  "icon": "chip",
  "plugins": ["terminal", "protocol-bracket", "card-gauge", "card-slider"],
  "settings": { "app.theme": "Dark", "terminal.baudRate": 115200 },
  "workspace": "pid_tuning"
}
```

**切换 Profile 时自动：**
- 禁用不在列表中的插件 → 图标栏图标消失
- 启用列表中的插件 → 图标栏图标出现
- 应用 settings → 主题、语言、串口默认值全换
- 打开对应 workspace → 布局就位

**交互：** Ctrl+Shift+P → "切换 Profile…" → QuickPick 列出所有 profile。

### 🔴 五维验证

| # | 维度 | 验证方法 | 失败后果 |
|:--:|------|------|------|
| 1 | 插件加载列表 | `PluginStateService.getAll()` | "幽灵插件"——禁用后仍在运行 |
| 2 | settings 值 | `ConfigurationService.inspect(key)` | 波特率/主题仍是上一个 Profile 的值 |
| 3 | 主题 CSS 变量 | `getComputedStyle(body).getPropertyValue('--bg')` | UI 颜色半新半旧 |
| 4 | 语言 | `i18next.language` + UI 文字实际显示 | 碎片化体验 |
| 5 | 布局（标签页+工作区） | 检查 tabs[] + activeGroupId + workspace root | 标签页残留 |

**对标 VS Code：** Profile 切换失败时回退到切换前的状态——不是静默，必须 toast 报告哪个操作失败了。

---

## 二、activationEvents——按需激活

```json
{
  "name": "CAD 查看器",
  "activationEvents": ["onCommand:cad.importDxf", "onFileOpen:.dxf"]
}
```

**完整流程：**
```
用户切换到 "STM32 PID" Profile
  → Profile 声明 plugins: [terminal, card-gauge, cad, ...]

加载阶段：
  terminal → activationEvents 为空 → 启动时 import()
  card-gauge → 同上 → 启动时 import()
  cad → activationEvents: ["onFileOpen:.dxf"] → 只注册 manifest，不 import()
       → 用户双击 .dxf → 首次 import() → 注册到 Registry

多 WebView 下：
  activationEvents 触发 → 创建插件 WebContentsView → 加载 JS → React render
```

**触发源：** FileAssociationService（`onFileOpen:.dxf`）、CommandRegistry（`onCommand:xxx`）、CoreEvents（`onPortOpen` 等）。

---

## 三、extensionDependencies

```json
{ "extensionDependencies": ["file-tree"] }
```

loader 检查：file-tree 没安装/被禁用 → 不加载 → toast "需要文件树插件"。~40 行。

---

# 第二部分：壳完善

## 四、标题栏暗色化 + ☰ 汉堡菜单

对标 VS Code 浏览器版的 ☰ 图标。Phase 7 只建四个菜单——核心无知原则：

```
┌──────────────────────────────────────────────────┐
│ ☰  COM3 ▼  115200 ▼  [● 打开]     中/EN  ☀  ⚙  │
├────┬──────────┬─────────────────────────────────┤
```

```
  File
    ├ Open Folder…              Ctrl+K Ctrl+O
    ├ Open Recent ▼
    ├ Import Workspace…
    ├ Export Workspace…
    ├ Exit                      Alt+F4

  Edit
    ├ Undo / Redo              Ctrl+Z / Ctrl+Y
    ├ Cut / Copy / Paste / Select All

  View
    ├ Command Palette…          Ctrl+Shift+P
    ├ Toggle Sidebar            Ctrl+B
    ├ Settings…                 Ctrl+,
    ├ Theme ▼ / Language ▼

  Help
    ├ About / Open Log Folder
```

菜单走 MenuService——不是硬编码。插件贡献顶级菜单组 → ☰ 自动多一项。

**标题栏暗色化：** Electron `BrowserWindow` 的 `titleBarStyle` / `backgroundColor`。

---

## 五、齿轮菜单完整版

```
插件 → 齿轮菜单：
  ├── 启用 / 禁用         → 已有
  ├── 卸载               → 已有
  ├── 配置 [插件名]...    → 跳到 Settings Editor 对应分组
  ├── 查看日志            → 打开 Output 面板对应频道
  └── 重新安装            → 已有
```

齿轮菜单内容 = `MenuService.getMenuItems(MenuId.ExtensionGear, context)`——不是硬编码列表。

---

## 六、输出面板 UI

Phase 5 建了 `LogChannel` 数据通道，但查看器 UI 没做。

```
输出面板：
  ├── 频道选择器（"终端" / "协议-SBQ" / "CAD" / "通用"）
  ├── 日志列表（等宽字体、按 source 着色、自动滚动）
  └── 清空 / 导出按钮
```

对标 VS Code Output 面板。

---

## 七、通知系统全功能

### 7.1 通知进度条

```typescript
showProgress(title: string, options?: { cancellable?: boolean; total?: number }): ProgressHandle
interface ProgressHandle {
  report(increment: number, message?: string): void;
  finish(message?: string): void;
  cancel(): void;
}
```

### 7.2 通知来源过滤 / Do Not Disturb

```typescript
setDoNotDisturb(enabled: boolean): void;
setSourceFilter(pluginId: string, enabled: boolean): void;
```

plugin.json 可声明通知来源：
```json
{ "contributes": { "notificationSources": [{ "id": "terminal.portErrors", "label": "串口错误", "defaultEnabled": true }] } }
```

### 7.3 "Don't show again" 持久化

通知按钮 `isCloseAffordance: true` → localStorage 持久化 → 下次不弹。

### 7.4 完整 Notification Center 面板

铃铛图标 → 通知列表（未读/已读、按时间排序、按 source 分组）。

### 7.5 通知 source 归类

`getNotificationsBySource(): Map<string, Notification[]>` → 面板按插件分组渲染。

**多 WebView 注意事项：**
- NotificationService 在壳 WebView 中运行
- 插件通过 IPC 发通知：`ipc.notify({ title, message, source: pluginId })`
- Notification Center 面板在壳 WebView 中渲染

---

## 八、动态 StatusBarItem

```typescript
const item = createStatusBarItem("myPlugin.cursorPos", {
  label: "行 1, 列 1", align: "right", priority: 10
});
// unmount → dispose() 自动移除
```

对标 VS Code `vscode.window.createStatusBarItem()`。

---

## 九、Toggle 命令动态标题

```typescript
registerCommand("terminal", {
  id: "terminal.toggleEcho",
  title: "关闭消息回显",
  titleWhen: { "true": "打开消息回显", "false": "关闭消息回显" },
  stateKey: "terminal.showEcho",
});
```

命令面板渲染时读 `stateKey` → 匹配 `titleWhen` → 显示对应文案。

---

## 十、欢迎页集成

```
状态 A：未打开文件夹 → "打开文件夹" 按钮 + recentFolders 列表
状态 B：已打开文件夹 → 文件树显示内容 + 标题栏显示文件夹名
状态 C：关闭文件夹 → 回到 A
```

Phase 4 欢迎页已有 `recentViews`。加 `recentFolders`。

---

## 十一、终端会话持久化

Phase 5.5c 的会话数据存在内存（`useTerminalSessions` 模块级单例）。E3d 写 `.linkdesk/sessions.json`（消费 E2c FileService）：

```
软件关闭 → 最后一次 sessions 快照写入 sessions.json
软件启动 → loadSessionsFromDisk() → 恢复到内存
文件树双击 .linkdesk/sessions.json → 打开编辑器
```

---

## 十二、Workspace 导入导出

导入：Electron dialog 选 `.linkdesk-workspace` → 解压到 workspace 目录 → WorkspaceService.addFolder。
导出：WorkspaceService.activeFolder → 打包 `workspace.json` + settings + 卡片数据 → 另存为。~50 行。

---

## 十三、contributes.icons + ☰ 完整版 + V2 配置导入

### contributes.icons

```json
// 插件 A 贡献
{ "contributes": { "icons": { "stm32-chip": { "description": "STM32 芯片图标", "default": { "fontPath": "icons.woff", "fontCharacter": "\\e001" } } } } }
// 插件 B 使用
{ "icon": "stm32-chip", "iconSource": "shared" }
```

### ☰ 完整版

- 快捷键提示（菜单项右侧灰字）
- 禁用态灰显（when 条件不满足）
- 插件动态贡献的顶级菜单组

### V2 配置导入

V2 `prefs.json` → 映射表转换。`文件 → 导入 → V2 配置...`。

---

## 十四、任务清单

### Profile + 激活

| # | 任务 | 行数 |
|:--:|------|:--:|
| 39 | ProfileService + loadProfile / switchProfile + 五维验证 | +150 |
| 40 | activationEvents——onCommand / onFileOpen / onPortOpen | +40 |
| 41 | extensionDependencies——加载前检查缺失依赖 | +40 |

### 壳完善

| # | 任务 | 行数 |
|:--:|------|:--:|
| 42 | 标题栏暗色化 + ☰ 基础四组（File/Edit/View/Help） | +120 |
| 43 | 齿轮菜单完整版——context key 驱动 | +40 |
| 44 | 输出面板 UI——LogChannel 消费端 | +80 |
| 45 | 欢迎页集成——"打开文件夹"入口 + recentFolders | +40 |
| 46 | Workspace 导入导出 | +50 |

### 通知系统

| # | 任务 | 行数 |
|:--:|------|:--:|
| 47 | 通知进度条 | +50 |
| 48 | 通知来源过滤 / Do Not Disturb | +40 |
| 49 | "Don't show again" 持久化 | +10 |
| 50 | 完整 Notification Center 面板 | +100 |
| 51 | 通知 source 归类（按插件分组） | +30 |

### 通用 API + 视觉 + 兼容

| # | 任务 | 行数 |
|:--:|------|:--:|
| 52 | 动态 StatusBarItem（运行时创建） | +50 |
| 53 | Toggle 命令动态标题 | +30 |
| 54 | contributes.icons（共享图标） | +30 |
| 55 | ☰ 完整版（快捷键提示 + 禁用态灰显 + 插件菜单） | +100 |
| 56 | V2 配置导入 | +60 |

### E2 已消化的工作量

以下项目 E2 已完成，E3d 不再做：

| 已消化 | 去处 |
|------|------|
| SerialContext 迁出 core/ | E2b |
| 术语迁移 portOpen → sourceOpen | E2b |
| Chord 快捷键 | E2c |
| keybindings.json | E2c |
| DialogService | E2c |
| 命令面板模糊搜索 | E2c |
| Toggle 命令动态标题 | Phase 5.5 已修 ✅ |

---

## 十五、汇总

| 分类 | 任务数 | 总行数 |
|------|:--:|:--:|
| Profile + 激活 | 3 | ~230 |
| 壳完善 | 5 | ~330 |
| 通知系统 | 5 | ~230 |
| 通用 API + 视觉 + 兼容 | 5 | ~270 |
| **合计** | **18** | **~1,060 行** |

---

## 十六、完工标准

```
切 Profile → 五维验证全过
activationEvents → 按需激活插件
齿轮菜单 → 5 项全由 context key 驱动
输出面板 → 按频道切换日志
通知系统 → 进度条/过滤/DND/Center 全功能
StatusBarItem → 运行时创建+自动清理
欢迎页 → 三种状态切换
标题栏 → ☰ 四组菜单 + 快捷键提示 + 暗色
Workspace → 导入导出正常
V2 配置 → 导入映射正确
```

---

> **← 上一份：** `03-E3c-语言引擎跨进程.md`
> **E3 索引：** `00-README.md`
> **🏁 E 编号到此为止。此后全是插件。**
