# 插件仓自足与壳耦合清账（待抉择池）

> **来源**：2026-10-05 升级 `theme-iconset-pastel`（v1.0.6 → v1.1.0）时，为扩图标清单改了**壳仓**的 `scripts/convert-material-icons.mjs`。用户连问三问：
> ①「升级插件为什么要动壳？难道是插件和壳之间仍旧有耦合吗？」
> ②「其他人造一个图标插件呢？也要过来告诉我，让我写个脚本吗？」
> ③「其他插件有没有类似情况？我不想让这一堆已有的插件（未来可能兼职当作官方示例的插件）都做的不清不楚的。」
> 本档 = ①③ 的**全仓普查结论** ＋ ② 的**作者面自足性核查** ＋ 待拍板的清账项。
> **归属**：涉多仓（壳仓 / SDK 与脚手架 / 多只插件仓）＋ 软件主体交织 ⇒ 按 [00-README §二 归属规则](../../00-README.md) **进本池立整夹**（不拆 05；05 只放单只插件自身的更新）。
> **现状**：✅ **已落地（2026-10-06）**——2026-10-05 用户点单立案（原话「在 04 的待决策区建个任务，专门处理咱们说的任务，**你先建任务即可**」）⇒ 当时只建案；2026-10-06 用户要求「以选择题形式问我，我选择后你落入文档」⇒ **D1–D5 与排期全部落定**（见 §二／§六）；同日用户「**你直接开始做**」⇒ **D1–D5 全部执行完毕**，逐项实录与**三处偏差**见 **§七**。

## 一、普查结论（17 只官方插件，2026-10-05 实测）

### 1. 出仓依赖：**0 只** ✅

三个口径全查过：

- **manifest**：全部插件只依赖 registry 版本号（`@linkdesk/plugin-sdk` / `ui` / `contracts`），**零** `file:` / `link:` / 相对路径依赖；
- **代码**：无越界相对 import（扫出的 `../../..` 逐条核过，全在仓内）、无绝对路径、无跨仓 import；
- **配置**：无越界 `$schema`、无指向壳仓的路径。

⇒ 任何一只插件**只靠本仓 ＋ 公开 npm 就能构建、校验、发版**。

### 2. 「产物图纸住壳仓」：**只有 `theme-iconset-pastel` 一只** ⚠️

它那份 303 条图标清单**不是手写的**——由壳仓 `scripts/convert-material-icons.mjs` 从上游 material-icon-theme 生成，**选哪些图标**这件事住在那个脚本里 ⇒ 只改产物而不同笔改脚本，**下次谁重跑一次就被打回原样**。

- 它是 `seed: false`（不随包出厂）⇒ 连发版路径都不碰壳，壳仓只多一条「登记」记录；
- 其余 16 只的产物（主题配方 / 语言字典 / 代码）**都是本仓手写**，与壳仓无生成关系。

### 3. 壳仓往插件仓铺文件——是**设计**，不是失手 ✅

壳仓有两个机械同步器，**真相源都是脚手架模板** `packages/create-linkdesk-plugin/template/`：

| 脚本 | 铺什么 | 漂移门禁 |
|:--|:--|:--|
| `scripts/sync-plugin-ci.mjs` | `.github/workflows/ci.yml` ＋ `scripts/ci-verify.mjs`（有测试的仓另加 `vitest.config.ts` / `vitest.setup.ts`）＋ `package.json` 的 `verify` / `test` 条目 | 各仓 `npm run verify`；壳侧 `--check` |
| `scripts/sync-plugin-agents.mjs` | `AGENTS.md` ＋ `.vscode/settings.json`（只写共享骨架，每仓只填自己那段「事实」） | `--check` **已挂进壳仓 `npm run check`** |

- **为什么这么做**（脚本头自陈）：插件源码外移后**插件仓不在壳仓 `npm run check` 的扫描域里**，「模板改了、18 只没跟」这类漂移**没有任何门禁能发现** ⇒ 把「同源」变成机械动作，不靠自觉。
- 🔴 **关键**：第三方作者走的是 `create-linkdesk-plugin` 脚手架，**模板本身就是这些文件的真相源** ⇒ 他们既不需要壳仓，也不需要来问维护者；官方这 17 只只是「比脚手架换代更早的同形状历史工程」，用同步器补课。
- ⇒ 各仓里那些「壳仓」字样（每仓 7～15 处）**是注释与作者文档链接**（「为什么有这份文件」「别让两边分叉」「已知坑」），**不是依赖**；主题类插件不多不少都 7 处，正因为那 7 处都在同一份 `ci-verify.mjs` 模板里。

### 4. 真·耦合只有一处：**出厂种子账**（有意设计）✅

6 只 `seed: true`（`editor` / `file-tree` / `lang-defaults` / `marketplace` / `settings` / `theme-defaults`）的 zip **入库在壳仓** `bundled-plugins/`，由 `bundled-plugins.lock.json` 记账，两道门禁看着：

- `check-bundled-version-bump`——**内容纪律**：改了箱内 zip 内容就必须 bump 那只插件的 version；
- `check-bundled-freshness`——**新鲜度**：箱内种子必须 ≥ 官方目录该插件最新版；箱与账必须**恰好**一致（少一只 / 多一只都红）。

⇒ **升级这 6 只必须回壳仓刷箱子**（`npm run sync:bundled -- --latest`），但漏了会被 `npm run check` 拦。口径 = **硬约束 10「谁随包是数据不是代码」**——这是账，不是代码耦合。

### 5. 作者面自足性核查（答第 ② 问）✅

| 作者需要什么 | 在哪 | 是否公开 |
|:--|:--|:--|
| 映射格式契约 | `icon-theme.schema.json` | ✅ 随 `@linkdesk/plugin-sdk` 发 npm（实测 registry `latest` = **0.1.79**，包 `files` 含 `schemas`）＋ SDK 的 `validateIconThemeJson` 校验器 |
| 作者文档 | `packages/plugin-docs/docs/03-contributes-spec.md` §3.7 `contributes.iconThemes` | ✅ 随 `plugin-docs` 发 npm |
| 起手模板 | `packages/create-linkdesk-plugin/template/` | ⚠️ **无 `iconThemes` 范例**（模板是界面 / 命令插件骨架） |

⇒ 图标主题 = **一份 JSON 映射 ＋ 一堆 SVG 的图像资产形态**，**零脚本也能做完**（手写映射表即可）；那个 material 转换器只是「从 **material-icon-theme 这一个上游**批量导入」的一次性工具，换成 vscode-icons 或自己画的图，它一点忙都帮不上。
🔴 **没有任何作者文档让第三方去拿壳仓脚本**（`convert-material-icons` 在作者文档里**零命中**，只出现在内部外移层档案与插件仓自己的说明里）⇒ 「别人得来问维护者」这件事**今天不会发生**。

## 二、待拍板项（2026-10-06 已全部拍板，结果见 §六）

| # | 事项 | 选项 | 建议 |
|:--|:--|:--|:--|
| **D1** | pastel 的图标转换器搬到哪（消掉「图纸住壳仓」） | **A** 搬进插件仓 `scripts/`（最小，只消味道）／**B** 随 `@linkdesk/plugin-sdk` 发（`npx @linkdesk/plugin-sdk import-icon-theme <源> <插件目录>`，全世界作者可用）／**C** 不做，接受现状 | **B**（治本、顺带答第 ② 问）；A 可作过渡 |
| **D2** | 脚手架与作者文档是否补图标主题范例（治「没得抄」） | **A** 加进 `create-linkdesk-plugin/template/`／**B** 往 `03-contributes-spec.md` §3.7 塞一段**最小可跑示例 JSON**／**C** 不做 | **A＋B**（成本低，直接答「作者从零起步没得抄」） |
| **D3** | 要不要为「**插件仓自足**」立判据 ＋ 机械腿 | **A** 只写判据（文档纪律）／**B** 判据 ＋ 门禁腿（例：官方各仓不得出现**可解析的**指向壳仓的路径、`file:` / `link:` 依赖恒零、产物生成器必须在本仓）／**C** 不做 | **B**——本案的教训正是「没有门禁就会静默漂」，且判据物要**覆盖到机制**（不止写法） |
| **D4** | 两处失效 / 过期引用订正（极小） | ① `marketplace/src/services/installJobs.ts:7` 注释里指向壳仓的**失效 markdown 链接**（全 17 只里唯一一条代码内失效跨仓引用）／② `editor/vitest.config.ts` 那句「逐项对齐壳仓那份」（按 `sync-plugin-ci` 射程，该文件已由模板机械铺） | 都改 |
| **D5** | 顺带账 | pastel 在 `bundled-plugins.lock.json` 的登记仍是 `1.0.6`（`seed: false`、门禁不看它，**无影响**） | 下次 `npm run sync:bundled -- --latest` 自动平，⛔ 不为此单独发版 |

## 三、影响面（若全做）

- **壳仓**：`packages/plugin-sdk`（D1-B）／`packages/create-linkdesk-plugin`（D2-A）／`packages/plugin-docs`（D2-B）／`scripts/`（D1 迁出后的 `icons:convert` 入口与注释、D3 新门禁）／`docs/…/插件源码外移层/03-逐个迁移.md`（D1 落定后该行判定要同笔翻新）
- **插件仓**：`theme-iconset-pastel`（D1-A/B）／`marketplace`（D4①）／`editor`（D4②）
- **npm 轴**：`@linkdesk/plugin-sdk`（D1-B）／`plugin-docs`（D2-B）
- ⛔ **零运行期改动**：本案不碰壳**运行时**，只动开发工具、作者文档与门禁。

## 四、验收候选（D3 已拍板＝B：判据＋门禁腿 ⇒ 2026-10-06 定稿）

1. 任取一只官方插件仓，**清空 node_modules 后仅凭本仓 ＋ 公开 npm** 能跑通 `validate` / `verify` / `build`；
2. 转换器迁出后，`theme-iconset-pastel` 的 303 条清单**能在本仓（或 SDK 命令）重新生成**且与现产物一致；
3. D3 的门禁腿**负控**实测能红（人为插一条 `file:` 依赖 / 一条指向壳仓的可解析路径 ⇒ 判红）；
4. 两处失效引用订正后，仓内引用无不可解析项。

## 五、与在途任务「文件打开方式与贡献点」的关系（2026-10-05 并行性判定）

**结论：可并行，但四处热点必须错峰或合波；运行期零冲突。**

- **运行期零冲突**：本案 ⛔ 零运行期改动（只动开发工具 / 作者文档 / 门禁），对方动的是壳运行时 ＋ 插件，**代码面不互踩**。
- **对方自己的规矩就写着**（其 [交接.md](../../已落地/文件打开方式与贡献点/交接.md) §一）：「**⛔ 无跨轴并行**：并行只省钟表不省钱（两棒各跑各的 `check` 与发版，钱照花），拿不准就串行」——它按**心智轴**劈波，同一轴不并行。

| 热点 | 谁在用 | 本案动作 | 处置建议 |
|:--|:--|:--|:--|
| **`npm run check` 巨型单行链 ＋ `check-gate-health` 自测清单 ＋ 门禁矩阵** | 对方 **AI-5.5 阶段 9**（六条腿 R1–R6：`check-no-foreign-command-ids` / `check-host-capability-placement` / `check-menu-items-executable` / `check-duplicate-capability` / `check-shell-command-constants` / **R6 共享件零壳依赖**） | 本案 **D3**（新增「插件仓自足」门禁腿，同样要挂 check 链 ＋ 进 `check-gate-health` 认账） | 🔴 **最硬的一处**——`package.json` 的 check 是**一整行**，两笔各自插入必冲突。⇒ **D3 与 AI-5.5 合波**：共用一次认账与门禁矩阵翻新；且 **R6「共享件零壳依赖」与 D3 是同族尺子（层间依赖方向），建议并成一条腿**，别造两把量同一件事的尺 |
| **`@linkdesk/plugin-sdk`** | 对方发版线（0.1.75→0.1.79）＋ **R5「宿主命令常量对账」**（壳 `SHELL_COMMANDS.*` 与 SDK 同名常量逐字相等） | 本案 **D1-B**（往 SDK 加 `import-icon-theme` 命令） | 🟠 同一包两条发版线 ⇒ **与 AI-4.5 的 npm 发版窗口错峰**；R5 只看常量面，与新增命令面不冲突，但**同一 packument 两次 bump 会打架** |
| **`packages/plugin-docs/docs/03-contributes-spec.md`** | 对方 **AI-2 阶段 5 T5**（菜单贡献点作者篇）＋ **AI-4.5 契约/文档连锁**（contracts·sdk·ui·plugin-docs） | 本案 **D2-B**（§3.7 塞图标主题最小示例） | 🟠 **同一文件**——排到 AI-4.5 之后，顺路并入它的文档连锁那笔 |
| **插件仓 marketplace / editor ＋ 官方目录收录 ＋ `sync:bundled`** | 对方多波都在做发版收录（file-tree / settings / editor / marketplace / lang-defaults），且**有 raw CDN 缓存覆盖事故先例** | 本案 **D4**（marketplace 注释、editor 注释）＋ **D5**（出厂账刷新） | 🟡 D4 只动**注释**、D5 只动**账**，不碰对方在写的文件；但**官方目录收录与 `sync:bundled` 是全局串行资源——一次只许一棒在写** |

**可立即并行**（不碰任何热点）：**D1-A**（转换器搬进插件仓）· **D4**（两处注释订正）· **D5**（出厂账顺带刷新）。
**必须排队**：**D3**（与 AI-5.5 合波）· **D1-B / D2-B**（排在 AI-4.5 之后，错开发版线）。

> ⚠️ **在途状态的现实约束（2026-10-05）**：对方正在改 `contracts/linkdesk.d.ts`（新加 `title`）而两个 preload 文件尚未跟上 ⇒ **壳仓工作区 `npm run typecheck` 现为红**。本案任何要跑壳仓 `check` 链的动作（D3 自测、D1-B 发版前置）**在对方收口前都会被同一个红卡住**——不是本案的问题，但排期要算进去。

### 排期拍板（2026-10-06，含一次改判）

- 第一次裁定：**分轴并行**（即本节建议）；
- 🔴 **最终改判（同日，用户原话）**：「我在最终仍旧决定是让『文件打开方式与贡献点』任务完成后再执行你的任务，所以当任务 AI 执行时候，前面的任务已经完了，**无需顾虑**」⇒ **全排队**：本案**等对方全案收口后再开工**。
  ⤷ 连带的效力变化：本节上面那张热点表**降级为「开工时不必再顾虑的背景说明」**——对方收口后，同一行 `check` 链、同一 packument、官方目录收录**都不再有人同时在写**；但仍保留两条**开工时仍要看的**：① **D3 与对方 R6「共享件零壳依赖」同族 ⇒ 并入，不另造一把尺**；② 对方 R1–R6 已在 check 里 ⇒ D3 新腿要**与它并存的写法**（不是替换）。

## 六、拍板记录（2026-10-06，用户逐项选择题裁定）

> 形式：2026-10-06 用户指令「**你现在以选择题形式问我，我选择后你落入文档**」⇒ 本表即原始选择结果，六项**全部按建议值**。

| # | 事项 | **拍板** |
|:--|:--|:--|
| **D1** | pastel 的图标转换器搬到哪 | **B 随 `@linkdesk/plugin-sdk` 发**——做成 `npx @linkdesk/plugin-sdk import-icon-theme <源> <插件目录>`，治本且正面答「别人造图标插件要不要来找维护者」；⚠️ 代价＝一次 SDK 发版，而 SDK 正是在途 R5 的包 ⇒ 须与 AI-4.5 错峰 |
| **D2** | 补「抄得走」的图标主题范例 | **A＋B 都做**——① `create-linkdesk-plugin/template/` 加一份 iconThemes 骨架；② `03-contributes-spec.md` §3.7 加一段最小可跑示例 JSON |
| **D3** | 立「插件仓自足」判据＋机械腿 | **B 判据 ＋ 门禁腿**（须**负控实测能红**）；🔴 与在途 AI-5.5 的 **R6「共享件零壳依赖」同族 ⇒ 并成一条腿**，不造两把量同一件事的尺 |
| **D4** | 两处失效 / 过期引用 | **两处都改**——① `marketplace/src/services/installJobs.ts:7` 失效 markdown 链接；② `editor/vitest.config.ts` 那句「逐行对齐壳仓那份」 |
| **D5** | pastel 出厂账（登记仍是 1.0.6） | **顺手刷新**——改 `bundled-plugins.lock.json`；⛔ **不为此单独发版**（`seed:false`、门禁本就不看它） |
| **排期** | 与在途「文件打开方式与贡献点」的关系 | ~~分轴并行~~ ⇒ 🔴 **最终改判＝全排队**：等对方**全案收口后**再开工（用户 2026-10-06 原话「让『文件打开方式与贡献点』任务完成后再执行你的任务……前面的任务已经完了，**无需顾虑**」） |

### 开工顺序（🔴 前置＝对方全案收口，2026-10-06 改判后）

**前置条件**：等在途「文件打开方式与贡献点」**全案收口**（含 AI-4.5／AI-5／AI-5.5／AI-6）后再开工——届时其六条门禁腿 R1–R6 已在 `npm run check` 里、契约与 `03-contributes-spec.md` 的改动也已发版，**同一行 check 链与同一 packument 都不再有人同时写**。

> 🔴 **但"前置满足"≠"可立即开工"（2026-10-06 补）**：另一件待抉择案 **「插件最低壳版本门禁」**（[../插件最低壳版本门禁/00-README.md](../插件最低壳版本门禁/00-README.md)）**前置与本案完全相同** ⇒ 两者会在同一天起跑，并撞上**同一 packument**（其 G1/G2/G3 要随 SDK 发账本与 lint 改写）、**同一 `packages/create-linkdesk-plugin/template/` 目录**、**同一行 `npm run check` 链**。
> ⇒ **排定先后：门禁案先、本案后**。理由：门禁案会改**官方插件的 `minAppVersion` 声明**，而本案 **D4／D5 也动插件仓**（marketplace／editor 注释、出厂账）⇒ **本案后做可一次到位，不必把插件仓改两遍**。判定明细见其 [06 §七](../插件最低壳版本门禁/06-派工与交接.md)。
> ✅ **2026-10-06 前置已满足**：对方**已全案收口归档**（整夹迁入 [../已落地/文件打开方式与贡献点/](../../已落地/文件打开方式与贡献点/00-README.md)）⇒ 本案与门禁案的起跑线**同时打开**，先后照上条排定（🔴 **门禁案先、本案后**）。附带：本档 §五 记的「D3 要并入对方 R6」那条**对象已落地**（`scripts/check-shared-components-zero-shell-deps`）——开工时先复看它，同族则并入。

顺序（按依赖排，不再按热点错峰）：

1. **D1** 转换器迁出壳仓（先做——它是「产物图纸住壳仓」那句账的落点）；
2. **D2-A** 脚手架模板 ＋ **D2-B** 作者文档 §3.7（与 D1-B 同批最省事：范例正好演示新的 `npx … import-icon-theme`）；
3. **D1-B** 随 `@linkdesk/plugin-sdk` 发（含一次发版）；
4. **D3** 立判据 ＋ 门禁腿——⛔ 动手前先复看对方 AI-5.5 已落的 **R6「共享件零壳依赖」**：**同族则并入，不另造一把尺**；且新腿要与 R1–R6 在 `check` 里**并存**（不是替换），并同笔进 `check-gate-health` 认账；
5. **D4 ＋ D5** 两笔顺手账，随时可带。

> ⚠️ **D1 的两步形态**：拍板为 **B（随 SDK 发）**。若一步到位，转换器直接成为 SDK 里的 `import-icon-theme` 实现（插件仓只留一个调用样例）；若分两步，先把脚本搬进插件仓、再随 SDK 抽公用——**由开工时按 SDK 那笔的排期定**（B 落地后，A 形态即不再需要）。
> 🔵 **D5 的执行口径**：⛔ 不为它单独跑一次壳仓发版链；下次任何 `npm run sync:bundled -- --latest` 时自然平账（若届时仍为 1.0.6，同笔带上即可）。

---

## 七、执行实录（2026-10-06 落地）

> 开工口径：用户「**你直接开始做**」⇒ 按 §六 拍板逐项落地，⛔ 不再另立交接档。**D1–D5 全部执行完毕**，另记**三处与拍板原文的偏差**（§7.3 形态／§7.5 前提／§7.6 棒次）——三处都请维护者复核。

### 7.1 D1（B：随 SDK 发）✅

- 新命令 **`linkdesk-plugin-sdk import-icon-theme`**（`packages/plugin-sdk/src/import-icon-theme.ts` ＋ `import-icon-theme.test.ts` 10 例）随 **`@linkdesk/plugin-sdk` 0.1.84** 发公开 npm。
- 🔴 **壳仓那只一次性脚本已删**（`scripts/convert-material-icons.mjs`，249 行）＋ `icons:convert` npm 入口撤销；`sync-plugin-agents.mjs` 的输出模板同笔改指新机制（各插件仓 `AGENTS.md` 那两句由它生成，受 `--check` 管辖）。
- pastel 仓新增 **`icon-import.json`**——**这张清单就是「编辑决定」**（收哪些扩展名／文件名／文件夹名、两条改指 `overrides`、自绘资产白名单 `localIcons`）；转换器退化成**纯机制**（`--list` 读清单）。⇒ §一.2 那句「图纸住壳仓」消失。
- **✅ §四.2 验收（逐字节，实测）**：在 pastel 仓内就地重跑 `npm run icons:import -- <上游 dist/material-icons.json>` ⇒ 生成 **303 条**映射（extensions 185 ／ files 68 ／ folders 25 ／ foldersExpanded 25）＋ 拷 **179** 个 SVG（＋自绘 `uvprojx.svg` = 仓内 180）⇒ **`git status icons/` 空、`git diff --stat icons/` 空**——用 git 当逐字节比较器，**产物与现发货件一致**。
- pastel **1.1.1 已发**：Release `v1.1.1` ＋ asset ＋ 仓根 `marketplace.json`（远端独立提交已 pull 回）；README／CHANGELOG／AGENTS.md／`icon-import.json` 同笔入仓（提交 `ae96f8c`）。

### 7.2 D2（A＋B 都做）✅

- **A**：`packages/create-linkdesk-plugin/template/plugin.json` 加 `contributes.iconThemes` 骨架（作者起手就有得抄）。
- **B**：作者文档 §3.7 加**最小可跑示例**——`docs/03-plugin-authoring/03-contributes-spec.md` ＋ 其 zh 孪生 ＋ `packages/plugin-docs/docs/` 同源两份（⛔ 单一真相源，靠 `generate-plugin-docs` 对账）。
- 两处随 **`create-linkdesk-plugin` 0.1.24** ／ **`plugin-docs` 0.1.69** 发 npm。

### 7.3 D3（判据 ＋ 门禁腿）✅ —— 🔴 **偏差一：没有与 R6 并成一条腿**

- 新腿 **`scripts/check-plugin-repo-self-sufficiency.mjs`（R7「插件仓自足」）**，三条判据：
  ① **依赖声明只许公开来源**（`file:` / `link:` / `workspace:` / `portal:` / 相对 / 绝对 ⇒ 判红；registry 版本号 / `git+https` / `npm:` 别名 / tarball 直链 ⇒ 放行）；
  ② **仓内任何 JSON 里「可解析的」越界路径**判红 —— ⚠️ **解不开的不判**（干净检出不得假红，这条是负控 C 钉住的）；
  ③ **`scripts` 点到的文件必须在仓内且真的存在**，且分两档：**被执行的那个**（runner 之后第一个非 flag 的脚本路径 / 开头 `./x.mjs`）要「在内 ＋ 存在」；**其余路径状参数**只查越界（`--out reports/junit.json` 这种产物名本来就不存在 ⇒ 不许假红）。
- **自测 27 例**（含 3 条负控真红 ＋ 2 类**假红守门**），与 R1–R6 **并存**挂在 `npm run check` **同一行**（不是替换）＋ 同笔进 `check-gate-health` 认账（真跑，非 EXEMPT）。
- **实跑读数**（`E:/linkdesk-plugins`，17 只）：官方 **16 只零命中** ✅ ｜ 第 17 只（**第三方作者仓**）**只报告不判红**（硬约束 10：按现场数据发现、⛔ 不写名单、⛔ 不替人立账）。
- 🔴 **偏差说明（请复核）**：§六 拍板原话是「与 R6 同族 ⇒ **并成一条腿**，不造两把量同一件事的尺」。**实际做成独立一腿**，理由：**R6 扫的是壳仓源码**（`src/` 的共享件 barrel，纯仓内、CI 可跑）；**R7 扫的是仓库外的插件容器**（`E:/linkdesk-plugins`，`resolveContainer` 可覆盖）——并进 R6 会让 **R6 在拿不到该容器的机器 / CI 上不可运行**（等于用一条扫外部的腿去绑死一条本该纯仓内的腿）。
  ⇒ 取「**同一把尺、各自射程**」：两腿共用同一套口径库 **`scripts/lib/gate-scan.mjs`**（容器解析 / 例外台账 `applyExceptions` / 只报告不判红 / 第三方按数据认），**容器缺席时大声跳过**（⛔ 不静默放行）、并进 `check-gate-health` 的认账口径也同一套。**若维护者坚持并腿**，代价就是上面那条：R6 失去 CI 可跑性。

### 7.4 D4（两处都改）✅ —— ② 走的是**根治**，不是改一行字

- ① `marketplace/src/services/installJobs.ts` 那条**失效 markdown 跨仓链接** → 纯文本指路（与该仓既有散文先例同形）。已提交推送。
- ② `editor/vitest.config.ts` 那句「逐项对齐壳仓那份 / 改前先看壳仓那份」——**改在模板源头**：`packages/create-linkdesk-plugin/template/vitest.config.ts` 改为「🔴 **本文件是模板原件**：官方各仓这份由 `npm run sync:plugin-ci` 从模板**机械铺设**，⛔ 手改仓内那份会被下次同步覆盖（要改先改模板）；第三方是自建工程，按需自改」。
  ⤷ 随后 `sync:plugin-ci` 铺回 **5 只**（editor / file-tree / marketplace / serial-monitor / settings），`--check` 复验 **0 处**。
  ⤷ **为什么不在 editor 仓改一行**：该文件按 `sync-plugin-ci` 射程就是**模板产物**，只改仓内那份 ⇒ 下次同步被打回（这正是「模板是真相源」的直接推论）。
  ⤷ 五仓改动**已提交并推送**（serial-monitor 仓里那份 `package-lock.json` 脏是**别人的**，未动）。

### 7.5 D5（顺手账）⚠️ **偏差二：前提已过时，且本轮「无需写」**

- §二／§六 记的前提是「pastel 在账里仍是 `1.0.6`」——**实测账里已是 `1.1.0`**（登记早被后来某次 `--latest` 带上；`seed:false`、门禁本就不看它）。
- 本轮 `npm run sync:bundled -- --latest --dry-run`：**17 条全部「已是最新，指纹已核对」**，唯一一句提示 = `⚠ theme-iconset-pastel：插件仓已发 v1.1.1，官方目录还停在 1.1.0（收录是第二步）⇒ 箱子跟**目录**走（用户能装到的就是目录那版）`。
- ⇒ **D5 落到「口径已兑现」**：账本天然**跟官方目录走**，1.1.1 的平账**时点 = 收录之后的第一次 `--latest`**；⛔ 不为此专门跑壳仓发版链（照 §六 口径）。
- ✅ **净室验收（§四.1）**：pastel 仓 `rm -rf node_modules` ⇒ `npm install --registry=https://registry.npmjs.org` ⇒ `npm run verify`（九段，其中 lint / 跨插件 import / 测试覆盖三段**无对象**——纯数据插件）⇒ `npm run build`（110.6 KB / 189 条目）**全绿 exit 0** ⇒ 「只靠本仓 ＋ 公开 npm」**实测成立**（另一只带 `src/` 的仓归下一棒或门禁案，避免动别人正在用的仓）。

### 7.6 没做的一步：官方目录收录 ⛔（**偏差三：有意不做**）

- pastel 1.1.1 已在 GitHub Release 上可装（「添加市场源」填该仓 URL 即见），但**官方目录 `Encaron/linkdesk-marketplace` 仍是 1.1.0**。
- 候选**已生成**：`npm run catalog:official` ⇒ `scratch/official-catalog.next.json`。合并读数 = **新增 0 ／ 更新 1（`theme-iconset-pastel` 1.1.0→1.1.1）／ 同版改元数据 4（file-tree · lang-defaults · marketplace · serial-monitor）／ 别人的行原样保留 0**。
  ⤷ 那 4 条「同版改元数据」＝**另一棒（发版收录线）的落地差**（官方目录里这四条的元数据与各仓现状已不一致）。
- **不写它的两条理由**：
  1. 🔴 **§五／§六 自己写着**「**官方目录收录与 `sync:bundled` 是全局串行资源——一次只许一棒在写**」，而此刻该资源上**正有另一棒在飞**（上面那 4 条即是证据）；
  2. `sync-official-catalog.mjs` 的**设计就是「只生成、不推」**（脚本头：「写它要用户点头」）——它把「看一眼 diff」当成交接物。
- ⇒ **交接**：`scratch/official-catalog.next.json` 就是那份候选；它落进官方目录后跑一次 `npm run sync:bundled -- --latest`，pastel 的账自动平到 **1.1.1**（＝ D5 剩下的那半）。

### 7.7 §四 验收总表（逐条对着 §四 报）

| # | §四 判据 | 结果 |
|:--:|:--|:--|
| 1 | 官方插件仓**清空 `node_modules` 后仅凭本仓 ＋ 公开 npm** 能跑 `validate` / `verify` / `build` | ✅ **pastel 实测全绿**（净室：install → verify → build，exit 0，读数见 §7.5）；⚠️ pastel 是纯数据插件（三段无对象）⇒ 带 `src/` 的仓请下一棒补一只；**16 只全部**由 R7 **静态腿**覆盖（依赖声明／清单路径／脚本引用三条） |
| 2 | 303 条清单**能在本仓（或 SDK 命令）重新生成**且与现产物一致 | ✅ **逐字节一致**（就地重跑后 `git diff icons/` 为空——303 映射 ＋ 180 SVG） |
| 3 | D3 门禁腿**负控实测能红** | ✅ **自测 27 例**（负控真红：`file:` 依赖／越界可解析路径／脚本指出仓外／脚本指仓内不存在的文件；另两条**假红守门**：解不开的越界路径、`node -e "…"` 载荷）＋ 真跑官方 16 只零命中 |
| 4 | 两处失效引用订正后**仓内引用无不可解析项** | ✅ 两处都改（② 在模板根治并回铺 5 仓）；壳仓侧 `check-doc-links` 绿、pastel 侧 `npm run verify` 九段绿 |

### 7.8 收尾读数与**遗留**

- **npm 轴**：`@linkdesk/plugin-sdk` **0.1.84** ／ `create-linkdesk-plugin` **0.1.24** ／ `plugin-docs` **0.1.69** ／ `@linkdesk/ui` **0.2.47**（ui 进这批的唯一原因＝一处**注释里的路径漂移**（`待抉择池`→`已落地`），零运行期改动）——四包**已 publish 到公开 npm**；⛔ **`release:mark` 未落**（原子写，卡在「货架 `latest` 尚未复现新版本」的 3 分钟复制延迟上；等货架跟上再补跑一次即可，**不影响已发布的包**）。
- **插件轴**：pastel **1.1.1** 已 Release ＋ 推送；五仓 `vitest.config.ts` 注释口径已推送。
- **壳仓**：⛔ **未发版**（本案零运行期改动，照 2026-10-03 口径——壳攒批）；`R7` 已进 `npm run check`。
- **遗留（下一棒）**：① 官方目录收录 pastel 1.1.1（候选在 `scratch/`）→ ② 收录后 `npm run sync:bundled -- --latest` 平账 → ③ 补跑 `npm run release:mark`；④ D3 并腿与否请复核（§7.3）。

> **相关记忆**：`icon-theme-upgrade-pipeline`（图标主题升级流水线与坑，含本条耦合的来历与画法）。
> **相关档案**：`docs/02-Electron架构/插件生态与发布/插件源码外移层/03-逐个迁移.md`（`convert-material-icons` 当初被判定「保留」的那轮复核）。
