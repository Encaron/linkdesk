# 文件树插件 · 侧栏「搜索」section UI 重设计

> **状态：🚀 已实施＋已发版（2026-10-03）——file-tree **1.0.24**（案A 零件版全落＋筛选框补刀）：插件仓 `5598f83` 已推 · [GitHub Release v1.0.24](https://github.com/Encaron/linkdesk-plugin-file-tree/releases/tag/v1.0.24) · 官方目录已收录（3c3f682）· 出厂种子已刷新（`sync:bundled --latest`）。⏳ 实机验证等用户进软件「插件市场 → 检查更新」装上后走查；**验证无误后本档照 §一 规矩归还插件仓 `docs/`**（旧档若平铺，先建子夹归整再迁入）。壳仓零接触。**
> 病灶已定位到可核对的 file:line 证据；改案两案见 [05-设计图](05-设计图-搜索重设计.html) §③，决策点 D1–D4 摘在本文 §五。

## 一、你令的原话（2026-10-03）

> 「1. 这个应该放入 05-插件更新，这个你同意与否？ 2. 文件树插件在侧栏的第二个注册 section"搜索"，它的 ui 展示并不好——2.1 它是不是插件自己画的输入框之类的？没有使用软件共享组件？我看它不随着圆角之类的变化；2.2 使用 ui 引导、易用性非常差，举个例子，替换没有按钮边缘，看着不像按钮，反正很别扭。3. 其次，侧栏的控件本身就不宽。」

**追补原话（同日，看过第一版设计图后）**：

> 「设计可以再好一点，考虑设计边界……比如 fontSize 这个搜索框和下面一行替换的搜索框，我从你演示的 html 看到是贴在一起的。此外，你完全可以重新设计，从而适配侧栏，无论是美观、高度、宽度等。」

⇒ 由此追加了 **案R（重构版）**——把「修对现状」升级为「当成一个模块重新设计」，见 §四。

**第 1 问答复：同意，且有规矩背书。** [05-插件更新/00-README §五](../00-README.md)（2026-09-30 定）：**主仓里想到的、由主仓 AI 代工的插件侧升级点「一般先落本目录」**；收口 ＋ 发版 ＋ 官方目录收录之后，档案才归还插件仓 `docs/`（文件树的 `FT#` 旧档 2026-09-30 已归还过一轮，本件是新一轮的起点）。本夹就是它的第一站；将来照 §五 同法搬走。⛔ 不落 04-软件更新——那边管壳本体，本件落点全在插件仓。

## 二、那件东西在哪（2026-10-03 只读审计）

| 项 | 值 |
|:--|:--|
| 插件 | **文件树 file-tree**（core:true 随包，源码住 `E:\linkdesk-plugins\official\file-tree`，现 1.0.22） |
| 「搜索」section | `useViewRegistration.tsx:67` `registerView("file-tree","explorer",{ id:"search", order:1 })`——第二个注册（folders=0 / search=1 / open-folder=2） |
| 源文件 | [SearchInputRow.tsx](../../../../linkdesk-plugins/official/file-tree/src/views/SearchView/SearchInputRow.tsx)（输入框＋历史＋3 选项钮）· [ReplaceRow.tsx](../../../../linkdesk-plugins/official/file-tree/src/views/SearchView/ReplaceRow.tsx)（替换框＋全部替换钮）· [SearchView.css](../../../../linkdesk-plugins/official/file-tree/src/styles/SearchView.css)（172 行本地样式） |
| 共享零件就位却没用 | 插件 `package.json` **已依赖 `@linkdesk/ui` ^0.2.13**，同插件别处已在消费（`Menu.tsx` ContextMenu · `NameCell.tsx` InlineInput · `fileIconRuntime.ts` FileIconResolver）——**SearchView 一件没用**，input/button 全是裸元素＋本地 CSS |

## 三、病灶与根因（四条，逐条有证据）

| # | 症状 | 根因 | 证据 |
|:--:|:--|:--|:--|
| **①** | 「不随着圆角之类的变化」 | 圆角**硬编码死值**：input `4px`、按钮/历史/结果行 `3px`，全文件**零处** `var(--radius-*)` | SearchView.css:29,53,75,151,208,248 |
| **②** | 「替换没有按钮边缘，看着不像按钮」 | 替换钮与输入框**同底**（`--bg-card`）**同框**（`--border`）同圆角，**全文件没有它的 `:hover`/`:active` 规则**（disabled 只有 opacity .4）——静态看是一块灰、悬停无反应 | SearchView.css:67-82 |
| **③** | 选项钮（Aa/ab/.*）可点感弱 | `border: 1px solid transparent` 幽灵态，激活才有边框；与壳「双轨约定」（选什么用 ghost 分段、做什么用实心钮）没有对齐 | SearchView.css:45-63 · shared/button/Button.tsx:3 |
| **④** | 状态表达弱 | focus 只换边框色，无 `:focus-visible` 环（壳 `.ldk-input` 契约有：index.css:280）；高度三套（input 28 / replace 24 / option 22）不成体系 | SearchView.css:36-38,26,68,46 |

**第 3 问（宽度）的硬约束**：侧栏默认 **280px**、**最小 170px**、最大 600（panelCommands 缺省值）。搜索行 = `input(flex:1) ＋ 3 枚选项钮` 同行、替换行 = `input(flex:1) ＋「全部替换」按钮(nowrap)` 同行——170px 底线下 input 只剩约 90px，方案必须按 170 验收。

## 四、改案（两案＋两条布局改进，详见 [05-设计图](05-设计图-搜索重设计.html) §③④ 可交互对照）

| 案 | 一句话 | 改动面 |
|:--|:--|:--|
| **A · 零件版**（✅ **已拍，主案 2026-10-03**） | 「全部替换」换共享 `Button`（实心 accent——照双轨约定「做什么用实心钮」）；输入框本地重写但**契约对齐 `.ldk-input`**（`--radius-sm`/`--bg-input`/focus accent＋`:focus-visible` 环）；Aa/ab/.* 收进输入框**内部右端**（VS Code 同款，ghost＋active accent）；**行层级（本轮拍定）＝行距 4px→8px＋替换字段幽灵降级**（透明底、聚焦才现框——治「两框贴在一起」，保住常显结构不引入新交互）；结果行匹配高亮 | 只动 SearchView 三件 tsx＋css；`@linkdesk/ui` 依赖已在，**壳仓零改动** |
| B · token 对齐版 | 结构不动、不引零件，本地 CSS 全部改读 token＋补全 hover/active/focus 态 | 最小，但按钮形态与壳仍不同源（本地再画一遍实心钮） |
| **R · 搜索模块重构版**（留档，2026-10-03 追补） | 把 section 当**一个模块**设计：搜索框＝主角；替换行＝**收起式 toggle**（默认收起）；结果区门面（计数标头＋清除钮）；匹配行 hover＝accent 淡底＋左 2px 指示条 | **未整案采纳**——但其中两招被 A 吸收（8px 节奏＋幽灵降级），收起式与结果标头留档：将来侧栏高度告急或加「搜索选项面板」时再启 |
| 布局改进（两案共用） | ① 选项钮收进输入框内 ⇒ 省出 ~80px 还给输入框；② 结果行匹配文字高亮（accent 底 mark），扫读快一档 | 同上 |

## 五、待拍板决策点

| # | 问 | 结论（2026-10-03 全部拍定，均按建议值） |
|:--:|:--|:--|
| **主案** | A / B / R | ✅ **A 零件版**；R 留档（节奏＋降级两招被 A 吸收，收起式未采） |
| **行层级** | 「两框贴在一起」怎么解 | ✅ **8px 节奏＋替换字段幽灵降级**（常显、聚焦现框） |
| **D1** | 零件来源 | ✅ **输入框本地对齐 `.ldk-input` 契约，不新增壳零件**（按钮换共享 Button） |
| **D2** | 选项钮放哪 | ✅ **收进输入框内右端**（VS Code 同款，170px 底线友好） |
| **D3** | 「全部替换」钮形态 | ✅ **实心 accent**（共享 Button；禁用/替换中态照旧文字进度） |
| **D4** | 结果行匹配高亮 | ✅ **做**（纯 CSS mark 样式，零逻辑改动） |
| **D5** | 行高契约（28 vs 26） | ✅ **实施消解**：字段壳高度改**内容驱动**（竖 padding 4px 与 `.ldk-input` 同），与共享 Button 走同一条「字号＋竖 padding＋边框」自然高公式 ⇒ 同行天然等高，26/28 之争不再存在；`--ui-scale` 由字号 token 自带（原 28px 死值退休） |
| **D6** | 替换行收起式还是常显 | ✅ **常显＋幽灵降级**（收起式随 R 整案留档未采） |

## 六、边界（本轮明确不做）

**设计边界（案R 的约束面，先立后画）**：侧栏宽 **170–600px**（默认 280）——170px 是一切布局的验收底线；触点间距 **≥8px**；placeholder ⛔ 不当唯一标签（toggle/字段须有可读名称）；控件行高统一一档（28px×scale，D5 实机量定稿）；图标一律 SVG（示意稿的字形 ⌕ › ✕ 只作占位）；颜色/圆角/字号一律 token（`--radius-sm`/`--font-size-*`/`--ui-scale`），零硬编码。

- ⛔ **不动壳仓**（含 `@linkdesk/ui` 不加零件——D1 若翻案才例外，另立壳侧件）。
- ⛔ **不动搜索逻辑**（useSearch / useReplaceAll / searchCommands 等纯逻辑面零接触——本件只治 UI 展示与交互态）。
- ⛔ **不新增配置键**、不动 i18n 词条语义（文案沿用现有 `t()` key）。
- 高度契约（input 行 26 vs 28）~~落地前实机量一次再定稿~~ → **已按 D5 消解**（内容驱动等高，见 §五）。

## 六.5 实施读数（2026-10-03）

- **改动面**：插件仓 `src/views/SearchView/SearchInputRow.tsx`（字段壳包裹＋选项钮移入框内）· `ReplaceRow.tsx`（换共享 `Button`，幽灵字段壳）· `SearchResults.tsx`（`renderMatchText` 按 wire 契约 `matchStart/matchEnd` 切片套 `<mark>`——纯视图，零搜索逻辑）· `styles/SearchView.css`（token 化＋8px 节奏＋幽灵降级＋mark 样式＋历史下拉锚 `top: calc(100% + 4px)`）。
- **门禁**：`npx tsc --noEmit` 零错误 · `npm run verify` **八段全绿** · `vitest run` 16 文件 **149 例**全绿 · `npm run build` 4/4 表面 **45.9 KB**。
- **发版链**：插件仓 `6eeed79` 已推（代理）→ SDK publish `--yes`（LINKDESK_GITHUB_TOKEN=gh auth token）→ [Release v1.0.23](https://github.com/Encaron/linkdesk-plugin-file-tree/releases/tag/v1.0.23)（asset 46,983 字节）→ 官方目录收录 `323f569` 已推 → 壳仓 `sync:bundled --latest` 种子刷新（「出厂种子与账一致」）。
- **档案归宿**：实机验证无误后照 §一 归还插件仓 `docs/`（旧 `01`/`02` 两档若平铺，先建子夹归整再迁入本夹）。
- **补刀 1.0.24（同日）**：实机走查发现**筛选输入框（「要包含的文件」／「要排除的文件」）仍未接圆角**——病灶同源但当年不在证据清单（它们不是「写死圆角」而是**连 `border-radius` 声明都没有**，恒直角；`SearchToolbar.tsx` 也整只在「三件 tsx」授权面外）。修＝纯 CSS：`.file-tree-search-filter-input` 补 `var(--radius-sm)` ＋ 底色 `--bg-card`→`--bg-input` ＋ 聚焦 accent 边＋2px 焦点环（[1.0.24 Release](https://github.com/Encaron/linkdesk-plugin-file-tree/releases/tag/v1.0.24)，收录 `3c3f682`）。同文件「替换／折叠全部」小按钮复用 `.file-tree-search-option-btn`，1.0.23 已随选项钮 token 化。

## 七、本夹文件

| 文件 | 回答什么 |
|:--|:--|
| [05-设计图-搜索重设计.html](05-设计图-搜索重设计.html) | **局部图**：现状一比一复刻（主题/圆角/侧栏宽度三滑杆可拖，hover/focus 可真体验）· 病灶 CSS 证据注记 · 两案同台（170px 底线压力测试）· 决策点表 |
