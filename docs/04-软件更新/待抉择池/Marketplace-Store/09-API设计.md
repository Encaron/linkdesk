# 09-API设计——目录格式 v2 与作者域 API

> **为什么存在**：作者域拍板（04 §六·作者域基建）要求「每块 UI 界面必须有对应的指令（声明字段）」——本文把**指令清单、数据形状、解析渲染落点、能力责任边界**一次定稿，R4 照此落码。
> **上游**：[00-README](00-README.md)（工程规范准入判据）、[06-数据设计](06-数据设计.md) §二·3b（文件夹级 v2 规划）、[04-分类体系](04-分类体系.md) §六（作者域基建）；**下游**：SDK schema、目录仓示范、市场插件实现。
> **准入判据对照**：见 §六（00「工程规范」六条逐条回应）。

## 一、目录格式 v2（文件夹级，向后兼容）

```
<marketplace-source-root>/        # 任何作者的市场源（用户添加的 URL 指向这里）
├── marketplace.json              # 插件条目主文件——现有格式**永不破坏**（plugins[] 照旧）
└── authors/
    └── <authorId>.json           # 作者块：一个 authorId 一个文件（多仓作者每仓放同一份或同 id 文件）
```

- **兼容纪律**：只含 marketplace.json 的 v1 源继续可读（无 authors/ ⇒ 无作者域，插件照常进统一池）；新市场读旧源，作者板块不渲染不报错。
- **蓝图对照**：mockups/03 的 `AUTHOR` 演示对象即本结构的内存形态。

## 一·补2、厂商注册表 vendors[]（2026-11-19 拍板：「官方 ✓」人人可认证）

> 现状裂缝：`entry.official` ＝「来自官方默认源」，是**分发事实**不是**发布者身份**——STM32/NI/Adobe 自家插件会被错标「第三方」。用户拍板：「官方」＝**该实体自己的官方发布**（搜索引擎「官方」角标语义），我们只是其中一个实体。

```jsonc
// 官方目录 marketplace.json 根级（只有官方运营者可写——能自封的身份就不是身份）
"vendors": [
  { "vendorId": "st",
    "name": "STMicroelectronics",
    "domains": ["st.com"],            // 域名自证：官网 /.well-known/linkdesk-vendor.txt 内写 vendorId
    "githubOrgs": ["STMicroelectronics"], // GitHub 组织归属（人工核对谁能发）
    "verifiedBy": "manual",           // "domain" | "github-org" | "manual"
    "verifiedAt": "2026-11-19" }
]
```

**判定链（全图唯一）**：条目 `authorId` → 注册表命中 → 「官方 ✓」；未命中 → 「社区」；本地 → 「本地」。⛔ 不看作者名叫不叫官方（可重名）、⛔ 不开放作者自声明徽标文本。

**三档认证（拍板：自动自证＋人工并行）**：
- `domain`：官网放置验证文件（内容＝vendorId）——小厂商自动通过；
- `github-org`：GitHub 组织归属人工核对；
- `manual`：大厂人工核验（最高信任）。
**冒名处理**：未注册却声称某 vendorId → 不给角标；名称与已认证厂商相似 → 显示「名称相似，未验证」提示（诚实不伪装）。

**认证流程（柜台＝官方目录仓的 PR，无服务器）**：
1. **厂商提 PR**：加自己一行 `vendors[]` ＋ 一行 `sources[]`（与 B4 同一张 PR 模板），附证明；
2. **CI 校验**（GitHub Actions，PR 自动跑）：`domain` → 拉取 `https://域名/.well-known/linkdesk-vendor.txt` 且内容＝vendorId；`github-org`/`manual` → 标注待人工，运营者核对后合并；同时校验 schema 合法、vendorId/authorId 不撞；
3. **运营者合并** → 目录更新；
4. **显示零新链路**：vendors[] 搭目录拉取链的便车（contentHash 热更新已有）→ parse 建索引 → 渲染时 `authorId` 命中 → 官方 ✓。作者侧对接＝在自己 `authors/<id>.json` 声明 `authorId`；
5. **周期复验**：Actions 每周重跑 domain 校验，失败自动开 issue 提醒运营者，由人决定撤否（⛔ 不自动降级，防抖动）；撤销＝删 `vendors[]` 行 → 徽标变社区、插件照常可用（认证只是背书）。
将来 B3 服务器化可长出表单式控制台与自动签发，**非前置**。

**端到端申请流（2026-11-19 补全：通知/AI 代审/文件落点）**：
1. **申请**＝厂商照 `.github/PULL_REQUEST_TEMPLATE/vendor-application.md` 填表提 PR（公司名/vendorId/域名/org/联系人/插件清单/认证方式），打 `vendor-application` 标签；
2. **通知**＝GitHub 原生（owner 邮件＋站内）＋ **AI 主动查**（`gh pr list --label vendor-application`——写进 K11 规程，用户说「查认证申请」即出待审清单）；
3. **AI 审查报告**（用户指定四要素）：他们是谁（域名文件自证结果/org 归属）→ 想干什么（vendorId 与方式）→ 做什么类型（插件清单＋类别＋权限面摘要）→ 安不安全（声明面：无 core 自封、无危险 API、包结构合法；深度审计 v1 只抽查，列为后续增强）；
4. **人批**＝用户说「通过」→ AI 执行 `gh pr merge`（规程写明：合并动作必须在用户明示后，⛔ AI 不得自行合并）；
5. **生效**＝`vendors.json` +1 行 → 徽标下次目录刷新自动变官方 ✓。
**实施后目录仓结构**：`marketplace.json`（条目）＋ `vendors.json`（注册表）＋ `authors/`＋`collections/`＋`.github/`（模板＋workflow）＋`AGENTS.md`（规程）——现状只有一个 marketplace.json 是 v2 未实施（00 #3）。
**厂商整店（拍板：可以＋推荐位）**：认证厂商 = 作者域的特例——同一套作者店骨架（hero/板块声明/合集），其源收录进 `sources[]` 后官方首页给**厂商推荐位**；版位排法与普通作者店同规（⛔ 为厂商写专属排版分支）。

## 一·补、官方目录的 sources[]（已审核源清单）

```jsonc
// marketplace.json 根级
"sources": [{ "url": "https://github.com/someone/repo", "authorId": "someone", "addedAt": "2026-11-19" }]
```

- 商店合并：官方源 → 本清单 → 用户添加源；同 id 取 semver 最高（沿用现逻辑）。
- 收录只背书，不复制条目；撤销＝删行，已装插件保留。
- PR 只允许新增/删除**自己**那行；CI 校验 URL 可达＋目录合法＋id 不撞。

## 二、作者块 schema（`authors/<authorId>.json`）

```jsonc
{
  "authorId": "Encaron",                 // 🔑 聚合键＋🔴 身份正典（2026-11-19 拍板）——推荐＝作者 GitHub 用户名：
                                         //   头像/名字/简介从该用户 GitHub 主页取，全源一张脸，作者在 GitHub 改即全源同步；
                                         //   ⛔ 主仓制已否决——人不随源顺序变脸；⛔ 无中心注册
  "repos": [                             // 🔑 多仓归属——每仓一段（同 authorId 跨仓聚合）；每仓可带 image（仓级图）与
                                         //   intro（总仓介绍——「在不同地方写不同的东西」的容身处，仅显示于店内仓卡）
    { "id": "hw", "name": "硬件仓", "intro": "串口与灯光系插件", "image": "https://…/hw-banner.png",
      "sourceUrl": "https://…/marketplace.json" }
  ],
  "storeTitle": "极客工坊 Store",        // 🔴 作者店名可改（2026-11-19 确认）；缺省「〈作者名〉的 Plugin Store」
  "homepage": {                          // 🔴 作者主页板块声明——「UI 界面必须有对应的指令」
    "sections": [                        // 顺序即渲染顺序；作者自选放什么/放几个/叫什么名
      { "type": "hero",       "slides": [                          // 🔴 大屏轮播多张——作者自选哪几张上（上限 3~5，同官方）
        { "plugin": "osc-panel", "tag": "作者精选" },
        { "plugin": "rgb-fx",    "tag": "上新" }] },
      { "type": "collection", "collection": "hw-must",
        "more": { "label": "全部硬件", "target": "category:hardware" } },       // 🔴跳转字（2026-11-19 拍板）：可选——声明才渲染标题右侧蓝字（文案作者自定）；
                                                                                  //   不声明＝不渲染（⛔ 渲染器不自动造「更多」；官方「装机必备」无字＝同规拍板④）
      { "type": "collection", "collection": "hw-recommend" },                    // 「作者推荐」这类板块名＝作者自己声明，合法（2026-11-19 用户确认）；无 more＝无跳转字（两态演示）
      { "type": "grid",       "title": "全部插件" },                             // 全量网格（标题作者自定）
      { "type": "rank",       "top": 6, "scope": "self" },                       // 榜单（计算位，作者可不放）——scope 缺省＝全源合并；
                                                                                   //   "self"＝只算店主自己的插件（2026-11-19 拍板；一般作者少用但可声明）
      // ⛔ "categories" 不在可声明清单——「按分类浏览」渲染器硬保留，作者删不掉
    ]
  },
  // 🟡 非 GitHub 作者兜底（2026-11-19 拍板②）：authorId 非 GitHub 用户名（或 GitHub 取失败且无缓存）→
  //    本块可声明 name/avatar/intro 兜底；多源同 id 仍冲突 → 用户源列表顺序回落；GitHub 用户不受此条影响
}
```

- **合集声明**：沿用 06 §二·3 `CollectionDecl`（作者仓的 marketplace.json 或作者块内声明均可——实施期二选一定稿，倾向**随仓 marketplace.json**，门店跟着仓走）。
- **板块→原型映射**：`hero→hero`／`collection+layout→small/mega/duo 横排`／`rank→rank rows`／`grid→全量网格`——照 05 §四 原型族，⛔ 不新增第四种卡片体系。
- **店面骨架＝固定槽位，不是 API（2026-11-19 拍板）**：每个店面恒定三段——**槽 1 首视觉**（大屏）／**槽 2 门店卡横排**（官方＋各仓，硬保留，作者的声明管不到）／**槽 3+ 声明板块**（按 `sections` 原顺序）。**hero 可声明多次**，但**只有第 1 个占槽 1 置顶**；第 2 个起**按声明顺序就地渲染**（不置顶、不丢弃）；未声明 hero ⇒ 槽 1 空着、门店卡成为第一视觉，不报错不留白。**判定标准是「位置」不是「身份」**——不是大屏有特权，而是槽位只认第一个 hero。
- **声明提示（warnings，2026-11-19 拍板）**：解析/渲染期的**非致命**问题不静默吞掉——产出 `warnings[]`（重复大屏、未知板块类型、引用不存在的合集），在**来源管理页**作者行显示「N 条声明提示」（悬停看明细，作者自查用）。致命问题（坏 JSON、缺 authorId）照旧整块跳过。
- **板块标题＝作者自定（2026-11-19 用户确认）**：「作者推荐」「全部插件」这类名字只要出自作者的声明就完全合法——API 只提供骨架，名字与内容都归作者；渲染器只认声明、⛔ 自创任何板块名。唯一例外＝「按分类浏览」（固定不可声明）。
- **跳转字（「更多」）＝板块级可选声明（2026-11-19 拍板）**：`sections[].more{label,target}`——声明了才渲染板块标题右侧**强调色**跳转字（主题可变强调色——非固定蓝，2026-11-19 用户措辞订正）；**label 文案完全归作者**（「更多」「选择更多主题」随他写）；**不声明＝不渲染**，渲染器 ⛔ 自动造「更多」。**target＝封闭集合（2026-11-19 拍板原话「这个是固定的啊这个是没得商量的」）**：官方店＝`category:<slug>`（全源分类页）／`rank`（完整榜单）；作者店＝`category:<slug>`（**全局分类页＋authorId 预过滤＋常驻「显示全部」切换**——2026-11-19 问答拍板：落页形态＝预过滤、作用域＝authorId 聚合（两项均采纳推荐）；过滤一次性——rail 重入即全量；排序/视图切换不打掉过滤；过滤标识常驻（作者名·计数·✕），清除/显示全部就地生效滚动位保持；空结果＝诚实空态＋逃生门常驻）／`repo:<id>`（切仓）／`rank`（全源榜单页——榜单无店主作用域，普适规则的天然边界，2026-11-19）。⛔ 任意 URL、⛔ 自创新页。官方「装机必备」无字＝同规（拍板④：合集横滚全量可见故无更多）。
- **板块副题（hint）＝可选声明（2026-11-19 问询→拍板）**：标题后的说明小字（官方如「大家都在装……」）＝板块级 `hint` 声明——作者店走合集声明 `hint`（渲染已接，「作者声明·横排」即演示）；官方板块＝目录维护者声明；**不声明＝不渲染副题**。
- **板块辉光开关＝可选声明（2026-11-19 问询→拍板）**：`sections[].glow:false` → 该板块**整块**不散环境辉光（回落中性阴影）；缺省＝开（辉光色实时跟随封面主色，05 §二）。⛔ 不提供自定辉光色——「散光跟随封面自身颜色」是设计语言本体（08 一·6）；⛔ 不做卡级混排（板块级统一，照卡片样式先例）。演示＝作者店「作者推荐」声明 glow:false（官方同原型 duo 有辉光可对照）。
- **榜单＝计算位 API＋作用域参数（2026-11-19 三连问→拍板）**：rank 板块与跳转字全为声明项——**不声明就没有**（字与榜同规）；`scope` 参数：缺省＝**全源合并**，`"self"`＝只算店主自己的插件（作者店演示「效率下载榜」）；**官方全源**＝官方首页榜单 8 行＋完整榜单页（无参数，用户确认「都是显示全部的」）。**派生定则：策展位（广告卡/合集/编辑精选）只吃官方目录、计算位（榜单/热门下载）吃全源**——首页 top 8＝完整榜单 top 8 同源截断（修订首页构成拍板中「榜单」的归属）。
- **身份缓存随目录缓存走（2026-11-19 用户建议·采纳）**：身份三件套（头像/名/简介）随目录缓存一并存储——离线 stale 态（目录离线缓存兜底是既有机制）作者卡仍显示缓存头像；**从未取到过 → 灰色人形占位**（B15 降级链末档＝离线指示）。零新增机制：身份缓存与目录缓存同寿同取。
- **店名可改＋轮播多张（2026-11-19 确认）**：`storeTitle` 作者可改（缺省「〈作者名〉的 Plugin Store」）；hero 声明 `slides[]` 多张（作者自选哪几张上大屏，上限 3~5 同官方）。
- **卡片样式＝板块级设定（⛔ 卡级混排）**：每个小标题（合集槽）经 `layout` 自选一种卡片原型（small/mega/duo），整块统一——同一板块内不混卡片样式；想混＝拆两个板块各自 layout。理由：视觉秩序（整区同款照 MS Store 分区）＋归一化实现；「按分类浏览」例外项不受影响。

## 三、市场插件侧 API（渲染面落点）
| 模块（均纯函数/声明驱动，vitest 直测） | 职责 | 消费者 |
|---|---|---|
| `services/authors.ts` | 解析 authors/*.json（白名单归一，照 06 §三 纪律）；**authorId 聚合**（同 id 跨源合并 repos）；`getAuthorDomain(id)`／`listAuthorDomains()` | 首页作者卡片区、作者主页 |
| `views/home/AuthorCardStrip`（首页第一槽，hero 之后） | 作者卡片渲染（头像/名/简介/**仓卡扇出 deck＝repos[] 名字与各仓件数**/仓数/插件数）→ 点卡进作者主页；**边界三态由数据自然退化**：1 仓＝满宽单卡「唯一仓库」、4+ 仓＝前 2＋「+N 个仓」、0 件仓＝「0 件」且在店内给诚实空态 | Store 首页 |
| `views/author/AuthorStoreView` | **声明驱动渲染器**：遍历 `homepage.sections` → 按映射表出槽；**「按分类浏览」硬保留在末尾**；头部区＝**门店卡横排（作者卡同款组件，官方卡恒排第一位＝返回官方；当前仓 ring 高亮）**；身份三件套来自 GitHub 正典（随目录缓存） | 作者主页 |
| 归一化约束 | 三者**只消费统一池**（04 §六·单一统一池）＋复用 05 §四 原型组件——⛔ 不造第二套卡片/横排机器 | — |
| `views/sources/SourcesView`＋`AddSourceDialog` | 主区加源三落点（头部＋/作者区空态/rail 固定底栏）；弹窗**两页签**（网络地址／本地文件夹）——网络**先拉后入**，本地直接读文件夹；**业务判定零新增**——网络复用 `decideAddSource`（empty/bad-url/official/duplicate）与 `normalizeSourceUrl`，本地判路径/重复；来源行操作 ↑↓/刷新/停用/移除，作者组可折叠、可直达作者主页 | Store 全部视图 |
| `views/author/AuthorsView` | 作者列表页（rail「作者」）：全部启用作者＋名称/插件数/仓库数排序 → 进作者主页；解决「只能绕首页作者栏进店」 | Store 导航 |
| 源记录（数据层） | 🔴 **真机唯一真相源＝配置键 `marketplace.marketplaceSources`**（设置插件与主区同键——`sourceConfig` 读、`marketSourceAddCommand` 写、`catalogStore` 订阅变更自动重拉，两侧任一改动即时同步）。形状升级为 `{kind:"remote"|"local", url?, path?, authorId, repoId, enabled, status, fetchedAt}[]`：**条目以仓库为单位、展示按 authorId 聚合**（同作者多仓并一行；再加同作者仓＝并入 +1）；**本地条目无 authorId 身份**（`authorId:"__local"`），进统一池但不产生作者卡；**数组顺序＝作者卡顺序＋非 GitHub 身份兜底**；`enabled=false`＝**源级停用**；移除＝删源与缓存（已装插件保留，二次确认可勾选卸载）。**兼容纪律**：旧 `string[]` 与 `{url}` 两形态照读，升级只加字段不改键 | 设置插件、首页、来源页 |

## 三·补、命令面（GUI 动作 ↔ 可编程入口，2026-11-19 拍板「一切 GUI 动作必须有 AI 友好操作」）

> 规则：**每个 GUI 动作都要有对应命令**，且**同一动作只有一个命令 id**；能复用壳能力的（安装/卸载）⛔ 不在插件里再造一份。

| GUI 动作 | 命令 id | 参数 | 回执 |
|---|---|---|---|
| 打开 Plugin Store | `marketplace.openStore` | — | `{ ok, tabId }` |
| 打开某分类 | `marketplace.openCategory` | `category: string` | 同上 |
| 打开我的库 | `marketplace.openLibrary` | — | 同上 |
| 打开作者主页 | `marketplace.openAuthor` | `authorId: string, repoId?: string` | 同上 |
| 打开插件详情 | `marketplace.openPlugin` | `pluginId: string, pinned?: boolean` | 同上 |
| 打开来源管理 | `marketplace.openSources` | — | 同上 |
| 搜索 | `marketplace.search` | `query: string` | 同上 |
| 添加市场源 | `marketplace.addSource`（已有） | `url: string` | 现三态回执 |
| 添加本地插件 | `marketplace.addLocalPlugin` | `path: string` | `{ ok, reason? }` |
| 移除市场源 | `marketplace.removeSource` | `url` 或 `index` | `{ ok, reason? }` |
| 检查插件更新 | `marketplace.checkUpdates` | — | `{ ok, count }` |
| 刷新目录内容 | `marketplace.refreshCatalog` | — | `{ ok, changed: boolean }` |
| 角标全部已读 | `marketplace.markAllRead` | `kind: "category"\|"author"\|"all"` | `{ cleared: number }` |
| 记住视图/排序 | `marketplace.setViewPrefs` | `{ page, view?, sort? }` | `{ ok }`（幂等，写 pluginState） |
| 安装 / 更新 / 停用 / 启用 / 卸载 | **复用壳 `pluginManager` 命令** | `pluginId` | 壳回执 |

**⛔ 不允许**：只做按钮不注册命令；⛔ 为同一个动作新造第二个命令 id；⛔ 把「检查更新」和「刷新目录内容」合成一条（两个事实两个命令）。

## 三·补2、本地插件安装（2026-11-19 拍板：A 复制安装）

> 现状事实：市场只认 http(s) 源；壳只从 `{userData}/plugins` 与 `appPluginsDir` 加载，**没有「从任意文件夹运行」的 API**；选文件夹能力已有（`linkdesk.dialog.openDirectory`）。所以本地插件必须落到「复制进安装目录」这一条路上。

**壳新增 API**：`window.linkdesk.pluginManager.installFromDirectory(path)`

| 项 | 约定 |
|---|---|
| 输入 | 含 `plugin.json` 的单插件文件夹，或 `.linkdesk-plugin` 离线包（包先解压到临时目录再走同流程） |
| 校验 | `plugin.json` 合法；`pluginId` 安全字符；**拒绝 `core:true`**（本地不得自封内置）；同 id 已装 → 返回 `reason:"exists"` 由调用方确认覆盖 |
| 动作 | 复制到 `{userData}/plugins/<pluginId>` → 注册 → 发 lifecycle 事件（与网络安装同一路，⛔ 不走旁路） |
| 返回 | `{ ok:true, pluginId }` ／ `{ ok:false, reason:"bad-manifest"｜"unsafe-id"｜"core-forbidden"｜"exists"｜"io" }` |
| ⛔ 不做 | 从任意外部路径**直接运行**（外部篡改/删除会直接影响运行）；多插件 `marketplace.json` 目录（v2 再议） |

**市场侧**：
- 入口：来源页「添加本地插件」＋ 命令 `marketplace.addLocalPlugin(path)`。
- 流程：`dialog.openDirectory` → 读 `plugin.json` 预览（名／版本／大小／作者）→ 明确文案「确认后复制安装」→ 调 `installFromDirectory` → 成功后记 `pluginState("marketplace","localInstalls")`。
- 来源页「本地安装」分组读该记录（插件名＋原路径＋已安装/已停用）；「移除」＝**卸载**（删安装副本，原文件夹不动）并删记录。
- ⛔ 本地分组不出现「源级停用」——它不是一个可拉取的源，只有插件级启停。

## 三·补3、付费与授权 v1（✅ 2026-11-19 正式拍板：外链收钱＋离线签名＋作者管试用＋订阅不做）

> 底稿：04 边界稿 §02 收费 6 态（购买/试用/续费/重新验证/已购/失效）；05 §三·4 三层模型（市场只渲染，裁决在壳）。本节补「无服务器时的落地形态」。

**定价形态（目录条目 `pricing` 声明——只展示不裁决）**：

| 形态 | 声明 | v1 状态 |
|---|---|---|
| 免费 | 缺省 | ✅ 现状 |
| 买断＋许可密钥 | `{model:"paid", licenseUrl, price?, refundUrl?}` | ✅ v1 主体 |
| 订阅 | `{model:"subscription"}` | ⛔ 推迟 B3（无服务器无法续期校验） |
| 试用 | `trialDays` 仅展示 | ✅ 显示；真试用＝作者代码功能门，壳不管 |

**购买流（应用内无支付）**：详情页「获取许可」→ 外链浏览器开 `licenseUrl`（作者销售页）→ 用户付款得密钥 → 回商店「输入许可」→ **壳验签** → 解锁安装。⛔ LinkDesk 不收款、不碰税务/合规。

**许可验证（Ed25519 离线验签）**：
1. 作者公钥住 `authors/<id>.json`（`publicKey` 字段）；
2. 密钥＝作者私钥签名（载荷：pluginId、机器数、可选 exp）；
3. 用户粘贴 → 壳本地验签（无需联网）→ 写 `pluginState("linkdesk","entitlements")`；
4. **裁决全部在壳**：安装门（`minAppVersionGate` 同位置）＋运行时校验——市场被整体替换也绕不过（05 §三·4 的墙）；
5. 失效密钥显示「许可失效」＋「重新验证」，⛔ 降级成「未购」（04 §02 已定）。

**v1.1 细化（2026-11-20 四项拍板）**：
- **跳转**＝壳 `shell.openExternal`（T4 已有，主进程白名单闸门）——零新增；`pricing.licenseUrl` 直传。
- **壳新增 `licenses` 命名空间**：`verify(key)`／`list()`／`remove(pluginId)`——权益记录住**壳**（裁决层：市场被整体替换，权益与安装门仍在）；Ed25519 本地验签；载荷 `{pluginId, machine?, exp?}`。
- **机器绑定＝机制支持、作者选**：签名载荷 `machine` 字段可选；壳验签时比对 `env.machineFingerprint`；作者用 kit `sign-license --machine` 决定绑不绑。
- **密钥输入＝仅详情页弹窗**（用户拍板；粘贴即时验签 ✓/✗ 实时反馈；⛔ v1 不做集中管理列表——已购状态靠库徽标与「已购未安装」分区）。
- **状态机 6 态**（同一条状态机，与安装 8 态同构）：未购未装（获取许可+我有密钥）/已购未装（安装+已购✓）/已购已装/临期（exp<30 天黄徽标+续费）/已过期（输入新密钥+续费）/验签不过（重新输入）。**试用两分**：`pricing.trialDays`＝详情页静态说明（功能门在作者代码）；密钥 `exp`＝壳可算剩余天数徽标。
- **签发工具**：kit `sign-license`（--plugin/--machine/--exp）——作者零密码学知识。
**边界与代价**：无服务器 ⇒ 无法强制一机一码（密钥可分享，靠签名机器数＋作者销售页风控）；在线激活/浮动授权等 B3。**已购未安装**＝库预留分区接上（密钥已验、包未装 → 显示并可一键装）。退款＝作者销售渠道负责，商店只显示 `refundUrl`。

**抽成＝0 的边界与 B3 双轨预留（2026-11-20 澄清）**：钱在作者销售页收 ⇒ 交易不落我们的账 ⇒ **无服务器时抽成在账面上不存在**（不是不想抽，是没有可抽的钱）。第三方付费插件 v1 即可做（自销，钱全归作者）；B3 上线后开**双轨**：自销轨（离线签名，0 抽成，作者不迁移）＋托管轨（我们签发/校验许可＋支付托管＋抽成结算）——作者自选，`pricing` 声明加 `channel:"self"|"managed"` 区分（枚举位 v1 就留）。

## 四、能力 · 责任 · 边界

| 维度 | 定稿 |
|---|---|
| **谁写** | 作者块/板块声明＝作者（其源数据）；官方运营位（广告卡/官方合集）＝目录维护者 |
| **谁读** | 市场插件（authors.ts 聚合 → 渲染器）；壳**不参与**（预期零改动，涉及面 #8） |
| **谁校验** | parse 白名单＋对账测试（types↔白名单，06 §三）；坏作者块**整块跳过不崩**（照缺失 id 静默跳过先例） |
| **作者能做** | 自定作者主页全部可声明板块的内容/数量/顺序；多仓聚合；自己的合集/榜单位 |
| **作者不能做** | ⛔ 删「按分类浏览」；⛔ 进官方运营位；⛔ 作者店内出现第四方（两级导航锁死）；⛔ 收费——付费裁决走 05 §三·4 **壳层**（将来立项），声明里只有 `pricing` 占位 |

## 五、v2 新增字段清单（白名单/对账测试随行）

| 字段 | 住哪 | 必填 | 责任 |
|---|---|---|---|
| `authorId` | authors/*.json | ✅（聚合键） | 作者写 → 市场读 |
| `name` | 同上 | ✅ | 作者写 → 市场直显 |
| `avatar`／`introImage`／`intro` | 同上 | 可选 | 缺省回落链：作者介绍→总仓介绍→不渲染（B15 同款诚实降级） |
| `repos[]`（id/name/intro/sourceUrl） | 同上 | ✅ ≥1 | 多仓归属与店内切换 |
| `homepage.sections[]` | 同上 | 可选（缺省＝分类浏览+全量网格兜底门面） | 声明驱动渲染 |
| `sections[].more`（label/target） | 同上 | 可选 | 板块跳转字——label 作者自定；target 封闭集合；作者店 category 落全局分类页＋authorId 预过滤 |
| `collections[].hint` / `sections[].hint` | 仓 marketplace.json／作者块 | 可选 | 板块副题说明字——不声明不渲染 |
| `sections[].glow`（false） | 同上 | 可选 | 板块辉光开关——缺省开，false 整块回落中性阴影（⛔ 自定色） |
| `sections[].rank scope`（self） | 同上 | 可选 | 榜单作用域——缺省全源合并，self＝店主自有插件（计算位） |
| `pricing`（占位） | 条目级 | — | 将来收费立项（05 §三·4），今天只留白名单位 |
| `screenshots[]`（含视频项） | 条目级 | 可选 | `string`＝图；`{type:"video",url,poster?}`＝封面视频，**最多 1 段且第一项**；不自动播放、不托管（06 §二·2 媒体契约） |

## 六、准入判据对照（00「工程规范」六条）

| 判据 | 本设计如何满足 |
|---|---|
| API 四问（规范性/能力责任/边界/归一化） | §二 schema 照 SDK 既有命名；§四 责任表；边界四条；渲染复用原型组件 |
| 插件自由化 | 板块声明全开放＋固定项仅「按分类浏览」一项 |
| 无死代码／高内聚低耦合 | 渲染器单职责、依赖单向（authors→渲染器）；v3.11 旧作者块同笔替换 |
| 文件目录规范（⛔ 禁止平铺） | authors/ 分文件＋views/author/ feature-folder；文件上限照仓内判据，超限即拆 |
| 文档规范 | 本文带头注「为什么存在/上下游」；结论带依据 |
| 档非历史 | 本档只写现行形态；迭代记录不入 |

## 七、实施顺序（对齐 00 软件涉及面清单 #2/#3/#4/#6/#7）

1. SDK：schema 扩展（authors/ 块＋作者主页声明）＋类型导出；2. 目录仓示范（官方 authors/geek… 官方块先行）；3. 市场插件：authors.ts（解析/聚合/对账测试）→ AuthorCardStrip → AuthorStoreView → 返回官方卡/仓库切换；4. 作者文档（03-插件制造中英＋AI 面）；5. 各仓 verify/test 全绿。
