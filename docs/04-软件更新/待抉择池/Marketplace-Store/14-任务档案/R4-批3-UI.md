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

| 格 | 动作 | 落点 |
|:--|:--|:--|
| R4-3.4 | 主区商店骨架：rail 三段式（首页品牌块/分类·排行榜/库·作者·来源固定底）＋ tabbar 交互（每插件一标签 pinned:true＋label） | 新 `src/views/store/`（feature-folder：`StoreView.tsx`/`Rail.tsx`）——**声明新壳视图**进市场 plugin.json `views.main`（照 plugin-detail 模式，tabBehavior 见 08 v3.51） |
| R4-3.5 | 首页：hero 轮播/作者卡区（authorCard 仓卡扇出）/装机必备/主题专区/编辑精选/付费板块/榜单 top8/分类网格/**目录三态**（06 §六）——九板块**按类合文件**（⛔ 一板块一文件铺满 home/；超 6 文件预算即同棒分两个会话续做＋交接留痕） | `src/views/store/home/` |
| R4-3.6 | 分类页＋搜索页＋完整榜单：统一池/chips（≥3）/筛选下拉/排序/视图切换（用 ViewSeg/SortChips）· 搜索焦点保持/清空回原视图 | `src/views/store/browse/` |
| R4-3.7 | 内容热更新 UI 壳：`content-bar` 常驻条＋分层提示接点（Toast 段留桩，棒 15 接 #11） | `src/views/store/HomeBar.tsx` |

**判据**：07 §二 表逐行对账；机械守则（状态变化不换节点/不推挤邻居——蓝图头注原文）；§8.1 #2/#3（宽度收敛/横向 rail）必须在窄窗实测。**🔴 易漏三细目（08 §三显式归格，⛔ 压缩丢失）**：① **发现型已读体系**（08 §三·95）——分类项/作者项右上 6px accent 点（该分类有新插件/该店有新内容）、**进入即已读**、离线不产生新点；「全部已读」钮在**棒 8 库头部**（仅清发现型，⛔ 碰任务型数字）；② **会话级滚动位记忆**（08 §三·106⑤/117）——切分类/来源/作者**再回来回原位**（⛔ 弹回顶部）；会话级 state（**不进** 06 §八 pluginState——那是持久偏好，滚动位是一次性浏览条件）；③ hover 放大幅度分级（1.1/1.12/1.08/1.03/1.02）与横排容器余量（22/30/18＋大卡行 56/-32）**照 HTML 数值抄**。

## 棒 7（R4-3.8–3.11，作者域）

| 格 | 动作 | 落点 |
|:--|:--|:--|
| R4-3.8 | 作者卡（`authorCard`：头像/名/徽标/简介/仓卡扇出 hover——蓝图 v3.30 三边界：单仓/4仓+N/空仓） | `src/views/store/authors/AuthorCard.tsx` |
| R4-3.9 | 作者店：声明驱动渲染器（hero/collection/rank scope:self/grid 按声明序；inlineHero 槽位规则）＋门店卡（官方第一/当前仓 ring） | `AuthorStoreView.tsx`＋`sections/` |
| R4-3.10 | 作者列表页（排序/视图）＋跳转字（more→分类页预过滤/榜单） | `AuthorsView.tsx` |
| R4-3.11 | 声明提示（重复大屏/未知板块/缺失合集 → 来源页计数）＋ vendors 官方✓判定接入（读 R4-2.1 注入的 `vendorId`） **← I20 落点** | `authorWarnings.ts`＋Badge 接线 |

**判据**：U4 十项验收（13-接力方案引 08 v3.57 三 bug 修复行为）逐条真机复验；**作者项发现型已读点**（08 §三·95：作者项右上 6px 点、进店即清——与棒 6 分类项同体系）。

## 棒 8（R4-3.12–3.15，库＋来源）

| 格 | 动作 | 落点 |
|:--|:--|:--|
| R4-3.12 | 库视图：统计头/搜索/四筛选/排序分组/视图记忆（pluginState）/可更新置顶 | `src/views/store/library/` |
| R4-3.13 | 编辑模式：复选框默认隐藏/批量条/全选作用于筛选结果/退出清空 | 同上 |
| R4-3.14 | 来源管理页：分组/折叠/上移（限同作者）/刷新/停用（源级）/移除（确认+可带卸载）· 本地安装分组（溯源语义，无源级停用） | `src/views/store/sources/` |
| R4-3.15 | I17 加源弹窗（网络/本地两页）＋本地安装流程调壳 `installFromDirectory`＋`localInstalls` 记录（06 §九） | `AddSourceModal.tsx` |

**判据**：B2 拍板边界（拒 core/同 id exists 确认/原路径只溯源）；U 类已闭环行为照 08 复验；**库头部「全部已读」钮**（08 §三·95——仅清发现型小点，⛔ 碰任务型更新数字；调棒 4 `markAllRead` 命令）。

## 棒 9（R4-3.16–3.19，详情页）

| 格 | 动作 | 落点 |
|:--|:--|:--|
| R4-3.16 | 详情标签：`tabs.create("plugin-detail",{pluginId,pinned:true,label})` 全调用点统一（⛔ 未装必传 label——08 v3.51） | 各视图打开处＋`DetailView.tsx` |
| R4-3.17 | 三页签：概览（截图画廊+README MarkdownView 复用）/功能（contributes 四组照现状）/日志（5 版裁口） | 现有 `DetailView/` 全部 use* hooks（2026-11-20 实测 10 个）上扩展（⛔ 重写） |
| R4-3.18 | 右栏四类字段（抓取型必有/声明型有才显/本机事实/兼容性唯一占位）＋「没有」不画行 vs「不够」标黄 | `useInfoGroups.tsx` 分组逻辑按 05 §二改 |
| R4-3.19 | I13 文字溢出：DetailHeader 副标题 clamp2/按钮 nowrap＋全站自查（08 v3.56 表） | `DetailHeader.tsx`/`detail-header.css` |

**判据**：05 §00「勿动清单」逐条确认未破坏；05 §01–03 规则实现；**§8.1 #11 动作委托在本棒落地**（动作按钮所在每一个容器都接同一条入口，验收逐按钮点）。

## 棒 10（R4-3.20–3.22，付费流）

| 格 | 动作 | 落点 |
|:--|:--|:--|
| R4-3.20 | 付费状态机六态＋statusTag 接 pricing（CornerTag 复用）＋licBadge 全卡片接入 | `src/ui/statusTag` 扩＋`DetailView` 动作条 |
| R4-3.21 | 许可弹窗（粘贴即时调壳 `licenses.verify`）＋buyPage（`shell.openExternal`——⛔ licenseUrl 未声明不渲染外跳钮） | `LicenseModal.tsx`＋`BuyPage.tsx` |
| R4-3.22 | I12 画廊视频渲染（screenshots 视频项：poster/controls/preload=metadata 剥 autoplay——照主仓 MarkdownView video override 语义）＋库「已购未安装」分区 | `DetailOverviewTab` 画廊＋库 |

**判据**：05 §05 四态矩阵/§03 规则/08 v3.64 全套（十步流程真机走一遍）；⛔ 市场内判付费。

## 附：二次扫漏对照表（2026-11-20 用户要求「文档/HTML/小地方提到的任务点必须都在任务清单」）

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
