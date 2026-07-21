# Phase 6.5 — 抛光与补齐

> 2026-07-21。初版。
> 2026-07-21 修订：文件相关项（搜索/多选/编码/拖拽/JSON schema/多工作区/文件图标/装饰器/产品图标）回归 Phase 6——Phase 6 本身就是"编辑能力"，不应该拆到 6.5。
>
> **Phase 6.5 = Phase 6 编辑能力就位后，剩下的纯抛光项——不涉及文件操作，不新增子系统。**

---

## 一、Phase 6 做了什么——先搞清楚 6.5 的边界

当 Phase 6 做完（含 6a/6b/6c），你已经拥有：

```
Phase 6a: 文件树基础闭环
  - 文件树（浏览/打开/关闭/右键 MenuId.FileContext）
  - FileService + WorkspaceService + 文件关联（fileAssociations）
  - Monaco JSON 编辑器标签页（打开 settings.json 编辑）
  - 系统文件拖入窗口 + Reopen Closed Tab

Phase 6b: 编辑体验完整闭环
  - 文件搜索（Ctrl+Shift+F 跨文件内容搜索）
  - 文件树多选/批量操作 + 编码检测/切换
  - 拖拽文件树节点到编辑区
  - JSON schema 自动补全 + 多工作区（Multi-root）
  - 文件图标主题 + 文件装饰器框架（FileDecorationProvider）

Phase 6c: 主题/语言引擎 + Profile + 壳完善
  - 主题系统插件化 + 主题浏览器
  - 语言系统插件化 + 退路系统
  - Profile 系统 + activationEvents + 插件依赖声明
  - 齿轮菜单完整版 + 输出面板 UI
  - 欢迎页集成 + 标题栏暗色化 + 系统菜单 + Workspace 导入导出
```

**Phase 6 的本质 = 编辑能力。** 文件树 + 文件操作 + 文本编辑 + 主题/语言引擎 = 一个完整的文件编辑基础设施。不做的是代码编辑器的语言服务（Go to Definition / 重构 / IntelliSense）——那些属于具体插件。

**Phase 6.5 = 编辑能力之外的抛光。** 以下 10 项和文件操作无关——是框架的"体验完整度"。

---

## 二、6.5 清单——11 项

| # | 来源 | 项目 | 原归属 | 类别 |
|:--:|:--:|------|:--:|------|
| 1 | P5 | 通知进度条 | 7 | 通知 |
| 2 | P5 | 通知来源过滤 / Do Not Disturb | 7 | 通知 |
| 3 | P5 | "Don't show again" 持久化 | 7 | 通知 |
| 4 | P5 | 完整 Notification Center 面板 | 7 | 通知 |
| 5 | P5 | 通知 source 归类（按插件分组） | 7 | 通知 |
| 6 | P5 | 动态 StatusBarItem（运行时创建） | 6 | 通用 API |
| 7 | P5 | contributes.icons（共享图标） | 6 | 视觉 |
| 8 | P5 | 插件 i18n 注册（内联翻译） | 6 | 通用 API |
| 9 | P6 | 标题栏汉堡菜单 ☰ 完整版 | 7 | 视觉 |
| 10 | P6 | V2 配置导入 | 7 | 兼容 |
| **11** | **P5** | **Toggle 命令动态标题** | **5** | **命令面板** |

---

## 三、拆分 3 批（6.5a-6.5c）

所有项不依赖 Phase 6 的文件树/编辑器——依赖的是 Phase 5 基础设施。可以和 Phase 6 并行。

| 批次 | 内容 | 行数 | 风险 | 依赖 |
|:--:|------|:--:|:--:|------|
| **6.5a** | 通知系统全功能（5 项） | ~230 | 低 | Phase 5 NotificationService |
| **6.5b** | 通用 API + 命令面板（3 项） | ~140 | 低 | Phase 5 StatusBarService + i18next + CommandRegistry |
| **6.5c** | 视觉 + 兼容（3 项） | ~190 | 低 | Phase 5 MenuService + codicon |

---

## 四、6.5a — 通知系统全功能（~230 行）

### 4.1 通知进度条（~50 行）

**现状：** Toast 组件支持静态渲染（标题 + 正文 + 按钮）。没有进度指示。

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

### 4.2 通知来源过滤 / Do Not Disturb（~40 行）

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

### 4.3 "Don't show again" 持久化（~10 行）

通知按钮加 `isCloseAffordance: true` → `localStorage` 持久化标记 → 下次不弹。

### 4.4 完整 Notification Center 面板（~100 行）

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

### 4.5 通知 source 归类（~30 行）

`getNotificationsBySource(): Map<string, Notification[]>` → 面板按插件分组渲染。

---

## 五、6.5b — 通用 API（~90 行）

### 5.1 动态 StatusBarItem（运行时创建）（~50 行）

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

### 5.2 插件 i18n 注册（内联翻译）（~40 行）

**现状：** 插件用 `t()` 和核心共用 i18next——没有自带翻译文件机制。

```json
// plugin.json
{ "contributes": { "languages": [{ "id": "zh", "path": "zh.json" }] } }
```

loader 检测 → `i18next.addResourceBundle(lang, pluginId, json)`。插件 t() 先查自己的翻译表。

---

## 六、6.5c — 视觉 + 兼容（~190 行）

### 6.1 contributes.icons（共享图标）（~30 行）

插件贡献图标 → 其他插件使用：

```json
// 插件 A 贡献
{ "contributes": { "icons": { "stm32-chip": { "description": "STM32 芯片图标", "default": { "fontPath": "icons.woff", "fontCharacter": "\\e001" } } } } }

// 插件 B 使用
{ "icon": "stm32-chip", "iconSource": "shared" }
```

### 6.2 标题栏汉堡菜单 ☰ 完整版（~100 行）

Phase 6 做基础四组（File/Edit/View/Help）。6.5c 补：
- 快捷键提示（菜单项右侧灰字）
- 禁用态灰显（when 条件不满足）
- 插件动态贡献的顶级菜单组

### 6.3 V2 配置导入（~60 行）

V2 `prefs.json` → V3 `settings.json` 迁移。`文件 → 导入 → V2 配置...` → Tauri dialog → 映射表转换。

### 6.4 Toggle 命令动态标题（~50 行）

**现状：** 命令面板 toggle 类命令 title 是静态字符串，不随状态变化：
- `terminal.toggleEcho` — 永远"关闭消息回显"（不管当前是开是关）
- `terminal.toggleSendMode` — 永远"切换到 HEX 发送"
- `terminal.toggleLineNumbers` — 永远"隐藏行号"

**对标 VS Code：** `toggle` 语义命令根据 context key 自动换 title。

**方案：** `registerCommand` 支持 `titleWhen` 可选字段：

```typescript
registerCommand("terminal", {
  id: "terminal.toggleEcho",
  title: "关闭消息回显",
  titleWhen: { "true": "打开消息回显", "false": "关闭消息回显" },
  stateKey: "terminal.showEcho",  // context key 或配置 key
  // ...
});
```

命令面板渲染时读 `stateKey` → 匹配 `titleWhen` → 显示对应文案。

**涉及文件：** `CommandRegistry.ts` + 命令面板组件 + `terminal/plugin.json`。

---

## 七、Phase 6.5 之后——终端侧栏专项进化

> 终端是用户最常用的插件。6.5 通用抛光做完后，终端侧栏有一次专项升级。
> 详见 [V3-Phase5.5-终端侧栏两次进化.md](../phase5.5_交互对标/V3-Phase5.5-终端侧栏两次进化.md)

**第一次进化（5.5）：** 侧栏从"12 设置项表单"变成"控制面板 + 可折叠树 + 标签页改名"

```
┌──────────────────────┐
│ 📟 COM3 PID调试 [✎]   │  ← 可编辑会话名 → 标签页标题联动
│ COM3 ● 已连接  [断开]  │
├──────────────────────┤
│ ▶ 快捷发送        [编辑]│  ← 可折叠区块（默认展开）
│ ▶ 发送栏              │
│ ▶ 收发统计            │
├──────────────────────┤
│ ▼ 设置               │  ← 可折叠区块（默认合上）
│   显示行号 [✓]         │
│   显示回显 [✓]         │
└──────────────────────┘
```

**第二次进化（6 之后）：** 会话持久化——终端会话存为 `.session.json` 文件，文件树可见，双击恢复

```
┌──────────────────────┐
│ ▼ 终端会话 (3)   [+ 新建]│  ← 会话列表——点击打开，右键删除
│   📟 COM3 PID调试  [✕] │
│   📟 COM5 CAN监控   [✕] │
│   📟 COM7 空闲      [✕] │
├──────────────────────┤
│ ▶ 控制面板            │
│ ▶ 设置               │
└──────────────────────┘
```

核心交付——`<SidebarSection>` 通用可折叠组件：终端先用，文件树/Git/数据库浏览器全复用。

---

## 八、完整路线图

```
Phase 5f → 5g → 5h → 5.5 → Phase 6 → Phase 6.5 → 终端侧栏进化 → Phase 7
                        三栏对标   编辑能力    通用抛光    会话管理+可折叠   第一个消费者插件
```

---

## 九、Phase 6.5 不做的东西

| 不做 | 理由 |
|------|------|
| 卡片工作台 / 卡片渲染 | Phase 7 — 第一个消费者插件 |
| OLED | Phase 8 |
| 设置同步 | 需要后端 |
| 任务系统（build/flash/test） | Phase 8+ |
| 完整代码编辑器（Go to Definition / 重构） | Phase 7+ 独立插件 |
| 终端 PTY | 硬件调试不需要——串口就是终端 |
| Debug 断点调试 | Phase 8+ |
