# 主题极性归一化：`light/dark` 从“声明真相”降级为“作者提示”

> 2026-11-24 用户立案：接受**大改**，要求从根上做对，不做“先小改再补”。
> 状态：**🟢 已实施（Phase 1–6 全落地，于壳 0.2.61 攒批）**——极性派生、广播/快照、UI 标签、schema traits、编辑器 token 主题、高对比设置与官方/极光/整窗三套主题升级均已进代码；插件/npm 各轴已发并记基线；仅壳 **0.2.61** 待发版。
> 可交互稿：[polarity-preview.html](polarity-preview.html)（选主题 / 切对比度 / 看派生极性 / 看编辑器跟随）。

## 一、根因：一个二元枚举承担了三种职责

当前 `type: "light" | "dark"` 同时是：

1. **渲染真相**——`data-theme`、图标墨色/光晕、滚动条、快照首帧；
2. **UI 标签**——主题选择器的「亮色主题 / 暗色主题」、跨明暗配色警告；
3. **外部契约**——编辑器插件直接读 `data-theme` 决定 Monaco `vs` / `vs-dark`。

但主题已经演化出玻璃、tint、整窗图片、遮罩：**同一份 `type: light` 完全可能渲染出偏暗表面**；暗配方配亮色 colorway 也会“标签说暗、实际很亮”。实测证据：

- 壳内 `type/themeType/data-theme` 相关点 **58 处**；
- 契约 `LinkDeskThemeContribution.uiTheme` 已有 `"highContrast"` 第三值，但引擎只认 light/dark——枚举早被现实撑破；
- 编辑器 `theme-sync.ts` 与 `buildMonacoOptions.ts` 直接读 `data-theme === "dark"`，只能二选一；
- 2026-11-23 的「暗色主题 + 亮色配色」不协调，本质是 `type` 在替 token 说谎。

## 二、市场对照（2026-11）

| 系统 | 明暗模型 | 高对比 / 色觉 | 结论 |
|:--|:--|:--|:--|
| **VS Code** | `uiTheme: vs / vs-dark / hc-black / hc-light` | 高对比是**枚举值**，亮/暗各一 | 枚举扩张；编辑器契约需要它，但把“对比度”折进类型 |
| **GitHub** | Light / Dark / Dark dimmed | 2025-06 起**对比度与主题解耦**：任意主题可单独开“增加对比度”；另有 Light/Dark High Contrast、Colorblind 主题 | 明确走向正交：主题 × 对比度 |
| **Material 3** | Light / Dark scheme | 对比度是**用户可调的连续/三档**（standard / medium / high，-1…1），角色配对保证对比 | 对比度正交于明暗 |
| **Apple (iOS/macOS)** | Light / Dark | **Increase Contrast** 是独立辅助设置，亮/暗都可开；另有 Reduce Transparency | 正交，且明确要测四种组合 |
| **Windows** | 浅色 / 深色（Personalization） | **Contrast themes** 是另一套（Accessibility，约 7:1，强制颜色），激活时明暗模式不可用 | 对比度覆盖明暗，不是第三“明暗” |
| **Radix Colors** | Light / Dark 两套 ramp | `highContrast` 是组件/尺度选项（step 11 vs 12），两套 ramp 共用 step 语义 | 对比度是尺度属性，不是主题类型 |

**结论**：主流方向不是继续加 `type` 枚举，而是把三件事拆开——**外观（明暗极性）× 对比度 × 色觉**。VS Code 的 `uiTheme` 四值是历史包袱＋编辑器契约，不宜照抄为内部模型。

## 三、提案：三层模型

| 层 | 字段 | 角色 |
|:--|:--|:--|
| 作者声明 | `type: "light" \| "dark"`（可选） | **hint / 兜底**：token 解析不出时使用；不再决定渲染 |
| 引擎真相 | `polarity: "light" \| "dark"`（派生） | 由**生效 token** 的墨色 vs 表面亮度算出；`data-theme`、图标晕、快照、广播都用它 |
| 可访问性 | `traits: { contrast?: "standard" \| "high"; colorVision?: ... }` | 正交维度；高对比有亮/暗两版，色觉友好同理 |

**极性判据**（复用 `synthesizeIconGlow` 已有的墨色亮度逻辑，不写第二套）：
> `text-primary` 比 `bg-window-solid`（或 `bg-card-solid`）亮 ⇒ `dark`；反之 ⇒ `light`。

`bg-window-solid` 是去 alpha 后的合成基色，已经吸收了玻璃/tint 的影响；图片主题的极端亮部仍可能有偏差，但那是作者把墨色写反，属于数据审计问题，不让引擎猜图。

### 3.1 对比度落在哪一层？（不是每个主题各写一个配置键）

| 层 | 内容 | 谁维护 |
|:--|:--|:--|
| **用户层** | 设置 → 外观 → **对比度**：标准 / 高对比（全局设置，跟当前主题走） | 壳 |
| **作者层** | `colorway.traits.contrast = "standard" \| "high"`（可选）：主题为同一 polarity 提供一条高对比 colorway；官方主题提供亮/暗两条 | 主题作者（可选） |
| **引擎层** | 用户选高对比 ⇒ 优先匹配**同 polarity** 的 HC colorway；没有 ⇒ 从 base tokens **派生**安全高对比（推远 text/surface、强化 border/accent，材质/背景不动）；派生仍达不到 4.5:1 ⇒ 保持标准并提示 | 壳 |

**结论**：不是“每个主题插件新增一个高对比主题/配置键”，而是**每个主题都能被同一个用户设置要求高对比**。
作者提供专用色是加分项；不提供也不会让功能消失，只是用引擎派生版。这样高对比有亮/暗两版，也不会退化成第三 type。

## 四、连带改造（同一批做，不拆碎）

### 4.1 官方主题 / 内嵌兜底

- **内嵌兜底**（`public/themes/light|dark.json`）：只做与官方 normal 同步的舒适度校准，不引入高对比（它必须最小、永远能启动）。
- **官方主题**：保留中性基线，做一次舒适度校准（secondary/muted/border 的对比度），并新增**亮/暗两条高对比 colorway**（`traits.contrast = "high"`）。高对比不是第三只主题插件，而是同一主题的两条 colorway。

### 4.2 极光玻璃

- 先定**可读性下限**：文字密集面用显式 `surface-reading` / `surface-reading-strong`（建议 0.66 / 0.78 起步），在极光最亮区域实测正文对比。
- 再用 `tintOpacity` 把玻璃厚度与表面 alpha 解耦：表面保持 0.55，tint 提到 0.25–0.3。
- 最后才做第二套配色（冷青或暖霞），两套共用同一可读性策略。

### 4.3 整窗主视觉

- `mask` 0.2–0.25 ＋ `maskColor` 深海军蓝（不要纯黑），先解决“字压照片亮部”。
- 显式 `surface-reading` / `surface-reading-strong`（0.55–0.62 / 0.68–0.75），压图墨色保持亮墨。
- 第二套配色「冷月银」；照片不动，只改强调色与文字冷暖。

## 五、实施顺序（大改，但分阶段可验收）

1. **引擎**：`resolvePolarity(tokens)` 纯函数；`commitTokens` / 快照 / `data-theme` 改用派生值；`theme:changed` 带 `polarity`。
2. **广播与快照**：`preload-pool` 从 `polarity` 写 `data-theme`；快照升版本，首帧不闪。
3. **UI**：主题选择器分组/标签、跨明暗警告、`DynamicSelect` 括号标签，全部改读派生 polarity。
4. **契约**：`type` 可选 + deprecated hint；`uiTheme: "highContrast"` 弃用；`traits` 加进 theme schema（可选、只加不删）。
5. **编辑器**：先切到 `polarity`（壳广播正确后它自动正确）；再做完整版——用 `theme:changed` 的 tokens 生成 Monaco 主题（背景/前景/行高亮/选区/token 色），内容区保持不透明近似，不承诺真透明。
6. **主题数据**：官方/内嵌/极光/整窗按 §四升级，与引擎同一批发。

## 六、验收

- 矩阵：普通亮/暗、玻璃、整窗、跨明暗 colorway、自定义 tint、高对比亮/暗——`data-theme` 与派生 polarity 一致。
- 图标晕、滚动条、选择器标签、编辑器主题四处跟随同一 polarity。
- 旧主题零改动可加载；旧快照丢弃重算。
- `traits` 未声明时行为与今天一致；声明 `contrast: high` 只影响选择器标签与主题数据，不改引擎算法。
- 作者文档（中英）写清：`type` 是 hint，不要拿它当渲染保证；高对比/色觉用 traits。

## 七、开放问题

1. `polarity` 是否进 `theme:changed` 正式契约（建议进；`themeType` 同值保留兼容）。
2. 主题选择器是否按 polarity 分组，还是平铺 + 徽标（建议平铺 + 徽标，避免“暗配方亮配色”被分到亮组仍显突兀）。
3. 编辑器完整版是否允许“半透明编辑器”（建议不允许正文透明，只允许外框/行号区；可读性优先）。
4. 色觉友好是否本期只留 traits + 徽标，不做自动色觉模拟（建议本期只留数据位）。

## 七之二、2026-11-24 二次实机：编辑器仍是原厂色 + 玻璃 solid 纯白

拿到「编辑器内容没变 / 右边那条灰更黑」的实机反馈后，用 CDP 抓运行中的 dev 实例（`127.0.0.1:9333`）取证，两个都是根因级问题，不是观感偏好：

| 现象 | 实测 | 根因 | 处置 |
|:--|:--|:--|:--|
| 编辑器配色不跟主题 | 池里 `.monaco-editor` 背景 `rgb(30,30,30)`、字 `rgb(212,212,212)`、滚动条 `rgba(121,121,121,0.4)`、生成样式 `.mtk1{#3b3b3b}` + 输入框 `#ffffff` —— 全是 Monaco 原厂 `vs/vs-dark` | 编辑器只读 DOM 自定义属性，插件视图挂载早于壳广播时读空 → 建不出主题就静默停在原厂色，且之后不再重试 | 编辑器 1.0.30：**以 `theme:changed` 载荷为准**（DOM 兜底）、订阅提前到 monaco 加载前、建不出重试 10×150ms、`onDidCreateEditor` 补应用 |
| 右边缘一条「更黑的灰」 | Monaco 滚动条滑块 = 原厂中性灰 `#79797966`，主题的 `scrollbar-thumb` 是 `rgba(255,184,92,0.30)` | 上一版只给背景/行号/选区上了色，Monaco 自带的滚动条/minimap/概览标尺/缩进线/括号/查找/诊断件没接 token | 编辑器 1.0.30：上述灰件全部 token 化（半透明保留 alpha）；底色改卡片面 `bg-card-solid → surface-reading → 窗口底` 并逐候选校验 4.5:1 |
| 暗色玻璃主题下补全框/悬浮框变白块 | 池里 `--bg-card-solid` = `--bg-input-solid` = `rgb(255,255,255)` | 引擎算 `*-solid` 只去 alpha：整窗主视觉的 `rgba(255,255,255,0.10)` 是**提亮叠层**，去 alpha 就成了纯白 | 壳 0.2.61：`compositeColor(color, backing)`——solid = 面色 alpha 压在锚面（窗口底）上；锚色自合成 = 原值，纯实色主题零变化 |

**判据沉淀**：① 插件侧取主题色一律「载荷优先、DOM 兜底」——视图挂载时机与广播时机没有保证；② 任何「消费者当实色用」的派生键（`*-solid`）必须是合成结果，去 alpha 只适用于「只看色相」的对比度判断；③ 第三方控件（Monaco）自带的中性灰必须逐个换成 token，漏一个就是一条脏灰。

## 八、参考

- VS Code Color Themes（`uiTheme`: vs / vs-dark / hc-black / hc-light）: <https://code.visualstudio.com/docs/customization/themes>
- GitHub theme settings（Light / Dark / Dimmed / High Contrast / Colorblind）: <https://docs.github.com/get-started/accessibility/managing-your-theme-settings>
- GitHub 2025-06「Control contrast for all GitHub themes」: <https://github.blog/changelog/2025-06-05-control-contrast-for-all-github-themes/>
- Material 3 color system（对比度三档）: <https://m3.material.io/styles/color/system/overview>
- Apple HIG Dark Mode（Increase Contrast / Reduce Transparency 正交）: <https://developer.apple.com/design/human-interface-guidelines/dark-mode>
- Windows contrast themes vs light/dark: <https://learn.microsoft.com/windows/accessibility/contrast-themes>

## 九、第 2 棒回执（2026-11-24 · 实测取证 + 修数据/引擎/资产）

### 9.1 用户报「唯独整窗主视觉字看不见」——取证结论

| 现象 | 实测 | 判定 |
|:--|:--|:--|
| 跟随主题下白字消失（串口日志/卡片） | 同 colorway 内：**窗框暗玻璃**（`bg-window rgba(10,14,20,.30)`）而 **卡片/输入框是白玻璃**（`bg-card rgba(255,255,255,.10)` / `bg-input .14`）+ 白字 | **主题数据 bug**（三套官方主题里唯一「暗主题 + 白提亮面」；极光 0.55 暗面 / 玫瑰窗亮面深字都自洽） |
| 跟随 ↔ 自定义「底色会变」 | 两条管线：自定义 `--bg-card = color-mix(rgb(35,38,44) 50%)`（合成实色再上玻璃）；跟随 = **作者原值 `rgba(255,255,255,.10)` 原样透传** | 引擎口子：玻璃未激活时不走内容面下限；且「切 follow 会丢弃 custom 覆盖」是既定设计（08 §7.3.5，不是 bug）——壁纸/玻璃 0.37 被丢，观感落差被白玻璃放大 |
| 市场 Hero 标题「黑字压黑图」 | `--surface-media-ink` = `#10161F`（暗）压在 `rgba(10,14,20,.82)` 暗遮罩上 | 派生逻辑反了：暗主题的 `text-on-accent` 常是暗色（金底黑字） |
| 串口插件详情页日志字几乎看不见 | 该处是封面资产 `resources/cover.svg`（**静态图**，非实时视图）：时间戳/RX/TX `#4d5b7d/#55638a` 压 `#0c161e` ≈ **2.6:1** | 资产对比度问题（与主题无关，任何主题都暗） |

### 9.2 落地（每笔独立提交）

| 层 | 内容 | 提交 |
|:--|:--|:--|
| 壳引擎 | ① **有底图 + 内容面（bg-card/bg-input）+ 作者 alpha < 0.55 ⇒ 按 `*-solid` 抵到下限**（实色/高于下限/无底图零变化；新增 `colorAlpha`）。② **压图墨色改按对遮罩的对比度取高者**（不再「暗遮罩→text-on-accent」）。单测 +4（ThemeEngine 300 绿） | `d0991f422`（electron，未发版） |
| 整窗主视觉 1.1.1 | 内容面改实色基 `#23262C`/`#2C3035`（与 `*-solid` 同值）；标题栏/状态栏/工具栏/图标栏/侧栏 0.30–0.50 → **0.66–0.72**；窗底 0.42；遮罩 0.22 → **0.35** | `745b020` · Release `v1.1.1` |
| 串口 1.0.41 | `cover.svg` 时间戳/RX/TX 提亮（`#93A5C9`/`#8FA0C4`，深底 ≈7:1） | `42ce129` · Release `v1.0.41` |
| 官方目录 | 整窗 1.1.1 + 串口 1.0.41 收录（以官方条目为底逐版回填，editor 1.0.30 未动） | `5ffd9ce` → `f8b258b` |
| 壳出厂账 | `bundled-plugins.lock.json` 追两版指纹 | `94019fa1a` |

### 9.3 验证读数（dev 实例 CDP 9333 · 整窗·月夜·跟随）

`--bg-card` `#23262C`（实色基）· `--bg-card-solid` `rgb(35,38,44)` · `--bg-input` `#2C3035` · `--bg-titlebar rgba(8,12,18,.72)` · `--bg-side-panel .70` · `--bg-mask 0.35` · `--surface-media-ink #FFFFFF`。市场 Hero 标题恢复白字；侧栏/设置页文字可读；Monaco 底仍 `#23262C`。

### 9.4 未做 / 判据沉淀

- **主题对比度机械门禁**（colorway 文字 vs 合成面，暗/亮两端各算）**未落**：正确落点是 `@linkdesk/plugin-sdk` 的 `validateThemeJson`（各主题仓 CI 跑 `npm run validate`），但需 SDK 发版 + 各主题仓升 dep 才生效；引擎运行时下限（9.2①）已兜住同类失效。建议单独一笔排期，⛔ 不要塞进本棒收尾。
- 判据新增：**带底图的主题，内容面必须是「实色基」或 alpha ≥0.55**；环境面（窗/栏）才允许随图透。暗主题写「白提亮卡片」= 白字压白玻璃。
- dev 实例注意：改 `src/` 触发 Vite HMR 会重置主题注册表（插件主题暂时只剩内置 dark/light）——**改完壳代码要整进程重启**再验主题，别把 HMR 假象当 bug。

## 十、第 2 棒续：三项债（2026-11-24 · 用户拍板「可以执行」）

### 10.1 高对比去重（①）

- 判定：`traits.contrast="high"` 的 colorway = **全局对比度开关的内部资源**，不是用户可挑的配色。
- 单写法 `userSelectableColorways(recipe)`：`theme.listRecipes()` 元数据、`app.themeColor` 可写 enum 一律只列普通配色（异常数据「整配方只有高对比」保底原样返回）。
- 高对比开关改真消费作者配色：`applyRecipe` 在 `contrastMode=high` 时取**同极性**作者高对比配色覆盖生效集（稀疏合并），没有才走 `applyHighContrast` 派生；用户选择的 colorway 不变。
- 存量「手动选了 High Contrast 配色」→ 补跑 `appearance-contrast-colorway-retire` 清回配方默认（幂等）。
- 🔴 顺带发现并修复：`parseThemeRecipe` **一直丢弃 `traits`** → 过滤与作者配色都拿不到。已随配色保留（单测 +1）。

### 10.2 跟随 ↔ 自定义保留覆盖（②，方向二 + 显式 Reset）

- 切 follow：13 覆盖 + 域来源 + 配色源先抄进 `customStash`（localStorage，纯 UX 快照；丢了只退化回播种），再按原样复位。
- 切 custom：**有用户改动 → 原样恢复**（上次调好的）；**没改动（种子原封）→ 按当前主题重新播种**（=「在跟随主题基础上微调」的起点）。
- 「有没有改动」的锚 = 抄存时冻结的主题基线（`getThemeBaseTokens`），切过主题不误判。
- 「以当前主题为起点」仍是一键：`theme.resetAppearance`（复位外观覆盖）。
- 实测：`custom(glass .37 + 壁纸)` → `follow(清空)` → `custom(.37 + 壁纸 全回来)`。

### 10.3 SDK 对比度门禁（③）

- `@linkdesk/plugin-sdk` **0.1.113**：`validateThemeJson` 增两条判据——
  ① 有背景图且**未声明 glass** ⇒ 内容面（`bg-card`/`bg-input`）必须实色或 alpha ≥ 0.55（整窗旧数据的类）；
  ② `text-primary` 对内容面**实色合成**（与引擎 `*-solid` 同口径）≥ 4.5:1、`text-muted` ≥ 3:1。
- 为什么 ② 不用「纯黑/纯白底图最差」：会误杀极光/玫瑰窗这类玻璃主题（任意用户亮壁纸本来就得靠玻璃不透明度兜，门禁管不到）——门禁只判**作者可控的实色关系**，底图风险由 ① 的实色基契约承担。
- 四套官方主题实跑：panorama / rose-window / aurora-glass / defaults **全 PASS**；旧版 panorama 数据（白 10% 卡片）**会被 ① 判红**。
- 作者文档 11（中英）补同一条契约 + 版本门槛。

### 10.4 提交

- 壳：`3c813b0d7`（去重 + stash）、`2fcb2bcbf`（traits + SDK 门禁 + 文档）、后续 `fix:` 笔（门禁口径修正）。
- npm：`@linkdesk/plugin-sdk` 0.1.112 → **0.1.113**（0.1.112 曾按「最坏底图」口径发布，已立即以 0.1.113 更正）。
- ⚠️ 各主题仓的 SDK 依赖仍是旧 lock——门禁在它们下次 `npm update @linkdesk/plugin-sdk` 后生效（官方四套今日实跑已全过，不阻塞）。


- Radix Colors（12-step scale，step 11/12 对比度）: <https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale>
## 十一、外观复位入口归位（2026-11-24 · 用户实机「按钮在最底下、默认置灰、点了没反应」）

**根因**：设置页只有 `app.mixReset`（「⟲ 全部复位为整体配方」→ `theme.resetMix`）——它只复位 3 个**域来源**，
不动外观覆盖；且 `MIX_RESET_DISABLED_WHEN` 让它在「来源全跟随」时默认置灰 ⇒ 用户第一次点必然哑火。
真正「清我的覆盖、回主题值」的动作（`theme.resetAppearance`）只存在命令面板，设置页没有入口。

**处置**：
- 新增动作行 `app.appearanceReset`「以当前主题为起点」→ 新命令 `theme.resetToTheme`：清 13 覆盖 + 域来源，
  按**主题基线**（`getThemeBaseTokens`，不是生效态）重新播种，**保持自定义**；无 `glass` 声明的主题不写玻璃键
  （避免「进自定义凭空开玻璃」）。行就贴在外观模式下方（`整体配方` 组）。
- `app.mixReset` 改名「复位分区来源」、归入 `整体配方` 组、说明写明「外观覆盖不动」——不再用「全部」二字。
- 词条：lang-defaults **1.0.69**（4 条，中英），已发版 / 目录收录 / 出厂账同步。
- dev 实测：`glass 0.37 / radius 20` → 执行 `theme.resetToTheme` → `0.5（主题默认）/ 0`，`appearanceMode` 仍 custom；
  两行动作行已进配置贡献面（title/renderHint/actionCommand 齐全）。

**遗留（未修，登记）**：custom 模式下**切主题**的重播种仍会写入玻璃键 → 无玻璃主题会被「凭空开玻璃」；
同 `resetToTheme` 的修法（无 glass 主题不写玻璃键）应推广到 `deriveReseedPlan`/`seedAppearanceOverrides`。
## 十二、复位入口二次修（2026-11-24 · 用户实机「按钮字太长、两行被图标主题隔开」）

- **根因**：settings 插件的 `ActionButton` 只取 `description` 当按钮文字 ⇒ 长说明全进了按钮；行下说明与按钮共用同一串，
  「短标签 + 长说明」无法同时成立。且两行动作按声明顺序被 `图标主题` 隔开。
- **处置**：`ActionButton` 改「`title` 优先、无 title 回退 `description`」（settings **1.0.49**）；行名下移到短标签
  （「重置为当前主题」「分区来源改回主题」），`description` 专做行下说明；`app.mixReset` 声明移到 `app.appearanceReset`
  之后 ⇒ 两行相邻、图标主题随后。词条 lang-defaults **1.0.70**。
- **同批收掉 §十一 遗留**：`seedAppearanceOverrides` / `reseedAppearanceOnThemeSwitch` 在活动主题无 `appearance.glass`
  时不写并摘除玻璃四键——切自定义/切主题不再凭空开启玻璃（单测同步）。
## 十三、外观模式行合并（2026-11-24 · 用户拍板方案 A）

- **形态**：外观模式行 = `[下拉 跟随主题/自定义] [伴生按钮 用主题样式重来] [齿轮]`。顶部不再有两行动作。
- **语义**：点「自定义」= 恢复上次（未改动则按主题播种）；点「用主题样式重来」= 清覆盖 + 按主题基线播种并**进入自定义**（跟随态点它 = 以主题样式进自定义）。齿轮菜单 = 同两个动作（`theme.resetToTheme` / `theme.resetMix`，壳注册 `settingItemGear` 菜单项、按 `settingKey == 'app.appearanceMode'` 门控）。
- **契约**：配置项新增 `actionLabel`（伴生按钮短标签，缺省回退 title → description）——否则按钮会借用行名「外观模式」。设置插件 **1.0.50**。
- **响应式**：枚举显示名改短标签（跟随主题/自定义），长说明留行描述；控制区从 ~480px 收窄到 ~250px，最小窗 800px 下不再溢出。
- **词条**：lang-defaults 1.0.71（用主题样式重来）/ 1.0.72（自定义）；已发版 / 目录收录 / 出厂账同步。
- **实测**：真实设置页出现 `[下拉][用主题样式重来][齿轮]`；齿轮菜单含「用主题样式重来 / 分区来源改回主题」；两行旧动作已消失。
