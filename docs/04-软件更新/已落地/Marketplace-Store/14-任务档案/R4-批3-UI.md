# R4 · 批3 UI（原语件/浏览面/作者域/库来源/详情/付费）—— 任务档案

> 棒 5–10（R4-3.1–3.22，22 格）｜门槛：棒 5 等批2a；棒 6–10 依次（⛔ 撞期：全在市场插件仓 UI 层，同时只派一棒）
> **正典 = mockups/03（v3.66）+ 05 + 04 边界稿 + 07 对账表 + 10 §8.1 十一条 + 08 批注现行态。实现＝照 HTML 逐 data-spec 抄，⛔ 自创。**
> 蓝图 JS（03 的 `<script>`）就是**参考实现**——纯函数（statusTag/moreMenu/emptyView/sortChips/viewSeg/authorCard/hueBG/licBadge）逐个搬进 feature-folder。

## 棒 5（R4-3.1–3.3，UI 原语件 I10）

| 格 | 动作 | 落点 |
|:--|:--|:--|
| R4-3.1 | 建 feature-folder `src/ui/`（⛔ 平铺禁）：`ViewSeg.tsx`（平铺⇄详细 seg，顺序固定 grid 前 list 后）· `SortChips.tsx` · `EmptyState.tsx`（icon/title/sub/action/cls/attrs——蓝图 `emptyView` 同构） | 新夹；样式进 `src/styles/ui/` |
| R4-3.2 | `Badge.tsx`（`badge(kind,text)`：official/third/local/core/price/soon/expired/owned/installed/update——蓝图 `.badge.*` 十类色值照搬）＋ `statusTag.ts`（九级优先级，蓝图 v3.65 同款）＋ `AvatarHue.ts`（`hueBG`） | 同上 |
| R4-3.3 | `CornerTag.tsx`（单角标：`statusTag` 驱动，两系样式实底/纯字——v3.65b）＋ `moreMenu.tsx`（随装态动态项）＋ 既有 `actionsBtn` 收编 | 同上 |

**判据**：grep 全仓 `line-clamp|平铺|seg-btn` 只在 src/ui 一处；03 蓝图对应函数逐一对得上（07 表新加对照行）。**🔴 类名撞车整改**（08 §二·26 教训）：EmptyState 根类用语义名 `.empty-state`（⛔ 裸 `.empty`——HTML 曾撞全局空态撑爆瓷片）；修饰类一律带语境前缀（`cat-empty` 形态）。

## 棒 6（R4-3.4–3.7，浏览面）

> 🔴 **接棒 3b 交办（2026-11-20）**：**R4-2.9 真机读数在本棒收口**——18 件 rail 归位／小类 chip 有货即显（≥1）／「其他」桶为空。数据面已就绪：`CatalogLoadResult.railOrder`（声明序消费）＋ `groupByPrimaryCategory(entries, railOrder)`（空桶不产出、other 末位）＋ 条目 `category/categories`（官方目录 18/18 已带）——⛔ 在 UI 里重算分类；读数写进交接。

| 格 | 动作 | 落点 |
|:--|:--|:--|
| R4-3.4 | 主区商店骨架：rail 三段式（首页品牌块/分类·排行榜/库·作者·来源固定底）＋ tabbar 交互（每插件一标签 pinned:true＋label） | 新 `src/views/store/`（feature-folder：`StoreView.tsx`/`Rail.tsx`）——**声明新壳视图**进市场 plugin.json `views.main`（照 plugin-detail 模式，tabBehavior 见 08 v3.51） |
| R4-3.5 | 首页：hero 轮播/作者卡区（authorCard 仓卡扇出）/装机必备/主题专区/编辑精选/付费板块/榜单 top8/分类网格/**目录三态**（06 §六）——分类项**发现型已读点**（06 §八·补数据面＋进入即已读）——九板块**按类合文件**（⛔ 一板块一文件铺满 home/；超 6 文件预算即同棒分两个会话续做＋交接留痕） | `src/views/store/home/` |
| R4-3.6 | 分类页＋搜索页＋完整榜单：统一池/chips（**封闭名单有货即显**＋「未标注小类」兜底——04 §5.1，**category.*/tag.* i18n 值表 zh/en 同笔**）/筛选下拉/排序/视图切换（用 ViewSeg/SortChips）· 搜索焦点保持/清空回原视图 | `src/views/store/browse/` |
| R4-3.7 | 内容热更新 UI 壳：`content-bar` 常驻条＋分层提示接点（Toast 段留桩，棒 15 接 #11） | `src/views/store/HomeBar.tsx` |

**判据**：07 §二 表逐行对账；机械守则（状态变化不换节点/不推挤邻居——蓝图头注原文）；§8.1 #2/#3（宽度收敛/横向 rail）必须在窄窗实测。

> 🟢 **棒 6 收口注记（2026-11-20）**：R4-3.4–3.7 已落 `src/views/store/`（`StoreView` 唯一属主 + `Rail` + `home/` + `browse/` + `cards/` + `Strip`）；实现侧 `data-spec` 用 ASCII 锚点（`04-6`/`04-6-authors`/`04-7`/`04-7-category`/`04-7-search`，与 07 的 HTML `04§` 锚点靠命名对应）。**数据边界**：hero/装机必备/编辑精选只认官方 `collections`（当前目录未声明 ⇒ 不渲染，槽位已留）；主题专区/榜单/分类瓷片为计算位照常；作者区无源＝空态引导卡、有源＝留槽等棒 7；库/作者列表/来源/作者店＝诚实占位（棒 7/8）；加源弹窗归棒 8；付费板块归棒 10；内容条完整机制/contentHash/发现型点归棒 15。**真实读数**：官方 18 件全归位、warnings 0；「其他」桶 = 1 条 `my-cool-plugin`（第三方未声明 category——机制 4 诚实落位，待用户拍板补否）。

**🔴 易漏三细目（08 §三显式归格，⛔ 压缩丢失）**：① **发现型已读体系**（08 §三·95）——分类项/作者项右上 6px accent 点（该分类有新插件/该店有新内容）、**进入即已读**、离线不产生新点；「全部已读」钮在**棒 8 库头部**（仅清发现型，⛔ 碰任务型数字）；② **会话级滚动位记忆**（08 §三·106⑤/117）——切分类/来源/作者**再回来回原位**（⛔ 弹回顶部）；会话级 state（**不进** 06 §八 pluginState——那是持久偏好，滚动位是一次性浏览条件）；③ hover 放大幅度分级（1.1/1.12/1.08/1.03/1.02）与横排容器余量（22/30/18＋大卡行 56/-32）**照 HTML 数值抄**。

> 🟢 **棒 6 已留位（2026-11-20）**：首页 `AuthorSection` 现只在「无作者源」时画空态引导卡、有源时隐藏——棒 7 用 `services/authors.ts`（`authors/<id>.json` 白名单解析＋authorId 聚合）替换该分支即可；`useStore()` 已提供 `data.catalog`（entries/collections/railOrder/warnings/deduped）＋`data.ctxOf(entry)`（状态/权益/job/下载数/身份图）＋`actions`/`navigate`，⛔ 另建导航或第二份状态。库/来源/作者店页为诚实占位（棒 8 同批接）。

## 棒 7（R4-3.8–3.11，作者域）

| 格 | 动作 | 落点 |
|:--|:--|:--|
| R4-3.8 | 作者卡（`authorCard`：头像/名/徽标/简介/仓卡扇出 hover——蓝图 v3.30 三边界：单仓/4仓+N/空仓） | `src/views/store/authors/AuthorCard.tsx` |
| R4-3.9 | 作者店：声明驱动渲染器（hero/collection/rank scope:self/grid 按声明序；inlineHero 槽位规则）＋门店卡（官方第一/当前仓 ring） | `AuthorStoreView.tsx`＋`sections/` |
| R4-3.10 | 作者列表页（排序/视图）＋跳转字（more→分类页预过滤/榜单） | `AuthorsView.tsx` |
| R4-3.11 | 声明提示（重复大屏/未知板块/缺失合集 → 来源页计数）＋ vendors 官方✓判定接入（读 R4-2.1 注入的 `vendorId`） **← I20 落点** | `authorWarnings.ts`＋Badge 接线 |

**判据**：U4 十项验收（13-接力方案引 08 v3.57 三 bug 修复行为）逐条真机复验；**作者项发现型已读点**（08 §三·95：作者项右上 6px 点、进店即清——与棒 6 分类项同体系）。

> 🟢 **棒 7 收口注记（2026-11-20）**：R4-3.8–3.11 已落——`services/authors.ts`（白名单解析＋authorId 聚合＋懒加载缓存＋warnings）· `authors/AuthorCard`（三边界仓卡扇出）· `authors/AuthorStoreView`（hero 置顶/inlineHero/sections/scope:self/glow:false/门店卡/按分类浏览硬保留）· `authors/AuthorsView` · `authors/authorWarnings.ts`（来源页计数文案）· 分类页 authorId 预过滤＋「显示全部」· `StoreHeader` 作者店名。**数据边界**：作者块无索引 ⇒ 按 authorId 懒加载（候选源＝官方＋authorId 命中的启用 remote 源；owner≠authorId 时以条目声明 authorId 为准）；v1 源不产生作者域（照 09「插件进池、作者域缺席」）；发现型点仍等 contentHash（棒 15），本棒只接「进店即已读」写入与渲染路径。**读数**：插件仓 vitest 616/616（+29）· verify 九段 · build 9 表面；插件 **643bd01**（未 bump、未推送）。

## 棒 8（R4-3.12–3.15，库＋来源）

| 格 | 动作 | 落点 |
|:--|:--|:--|
| R4-3.12 | 库视图：统计头/搜索/四筛选/排序分组/视图记忆（pluginState）/可更新置顶 | `src/views/store/library/` |
| R4-3.13 | 编辑模式：复选框默认隐藏/批量条/全选作用于筛选结果/退出清空 | 同上 |
| R4-3.14 | 来源管理页：分组/折叠/上移（限同作者）/刷新/停用（源级）/移除（确认+可带卸载）· 本地安装分组（溯源语义，无源级停用） | `src/views/store/sources/` |
| R4-3.15 | I17 加源弹窗（网络/本地两页）＋本地安装流程调壳 `installFromDirectory`＋`localInstalls` 记录（06 §九） | `AddSourceModal.tsx` |

**判据**：B2 拍板边界（拒 core/同 id exists 确认/原路径只溯源）；U 类已闭环行为照 08 复验；**库头部「全部已读」钮**（08 §三·95——仅清发现型小点，⛔ 碰任务型更新数字；调棒 4 `markAllRead` 命令）。

> 🟢 **棒 8 收口注记（2026-11-20）**：R4-3.12–3.15 已落——`library/`（buildLibraryRows 单一组装＋筛选/排序分组/统计；编辑模式批量；已购未安装预留区）· `sources/`（作者分组折叠/同作者调序/单源刷新/源级停用/移除确认/本地组）· `AddSourceModal`（OverlayPortal 两页签；网络先拉后入＋K5 模板链接；本地 plugin.json 预览→`installFromDirectory`＋`localInstalls`）· `services/sourceAdmin.ts`（配置原始数组写路径单点）· `services/libraryActions.ts`（批量动作单点）· `marketplaceSources` 结果新增逐源 `sourceStatus`。**读数**：K5 真机（真实网络）——`linkdesk-plugin-editor@v1.0.10` 无 marketplace.json ⇒ plugin.json 合成 1 条（version 1.0.10）；`octocat/Hello-World` 两者皆无 ⇒ `missing-manifest`（UI 给模板链接）。插件 **643bd01**（未 bump、未推送）。

## 棒 9（R4-3.16–3.19，详情页）

| 格 | 动作 | 落点 |
|:--|:--|:--|
| R4-3.16 | 详情标签：`tabs.create("plugin-detail",{pluginId,pinned:true,label})` 全调用点统一（⛔ 未装必传 label——08 v3.51） | 各视图打开处＋`DetailView.tsx` |
| R4-3.17 | 三页签：概览（截图画廊+README MarkdownView 复用）/功能（contributes 四组照现状）/日志（5 版裁口） | 现有 `DetailView/` 全部 use* hooks（2026-11-20 实测 10 个）上扩展（⛔ 重写） |
| R4-3.18 | 右栏四类字段（抓取型必有/声明型有才显/本机事实/兼容性唯一占位）＋「没有」不画行 vs「不够」标黄 | `useInfoGroups.tsx` 分组逻辑按 05 §二改 |
| R4-3.19 | I13 文字溢出：DetailHeader 副标题 clamp2/按钮 nowrap＋全站自查（08 v3.56 表） | `DetailHeader.tsx`/`detail-header.css` |

**判据**：05 §00「勿动清单」逐条确认未破坏；05 §01–03 规则实现；**§8.1 #11 动作委托在本棒落地**（动作按钮所在每一个容器都接同一条入口，验收逐按钮点）。

> 🟢 **棒 9 收口注记（2026-11-20）**：R4-3.16–3.19 已落——`services/openDetailTab`（`tabs.create("plugin-detail",{pinned:true,label})` 唯一入口；商店卡/详情依赖跳转/命令面共用）· 三页签改名「概览/功能/更改日志」＋日志未装分支按 **5 版**裁口与「更新记录（最近 5 版）」口径行＋已装版本号转绿（`.marketplace-mpd-chg-cur-ver`）· 右栏四类字段：本机事实（标识符/版本/大小/**安装位置**/数据位置）、抓取型（作者/来源/首次发布/更新时间/下载；缺 ⇒ 不画行＋来源页声明提示）、声明型（类别/许可证/仓库/问题；有才显）、兼容性唯一占位「—」；依赖/被依赖空行退役（⛔ Dash 撑行）· parse 新增 `missing-entry-field` 警告（publishedAt/author/repo）→ 来源页「N 条声明提示」展示（`views/store/sources/catalogWarnings.ts`）· 「不够」= minApp 不足：值标黄（`--warning-text`）＋安装/重试钮置灰并写原因 · I13：标题/副标题 clamp2、说明 clamp3、动作钮 nowrap+max-width+ellipsis+flex:none · 详情徽标收编 `ui/Badge`＋`sourceBadge` 同源（含本地徽标）。**读数**：插件仓 vitest **57 文件/636 例**（+3 文件/+20 例）· verify 九段 · build 9 表面（138.7 KB）。插件 **75e8de1**（未 bump、未推送）。

## 棒 10（R4-3.20–3.22，付费流）

| 格 | 动作 | 落点 |
|:--|:--|:--|
| R4-3.20 | 付费状态机六态＋statusTag 接 pricing（CornerTag 复用）＋licBadge 全卡片接入 | `src/ui/statusTag` 扩＋`DetailView` 动作条 |
| R4-3.21 | 许可弹窗（粘贴即时调壳 `licenses.verify`）＋buyPage（`shell.openExternal`——⛔ licenseUrl 未声明不渲染外跳钮） | `LicenseModal.tsx`＋`BuyPage.tsx` |
| R4-3.22 | I12 画廊视频渲染（screenshots 视频项：poster/controls/preload=metadata 剥 autoplay——照主仓 MarkdownView video override 语义）＋库「已购未安装」分区 | `DetailOverviewTab` 画廊＋库 |

**判据**：05 §05 四态矩阵/§03 规则/08 v3.64 全套（十步流程真机走一遍）；⛔ 市场内判付费。

> 🟢 **棒 10 收口注记（2026-11-20）**：R4-3.20–3.22 已落——`DetailActionBar` 付费六态分支（订阅→「即将支持」禁钮写原因；过期→输入新密钥＋续费；未购→获取许可（licenseUrl 未声明不渲染）＋我有密钥；有权益→落回安装语义）＋试用/付费形态说明行（`.marketplace-mpd-paid-note`，05 §05 d-trial）＋许可徽标上详情标题行（`licenseBadges` 同源）· 新 `services/licenseActions.ts`（verify 转递＋失败文案封闭映射＋keyShapeOk 预检＋openBuyPage=hostApi.openExternal 别名）· 新 `views/store/LicenseModal.tsx`（OverlayPortal 进浮层；粘贴即时验签：v1.<payload>.<sig> 形状齐即发、WRONG 红/VALID 绿、valid→onVerified→自动收起；作者块无公钥如实告知）· `authors.ts` AuthorDomain 透出 `publicKey`（先到者字段优先）· `useStoreActions` 增 `onRequestLicense`（卡片 have-key→弹窗；StoreView 持态）· `useStoreData.refreshLicenses`（验签入库后卡/库/详情同源收敛；库「已购未安装」分区由棒 8 骨架自动变实）· 画廊视频（`useDetailPackage` 透传 CatalogScreenshot；`DetailOverviewTab` video 分支：controls 强制/preload=metadata/无 autoplay/poster 优先；`.marketplace-mpd-gallery-video` CSS）。**读数**：插件仓 vitest **59 文件/652 例**（+2 文件 licenseActions 5＋licenseModalSmoke 5；detailViewSmoke +6 付费/视频例；authors +1 publicKey 例）· verify 九段全过（字典 627 keys，黄灯清零）· build 9 表面（142.9 KB）。另单独一笔 fix 两处存量类型错（useCompatReading 路径/installFlow catalogUrl 收窄）。插件 **d031316**（未 bump、未推送）。

## 附：二次扫漏对照表（2026-11-20 用户要求「文档/HTML/小地方提到的任务点必须都在任务清单」）——本表同为**辅助**：显式归格防丢，通读 HTML 仍是主步骤（同附二规矩）

| 易漏项 | 出处 | 归格 |
|---|---|---|
| 发现型已读体系（6px 点/进入即已读） | 08 §三·95 | 棒 6 R4-3.5＋棒 7 R4-3.11 前作者项 |
| 「全部已读」钮（仅清发现型） | 08 §三·95 | 棒 8 R4-3.12 库头部（调 R4-2.5 markAllRead） |
| 会话级滚动位记忆（回原位） | 08 §三·106⑤/117 | 棒 6 R4-3.5/3.6＋棒 8（state 不进 pluginState） |
| hover 幅度分级/横排余量数值 | 08 §一·2/5 | 棒 5/6/7（照 HTML 数值抄——总纲已覆盖，点名防丢） |
| `.empty-state` 类名整改 | 08 §二·26 | 棒 5 R4-3.1 EmptyState |
| 横排统一 strip（mountStrips/no-overflow） | 08 §三·119 | 棒 6 R4-3.5（照 HTML） |
| 动作三级矩阵（卸载 ⛔ 卡片主位） | 08 §三·107 | 棒 8/9＋07 §三逐行 |
| 大屏槽位判定/声明提示/scope | 08 §三·126b | 棒 7 R4-3.9/3.11 |
| 加源三落点/两页签/并入语义/停用移除语义 | 08 §三·110-114 | 棒 8 R4-3.14/3.15 |
| 库四筛选域＋排序 7 种（作者/仓库分组头） | 08 §三·96 | 棒 8 R4-3.12 |
| 详情右栏四类字段/视频两条路/5 版日志 | 08 §三·140-144 | 棒 9 R4-3.17/3.18＋R4-0.2 schema |
| 07 §四验收清单（emoji/对比度/五态/焦点环/data-spec） | 07 §四 | 棒 16 真机复验 |
| 小类 chip 封闭名单＋**有货即显（≥1）**＋「未标注小类」兜底 | 08 §三·98（2026-11-20 二次拍板）＋04 §5.1 | 棒 6 R4-3.6（chip 渲染）＋R4-2.1 parse 在册校验＋K2/K3 kit 错误码 |
| 作者知晓面三通道（文档全表/validate 可用清单/schema description） | 2026-11-20 小分类封闭拍板配套 | 棒 12 R4-4.6（文档全表）＋棒 11 R4-4.2（validate 清单）＋棒 3 R4-2.8（schema description） |
| 作者页缺省平铺/视图记忆 6 键 | 08 §三·137-139 | 棒 7 R4-3.9＋R4-2.4（06 §八） |
| 整卡入口/hover 不闪 refreshEntry/检查更新全局入口/位置记忆/卸载双击确认/已禁用态 | 08 §三·106 | 棒 6/8/9（照 HTML；位置记忆见上） |

## 附二：蓝图资产搬运清单（2026-11-20 防遗忘造册——四份 HTML 的 JS 函数与机制全点名）

> 🔴 **主次关系（2026-11-20 用户定案）：HTML 为主，本册为辅——⛔ 拿本册当摘要跳过 HTML**。
> 本册是 **grep 提取的显式资产名**（函数/机制名），**它必有遗漏**——HTML 里的样式数值、交互时序、布局权衡、以及用户随每一条批注改进去的**思想**（为什么这么排、为什么不那样），grep 提不出来、册子写不下，**只活在 HTML 里**。四份 HTML（03 主区 228KB／04 边界／05 详情／02 侧栏）是用户跟着 AI 一步一步改出来的效果真源。
> **执行顺序（硬性三步）**：① **先全文通读对应 HTML**（含 JS 与 CSS 全部——棒 6/8 读 03＋04，棒 9 读 05＋03，棒 5 读 03 的归一化段）——这是硬步骤不是可选；② 拿本册**反向勾对**——查「通读有没有漏」（册子是读后自查工具）；③ 收口「读数」里**写明通读了哪几份的哪些段**（通读留痕，交接可查）。缺一项 = 返工。

### 03-主区专注蓝图-v3.html（76 函数＋40 常量，棒 6–10 主战场）

| 组 | 函数/常量（蓝图原名） | 归格 |
|---|---|---|
| 卡原型五件＋作者 | `cardMega/cardDuo/cardGrid/cardRow/tile(小卡)/authorCard/authorDeck` | 棒 6 R4-3.5 ＋ 棒 7 R4-3.8/3.9 |
| 归一化原语 | `viewSeg/applyView/sortChips/applySort/emptyView/hueBG/head/groupH/secH` | 棒 5 R4-3.1–3.3 |
| 状态机 | `statusTag/moreMenu/badges/priceTag/licBadge/LIC/saveLic/badge(kind,text)` | 棒 5 R4-3.2/3.3 ＋ 棒 10 |
| 交互三件 | `applyFilters/applySort/applyView`（即时重排/滚动位保持） | 棒 6 R4-3.6 |
| 位置记忆 | `beginView/endView/savePref/PREFS` | 棒 6 R4-3.5/3.6 ＋ 棒 8（会话级，⛔ 弹回顶部） |
| 横排 strip | `mountStrips`（统一挂载＋no-overflow——内容不超一屏箭头不显示，34 处 strip） | 棒 6 R4-3.5（所有横排板块统一） |
| 环境辉光 | `--glow` 封面主色喂色（**24 处**：hero 静态微光/hover 增强/mega·duo/作者色辉光；glow:false 回落中性） | 棒 6 R4-3.5 ＋ 棒 7（作者色辉光＋glow:false） |
| hover 不闪 | `refreshEntry(id)` 只替换 `.js-act/.js-badges`（**9 处**——卡片节点保留 ⇒ :hover 不丢） | 棒 6 R4-3.5（⛔ 整页重绘） |
| 检查更新 | 头部「检查更新＋红点计数」全局入口 | 棒 6 R4-3.4 |
| 位置序 | `renderHome/renderCategory/renderSearch/renderRankFull/renderLibrary/renderSources/renderAuthors/renderRail/renderDetail`（七视图＋rail） | 棒 6/7/8/9 对应格 |
| 加源 | `srcChanged/srcCheck/srcSubmit/askRemoveSource/srcNameOf`（校验→拉取→预览→并入提示/移除二次确认） | 棒 8 R4-3.15/3.14 |
| 声明提示 | `authorWarnings`（重复大屏/未知板块/引用缺失→来源页计数） | 棒 7 R4-3.11 |
| 动作委托 | `simulateInstall`（**10 §8.1 #11——动作按钮所在的每一个容器**） | 棒 6/8/9 各动作面 |
| 焦点圈 | `trapFocus`（弹窗内 Tab 圈＋来源焦点归还） | 棒 8 弹窗 ＋ 棒 9 |
| 安装演示 | `simulateInstall/localPlugins/it/one/owner/slug/sync/step/gc/k/h` | 各状态机面（照 HTML） |

### 04-边界蓝图.html（状态与边界演示，棒 15/16 对账源）

`toast/closeToast/renderStates/renderOffline/renderSync/renderUpd/updateOne/stateCard/syncBtn/startSync/showMem/prog` —— 内容热更新三态/离线/同步/更新流程/内存边界 → 棒 15 R4-5.6 实现的**行为样板**＋棒 16 验收对照。

### 05-详情页设计.html（详情专项，棒 9 对账源）

`badgeHTML/drawBadge/drawSide` ＋ §00 勿动清单/§01 徽标派生/§02 有才显/§03 三页签/§04 画廊视频/§05 动作四态/§06 商店接线 —— 棒 9 R4-3.16–3.19 逐节照抄；⚠️ §07 待定项 D1–D4 **已全部闭环**（进 12 I12/I11＋棒 16 验收），不是未决事项。

### 全局 CSS 形态（三份 HTML 共通，⛔ 照抄数值）

机械守则（状态变化仅 transform/opacity/颜色）· hover 放大分级（1.1/1.12/1.08/1.03/1.02）· 横排容器余量（22/30/18＋大卡 56/-32）· 窄窗五档（1080/900/700/480）· `prefers-reduced-motion` 全局降级 · 焦点环 `:focus-visible` 2px accent · 滚动条/选区主题化 · ⛔ emoji 图标（全手绘 SVG）· 对比度 ≥4.5:1 → 棒 6–10 各自 CSS ＋ 棒 16 验收。
