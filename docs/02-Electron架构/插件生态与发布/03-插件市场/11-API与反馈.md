# 市场插件 API 契约与反馈闭环——市场联络图（点4/7.1/7.3/7.4）

> 🔵 **非新能力（2026-09-05 塌平收编）**：本次改动仅插件目录塌平单根（`plugins/builtin|user` → `plugins/<id>`）解压落点文本同步，零新增 `window.linkdesk.*` / `contributes.*` 面。塌平决策见 [../01-插件独立构建/09-插件目录塌平决策.md](../01-插件独立构建/09-插件目录塌平决策.md)。

> ⚠️ **词汇过期说明（E6#73n，2026-09-11）**：本档正文里的「**toast**」「**右下角**」是 **E6#72 之前的旧称**——那套右下角窄小卡已**整删**，现在**唯一通知面 = 状态栏铃铛宽面板**（未读计数 +1，用户点开才看见；不弹卡、不抢焦点）。**API 面一字未变**：正文所有 `notifications.show/update/finish/cancel` 调用照旧，改的只是它**渲染到哪儿**。本档保留旧称不改写（设计档史实），读时按下述替换：**「右下角 toast」= 状态栏铃铛宽面板**；正文里「弹什么 toast」= 「进铃铛面板显示什么」。通知的完整行为契约（句柄归属 / `source` 分桶配额 / 进度 / 长驻）见 [../../../03-插件制造/01-插件API契约.md](../../../03-插件制造/01-插件API契约.md) §3.2 `notifications` 行。

> 对应任务：E6#13（下载安装 API）+ #30.5-#30.9（详情页/信任/安装细节）+ #31（壳侧下载安装）+ #33（更新）。
> 文档归属：市场设计文档族（[03-市场交互设计.md](03-市场交互设计.md) = 总览索引）。本档 = **API 全景 + 反馈闭环**维度。
> 相邻维度：[09-安装细节.md](09-安装细节.md)（安装 toast 粗粒度）· [08-信任与安全.md](08-信任与安全.md)（确认弹窗）· [10-市场UI拥有权.md](10-市场UI拥有权.md)（壳/插件 API 边界）。
> 用户 2026-08-29 四点需求拍板：**4=市场联络哪些 API + 右下角显示哪些提示 / 7.1=进程逻辑闭环 / 7.3=toast 显示什么/调什么 API/写什么东西 / 7.4=中英翻译策略**。
> **定位（与 09 不重复）：** 09 只答「安装的 toast 怎么实现」粗粒度；本档是**全量 API 联络图 + 每步事件流闭环 + 每种情况→API→文案 映射表 + 翻译规则**。

---

## 〇、一句话

**市场插件的全部行为都走 `window.linkdesk.*` 契约，壳零改动。** 数据读取走 `pluginManager.*`，状态动作走 `pluginManager.*`（E6#13 补远程安装），事件刷新走 `events.*`，界面打开走 `tabs.create`，反馈走 `notifications.show`（右下角 toast，唯一反馈通道），确认走 `dialog.*`。**每种用户情况 → 调什么 API → 弹什么 toast，下表闭环比 UI 先定。**

---

## 一、API 全景——市场插件联络哪些 `window.linkdesk.*`

> 契约真相源：`contracts/linkdesk.d.ts`。**已实现** = 现网可直接调；**E6#13 新增** = 本档设计对象，实现走 [E6 执行清单 E6#13](../E6-执行清单.md)。

| # | API（命名空间.方法） | 契约位置 | 用途（市场场景） | 状态 |
|:--|:--|:--|:--|:--|
| 1 | `pluginManager.list()` | d.ts L1065 | 已装插件全量（列表/详情基础数据） | ✅ 已实现（现用） |
| 2 | `pluginManager.getDisabled()` / `getUninstalled()` | d.ts | 禁用列表 / 卸载缓存（侧栏分组数据源） | ✅ 已实现（现用） |
| 3 | `pluginManager.isDisabled(id)` | d.ts | 按钮态判定（已装+禁用 → 显示启用） | ✅ 已实现（现用） |
| 4 | `pluginManager.enable(id)` / `disable(id)` | d.ts | 侧栏/详情 启用/禁用动作 | ✅ 已实现（现用） |
| 5 | `pluginManager.uninstall(id)` | d.ts | 卸载动作 = **目录真删 + 账本 `removed:true` 墓碑（boot 不复活，E6#18a）**；`core:true` 无 API 硬拦——可卸可禁，仅详情 UI 藏钮防误删 | ✅ 已实现（现用） |
| 6 | `pluginManager.install(path)` | d.ts | 本地路径安装（已装插件管理面） | ✅ 已实现（**无进度**） |
| 7 | **`pluginManager.installWithProgress(url)`** | E6#13e 新增 | **目录安装 = 远程下载 + 进度回调 + 解压落 `user/`** | 🔧 E6#13 设计对象 |
| 8 | **`pluginManager.checkUpdates()`** / **`update(id)`** | E6#13e 新增 | 更新检查 / 更新安装 | 🔧 E6#13 设计对象 |
| 9 | `events.on("plugin-lifecycle:changed", cb)` | d.ts L695 | 装/卸/禁/启完成后刷新侧栏+详情（按钮自动切换） | ✅ 已实现（现用） |
| 10 | `events.on("viewContainer:changed", cb)` | d.ts | 侧栏容器重挂后重拉数据 | ✅ 已实现（现用） |
| 11 | `events.emit("marketplace:updateBadge", {…})` | d.ts | 徽标广播（已安装/可更新计数） | ✅ 已实现（现用） |
| 12 | `tabs.create("plugin-detail", { pluginId, marketEntry, pinned })` | d.ts L283 | 打开详情页；`marketEntry` = catalog 全量条目（30.11c 数据源） | ✅ 已实现（marketEntry 30.11c 补） |
| 13 | `notifications.show(msg, { type, progress })` → `handle.update/finish/cancel` | d.ts L552 | **右下角 toast 唯一通道**（进度/成功/失败/警告） | ✅ 已实现（E3j#76，现用） |
| 14 | `dialog.confirm(opts)` / `alert(msg)` / `open(opts)` | d.ts L570 | 安装确认 / 错误提示 / 打开本地包 | ✅ 已实现（08 信任用） |
| 15 | `commands.registerCommand(id, handler, opts)` | d.ts | 市场菜单动作（enable/disable/uninstall） | ✅ 已实现（index.tsx 现用） |
| 16 | `menu.registerItems(slotId, group, items)` | d.ts | 市场齿轮菜单挂载 | ✅ 已实现（index.tsx 现用） |
| 17 | `factorySlots.getActive("marketplace")` | d.ts L1873 | 只读——当前活跃市场插件（详情渲染面判断） | ✅ 已实现（壳内用） |
| 18 | 共享组件 `@linkdesk/ui`（Button variant / Badge / PluginIcon / ContextMenu / Dialog 容器） | E6#54 / #30.14 | 壳基础件消费（**经例外表记录**，非直接 import @src） | 🔧 E6#54 打包 + #30.14 |

**API 联络图（谁调什么）：**

```text
市场插件（src/）
├─ 数据读取   → pluginManager.list / getDisabled / getUninstalled / isDisabled
│             → catalog（marketEntry，E6#29 多源合并）
├─ 状态动作   → pluginManager.enable / disable / uninstall / install(path)
│             → pluginManager.installWithProgress(url)   ← E6#13e 新增（目录安装）
│             → pluginManager.checkUpdates / update(id)  ← E6#13e 新增（更新）
├─ 事件订阅   → events.on("plugin-lifecycle:changed")    → 刷新 UI（按钮自动切态）
│             → events.on("viewContainer:changed")        → 重拉数据
│             → events.emit("marketplace:updateBadge")    → 徽标广播
├─ 界面       → tabs.create("plugin-detail", { pluginId, marketEntry, pinned })
│             → notifications.show(...)                    → 右下角 toast（唯一反馈）
│             → dialog.confirm(...)                        → 安装确认（08 信任）
└─ 基础件     → @linkdesk/ui 组件（Button/Badge/PluginIcon/ContextMenu）← 例外表记录
```

### 一·一、E6#13 新 API 契约（本档对设计对象的具体化）

> E6#13 任务档案定义了通道（`plugins:download/extract/install/uninstall/update-check/update-download/install-progress`），本档补充**市场消费侧契约**：

```ts
// contracts/linkdesk.d.ts 新增（E6#13f）
namespace pluginManager {
  /** 远程安装：下载 + 解压 + 安装，全程进度回调。url = marketplace.json versions[].downloadUrl */
  installWithProgress(
    url: string,
    opts?: {
      onProgress?: (p: { percent: number; stage: "download" | "extract" | "install"; message?: string }) => void;
    },
  ): Promise<{ ok: true; pluginId: string } | { ok: false; error: string; reason: "network" | "verify" | "deps" | "unknown" }>;

  /** 更新检查：对比本地 vs marketplace.json 版本 */
  checkUpdates(): Promise<Array<{ pluginId: string; current: string; latest: string }>>;

  /** 更新安装：下载最新版 → 替换 → 重载 */
  update(id: string): Promise<{ ok: boolean; error?: string }>;
}
```

**进度回调通道**（E6#13d）：主进程 `plugins:install-progress` `ipcMain.on` → `event.sender.send` 推 `{ pluginId, percent, stage }` → preload 缓冲回放 → 市场插件 `opts.onProgress`。**回调只进市场插件，壳 zero 改动。**

**验收锚点（E6#13 验证）：** 壳侧 `window.linkdesk.pluginManager.installWithProgress(url)` → 下载 → 进度回调 → 解压 → 安装 → 图标栏出现新插件。从插件 WebView 同调同结果。

---

## 二、进程逻辑闭环（7.1）

> **闭环定义：** 每次用户动作 = 「点击 → 调用 API → 主进程处理 → 事件广播 → UI 刷新 + toast 收尾」一条完整链路，**无断点、无孤儿状态**（三通道反馈分工见 03 §三·五）。

### 2.1 安装（目录安装，主链路）

```text
用户点「安装」
  │  marketEntry = 当前条目（含 downloadUrl / versions / deps）
  ▼
市场插件：installWithProgress(marketEntry.downloadUrl, { onProgress })     ← E6#13e
  │
  ├─ [主进程] plugins:download  fetch(url) → ArrayBuffer → 临时目录
  │     │  └─ plugins:install-progress 推 { percent, stage:"download" }
  │     │        └─ 市场插件 onProgress → notifications.show("正在安装 xxx…", { progress:true })
  │     │             └─ handle.update("正在安装 xxx… 62%")  ← 进度闭环
  ├─ [主进程] plugins:extract    解压到 {userData}/plugins/<pluginId>/（2026-09-05 塌平单根，无 user/ 层）
  │     │  └─ 进度推 stage:"extract"
  ├─ [主进程] plugins:install    PluginInstallService.add → loadPlugin → IpcBridge.broadcast("plugin:installed")
  │     │
  │     ▼ 广播（非返回）
  ├─ events.on("plugin-lifecycle:changed") 收到
  │     │  └─ 市场插件重拉 pluginManager.list() → 侧栏该项 →「已安装」徽标 + 按钮切「禁用/卸载」
  ├─ 市场插件 handle.finish("已安装：xxx")                                    ← 成功 toast
  └─ 图标栏出现新插件图标（loadPlugin 完成）
```

### 2.2 失败 / 断网 / 缺依赖（同一链路的失败分支）

```text
installWithProgress 返回 { ok:false, reason }
  │
  ├─ reason="network"   → notifications.show("安装失败：网络连接不可用", { type:"error" })
  │                        + toast 内 [重试] → 重调 installWithProgress（同一 marketEntry）
  ├─ reason="verify"    → notifications.show("安装失败：文件校验未通过", { type:"error" }) + [重试]
  ├─ reason="deps"      → notifications.show("无法安装：缺少依赖环境", { type:"warning" }) + [查看依赖]
  │                        （E5.8#14/#15 依赖引擎已实现：缺依赖被拦 = 挂起态，详情页按钮「🚫 安装不可用」）
  └─ reason="unknown"   → notifications.show("安装失败：未知错误，请重试", { type:"error" })
```

### 2.3 卸载 / 禁用 / 启用（三态动作）

```text
用户点「卸载」→ dialog.confirm 确认（08 信任 §四）→ pluginManager.uninstall(id)
  │  └─ lifecycle:changed → 侧栏该项移到「探索」组（未装）→ toast "已卸载：xxx"
用户点「禁用」→ pluginManager.disable(id) → lifecycle:changed → 按钮切「启用」→ toast "已禁用：xxx"
用户点「启用」→ pluginManager.enable(id)  → lifecycle:changed → 按钮切「禁用」→ toast "已启用：xxx"
```

### 2.4 更新（E6#33 第三维）

```text
启动 → checkUpdates() → 有更新 → 侧栏「可更新」徽标（updateBadge）+ 详情页升级入口
用户点「更新」→ pluginManager.update(id) → 下载/替换/重载（进度同 2.1）→ toast "已更新：xxx v1.1.0"
自动更新勾选（#33d Opt-IN 默认关）→ 更新检查通过 → 自动下载替换 → toast
```

### 2.5 挂起 · 缺依赖（状态型，非事件型）

> 依赖引擎（E5.8#14/#15）已实现：已装插件因依赖被卸载而挂起。这是**持续状态**，不走 toast——走 03 §三·五 状态通道：

```text
依赖被卸载 → 挂起态（详情页 header 下内嵌条 pd-pending-notice + 侧栏「等待依赖」琥珀徽标）
依赖补齐 → 挂起解除自动加载 → 内嵌条消失 + 徽标恢复
```

**闭环保证（03 §三·五 原话）：** ①点安装缺依赖 → toast（事件）+ 侧栏「等待依赖」（状态）+ 按钮「🚫 不可用」；②依赖补齐 → 挂起解除自动加载；③安装成功 → 按钮自动切「禁用/卸载」。无「画了状态但逻辑到不了」的孤儿帧。

---

## 三、反馈提示映射表（点4 / 7.3）——情况 → API → 文案

> **右下角 toast 是唯一事件反馈通道**（顶部横幅禁用，用户拍板）。视觉 = [mockups/02](mockups/02-插件详情页-全状态详解.html) 帧 2/3/7。
> **API 调用全部 `window.linkdesk.notifications.show`**——四方法 show/update/finish/cancel，零新 API（E3j#76 已实现）。
> **文案规则：** 统一字符全走 `t()`（i18n key = 中文原文，硬约束 2）；`{{name}}` 等占位符 = 插件名/分类，有翻译显示翻译、无则原文（§四）。

| 情况 | 调什么 API | toast 显示什么（t() key = 中文原文 / 英文译文） | 类型 | 主动作 |
|:--|:--|:--|:--|:--|
| 安装开始 | `show(t("正在安装 {{name}}…", {name}), { progress:true })` | 正在安装 {{name}}… / Installing {{name}}… | progress | — |
| 安装进度 | `handle.update(t("正在安装 {{name}}… {{percent}}%", …))` | 正在安装 {{name}}… 62% | progress | — |
| 安装成功 | `handle.finish(t("已安装 {{name}}"))` | 已安装 {{name}} / Installed {{name}} | info | — |
| 安装失败 · 断网 | `show(t("安装失败：网络连接不可用"), {type:"error"})` | 安装失败：网络连接不可用 / Install failed: network unreachable | error | [重试] |
| 安装失败 · 校验 | `show(t("安装失败：文件校验未通过"), {type:"error"})` | 安装失败：文件校验未通过 / Install failed: integrity check failed | error | [重试] |
| 安装失败 · 未知 | `show(t("安装失败：未知错误，请重试"), {type:"error"})` | 安装失败：未知错误，请重试 | error | [重试] |
| 缺依赖被拦 | `show(t("无法安装：{{name}}缺少依赖环境，无法下载"), {type:"warning"})` | 无法安装：{{name}}缺少依赖环境，无法下载 / Cannot install: {{name}} is missing dependency environment | warning | [查看依赖] |
| 卸载成功 | `show(t("已卸载 {{name}}"), {type:"info"})` | 已卸载 {{name}} / Uninstalled {{name}} | info | — |
| 卸载失败 | `show(t("卸载失败：{{reason}}"), {type:"error"})` | 卸载失败：{{reason}} | error | — |
| 禁用成功 | `show(t("已禁用 {{name}}"), {type:"info"})` | 已禁用 {{name}} / Disabled {{name}} | info | — |
| 启用成功 | `show(t("已启用 {{name}}"), {type:"info"})` | 已启用 {{name}} / Enabled {{name}} | info | — |
| 更新完成 | `show(t("已更新 {{name}} v{{version}}"), {type:"info"})` | 已更新 {{name}} v1.1.0 / Updated {{name}} v1.1.0 | info | — |
| 更新失败 | `show(t("更新失败：{{reason}}"), {type:"error"})` | 更新失败：{{reason}} | error | [重试] |
| 自动更新完成 | `show(t("{{name}} 已自动更新至 v{{version}}"), {type:"info"})` | {{name}} 已自动更新至 v1.1.0 | info | — |

**非 toast 的反馈（走状态通道 / 弹窗）：**

| 情况 | 通道 | 形态 |
|:--|:--|:--|
| 安装确认 | `dialog.confirm`（08 信任 §四） | 壳 Dialog 容器 + 市场自绘内容（来源/发布者/许可证/版本/大小） |
| 挂起 · 缺依赖（持续） | 详情页内嵌条 `pd-pending-notice` | 只推详情页一行，不推整个 UI |
| 已安装 / 可更新 / 等待依赖 / 已禁用（列表扫视） | 侧栏徽标 `ms-item-badge` 系列 | 一望即知，waiting 琥珀「等待依赖」已实机 |
| 打开本地包 | `dialog.open`（可选） | 从文件安装 .linkdesk-plugin |

**映射表使用纪律：** 实现阶段逐条对照本表——每新增一种反馈情况，先查本表有没有同类（有 → 复用 key/API/类型；无 → 补表 + 补 i18n key），**禁止随手造 toast 类型**。

### 三·五、缝隙定案（2026-08-29——安装/卸载/语言/注入）

| 缝隙 | 定案 | 落点 |
|:--|:--|:--|
| G3 同 id 安装冲突 | 三态按钮已从 UI 杜绝「已装显示安装」；防御路径若出现同 id 再装 → **覆盖安装**（更新同路径，保留配置），无额外弹窗 | 09 §三·五 |
| G4 卸载/禁用使用中 | **静默**——不弹窗，直接关标签页 + 执行 + toast 照常（用户拍板） | 09 §三·五 |
| B4 挂起中卸载 | 挂起插件可卸载，连带清依赖引用，无孤儿 | 09 §三·五 |
| F3 语言切换即时 | **零订阅**（3.1 轮实锤：E5.8 无语言变更事件，原「订阅事件」话术已废）——市场插件用 react-i18next `t()`，壳切语言调 `i18next.changeLanguage` → 所有 `useTranslation` 组件自动重渲染 | §四 |
| E1 插件名/描述/分类注入 | catalog 字段渲染走 sanitize（纯文本转义，与 README 同机制） | 04 §三 |

---

## 四、中英翻译策略（7.4）

### 4.1 坐实：翻译 = 市场插件自己提供（非壳）

市场插件已声明 `contributes.i18n`（`plugin.json`）+ `i18n/en.json`（26 键）——**i18n 是插件级机制，翻译资源随插件走，换市场插件 = 换整套翻译**（对标 VS Code 扩展自带 languages 目录）。壳不提供市场文案翻译。

### 4.2 key 约定

- **i18n key = 中文原文**（项目硬约束 2，已遵行）。`t("正在安装 {{name}}…")` 查 `en.json` 同 key → 英文译文。
- 插值占位用 `{{var}}`（i18next 内建，en.json 现有 "已安装 {{count}} 个插件" 先例）。

### 4.3 占位符规则——{{name}} 有翻译显示翻译，无则原文（用户原话点 7.4）

> 「'下载失败，xxx插件缺少依赖环境，无法下载'——这里'xxx'就是那个第三方插件自己的东西，有翻译就显示翻译，没有就显示原文，其余都翻译。」

**翻译查找层级（一次 fallback）：**

```ts
// 市场插件工具函数（services/marketEntry 层）
function displayName(entry: MarketEntry): string {
  // ① 插件自带的本地化 title（插件自己 contributes.i18n 提供，壳已按当前语言解析）
  //    manifest.title 就是"该插件的翻译"——找不到时壳 fallback 到 manifest.name（ID 原文）
  return entry.title ?? entry.name;   // 有翻译 → title；无 → name 原文
}

// toast 里统一走它：
notifications.show(t("无法安装：{{name}}缺少依赖环境，无法下载", { name: displayName(entry) }))
```

- `entry.title`：catalog 多语言 title（E6#29c 纯增量字段，来自插件 contributes.i18n）——**有翻译显示翻译**。
- `entry.name`：插件 ID 原文（唯一，无翻译）——**无则显示原文**。
- 分类 `categories[]` / legacy `category`：值为**英文 slug**（E6#32b 2026-09-08 用户拍板，VS Code 式）——翻译映射见 §4.4；无映射 slug → 显示原文。

### 4.4 分类翻译约定（E6#32b——英文 slug 身份 + 双值表）

> 🔥 **全仓首批「英文 key 作身份、双语言做值」试点**（软件英文化方向，见记忆 `english-first-direction`）——category 值 = 英文 slug，zh/en 都只是显示层值表；此形态需 zh.json（schema「不需要 zh.json」只对中文 key 成立）。

```jsonc
// marketplace/i18n/en.json —— slug → English（追加在中文 key 之后）
{ "category.serial": "Serial", "category.editor": "Editor", "category.tool": "Tools", "category.theme": "Theme" }
// marketplace/i18n/zh.json —— slug → 中文（E6#32b 新增第二资源；plugin.json contributes.i18n 增 "zh"）
{ "category.serial": "串口", "category.editor": "编辑器", "category.tool": "工具", "category.theme": "主题" }
```
显示 = `services/marketCategories`（`categoryText`）：legacy `category` + `categories[]` 并集去重、逐 slug `t("category."+slug)`、「 · 」连接整行；**无对应键 → 显示原始 slug**（尊重第三方自定义分类，不硬编码白名单）。当前唯一消费点 = 详情页元数据「分类」行；未来主区商店「分类 rail」按同 slug 分组（#32b 只做显示不做导航）。

**规范分类集（2026-09-08 starter，推荐官方目录采用，可调）：**

| slug | zh | en |
|:--|:--|:--|
| serial | 串口 | Serial |
| editor | 编辑器 | Editor |
| file | 文件 | Files |
| terminal | 终端 | Terminal |
| language | 语言 | Language |
| theme | 主题 | Theme |
| dashboard | 仪表 | Dashboard |
| data | 数据 | Data |
| map | 地图 | Map |
| protocol | 协议 | Protocol |
| collaboration | 协作 | Collaboration |
| tool | 工具 | Tools |
| other | 其他 | Other |

### 4.5 翻译完整性验收

- 新增 toast/UI 文案 = 新增 i18n key（中文原文 key + en.json 译文），**禁止中文直出**（硬约束 2）。
- 占位符落点（`{{name}}`/`{{version}}`/`{{reason}}`）在 en.json 保留同一插值结构。

---

## 五、暂缓 / 待定

- ~~**图形进度条（toast 内进度 UI）**——API 面已现成（progress + update 改文字），图形条留未来（09 已定）。~~ **✅ 已交付（2026-09-10 校正）：** E6#71i 打通 percent 全链（池 preload `update` 第三参 → 壳 `updateToast` → 池定态百分比 `fill` / 不定态扫动），E6#72c 在铃铛宽面板落地 3px 进度条——本条「留未来」已不成立。
- **评分 / 评论**——零服务器做不了真实评级，v1 不做（08 §四）。
- ~~toast 主动作按钮机制~~ **已定案（E6#13.5 缝隙 K1，第 1.2 轮审）**——`notifications.show(msg, { actions: [{ id, label, isPrimary?, command?, args? }] })` 已全量设计（8 维度 + 契约四齐全）；[重试]/[查看依赖] 走 actions 参数，**不再二次 toast**。本条为定案前旧话术，已废。

## 六、审视实锤（2026-08-30 第 3.3 轮——#31/#32/#33 拍板依据）

> 2026-08-30 第 3.3 轮整轮审视（E6#31 下载安装 + #32 搜索分类 + #33 更新版本）落笔的修正实锤。清单只留修正结论 + 本锚点。

### 6.1 #31 vs #13 重叠——重定位 #31 = 壳侧下载服务层 + 接线（判据③④）

- **原 #31a「fetch → ArrayBuffer → 进度条」与 #13a `plugins:download` 逐字重复；#31b「解压到 user/ + 写记录 → loadPlugin」与 #13a extract+install + #11a 重复**——实现时双份工。
- **定案：#31 = 壳侧下载服务层**——#31a `.part` 临时文件生命周期（01 §四·五 B1 落地：写 `tmp/*.part` → rename 正式包 + 启动清理），**#13a 下载 handler 引用本服务**；#31b = 安装接线端到端验收（消费 #13e/#13d/#11a，不重写）；#31c 纯委托 #11b。
- 层序：**#31 下载服务 → #13 IPC handler → #30.9 市场 UI 消费**，一个机制一处写。

### 6.2 更新原子切换唯一权威 = 05 §二·六（#11c/#13c/#33e 对齐）

- **原 #11c「卸载旧版 + 安装新版」非原子（新版失败旧版即失）；#13c「替换旧目录」语义含糊**——与 #33e/05 §二·六 原子切换定案冲突。
- **定案：原子切换为唯一权威**（下载 temp → 校验 → 原子 rename 替换 → 失败旧版保留）；#11c/#13c 措辞已对齐（E5.6 时代话术残留清除）。

### 6.3 #32b 分类定界——不触碰筛选/导航暂缓面

- **原 #32b「按 category 字段」一行无界**——分类显示/翻译 = E6 范围；分类导航/筛选侧栏 = 2026-08-29 E6 范围决策已暂缓的「筛选/导航/浏览面」（出厂制造 05 档案全屏商店分类栏属暂缓面）。
- **定案：#32b = 分类字段显示 + 翻译 key 落地（§四·4 `category.*` i18n 键），不做分类导航/筛选。**

### 6.4 文档漂移清扫（本档 §三·五 F3 + §五 toast；05 §六 铃铛）

- F3 语言切换 = 第 3.1 轮已实锤「E5.8 无语言事件 → 零订阅」，本档原话术残留已同步。
- §五 toast 主动作按钮 = E6#13.5（K1）定案前旧话术，已改指 #13.5 actions 参数。
- 05 §六 状态栏铃铛归属 = 10 档定案后关闭待定：铃铛业务信号归市场插件贡献，落 #33a。

---

> **← 上层：** `03-市场交互设计.md`（总览）
> **→ 相邻：** `09-安装细节.md`（安装 toast）· `08-信任与安全.md`（确认弹窗）· `12-插件目录与UI细节.md`（目录树 + UI 交互 + 变量化）
