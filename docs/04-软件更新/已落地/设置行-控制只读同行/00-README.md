# 设置行 · 控制与只读同行（组合行声明）

> **状态：📋 待拍板（2026-10-03 立案）——⛔ 本夹零代码改动（主仓与设置仓一个字没动）。**
> 一句话：主题组能「一行三合一」**不是特例、更不是耦合**，是声明式机制的既有能力；真正缺的只有一块——`renderHint` **单选互斥**。补上它，「控制＋只读同行」就是**任何插件的任何键**都能声明的能力。

## 一、你令的原话（2026-10-03）

> 「如果使用壳的 ui 组件，那么是无法完成一行情况下显示只读和控制的，所以 app.storage.openCacheDir 和 app.storage.cacheDir 在设计 html 中是单独放的。」
> 「但是唯独主题组这个例外，它的很多东西是一起放的……app.surfaceRadius 它的控制组件是 slider，但是我相信我们已有的 slider 不出意外是没有后面 25px 这个提示语的吧？……不然就是写入设置单独这个插件的，这不符合我们万物皆可插件的理念。」
> 「主题组内的配置项怎么实现这样做的，我的猜想是和 E:\linkdesk-plugins\official\settings 这个插件有耦合了之类的。你要帮我想办法。」

## 二、取证：主题组那些行到底是谁拼的（2026-10-03 只读审计：设置仓 + 壳源）

行骨架 = 设置仓自己的 [`SettingRow`](https://e:/linkdesk-plugins/official/settings/src/views/SettingsView/SettingRow.tsx)（自壳迁入 E5.8#41.14，注释自证「@src/core 三依赖全消除」）：**label ＋ 来源徽标 ＋ uiHint 分发控件 ＋ 行尾生效值徽标 ＋ 齿轮 ＋ 色块**。逐键拆：

| 键 | 控件 | 一行上还有什么 | 机制出处（全部声明式） |
|:--|:--|:--|:--|
| `app.surfaceRadius` | `@linkdesk/ui` **Slider**（壳共享件） | 右侧「当前值＋**px**」 | uiHint `"slider"`（E5.8#50.9）＋ 宿主 schema 声明 **`unit`**（E5.8#77：「无 unit = 裸数值，第三方零侵入」）——**不是共享 Slider 自带**，是设置仓 `settings-slider-control` 包裹层渲染的声明值。⚠️ **滑杆件案接线后本格改口**：值标签下沉进组件本体（包裹层与 `sliderValueLabel.ts` 删除，[该案 D4/D6](../../已落地/滑杆件-Slider能力扩展/00-README.md)），「谁画的」＝共享 Slider，设置仓只把声明传下去（`unit={prop.unit ?? ""}`） |
| `app.glassTint` | 色块＋输入（uiHint `"color"`） | 来源徽标 ＋ 行尾**生效值徽标**（rgba 带色块） | 宿主 schema 声明 **`effectiveToken: "glass-tint"`**（`src/App/config/appearance.ts:293`，E5.8#155） |
| `app.backgroundImage` | **BackgroundImagePicker**（设置仓本地件：选图入库/清除） | **「来源：用户覆盖」徽标** ＋ 生效徽标 | uiHint `"image"`（E5.8#50.11）＋ 来源徽标（E5.8#87，**全键自动**，非主题组特权） |
| `app.fontFamily` | `@linkdesk/ui` **FontFamilySelect**（壳共享件） | 来源徽标 ＋ 生效徽标（字体栈截首族） | uiHint `"fontFamily"` ＋ `effectiveToken: "font-ui"`（`appearance.ts:430`） |
| `app.fontTone` | **FontToneControl**（设置仓本地件：三态＋Aa 预览） | — | uiHint `"fontTone"`（E5.8#91+#99） |

**「插件独立铁律」就写在设置仓代码注释里**（不是我们补充的）：
- `effectiveBadge.ts`：「**设置插件对 token 语义零知识**（插件独立铁律）……第三方键声明 effectiveToken 即得同能力，零壳改动」；
- `readonlyStatus.tsx`：「**通用能力：任何插件声明 `renderHint:'readonly'` + `statusCommand` 即得同款（无 AI 特权）**」。

## 三、七问七答

| # | 你的问 | 答 |
|:--:|:--|:--|
| **Q1** | 缓存目录那案画成两行，对吗？ | **对**。声明层 `renderHint` 单选互斥 ⇒ 一键只能一个控件（详见 §四）。且那案早已预埋「将来可并成一行」（其 [00 §一·📌](../../已落地/设置页-打开缓存目录/00-README.md) 与坑 2）——本案就是那个「将来」。 |
| **Q2.1** | slider 后面的「25px」哪来的？ | **不是共享 Slider 自带**（壳 Slider 只有轨道＋填充＋圆点）。是设置仓包裹层按宿主 schema 声明的 `unit` 渲染的值标签（E5.8#77）——声明式，零耦合，任何键声明 `uiHint:"slider"+unit` 即得。⏳ **待滑杆件案接线后升版**：值标签搬进共享 Slider 本体、包裹层删除，设置仓只剩「传声明」这一件事（结论不变：仍然零耦合）。 |
| **Q2.2–2.4** | glassTint / backgroundImage / fontFamily 同款？ | 同款（见 §二表）：`uiHint` 选控件 ＋ `effectiveToken` 声明生效徽标 ＋ 来源徽标全键自动。**没有一个键名出现在设置仓代码里**。 |
| **Q3** | 主题组组件都是壳共享件吗？ | **一半一半**：Slider / SegmentedRadio / FontFamilySelect / ColorPicker / ContextMenu / ReadOnlyText 是 `@linkdesk/ui` 壳共享件；BackgroundImagePicker / FontToneControl / AccentSourceControl / ReadOnlyStatus 是**设置仓本地件**（`renderControl/` 夹）。设置页本身是可替换插件——用共享件或自造件**都合规**，万物皆可插件自洽。 |
| **Q4** | ai.mcp.enabled 和 ai.mcp.status 怎么「连在一起」的？ | **没有配对机制**——`ai.mcp.status` 是一条通用只读行（`renderHint:"readonly"` + `statusCommand`，M4 AI#38.12），与 enabled 是**相邻两行**，看起来连着而已。它用的组件（ReadOnlyStatus）确实是新造的，但造出来就是通用能力，「无 AI 特权」。 |
| **Q5** | 控制项＋只读项一行，怎么搞定？ | **§四 方案 A**：把伴生声明正交化——不是给某个键开小灶，是把「一行多元素」变成**任何键的声明权**。 |
| **Q6** | 是不是和 settings 仓耦合了？ | **没有**。设置仓与主题仓零耦合、与宿主键名零耦合（键名一个字面量都不在设置仓出现，这是它的既有铁律）。你看到「唯独主题组特殊」，真实原因是**只有主题组把这些声明用满了**——能力是大家的，用不用在声明。 |
| **Q7** | 帮我想办法 | 就是本案：方案 A 一处声明层改动 ＋ 设置仓一处渲染改动（[01-方案与落点契约](01-方案与落点契约.md)）。 |

## 四、真缺口（全案只剩这一处）

- `ConfigurationRegistry.ts:40`：`renderHint?: string` **单值**；`renderControl.tsx` 的 readonly 分支放最前直接 return（「状态行不参与编辑任何形态」）⇒ **一键一控件**。
- 于是：「按钮＋只读」要两个键两行（缓存目录案）；「开关＋状态」要两行（ai.mcp 组）。
- **而控件层本来就放得下**——背景图行已经证明（按钮组＋徽标＋值同排）。缺的只是**声明层允许一键带伴生件**。

### §四·补 · 从滑杆件案接手的边缘（不是本案的缺口，是本案的作业）

- 🔴 **E1 · 同一行两个读数**——滑杆件案把值标签下沉进组件后，滑杆那行右侧会同时有：**组件值标签**（显示**配置值**，如 `25 px`）＋ **行尾生效值徽标**（`effectiveToken`，显示**生效 token** 的值）。玻璃不透明度这类键在覆盖/混搭态下两者可以不同 ⇒ 一行两个数字、含义不同，用户会读成矛盾。那案 [02 E1](../../已落地/滑杆件-Slider能力扩展/02-边缘情况清单.md) 明写「只记录不处置，归本案统筹」——**本案必须接住**。
- ✅ **已拍板（E1 互斥显示）**：跟随主题态＝生效徽标、自定义态＝值标签，永不同屏（规则正文在 [01 §1.2](01-方案与落点契约.md)）。原三选一备选作废——① 滑杆键在设置页不再显示行尾生效徽标；② 值标签与生效徽标二选一（按键声明）；③ 两个都留但加区分（文案/图标）。⛔ 不许把组件值标签改小改淡来「避开」（那案 E1 已禁）。
- **顺带**：伴生只读放同排后，一行右侧可能**三件并存**（值标签＋伴生只读＋生效徽标）——宽度预算（360px 列实测）见 [滑杆件案 00 §四·4.3](../../已落地/滑杆件-Slider能力扩展/00-README.md)。

## 五、方向（详见 [01](01-方案与落点契约.md)）

| 案 | 一句话 | 取舍 |
|:--:|:--|:--|
| **A 正交声明**（推荐） | `statusCommand`/`actionCommand` 升为**可与任何控件共存**的伴生声明；`renderHint:"readonly"/"action"` 退化为「主控件就是它」的简写 | 一处类型语义 ＋ 一处渲染布局；完全向后兼容；第三方声明即得 |
| B composite uiHint | 新 uiHint 让一键声明一组子控件 | 表达力强但破坏「一键一值」存储模型，缓存目录案「三概念分界」会乱 |
| C 维持两行 | 现状 | 零成本，但每遇「控制＋状态」都要两行，ai.mcp 组、缓存组继续特判排版 |

## 六、边界

- ⛔ **不新增配置键**（`openCacheDir`/`cacheDir` 已在缓存目录案声明）。
- ⛔ **设置仓不得出现任何具体键名字面量**（它的既有铁律，本案必须保持）。
- ⛔ **不动「一键一值」存储模型**——本案只动声明元数据与渲染层。
- ⛔ 本轮纯文档（布置任务）。

## 七、本夹文件

| 文件 | 回答什么 |
|:--|:--|
| [01-方案与落点契约.md](01-方案与落点契约.md) | 方案 A 契约 · B/C 不推荐理由 · 逐文件落点（壳＋设置仓）· 验收判据 |
| [04-任务清单.md](04-任务清单.md) | 决策点 D1–D4（📋 待拍板）＋ 三阶段 |
| [05-设计图-伴生同行预览.html](05-设计图-伴生同行预览.html) | 🎨 **拍板辅助预览**（D1–D4 未拍板先出图，按建议值 D1=A／D2=右侧同排／D4=迁移画拟定态）：AI 接入组 4 行→2 行、缓存目录 2→1（D3 联动）、外观模式＋⟲复位（候选拟·新提出）——「存量迁移 前/后」一键切、层归属标注、行数对账与三条不变量；05 名额本约定拍板后补，此格为预览稿、拍板后按定稿回改 |
| [06-盘查-设置插件可替换性与组件归属.md](06-盘查-设置插件可替换性与组件归属.md) | 🔎 **换一套设置插件会怎样**（机制早就在，`factoryRole` 一槽多套）· 控件/语义归属三判据（声明对等／词表正典／语义不住插件）· 逐件裁定（搬 vs 留）· **我另查出的六处**（静默降级 · 词表无正典 · `__none__` 字面量跨仓 · 键→行 1:1 · 换套无逃生舱 · 生效徽标非只读行）· 候选决策 **D5–D9** |
| 02 / 03 / 05 | 拍板后补齐（照本池既有节奏） |

## 八、拍板记录

**✅ 已拍板（2026-10-03 现场选择题 · 十项全按推荐）**：

| # | 问 | 定稿 |
|:--:|:--|:--|
| D1 | 机制 | **A 伴生声明正交化** |
| D2 | 伴生只读位置 | **主控件右侧同排** |
| D3 | 缓存目录联动 | **合并回一行** |
| D4 | ai 组存量迁移 | **迁**（status 键退役；迁移单＝[04 阶段 2.5](04-任务清单.md)） |
| E1 | 值标签 vs 生效徽标同屏 | **互斥显示**（跟随态＝徽标、自定义态＝值标签，永不同屏；规则正文＝[01 §1.2](01-方案与落点契约.md)） |
| 追加 | 外观模式并 ⟲复位 | **本轮不并**（action 行保留；预览图中该伴生钮仅示意） |
| 追加 | 合并行名字 | **主键名**（ai.mcp.enabled；键名当标题现状不变） |

> 🔎 **D5–D9 已拍板（2026-10-03 第二轮点单，全按建议值）**——另立〔设置控件-词表正典与共享化〕夹执行：[../设置控件-词表正典与共享化/00-README.md](../../已落地/设置控件-词表正典与共享化/00-README.md)；⛔ 它们**不阻塞也不替代** D1–D4，但其阶段 5 排在本案 2.2 之前（三案串行，见其 [04 §七](../../已落地/设置控件-词表正典与共享化/04-任务清单.md)）。

### 八·补 · 阶段 1 收尾（2026-10-04 · AI-6）

**① 三个读数（1.1 只读取证）**

| # | 读数 | 结论 |
|:--:|:--|:--|
| a | `renderControl.tsx` 两分支精确行号与互斥写法 | **readonly 分支在 :48–50 放最前直接 `return <ReadonlyControl/>`**；**action 分支嵌在 `switch(prop.type)` 的 `case "string"` 内 :193–202**（隐含要求：无 `uiHint` 命中）。⇒ 互斥是**结构位置**不是显式校验——改法 ＝ 两分支各收一个伴生件、在返回片段里排 `[主][伴]` |
| b | `packages/plugin-sdk` 是否导出 `ConfigurationProperty` | **不导出**（grep 0 命中）⇒ 2.1 的 schema 同步面 ＝ **四份 `plugin.schema.json` 逐字节拷贝**（`check-plugin-schema-sync` 守），**不是** TS 导出类型 |
| c | 是否牵动 `host-reserved` / i18n | **host-reserved：AI 组不牵动**（`configKeys` 只扫 `app.*`，AI 组是 `ai.*`）。**i18n：2.5 会牵动**（改壳侧中文串 ＝ 新 key ⇒ `audit-i18n --strict` 当场红 ⇒ 外仓 lang-defaults 补 patch 版 ＋ 出厂种子箱追新）。**D3 会牵动 host-reserved**：`app.storage.cacheDir` 在账的 `configKeys` 里，退役键**不腾位**（见下） |

**② 契约定稿（1.2）** ＝ [01 §1.2／§1.3](01-方案与落点契约.md)：主部件判定四级优先级（**readonly 仍最前**＝零回归）＋ 伴生件顺序 `[主控件][伴生按钮][伴生只读][生效徽标]` ＋ 伴生按钮文案沿用 `t(description)` ＋ **E1 定稿机制**（跟随态向 Slider 不传 `unit` 让位给生效徽标，信号复用 `useSettingRowBadges().effectiveBadge !== null`；今日零键命中）。

**③ D3 的退役账（动工前定死）**：`app.storage.cacheDir` 从设置页退役（**声明整格删**），宿主保留面账**保留该名不腾位**（老 `settings.json`／安装器播种仍可能留值；运行期 `electron/ipc/handlers/storage-handlers.ts:26` 仍读它解析生效路径）⇒ 三件同笔：㈠ `retired[]` 登记（`kind:"configKey"`，`approvedBy` ＝ **用户 · 2026-10-03**——D3 拍板日，⛔ 不由 AI 自签）；㈡ 生成器扫描源（`src/App/config/**`）里留一条**双引号字面量引文**（`configKeys` 扫描口径是「任意 `"app.*"` 字面量」，含注释）——这是「不腾位」的机械实现；㈢ `check-retired-ledger` 断言1（src/ 不许再有 `"app.storage.cacheDir": {` 声明点）＋ 断言2（`landing` 绑 `electron/ipc/handlers/storage-handlers.ts`，名字在该文件里 ✓）。

### 八·补2 · 阶段 2 落地（2026-10-04 · AI-6）

**① 右侧读数宽度实测（2.2b · 无头 Edge 真渲染）**

口径：主窗最低 **800px** ⇒ 表单内容宽 = 800 − 42 图标栏 − 200 导航 − 56 内边距 = **502px**；行内固定件 = 齿轮 24 ＋ gap 20。降级形态 = **标签截断**（…），⛔ 刻意不加 `flex-wrap`（要断也是说明文字断，不是整行撑破）。

| 例 | 控制区实宽 | 标签余 | 判定 |
|:--|--:|--:|:--|
| 按钮「打开缓存目录」104 ＋8＋ 只读 230 | 342 | 92 | ✅ 零溢出 |
| 开关 36 ＋8＋ 只读 136 | 180 | 254 | ✅ |
| 滑杆 130 ＋ 值标签 44 ＋8＋ 只读 136 | 318 | 116 | ✅ |
| 滑杆 130 ＋8＋ 只读 136 ＋ **生效徽标** 156（E1 三件并存） | 550 | — | ❌ 超 48px ⇒ **已加护栏**（有徽标时伴生件收到 120px ⇒ 396 ≤ 454 ✅；今日零键命中） |

⚠️ **已知限制（照实记）**：只读底座 `.ldk-readonly-text` 是 `overflow:hidden ＋ text-overflow:ellipsis` 且**不设 `title`** ⇒ 超宽读数被**静默截断**（实测一条 272px 的绝对路径在 230px 上限处截断）；⛔ 本格不改底座（加 title 属共享件改动，且 `@linkdesk/ui` 有在飞列车）。

**② 2.5 逐键盘点（D4 · 四并一留）**——判据 = **运行时读数形态**（实现见 `src/core/commands/shell/aiBridgeCommands.ts`）：

| 退役键 | 运行时实样 | 裁定 |
|:--|:--|:--|
| `ai.mcp.status` / `ai.cli.status` | 「运行中 · 127.0.0.1:9231」单行短句 | **并**进 `ai.mcp.enabled` / `ai.cli.enabled`（伴生只读） |
| `ai.debug.status` | 「已开启 · 9333」 | **并** |
| `ai.auditLog.status` | 「记录中」两字（原描述本就写「跟着上面的开关走」） | **并** |
| `ai.scope.summary` | 「读：…／做：…／不开放任意代码执行」**三行明细** | **留独立行**——合并的前置是「有一个主控件」，⛔ 不为它新增枚举键 |

- 描述改**双语义**（四开关 ＋「通道」组说明）：`…——右边灰字是实时状态（运行时读数）…`。选词理由：行说明是 `nowrap ＋ ellipsis`，**新语义必须落在可见头部** ⇒ 删掉「万能钥匙」等长尾巴、开门见山（原文仍在 lang-defaults 里留档）。
- 退役四键**无需 `retired[]` 登记**：ledger 的 `configKeys` 家族只扫 `app.*`，`ai.*` 不在其中 ⇒ 无插件占用风险（1.1 读数③ 的推论，本轮坐实）。
- **全仓普查结论：无事可做**（04 §2.5 ④⑥ 关格）——四个键名在壳／设置仓的**代码、测试、作者文档里零活引用**（只出现在历史 mockup 与本夹档案中）。

**③ 发版与出厂种子（2.3 ＋ i18n 链）**

- 设置仓 **1.0.29**（Release ＋ 仓根 marketplace ✓）：伴生件渲染 ＋ E1 值标签让位 ＋ 三件并存护栏；「未声明伴生的行外观行为一字不变」。
- lang-defaults **1.0.48**（Release ✓）：纯追加五条；**旧串与退役键的译名一律保留**——壳侧本轮不发版，已发布的旧壳仍按旧串取译名。
- 官方目录收录 **e4b419a**（`lang-defaults 1.0.45→1.0.48`、`settings 1.0.27→1.0.29`；**其余 16 行逐字节原样**，合并前已逐 id 对过）→ `sync:bundled --latest`（箱内 `lang-defaults 1.0.47→1.0.48`、`settings 1.0.27→1.0.29`）⇒ `audit-i18n --strict` ✅ ＋ `check-bundled-freshness` ✅。
- ⚠️ **顺手发现一处前置账不齐**（非本案引入，如实记）：收录前官方目录仍停在 `lang-defaults 1.0.45`／`settings 1.0.27`，而工作区未提交的账与箱已是 `lang-defaults 1.0.47`——**箱高于目录**（`--latest` 只读目录 ⇒ 只可能来自越级刷箱或手工改账）。本轮收录一次补齐并归零（目录 ＝ 箱 ＝ 账），1.0.46／1.0.47／1.0.28 亦随 `versions[]` 历史一并进目录。


### 八·补3 · 阶段 3 验收（2026-10-04 · AI-6 · dev 实机）

**方法（隔离实例，⛔ 没碰用户正在用的那只）**：用户那只 Vite 占着 1420 ⇒ 自起 **第二台 Vite 1421**，起前设 `LINKDESK_USER_PLUGINS_HOME=<隔离实例>/plugins`（`vite.config.ts:24` 允许清单的唯一口子）；隔离实例 `electron . --remote-debugging-port=9345 --user-data-dir=E:\tmp\ldk-a6-profile`。
🔴 **关键技巧（留给下一棒）**：`DEV_SERVER_URL` 在 `electron/constants.ts:23` 是**硬编码 1420、无 env 口**，而 1420 那台 Vite 的 `fs.allow` 不含隔离插件家（表现为 `Failed to fetch dynamically imported module … /@fs/E:/tmp/…/settings/index.bundle.js`，403）⇒ 用 CDP `Page.navigate` 把 **pool 目标导航到 1421**：主进程的插件扫描不变（仍扫 `{userData}/plugins`），渲染面走允许清单里那台 Vite。第三方假键用 `scripts/dev/fixtures/status-demo` 改一版（3 个新键：开关＋伴生只读／数值＋值标签＋伴生只读／字符串＋伴生按钮）放进隔离插件家，**夹具不进仓**。

**① 3.1 三例（实键实况读数）**

| 例 | 实测（DOM 读数） | 结论 |
|:--|:--|:--|
| ① 缓存目录一行 | `app.storage.openCacheDir` 控制区 ＝ `ldk-button + settings-row-companion`；伴生件内层 `ldk-readonly-text`，文案 ＝ **`E:\tmp\ldk-a6-profile`**（该实例真缓存目录）；同组**无** `app.storage.cacheDir` 行 | ✅ 一行（按钮＋路径读数），退役键在页面上消失 |
| ② ai.mcp 一行 | `ai.mcp.enabled` ＝ `ldk-toggle + settings-row-companion`，伴生读数「已关闭」；`ai.cli.enabled`「已关闭」；**`ai.debug.remoteDebugging` ＝「已开启 · 9345」**（＝该实例真 CDP 端口，证明读数来自运行时命令而非配置值）；`ai.auditLog.enabled`「未开启」。AI 接入组**共 14 行**、四个 `.status` 键全无 | ✅ 四组「开关＋状态」合并成四行；组说明＝「开关右边的灰字是实时读数（来自运行时命令），不是配置值」 |
| ③ 第三方假键 | 夹具 `demo-a6.toggle`（toggle＋伴生只读 122×13）、`demo-a6.sliderCompanion`（`ldk-number-input` ＋ 伴生只读）、`demo-a6.actionCompanion`（`ldk-input` ＋ 伴生**按钮** 230×29）。**同夹具里 `status-demo.live`（readonly 主件）与 `status-demo.poke`（action 主件）各只一件、零重复伴生** | ✅ 任何插件声明即得，无特权；主件本身即该件时不重复渲染 |

**② 3.2 零回归（每组抽键逐格＝现状）**：通用 `app.language`＝`ldk-selectbox`／`app.hint.enabled`＝`ldk-toggle`；主题 `app.theme`＝`ldk-theme-picker`（含「深色／2 配色」徽标）／`app.appearanceMode`＝selectbox；编辑器 26 行（含 `editor.fontSize`＝`ldk-number-input`）；资源管理器 18 行；插件市场 `marketplace.marketplaceSources`＝`ldk-sle`；设置插件 `settings.openForm`＝selectbox——**这些行都不带 `settings-row-companion`**，形制与声明前一致。

**③ 3.3 token 快照**：切主题（dark→light）前后——token **名集**只增不减（+11 枚 `--bg-*-solid`／`--bg-status`／`--drop-indicator`／`--received`，全部是**目标主题自己**定义的），值变 46 枚（全是主题驱动）；**行内定义的 token ＝ 0**（设置行内 3 处含 `var(` 的内联样式全在主题选择器的预览条上，与伴生件无关）；**伴生件节点零内联样式、零自定义属性** ⇒ 伴生声明不碰 token 面。

**④ 3.4 目视**：三张截图在 `E:\tmp\ldk-a6\shots\`（`通用-缓存一行-scrolled.png`／`AI接入-四组并一行.png`／`夹具-第三方伴生件.png`，1400×900 深色，真实例渲染）——**用户已目视**（并在 AI 接入组当场报出读数缺口 ⇒ 作 §八·补4 修掉）；⚠️ 截图与验收台（`E:\tmp\ldk-a6`）已按用户「清理中间垃圾」指示**即时清理**，读数与结论留在本表。
⚠️ 一处如实记的观察：伴生**按钮**文案 ＝ `t(description)` ⇒ 描述很长时按钮撑宽（夹具那条长描述的按钮实测 230px＋，右端出界）；官方各键描述都短，本轮**未处置**（要收窄得动 `description` 文案或共享件按钮）。

### 八·补4 · 用户目视当场抓到的一条：读数补「待重启」态（2026-10-04 · AI-6）

**用户实报（原话）**：「比如说 ai.mcp.enabled 这个，我明明关闭了按钮，为什么后面的文字仍旧是运行中」。

**先取证再定性**（三处独立读数，⛔ 没猜）：

| 证据 | 读数 | 说明 |
|:--|:--|:--|
| `%APPDATA%\linkdesk\ai-bridge.json` | `{"mode":"tcp","pid":13708,"enabled":true,"listening":true,"endpoint":"127.0.0.1:62021"}` | **启动那一刻开关是开的**，监听真在跑 |
| `settings.json` mtime | `03:03:26`（实例启动于 `02:55:03`） | 用户是**启动之后**才关的按钮 |
| 进程命令行 | `electron.exe . --remote-debugging-port=9222` | 普通 dev 启动，**不是** env 覆盖（用户级/机器级 `LINKDESK_AIBRIDGE` 都没设） |

⇒ **读数没说谎，是缺一句话。** `electron/services/aiBridge/index.ts:512` 的 `resolveBridgeConfig()` **只在启动时读一次** `settings.json`、之后无 watcher；`src/core/commands/shell/aiBridgeCommands.ts` 的 `channelStatus` 在 `info.listening` 分支**无条件报地址**，那句「重启生效」只写在描述里 ⇒ 关着的开关右边贴着「运行中」，看着就是 bug。旁证：`ai.debug.remoteDebugging` 同样已关，9333 端口**照样在听**（同一个 pid）。

**归本案**：D4 之前 `ai.mcp.status` 是独立一行，意图与实况隔着距离、不一致反而读得出信息；挪到开关右侧同排之后，这个缺口是本案造成的。

**修法**（用户当场拍板选「读数补待重启态」）：读数按「本行键 ＋ 兄弟键」拆三态——

1. 本行键开着 → 常态「运行中 · 地址」；
2. 本行键关着、**兄弟键开着** → 「运行中 · 与 CLI 通道共用」（监听是另一条通道撑着的，**重启也不会停** ⇒ 此时说「重启后关闭」就是假承诺）；
3. 两个都关着 → 「运行中 · 重启软件后关闭」（待重启关闭的残留）。

`statusDebug` 同理补同一态（端口在听、开关已关 ⇒「已开启 · 重启软件后关闭」）。后两种**不再报地址**：那种状态下地址即将失效，且短句才塞得进伴生只读的宽度上限（超宽静默截断 ＝ 2.2b 实测）；地址没丢——盘上 `ai-bridge.json` 有、`linkdeskctl status` 也报。`statusAuditLog` **不动**：它的读数是**配置值**不是运行时值（`getConfigurationValue("ai.auditLog.enabled")`）⇒ 与自己的开关永远一致，不存在这个矛盾。

**落仓与发版**：壳侧 `aiBridgeCommands.ts`（含 `ChannelPeer` 三态注释）**只落仓攒批**（⛔ 软件本体不发版）；外仓 lang-defaults **1.0.49**（四条：两条带 `{{}}` 的话术模板 ＋ `MCP 通道`/`CLI 通道`）已 publish → 官方目录收录 **a905aa3** → `sync:bundled --latest` 种子追新。

**顺带记一处别人的账（只记不改）**：官方目录候选里 **file-tree 同版元数据漂移**——file-tree 仓自己产出的 `1.0.18` / `1.0.19` 两条历史版本的 `changelog` 变成了 `null`，采纳会抹掉两条**已发布**的更新日志 ⇒ 本笔**原样保留目录现状**，归 file-tree 仓自查。


### 八·补5 · 归档与清场（2026-10-04 · AI-6 · 用户授权）

- **用户拍板**：2026-10-04「同意归档」。执行＝本夹 `git mv` 进 `已落地/` ＋ 池表划销 ＋ 跨夹引用逐处回填；`npm run check` 全绿后落仓。
- **回填面（17 处 / 7 文件）**：`docs/04-软件更新/00-README.md` 池表（4）· `施工总序.md`（5，其中 §一 全景表该行改「🟢 已落地」）· 滑杆件夹 3 文件（4）· 设置控件夹 2 文件（2）· 设置页-打开缓存目录（2）。全部**只改这一个路径串**（`待抉择池/…` → 依各引用文件自身深度重算的相对路径，如 `已落地/设置行-控制只读同行/` 与 `../设置行-控制只读同行/`），⛔ 未动别案正文。
- **清场**（用户指示「记得清理你中间产生的照片等垃圾」）：删 `E:\tmp\ldk-a6`（整夹 493KB：探针/截图脚本 15 件 ＋ `shots/` 4 张截图）＋ `scratch/` 内本案产物（`refs.txt`／`live-cat.json`／`catalog-merged.json`／`official-catalog.next.json`）。⚠️ 读数已入档（§八·补2／补3），截图不是证据本体。
- ⛔ `施工总序.md` 未提交（共享热文件，只打点）。
