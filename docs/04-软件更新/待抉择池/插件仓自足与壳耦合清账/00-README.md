# 插件仓自足与壳耦合清账（待抉择池）

> **来源**：2026-10-05 升级 `theme-iconset-pastel`（v1.0.6 → v1.1.0）时，为扩图标清单改了**壳仓**的 `scripts/convert-material-icons.mjs`。用户连问三问：
> ①「升级插件为什么要动壳？难道是插件和壳之间仍旧有耦合吗？」
> ②「其他人造一个图标插件呢？也要过来告诉我，让我写个脚本吗？」
> ③「其他插件有没有类似情况？我不想让这一堆已有的插件（未来可能兼职当作官方示例的插件）都做的不清不楚的。」
> 本档 = ①③ 的**全仓普查结论** ＋ ② 的**作者面自足性核查** ＋ 待拍板的清账项。
> **归属**：涉多仓（壳仓 / SDK 与脚手架 / 多只插件仓）＋ 软件主体交织 ⇒ 按 [00-README §二 归属规则](../../00-README.md) **进本池立整夹**（不拆 05；05 只放单只插件自身的更新）。
> **现状**：📋 **待拍板（2026-10-05 立案）**——用户指令原话「在 04 的待决策区建个任务，专门处理咱们说的任务，**你先建任务即可**」⇒ 只建案，**未动工**。

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

## 二、待拍板项

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

## 四、验收候选（等 D3 拍板后定稿）

1. 任取一只官方插件仓，**清空 node_modules 后仅凭本仓 ＋ 公开 npm** 能跑通 `validate` / `verify` / `build`；
2. 转换器迁出后，`theme-iconset-pastel` 的 303 条清单**能在本仓（或 SDK 命令）重新生成**且与现产物一致；
3. D3 的门禁腿**负控**实测能红（人为插一条 `file:` 依赖 / 一条指向壳仓的可解析路径 ⇒ 判红）；
4. 两处失效引用订正后，仓内引用无不可解析项。

## 五、与在途任务「文件打开方式与贡献点」的关系（2026-10-05 并行性判定）

**结论：可并行，但四处热点必须错峰或合波；运行期零冲突。**

- **运行期零冲突**：本案 ⛔ 零运行期改动（只动开发工具 / 作者文档 / 门禁），对方动的是壳运行时 ＋ 插件，**代码面不互踩**。
- **对方自己的规矩就写着**（其 [交接.md](../文件打开方式与贡献点/交接.md) §一）：「**⛔ 无跨轴并行**：并行只省钟表不省钱（两棒各跑各的 `check` 与发版，钱照花），拿不准就串行」——它按**心智轴**劈波，同一轴不并行。

| 热点 | 谁在用 | 本案动作 | 处置建议 |
|:--|:--|:--|:--|
| **`npm run check` 巨型单行链 ＋ `check-gate-health` 自测清单 ＋ 门禁矩阵** | 对方 **AI-5.5 阶段 9**（六条腿 R1–R6：`check-no-foreign-command-ids` / `check-host-capability-placement` / `check-menu-items-executable` / `check-duplicate-capability` / `check-shell-command-constants` / **R6 共享件零壳依赖**） | 本案 **D3**（新增「插件仓自足」门禁腿，同样要挂 check 链 ＋ 进 `check-gate-health` 认账） | 🔴 **最硬的一处**——`package.json` 的 check 是**一整行**，两笔各自插入必冲突。⇒ **D3 与 AI-5.5 合波**：共用一次认账与门禁矩阵翻新；且 **R6「共享件零壳依赖」与 D3 是同族尺子（层间依赖方向），建议并成一条腿**，别造两把量同一件事的尺 |
| **`@linkdesk/plugin-sdk`** | 对方发版线（0.1.75→0.1.79）＋ **R5「宿主命令常量对账」**（壳 `SHELL_COMMANDS.*` 与 SDK 同名常量逐字相等） | 本案 **D1-B**（往 SDK 加 `import-icon-theme` 命令） | 🟠 同一包两条发版线 ⇒ **与 AI-4.5 的 npm 发版窗口错峰**；R5 只看常量面，与新增命令面不冲突，但**同一 packument 两次 bump 会打架** |
| **`packages/plugin-docs/docs/03-contributes-spec.md`** | 对方 **AI-2 阶段 5 T5**（菜单贡献点作者篇）＋ **AI-4.5 契约/文档连锁**（contracts·sdk·ui·plugin-docs） | 本案 **D2-B**（§3.7 塞图标主题最小示例） | 🟠 **同一文件**——排到 AI-4.5 之后，顺路并入它的文档连锁那笔 |
| **插件仓 marketplace / editor ＋ 官方目录收录 ＋ `sync:bundled`** | 对方多波都在做发版收录（file-tree / settings / editor / marketplace / lang-defaults），且**有 raw CDN 缓存覆盖事故先例** | 本案 **D4**（marketplace 注释、editor 注释）＋ **D5**（出厂账刷新） | 🟡 D4 只动**注释**、D5 只动**账**，不碰对方在写的文件；但**官方目录收录与 `sync:bundled` 是全局串行资源——一次只许一棒在写** |

**可立即并行**（不碰任何热点）：**D1-A**（转换器搬进插件仓）· **D4**（两处注释订正）· **D5**（出厂账顺带刷新）。
**必须排队**：**D3**（与 AI-5.5 合波）· **D1-B / D2-B**（排在 AI-4.5 之后，错开发版线）。

> ⚠️ **在途状态的现实约束（2026-10-05）**：对方正在改 `contracts/linkdesk.d.ts`（新加 `title`）而两个 preload 文件尚未跟上 ⇒ **壳仓工作区 `npm run typecheck` 现为红**。本案任何要跑壳仓 `check` 链的动作（D3 自测、D1-B 发版前置）**在对方收口前都会被同一个红卡住**——不是本案的问题，但排期要算进去。

---

> **相关记忆**：`icon-theme-upgrade-pipeline`（图标主题升级流水线与坑，含本条耦合的来历与画法）。
> **相关档案**：`docs/02-Electron架构/插件生态与发布/插件源码外移层/03-逐个迁移.md`（`convert-material-icons` 当初被判定「保留」的那轮复核）。
