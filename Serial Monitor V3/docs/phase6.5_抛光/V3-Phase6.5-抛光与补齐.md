# Phase 6.5 — 抛光与补齐

> 2026-07-21。初版。
> 2026-07-21 修订：文件相关项（搜索/多选/编码/拖拽/JSON schema/多工作区/文件图标/装饰器/产品图标）回归 Phase 6——Phase 6 本身就是"编辑能力"，不应该拆到 6.5。
>
> **Phase 6.5 = Phase 6 编辑能力就位后，剩下的纯抛光项——不涉及文件操作，不新增子系统。**

---

## 一、Phase 6 做了什么——先搞清楚 6.5 的边界

当 Phase 6 做完（含 6a/6b/6c/6d/6e），你已经拥有：

```
Phase 6a: 文件树基础闭环（8 项）
  - 文件树（浏览/打开/关闭/右键 MenuId.FileContext）
  - FileService + WorkspaceService + 文件关联（fileAssociations）
  - Monaco JSON 编辑器标签页 + 系统文件拖入 + Reopen Closed Tab
  - Tauri fs API 归一化（验收 D1）

Phase 6b: 编辑体验完整闭环（8 项）
  - 文件搜索（Ctrl+Shift+F） + 文件树多选/批量操作
  - 编码检测/切换 + 拖拽文件树节点
  - JSON schema 自动补全 + 多工作区（Multi-root）
  - 文件图标主题 + 文件装饰器框架

Phase 6c: 主题/语言引擎（5 项）
  - 主题系统插件化 + 主题浏览器（Ctrl+K Ctrl+T）
  - 语言系统插件化 + 三层退路 + 产品图标主题
  - 插件资源访问 API（getResourceUri）

Phase 6d: Profile + 激活链路（5 项）
  - Profile 系统（五维验证） + activationEvents
  - extensionDependencies + 齿轮菜单完整版 + 输出面板 UI
  - 终端会话持久化

Phase 6e: 壳完善 + 清旧债（8 项）
  - 欢迎页集成 + 标题栏暗色化 + ☰ 基础四组
  - Workspace 导入导出 + Chord 快捷键 + keybindings.json
  - DialogService UI + SerialContext 迁出 + 术语迁移（验收 D2/D3）
```

**Phase 6 的本质 = 编辑能力。** 文件树 + 文件操作 + 文本编辑 + 主题/语言引擎 = 一个完整的文件编辑基础设施。不做的是代码编辑器的语言服务（Go to Definition / 重构 / IntelliSense）——那些属于具体插件。

**Phase 6.5 = 编辑能力之外的抛光。** 以下 12 项（含验收 D5 模糊搜索）和文件操作无关——是框架的"体验完整度"。

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
| **12** | **P5** | **命令面板模糊搜索（fuzzy matching，非 substring）——验收 D5** | **6** | **命令面板** |

---

## 三、拆分 3 批（6.5a-6.5c）

> **执行顺序：Phase 6 全部完成 → 再 6.5a → 6.5b → 6.5c。不并行。**
>
> 虽然 6.5a（通知）和 6.5b（StatusBarItem/i18n/icons）不碰 Phase 6 的文件树/编辑器代码，但 6.5c 的 Toggle 命令动态标题要改 `CommandRegistry.ts`——Phase 6c 的 Profile 系统、齿轮菜单也在消费 CommandRegistry。两条线同时改同一个模块 → merge 冲突。统一等 Phase 6 全部完成后再开始 6.5，避免任何并行风险。

| 批次 | 内容 | 行数 | 风险 | 依赖 |
|:--:|------|:--:|:--:|------|
| **6.5a** | 通知系统全功能（5 项） | ~230 | 低 | Phase 5 NotificationService + Phase 6 全部完成 |
| **6.5b** | 通用 API + 命令面板（4 项——含模糊搜索） | ~180 | 低 | Phase 5 StatusBarService + i18next + CommandRegistry + Phase 6 全部完成 |
| **6.5c** | 视觉 + 兼容（3 项） | ~190 | 低 | Phase 5 MenuService + codicon + **Phase 6e（CommandRegistry 消费端已稳定）** |

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

### 5.3 命令面板模糊搜索（~40 行，验收 D5）

**现状：** 命令面板用 `String.includes` 做 substring 匹配。输入 "tr" 能匹配到 "terminal" 但不是按相关性排序。

**对标 VS Code：** VS Code 的命令面板使用 fuzzy matching 打分排序——缩写匹配（"tgl"→"toggle"）、首字母匹配、连续匹配权重高于跳跃匹配。

**解法：** 轻量 fuzzy match 函数（~30 行）替换 `String.includes`。不引入 `fuse.js` 等外部库——自研打分算法对标 VS Code 的 `fuzzyScore`。

```typescript
// CommandPalette 搜索逻辑
function fuzzyScore(query: string, target: string): number {
  // 首字母连续匹配 > 中间连续匹配 > 跳跃匹配 > 不匹配
}
// 替换当前的 items.filter(i => i.label.toLowerCase().includes(query))
```

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

## 七、Phase 6.5 不做的东西

| 不做 | 理由 |
|------|------|
| 卡片工作台 / 卡片渲染 | Phase 7 — 第一个消费者插件 |
| OLED | Phase 8 |
| 设置同步 | 需要后端 |
| 任务系统（build/flash/test） | Phase 8+ |
| 完整代码编辑器（Go to Definition / 重构） | Phase 7+ 独立插件 |
| 终端 PTY | 串口终端是当前主要用例——PTY 作为可选插件，不进核心 |
| Debug 断点调试 | Phase 8+ |
