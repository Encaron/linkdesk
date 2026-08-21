# 03 — 插件 contributes 规范

> 2026-07-24。**plugin.json `contributes` 字段——插件声明"我能做什么"。** 对标 VS Code `package.json` contributes。壳自动接线——不改任何核心代码。

---

## 一、核心原则

**插件声明 → 壳自动接线。** 你声明 `contributes.configuration`，Settings Editor 自动多一个分组。你声明 `contributes.commands`，Ctrl+Shift+P 自动多一项。

**不让壳知道你的插件是干什么的。** 壳只知道"有插件注册了这些命令/菜单/快捷键/配置项"，不知道"这是 CAD 插件还是地图插件"。

---

## 二、全部贡献点

| 贡献点 | Phase | 说明 | 壳消费方 |
|------|:--:|------|------|
| `commands` | ✅ 已实现 | 注册命令 → 命令面板/右键菜单/快捷键 | CommandRegistry |
| `menus` | ✅ 已实现 | 注册菜单项 → 右键菜单/齿轮菜单 | MenuRegistry |
| `keybindings` | ✅ 已实现 | 注册快捷键 | KeybindingRegistry |
| `configuration` | ✅ 已实现 | 注册设置项 → Settings Editor 自动渲染 | ConfigurationRegistry |
| `configurationDefaults` | ✅ 已实现 | 弱默认值——用户手动设置优先 | ConfigurationService |
| `themes` | E3b | 注册主题 | ThemeRegistry |
| `languages` | E3c | 注册语言包 | i18next |
| `cards` | 🆕 | 注册卡片 → workspace 卡片网格渲染 | CardRegistry |
| `protocols` | ✅ 已实现 | 注册协议解析器 | ProtocolRegistry |
| `fileAssociations` | 🆕 E3 后 | 文件扩展名 → 编辑器插件路由 | FileAssociationService |
| `icons` | E3g | 共享图标——插件 A 贡献、插件 B 引用 | IconRegistry |
| `viewsContainers` | 🆕 E3.6 | 声明侧栏容器——点图标时切换到该容器 | ViewContainerService |
| `viewsContainers` | 🆕 E3.6 | 声明侧栏容器——点图标栏切换到此容器 | ViewContainerService |
| `views` | 🆕 E3.6 | 往容器注册视图——任何插件可往任意容器注册 | ViewContainerService |
| `aiFunctions` | 远期 | AI 可调用的 Function 接口 | AI Agent |
| `statusBar` | ✅ 已实现 | 状态栏条目 | StatusBar |

---

## 三、各贡献点详述

### 3.1 `contributes.commands`——命令

```json
{
  "contributes": {
    "commands": [
      {
        "id": "cad.importDxf",
        "title": "导入 DXF…",
        "category": "CAD",
        "when": "activeEditor == 'cad'"
      }
    ]
  }
}
```

**字段：**

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `id` | ✅ | 命令 ID。命名：`<pluginId>.<action>`，如 `terminal.copy` |
| `title` | ✅ | 显示名称 |
| `category` | ❌ | 命令面板分组——"CAD" / "终端" / "文件" |
| `when` | ❌ | context key when 条件。不加 `when` = 任何上下文可见 |

**插件代码里注册 handler：**
```typescript
// 在激活阶段（组件 mount 时）注册
window.linkdesk.commands.register("cad.importDxf", async () => {
  const paths = await window.linkdesk.dialog.showOpenDialog({
    filters: [{ name: "DXF 文件", extensions: ["dxf"] }]
  });
  // ...
});
```

### 3.2 `contributes.menus`——菜单项

```json
{
  "contributes": {
    "menus": {
      "editorContext": [
        "cad.importDxf",
        { "command": "cad.exportPdf", "when": "activeEditor == 'cad'", "group": "edit" }
      ],
      "tabContext": [
        { "command": "cad.closeAll", "when": "activeEditor == 'cad'" }
      ],
      "commandPalette": [
        { "command": "cad.importDxf", "when": "activeEditor == 'cad'" }
      ]
    }
  }
}
```

**可用菜单 ID（MenuId）：**

| MenuId | 场景 |
|------|------|
| `commandPalette` | Ctrl+Shift+P 命令面板 |
| `editorContext` | 标签页主内容区右键 |
| `tabContext` | 标签栏标签右键 |
| `fileContext` | 文件树右键（E3 后） |
| `cardContext` | 卡片右键（E3 后） |
| `iconBar` | 图标栏右键 |
| `extensionGear` | 插件齿轮菜单 |
| `quickSendContext` | 快捷发送药丸右键 |
| `menuBar` | ☰ 汉堡菜单（E3f） |

**菜单项字段：**

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `command` | ✅ | 命令 ID |
| `group` | ❌ | 分组——同组内聚在一起，组间有分隔线。如 `"navigation"` / `"edit"` / `"delete"` |
| `when` | ❌ | context key when 条件 |

**简写：** 只填命令 ID 的字符串 = `{ "command": "<id>" }`

### 3.3 `contributes.keybindings`——快捷键

```json
{
  "contributes": {
    "keybindings": [
      { "command": "cad.importDxf", "key": "ctrl+shift+i", "when": "activeEditor == 'cad'" },
      { "command": "cad.exportPdf",  "key": "ctrl+shift+e", "when": "activeEditor == 'cad'" }
    ]
  }
}
```

**字段：**

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `command` | ✅ | 命令 ID |
| `key` | ✅ | 键序列——`"ctrl+k"` / `"ctrl+shift+p"` / `"ctrl+k ctrl+o"`（Chord） |
| `when` | ❌ | context key when 条件 |

### 3.4 `contributes.configuration`——设置项

```json
{
  "contributes": {
    "configuration": {
      "title": "CAD 查看器",
      "properties": {
        "cad.gridSize": {
          "type": "number",
          "default": 10,
          "minimum": 1,
          "maximum": 100,
          "description": "网格大小 (mm)"
        },
        "cad.units": {
          "type": "string",
          "default": "mm",
          "enum": ["mm", "cm", "inch"],
          "description": "单位"
        },
        "cad.autoSave": {
          "type": "boolean",
          "default": true,
          "description": "自动保存"
        },
        "cad.backupPath": {
          "type": "string",
          "default": "",
          "description": "备份路径"
        }
      }
    }
  }
}
```

**安装后效果：** Settings Editor 左侧导航树自动出现 "CAD 查看器" 分组 → 右侧自动渲染表单——不需要手写设置界面。

**支持的类型：** `"string"` | `"number"` | `"boolean"` | `"integer"`

**约束字段（可选）：** `enum`（下拉列表）| `minimum` / `maximum`（数值范围）| `default`（默认值）

**Key 命名规则：** `<pluginId>.<property>`，如 `cad.gridSize`、`terminal.baudRate`

**插件读设置：**
```typescript
const gridSize = await window.linkdesk.config.get<number>("cad.gridSize");
// 或订阅变化
window.linkdesk.config.onChange("cad.gridSize", (val) => {
  // 用户在 Settings Editor 改值 → 自动通知
});
```

### 3.5 `contributes.configurationDefaults`——弱默认值

```json
{
  "contributes": {
    "configurationDefaults": {
      "terminal.baudRate": 115200,
      "terminal.encoding": "utf-8"
    }
  }
}
```

和 `configuration` 的区别：`configuration` 定义了**自己的**设置项。`configurationDefaults` 给**别人的**设置项提供建议值。用户手动设置优先——弱默认只在用户从未设置过该 key 时生效。

### 3.6 `contributes.cards`——卡片（🆕）

```json
{
  "contributes": {
    "cards": [
      {
        "id": "temperature-gauge",
        "name": "温度计",
        "acceptsFields": ["temperature", "ambient_temp"],
        "defaultSize": { "w": 2, "h": 2 },
        "minSize": { "w": 1, "h": 1 }
      }
    ]
  }
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `id` | ✅ | 卡片类型标识 |
| `name` | ✅ | 显示名 |
| `acceptsFields` | ✅ | 能消费哪些 cardId——DataDispatch 按此字段路由 |
| `defaultSize` | ❌ | 默认尺寸（栅格单位） |
| `minSize` | ❌ | 最小尺寸 |

**数据流：** 串口数据 → ProtocolRegistry 解析 → `DataDispatch.dispatchParsed()` → 按 `cardId` 匹配 `acceptsFields` → 卡片收到 `fields` 数据 → 渲染。

**JS 注册（不走 plugin.json 声明时）：**
```typescript
import { registerCard } from "@src/core/CardRegistry";
registerCard({
  id: "temperature-gauge",
  name: "温度计",
  pluginId: "my-sensor-plugin",
  component: TemperatureGauge,
  acceptsFields: ["temperature"],
});
```

### 3.7 `contributes.fileAssociations`——文件关联（🆕 E3 后）

```json
{
  "contributes": {
    "fileAssociations": [
      { "extension": "dxf", "pluginId": "cad-viewer" },
      { "extension": "stl", "pluginId": "cad-viewer" },
      { "extension": "step", "pluginId": "cad-viewer" },
      { "extension": "stp", "pluginId": "cad-viewer" }
    ]
  }
}
```

**壳消费方式：** `FileAssociationService` 维护 `extension → pluginId[]` 映射。双击文件 → 查找对应插件 → 未激活的先激活 → 打开标签页。多个插件注册同一扩展名 → 弹出"打开方式…"选择器。

### 3.8 `contributes.viewsContainers` + `contributes.views`——侧栏视图（🆕 E3.6）

> 完整 API 文档：`08-ViewContainer-视图容器API.md`

**viewsContainers——声明侧栏频道：**

```json
{
  "contributes": {
    "viewsContainers": {
      "explorer": {
        "title": "资源管理器",
        "location": "sidebar",
        "hideIfEmpty": false
      }
    }
  }
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `title` | ✅ | 侧栏 header 显示的名称 |
| `location` | ❌ | `"sidebar"` \| `"panel"` \| `"auxiliarybar"`。默认 `"sidebar"` |
| `hideIfEmpty` | ❌ | 无活跃 view 时自动隐藏容器 |
| `order` | ❌ | 同位置排序。小值靠前 |
| `icon` | ❌ | 覆盖插件自身图标 |

**views——往容器注册内容：**

```json
{
  "contributes": {
    "views": {
      "explorer": [
        {
          "id": "timeline",
          "title": "TIMELINE",
          "render": "src/views/TimelineView.tsx",
          "order": 100,
          "when": "gitOpen"
        }
      ]
    }
  }
}
```

| 字段 | 必需 | 说明 |
|------|:--:|------|
| `id` | ✅ | View 唯一 ID |
| `render` | ✅ | 组件模块路径。如 `"src/views/MyView.tsx"` |
| `title` | ❌ | SidebarSection 折叠头标题。空字符串 = 不渲染折叠头 |
| `order` | ❌ | 容器内排序。小值在上 |
| `collapsed` | ❌ | 初始折叠 |
| `when` | ❌ | Context key 条件——满足时才显示 |
| `canToggleVisibility` | ❌ | 用户可切换可见性（未来） |
| `canMoveView` | ❌ | 用户可拖到其他容器（未来） |
| `hideByDefault` | ❌ | 默认隐藏（未来） |

**关键特性：任何插件** 都能往别人的容器注册 view：
```json
// Git 插件——往 file-tree 的 explorer 容器注册 TIMELINE
{ "contributes": { "views": { "explorer": [{ "id": "timeline", ... }] } } }
```
文件树插件零改动。`registerView("explorer", ...)` 命令式等效。

### 3.9 `contributes.icons`——共享图标（🆕 E3g）

```json
// 插件 A 贡献图标
{
  "contributes": {
    "icons": {
      "stm32-chip": {
        "description": "STM32 芯片图标",
        "default": { "fontPath": "icons.woff", "fontCharacter": "\\e001" }
      }
    }
  }
}

// 插件 B 引用
{
  "icon": "stm32-chip",
  "iconSource": "shared"
}
```

---

## 四、Context Key when 条件

菜单项和命令的 `when` 字段用 ContextKeyService 表达式：

| 运算符 | 示例 | 含义 |
|------|------|------|
| 裸 key | `portOpen` | key 值为 truthy → true |
| `!` | `!portOpen` | 取反 |
| `&&` | `activeEditor == 'cad' && portOpen` | 逻辑与 |
| `\|\|` | `activeEditor == 'a' \|\| activeEditor == 'b'` | 逻辑或 |
| `==` | `activeEditor == 'cad'` | 等于 |
| `!=` | `editorCount != 0` | 不等于 |
| `in` | `activeEditor in ['cad', 'terminal']` | 集合成员 |
| `()` | `!(portOpen \|\| editorCount > 1)` | 分组 |

**可用的 Context Key（壳写入）：**

| Key | 类型 | 写入者 |
|------|------|------|
| `activeEditor` | `string \| null` | 标签页切换时——当前聚焦标签页的 pluginId |
| `portOpen` | `boolean` | 串口开关时 |
| `portName` | `string \| null` | 串口开关时 |
| `editorCount` | `number` | 标签页增删时 |
| `editorHasSelection` | `boolean` | 编辑器有选中文本时（预留） |

---

## 五、完整 plugin.json 示例——CAD 插件

```json
{
  "$schema": "plugin.schema.json",
  "name": "CAD 查看器",
  "version": "1.0.0",
  "icon": "package",
  "iconSource": "codicon",
  "description": "DWG/DXF/STL 文件查看器",
  "author": "社区",
  "entry": "index.tsx",
  "sidebar": "sidebar.tsx",
  "appearsIn": { "tabBar": true },
  "tabBehavior": {
    "confirmOnClose": "未保存的修改将丢失"
  },
  "statusBar": [
    { "id": "units", "label": "mm", "align": "right" },
    { "id": "zoom", "label": "100%", "align": "right" }
  ],
  "activationEvents": [
    "onFileOpen:.dxf",
    "onFileOpen:.dwg",
    "onFileOpen:.stl",
    "onFileOpen:.step"
  ],
  "permissions": ["filesystem"],
  "contributes": {
    "commands": [
      { "id": "cad.importDxf", "title": "导入 DXF…", "category": "CAD" },
      { "id": "cad.exportPdf", "title": "导出 PDF…", "category": "CAD", "when": "activeEditor == 'cad'" },
      { "id": "cad.zoomFit", "title": "适应窗口", "category": "CAD", "when": "activeEditor == 'cad'" }
    ],
    "menus": {
      "editorContext": [
        { "command": "cad.importDxf", "group": "navigation" },
        { "command": "cad.exportPdf", "group": "edit" },
        { "command": "cad.zoomFit", "group": "view" }
      ],
      "commandPalette": [
        { "command": "cad.importDxf" },
        { "command": "cad.exportPdf", "when": "activeEditor == 'cad'" }
      ]
    },
    "keybindings": [
      { "command": "cad.zoomFit", "key": "ctrl+0", "when": "activeEditor == 'cad'" }
    ],
    "configuration": {
      "title": "CAD 查看器",
      "properties": {
        "cad.gridSize": { "type": "number", "default": 10, "minimum": 1, "maximum": 100, "description": "网格大小" },
        "cad.units": { "type": "string", "default": "mm", "enum": ["mm", "cm", "inch"], "description": "单位" },
        "cad.autoSave": { "type": "boolean", "default": true, "description": "自动保存" }
      }
    },
    "fileAssociations": [
      { "extension": "dxf", "pluginId": "cad-viewer" },
      { "extension": "dwg", "pluginId": "cad-viewer" },
      { "extension": "stl", "pluginId": "cad-viewer" }
    ]
  },
  "recommends": [
    { "plugin": "file-tree", "reason": "文件树侧栏——浏览和打开 CAD 文件" }
  ],
  "requires": [
    { "plugin": "monaco-editor", "version": "1.0.0" }
  ]
}
```

---

## 六、与 VS Code contributes 对照

| VS Code contributes | LinkDesk | 差异 |
|------|------|------|
| `commands` | ✅ | 同 |
| `menus` | ✅ | LinkDesk 多了 `quickSendContext` / `cardContext` |
| `keybindings` | ✅ | 同 |
| `configuration` | ✅ | 同 |
| `configurationDefaults` | ✅ | 同 |
| `themes` | E3b | 同 |
| `languages` | E3c | VS Code 的 `languages` 是编程语言声明（语法高亮等）——LinkDesk 的 `languages` 是 UI 语言包（i18n），分工不同 |
| `views` | 🆕 E3 后 | 侧栏视图容器 |
| `viewsContainers` | 🆕 E3 后 | 对标 activitybar 视图容器 |
| `fileAssociations` | 🆕 | 新增——VS Code 没有这个（由操作系统管理文件关联） |
| `cards` | 🆕 | 新增——LinkDesk 独有（硬件数据卡片可视化） |
| `protocols` | 🆕 | 新增——LinkDesk 独有（硬件协议解析） |
| `icons` | E3g | 同 |
| `aiFunctions` | 远期 | 新增——LinkDesk 独有（AI Agent 调用插件） |
| `taskDefinitions` | 不在规划 | 构建任务——当前不需要 |
| `snippets` | 不在规划 | 代码片段——Monaco 插件自带 |
| `problemMatchers` | 不在规划 | 错误匹配器——LSP 插件自带 |
| `breakpoints` / `debuggers` | 不在规划 | 调试器——当前不需要 |

---

> **← 上一份：** `02-插件生命周期.md`
> **→ 下一份：** `04-插件分发格式.md`
> **全部文档索引：** `00-README.md`
