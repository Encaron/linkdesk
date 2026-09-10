# 13-详情页 HTML 对账任务档案

> **立案**：2026-09-09。用户逐条对照权威 mockup（[01-插件详情页-竞标.html](mockups/01-插件详情页-竞标.html) 竞标 A 定稿 + [02-插件详情页-全状态详解.html](mockups/02-插件详情页-全状态详解.html) 十帧验收基准）与实作详情页（`plugins/marketplace/src/views/DetailView.tsx` + `MarketplaceDetail.css` + 侧栏/探索/安装服务），指出的差项。
> **性质**：审计对账任务档案 = 每条的「差什么 / 需要什么 / 补什么 / 怎么补 / 补哪里 / 改什么 / 改哪里」都写清。**执行清单只该有指针行——本档案是细节载体，别把细节塞回清单**（仓库纪律：清单 = 指向档案的指针集，审计/任务细节沉档案文档）。
> **权威判据**：04 设计档 [04-详情页设计.md](04-详情页设计.md) §三 L128 验收契约——「mockups/02 全状态详解（10 帧）是详情页实机逐帧验收基准，实现阶段每帧对照复现」。01 竞标 A 定骨（信息架构 + 交互结构），02 定肉（逐状态细节）。
> **拍板先例**：04 §〇「竞标只定骨架（信息架构 + 交互结构），皮肤一律走主题系统」——**玻璃气泡等皮肤可不要，但分隔线/骨架结构必须做清**（用户 2026-09-09 让步重申）。参考 [mockup 02](mockups/02-插件详情页-全状态详解.html) 帧注（帧 3/7 全 toast、零頂部橫幅；帧 8 信任彈窗）。

---

## 〇、一句话总览（大白话）

详情页三件事和当初反复讨论定稿的 HTML 图对不上：

1. **报错方式不统一、还用旧式弹窗**。你在图上看到的是「出事后右下角浮一条小通知」，可代码里有些地方还在用「弹一个必须点掉的大框」（`dialog.alert`），另一些把红字错误**塞进页面中间硬挤出一行**——这两样都会让界面「跳一下 / 多出一行」。
2. **页面版式没按竞标 A 排**。图上是「图标在左上，名字/作者/介绍在中间，**安装/卸载按钮在图标右方那一列**，下面右侧一栏带『信息』标题的竖排字段表」；代码做成了「图标很大在左，按钮**单独排在图标下面一整行**，右侧字段表没有『信息』标题、每一项还是标签压值竖着叠」。
3. **有几样你以为「没做」的东西其实做了，只是要看插件装没装才出现**（安装确认弹窗、自动更新勾选、软件大小）。你看到的那次它没显示，是因为当时看的插件不在那个状态——不是漏做。

下面每条讲清：图上是啥 → 现在是啥（哪一行代码）→ 该改成啥 → 怎么改。

---

## 一、事件反馈对账（A1-A4——A1-A3 归一，A4 缺依赖门禁待拍板；权威 = 帧 3/7/8）

> **🔥 事件反馈设计定案（2026-09-09 用户亲口归档——toast = 操作回执，不是广播喇叭）：**
> 1. **被动更新/新版本：不弹 toast。** 要自动更新的勾 autoUpdate，下次启动静默装新版；要手动的自己进市场看「可更新」。软件平时零主动提示。（启动后提示「某插件有新版本」= 用户觉得没必要，默认不做。）
> 2. **主动操作 → 立即 toast**：点「安装」（或手动点更新/重试）→ 右下角「正在安装某某」。进度条可有可无——当初就是为安装放的，装上显示进度无妨。
> 3. **跨界面常驻 + 叉了不丢**：toast 挂**壳层**、不藏在市场标签页 DOM 里——切去别的标签页干活，下载继续后台跑、toast 继续挂角落报进度。关(叉) toast 不丢消息：铃铛旁仍留该条，直到出终局（#13.5 notifications 带铃铛常驻语义，实现时确认壳层渲染）。
> 4. **终局三态**：装好 → 一句「安装完成」；失败 → 「安装失败 + 原因（如网络中断）」；缺依赖/环境 → 「缺少环境」类。失败留双口：toast 内 [重试] 直达 + 详情页安装钮原位「重试安装」，两处同步零漂移（#30.9 已建同刻同 % 机制可承）。
> 5. **内联提示可保留但禁 reflow**：「缺下载地址」类拦阻提示，若 toast + 详情页各报一次，详情页那次**不得把下方内容整体下移**——落位须零位移（按钮上浮层/绝对覆盖等），实现时调 ui-ux-pro-max 定手法。**「不占位呈现」> 「非要有详情页提示」。**
> （本定案高于下列 A1-A3 旧措辞——A1-A3 里「删除 / 待你拍板」等字样一律以本定案为准。）

### A1　安装前置失败用了阻塞式弹窗（`dialog.alert`）——该走 toast

- **差什么（HTML 权威）**：02 帧 7（:1637）「缺依赖 = 事件型提示——点『安装』发现缺依赖 → 右下角 toast」；帧 3（:1043）「失败是事件型提示——一律走右下角 toast，不占顶部横幅」。用户拍板原文（02 :430）：**「顶部横幅把整个 UI 往下推 + 影响性能」**。结论：任何「装不了 / 为什么没反应」都应是 toast，不是要手动点掉的弹窗。
- **现在是什么（file:line）**：
  - [ExploreView.tsx:108-115](../../../../plugins/marketplace/src/views/ExploreView.tsx#L108-L115)：`if (!entry.downloadUrl) { await lk()?.dialog?.alert(t("该插件缺少下载地址")); return; }`——**这行正是用户引的那条**。阻塞式 alert 弹窗，点掉才走，还无「下载地址缺失」补救动作。
  - [SearchView.tsx:160/164](../../../../plugins/marketplace/src/views/SearchView.tsx#L160-L164)：本地目录安装（`pluginManager.install(目录)`）校验失败 / 版本冲突 → 两处 `dialog.alert`。
  - [DetailView.tsx:406/411](../../../../plugins/marketplace/src/views/DetailView.tsx#L406)（`doVersionAction` 缺 URL/无 update 面）亦用 `setError` 行内红字（见 A2）。
- **需要什么**：事件反馈通道单一化——`notifications.show(msg, { type:"error"|"warning", actions:[…] })`（**#13.5 已建成**，marketplaceShared 已在用 `show`，见 A3）。
- **补什么 / 怎么补 / 补哪里**：
  - ExploreView:109「缺下载地址」→ 删除 `dialog.alert`，改 `lk()?.notifications?.show(t("该插件缺少下载地址"), { type:"error" })`。**「该插件缺少下载地址」为下载资源缺失的静态拦阻 → 按定案 5：toast 报一次即可；若详情页保留同点提示 → 零位移浮层，不推布局。**
  - ExploreView:114「无 installWithProgress 面」→ 同理 toast（诚实：这是老 preload 面，属环境缺面，error toast 告知）。
  - SearchView:160/164 目录安装失败 → 走同一 install 失败通道（它经 `pluginManager.install` 非 `installWithProgress`，**失败目前无归因**——见 A3 归一并）。
- **改什么 / 改哪里**：把三处 `dialog?.alert`（Explore×2 + Search×2）全部移除；Explore/Search 引入 `notifications.show`（与 marketplaceShared 的 settle 同通道，文案查 [11-API与反馈.md](11-API与反馈.md) §三）。

### A2　`setError` 行内红字把内容往下推——违反「不占顶部横幅 / 不推 UI」拍板

- **差什么（HTML 权威）**：帧 3/7 拍板「頂部橫幅把整個 UI 往下推」一律弃。任何**事件型**失败不得靠「页面内长出一行红字」来呈现（那等于把 UI 往下推 + 事后还要自己消）。
- **现在是什么**：DetailView 门禁/动作失败走 `setError` → 渲染成 [DetailView.tsx:822](../../../../plugins/marketplace/src/views/DetailView.tsx#L822) `<span className="mpd-action-error">{error}</span>`，CSS [MarketplaceDetail.css:329-333](../../../../plugins/marketplace/src/styles/MarketplaceDetail.css#L329-L333) `flex-basis:100%` **独占一行**——错误出现瞬间 action bar 长高，下面 navbar/正文整体被推。触发点：
  - `installGateError()` [DetailView.tsx:486-511](../../../../plugins/marketplace/src/views/DetailView.tsx#L486-L511)：已装冲突 / 离线「联网后重试」/ 缺下载地址 / 无 install 面 / minApp 不足 → 五处 `setError`。
  - `doVersionAction` [DetailView.tsx:401/406/411/427/431](../../../../plugins/marketplace/src/views/DetailView.tsx#L427)：离线 / 缺 URL / 失败归因 → 行内红字。
  - enable/disable/uninstall 抛错 [DetailView.tsx:354/366/470](../../../../plugins/marketplace/src/views/DetailView.tsx#L354) → `setError`。
- **需要什么**：区分「**事件型失败**（瞬时通知 → toast）vs **持久状态**（如已装冲突后 UI 本就翻转，不需要再红字）」。门禁拦截属事件 → toast；动作执行失败属事件 → toast。
- **补什么 / 怎么补 / 补哪里**：
  1. 一次性/自愈类（缺下载地址、minApp 不足、无安装面、enable/disable/uninstall 抛错）→ 改 `notifications.show(…, { type:"error" })`，删 `setError` 行。
  2. 状态类（离线置灰）→ 不红字（按钮已置灰 + `title="联网后重试"` [DetailView.tsx:808/816-821](../../../../plugins/marketplace/src/views/DetailView.tsx#L816) 已表达），删行内红字。
  3. 已装冲突（防竞态）→ 属正常 UI 翻转（已装 → 按钮已变禁用/卸载），setError 本身罕见触发，可直接删行（静默）。
- **改什么 / 改哪里**：删 `.mpd-action-error` 整段（或仅留 `installErrHere` 失败会话行，见 A3）；门禁/动作失败统一入口 = `toastGateError()` helper 包 `notifications.show`。

### A3　安装失败双重呈现——toast + 行内错误行并存，与帧 3「按钮变红重试」不对齐

- **差什么（HTML 权威）**：帧 3（02:1045）「action bar 回到『未安装』态但**按钮变红色『↻ 重试安装』**（断点续传或从头，实现时择一）」+ toast。**一个失败 = 一处可见重试口**，不是「toast 一个 + 页面又长出一行再一个」。
- **现在是什么**：
  - `settleInstallFailure`（[marketplaceShared.ts:468-491](../../../../plugins/marketplace/src/services/marketplaceShared.ts#L468-L491)）**已正确**发 error toast + `[重试]` actions（command `marketplace.retryInstall`，消费 #13.5）✓。
  - 但 DetailView **又**渲染行内失败行 [DetailView.tsx:825-842](../../../../plugins/marketplace/src/views/DetailView.tsx#L825)（`installErrHere` → 归因文案 + [重试] + ✕），与 toast 重复 → 同一失败两个重试口 + 行内行 flex-basis 100% 又推 UI。
- **需要什么**：安装失败呈现收敛到帧 3 一种：**toast（已有）+ action bar 安装钮原位变红「↻ 重试安装」**。行内错误行退役。
- **补什么 / 怎么补 / 补哪里**：安装钮（[DetailView.tsx:805-813](../../../../plugins/marketplace/src/views/DetailView.tsx#L805)）在 `installErrHere` 时渲染红色重试钮（复用 `retryMarketInstall`），`variant` 换 danger 语义 + label 换「重试安装」；删行内 `installErrHere` 错误行块。点击后进入 installing 会话自然消失。
- **改什么 / 改哪里**：`.mpd-action-error-row` 块整删；DetailView 三态 action bar 的「未安装」分支接 `installErrHere ? 红重试钮 : 安装钮`；`dismissMarketInstallError` 若无用随之清（对账时定：toast 不依赖会话残留自给自足，行内 ✕ 关不再需要）。

### A4　缺依赖：未装不显示依赖行 + 安装前不查缺依赖（帧 7 对账，2026-09-09 新增，范围待用户拍板）

> **范围注明**：此项超出「详情页对账」纯版式/事件归一——是**新功能面（市场装前依赖门禁，依赖引擎消费接线）**。是否进 L3.5 由用户拍板；不默认随批次二开工。

- **差什么（HTML 权威，02 帧 7 缺依赖挂起）**：① **未装也显示依赖行**（帧 1 信息栏「依赖 storage-utils」蓝 dep-link，数据源 dependencies.ts `requires`）；② 点「安装」发现缺依赖 → **拦下** + 右下 toast「无法安装：缺少依赖 xx」+ [查看依赖] 主动作（点击跳对应依赖插件详情页）；③ 挂起持续表达 = 侧栏「等待依赖」琥珀徽标 + action bar「🚫 安装不可用（缺依赖）」。批注（帧 7 L1639）明令：「市场安装被拦」场景**不走**实机 `pd-pending-notice` 内嵌条（那是已装插件因依赖被卸载而挂起的另一场景）。
- **现在是什么（源码现状）**：市场端**只做「已装后挂起」**——挂起态 action 区只读 blocked-chip「安装不可用（缺依赖）」（[DetailView.tsx:781-785](../../../../plugins/marketplace/src/views/DetailView.tsx#L781)）+ 主区「依赖未满足」说明块（[888-909](../../../../plugins/marketplace/src/views/DetailView.tsx#L888)）+ 侧栏依赖 InfoItem 的 warn chip（缺失黄 ✕ 可点跳）。但：未装态（仅 catalog `entry`）**依赖行恒 Dash**（[996-998](../../../../plugins/marketplace/src/views/DetailView.tsx#L996) 仅 installed 才出 chip）；`installGateError` 判定只含 已装冲突/离线/缺下载地址/无 API/minApp（[486-511](../../../../plugins/marketplace/src/views/DetailView.tsx#L486)），**无「requires 未满足」拦截** → 点装即装、装上才挂起，用户装完才惊觉缺依赖。
- **需要什么 / 怎么补**：按帧 7 三段补齐 —— ① 未装读 `entry`（catalog）的 `requires` 显示依赖名（依赖引擎 E5.8#14/15 dependencies.ts 已有 `requires` 与缺失检测，市场只差消费）；② 点「安装」先过缺依赖检测，不过则 `notifications.show(type:"warning")` + [查看依赖]（零新 API，E3j#76 四方法现成）；③ blocked-chip/侧栏等待依赖的表达复用已装态样式。**实现阶段细节（dep 数据取 catalog 还是已装 requires、拦截是否要 minApp 同级异步）由依赖引擎接线时定。**
- **改什么 / 改哪里**：DetailView 未装 action bar + installGate 判定 + 信息栏依赖行（未装分支）。档案仅立案，不自动开工。

---

## 二、HTML 版式对账（对账 ②③④，权威 = 01 竞标 A 定稿 .pdva 骨架）

> 04 §〇 拍板「竞标只定骨架，皮肤走主题系统」——**骨架必须照做**：动作列位置 / 图标与文字并列 / 头部下分隔线 / 右侧竖排字段带「信息」标题且标签值横排。气泡皮肤可弃，分隔线不可省。

### B1　动作（安装/卸载/更新）位置——图标右侧列，不是图标下方整行

- **差什么（HTML 权威）**：01 竞标 A 头部 = 三段一行：`.pdva-ic`（图标）｜`.pdva-id`（名字/版本/发布者/描述/**chips 行**）｜`.pdva-acts`（**右上动作列**：安装钮 + 版本下拉，其下自动更新勾选）[01:829-853](mockups/01-插件详情页-竞标.html#L829)。**动作在图标/文字的右方同一头部**。
- **现在是什么**：`.mpd-header` 只含 icon + details（[DetailView.tsx:735-759](../../../../plugins/marketplace/src/views/DetailView.tsx#L735)）；动作单独排 `.mpd-action-bar` **header 下一整行**（[DetailView.tsx:761-844](../../../../plugins/marketplace/src/views/DetailView.tsx#L761)，CSS [MarketplaceDetail.css:292-298](../../../../plugins/marketplace/src/styles/MarketplaceDetail.css#L292)）——按钮在图标**正下方**、横跨整宽。用户观感「安装/卸载按钮在图标下、不在右」。
- **需要什么**：头部回归 .pdva 三栏 —— 左图标 + 中 id 列（名字/版本/徽标/作者/描述/**信息 chips**）+ 右动作列（三态主钮 + 版本下拉；自动更新勾选随已装态在此列）。窄容器时动作列可换行到下方（响应式兜底），但**默认 = 右侧**。
- **补什么 / 怎么补 / 补哪里**：重构 `.mpd-header` 为 `display:flex` 三段，`.mpd-acts`（右列）收编 action bar 内容。chips 行（下载/许可证/更新时间/分类，mockup .pdva-chips [01:837-842](mockups/01-插件详情页-竞标.html#L837)）目前实现**未做**（下载数/许可/更新/分类散在右侧栏 InfoItem，未抽头部 chips）——按 .pdva 结构把关键元数据提为头部 chips 行（可选；若信息在右侧栏已足可对账后拍板省）。
- **改什么 / 改哪里**：DetailView.tsx header JSX（735-759）加 `mpd-acts` 容器 + 把 action-bar 四态内容移入；MarketplaceDetail.css `.mpd-header`/`.mpd-action-bar` 重排（action-bar 类退役或改语义）。

### B2　图标尺寸/锚定 + 头部下分隔线

- **差什么（HTML 权威）**：01 竞标 A 图标为头部**左上**中等尺寸装饰位（.pdva-ic，约 40-56px，与文字同行锚顶）——不是巨大方形图标；头部面板与下方三 tab 之间**有清晰面板边界/分隔**（用户让步：气泡可弃但分隔线要做清）。
- **现在是什么**：
  - `.mpd-icon` 96×96 方形盒 + codicon 占位 96px [MarketplaceDetail.css:43-75](../../../../plugins/marketplace/src/styles/MarketplaceDetail.css#L43)——偏大、撑高头部。
  - header 与 action bar/navbar **无下分隔线**（`.mpd-header` 无 border；`.mpd-navbar` 只有自身下边框 [.css:358-363](../../../../plugins/marketplace/src/styles/MarketplaceDetail.css#L358)）——三段无分界，视觉糊在一起。
- **需要什么**：图标尺寸收敛到 mockup 尺度（~48-56px 内容位），头部块间加 `var(--separator)` 分隔线。
- **补什么 / 怎么补 / 补哪里**：改 `.mpd-icon` 至 ~52px 容器 + 内图 ~40px（lucide/emoji/img 按其型）；`.mpd-header` 加 `border-bottom: 1px solid var(--separator)`（或与动作区合并成一面板后加底部边）。
- **改什么 / 改哪里**：MarketplaceDetail.css：43-75（icon）、37-41（header 加 border）。

### B3　右侧信息栏——分组节标题（VS Code 式，弃单一「信息」h4）+ 横排 标签:值 + 项间分隔 + 作者行补上

> **结构调整（2026-09-09 用户拍板，覆盖 mockup `.pdva-info` 的 `<h4>信息</h4>`）**：VS Code 扩展详情右栏**没有「信息」二字的总标题**，是**大标题套小条目**——分组节标题 + 组内字段横排，结构对全插件**固定不变**。用户实读参照（markdown-preview-enhanced 随便抓的一个）：一组内挂 标识符/上次更新时间/大小 之类；另组节标题「市场」挂 已发布 9 年前/上次发布时间；资源类挂 仓库/问题/许可证。用户赞其「挺固定的」。
> **字段集全保留（2026-09-09 用户拍板，AI 建议采纳）**：VS Code 右栏没有的**加料字段**——来源/下载/需 LinkDesk/依赖/被依赖——**不精简**，分组内照留（多源/依赖是 LinkDesk 强项）。
> **实现稿（2026-09-09 用户「基本同意」= 定稿方向）**：mockup [04-插件详情页-信息栏分组实现稿.html](mockups/04-插件详情页-信息栏分组实现稿.html)——无「信息」总词，小段开首（标识符/作者/版本/大小）+ 分组节题「市场/类别/资源」+ 每行 label 左 ｜ value 右 横排；**加料默认归组**：来源/下载→「市场」，需 LinkDesk/依赖/被依赖→「依赖·环境」末组；作者脚注已删（2026-09-09 拍板，见下尾注）。黄标默认即开工依据，用户无异即按图，有尾改再提。

- **差什么（HTML 权威 + 2026-09-09 覆盖）**：01 `.pdva-info` [01:880-891](mockups/01-插件详情页-竞标.html#L880)：`.pdva-if` 每行 = `k`（标签左）｜`v`（值右）**横排左右分列**（结构权威保留）；`.pdva-info` 的 `<h4>信息</h4>` 总标题 = **弃**（改分组节标题）。分组/组名/归组（组 1 基本信息段、组 2「市场」挂 已发布/上次发布/来源、组 3「资源」挂 仓库/问题/许可证、加料字段归组）= **开工前 ui-ux-pro-max + 与用户对齐，本档案不定死**。
- **现在是什么**：
  - 侧栏 `.mpd-info-sidebar` **无标题、无分组**（[DetailView.tsx:958-1000](../../../../plugins/marketplace/src/views/DetailView.tsx#L958) 直接 InfoItem 平铺起排）。
  - `.mpd-info-item` `flex-direction: column`（[.css:430-435](../../../../plugins/marketplace/src/styles/MarketplaceDetail.css#L430)）——标签**在值上方**竖叠，非横排左右。
  - 项间无分隔线（gap:1px 仅粘连，非清晰 row 分界）。
  - **作者行缺失**：侧栏无 `InfoItem(作者)`——作者只在 header 副标题（[DetailView.tsx:756](../../../../plugins/marketplace/src/views/DetailView.tsx#L756)）。
  - **禁用态连带坑（2026-09-09 源码盘点）**：纯禁用态 manifest 分支 [DetailView.tsx:59-63](../../../../plugins/marketplace/src/views/DetailView.tsx#L59) 无 `author`/`icon` 字段 → 插件禁用后 header 副标题（作者）消失、图标退 codicon 占位——与 [14 档案 §二 A](14-市场图标系统任务档案.md)「列表数据通道删 icon」同族：**详情数据源缺字段**。补作者/图标时必须一并补禁用态数据源，否则 B3/B2 做完作者与图标只在启用态可见。
- **需要什么**：右侧栏 = **分组**——组节标题（小字 muted「大标题」感）+ 组内每项一行 标签(左, muted) ｜ 值(右/左, 可断行) + 项间 `--separator` 细分隔。**不出现单一「信息」总词。**
- **补什么 / 怎么补 / 补哪里**：aside 首层按组拆（节标题元素 `.mpd-info-group-title` + 组容器）；`.mpd-info-item` 改 `flex-direction:row; justify-content:space-between`（值 `text-align:right` 可断行）；项加 `border-bottom` 行间分隔；补 `InfoItem(作者, authorText)` 归其组。组结构实现前先 ui-ux-pro-max 定节标题层级 + 组名与用户对齐。
- **改什么 / 改哪里**：[DetailView.tsx:958](../../../../plugins/marketplace/src/views/DetailView.tsx#L958)（aside 拆组 + 补作者行）；MarketplaceDetail.css:422-451（节标题 + 横排行 + 分隔线）。
- **信息栏「来源/市场/仓库」行语义（2026-09-09 用户确认，防重复解释；跨会话见 memory e6-market-factory-publish）**：LinkDesk **无 VS Code「每插件一张外网商品页」**——不是没集中市场，而是轻量形态：集中市场 = **官方目录清单仓库** `encaron/linkdesk-marketplace` 的 `marketplace.json`（[marketCatalog.ts:56](../../../../plugins/marketplace/src/services/marketCatalog.ts#L56) 恒内置锁源、自动拉取）；现阶段官方目录**尚未上内容**（dev 空源）→ 用户观感「只有作者 GitHub」= **多源货架**（作者自仓库发，设计上与官方目录并存，非缺陷）。行语义：来源=官方目录条目 → 「来源」显示 官方，商品页=软件内详情页本身；来源=作者仓库 → 「仓库/问题」即作者真实 GitHub。**作者脚注「市场 ↗」删除（2026-09-09 用户拍板）**——无发布者账号页/每插件站外页可指，身份已由顶部作者行 + 「来源」行承载，脚注指哪都失真；mockup 04 帧注「已拍」同步。
> **VS Code 真源核实（2026-09-09，用户「别等我一段段喂，直接去读 VS Code 市场源码」后 curl [extensionEditor.ts](https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/contrib/extensions/browser/extensionEditor.ts)）**：
> - **分类 = 多枚 chip 并排**：`renderCategories`（:1086-1103）for 循环每分类一枚 `span.category`，可点按则按分类搜市场；现我们 categoryText `join(" · ")` 粘单串 [marketCategories.ts:43](../../../../plugins/marketplace/src/services/marketCategories.ts#L43) → B3 改每分类一枚 chip 并排（数据 categories[] 本数组，纯显示改）。实证：claude-code = AI/Chat 两枚。
> - **资源组 = 逐行条件**：`renderExtensionResources`（:1105-1140）`if (extension.repository)` 仓库 / `if (extension.supportUrl)` 问题 / `if (extension.licenseUrl)` 许可证——**有才显**；尾部恒挂 `publisherDisplayName→publisherUrl` + "Marketplace"→extension.url 两外链。实证：claude-code 无「仓库」行（Anthropic 未公开源码仓库）只余「问题」——正常非漏。我们无 publisher 账号页/每插件外页 → **不照搬尾两枚**，身份 = 来源行；DetailView 现本就条件渲染 [972-991](../../../../plugins/marketplace/src/views/DetailView.tsx#L972)，B3 保持。
>
> **大小行策略（2026-09-09 用户拍板「下载体积常显 + 已装可开目录」）**：「大小」值来源 = **实测下载包字节**，非作者嘴填——SDK publish 对分发件 `statSync().size` 量真实字节写 marketplace.json（[publish.ts:485](../../../../packages/plugin-sdk/src/publish.ts#L485) → `buildCatalogEntry(preview.sizeBytes)` [256](../../../../packages/plugin-sdk/src/publish.ts#L256)）。用户实读 VS Code：详情页 Size 只在**已装**（「安装」组）出现且值可点 → 开实际安装目录（[extensionEditor.ts:1185-1199](https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/contrib/extensions/browser/extensionEditor.ts)，`if (extension.size)` + class 'link' + onClick open `extension.location`）。**拍板 = 两值不混淆**：下载体积（下载前知量）装不装都显（现 DetailView:965 已如此，B3 保持）；**已装插件的行值变链接「打开所在位置」→ 资源管理器开安装目录**——renderer 无安装路径知识（隔离），须新增**主进程解析插件路径 + `shell.showItemInFolder`** 小 API（对照 E5.8#153 revealStorage 先例 appearance-handlers.ts:48）。该 API 新增 = 壳能力批次（version-bump MINOR 向），**不入纯版式 B3 批次默认序**，排批次时定 API 名。（**2026-09-09 PowerShell 实证追加**：VS Code 已装信息栏还有第二枚「缓存」行同样可点开 → 该插件 globalStorage 数据目录 [extensionEditor.ts:1201-1223](https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/contrib/extensions/browser/extensionEditor.ts) `computeSize(cacheLocation)` + open `cacheLocation`；**LinkDesk 对应物 = pluginDataDir** `<appData>/linkdesk/plugins/<id>/data`（[env-service.ts:63](../../../../electron/services/env-service.ts#L63)，含 cache/exports 子目录，安装即建 filesystem-guard:154，插件经 env.pluginDataDir 读到 [types.ts:207](../../../../src/core/api/linkdesk-api/types.ts#L207)）——挂起 API 可扩成**两枚开**：大小→安装目录 + 数据/缓存位置→pluginDataDir，排批次时定 UX。）✅ **2026-09-11 已落地（E6#78）**：本节拍板从挂起转执行（用户实机提问「为什么下载后大小后面的数字不变蓝色，不能打开安装的位置」触发）。API 定名 `shell.pluginLocation(pluginId)`（返回 `{ installDir, dataDir } | null`）+ `shell.openPluginFolder(pluginId, kind)`（`"install" | "data"`）；**开目录内容**（`shell.openPath`，与 `appearance.revealStorage` 同一手感）而非原注的 `showItemInFolder` 高亮单文件。UI：已装态「大小」行值变链接（点开安装目录）+「数据位置」行 `dataDir` 非 null 才画。全量落地记录见 [E6 执行清单 第 3.5.12 轮](../../E6-执行清单.md)。

> **显示条件（2026-09-09 问「为什么有的有缓存」后源码核实）**：VS Code「缓存」行只在**该插件数据目录非空**才显示——[extensionEditor.ts:1205-1208](https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/contrib/extensions/browser/extensionEditor.ts) `computeSize` 后 `if (!cacheSize) return`，空则整行藏。LinkDesk 版照抄：`数据位置` 行只在 pluginDataDir 非空时显。需不需要数据目录 = 插件有无**文件型落盘**（设置/开关走壳配置；文件/下载物/导出走 pluginDataDir——串口 receive-saves 先例 [index.tsx:674](../../../../plugins/serial-monitor/src/index.tsx#L674)）；纯 UI 插件恒空恒藏，非人人要有。）
>
> **详情页字段来源三类（2026-09-09 用户问「许可证/发布时间是作者想声明就声明吗」后源码盘账，防再问）**：
> - **① 机器事实，假不了**：发布/更新/首次时间 = SDK 发版瞬间写 `publishedAt`（[publish.ts:267](../../../../packages/plugin-sdk/src/publish.ts#L267) 对齐 GitHub Release，无 UI 回改口）；大小 = 发版 statSync 实测；下载数 = GitHub API 只读计数；来源/仓库/问题 = 从当前源仓库 owner/repo 推导（假仓库拉不到数据）。
> - **② 作者声明（与 VS Code 同，无人核实）**：版本号、许可证、分类/类别、需 LinkDesk minAppVersion、描述/图标/作者名/依赖——作者 plugin.json 自填；VS Code 许可证同理自填，全行业常态，非缺陷。
> - **③ 关键事实：SDK 自动发版条目很瘦**——[buildCatalogEntry :256-270](../../../../packages/plugin-sdk/src/publish.ts#L256) 只写 id/name/version/author/icon/downloadUrl/size(实测)/publishedAt/versions；**license/categories/minAppVersion 不进自动清单** → 第三方作者自发源详情页这几行多为空不显；官方目录收录补全才有值。mockup 04 齐全字段集 = 官方收录形态。**挂起候选**：未来 publish 从 plugin.json 读 license/categories/minAppVersion 随目录带（发布链路任务，排批次时定，勿自作主张改 SDK）。

### B4　容器宽度——880px 居中不铺满标签页 → 用户拍板「去 880 全宽」（2026-09-09 实测定案）

- **差什么（权威）**：mockup 详情 = 全宽主区 + 右侧固定 ~208px 信息栏（主内容吃满剩余），无「整体 880 居中」概念；VS Code 扩展详情页同款「通栏 + 右侧栏定宽」。
- **现在是什么（2026-09-09 CDP 实测）**：`.mpd-detail { max-width:880px; margin:0 auto }` [.css:7-17](../../../../plugins/marketplace/src/styles/MarketplaceDetail.css#L7)——可视宽 1400 时详情列仅 880（左空 423/右空 98），**没有铺满整个标签页**；屏幕越宽两侧空带越大。
- **用户原话（2026-09-09，定案）**：「整个显示的内容其实是居中的…两边条线的两边是空的、只有中间这一部分是详情内容…哪怕有 redme 也是居中显示、两边那么大地方都没利用到」「一整个标签页那么大，他没有铺满整个标签页」。
- **拍板**：**去掉 880 限宽**——头部/README 主内容自适应铺满主区可用宽，右侧信息栏定宽 ~208-220 不随内容挤（mockup + VS Code + 04 §三骨架）。此项不再是可选项。
- **补什么 / 怎么补 / 补哪里**：`.mpd-detail` 删 `max-width:880px; margin:0 auto`（.css:12-13）；`.mpd-details-main`（README 主区）`flex:1` 吃满剩余宽；`.mpd-info-sidebar` `flex:none` 定宽（.css:422-428 已具 ~220）。实现时先调 `ui-ux-pro-max` 定「全宽 + 右栏定宽」列宽/长行断行规范（超长 URL / README 长行在宽列的可读性），不手写 px。
- **验证**：大屏（可视 1400+）打开 串口监视器 / 粉彩图标集——详情内容**铺满标签页可用宽**，右侧信息栏定宽不被挤走，两侧无大片空带。

### B5　头部锚定——垂直方向已钉顶（2026-09-09 CDP 实测成立），降级为复核基线 + 壳保底对齐

> **性质修订**：B5 原以「短内容悬中 / 头部被正文顶走」立案（AI 2026-09-09 先凭静态读推定「整页一根滚动条、头随内容滚」，误）。真机 CDP 实测**垂直不漂移成立**——头部/图标本已钉顶、正文独立滚动。用户观感「整体居中、不占满」根因实测为 **B4 的 880 横向窄列**（宽屏上内容只占中间一柱 + 短内容大留白）。故 B5 不再是「改滚动结构」的改动，降级为：**复核基线（已实测 ✅）+ 壳保底同构对齐（随 B2/B4 一起做）**。

- **实测证据（2026-09-09，CDP 0.1.14，同屏逐插件量）**：官方主题（短，无 README）与 粉彩图标集（长 README 1228 字）——头部顶边均 **y=65**、图标盒顶均 **y=85**，同锚点同尺寸；`.mpd-detail` 根 `scrollHeight==clientHeight` **不滚**；`.mpd-body` 是唯一活动滚动区（长文 bodySH 976>CH 517，头不滚走）。→ 结构源头 = 09-08 迁移 commit `4bac890da` 起根节点即 `height:100%` + `.mpd-body flex:1`，**当前架构本就对标 VS Code 固定头**。
- **为什么用户仍感「内容居中/位置变」**：宽屏上 880 窄列（B4）横居中间 → 内容只占中间一柱、两侧大空 + 短内容下方留白 → 观感「整块被拎在中间 / 不占满」。**归因 B4，不归因纵向**。B4 拍板全宽后此观感随之消除。
- **复核基线（批次一收尾验，非改动）**：官方主题（短）/ 粉彩图标集（长）——头/图标/标题/版本同锚点同尺寸、都贴顶；长文只在 `.mpd-body` 内滚、头不滚走。对照 VS Code 扩展详情页。
- **余项——壳保底对齐（随批次一 B2/B4 做）**：壳保底 [PluginDetailView.css:3-13](../../../../src/pool/views/plugin-detail/PluginDetailView.css#L3) `.plugin-detail` 与市场面同构——市场侧 B2（图标收敛）/B4（全宽）落地后，保底同构对齐一次（保底 = 市场插件不可用时的后盾，避免「换市场插件 = 观感跳动」）。不单独立滚动改造。

---

## 三、元回答——用户以为「没做」的其实做了（⑤ 澄清，非缺陷）

对账如实说明（不是 bug，是**数据/状态门控**导致观感「你啥都没显示」）：

1. **安装确认弹窗 = 有**（[DetailView.tsx:1007-1063](../../../../plugins/marketplace/src/views/DetailView.tsx#L1007)，`OverlayPortal .mpd-confirm`，列发布者/来源仓库/描述/版本/大小/许可证 + 「安装即信任」——已对齐帧 8 结构 ✓）。**只在「点安装」时弹**：`confirming && entry`——若插件是已装/本地（无 catalog `entry`），不弹。用户看到「没弹窗」= 看的插件已是已装态，本就不该弹。
2. **自动更新勾选 = 有**（[DetailView.tsx:717-730](../../../../plugins/marketplace/src/views/DetailView.tsx#L717)）。**G2 拍板只在「已装且非挂起」显示**（mockup 帧 1 未装行无此勾，帧 2 安装中置灰）。用户看的是未装/挂起插件 → 不显示 = 正确行为。
3. **软件大小 = 有**（[DetailView.tsx:965](../../../../plugins/marketplace/src/views/DetailView.tsx#L965) `entry?.size != null && <InfoItem …>`）。**只显示 catalog `size`**；已装/本地插件目录无此字段 → 诚实不显示（不伪造空位，04 §三「已装可另显安装目录大小」未做——可选补：已装读包/目录大小走 workspace 面）。
4. **下载数 = 有**（[DetailView.tsx:969-971](../../../../plugins/marketplace/src/views/DetailView.tsx#L969)），GitHub Releases API 才显，http/无 API 源诚实隐藏（#30.8b）。

> **观感根因**：当用户看的是**已装且 catalog 无数据**（本地/内置）插件时，大小/下载/来源/版本历史全按诚实边界隐藏 → 右侧栏只剩标识符/版本/依赖几行，显得「什么都没显示」。**改进方向（可选拍板）**：已装态把「安装目录 / 包内大小」补上（诚实有据），减少空栏感——但对账优先级低于 A/B。

---

## 四、改前必守的约束

1. **任何 CSS/样式/布局改动前**：先调 `ui-ux-pro-max` 设计 skill 拿设计系统（硬约束 16），token 落 CSS 变量，不硬编码 hex/px。
2. **i18n**：新增文案走 `t()` + zh/en 键（硬约束 2，key = 中文原文）。
3. **版本**：本档案涉及的代码改动是用户可见修复 → 完成验证后 version-bump skill 判定（0.x 向后兼容 → patch 位），提交前缀 `fix:` / `feat:`（混合取高）。
4. **事件反饋文案**：一律查 [11-API与反馈.md](11-API与反馈.md) §三 文案映射表，不新造文案。
5. **验收**：改后按 mockups/02 十帧逐帧实机对照（04 §三 L128 验收契约）。

## 五、执行建议批次

- **批次一 = 版式对账（B1-B5）**：动作列回右（B1）/ 图标收敛 + header 分隔（B2）/ 「信息」栏 h4+横排+分隔+作者 + 禁用态数据源补全（B3）/ **去 880 全宽铺满 + 右栏定宽（B4——用户 2026-09-09 已拍板）** / 头部锚定**复核基线** + 壳保底对齐（B5，实测已钉顶、降为验证项）。纯 CSS + DetailView JSX 结构，风险中，一次成型。
- **批次二 = 事件反馈归一（A1-A3）**：三处 `dialog.alert` 移除 + `setError` 门禁红字转 toast + 安装失败收敛帧 3 红钮。涉及 Explore/Search/Detail 三个视图 + 服务层，需逐个文案归一对账。**A4（装前缺依赖门禁）不在本批默认序——新功能面，待用户点名。**
- **真机核查备注（2026-09-09）**：安装确认弹窗 `.mpd-confirm` 经 OverlayPortal 入 `#overlay-root`，**无全屏 scrim**（外点即关）、卡片居中 440px——mockup 帧 8 的「28px 顶拖拽区避让」风险实际不成立（无全屏遮罩覆盖顶部）。随批次实现时在安装流真机点弹窗上沿复核一次即可，不需单独立项。
- 顺序由用户点名；**开工先报「开始实现批次 X」**（本档案只是立案，不自动开工）。
