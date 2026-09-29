# GitHub Releases——插件市场后端

> 🔵 **非新能力（2026-09-05 塌平收编）**：本次改动仅插件目录塌平单根（`plugins/builtin|user` → `plugins/<id>`）现状路径文本同步，零新增 `window.linkdesk.*` / `contributes.*` 面。塌平决策见 [../01-插件独立构建/09-插件目录塌平决策.md](../01-插件独立构建/09-插件目录塌平决策.md)。

> 对应任务：E6#15-#16。用 GitHub Releases 作为免费文件存储 + marketplace.json 作为插件目录。

---

## 一、为什么选 GitHub Releases

| 方案 | 存储费用 | 带宽费用 | 复杂度 |
|:--|:--|:--|:--|
| GitHub Releases | 免费 | 免费 | 低——手动上传或 API |
| 自建服务器 | 月付 | 月付 | 高——运维 |
| AWS S3 + CloudFront | 按量付费 | 按量付费 | 中 |
| Vercel + 静态文件 | 免费（有限额） | 免费 | 低——但文件大小有限制 |

GH Releases：不限流量、不限文件大小（单个 asset ≤ 2GB）、免费、全球 CDN。

---

## 二、仓库结构

```
github.com/encaron/linkdesk-marketplace/
  ├── marketplace.json       ← 插件目录（所有插件的索引）
  ├── README.md              ← 发布指南
  └── Releases/              ← GitHub Releases（插件文件存储）
      ├── hello-world v1.0.0
      │   └── hello-world.linkdesk-plugin
      └── hello-world v1.1.0
          └── hello-world.linkdesk-plugin
```

---

## 三、marketplace.json 格式

```json
{
  "version": "1",
  "updatedAt": "2026-08-07T12:00:00Z",
  "plugins": [
    {
      "id": "hello-world",
      "name": "Hello World",
      "version": "1.0.0",
      "description": "A test plugin that demonstrates LinkDesk plugin capabilities",
      "author": {
        "name": "Encaron",
        "url": "https://github.com/encaron"
      },
      "icon": "Smile",
      "iconSource": "lucide",
      "category": "demo",
      "downloadUrl": "https://github.com/encaron/linkdesk-marketplace/releases/download/hello-world-v1.0.0/hello-world.linkdesk-plugin",
      "size": 245760,
      "publishedAt": "2026-08-07T12:00:00Z",
      "minAppVersion": "1.0.0"
    }
  ]
}
```

### 字段说明

| 字段 | 必需 | 说明 |
|:--|:--|:--|
| `id` | ✅ | 唯一标识（小写+连字符） |
| `name` | ✅ | 显示名称 |
| `version` | ✅ | semver |
| `description` | ✅ | 一句话描述 |
| `author.name` | ✅ | 作者名 |
| `downloadUrl` | ✅ | 下载直链 |
| `size` | ✅ | 文件大小（bytes）——显示下载大小；**下载后校验实际字节，显著不符 → 警告 toast（09 §二，不拒装仅提示）** |
| `checksum` | - | 作者 sha256——下载后校验完整性（09 §二）；旧条目无此字段 → 跳过校验（纯增量兼容） |
| `icon` | - | 图标名（Lucide 或 codicon） |
| `iconSource` | - | "lucide" / "codicon" / "url" |
| `category` | - | 分类——英文 slug（E6#32b；规范分类集/翻译映射见 11 §4.4） |
| `publishedAt` | - | 发布日期 |
| `minAppVersion` | - | 最低 LinkDesk 壳版本 |

### 3.1 扩展性——加字段不破坏旧插件

`marketplace.json` 的字段设计是**纯增量**的。将来加 `screenshots`、`readmeUrl`、`changelog` 等新字段：

- 新插件 → 可以填新字段
- 旧插件 → JSON 里没有新字段 → marketplace 渲染时跳过 → 只是少显示一块内容，不报错
- 作者升级 `@linkdesk/plugin-sdk` → 获得新字段的类型提示和验证

**对标 VS Code：** `package.json` 的 `contributes` 从 1.0 到现在加了几十个新贡献点。旧扩展不升级不崩。LinkDesk 同理。

### 3.2 新增字段（2026-08-29 第一站体验——纯增量，旧插件不填不崩）

| 新字段 | 必需 | 说明 |
|:--|:--|:--|
| `versions[]` | - | 版本历史 `{version, downloadUrl, publishedAt, changelog?}`，**最新在前**；顶层 `version`/`downloadUrl` 仍 = 最新（兼容旧条目）——版本下拉数据源 |
| `readmeUrl` | - | 作者仓库 raw README——未装插件详情页数据源 |
| `screenshots[]` | - | 截图 URL 数组——详情页画廊 |
| `license` | - | 许可证标识——详情页侧栏 |
| `categories[]` | - | 多分类（替代单 `category`） |
| `icon` url 形态 | - | 作者自制彩色图标（SVG/PNG 直接 `<img>`；`iconSource: "url"` 既有兜底） |
| `marketIcon` / `marketIconSource` | - | **E6#106**：插件身份彩色图（Type-2）——图标栏插件的 `icon` 是 Type-1 剪影，**市场展示位必须读这一张**。**值一律绝对 URL + source `"url"`**（`publish` 自动把包内相对路径转成 raw 直链，作者零声明）。缺省 → 回退 `icon` → 再缺 → 统一默认彩色块。🔴 目录条目是**未装用户**的唯一图源，**存包内相对路径 = 未装态恒 404**（`linkdesk://` 只在本地已装的插件根里找文件）——机械兜底见插件仓 CI 第 ⑤ 段 |
| `repository` | - | **插件自己的**主页 URL（E6#77）——详情页资源组「仓库 / 问题」的跳转目标。**完整 http(s) URL**；缺省则由条目自身推（`downloadUrl`/`readmeUrl` 里的 github `owner/repo`），推不出则**整行不渲染**（不指错路）。⚠️ 与「来源」不是一回事——「来源」= 列出这条的**市场源**（合并注入的 `sourceName`），官方汇总目录里全体插件共用同一个货架 |

交互设计 → [03-市场交互设计.md](03-市场交互设计.md)。配套：`.linkdesk-plugin` 包内带 `README.md`（E6#4a 打包补）。

---

## 四、读取方式

marketplace 插件启动时：

```typescript
const MARKETPLACE_URL =
  "https://raw.githubusercontent.com/encaron/linkdesk-marketplace/main/marketplace.json";

const response = await fetch(MARKETPLACE_URL);
const data = await response.json();
```

缓存策略：
- 首次加载 → 缓存到本地 Storage
- 后续 → 先读缓存（5 分钟内），后台拉取更新
- 拉取失败 → 用缓存
- **parse 失败（catalog 手改坏/非法 JSON）→ 用缓存；无缓存 → 空态「目录损坏」+ [重试]**（缝隙 G12）
- **全源不可达 + 无缓存（首次离线）→ 探索组空态「无法加载市场，请联网重试」+ [重试]**（缝隙 G8）

---

## 四·五、下载临时文件（缝隙 B1——下载中关软件）

- 下载文件落 `{userData}/tmp/*.part`（半截标记）→ 完成后 rename 为正式包。
- 下载中用户退出软件 → 启动时清理 `tmp/*.part` 残留（孤儿临时文件不留）。

---

## 五、发布流程（2026-08-30 第 3.1 轮审视——自动链路当下做全）

> 🔴 **deferral 残留清除（第 3.1 轮顺带）**：原「v1.0 手动版 + 未来自动化版」是"当前够用、未来再补"话术——第 2.2 轮已拍板自动链路当下做全（沉 [03-插件发布流水线.md §四](../02-插件开发工具链/03-插件发布流水线.md)）。发布 = GitHub REST API 自动链路：作者在**终端**给 GitHub PAT → 创建 Release + 上传 asset + 更新自己仓库 marketplace.json → 全自动。（🔴 **2026-09-14 订正：入口只有命令行**——原文写「市场 UI 填 PAT」，那条图形备路已按用户拍板退役；见 [03 §三](../02-插件开发工具链/03-插件发布流水线.md)。）

---

## 六、多市场源（2026-08-17 用户拍板）

> **单中心目录 → 多源。** 让第三方作者发布到**自己的**仓库，无需进入中心目录；用户/AI 添加任意 GitHub 仓库为市场源即可发现安装。改动只在 marketplace 插件内部，壳零改动。

### 6.1 为什么

单中心目录（`encaron/linkdesk-marketplace`）有个瓶颈：第三方作者 agentA 发布插件需要中心写权限/PR——「别人怎么知道」这一环卡在审批上。AI 一站式场景（agentA 制作上传 → 另一台电脑 agentB 主动下载使用）要求：**发布即可见，无需中间人**。

多源化 = 对标 VS Code 多 marketplace / npm 多 registry——索引开放，人人可发布，人人可发现。

### 6.2 模型

```
默认源        encaron/linkdesk-marketplace     （官方目录）
作者源 A      agentA/linkdesk-marketplace      （任意 GitHub 仓库，根目录有 marketplace.json）
作者源 B      agentB/plugins                    （同上）

用户/AI 在设置里「添加市场源」填仓库 URL
  → marketplace 插件 fetch 全部源 → 合并去重（同 id 取版本高者）→ 商店统一展示
```

> 🔵 **「添加市场源」UI 反向注明（2026-09-08）**：本界面设计只存在于 mockup——[mockups/03-添加市场源-mockup.html](mockups/03-添加市场源-mockup.html)（三形态抉择板）+ E6-执行清单 #30c 行定案文字，**无独立设计 .md（有意为之，界面小、mockup 即唯一设计源）**。本档只定概念与数据流，实现以该 mockup + #30c 行为准。

### 6.3 源列表数据结构（marketplace.json 格式零改动——纯增量）

源列表独立存（settings.json 或 marketplace 插件专用配置）：

```json
{
  "marketplaceSources": [
    { "id": "official", "default": true,
      "url": "https://raw.githubusercontent.com/encaron/linkdesk-marketplace/main/marketplace.json" },
    { "id": "agent-a",
      "url": "https://raw.githubusercontent.com/agentA/linkdesk-marketplace/main/marketplace.json" }
  ]
}
```

每个源都是同一个 marketplace.json schema——现有格式、现有字段，加新字段不破坏。

### 6.4 行为

| 场景 | 行为 |
|:--|:--|
| 启动 | fetch 全部源 → 合并 → 展示 |
| 同 id 冲突 | 取版本高者（semver） |
| 单源失败 | 跳过不阻塞其他源，用该源缓存兜底 |
| 来源标注 | 商店卡片/列表显示来源仓库名——用户知道装的是谁的 |
| 发布 | 作者 `npm run publish` → 自己仓库 Releases + 自己的 marketplace.json → 完成（无需中心审批） |

### 6.5 人 vs AI

- **人**：商店 UI 照旧（多源合并成卡片网格），多一个「添加市场源」入口
- **AI**：agentA 上传到自己的仓库 = 自己说了算；agentB 拿到源 URL 即可添加 + 安装（URL 直装）

### 6.6 任务归属

- **读取侧** → E6#30c：marketplace 插件多源支持（源列表配置化 + 合并去重 + 来源标注）
- **发布侧** → E6#26b：作者发布到自己的仓库（Releases + 自己的 marketplace.json）
- 壳零改动——全部在 marketplace 插件内部

### 6.7 官方目录收录（2026-08-30 混合模型定案——「默认可见」的路）

**张力**：「发布即可见，无需中间人」（作者自由）与「默认发现」（用户装了就看见）天然冲突——第三方作者想让**所有**用户默认看到，必须进官方目录（官方源内置，用户零操作），但「怎么进官方目录」此前无机制。**定案 = 混合：官方收录 + 多源并存。**

- **收录路径**：作者把条目提交到官方仓库（`encaron/linkdesk-marketplace`）——进官方 `marketplace.json` → 所有用户默认可见（与出厂制造插件同源）。**早期形态 = 作者给官方仓库发 PR 加自己的条目**（轻量审核）；未来可自动化（`npm run publish --official` 或收录审批流）。
- **多源并存（不冲突）**：不收录 = 只在自己仓库发布，用户/AI 手动加源可见（§6.1 AI 一站式零中间人）。作者可**先自仓库发（立即可用）→ 想扩大影响再收录官方**。
- **对标 VS Code**：官方市场发布 = 进官方目录（默认可见）；侧载 = 不经市场（自宣传）。**LinkDesk 比 VS Code 更开放**——多源让「侧载」是一等公民（不依赖官方审批即可分发）。
- **行为**：市场插件拉官方源 = 出厂制造 + 已收录第三方（用户零操作）；拉作者源 = 手动加源可见。两路无感合一，来源标注区分（§6.4）。
- **产品结论**：第三方作者想让「所有用户」看到 = 申请收录官方目录；想让「指定用户/AI」看到 = 只发自己仓库 + 自宣传源 URL。

### 6.8 目录数据所有权判定（2026-08-30 沉档）——公开文件，任何插件可读

> 用户问「搜索 URL 独立成新插件（自有视图/漂亮 UI/全自动找插件）+ 与市场联动是否可行」→ 查证 harness（dsh）生态实证（`dshmarket` = 纯市场 UI 插件 / `dsh-find-plugin` = 独立发现插件，两者都直接啃 GitHub topic + 公开 API，宿主零目录数据）后沉档。**修正一个易误读点。**

**判定：目录数据（marketplace.json 多源合并）不是任何插件的私有状态——是公开文件。** marketplace 插件只是 fetch 它的消费者之一，不是主人。任何插件（市场 / 发现 / 搜索 / 全自动找插件）都能自行 fetch 同一批 URL 合并读取，无需任何共享通道。

- **§6.6「全部在 marketplace 插件内部」= 实现位置（壳零改动），不是数据所有权**。别把「谁写的代码」当「数据是谁的」——fetch 的是公开 URL，不归 marketplace 独占。
- **市场插件可瘦身为纯 UI 型**：UI 只管展示，逻辑 = 对公开文件的 fetch，几行代码。拆「发现逻辑」成独立插件 = 天然成立。
- **发现/搜索插件 = 独立插件，与市场零耦合**：都读公开文件，不共享状态、不经中间人。harness 实证（dshmarket + dsh-find-plugin + GitHub topic 目录约定——harness 无中心目录文件，目录是 `dsh-plugin` tag 约定，比我们的显式 marketplace.json 更松）。
- **新市场插件不必「逻辑 + UI」一起做**：逻辑复用走共享包（`@linkdesk/contracts` 目录服务 / E6#54 共享组件独立分发），**非壳 API**。各自实现也成立——重复读公开数据不是架构债，是插件独立铁律。
- **联动**：两插件读同一批 URL → 数据天然一致，无需共享通道。「信任货架列表」（`marketplaceSources`）可共享（壳配置）也可各自维护，都通。
- **E6#30c 含义**：源列表 fetch+合并 = marketplace 插件内部实现位置不变（壳零改动），但**不阻碍**任何其他插件自行实现同款读取——目录是公开的，谁用谁取。

---

## 七、审视实锤（2026-08-30 第 3.1 轮——#29 marketplace.json + #30 壳侧改造拍板依据）

> 2026-08-30 第 3.1 轮整轮审视（E6#29、#30）落笔的修正实锤。清单只留修正结论 + 本锚点。

### 7.1 marketplace 插件现状（E5.8 实测）

- `plugins/marketplace/` 已存在（2026-09-05 塌平单根前在 `plugins/builtin/marketplace/`），E5.8 schema（`factoryRole: "marketplace"`，core:true），5 视图 search/installed/builtin/disabled/uninstalled，全读 `pluginManager.list()`（IPC 子集 `PluginListEntry`，types.ts:107）。**无 fetch、无多源、无探索视图**。
- 卸载缓存函数名 = `getUninstalledPluginInfo`（lifecycle-ops.ts:68），非「getUninstalled」。

### 7.2 #30b 交叉比对 = list() 集合（非 installed-plugins.json）

E5.8 **无 installed-plugins.json 文件**——已安装状态由 `pluginManager.list()` 的 `PluginListEntry` 集合决定。catalog pluginId ∈ list() → 已安装；catalog version > list().manifest.version → 更新；不在 → 安装。

### 7.3 #30d 改名归属理顺（#30d 承担，#32a M8 只对齐顺序）

「待安装」组改名「探索插件」在 #30d 与 #32a M8（执行清单 833 行）**双写 = 双份工**。理顺：改名随 #30d（视图改造原子性——数据源切 catalog 的同一动作，标题立即一致）；#32a M8 只做「顺序对齐 已安装/探索插件/已禁用/内置」。

### 7.4 #30c 多源配置归 marketplace 插件命名空间

源列表 `marketplace.marketplaceSources` 归 **marketplace 插件命名空间配置**（plugin.json `contributes.configuration` 声明，含默认官方源），非壳 `app.*`——壳零改动（§6.6「全部在 marketplace 插件内部」），第三方市场插件各自声明源管理。

### 7.5 F3 语言切换 = react-i18next 自动（纸面任务清除）

- **全 src 实测 E5.8 无语言变更事件**（CoreEvents.ts 只有 `SHOW_LANGUAGE_PICKER`；无 `onDidChangeLanguage`）。原 11 档 §三·五 F3「市场插件订阅壳语言变更事件」是 E5.6 时代假设（自己标「实现时核对壳事件通道名」）。
- **正确方案 = 零订阅**：市场插件用 react-i18next `t()`，壳切语言调 `i18next.changeLanguage` → 所有 `useTranslation` 组件自动重渲染。清单已删「订阅事件」子项，改验证点「切语言 → 市场 UI 即时刷新」。

### 7.6 §五 deferral 残留清除（顺带）

原 §五「v1.0 手动版 + 未来自动化版」是"当前够用、未来再补"话术——第 2.2 轮已拍板自动链路当下做全（沉 03-插件发布流水线.md §四），本档 §五 未同步 = 文档漂移。已更新 §五 指向自动链路。

---

> **← 上一层：** `../02-插件开发工具链/`
> **→ 下一文档：** `02-壳内下载安装.md`
