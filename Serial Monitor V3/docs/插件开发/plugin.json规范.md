# plugin.json 规范

> 插件元数据的唯一入口。一个插件 = 一个文件夹 + 一份 `plugin.json` + 一个入口文件。

---

## 最小示例

```json
{
  "$schema": "../docs/插件开发/plugin.schema.json",
  "type": "view",
  "name": "GPS 地图",
  "version": "1.0.0",
  "icon": "map",
  "iconSource": "codicon",
  "description": "交互式地图视图，支持 Leaflet/高德/Google Maps",
  "author": "社区",
  "entry": "index.tsx"
}
```

## 按插件类型的完整示例

### 视图插件（最常用）

```json
{
  "$schema": "../docs/插件开发/plugin.schema.json",
  "type": "view",
  "name": "GPS 地图",
  "version": "1.0.0",
  "icon": "map",
  "iconSource": "codicon",
  "description": "交互式地图视图",
  "author": "社区",
  "entry": "index.tsx",
  "sidebar": "sidebar.tsx",
  "tabBehavior": {},
  "statusBar": [
    { "id": "coords", "label": "39.9, 116.4", "align": "left" }
  ],
  "recommends": [],
  "suggests": [],
  "changelog": [
    { "version": "1.0.0", "date": "2026-07-19", "changes": ["初始发布"] }
  ],
  "screenshots": [],
  "minAppVersion": "1.0.0"
}
```

### 主题插件

```json
{
  "type": "theme",
  "name": "Dracula",
  "version": "1.0.0",
  "icon": "color-mode",
  "description": "经典 Dracula 暗色主题",
  "author": "社区",
  "file": "dracula.json"
}
```

多主题包：

```json
{
  "type": "theme",
  "name": "Dracula Official",
  "version": "1.0.0",
  "themes": [
    { "id": "dracula", "name": "Dracula", "file": "dark.json" },
    { "id": "dracula-soft", "name": "Dracula Soft", "file": "soft.json" }
  ]
}
```

### 语言包插件

```json
{
  "type": "language",
  "name": "日本語",
  "version": "1.0.0",
  "icon": "globe",
  "description": "日本語 UI 翻訳",
  "author": "社区",
  "file": "ja.json"
}
```

### 协议插件

```json
{
  "type": "protocol",
  "name": "SBQ 心率协议",
  "version": "1.0.0",
  "icon": "circuit-board",
  "description": "单字符包头心率协议解析",
  "author": "社区",
  "entry": "index.ts",
  "mode": "text"
}
```

### 静态资源插件

```json
{
  "type": "resource",
  "name": "STM32 寄存器手册",
  "version": "1.0.0",
  "icon": "book",
  "description": "STM32F103 参考手册 HTML",
  "author": "社区",
  "resources": ["manual.html"]
}
```

---

## 字段参考

### 必需字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `type` | `string` | 插件类型：`view` / `card` / `theme` / `language` / `protocol` / `resource` / `datasource` |
| `name` | `string` | 显示名称，用户可见 |
| `version` | `string` | 语义化版本，如 `"1.0.0"` |
| `icon` | `string` | 图标标识——codicon 名称或 SVG 路径 |
| `entry` | `string` | 入口文件路径，相对插件目录。`view` / `card` / `protocol` 必需 |

### 可选字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `$schema` | `string` | JSON Schema 引用路径 |
| `core` | `boolean` | `true` = 核心控制面，不可卸载。默认 `false` |
| `iconSource` | `string` | `"codicon"`（默认）/ `"svg"` / `"url"` |
| `description` | `string` | 一句话描述，插件详情页展示。支持多行 |
| `author` | `string` | 作者名 |
| `sidebar` | `string` | 侧栏组件路径，仅 `view` 类型有效 |
| `tabBehavior` | `object` | 标签页行为声明，见下方 |
| `statusBar` | `array` | 状态栏贡献条目，见下方。仅 `view` 类型有效 |
| `file` | `string` | 单文件入口——`theme` 的 `.json` 或 `language` 的 `.json`。和 `themes`/`languages` 二选一 |
| `themes` | `array` | 多主题 `[{ id, name, file }]`。仅 `theme` 类型 |
| `languages` | `array` | 多语言 `[{ code, name, file }]`。仅 `language` 类型 |
| `mode` | `string` | 协议模式：`"text"`（Phase 4 可用）/ `"binary"`（Phase 6+ WASM）。仅 `protocol` 类型 |
| `resources` | `string[]` | 资源文件列表——HTML/图片等。仅 `resource` 类型 |
| `recommends` | `array` | 推荐同时安装的插件 `[{ plugin: string, reason: string }]` |
| `suggests` | `array` | 可选相关插件 `[{ plugin: string, reason: string }]` |
| `requires` | `array` | 硬依赖 `[{ plugin: string, version: string }]`——未满足则安装按钮禁用 |
| `changelog` | `array` | 更新日志 `[{ version: string, date: string, changes: string[] }]` |
| `screenshots` | `string[]` | 截图 URL 数组（Phase 5+ 启用） |
| `minAppVersion` | `string` | 最低软件版本要求 |
| `docs` | `string` | 附带文档路径（资源插件联动） |
| `cardDocMap` | `object` | 卡片 ID → 文档锚点映射 |
| `i18n` | `object` | 插件自带翻译 `{ "zh": "zh.json", "en": "en.json" }` |
| `cssVars` | `object` | 插件自定义 CSS 变量 `{ "--name": { "dark": "#fff", "light": "#000" } }` |
| `permissions` | `string[]` | 权限声明 `["serial", "filesystem", "network"]`（Phase 5+ 启用） |

### `tabBehavior` 字段

```json
{
  "tabBehavior": {
    "isFallback": false,
    "singleton": false,
    "confirmOnClose": "关闭此标签页将断开串口连接"
  }
}
```

| 属性 | 类型 | 说明 |
|---|---|---|
| `isFallback` | `boolean` | 场上无标签页时自动创建此标签页，且不可关闭。只有欢迎页声明 |
| `singleton` | `boolean` | 全局只允许一个实例，重复创建 → 聚焦已有。如设置页 |
| `confirmOnClose` | `string` | 关闭前弹确认框，值为提示文本。如终端 |

### `statusBar` 条目

```json
{
  "statusBar": [
    { "id": "connection", "icon": "circle-filled", "label": "COM3 已连接", "align": "left" },
    { "id": "txrx", "label": "TX:0  RX:0", "align": "left" }
  ]
}
```

| 属性 | 类型 | 说明 |
|---|---|---|
| `id` | `string` ✅ | 唯一标识 |
| `icon` | `string` | codicon 名称或 SVG 路径 |
| `label` | `string` | 显示文字 |
| `align` | `string` | `"left"`（默认）/ `"right"` |
| `onClick` | `string` | 点击行为——命令名 |

---

## 目录结构约定

```
plugins/<pluginId>/
├── plugin.json          ← 必需：元数据
├── index.tsx            ← 视图/卡片入口（entry 字段指向的文件）
├── sidebar.tsx          ← 可选的侧栏组件
├── toolbar.tsx          ← 可选的工具栏组件
├── *.css                ← 可选的样式文件
└── assets/              ← 可选的资源目录（图片/字体等）
```

`<pluginId>` = 文件夹名 = `plugin.json` 中引用的插件唯一标识。命名规则：
- 小写英文 + 连字符：`gps-map`、`protocol-sbq`、`theme-dracula`
- 不带软件名、不带版本号：`terminal` 不是 `v3-terminal`

---

## 校验规则

加载器按以下顺序校验 `plugin.json`：

1. **文件不存在** → 跳过该目录，日志记录
2. **JSON 格式错误** → 跳过，toast 通知用户
3. **缺少 `type`** → 跳过
4. **`type` 未知** → 跳过（向后兼容——未来新增类型旧核心忽略）
5. **缺少 `entry`**（view/card/protocol）→ 跳过，toast
6. **`minAppVersion` 高于当前版本** → 跳过，标记"需升级"
7. **同名插件重复** → 优先高版本，toast 提示

任何校验失败的插件不阻断其他插件加载。

---

## 相关

- `docs/插件开发/视图插件开发.md` — 视图插件完整开发指南
- `docs/插件开发/协议插件开发.md` — 协议插件完整开发指南
- `docs/插件开发/plugin.schema.json` — JSON Schema 文件
- memory `plugin-system.md` — 插件系统完整设计
