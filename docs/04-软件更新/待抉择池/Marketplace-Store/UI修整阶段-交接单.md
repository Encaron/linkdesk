# UI 修整阶段 · 交接单（2026-11-21）

> **用途**：棒 16 验收之后，用户开始逐条做**实机 UI 反馈**，由执行 AI 连续修。本单是这一阶段的**唯一交接入口**——接班 AI 先读本单，再读 [16-真机问题登记与验收报告.md](./16-真机问题登记与验收报告.md) §二/§六（问题总账与各轮进展）。
> **阶段定位**：⛔ **不是棒 17（发版棒）**。本阶段只做「UI/交互修正 ＋ 归一化」，**不发版、不推**；攒批归棒 17。
> **上游**：16 号档（问题总账 F1–F25）· 13 §七硬闸 · 10 号档四条范式。
> 🔴 **交接状态**：本单由 `sess_18da1de4…`（棒 16 执行会话，上下文将满）立；**向总调度台 `sess_5089b35d…` 的回执请求发送失败**（`SendToSession` 三次 `proto.sessionNotFound`）——⛔ 未假报已发；**接班 AI 可直接按本单接手**，无需等待消息。
> 🔴 **调度台与人际（2026-11-22 最新）**：总调度台 = **`sess_f471a6eb-f1c5-4627-abd1-997d502dbbf8`**（⛔ 旧台 5089b35d / 99d7be02 / b6d92afe 均已退场）。**回执一律走文档**（本单 / 16 号档 / `交接.md`）——「执行 → 调度台」跨会话消息在本宿主实测不可达（新旧台同一错误），`SendToSession` 只试一次、如实记账、⛔ 重试。**AI 间消息开头必带标识行**：`【市场UI修整 · sess_e3f5086c-3944-4918-bbe9-c26d2154bc37】`（给用户回话不用）。**媒体丰富度设计轴**：另派（当前 ID 以 `调度台.md` §三 为准；与本单文件域不交叉，⛔ 不改同一批文件）。
> **接手入口（一句话）**：「读 `Marketplace-Store/UI修整阶段-交接单.md` 接手，做 UI 修整，不发版。」

---

## 〇、最新交接状态（2026-11-22 · 第 5 轮接班结束，上下文将满）

> 本节是**接班第一入口**；下面 §一–§六 是阶段早期的范式与环境，仍然有效，但**以本节为准**。

### 1. 现状（实读）

- **壳 0.2.59 攒批**（未发版；发版归棒 17）· **市场仓 `778cffe`** · 主仓最新（代码 `0240f8655` / 文档 `dc7860e4e`）。**全部未推送、未发版。**
- 作者轴 npm 已发（用户授权，已 `release:mark`）：`plugin-sdk 0.1.98` · `create-linkdesk-plugin 0.1.26` · `plugin-docs 0.1.82`；`@linkdesk/ui` 仍是 0.2.66（本轮未动）。
- 已修轮次（详见 16 号档 §六）：R1–R4（旧）＋ R5 面/轨道/槽位/库/排序/文案 ＋ F39 单面化 ＋ F40 声明式辉光 ＋ F41 榜单常显动作 ＋ F42 删 Strip 滚轮 ＋ F43 下拉排序 ＋ F44 开发者腔清理 ＋ F45 放大态尺寸/裁剪 ＋ F36/F37/F38 基底特异性/作者横排/标题 ＋ **F46 容器响应式**（壳 `.ldk-tab-content` 尺寸容器＋市场 11 处 `@container`＋门禁）＋ **F47 价格角标连环**（下方 3）。

### 2. F47 价格角标（最新一轮，用户待验收）

- **规则（用户拍板）**：价格是主信息，**⛔ 永不省略号**；只有分类/作者可省略；标题独占一行，不被价格挤。
- 实现：`statusTag` 付费态新增 `modelKey/amount`；`CornerTag` 支持 `stacked`（模型词/金额两行）；**小卡 stacked、网格单行**（宽度够）；hover 徽标行**过滤状态族**（角标是唯一状态出口，不再两份价格）；`rows2` 轨道上下余量 36→48、网格占位 96→108。
- 实测：常态标题 139px 完整、角标 57×32 在卡内；英文模拟 78×32 右距 18 不溢出；展开面 142px、轨道余量 19、徽标仅「社区」。
- 截图：`%TEMP%\linkdesk-fixture\shots\r10-rest.png`、`r10-open2.png`。
- ⏳ 用户可能觉得两行价格块（实底蓝）像按钮；若要更轻，改成「模型词浅色＋金额强调、去实底」即可，别动别的。

### 3. 环境（⚠️ 与旧 §四 不同）

- **隔离实例**：`electron . --remote-debugging-port=9391 --user-data-dir=%TEMP%\linkdesk-accept --proxy-server=127.0.0.1:7890 --proxy-bypass-list="127.0.0.1;localhost"`（需 `env -u ELECTRON_RUN_AS_NODE`）；Vite `1420` 带 `LINKDESK_USER_PLUGINS_HOME=%TEMP%\linkdesk-accept\plugins`。
- **夹具已被系统临时清理过一次**：旧的 500 条/四源/intercept/shot.sh **都没了**；已重建**最小夹具**：
  - `%TEMP%\linkdesk-fixture\marketplace.json`（10 条：编辑器/订阅件/付费件/主题 A–E/需新版/装包失败；4 合集：banner/strip/duo/grid）；
  - `%TEMP%\linkdesk-fixture\intercept.mjs`（CDP 拦截假源 `linkdesk-fixture/src-v2`，出 marketplace.json＋生成的图标/截图 SVG）；
  - 加源命令：`window.linkdesk.commands.executeCommand('marketplace.addSource',{url:'https://github.com/linkdesk-fixture/src-v2'})`。
  - 🔴 **应用一重启，拦截器必须重启**（它绑 pool target）；Vite 改动走三连（重启 Vite→清浏览器缓存→reload）。
- **主题族插件也被清掉了**（accept/plugins 只剩 marketplace/settings）⇒ 现在**浅色主题**。要恢复玻璃主题：用 SDK 构建 `official/theme-aurora-glass` 后只读复制进 accept/plugins（或从备份恢复）；**这轮未做，等用户决定**。
- 换产物三连、CSS 空缓存坑、`MSYS_NO_PATHCONV=1` 等仍见 §四/§六。

### 4. 接班第一小时

1. 读本单 §〇 → 16 号档 §二/§六 → `调度台.md`（当前调度台/设计轴 ID/信道注记）。
2. 起/验环境：`status` → 重启拦截器（若应用重启过）→ 打开商店，确认 **9 张小卡**在「靶场横滚」。
3. **先问用户**：这轮 F47 两行价格是否满意（尤其实底蓝块）；玻璃主题要不要恢复；然后按他指的下一处继续。
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
| fixture | `%LOCALAPPDATA%\Temp\linkdesk-fixture`（4 源＋作者块＋500 条目＋坏源） |
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
- 错误态与降级脸设计轴 → 另一会话（用户直派，暂停中）。

---

## 六、给接班 AI 的第一小时

1. 读本单 → 16 号档 §二/§六 → 市场仓 `git log --oneline -6`；
2. 起环境（§四），跑一次四页普查（§三）确认基线；
3. 问用户三处验收结果（§一）；按反馈继续修；
4. 每轮：改→build→部署→重启 Vite→清缓存→reload→普查→截图→`verify`/`vitest`→单独一笔→更新 16 号档 §六。
