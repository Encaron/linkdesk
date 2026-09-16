# plugin.json 规范

> **2026-09-06 与实现对齐核对**（对账）：塌平单根 `plugins/<id>`（无 builtin/user 双层）· 插件只有一类（core:true = 防误删旗标，非类别）· `distribution` = ⚠️ 遗留字段勿填。
> 🔴 **本文件恒指「插件自己仓的根」**：插件源码住在**它自己的仓**里，壳仓 `plugins/` 只剩两只开发夹具。
> 本文所有裸路径（`plugin.json` / `src/…` / `resources/…`）都是**相对插件仓根**说的——别再去壳仓 `plugins/` 里找发货插件的源码（那里没有）。
> 插件元数据的唯一入口。一个插件 = 一个文件夹 + 一份 `plugin.json` + 入口文件。
> **对标 VS Code：不再需要 `type` 字段——loader 从声明字段自动检测贡献类型。**

---

## 插件目录结构

一个插件就是一个文件夹（源码目录）。repo 源码树里 = `plugins/<id>/`（塌平单根，目录名 = 插件 ID）；第三方作者在**自己的项目根**开发，构建产出 `.linkdesk-plugin` 分发（见 [04-插件分发格式 §一](04-插件分发格式.md)）。**没有 builtin/user 双层。**

```
my-plugin/
├── plugin.json              # 插件元数据（唯一必需）
├── README.md                # 插件说明——详情页「详情」页签的数据源
├── CHANGELOG.md             # 更新日志——详情页「更改日志」页签的唯一真源
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
| `README.md` | 插件说明——详情页「详情」页签的数据源。**文件名固定，不写进 `plugin.json`**（见 [09-插件目录规范](09-插件目录规范.md)） |
| `CHANGELOG.md` | 更新日志——详情页「更改日志」页签的**唯一真源**。**文件名固定，不写进 `plugin.json`**；段标题格式见 [09-插件目录规范](09-插件目录规范.md) |
| `src/` | **推荐**源码放在 `src/` 子目录下，避免平铺。`entry`/`sidebar` 路径相对于 `plugin.json`，如 `"entry": "src/index.tsx"` |
| `resources/` | 图标等静态资源。对标 VS Code 插件常见的 `resources/` / `assets/` 目录 |
| `icon` 字段 | 相对于 `plugin.json` 的路径。如 `"icon": "resources/icon.svg"` |
| `i18n/` | 翻译文件——每种语言一个 JSON（`contributes.i18n` 声明路径） |
| `__tests__/` | 测试文件，推荐放 `src/__tests__/` |

> **插件源码目录不产生 `dist/`**（分发构建产物由 plugin-sdk 产进 `.linkdesk-plugin`（`index.bundle.js` + `views/*.bundle.js` + 改写 plugin.json），作者不关心）。完整目录约定见 `09-插件目录规范.md`。

---

## 插件只有一类——身份差异在声明字段，不在目录

**塌平单根后（2026-09-05）没有「内置/用户」两类**：repo `plugins/<id>` 与安装态 `{userData}/plugins/<id>` 都是**平铺单根**——随壳发货的插件与第三方装的在同一棵树并列。差异只在 plugin.json 字段：

| 字段 | 语义 | 谁该填 |
|------|------|:--|
| `core: true` | **UI 防误删旗标**——卸载按钮不显示/禁用（外壳依赖它提供设置页/插件市场等基础交互）。**无行为特权、非类别** | 官方这几个：`editor` `file-tree` `marketplace` `settings` |
| `distribution` | ⚠️ **遗留字段**（schema 已标废弃，勿填）——不再对应任何目录，安装侧恒归一化为 `user` | **第三方请勿填写** |

### 创建插件（第三方，自己的项目根）

```jsonc
// my-plugin/plugin.json
{
  "name": "我的插件",
  "version": "1.0.0",
  "entry": "src/index.tsx"
  // 不填 core —— 普通插件，用户可自由装卸
  // 不填 distribution —— 遗留字段，装进 app 统一归 user
}
```

构建 → `<id>.linkdesk-plugin` → 用户安装 → `{userData}/plugins/<id>/`（见 [04 §二](04-插件分发格式.md)）。

### core:true 的官方插件（随壳发货）

```jsonc
// plugins/file-tree/plugin.json（repo 单根实况）
{
  "name": "文件树",
  "version": "1.0.0",
  "core": true,                // 🔥 防误删——UI 无卸载按钮
  "entry": "src/index.tsx"
}
```

> **措辞纪律（硬约束 11）：** 「内置/随壳发货」指的是那份 `bundled-plugins/*.linkdesk-plugin` 与 boot 自动装路径，**不是一类插件**。说「core:true 的插件」「随壳发货的插件」，不说「内置插件是……」作类别定性。官方插件走市场分发时不填 core 也一样是普通插件——随包与否由是否进 bundled-plugins 决定，与字段无关。

---

## 最小示例（视图插件）

```json
{
  "pluginId": "gps-map",
  "name": "GPS 地图",
  "version": "1.0.0",
  "icon": "resources/map.svg",
  "description": "交互式地图视图，支持 Leaflet/高德",
  "author": "社区",
  "entry": "src/index.tsx"
}
```
`entry` 字段 → loader 自动识别为视图插件。`pluginId` = **插件身份，发布后永不可改**——虽然不写也能跑（退回项目目录名兜底），**但新插件一律显式写**：仓库名与本地目录名是自由的，靠兜底等于让身份跟着名字漂。

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
| `contributes.themes` | theme | 注册到 ThemeRegistry → 主题浏览器 |
| `contributes.languages` | language | 注册到 LanguageRegistry |
| `contributes.fileAssociations` | — | 注册到 FileAssociationService → 双击文件自动打开 |
| `contributes.floatingPanel` | —  | 声明视图可在壳内悬浮面板显示——viewId 引用已注册视图；未声明则无「在悬浮面板中打开」右键 |

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
| `version` | `string` | 语义化版本，如 `"1.0.0"`。**schema 级必需**。🔴 **它同时是「四处同源」的唯一真源**（`CHANGELOG.md` 段标题 ↔ 本字段 ↔ 目录条目 `versions[].version` ↔ `package.json.version`）——规则见 [09-插件目录规范](09-插件目录规范.md)「与版本号联动」，**本表不复制** |
| `entry` | `string` | 入口文件路径，相对插件目录。**仅视图/标签页插件需要**——不是 schema 级必需（entryless 侧栏插件零 entry，见「图标栏出现规则」） |
| `icon` | `string` | 图标标识——codicon/Lucide 名称或 SVG 路径（可选，缺省用默认图标） |

> **`type` 字段已废弃**（E5.7 起不再必需，也不在 schema 必需列表）——loader 从 `entry`/`themes`/`languages`/`mode`/`resources`/`contributes` 等声明字段自动检测贡献类型。

### 可选字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `$schema` | `string` | JSON Schema 引用路径 |
| `pluginId` | `string` | 🔴 **插件身份——发布后永不可变**（对标 VS Code 的 `publisher.name`）。安装目录 `{userData}/plugins/<pluginId>/`、分发件名 `<pluginId>.linkdesk-plugin`、市场目录去重键、卸载墓碑键、更新对账全部以它为准。**强烈建议显式声明**：不声明时退回「项目目录名」兜底，而仓库名与本地目录名是自由的——目录名一改身份就跟着改，且**没有一条会报错**。字符集 `^[A-Za-z0-9][A-Za-z0-9._-]*$`，**外加三个禁用**（见下方「身份的三个禁用」）。规则与实测依据见 [16-命名规范](16-命名规范.md) |
| `core` | `boolean` | `true` = **UI 防误删旗标**（对齐上文字段表 :44 新版措辞）——详情页卸载按钮不显示/禁用；**无行为特权、非类别**：API/命令层可卸可禁，卸走写 removed 墓碑。默认 `false` |
| `distribution` | `string` | ⚠️ **遗留字段**（2026-09-05 塌平单根后不再对应任何目录，安装侧恒归一化为 `user`；schema 已标废弃）。**第三方请勿填写** |
| `factoryRole` | `string` | 系统插槽角色：`"settings"` \| `"marketplace"`。**填 = 形态二（替换/进槽位切换）；不填 = 形态一（普通视图插件并存）**——详见下方「`factoryRole` 字段详解」 |
| `iconSource` | `string` | `"codicon"`（默认）/ `"svg"` / `"url"` |
| `marketIcon` | `string` | 市场展示位的**身份彩色图**（列表行 + 详情顶）。与 `icon` 不同：进图标栏的插件用它补一张彩色图。缺省 → 回退 `icon` → 再缺 → 统一默认彩色块。详见下方「市场展示图 `marketIcon`」 |
| `marketIconSource` | `string` | 与 `iconSource` 同枚举。写 `resources/…` 时**省略即可**（按值推断） |
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
| `requires` | `string[]` | 插件级激活依赖——按 pluginId 声明，加载时先加载依赖再加载本插件。无版本约束。详见下方「`requires` 字段详解」 |
| `screenshots` | `string[]` | 截图 URL 数组（Phase 5+ 启用） |
| `minAppVersion` | `string` | 最低软件版本要求 |
| `docs` | `string` | 附带文档路径（资源插件联动） |
| `cardDocMap` | `object` | 卡片 ID → 文档锚点映射 |
| `i18n` | `object` | 插件自带翻译 `{ "en": "i18n/en.json", "ja": "i18n/ja.json" }`——key=插件 UI 原文（建议作者母语）。放在 `contributes.i18n` 下，非顶层 |
| `cssVars` | `object` | 插件自定义 CSS 变量 `{ "--name": { "dark": "#fff", "light": "#000" } }` |
| `permissions` | `string[]` | 权限声明 `["serial", "filesystem", "network"]`（Phase 5+ 启用） |

### 为什么这里没有 `readme` / `changelog` 字段？

说明与更新日志**以文件为准**——插件根目录的 `README.md` / `CHANGELOG.md`（位置、格式、与详情页的对应关系见 [09-插件目录规范](09-插件目录规范.md)）。

这两个字段曾存在，但**从无读取方**（读取方按**固定文件名**读包内文件，不看任何声明字段），**2026-09-11 已删除**。

> **写进 `plugin.json` 不会生效，只会被忽略**（顶层是宽松校验，写了不报错——所以它骗人）。**若你从旧教程 / 旧提交抄到了这两个字段 → 删掉，改写成文件。**

### `requires` 字段详解

插件级激活顺序依赖——声明本插件激活前必须先激活哪些插件。

**对标 VS Code `extensionDependencies`**：同族机制，本字段是其归一化收口（见下「命名边界」）。

**语义：**
- 值 = 依赖插件的 `pluginId` 数组（无版本约束——激活顺序不承载版本语义，版本匹配属插件市场范畴）
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
| `requires` | 插件级（plugin.json 顶层） | 激活顺序依赖——先依赖后本插件 |
| `dependsOn` | 配置项级（`contributes.configuration` 项内） | 某配置项依赖另一配置项的值 |
| `extensionDependencies` | 插件级（历史字段） | 已废弃——归并到 `requires`（落地） |

### ~~`activationEvents`~~ —— 已删除（退役，2026-09-09）

> 🔴 本字段已从 schema 与运行时整体删除，**不要再写**（写了也不报错——schema 根 `additionalProperties: true` 容忍旧清单，但无任何效果）。
> 退役理由：壳侧延迟激活轨全删后，加载模型简化为「启动全量注册元数据 + JS 由池按 URL 懒加载」——无需事件字段做精确控制。
> **当前 JS 加载时机契约见 `02-插件生命周期.md` §五**：表面挂载（视图打开 import）∪ on-command 激活（命令 miss → import 属主 entry，纯命令插件 handler 须放 entry 顶层）。

### `factoryRole` 字段详解——形态一（并存）vs 形态二（替换）

> **一句话：想和官方**并排出现**自己的图标/UI → 不填 `factoryRole`（普通视图插件，天然并存）；想**替换官方**成为系统默认（设置页/插件市场）→ 填 `factoryRole`（进槽位，切换使用）。**

| | 形态一（并存） | 形态二（替换） |
|---|---|---|
| 声明 | **不填** `factoryRole` | **填** `factoryRole:"settings"` / `"marketplace"` |
| 本质 | 普通视图插件（`appearsIn.iconBar` + 自己的 view） | 该角色的一个候选，进 FactorySlots 槽位 |
| 图标栏 | 自己的图标和官方**并排** | 激活套图标**占槽**、非激活套隐藏 |
| 切换 | 无——用户自己点哪个进哪个 | 设置页自动出该**角色名分组** + 切换按钮 |
| 今天能做吗 | ✅ 零壳改动 | ✅ 已落地 |

**名字不参与机制。** 壳没有任何「比名字」的逻辑——pluginId 各归各永不撞；视图 id 由 `(pluginId, viewId)` 复合键免疫碰撞；显示名只是给用户看的。所谓「同名分组」其实是「**同角色分组**」——分组按**角色名**命名（如「插件市场」），你叫 "Marketplace" 还是 "Map Store"，只要声明了同一 `factoryRole` 就进同一组。

**怎么选（作者自选表达）：**
- **想并存 → 不填。** 例：第三方做全新市场 UI，图标栏官方旁边多一个自己的图标，点进去是自己的 UI，和官方拿同一份数据
- **想替换 → 填。** 例：声明 `factoryRole:"marketplace"` → 设置页出「插件市场」组 + 切换按钮，切过去后图标/内容换成你的

**形态二实现细节**（已落地；参考实体 `plugins/settings`（官方 core:true 设置套）+ `10-如何造一个设置插件.md`）：

- **① 一对多槽位**：同一 `factoryRole` 多插件声明 = **合法并存**，全收进槽位候选（不再"第一个胜出"）。**默认**（用户没切过/打开时）= 首注册稳定序（core:true 无行为特权，不抢默认——注册序不靠扫描序巧合）。多候选并存不再静默——壳控制台 fail-loud 点名全部候选 + 默认（每候选集合变化才重喷一次）。
- **② 活动套 = 用户切换选择，落盘持久化**（重启保持）。公开枚举/切换面 `window.linkdesk.factorySlots.*`（通用枚举面，槽位无关收 role 参数；settings 角色另有 `window.linkdesk.settings.*` 兼容别名，内部原样转发）：

  | 方法 | 作用 |
  |------|------|
  | `factorySlots.listRoles()` | 全部已填充角色名（注册序）——设置页先枚举角色再 list(role) 判候选数 |
  | `factorySlots.list(role)` | 该角色全部候选 `[{ pluginId, title, viewId? }]`——title=显示名原文，viewId=该套 `contributes.floatingPanel.viewId`（无声明 = undefined） |
  | `factorySlots.getActive(role)` | 活动套插件 ID——读持久化，无记录/已卸载回退默认（首注册候选，无 core 优先） |
  | `factorySlots.setActive(role, pluginId)` | 切换活动套——校验候选后落盘；**非候选 fail-loud 抛错** |

- **③ 切换入口 = 设置页角色分组（动态出现）**：设置 UI 打开时枚举 `listRoles()` → 对每个**非设置插件角色** `list(role)` → **候选 ≥2 才建组**（单候选无切换意义）。组形态 = 切换按钮在顶（列出该角色全部候选，激活高亮）+ 激活套自己的配置在下方；复用同名组优先（按 pluginId 找激活候选自己的配置组）、没有才新建；激活套无配置项 → 空状态。切换 = `setActive` → 重拉数据 → 配置随激活套换。你的设置插件**自身角色**（settings）的切换 = 顶部通用区按钮（见 `10-如何造一个设置插件.md`）。
- **④ 图标栏占槽**：声明 `factoryRole` 的插件（形态二），图标栏**只渲染激活套图标**、非激活套隐藏——"把官方的剔除换成你的"；不声明的形态一照旧全出并排。
- **⑤ 路由接缝**：打开设置（`Ctrl+,` / 齿轮）= `factorySlots.getActive("settings")` → 已开标签页聚焦 / 声明了 `floatingPanel` → 悬浮面板（载荷带 pluginId 复合寻址）/ 无声明 → 开标签页。切换激活套后，后续打开全走新套，两端一致。
- **⑥ 全插件侧换套**（切换按钮点击，零壳改动）：`setActive` → 标签页形态 = 关本套 tab → 开目标套（singleton 去重已存在则聚焦）；悬浮面板形态 = `panel.revealFloating(viewId, pluginId?)` **原地复合替换**面板内容（不背后弹残留 tab；目标套无 floatingPanel 声明 → 退回开标签页）。删任意套 → `onPluginLifecycleChange` → 重拉 → 按钮自动消失。

**双场景示例（官方 + 第三方 插件市场）：**

| | 形态一（并存） | 形态二（替换） |
|---|---|---|
| 第三方声明 | 不填 `factoryRole`——普通视图插件（`appearsIn.iconBar` + 自己的 view + `pluginManager.*` 数据） | 填 `factoryRole: "marketplace"` |
| 图标栏 | 官方 Marketplace 旁并排你自己的图标，两个市场各自独立 | 只显示**激活套**图标（默认=首注册候选，无 core 优先），非激活套隐藏 |
| 设置页 | 无槽位概念 | 出「插件市场」角色组（候选 2）+ 切换按钮 |
| 用户切换 | 无——自己点哪个进哪个 | 切到你的 Map Store → 图标/打开行为全换成你的，持久化重启保持 |
| 数据 | 同一份 `pluginManager.*` API，各做各的 UI | 同一份数据，UI 换成激活套 |


### `icon` 字段详解

图标出现在图标栏、标签栏、欢迎页、[+] 菜单——所有地方显示同一个图标，由 `<PluginIcon>` 组件统一渲染。

**对标 VS Code：** 图标文件放在插件自己的目录下，`icon` 字段写文件名即可。

**三种方式指定图标：**

| 方式 | `icon` 值 | `iconSource` | 文件位置 |
|------|-----------|-------------|---------|
| codicon 内置图标 | `"package"` | 不写（默认 `"codicon"`） | 无需文件——系统内置 codicon 字体 |
| Lucide 内置图标 | `"FolderTree"` | `"lucide"` | 无需文件——壳内置 Lucide 图标集（白名单见 PluginIcon `LUCIDE_MAP`：FolderTree/Folder/File/Package 等） |
| 自定义 SVG / PNG | `"resources/icon.svg"` | 不写 | `<插件目录>/resources/icon.svg`（推荐 `resources/` 子目录） |
| 自定义 PNG（无扩展名） | `"resources/icon"` | 不写 | `<插件目录>/resources/icon.png`（自动加 `.png`） |
| 外部 URL | `"https://..."` | `"url"` | 任意可访问的 URL |

**示例：**

```json
// codicon 内置图标——零文件，直接写 codicon 名
{ "icon": "package" }

// 自定义 SVG——推荐，矢量不模糊，fill="currentColor" 跟随主题
{ "icon": "resources/icon.svg" }
// 文件放在插件目录下：my-plugin/resources/icon.svg

// 自定义 PNG——位图，多尺寸可能模糊
{ "icon": "resources/icon.png" }
// 文件放在插件目录下：my-plugin/resources/icon.png

// 外部 URL
{ "icon": "https://example.com/icon.svg", "iconSource": "url" }
```

> **推荐 SVG + `fill="currentColor"`：** 一个文件适配所有尺寸（图标栏 24px、标签栏 14px、欢迎页 24px/16px），亮/暗主题自动变色。PNG 放大会模糊，不推荐。

### 市场展示图 `marketIcon`——你的插件在市场里「长什么样」

`icon` 是**界面小图标**（图标栏 / 标签栏 / [+] 菜单）；`marketIcon` 是**插件在市场列表行与详情页顶部的身份彩色图**。
两者可以不是同一张：**进了图标栏的插件**，`icon` 必须是单色线稿（图标栏会强制着色成一种颜色，彩色图会糊成一块），
而市场位该显一张有品牌色的图——这时就用 `marketIcon` 补第二枚。没进图标栏的插件一般不需要它（`icon` 本身就是身份图）。

**三档契约——按需选，三档都能上架：**

| 档 | 怎么声明 | 市场里显示 |
|:--|:--|:--|
| **零图** | 都不写 | 统一默认彩色块（够用即可上架） |
| **一张图** | 只写 `icon`（彩色 SVG） | 市场行 + 详情顶 + 你的标签页图标都显它 |
| **两张图** | `icon`（界面线稿）+ `marketIcon`（彩色身份图） | 界面用线稿、市场用彩色图 |

```json
{ "icon": "resources/icon-bar.svg", "marketIcon": "resources/icon.svg" }
```

**两条数据路（你不用管，但它决定「谁看得到哪张图」）：**

| 谁在看 | 从哪读 | 值是什么形态 |
|:--|:--|:--|
| **已装用户** | 你包里的 `plugin.json` | 包内相对路径（`resources/icon.svg`）——断网也显 |
| **未装用户**（逛市场） | 目录条目 `marketplace.json` | **绝对 URL**——`publish` 自动把你的包内路径转成 raw 直链，**你不用写 URL** |

🔴 **两条纪律：**

1. `icon` / `marketIcon` 一律写**包内相对路径**（`resources/…`）。`publish` 会在发布时自动转成
   `https://raw.githubusercontent.com/<你>/<仓库>/v<版本>/resources/…`——**写 URL 是多余的**，而且换版本后容易过期。
   （真要用外部 CDN 也可以：写完整 http(s) URL + `iconSource: "url"`，原样保留；但长期有效性得你自己保证。）
2. **换图 = 改文件 + bump 版本 + 重新 `publish`**。已装用户的图从包里读，只随版本更新获得；不 bump 版本，
   装了旧版的人永远看不到新图。

### 图标栏出现规则（appearsIn.iconBar）

> **opt-IN——不声明 `appearsIn.iconBar` = 图标栏没有你的图标。** 曾经的 `iconLocation` 默认 `"top"`（opt-OUT——编辑器没声明也挤进图标栏）已被废弃，现在由 `appearsIn.iconBar` 声明式控制（`"top"` = 上部图标组，`"bottom"` = 底部固定组）。

**两条路拿到图标：**

| 路径 | 前提 | 说明 |
|------|------|------|
| **有 `entry`** | `entry` + `appearsIn.iconBar` | 经典形态——entry 组件注册进 viewRegistry，图标 + 可作为标签页打开 |
| **entryless**（起） | **无 `entry`** + `contributes.viewsContainers` 含侧栏容器 + `appearsIn.iconBar` | 侧栏专用插件的最简路径——**不需要写假 `src/index.tsx`**。壳注册 component-less 条目，图标照常出现 |

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

视图由 ViewContainerService 按 `contributes.views[].render` 加载，图标走壳的 component-less 注册路径。**侧栏专用插件要图标 = `appearsIn.iconBar` + sidebar `viewsContainers`，不需要 `entry`、不需要 `src/index.tsx`**；**有标签页需求的插件才需要 `entry`**。

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

**菜单项字段：** `command`（命令 ID，有 `children` 时可为空）| `label`（覆盖命令标题）| `group` | `when` | `order`（同组排序）| `children`（嵌套子菜单，**任意深度递归**——）。详见 `03-插件contributes规范.md §3.2`。

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
plugins/<pluginId>/            ← repo 源码树（塌平单根；目录名 = 插件 ID）
{userData}/plugins/<pluginId>/ ← 安装态（.linkdesk-plugin zip 解压处）
```

`<pluginId>` = 文件夹名 = 插件唯一标识（身份唯一来源——loader 以目录名定 pluginId，schema 无顶层 pluginId 字段）。命名规则：
- 小写英文 + 连字符：`gps-map`、`protocol-sbq`、`theme-dracula`
- 不带软件名、不带版本号：`terminal` 不是 `v3-terminal`
- **不许占下面三个禁用名**

#### 身份的三个禁用

| 禁用 | 为什么 |
|:--|:--|
| `app` · `appearance` · `update` | **这三个是宿主自己的身份**：壳用 `app` 注册通用设置、用 `appearance` 注册外观设置、用 `update` 注册更新设置。插件拿它当 pluginId ⇒ **冲突检测永不响**（宿主自己就是这个身份，先注册的永远是它），而且**卸载会摘掉宿主自己的条目**（注销按身份摘）——你的插件一卸，宿主的设置组跟着消失 |
| `ldk-` 前缀 | 壳 / SDK 的**内部保留前缀**（`ldk-` 开头的名字留给产品线自己用）。第三方占用它 ⇒ 日后壳发一个同名插件必然相撞，而相撞的代价落在用户身上（装不上 / 更新对账错乱） |

**拦在哪（三处，都拦）：** ① `plugin.schema.json` 的 `pluginId` pattern 负向断言（编辑器和 IDE 当场标红）——schema 就在你的工程里：`node_modules/@linkdesk/plugin-sdk/schemas/plugin.schema.json`；② SDK `validate` / `lint`（作者仓自检报点）；③ 壳的安装校验 `validateInstallManifest`（装不上，给的是同一条理由）。

**报错形态**（三处文案同源，都点名 + 给理由，不是一句"不合法"）：

```
pluginId "app" 是宿主自己的身份（宿主用它注册配置/外观/更新），插件用它 ⇒ 冲突检测永不响、注销会摘掉宿主条目。
```

> ⚠️ **身份与键名是两件事**：`pluginId` 决定"你是谁"，`contributes.configuration` 的**键名**决定"这个键归谁"（那份规矩见 [03-插件contributes规范 §3.4](03-插件contributes规范.md)）。两者都不许碰宿主的保留面，但判据与报点各自独立。

> 完整目录结构（`resources/` / `src/utils/` / `__tests__/` 放什么、命名约定）见 `09-插件目录规范.md`。

---

## 校验规则

加载器校验 `plugin.json`（`type` 字段不参与校验——已废弃，loader 从声明字段自动检测）：

**安装期（解压到 `{userData}/plugins/<id>/` 前拦截）：**
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

- `04-插件分发格式.md` — 分发/安装/版本兼容
- `09-插件目录规范.md` — 源码目录结构与命名约定
- [E6 第三方作者旅程](https://github.com/Encaron/linkdesk/blob/electron/docs/02-Electron架构/E6_插件生态与发布/05-文档与发布/00-第三方作者旅程.md) — 从零到发布的完整路径
- `plugin.schema.json` — 同目录 JSON Schema 文件（权威版本，三拷贝 gate 之一）
