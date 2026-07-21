# Phase 6.5 — 抛光与补齐

> 2026-07-21。
> Phase 5 建了应用基础设施，Phase 6 建了文件世界（文件树/主题插件化/语言插件化/Profile）。
> Phase 5 和 Phase 6 各自留了一批"不做"——不是不重要，是当时不属于最小闭环。
> Phase 6.5 把这些抛光项聚拢，在 Phase 7（第一个消费者插件）之前补齐。
>
> **一句话：Phase 6.5 = 让软件从"能用"变成"好用"——不新增子系统，只补齐缺口。**

---

## 一、来源——Phase 5 + Phase 6 "不做"清单中哪些进 6.5

Phase 5 "不做"清单 19 项中，已有 6 项被 Phase 6 吸收（JSON 编辑器标签页、齿轮菜单完整版、Output 查看器 UI、插件资源访问 API、主题系统插件化、语言系统插件化）。剩余 8 项抛光项进入 6.5。

Phase 6 "不做"清单 13 项中，3 项本就是 Phase 7/8 的核心任务（卡片工作台、OLED、V2 导入实为 Phase 7 导入系统的一部分）。剩余 11 项进入 6.5。

**汇总 19 项：**

| # | 来源 | 项目 | 原归属 |
|:--:|:--:|------|:--:|
| 1 | P5 | 通知进度条 | 7 |
| 2 | P5 | 通知来源过滤 / Do Not Disturb | 7 |
| 3 | P5 | "Don't show again" 持久化 | 7 |
| 4 | P5 | 完整 Notification Center 面板 | 7 |
| 5 | P5 | 通知 source 归类（按插件分组） | 7 |
| 6 | P5 | 动态 StatusBarItem（运行时创建） | 6 |
| 7 | P5 | contributes.icons（共享图标） | 6 |
| 8 | P5 | 插件 i18n 注册（内联翻译） | 6 |
| 9 | P6 | 文件搜索（跨文件内容搜索，Ctrl+Shift+F） | 7 |
| 10 | P6 | 文件树多选/批量操作 | 7 |
| 11 | P6 | 文件编码检测/切换 | 7 |
| 12 | P6 | 拖拽文件树节点到编辑区 | 7 |
| 13 | P6 | Settings Editor JSON schema 提示/自动补全 | 7 |
| 14 | P6 | 多工作区文件夹（Multi-root） | 8 |
| 15 | P6 | 文件图标主题（File Icon Theme） | 7+ |
| 16 | P6 | 文件装饰器（Git 状态/错误标记） | 7+ |
| 17 | P6 | 产品图标主题（Product Icon Theme） | 8+ |
| 18 | P6 | 标题栏汉堡菜单 ☰ 完整版 | 7 |
| 19 | P6 | V2 配置导入 | 7 |

---

## 二、拆分 4 批（6.5a-6.5d）

按子系统分组，每批交一个可用软件。依赖关系：6.5a 独立 → 6.5b 依赖 Phase 6 文件树 → 6.5c 依赖 6.5b → 6.5d 独立。

### 2.1 批次总览

| 批次 | 内容 | 行数 | 风险 | 依赖 |
|:--:|------|:--:|:--:|------|
| **6.5a** | 通知系统全功能 | ~230 | 低 | Phase 5 NotificationService |
| **6.5b** | 文件系统高级特性 | ~420 | 中 | Phase 6 文件树 + FileService |
| **6.5c** | 编辑器 + 工作区增强 | ~310 | 中 | Phase 6 Monaco 编辑器 + WorkspaceService |
| **6.5d** | 视觉 polish + 通用 API | ~400 | 低 | Phase 6 主题系统 + 文件树 |

---

## 三、6.5a — 通知系统全功能（~230 行）

### 为什么是第一批

通知系统不依赖文件树/编辑器——Phase 5 的 NotificationService + Toast 组件就是它的全部依赖。可以立刻开工，和 Phase 6 并行都行。

### 交付

#### 3.1 通知进度条（~50 行）

**现状：** Toast 组件支持静态渲染（标题 + 正文 + 按钮）。没有进度指示。

**对标 VS Code：** `vscode.window.withProgress()` —— 通知带进度条，显示"正在安装插件… 45%"。

```typescript
// NotificationService 新方法
showProgress(title: string, options?: {
  cancellable?: boolean;
  total?: number;  // 总步数，不传 = 不确定进度（indeterminate 动画）
}): ProgressHandle

interface ProgressHandle {
  report(increment: number, message?: string): void;  // 当前步/总步
  finish(message?: string): void;
  cancel(): void;
}
```

**消费端：** Toast 组件渲染 `<progress>` 元素或 indeterminate 动画条。

#### 3.2 通知来源过滤 / Do Not Disturb（~40 行）

**现状：** 所有通知直接弹出，没有过滤。

**对标 VS Code：** `notifications.doNotDisturbMode` 设置 + 通知来源过滤。

```typescript
// NotificationService
setDoNotDisturb(enabled: boolean): void;
setSourceFilter(pluginId: string, enabled: boolean): void;  // 关闭某个插件的通知
```

**plugin.json 声明（可选）：**
```json
{
  "contributes": {
    "notificationSources": [
      { "id": "terminal.portErrors", "label": "串口错误", "defaultEnabled": true }
    ]
  }
}
```

**UI：** Notification Center → 每个 source 的开关。

#### 3.3 "Don't show again" 持久化（~10 行）

**现状：** 没有这个机制。

**实现：** 通知按钮加 `isCloseAffordance: true` 标记。用户点"不再显示"→ `localStorage.setItem("v3.dnd.${notificationId}", "true")`。`showNotification` 时先检查这个标记。

```typescript
// Notification 按钮定义
interface NotificationAction {
  label: string;
  command?: string;
  isCloseAffordance?: boolean;  // ← 标记"不再显示"
}
```

#### 3.4 完整 Notification Center 面板（~100 行）

**现状：** 铃铛图标已渲染，但没有面板——点了没反应。

**对标 VS Code：** 铃铛图标 → 通知列表（未读/已读、按时间排序、分组）。

```
┌─────────────────────────────┐
│ 🔔 通知 (3)           ✕ 全部清除 │
├─────────────────────────────┤
│ 📟 终端                     │
│   串口连接已断开              │ 2 分钟前
│   [重新连接]                 │
├─────────────────────────────┤
│ 🧩 插件市场                  │
│   已安装 3 个插件             │ 10 分钟前
├─────────────────────────────┤
│ ⚙ 系统                      │
│   设置已保存                 │ 1 小时前
└─────────────────────────────┘
```

**实现：** 已有的 `NotificationService.getHistory()` → 渲染列表。每条通知带时间戳 + source 标签 + 操作按钮。

#### 3.5 通知 source 归类（~30 行）

**依赖 3.4：** 面板建好后，按 `source.pluginId` 分组。每组显示插件图标 + 名称。

```typescript
// NotificationService
getNotificationsBySource(): Map<string, Notification[]>  // key = pluginId
```

---

## 四、6.5b — 文件系统高级特性（~420 行）

### 为什么是第二批

Phase 6 建了文件树的基本闭环（浏览/打开/关闭/右键菜单）。这四个高级特性是闭环之上的增强——不影响基本功能，但显著提升专业场景体验。

### 交付

#### 4.1 文件搜索（Ctrl+Shift+F）——跨文件内容搜索（~200 行）

**对标 VS Code：** `Ctrl+Shift+F` → 搜索面板 → 输入关键词 → 所有匹配结果列表。

```
┌────┬──────────────────────────────────────┐
│    │ [搜索框: "main("        ]  [Aa] [.*]  │ ← 区分大小写/正则
│ 📁  │──────────────────────────────────────│
│    │ 结果 (12 个文件，34 处匹配)            │
│    │                                      │
│    │ 📄 src/main.c                        │
│    │    42: int main(int argc, char** argv)│
│    │    58:     main_loop();              │
│    │ 📄 src/init.c                        │
│    │    15:     main_config_t cfg = {...} │
│    │                                      │
│    │ 点击 → 跳转到文件对应行               │
└────┴──────────────────────────────────────┘
```

**实现：**

```typescript
// SearchService（~120 行）
class SearchService {
  async search(query: string, options?: {
    include?: string;       // glob pattern
    exclude?: string;       // glob pattern
    caseSensitive?: boolean;
    regex?: boolean;
  }): Promise<SearchResult[]>;

  // Rust 端依赖：已有 FileService.readFile → 遍历工作区文件 → ripgrep 式逐行匹配
}

interface SearchResult {
  filePath: string;
  matches: SearchMatch[];  // { line: number; column: number; length: number; lineContent: string }
}
```

**UI：** 新侧栏视图或文件树内的搜索面板。复用 Phase 2 命令面板的模糊搜索 UX。

**不做的：** 替换（replace in files）。只做搜索，替换是独立的命令系统功能（Phase 7+）。

#### 4.2 文件树多选/批量操作（~80 行）

**现状：** 文件树只支持单选。

**对标 VS Code：** Ctrl+点击 → 多选，Shift+点击 → 范围选。

```typescript
// FileTree 组件改动
// 1. 状态管理
const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

// 2. 点击处理
const handleClick = (path: string, e: React.MouseEvent) => {
  if (e.ctrlKey || e.metaKey) {
    setSelectedPaths(prev => toggle(prev, path));  // Ctrl+点击 → toggle
  } else if (e.shiftKey && lastClickedPath) {
    setSelectedPaths(new Set(getPathsBetween(lastClickedPath, path)));  // Shift+范围
  } else {
    setSelectedPaths(new Set([path]));  // 单击 → 单选
  }
};

// 3. 右键菜单 when 条件
// "删除" → when: "fileTreeSelectionCount > 1"
// "复制路径" → when: "fileTreeSelectionCount >= 1"
```

**ContextKeyService 新 key：**
- `fileTreeSelectionCount: number`
- `fileTreeHasMultiSelection: boolean`

#### 4.3 文件编码检测/切换（~60 行）

**现状：** Phase 2 终端有编码切换（UTF-8/GB2312/Shift-JIS），但文件树打开文件时不做编码检测。

**对标 VS Code：** 打开文件 → 自动检测编码 → 状态栏显示当前编码 → 点击可切换。

```typescript
// EncodingService（~40 行）
class EncodingService {
  detectEncoding(buffer: Uint8Array): string;  // "utf-8" | "gb2312" | "shift-jis"
  decode(buffer: Uint8Array, encoding: string): string;
  encode(text: string, encoding: string): Uint8Array;
  getAvailableEncodings(): { id: string; label: string }[];
}

// 文件树双击/打开 → FileService.readBinaryFile → EncodingService.detect → 解码 → 编辑器渲染
```

**不做的：** 自动 BOM 检测（`UTF-16LE`/`UTF-16BE`）——Phase 7+。

#### 4.4 拖拽文件树节点到编辑区（~80 行）

**现状：** 双击打开文件。拖拽不支持。

**对标 VS Code：** 拖拽 `.md` 文件到编辑区 → 在目标位置打开。

```typescript
// FileTree 节点 draggable
<li
  draggable
  onDragStart={(e) => {
    e.dataTransfer.setData("application/vnd.linkdesk.file-path", filePath);
    e.dataTransfer.effectAllowed = "copy";
  }}
/>

// MainContent drop zone
<div
  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}
  onDrop={(e) => {
    const path = e.dataTransfer.getData("application/vnd.linkdesk.file-path");
    if (path) openFileInEditor(path, targetGroupId);
  }}
/>
```

**已有基础：** Phase 3 拖拽分屏已经做了 drag-and-drop 基础设施。

---

## 五、6.5c — 编辑器 + 工作区增强（~310 行）

### 为什么是第三批

依赖 6.5b 的文件树稳定 + Phase 6 的 Monaco JSON 编辑器和 WorkspaceService。

### 交付

#### 5.1 Settings Editor JSON schema 提示/自动补全（~100 行）

**现状：** Phase 6 做 Monaco 打开 `settings.json`（语法高亮 + 基础编辑）。没有 schema 提示。

**对标 VS Code：** 编辑 `settings.json` → 输入 `"terminal.` → 自动补全 `terminal.timestampFormat` / `terminal.baudRate` 等。每个属性的 description 和 enum 值 hover 可见。

```typescript
// 从 ConfigurationRegistry 动态生成 JSON Schema
function buildSettingsJsonSchema(): JSONSchema {
  const properties: Record<string, any> = {};
  for (const [key, prop] of ConfigurationRegistry.getAllProperties()) {
    properties[key] = {
      type: prop.type,
      description: prop.description,
      default: prop.default,
      ...(prop.enum ? { enum: prop.enum } : {}),
    };
  }
  return { type: "object", properties };
}

// Monaco 配置
monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
  validate: true,
  schemas: [{
    uri: "v3://settings-schema.json",
    fileMatch: ["**/settings.json"],
    schema: buildSettingsJsonSchema(),
  }],
});
```

**效果：** 编辑 `settings.json` 时，Monaco 自动提示合法的 key、hover 显示 description、输入错误值时红色波浪线。

#### 5.2 多工作区文件夹（Multi-root）（~150 行）

**现状：** Phase 6 的 WorkspaceService 只支持单文件夹。

**对标 VS Code：** `文件 → 将文件夹添加到工作区` → 文件树同时显示两个根。

```
📁 文件树
├── 📂 stm32-firmware (工作区)
│   ├── src/
│   └── CMakeLists.txt
└── 📂 hardware-schematics (工作区)
    ├── board-v2.dxf
    └── bom.xlsx
```

```typescript
// WorkspaceService 改动
interface WorkspaceService {
  get folders(): WorkspaceFolder[];       // 从单数变复数
  addFolder(path: string): Promise<void>;
  removeFolder(path: string): Promise<void>;
  onDidChangeFolders: Event<WorkspaceFolder[]>;
}

// 文件树渲染多根
// 每个 workspace folder = 一个独立的 TreeRoot 节点
```

**不做的：** `.code-workspace` 文件格式（VS Code 的多工作区描述文件）——Phase 8+。

#### 5.3 V2 配置导入（~60 行）

**现状：** 没有 V2 配置迁移工具。

**对标：** 从 V2 的 `prefs.json` 格式转为 V3 的 `settings.json`。

```typescript
// V2ImportService（~60 行）
class V2ImportService {
  async importV2Prefs(v2PrefsPath: string): Promise<{
    migrated: number;
    skipped: number;
    report: string[];
  }>;

  // 映射表
  static MAPPING: Record<string, string> = {
    "baudRate": "terminal.baudRate",
    "encoding": "terminal.encoding",
    "theme": "app.theme",
    // ... Phase 2 的所有 prefs key
  };
}
```

**入口：** `文件 → 导入 → V2 配置...` → Tauri dialog 选 V2 的 prefs.json → 逐个迁移到 ConfigurationService。

**不做的：** 完整 V2 数据迁移（workspace 布局、历史记录等）——Phase 7+。

---

## 六、6.5d — 视觉 polish + 通用 API（~400 行）

### 为什么是第四批

不依赖 6.5b/6.5c。大部分是独立小功能——可以在前三批的任何间隙做。

### 交付

#### 6.1 文件图标主题（File Icon Theme）（~80 行）

**对标 VS Code：** 文件树里 `.tsx` 文件显示 React 图标，`.md` 显示 Markdown 图标。

```json
// plugin.json — 主题插件可贡献文件图标
{
  "contributes": {
    "iconThemes": [
      {
        "id": "seti",
        "label": "Seti",
        "path": "seti-icons.json"
      }
    ]
  }
}
```

```json
// seti-icons.json
{
  "fileExtensions": {
    ".tsx": "react",
    ".ts": "typescript",
    ".md": "markdown",
    ".rs": "rust"
  },
  "fileNames": {
    "package.json": "npm",
    "tsconfig.json": "tsconfig"
  },
  "folderNames": {
    "src": "source",
    "node_modules": "folder-node"
  }
}
```

**实现：** `IconThemeRegistry` → `FileTree` 渲染节点图标时查映射表。codicon 字体已包含大部分图标。

**不做的：** `.svg` 自定义图标文件——Phase 7+。

#### 6.2 文件装饰器（Git 状态/错误标记）（~60 行）

**对标 VS Code：** 文件树里修改过的文件旁边显示 `M`（黄色）、新增显示 `U`（绿色）、冲突显示 `!`（红色）。

```typescript
// DecorationProvider — 插件实现的接口
interface FileDecorationProvider {
  onDidChangeFileDecorations: Event<void>;
  provideDecoration(filePath: string): FileDecoration | undefined;
}

interface FileDecoration {
  badge?: string;       // "M" / "U" / "!" / "●"
  color?: string;       // CSS 颜色
  tooltip?: string;     // hover 提示
}
```

**实现：** `DecorationRegistry` 收集所有 provider → 文件树渲染时逐个检查每个文件。

**为什么只建框架不做 Git：** Git 集成是一个独立大功能——Phase 7+ 以插件形式实现。6.5d 只建 `FileDecorationProvider` 接口 + 注册表。

#### 6.3 产品图标主题（Product Icon Theme）（~40 行）

**对标 VS Code：** 图标栏/状态栏的图标可整体替换（Material Icon Theme 等）。

```json
{
  "contributes": {
    "productIconThemes": [
      {
        "id": "material-icons",
        "label": "Material Icons",
        "path": "material-icons.json"
      }
    ]
  }
}
```

```json
// material-icons.json — 映射 codicon ID → 新图标
{
  "icons": {
    "codicon/terminal": "material/terminal",
    "codicon/folder": "material/folder",
    "codicon/gear": "material/settings"
  }
}
```

**实现：** `ProductIconThemeRegistry` → IconBar 和 StatusBar 渲染图标时查映射。已有 codicon 字体框架，换图标 = 换 CSS class。

#### 6.4 contributes.icons（共享图标）（~30 行）

**现状：** 插件 icon 走 codicon 或内联 SVG。没有共享图标机制。

**对标 VS Code：** `package.json contributes.icons` ——插件发布图标供其他插件使用。

```json
// 插件 A 贡献图标
{
  "contributes": {
    "icons": {
      "stm32-chip": { "description": "STM32 芯片图标", "default": { "fontPath": "icons.woff", "fontCharacter": "\\e001" } }
    }
  }
}

// 插件 B 使用
{
  "icon": "stm32-chip",
  "iconSource": "shared"
}
```

**实现：** 薄封装——已有 codicon 基础设施，共享图标只是多一个来源。

#### 6.5 动态 StatusBarItem（运行时创建）（~50 行）

**现状：** StatusBarItem 只能通过 manifest `contributes.statusBar` 声明。

```json
// 静态声明——Phase 4 已有
{ "statusBar": [{ "id": "coords", "label": "39.9, 116.4", "align": "left" }] }
```

**对标 VS Code：** `vscode.window.createStatusBarItem()` ——运行时创建/更新/销毁。

```typescript
// 新 API
import { createStatusBarItem } from "../src/core/StatusBarService";

function MyView() {
  useEffect(() => {
    const item = createStatusBarItem("myPlugin.cursorPos", {
      label: "行 1, 列 1",
      align: "right",
      priority: 10,
    });

    const onMove = (line: number, col: number) => {
      item.update({ label: `行 ${line}, 列 ${col}` });
    };

    return () => item.dispose();  // unmount → 状态栏条目消失
  }, []);
}
```

**实现：** `StatusBarService.createItem()` → 注册到 StatusBarRegistry → 和 manifest 声明的条目同池渲染。unmount 时 `dispose()` 自动移除。

#### 6.6 插件 i18n 注册（内联翻译）（~40 行）

**现状：** 插件用 `t()` 和核心共用 i18next。没有"插件自带翻译文件"机制。

```json
// plugin.json
{
  "contributes": {
    "languages": [
      { "id": "zh", "path": "zh.json" }
    ]
  }
}
```

```json
// zh.json
{
  "GPS 坐标": "GPS 坐标",
  "Latitude": "纬度",
  "Longitude": "经度"
}
```

**实现：** loader 检测 `contributes.languages` → `i18next.addResourceBundle(lang, pluginId, json)`。插件 t() 时 i18next 先查插件自己的翻译表，再 fallback 到核心。

#### 6.7 标题栏汉堡菜单 ☰ 完整版（~100 行）

**现状：** Phase 6 做标题栏暗色化 + 基础系统菜单（File/Edit/View/Help 四组）。

**完整版：**
```
☰ 菜单 → 动态内容
  ├── File → 已有（打开文件夹/导入导出/退出）
  ├── Edit → 已有（撤销/重做/剪切/复制/粘贴）
  ├── View → 已有（命令面板/侧栏/设置/主题）
  ├── Help → 已有（关于/日志文件夹）
  ├── ───────────
  ├── 终端 → 终端插件贡献的 submenu
  │   ├── 新建终端
  │   ├── 清空接收区
  │   └── 导出日志
  └── [其他插件贡献的动态菜单组]
```

**实现：** Phase 6 已建好 MenuService 驱动的 ☰ 框架。6.5d 补充：
- 快捷键提示（菜单项右侧灰字显示 `Ctrl+Shift+P`）
- 禁用态灰显（命令 when 条件不满足时灰掉）
- 插件动态贡献的顶级菜单组

#### 6.8 V2 配置导入 → 已在 6.5c §5.3

---

## 七、Phase 6.5 之后

```
Phase 5f → 5g → 5h → 5.5 → Phase 6 → Phase 6.5 → Phase 7
                             基础设施   文件世界    抛光补齐    第一个消费者插件
```

**Phase 6.5 完成后的状态：**

| 维度 | Phase 6 结束时 | Phase 6.5 结束时 |
|------|--------------|----------------|
| 文件树 | 基础浏览/打开/关闭 | + 搜索/多选/编码/拖拽 |
| 通知 | 基础 Toast | + 进度条/过滤/面板/历史 |
| 编辑器 | Monaco 语法高亮 | + JSON schema 自动补全 |
| 工作区 | 单文件夹 | + 多文件夹 |
| 图标 | codicon | + 文件图标主题/产品图标主题/共享图标 |
| 状态栏 | 静态 manifest 声明 | + 运行时动态创建 |
| 装饰 | 无 | + FileDecorationProvider 接口 |
| 菜单栏 | 基础四组 | + 插件贡献顶级菜单 + 快捷键提示 |
| V2 兼容 | 无 | + V2 配置导入 |

**此时写任意插件——零阻碍。** 不是"能做"，是"做完"。

---

## 八、Phase 6.5 不做的东西

| 不做 | 理由 |
|------|------|
| 卡片工作台 / 卡片渲染 | Phase 7——这是第一个消费者插件，不改框架 |
| OLED | Phase 8 |
| 设置同步 | 需要后端 |
| 任务系统（build/flash/test） | Phase 8+ |
| 完整代码编辑器（Go to Definition / 重构） | Phase 7+ 独立插件 |
| 终端作为独立进程（PTY） | 硬件调试不需要 PTY——串口就是终端 |
| Debug 断点调试 | Phase 8+ |
| 远程开发（Remote SSH/WSL） | Phase 9+ |
| `.code-workspace` 文件格式 | Phase 8+——先做内存中的多工作区 |

---

## 九、实施优先级建议

如果 Phase 7 想做卡片工作台，6.5 的哪些必须先做？

| 卡片工作台需要 | 6.5 哪批提供 | 不做的后果 |
|--------------|:--:|---------|
| 通知进度条 | 6.5a | 卡片安装/操作不显示进度——可接受 |
| 文件搜索 | 6.5b | 不依赖——卡片不操作文件 |
| JSON schema | 6.5c | 编辑卡片配置时没有自动补全——可接受 |
| 动态 StatusBarItem | 6.5d | 卡片无法动态更新状态栏——⚠️ 影响体验 |
| contributes.icons | 6.5d | 卡片用 codicon 够用——可接受 |

**结论：6.5 全部可以和 Phase 7 灵活排序。** 没有哪项是"不做卡片就跑不起来"的。6.5d 的动态 StatusBarItem 对卡片体验有提升，但不是硬依赖。
