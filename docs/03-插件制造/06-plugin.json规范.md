# plugin.json 规范

> 插件元数据的唯一入口。一个插件 = 一个文件夹 + 一份 `plugin.json` + 入口文件。
> **对标 VS Code：不再需要 `type` 字段——loader 从声明字段自动检测贡献类型。**

---

## 插件目录结构

一个插件就是一个文件夹，放在 `plugins/user/<插件ID>/` 下。**目录名 = 插件 ID**（如 `plugins/user/my-plugin/`）。内置插件放 `plugins/builtin/`，由 `distribution` 字段区分。

```
plugins/user/my-plugin/
├── plugin.json              # 插件元数据（唯一必需）
├── resources/               # 静态资源——图标/图片/字体
│   └── icon.svg             # 图标（推荐 SVG）
├── src/                     # 源代码
│   ├── index.tsx            # 入口组件
│   ├── sidebar.tsx          # 侧栏组件（如有）
│   └── styles.css           # 样式
└── i18n/                    # 翻译文件（可选，contributes.i18n 声明）
```

| 文件 | 说明 |
|------|------|
| `plugin.json` | **唯一必需文件。** 文件名固定，不可改名 |
| `src/` | **推荐**源码放在 `src/` 子目录下，避免平铺。`entry`/`sidebar` 路径相对于 `plugin.json`，如 `"entry": "src/index.tsx"` |
| `resources/` | 图标等静态资源。对标 VS Code 插件常见的 `resources/` / `assets/` 目录 |
| `icon` 字段 | 相对于 `plugin.json` 的路径。如 `"icon": "resources/icon.svg"` |
| `i18n/` | 翻译文件——每种语言一个 JSON（`contributes.i18n` 声明路径） |
| `__tests__/` | 测试文件，推荐放 `src/__tests__/` |

> **插件源码目录不产生 `dist/`**（构建产物在应用根 `dist/plugins/<id>.js`，作者不关心）。完整目录约定见 `09-插件目录规范.md`。

---

## 内置插件 vs 用户插件

LinkDesk 通过 `distribution` 字段 + 物理目录区分两种插件：

| | 用户插件（默认） | 内置插件 |
|------|:--:|:--:|
| 放哪里 | `plugins/user/` | `plugins/builtin/` |
| `distribution` 字段 | 不填（默认 `"user"`） | `"builtin"` |
| 谁做的 | 第三方作者 / 官方市场 | 官方——随安装包分发 |
| 安装包更新 | 不动 | 覆盖 |
| 打包后位置 | `%APPDATA%/LinkDesk/plugins/user/` | `安装目录/resources/plugins/builtin/` |

### 创建用户插件（第三方/官方市场）

```jsonc
// plugins/user/my-plugin/plugin.json
{
  "name": "我的插件",
  "version": "1.0.0",
  "entry": "src/index.tsx"
  // distribution 不用写——默认就是 "user"
}
```

丢 `plugins/user/` 下 → 自动加载。

### 创建内置插件（LinkDesk 官方）

```jsonc
// plugins/builtin/file-tree/plugin.json
{
  "name": "文件树",
  "version": "1.0.0",
  "distribution": "builtin",   // 🔥 告诉打包脚本：跟安装包走
  "core": true,                // 🔥 告诉 UI：不可卸载
  "entry": "src/index.tsx"
}
```

**内置插件的两条规则：**

1. **目录和声明要一致。** 放 `builtin/` → 必须声明 `"distribution": "builtin"`。放 `user/` → 不要声明 `builtin`。
2. **`distribution` ≠ `core`。** `distribution` 管物理位置（打包时放哪），`core` 管 UI 行为（是否显示卸载按钮）。一个插件可以 `builtin` + `core`（不可卸载的内置设置页），也可以 `builtin` + 非 `core`（可卸载的内置主题）。

### 官方发插件到市场

官方做的插件也可以不进 `builtin/`——如果它不是随安装包分发，而是从插件市场下载的，那就和第三方一样：放 `plugins/user/`，不写 `distribution`。

---

## 最小示例（视图插件）

```json
{
  "name": "GPS 地图",
  "version": "1.0.0",
  "icon": "resources/map.svg",
  "description": "交互式地图视图，支持 Leaflet/高德",
  "author": "社区",
  "entry": "src/index.tsx"
}
```
`entry` 字段 → loader 自动识别为视图插件。

## 贡献检测规则

| 声明字段 | 自动识别为 | 加载行为 |
|---------|-----------|---------|
| `entry` | view | 动态 import → 注册到 viewRegistry |
| `themes` | theme | 注册到 ThemeEngine |
| `languages` | language | 注册到 i18next |
| `mode` | protocol | 协议注册（Phase 5 完整实现）|
| `resources` | resource | 资源注册（Phase 5 完整实现）|
| `sidebar` | view + sidebar | 侧栏组件随视图一起注册 |
| `statusBar` | view + statusBar | 状态栏贡献随视图一起注册 |
| `contributes.commands` | — | 注册到 CommandRegistry → 命令面板/右键菜单/快捷键 |
| `contributes.configuration` | — | 注册到 ConfigurationRegistry → Settings Editor 自动渲染 |
| `contributes.menus` | — | 注册到 MenuService → 右键菜单动态生成 |
| `contributes.keybindings` | — | 注册到 KeybindingRegistry → 全局键盘监听 |
| `contributes.themes` | theme (P6) | 注册到 ThemeRegistry → 主题浏览器 |
| `contributes.languages` | language (P6) | 注册到 LanguageRegistry |
| `contributes.fileAssociations` | — (P6) | 注册到 FileAssociationService → 双击文件自动打开 |
| `contributes.floatingPanel` | — (E5.8#39.5) | 声明视图可在壳内悬浮面板显示——viewId 引用已注册视图；未声明则无「在悬浮面板中打开」右键（I8-3） |

**插件可同时声明多种贡献。** 比如一个视图插件可以有 `entry` + `sidebar` + `statusBar` + `contributes.configuration` + `contributes.commands`——全部独立注册，互不影响。

## 完整示例

### 视图 + 侧栏 + 状态栏

```json
{
  "name": "终端",
  "version": "1.0.0",
  "icon": "terminal",
  "entry": "index.tsx",
  "sidebar": "sidebar.tsx",
  "statusBar": [
    { "id": "connection", "label": "未连接", "align": "left" },
    { "id": "stats", "label": "TX:0  RX:0", "align": "left" }
  ]
```

### 主题插件

```json
{
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
  "languages": [{ "code": "ja", "name": "日本語", "file": "ja.json" }],
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
  "mode": "text",
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
| `name` | `string` | 显示名称，用户可见。**schema 级必需**（与 `version` 并列，唯二必填） |
| `version` | `string` | 语义化版本，如 `"1.0.0"`。**schema 级必需** |
| `entry` | `string` | 入口文件路径，相对插件目录。**仅视图/标签页插件需要**——不是 schema 级必需（entryless 侧栏插件零 entry，见「图标栏出现规则」） |
| `icon` | `string` | 图标标识——codicon/Lucide 名称或 SVG 路径（可选，缺省用默认图标） |

> **`type` 字段已废弃**（E5.7 起不再必需，也不在 schema 必需列表）——loader 从 `entry`/`themes`/`languages`/`mode`/`resources`/`contributes` 等声明字段自动检测贡献类型。

### 可选字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `$schema` | `string` | JSON Schema 引用路径 |
| `core` | `boolean` | `true` = 核心控制面，不可卸载。默认 `false` |
| `distribution` | `string` | `"builtin"` \| `"user"`。默认 `"user"`——第三方插件不填即可 |
| `factoryRole` | `string` | 系统插槽角色：`"settings"` \| `"marketplace"`。**填 = 形态二（替换/进槽位切换）；不填 = 形态一（普通视图插件并存）**——详见下方「`factoryRole` 字段详解」 |
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
| `requires` | `string[]` | 插件级激活依赖——按 pluginId 声明，加载时先加载依赖再加载本插件（E5.8#13）。无版本约束。详见下方「`requires` 字段详解」 |
| `changelog` | `array` | 更新日志 `[{ version: string, date: string, changes: string[] }]` |
| `screenshots` | `string[]` | 截图 URL 数组（Phase 5+ 启用） |
| `minAppVersion` | `string` | 最低软件版本要求 |
| `docs` | `string` | 附带文档路径（资源插件联动） |
| `cardDocMap` | `object` | 卡片 ID → 文档锚点映射 |
| `i18n` | `object` | 插件自带翻译 `{ "en": "i18n/en.json", "ja": "i18n/ja.json" }`——key=插件 UI 原文（建议作者母语）。放在 `contributes.i18n` 下，非顶层 |
| `cssVars` | `object` | 插件自定义 CSS 变量 `{ "--name": { "dark": "#fff", "light": "#000" } }` |
| `permissions` | `string[]` | 权限声明 `["serial", "filesystem", "network"]`（Phase 5+ 启用） |

### `requires` 字段详解

插件级激活顺序依赖——声明本插件激活前必须先激活哪些插件（E5.8#13）。

**对标 VS Code `extensionDependencies`**：同族机制，本字段是其归一化收口（见下「命名边界」）。

**语义：**
- 值 = 依赖插件的 `pluginId` 数组（无版本约束——激活顺序不承载版本语义，版本匹配属 E6 市场范畴）
- loader 按拓扑序加载：`requires` 里的插件先激活，本插件再激活——扫描顺序不再影响激活顺序
- 依赖缺失 → 本插件挂起（PENDING），依赖装好/启用后自动加载
- 依赖被卸载/禁用 → 本插件连带卸载（消费者优先，逆拓扑序）
- 依赖关系成环（A→B→A）→ 加载时检测到即报错，插件不激活

**示例：**

```json
{
  "name": "串口增强",
  "version": "1.0.0",
  "icon": "package",
  "requires": ["serial-core"]
}
```

**命名边界（三个「依赖」不混淆）：**

| 字段 | 层级 | 语义 |
|---|---|---|
| `requires` | 插件级（plugin.json 顶层） | 激活顺序依赖——先依赖后本插件（E5.8#13） |
| `dependsOn` | 配置项级（`contributes.configuration` 项内） | 某配置项依赖另一配置项的值 |
| `extensionDependencies` | 插件级（历史字段） | 已废弃——归并到 `requires`（E5.8#14 落地） |

### `factoryRole` 字段详解——形态一（并存）vs 形态二（替换）

> **一句话：想和官方**并排出现**自己的图标/UI → 不填 `factoryRole`（普通视图插件，天然并存）；想**替换官方**成为系统默认（设置页/插件市场）→ 填 `factoryRole`（进槽位，切换使用）。**

| | 形态一（并存） | 形态二（替换） |
|---|---|---|
| 声明 | **不填** `factoryRole` | **填** `factoryRole:"settings"` / `"marketplace"` |
| 本质 | 普通视图插件（`appearsIn.iconBar` + 自己的 view） | 该角色的一个候选，进 FactorySlots 槽位 |
| 图标栏 | 自己的图标和官方**并排** | 激活套图标**占槽**、非激活套隐藏 |
| 切换 | 无——用户自己点哪个进哪个 | 设置页自动出该**角色名分组** + 切换按钮 |
| 今天能做吗 | ✅ 零壳改动 | ✅ E5.8 方案A 已落地（#41.11-#41.18） |

**名字不参与机制。** 壳没有任何「比名字」的逻辑——pluginId 各归各永不撞；视图 id 由 `(pluginId, viewId)` 复合键免疫碰撞；显示名只是给用户看的。所谓「同名分组」其实是「**同角色分组**」——分组按**角色名**命名（如「插件市场」），你叫 "Marketplace" 还是 "Map Store"，只要声明了同一 `factoryRole` 就进同一组。

**怎么选（作者自选表达）：**
- **想并存 → 不填。** 例：第三方做全新市场 UI，图标栏官方旁边多一个自己的图标，点进去是自己的 UI，和官方拿同一份数据
- **想替换 → 填。** 例：声明 `factoryRole:"marketplace"` → 设置页出「插件市场」组 + 切换按钮，切过去后图标/内容换成你的

**形态二实现细节**（E5.8 Phase 8.2 方案A 已落地，#41.11-#41.18；参考实体 `plugins/user/settings-demo/` + `10-如何造一个设置插件.md`）：

- **① 一对多槽位**：同一 `factoryRole` 多插件声明 = **合法并存**，全收进槽位候选（不再"第一个胜出"）。**默认**（用户没切过/打开时）= `core:true` 优先、否则注册序首声明（稳定排序，不靠扫描序巧合）。多候选并存不再静默——壳控制台 fail-loud 点名全部候选 + 默认（每候选集合变化才重喷一次）。
- **② 活动套 = 用户切换选择，落盘持久化**（重启保持）。公开枚举/切换面 `window.linkdesk.factorySlots.*`（#41.14 ⑤ 通用枚举面，槽位无关收 role 参数；settings 角色另有 `window.linkdesk.settings.*` 兼容别名，内部原样转发）：

  | 方法 | 作用 |
  |------|------|
  | `factorySlots.listRoles()` | 全部已填充角色名（注册序）——设置页先枚举角色再 list(role) 判候选数 |
  | `factorySlots.list(role)` | 该角色全部候选 `[{ pluginId, title, viewId? }]`——title=显示名原文，viewId=该套 `contributes.floatingPanel.viewId`（无声明 = undefined） |
  | `factorySlots.getActive(role)` | 活动套插件 ID——读持久化，无记录/已卸载回退默认（内置） |
  | `factorySlots.setActive(role, pluginId)` | 切换活动套——校验候选后落盘；**非候选 fail-loud 抛错** |

- **③ 切换入口 = 设置页角色分组（动态出现）**：设置 UI 打开时枚举 `listRoles()` → 对每个**非设置插件角色** `list(role)` → **候选 ≥2 才建组**（单候选无切换意义）。组形态 = 切换按钮在顶（列出该角色全部候选，激活高亮）+ 激活套自己的配置在下方；复用同名组优先（按 pluginId 找激活候选自己的配置组）、没有才新建；激活套无配置项 → 空状态。切换 = `setActive` → 重拉数据 → 配置随激活套换。你的设置插件**自身角色**（settings）的切换 = 顶部通用区按钮（见 `10-如何造一个设置插件.md`）。
- **④ 图标栏占槽**：声明 `factoryRole` 的插件（形态二），图标栏**只渲染激活套图标**、非激活套隐藏——"把官方的剔除换成你的"；不声明的形态一照旧全出并排。
- **⑤ 路由接缝**：打开设置（`Ctrl+,` / 齿轮）= `factorySlots.getActive("settings")` → 已开标签页聚焦 / 声明了 `floatingPanel` → 悬浮面板（载荷带 pluginId 复合寻址）/ 无声明 → 开标签页。切换激活套后，后续打开全走新套，两端一致。
- **⑥ 全插件侧换套**（切换按钮点击，零壳改动）：`setActive` → 标签页形态 = 关本套 tab → 开目标套（singleton 去重已存在则聚焦）；悬浮面板形态 = `panel.revealFloating(viewId, pluginId?)` **原地复合替换**面板内容（不背后弹残留 tab；目标套无 floatingPanel 声明 → 退回开标签页）。删任意套 → `onPluginLifecycleChange` → 重拉 → 按钮自动消失。

**双场景示例（官方 + 第三方 插件市场）：**

| | 形态一（并存） | 形态二（替换） |
|---|---|---|
| 第三方声明 | 不填 `factoryRole`——普通视图插件（`appearsIn.iconBar` + 自己的 view + `pluginManager.*` 数据） | 填 `factoryRole: "marketplace"` |
| 图标栏 | 官方 Marketplace 旁并排你自己的图标，两个市场各自独立 | 只显示**激活套**图标（默认=内置 core:true 优先），非激活套隐藏 |
| 设置页 | 无槽位概念 | 出「插件市场」角色组（候选 2）+ 切换按钮 |
| 用户切换 | 无——自己点哪个进哪个 | 切到你的 Map Store → 图标/打开行为全换成你的，持久化重启保持 |
| 数据 | 同一份 `pluginManager.*` API，各做各的 UI | 同一份数据，UI 换成激活套 |

> 📖 设计拍板档案 → 记忆 `factory-role-coexistence`；任务 → E5.8 执行清单 #41.10 ⑧ / #41.11-#41.18 / #37.9.3.6

### `icon` 字段详解

图标出现在图标栏、标签栏、欢迎页、[+] 菜单——所有地方显示同一个图标，由 `<PluginIcon>` 组件统一渲染。

**对标 VS Code：** 图标文件放在插件自己的目录下，`icon` 字段写文件名即可。

**三种方式指定图标：**

| 方式 | `icon` 值 | `iconSource` | 文件位置 |
|------|-----------|-------------|---------|
| codicon 内置图标 | `"package"` | 不写（默认 `"codicon"`） | 无需文件——系统内置 codicon 字体 |
| Lucide 内置图标 | `"FolderTree"` | `"lucide"` | 无需文件——壳内置 Lucide 图标集（白名单见 PluginIcon `LUCIDE_MAP`：FolderTree/Folder/File/Package 等） |
| 自定义 SVG / PNG | `"resources/icon.svg"` | 不写 | `plugins/user/<插件ID>/resources/icon.svg`（推荐 `resources/` 子目录） |
| 自定义 PNG（无扩展名） | `"resources/icon"` | 不写 | `plugins/user/<插件ID>/resources/icon.png`（自动加 `.png`） |
| 外部 URL | `"https://..."` | `"url"` | 任意可访问的 URL |

**示例：**

```json
// codicon 内置图标——零文件，直接写 codicon 名
{ "icon": "package" }

// 自定义 SVG——推荐，矢量不模糊，fill="currentColor" 跟随主题
{ "icon": "resources/icon.svg" }
// 文件放在插件目录下：plugins/user/my-plugin/resources/icon.svg

// 自定义 PNG——位图，多尺寸可能模糊
{ "icon": "resources/icon.png" }
// 文件放在插件目录下：plugins/user/my-plugin/resources/icon.png

// 外部 URL
{ "icon": "https://example.com/icon.svg", "iconSource": "url" }
```

> **推荐 SVG + `fill="currentColor"`：** 一个文件适配所有尺寸（图标栏 24px、标签栏 14px、欢迎页 24px/16px），亮/暗主题自动变色。PNG 放大会模糊，不推荐。

### 图标栏出现规则（appearsIn.iconBar）

> **opt-IN——不声明 `appearsIn.iconBar` = 图标栏没有你的图标。** 曾经的 `iconLocation` 默认 `"top"`（opt-OUT——编辑器没声明也挤进图标栏）已被 E5#14 废弃，现在由 `appearsIn.iconBar` 声明式控制（`"top"` = 上部图标组，`"bottom"` = 底部固定组）。

**两条路拿到图标：**

| 路径 | 前提 | 说明 |
|------|------|------|
| **有 `entry`** | `entry` + `appearsIn.iconBar` | 经典形态——entry 组件注册进 viewRegistry，图标 + 可作为标签页打开 |
| **entryless**（E5.8#37.9.2.3 起） | **无 `entry`** + `contributes.viewsContainers` 含侧栏容器 + `appearsIn.iconBar` | 侧栏专用插件的最简路径——**不需要写假 `src/index.tsx`**。壳注册 component-less 条目，图标照常出现 |

**谁拿不到图标：**
- **数据插件**（零侧栏容器，如语言包）——故意不显示。`pluginRole: "data"` 门控，防"为凑图标被迫写空壳"
- **纯面板 / auxiliarybar 容器**——图标栏的语义是「打开侧栏容器」，panel / auxiliarybar 不算
- **entryless 插件永远不是标签页**——`appearsIn.tabBar: true` 必须配合 `entry`（标签页渲染靠 entry 组件）

**最小 entryless 侧栏插件——零 index.tsx：**

```json
{
  "name": "侧栏工具",
  "icon": "globe",
  "appearsIn": { "iconBar": "top" },
  "contributes": {
    "viewsContainers": {
      "my-sidebar": { "title": "侧栏工具", "location": "sidebar" }
    },
    "views": {
      "my-sidebar": [
        { "id": "main", "title": "主视图", "render": "src/views/MainView.tsx", "order": 0 }
      ]
    }
  }
}
```

视图由 ViewContainerService 按 `contributes.views[].render` 加载，图标走壳的 component-less 注册路径。**官方示范：`plugins/user/demo-en`（Hello World）**——侧栏专用插件要图标 = `appearsIn.iconBar` + sidebar `viewsContainers`，不需要 `entry`、不需要 `src/index.tsx`；**有标签页需求的插件才需要 `entry`**。

### `contributes` 字段（Phase 5+）——对标 VS Code

> **插件一旦声明 `contributes`，系统自动接线——不需要改任何核心代码。**

#### contributes.configuration —— 插件设置自动出现在 Settings Editor

安装后，Settings Editor 左侧树自动多一个分组，右侧自动渲染表单。**不需要手写设置界面。**

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
        "cad.darkThemeOverride": {
          "type": "boolean",
          "default": false,
          "description": "强制暗色视图"
        }
      }
    }
  }
}
```

**支持的 type：** `"string"` | `"number"` | `"boolean"` | `"integer"`
**支持的约束：** `enum`（下拉列表）| `minimum` / `maximum`（数值范围）| `default`（默认值）

**插件代码里读设置（走 `window.linkdesk.configuration`——插件通信铁律，禁止 `import @src/core/...`）：**
```typescript
function CadView() {
  const [gridSize, setGridSize] = useState<number | undefined>(10);

  useEffect(() => {
    window.linkdesk.configuration.get<number>("cad.gridSize").then(setGridSize);
    return window.linkdesk.configuration.onChange<number>("cad.gridSize", setGridSize);
  }, []);
  // 用户在 Settings Editor 改值 → onChange 回调 → 组件自动重渲染
}
```

#### contributes.commands —— 插件注册命令，出现在命令面板

```json
{
  "contributes": {
    "commands": [
      {
        "id": "cad.importDxf",
        "title": "导入 DXF…",
        "category": "CAD"
      },
      {
        "id": "cad.exportPdf",
        "title": "导出 PDF…",
        "category": "CAD",
        "when": "activeEditor == 'cad'"
      }
    ]
  }
}
```

**`when` 条件：** Phase 5 的 ContextKeyService 实时求值。表达式语法：

| 运算符 | 示例 | 含义 |
|--------|------|------|
| 裸 key | `portOpen` | key 值为 truthy → true |
| `!` | `!portOpen` | 取反 |
| `&&` | `activeEditor == 'terminal' && portOpen` | 逻辑与 |
| `\|\|` | `activeEditor == 'a' \|\| activeEditor == 'b'` | 逻辑或 |
| `==` | `activeEditor == 'terminal'` | 等于（值比较） |
| `!=` | `editorCount != 0` | 不等于 |
| `in [a, b]` | `activeEditor in ['terminal', 'cad']` | 集合成员 |
| `()` | `!(portOpen \|\| editorCount > 1)` | 分组 |

**可用的 Context Key：**

| Key | 类型 | 说明 | 谁写入 |
|-----|------|------|--------|
| `activeEditor` | `string \| null` | 当前聚焦标签页的 pluginId | App.tsx（标签页切换时） |
| `portOpen` | `boolean` | 串口是否打开 | App.tsx（串口开关时） |
| `portName` | `string \| null` | 当前串口名，如 `"COM3"` | App.tsx（串口开关时） |
| `editorCount` | `number` | 打开的标签页总数 | App.tsx（标签页增删时） |
| `editorHasSelection` | `boolean` | 编辑器是否有选中文本 | 预留（Phase 6 CM6 selection listener） |

> **写 when 的规则：所有插件命令都应声明 `when`。** 不加 `when` = 任何上下文都可见——命令面板在多标签页页也能看到，用户困惑。

#### contributes.menus —— 插件声明右键菜单项

```json
{
  "contributes": {
    "menus": {
      "editorContext": [
        "cad.importDxf",
        "cad.exportPdf"
      ],
      "tabContext": [
        { "command": "cad.closeAll", "when": "activeEditor == 'cad'" }
      ]
    }
  }
}
```

**可用菜单 ID：** `editorContext`（标签页内容右键）| `tabContext`（标签栏右键）| `fileContext`（文件树右键，Phase 6）| `cardContext`（卡片右键，Phase 7）| MenuId 开放 string（`menuBar` / 任意新注册点）

**菜单项字段：** `command`（命令 ID，有 `children` 时可为空）| `label`（覆盖命令标题）| `group` | `when` | `order`（同组排序）| `children`（嵌套子菜单，**任意深度递归**——E5.8#148/#149）。详见 `03-插件contributes规范.md §3.2`。

**菜单位置（MenuId）由框架定义，你只管在哪个位置挂什么命令。** 框架自己也注册了内置项——"关闭"、"分屏"是框架的，"清空"、"暂停"是终端插件的，"导入 DXF"是 CAD 插件的。用户右键时看到的菜单 = 框架内置 + 终端 + CAD + 你的插件——多方贡献，合并渲染。

#### contributes.keybindings —— 插件声明快捷键

```json
{
  "contributes": {
    "keybindings": [
      {
        "command": "cad.importDxf",
        "key": "ctrl+shift+i",
        "when": "activeEditor == 'cad'"
      }
    ]
  }
}
```

---

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
plugins/user/<pluginId>/    ← 第三方插件放这里
plugins/builtin/<pluginId>/ ← 内置插件（随安装包分发）放这里
```

`<pluginId>` = 文件夹名 = 插件唯一标识。`distribution` 字段声明归属（默认 `"user"`，不填即可）。命名规则：
- 小写英文 + 连字符：`gps-map`、`protocol-sbq`、`theme-dracula`
- 不带软件名、不带版本号：`terminal` 不是 `v3-terminal`

> 完整目录结构（`resources/` / `src/utils/` / `__tests__/` 放什么、命名约定）见 `09-插件目录规范.md`。

---

## 校验规则

加载器校验 `plugin.json`（`type` 字段不参与校验——已废弃，loader 从声明字段自动检测）：

**安装期（复制到 `plugins/user/` 前拦截，E5.7#81）：**
1. **缺 `plugin.json`** → 安装失败（不是有效插件）
2. **JSON 格式错误** → 安装失败，给出错误信息
3. **`validateInstallManifest` 校验**（pluginId/version/name 可解析）→ 不合法在复制前失败

**加载期（启动扫描 + 运行时加载）：**
1. **文件不存在** → 跳过该目录，日志记录
2. **JSON 格式错误** → 跳过，toast 通知用户
3. **视图插件缺 `entry` / 入口文件未导出 default 组件** → 跳过，toast（不阻断其他插件）
4. **`minAppVersion` 高于当前版本** → 跳过，标记"需升级"
5. **同名插件重复** → 优先高版本，toast 提示

任何校验失败的插件不阻断其他插件加载。

---

## 相关

- `docs/插件开发/视图插件开发.md` — 视图插件完整开发指南
- `docs/插件开发/协议插件开发.md` — 协议插件完整开发指南
- `public/schemas/plugin.schema.json` — JSON Schema 文件（权威版本）
- memory `plugin-system.md` — 插件系统完整设计
