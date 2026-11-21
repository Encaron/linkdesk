# UI 修整阶段 · 交接单（2026-11-21）

> **用途**：棒 16 验收之后，用户开始逐条做**实机 UI 反馈**，由执行 AI 连续修。本单是这一阶段的**唯一交接入口**——接班 AI 先读本单，再读 [16-真机问题登记与验收报告.md](./16-真机问题登记与验收报告.md) §二/§六（问题总账与各轮进展）。
> **阶段定位**：⛔ **不是棒 17（发版棒）**。本阶段只做「UI/交互修正 ＋ 归一化」，**不发版、不推**；攒批归棒 17。
> **上游**：16 号档（问题总账 F1–F25）· 13 §七硬闸 · 10 号档四条范式。
> 🔴 **交接状态**：本单由 `sess_18da1de4…`（棒 16 执行会话，上下文将满）立；**向总调度台 `sess_5089b35d…` 的回执请求发送失败**（`SendToSession` 三次 `proto.sessionNotFound`）——⛔ 未假报已发；**接班 AI 可直接按本单接手**，无需等待消息。
> 🔴 **调度台与人际（2026-11-22 最新）**：总调度台 = **`sess_f471a6eb-f1c5-4627-abd1-997d502dbbf8`**（⛔ 旧台 5089b35d / 99d7be02 / b6d92afe 均已退场）。**回执一律走文档**（本单 / 16 号档 / `交接.md`）——「执行 → 调度台」跨会话消息在本宿主实测不可达（新旧台同一错误），`SendToSession` 只试一次、如实记账、⛔ 重试。**AI 间消息开头必带标识行**：`【市场UI修整 · sess_3ecad1c4-33bf-4366-b936-5a2e334fb808】`（给用户回话不用）。**媒体丰富度设计轴**：另派（当前 ID 以 `调度台.md` §三 为准；与本单文件域不交叉，⛔ 不改同一批文件）。
> **接手入口（一句话）**：「读 `Marketplace-Store/UI修整阶段-交接单.md` 接手，做 UI 修整，不发版。」

---

## 〇、最新交接状态（2026-11-22 · 第 6 轮接班结束，上下文将满）

> 本节是**接班第一入口**；下面 §一–§六 是阶段早期的范式与环境，仍然有效，但**以本节为准**。

### 1. 现状（实读）

- **壳 0.2.59 攒批**（未发版；发版归棒 17）· **市场仓 `6e46a01`**（第 7 轮 R19）· 主仓最新（代码 `0240f8655`／`3bc981a6e` Toast；文档 `715fa43ea`）。**全部未推送、未发版。**
- 作者轴 npm 已发（用户授权，已 `release:mark`）：`plugin-sdk 0.1.98` · `create-linkdesk-plugin 0.1.26` · `plugin-docs 0.1.82`；`@linkdesk/ui` 仍是 0.2.66（本轮未动）。
- 已修轮次（详见 16 号档 §六）：R1–R4（旧）＋ R5 面/轨道/槽位/库/排序/文案 ＋ F39 单面化 ＋ F40 声明式辉光 ＋ F41 榜单常显动作 ＋ F42 删 Strip 滚轮 ＋ F43 下拉排序 ＋ F44 开发者腔清理 ＋ F45 放大态尺寸/裁剪 ＋ F36/F37/F38 基底特异性/作者横排/标题 ＋ **F46 容器响应式**（壳 `.ldk-tab-content` 尺寸容器＋市场 11 处 `@container`＋门禁）＋ **F47 价格角标连环**（下方 3）＋ **R12 AI 友好化**（`openCategory+authorId`/`openRank`/`openAuthors`＋`getState` 读取面（含各页可见切片/`visibleAuthorIds`）＋`NAV_COMMANDS` 门禁，市场仓 `49373c3`）＋ **R13 作者店 hero 归一化**（共享 `HeroCarousel`＋删 `AuthorHero`＋`openStore` 强制回首页，市场仓 `75028a3`）＋ **R14 合集渲染归一**（`CollectionRenderer`/`collectionLayoutOf`，市场仓 `f0ffee8`）＋ **R15 作者 rail 计数/未读点＋窄窗分类栏滚轮**（`28c37a3`）＋ **R16 Toast 图标 8em 地板**（主仓 `3bc981a6e`）＋ **R17 作者卡顶层磨砂＋切仓位置记忆**（`bf43683`）＋ **R18 页主范围归一**（官方首页策展只吃 official＋所有 `more.category` 按页主预过滤：官方=official 源、作者=authorId，`0c798b5`/`7ffa007`）。

- **第 6 轮收口（2026-11-22）**：本轮修 R12–R18（AI 命令/读取面 `getState`、Hero/合集渲染归一、作者 rail 计数/未读点、窄窗分类栏滚轮、Toast 图标 8em 地板、作者卡顶层磨砂、切仓位置记忆、官方策展隔离＋页主范围）。**用户还有几个小 bug 未列**——接班第一件事问用户具体是哪几处，⛔ 自行排批次。
- 🟢 **第 6 轮派单（2026-11-22）**：本会话向总调度台 `sess_f471a6eb-f1c5-4627-abd1-997d502dbbf8` 发 `SendToSession`，返回 **`admission:"accepted"` / `delivery:"start_now"`**——本次**送达**；调度台据此建第 7 轮会话。新 AI 仍以本单 §〇 为准，无需等消息。
- **第 7 轮（2026-11-22 · R19 侧栏跟位＋回顶双入口）**：用户报「点首页『全部主题／完整榜单』跳转后，rail 没跟过去（排行榜在下面被盖住）」。已修：① 路由落定后 rail **自动把当前项滚入可视区**（竖排滚 `.rail-scroll`、≤900 窄窗滚 rail 本体；只动侧栏）；② **已定位项二次点击 = 平滑回顶**（`sameRoute` 精确比对，带 `authorId/official` 的分类页点 rail 仍回全量分类）；③ 内容区右下角**悬浮回顶钮**（滚过 280px 淡入，reduced-motion 直落）。截图 `r19-backtop.png` / `r19-rail-focus.png`（`%TEMP%\linkdesk-fixture\shots\`）。市场仓 **`6e46a01`**；`verify` 全绿 · vitest **68 文件 / 721 例**。**待用户复验**；用户还有小 bug 继续报，仍按「一处一处」来。

### 2. F47 价格角标（结构已定；2026-11-22「去实底」已实施，待用户复验）

- **规则（用户拍板）**：价格是主信息，**⛔ 永不省略号**；只有分类/作者可省略；标题独占一行，不被价格挤。
- 结构：`statusTag` 付费态新增 `modelKey/amount`；`CornerTag` 支持 `stacked`（模型词/金额两行）；**小卡 stacked、网格单行**（宽度够）；hover 徽标行**过滤状态族**（角标是唯一状态出口，不再两份价格）；`rows2` 轨道上下余量 36→48、网格占位 96→108。
- **第九轮（R9）用户口径**：两行结构保留，但**实底强调色胶囊像按钮** ⇒ 只改这一处、不碰布局。已改：`.is-stacked.is-paid` 去底去框；模型词 `--text-secondary`/500，金额 `--accent`/700；仅 `stacked+paid`，单行角标不动（市场仓 `d5131a7`）。
- 实测：R8 常态标题 139px 完整、角标 57×32 在卡内；R9 真机角标 57px、背景 `rgba(0,0,0,0)`、模型词 `rgba(255,255,255,0.8)`/500、金额 `rgb(255,184,92)`/700；hover 展开面仅「社区」一枚徽标。
- 截图：R8 `r10-rest.png`/`r10-open2.png`；**R9 `r11-price-rest.png`/`r11-price-hover.png`**（均在 `%TEMP%\linkdesk-fixture\shots\`）。
- ✅ 用户 2026-11-22 拍板：**玻璃主题不恢复**，后续验收保持 `theme-panorama.panorama`。

### 3. 环境（⚠️ 与旧 §四 不同）

- **隔离实例**：`electron . --remote-debugging-port=9391 --user-data-dir=%TEMP%\linkdesk-accept --proxy-server=127.0.0.1:7890 --proxy-bypass-list="127.0.0.1;localhost"`（需 `env -u ELECTRON_RUN_AS_NODE`）；Vite `1420` 带 `LINKDESK_USER_PLUGINS_HOME=%TEMP%\linkdesk-accept\plugins`。
- **综合夹具（2026-11-22 按用户要求重建）**：根 = `%TEMP%\linkdesk-fixture\`
  - `sources/<repo>/marketplace.json` ×**11 源**（Alice 3 仓/17 件、Bob 3 仓/16 件、Carol 5 仓/23 件＝**56 件**，加官方 19＝目录 75 件；含空仓 `carol-empty` 与扩展仓 `carol-extras`）；`authors/<authorId>.json` ×3——**作者卡/作者店的必需件**，旧最小夹具缺它 ⇒ 首页作者栏不出现。
  - `intercept.mjs` v2：按 URL 里的 repo 名路由 marketplace.json，按 `/authors/<id>.json` 路由作者块，动态出 icons/avatars/shots SVG（`intercept.legacy.mjs` = 旧单源版备份）。
  - `licenses-seed.json` → 复制到 `%TEMP%\linkdesk-accept\licenses.json`（永久已购 / 订阅剩 20 天 / 剩 7 天 / 已过期四态）；`FIXTURE.md` 有覆盖清单与加源数组。
  - 加源：直接 `window.linkdesk.configuration.set("marketplace.marketplaceSources", [...11 URLs])` → `marketplace.refreshCatalog`。**改 JSON 不用重启拦截器**（按请求读文件），应用重启才要重启。⚠️ **`refreshCatalog` 只强刷目录**；作者域是缓存的 ⇒ 改作者块/作者仓插件列表后要**硬 reload**（或走 UI「刷新内容」路径）才重建，否则作者店仍显示旧件数。
  - 覆盖：免费 / 买断 / 订阅（月·年·季，¥/$/€）/ 试用 / 退款 / self·managed；空分类「网络 0」；裸件（无作者/分类/图标/截图）；超长标题；未知分类；minApp 9.9.9；banner/strip/duo/grid 合集；作者店 hero/collection/grid/rank/空仓。
  - 截图：`shots/r12-authors-home.png`（3 作者）、`r12-carol-license.png`（已购/订阅价）、`r12-other-category.png`（裸件/未知分类）。
  - **作者店 more 跳转边界（2026-11-22 补）**：Alice 主题铺 collection `more.target="category:themes"` → 全局主题分类页＋authorId 预过滤（7 件 Alice / 全分类 18；chip「Alice 光栅工坊 · 7」可 ✕ 或「显示全部」）；Alice 工具箱 `category:development`（3 件）；Alice rank `target="rank"`；Bob 双大卡合集 `target="repo:bob-media"` 切仓；Carol 套件 `category:development`。截图：`r15-author-more-themes.png`（入口）、`r15-filtered-themes.png`（过滤页）。
  - **多 hero / 横滚 / 堆叠（2026-11-22 补）**：各店 hero 3 张；Alice 工具箱 strip 8 件、主题铺 mega 7 件；Bob 效率 strip 6、媒体 strip 5；Carol 套件 strip 8、字库 strip 6；duo 恒 2（设计如此）；Carol 5 仓 → 作者卡 4+ 汇总「3 个仓库/9 个插件」。截图：`r16-bob-hero.png`（箭头完整）、`r16-alice-strip.png`（双行横滚）、`r16-carol-deck-rest.png` / `r16-carol-deck-hover.png`（堆叠/扇开）。
  - ⚠️ **观察（未修）**：分类页 300px 容器下 `.cr-desc` 被压到 6px（nowrap＝省略号，非竖排）；作者店 300px 容器下页头 H1「Alice 的小店」49×99（`ws:normal` 多行）——两处待用户判。库「已购未安装」过期徽标已在第十一轮修复（`bf0f98c`）。
- **主题现状（2026-11-22 实读 + 用户拍板）**：`accept/plugins` 现有 marketplace / settings / **theme-panorama**；当前 recipe = `theme-panorama.panorama`（配色 `theme-panorama.moonlight`）。**极光玻璃未装**；用户拍板**保持 panorama、不恢复玻璃**。另：硬 reload 后应用语言曾回落 `en`，已用 `window.linkdesk.language.set('zh')` 恢复——后续 reload 若界面变英文，先查这个。
- 换产物三连、CSS 空缓存坑、`MSYS_NO_PATHCONV=1` 等仍见 §四/§六。

### 4. 接班第一小时

1. 读本单 §〇 → 16 号档 §二/§六 → `调度台.md`（当前调度台/设计轴 ID/信道注记）。
2. 起/验环境：`status` → 重启拦截器（若应用重启过）→ 打开商店，确认首页 **3 张作者卡（Alice/Bob/Carol）**、rail「网络 0」、库页 4 条「已购未安装」、各作者店 hero **3 点/2 箭头且右箭头完整、滚轮可换页**。
3. **先问用户**：剩下几个小 bug 具体是哪几处（F47 去实底已验、玻璃保持 panorama、页主范围已按 2026-11-22 改判）；按用户指的下一处继续，⛔ 自行排批次。
4. 每轮：改 → build → 部署 → 重启 Vite → 清缓存 → reload → **四页 300px 普查**（脚本 §三）→ 截图 → 市场仓 `verify`＋`vitest` → 主仓动 `src/` 走 `npm run check` → **单独一笔提交** → 16 号档 §六。

### 5. 红线（本阶段长期有效）

- ⛔ 不发版/不推送；⛔ 自建会话；发版棒归调度台。
- ⛔ 与「媒体丰富度设计轴」交叉：它出 `mockups/06-媒体丰富度蓝图.html`＋`17-媒体丰富度设计.md`，**你只修 bug，不碰那两处与设计稿**。
- 价格永不截；标题不被价格挤；**一面一个 backdrop root**（F39）；响应式一律 `@container`（F46 门禁：市场仓 `responsiveByContainer.test.ts`）。
- 右键菜单玻璃外观不动；能用共享组件的必须用；卡片长相属市场私有，⛔ 抽 `@linkdesk/ui`（2026-11-21 拍板，见 CLAUDE 硬约束 28）。

---

## 一、当前状态（2026-11-21 实读）

### 已完成（按用户反馈轮次）

| 轮 | 内容 | 提交 |
|---|---|---|
| R1–R2（棒 16 内） | F3 openStore 补 `{pluginId}`；F11–13 横滚余量；F16 分类页 clamp；F19 作者卡定宽 | 市场仓 `70cbcd7`、`ed49e8f`；主仓 `15332846d`/`8aebf3a97` |
| R2.5 | F10 hero 箭头外置＋提示删；F15/F21 ⋯菜单换共享 ContextMenu；F17 4×select→SelectBox＋筛选打勾；F1 作者回落；F9 通知去重 | 市场仓 `ed49e8f`、`318814d` |
| R3 | F20 许可弹窗走壳 `dialog.confirmContent`（`LicensePanel` 双形态）；F5 警告聚合；F6 口径文案＋库徽标；F14 单层呈现；F25 渐变铺贴 `background-origin` | 市场仓 `fb486f0`；主仓 `dc485b0d3`（ContextMenu onSelect）、`f594a2c5f` |
| R4（全页普查） | 来源组头/源行 wrap＋地板；库行 wrap＋地板；详情容器查询（<700 隐右栏）；hint 限长 8 行 | 市场仓 `3e9df5c`、`f50484a`、`ce8938e`；文档 `ab94984b3` |

### 已发布 npm（用户授权「该上传就上传」）
`contracts 0.1.48` · `ui 0.2.66` · `plugin-sdk 0.1.97` · `plugin-docs 0.1.81` · 全部已 `release:mark` 落账。
**插件仓**：`plugin.json` 仍 **1.2.1 未 bump**（攒棒 17）；主仓壳 **0.2.59 攒批**、未推。

### 用户仍在验的三处（接班先问结果）
1. 来源页悬停条长度（现 9 行：8 条＋「…还有 N 条」）
2. 来源页组头「N 个市场源 · 同一作者多个仓库自动合并」是否单行
3. 分屏/极窄时详情页正文（现 <700 容器隐右栏）

---

## 二、四条范式（本轮立，新面照抄）

写在 `src/styles/store/store-shell.css` 头注，摘要：

1. **分栏网格给地板**：`minmax(240px, Xfr)`，⛔ 裸 `1fr`（CJK 的 min-content＝1 个字，窄了必一字一行）；
2. **窄容器用容器查询切单列**：`@container (max-width: …)`，按**容器实宽**判定（分屏组/右侧开面板同样生效，⛔ 靠窗口宽）；容器＝壳的 `.ldk-tab-content`（2026-11-21 起常挂 `container-type: inline-size`，单面板/分屏同源）；市场仓门禁 `responsiveByContainer.test.ts`（出现 `@media(max-width` 即红）；告示条另有宿主兜底 `role=status/alert` 文本 8em 地板＋换行；
3. **文本块 `min-width:0` ＋ 行数上限或单行省略**；按钮文案 `nowrap+ellipsis`、按钮 `max-width:100%`；
4. **横滚保留拖动**：只用 `::-webkit-scrollbar*` 定制 6px 圆头主题条；⛔ 删条（后面内容点不到）、⛔ 原生条、⛔ 同时设 `scrollbar-width`（Chromium 121+ 会忽略 webkit 样式）。

还有一条跨轮的：**渐变铺贴几何**——`background` 简写会把 `background-origin` 重置回 `padding-box`，半透明边框下露 1px（先例 壳 `16b05ec57`）。渐变面一律长手 `backgroundImage` ＋ `backgroundOrigin:"border-box"`。

---

## 三、逐页机械普查（每轮修完必跑，⛔ 靠记忆）

```js
// 在池文档执行；把当前页容器压到 300px，扫「叶子文字宽 < 2.2 字」= 会竖排的
(function(){var p=document.querySelector(".marketplace-store-page")||document.querySelector(".marketplace-mpd-details-layout");
if(!p)return "no page";p.style.width="300px";
var bad=[];p.querySelectorAll("*").forEach(function(e){if(!e.textContent.trim()||e.children.length)return;
var cs=getComputedStyle(e);if(cs.display==="none"||cs.visibility==="hidden")return;
var r=e.getBoundingClientRect(),fs=parseFloat(cs.fontSize)||14;
if(r.width>0&&r.width<fs*2.2)bad.push((String(e.className)||e.tagName).slice(0,30)+"|"+e.textContent.trim().slice(0,8)+"|w="+Math.round(r.width)+"|ws="+cs.whiteSpace)});
p.style.width="";return JSON.stringify({n:bad.length,list:bad.slice(0,12)})})()
```
**判读**：`ws=nowrap` 的短标签（排序/免费/数字）可接受；**`ws=normal` 且宽 <2.2 字 = 必须修**。四页（首页/分类/库/来源/详情）都要扫。

---

## 四、本地真机环境（现成，⛔ 别删）

| 件 | 位置/命令 |
|---|---|
| 隔离实例 | `electron . --remote-debugging-port=9391 --user-data-dir="C:\Users\fengy\AppData\Local\Temp\linkdesk-accept" --proxy-server=127.0.0.1:7890 --proxy-bypass-list="127.0.0.1;localhost"`（需 `env -u ELECTRON_RUN_AS_NODE`） |
| Vite | `LINKDESK_USER_PLUGINS_HOME="C:/Users/fengy/AppData/Local/Temp/linkdesk-accept/plugins" npm run dev` |
| 目录供数 | `node "$LOCALAPPDATA/Temp/linkdesk-fixture/intercept.mjs"`（CDP Fetch 拦截，自动发现 pool target） |
| fixture | `%LOCALAPPDATA%\Temp\linkdesk-fixture`（10 源＋3 作者块＋25 条目＋空仓/裸件；覆盖清单见 §〇.3 与夹内 `FIXTURE.md`） |
| 🔴 拦截器重启纪律 | `intercept.mjs` 绑的是**启动时**的 pool target——**应用一重启（或崩溃重开）必须重启拦截器**，再在商店点「刷新内容」，否则只剩官方/已装目录（表现为「数据全没了」）。主题若被重置为 light：`window.linkdesk.theme.setRecipe("theme-aurora-glass.aurora-glass")` |
| 截图 | `bash "$LOCALAPPDATA/Temp/linkdesk-fixture/shot.sh" <名>` → `shots/` |
| 测试密钥对 | `%LOCALAPPDATA%\Temp\linkdesk-keys`（⛔ 不进仓） |

**换产物三连（F8 血泪）**：部署新 `dist` 后 → ① **重启 Vite**（transform 缓存会让旧 bundle 继续跑）→ ② `dev:driver call Network.clearBrowserCache --doc pool` → ③ `reload`。少一步就出现「改了没生效」。
**CSS 文件被截断过**（还原/sed 写坏）→ Vite 会缓存**空样式**（表现为标签栏裸成 block）→ `touch` 该文件再 reload。

---

## 五、待办与边界

### 待用户确认/待办
- 用户对三处（见 §一）的验收结果；
- **F25 圆角白边**：已按「渐变铺贴几何」修，待用户实机确认；
- 加源弹窗：**经用户裁决保留**（机制在壳已核，⛔ 别再迁）；
- 其它用户新报的问题：登记 16 号档 §二，按四条范式修，**每轮四页普查**。

### ⛔ 边界（用户明示 + 纪律）
1. **右键菜单的玻璃外观一律不动**（已按 git 历史还原到用户调好的版本）；机制可加；
2. 能用共享组件的**必须**用共享组件（橱窗判据）；自绘只限市场本体 UI 且必须过四条范式；
3. **不发版、不推**；npm 包按用户授权可发/发就走到端；
4. 不动正式环境（`%APPDATA%\linkdesk`）；隔离实例/主题插件为只读复制；
5. 不改 `TEMP\linkdesk-fixture` 以外的用户资产；⛔ 不碰 `E:\_testfiles`；
6. 每笔提交：市场仓 `verify`＋`vitest` 全绿；主仓动 `src/` 走 `npm run check`；类别前缀；
7. 与另一条外来轴（错误态与降级脸 UI 化）**别交叉**：它动 `src/pool/shared/fallback/`＋ErrorBoundary，动前需与调度台握手。
8. 🔴 **UI 共享边界（2026-11-21 用户拍板，全阶段有效）**：**语义与行为共享，编排与长相私有**——① 安装/卸载/许可/下载、菜单/下拉/对话框/Toast、主题与玻璃 = 壳共享件/能力，必须消费、⛔ 自造第二套；② 卡片形态/尺寸/悬停展开/分区与分类呈现 = **本插件私有**，⛔ 抽成 `@linkdesk/ui` 公共件（市场只是可替换 UI 面，换一个市场允许完全不同）。判据全文 = memory `ui-sharing-boundary-three-layers` ＋ CLAUDE.md 硬约束 28「共享边界」段。

### 已明确「不做/不做主」
- 棒 17 发版（三轴走到端）→ 调度台排；
- 错误态与降级脸设计轴 → 另一会话（用户直派，暂停中）；
- **计数药丸不改成实底**（2026-11-22 用户拍板）：三层语义色＝价格/状态实底 · 计数半透 · 警告描边；⛔ 别当「没归一化」再改。

---

## 六、给接班 AI 的第一小时

1. 读本单 → 16 号档 §二/§六 → 市场仓 `git log --oneline -6`；
2. 起环境（§四），跑一次四页普查（§三）确认基线；
3. 问用户三处验收结果（§一）；按反馈继续修；
4. 每轮：改→build→部署→重启 Vite→清缓存→reload→普查→截图→`verify`/`vitest`→单独一笔→更新 16 号档 §六。
