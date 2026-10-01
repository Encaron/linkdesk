/**
 * 运行时全表断言探针（E6#109m · 轮次 1.22 · 件 5）——**把量尺提进仓**。
 *
 * 出处（先读判据再读代码）：
 *   [22-收口总方案-跨方样式污染九件套.md](../../docs/02-Electron架构/插件生态与发布/01-插件独立构建/样式命名空间归一化/22-收口总方案-跨方样式污染九件套.md) §三.4 ＋ §八
 *   [24-任务-运行时全表断言探针.md](../../docs/02-Electron架构/插件生态与发布/01-插件独立构建/样式命名空间归一化/24-任务-运行时全表断言探针.md)
 *
 * ── 它回答什么问题（静态门禁回答不了的那个）──
 *   静态门禁只能证明「**我想到的规则没被违反**」；本探针回答「**规则之外还有没有别的东西在撞**」。
 *   做法：连上真跑的实例 → 把**池文档**与**渲染进程文档**的全部样式表 dump 下来 → 按「方」归属 →
 *   机械断言**四条轴上被两个以上方独立定义的名字 = 0**。
 *   ⇒ **互补关系**：门禁防「将来犯」，探针证「现在没犯」。⛔ 探针结论**不得**用来论证「可以不做静态门禁」。
 *
 * ── 四条轴（= 跨方污染的四个载体）──
 *   ① **类名**：每条 CSSStyleRule 的 `selectorText` 里的**独立定义**
 *   ② **`@keyframes` 名**：`CSSKeyframesRule.name`（第二个全局命名空间）
 *   ③ **CSS 自定义属性名**：规则体里 `--x:` 的**定义**（＋ 引擎写在 `documentElement.style` 上的
 *      inline 值——那是**宿主契约**，**单列**、不参与碰撞判定）
 *   ④ **顶层「非类名」选择器**：**无祖先**的元素/通配/属性/id/复合选择器的**形态**（件 7 的运行时镜像）
 *      —— 🔴 E6#109o-b（1.26）起**无锚形态**补齐：`doc:root` · `pseudo:::-webkit-scrollbar`（一族）·
 *      `pseudo:::before` / `pseudo:::after` · `pseudo-class::focus-visible`。**改前它们是「静默丢」**：
 *      `subjectOf()` 把「纯伪类/纯伪元素主体」剥成空串（`:root` / `::-webkit-scrollbar`，1.25 的 **F1**），
 *      CSSOM 又把 `*::before` 序列化成 `::before`、`*:focus-visible` 序列化成 `:focus-visible`
 *      （再丢 5 个站点，**F2**）⇒ 旧代码 `if (!sub) return null` 把两者**一起丢掉且没有任何计数器**。
 *      ⇒ 现在 `selectorShape()` 对「无主体」**改判形态**（不是丢弃），并单列 `anchorlessSites` 供
 *      「**静态 17 ＝ 运行时 17**」逐字对账（见下 `--compare-static`）。
 *
 * ── 碰撞定义与「方」──
 *   某个名字（或轴 ④ 的某个**形态**）被**两个或以上的「方」独立定义** ⇒ **报**。
 *   「方」= `host`（宿主）· `shared`（共享组件）· `codicon`（三方）· `plugin:<pluginId>`（每只插件）。
 *   ⚠️ 碰撞是**按文档**算的：池文档与渲染进程文档各有自己的 CSSOM，跨文档同名**不是**碰撞。
 *
 * ── 🔴 口径（与静态门禁同源——这是本系列最贵的纪律）──
 *   「独立定义」的判定**直接调 `scripts/lib/css-selectors.mjs` 的 `soleClassOf()`**
 *   ——**和 `check-css-namespace.mjs` 是同一个模块实例**（不是"照它的口径再写一遍"）。
 *   理由：本系列的真根因就是**尺子不止一把**（22 号档 §一 层 3）；若探针自带一套近似版，
 *   那「静态说干净、运行时说撞车」时**没人知道该信谁**。
 *   ⇒ 两把尺子的读数**应当逐字相等**；不等就是真发现，报出来（不等 ≠ 可以糊过去）。
 *
 * ── 判红分级（🔴 依据 22 号档 §10.3「宽容度模型」，不许自创；每处碰撞都带 `why` 供复核）──
 *   · **red**：碰撞**任一方是 `host` / `shared`** —— 软件自己的元素被别人的样式命中（`.badge` 案同形），
 *     「本仓可答 ＋ 有真害」两条都满足 ⇒ 判红。
 *   · **red**：非宿主方独立定义了 **`ldk-` 开头的类名 / 关键帧名、且该名字不属于共享组件域**
 *     —— 占用宿主命名空间（§10.3 判红第 ① 类；CLAUDE.md 硬约束 23 ②）。
 *   · **yellow**：碰撞**只发生在两只插件之间** —— 按 §10.3 的判红范围判据「能在一个仓里回答的判红；
 *     只有跨仓才能回答的给黄灯」⇒ **不许升格成红**（假红会让真红失效）。轴 ④ 里**带类名锚**的形态同理。
 *   · **info（`vendored-shared-css`）**：名字属于**共享组件域**（`src/components/shared/**` 里有静态定义）
 *     却在插件产物里定义 —— 那是 **`@linkdesk/ui` 不是 external ⇒ 每只插件 bundle 内联了一整份 UI 库 CSS**
 *     这个**已知结构性事实**，实测两侧声明块**逐字段等价**（只有小压缩的写法差：`150ms`↔`0.15s`）。
 *     ⇒ **逐条列名、不判红**（把它判红 = 用一个已知facts 制造假红）。🔑 插件**源码**里的 `ldk-` 借用
 *     由 **SDK 静态腿**判红（18 仓实测 0 违规）⇒ 两把尺子合起来无死角。
 *     ⚠️ 🔴 **本格刻意不做「规则体逐字比较」**：`150ms` ↔ `0.15s` 这类**等价写法**会被逐字比较判成"冲突"
 *     ⇒ 正是 §10.3 说的假红。⇒ 判据改用**命名空间归属**（结构问题用结构判据，不用文本比对）。
 *   · ⚠️ **token 轴 1.22 只报事实、1.24 起判级**：`--*` 的归属与作用域规则由 **1.23（件 6）定案**
 *     （**作用域才是命名空间**：文档级只有宿主契约块能写、其余必须挂自有命名空间的类之下、
 *     任何方不得定义 `ldk-*`），⇒ 本探针从 1.24（`E6#109n-b`）起出 **red / yellow ＋ 名单**
 *     （判定式调 `lib/css-selectors.mjs` 的 `judgeTokenScope()`——**与壳门禁判据⑨ 同一个函数**）。
 *     1.22 那条纪律仍然有效：**量尺不当立法者**——规则变，这里的判级跟着变；规则没定的轴仍然只报事实。
 *
 * ── 两层落地（🔴 别混成一层：只有一个"连上才跑"的脚本 = 判据的存活又被寄托在人工）──
 *   ① **纯分析层**（`analyzeDump()` 等导出）：吃「dump JSON」→ 出「跨方碰撞报告」。**能自测**
 *      （`--self-test`：正控绿 / 负控红 / 未归属红），**已接进 `npm run check`**，**不需要活软件**。
 *   ② **采集层**（CLI 主体）：连 CDP → dump → 调 ① → 打印/落 JSON。**⛔ 不进 `npm run check`**
 *      （check 必须能在没有软件实例的机器上跑）⇒ 另挂 `npm run audit:runtime-style`。
 *
 * ── 用法 ────────────────────────────────────────────────────────────────
 *   node scripts/runtime-style-audit.mjs --self-test                  # 判据自测（挂 check）
 *   node scripts/runtime-style-audit.mjs [--json [<路径>]] [--raw <路径>] [--cdp <url>] [--doc <子串>] [--compare-static]
 *   node scripts/runtime-style-audit.mjs --analyze <dump.json>        # 拿旧 dump 离线复算（写夹具/对账）
 *
 *   `--json`            落机器可读报告（默认 `scratch/runtime-style-audit.json`）
 *   `--raw`             同时落**原始 dump**（对账/写夹具用；报告里没有的事实都在这里）
 *   `--doc`             只采 URL 含该子串的文档（默认**全部** page 目标）
 *   `--compare-static`  追加一段**静态源 ↔ 运行时 对账**（类名/关键帧轴 ＋ 🔴 轴 ④ 无锚站点；
 *                       只覆盖仓内 host / shared 两个域）。三件事：
 *                        ① **域一致性**：探针 host 归属域 ＝ 门禁 `HOST_DOMAIN` ＝ 基线登记表 `domain.files`
 *                           （三处**逐字一致**；域不一致就是「尺子不止一把」）；
 *                        ② 每域「运行时独有」应为 0（类名/关键帧轴）；
 *                        ③ 🔴 **轴 ④ 静态无锚站点 ＝ 运行时无锚站点**（**1.26 最硬的一条验收**；
 *                           **按文档**对账——同一份 `src/index.css` 在壳窗口与池两个文档里各注入一次，
 *                           跨文档求和会得到 2 倍，那是**重复计数不是差异**）。
 *   `--prefix-audit`    追加**前缀审计表**：每方「非 `ldk-` 独立定义」的计数与名单
 *                       ——**改前/改后对账用的就是这张表**（「244＋52 → 0」「8 → 0」）。
 *   退出码：0 = 结论成立（零 red 碰撞 ＋ 零未归属 ＋ 方名册够真）／1 = 有碰撞或结论不成立／2 = 连不上实例
 *
 * ── 🔴 启动配方（**照抄这一节，不要自己发明**；实测于 2026-09-16／Windows）────────
 *   插件 CSS 只在**视图挂载**时注入 ⇒ **探针必须先有活视图**（见「覆盖不到」第 1 条）。
 *
 *   ```bash
 *   # ① 起 Vite（进程的 APPDATA 决定它的 /@fs 白名单——见坑 A）
 *   APPDATA='E:\linkdesk-rmt-appdata' ./node_modules/.bin/vite        # 或 npm run dev
 *   # ② 编译 electron 侧（1420 就绪后再起 electron）
 *   APPDATA='E:\linkdesk-rmt-appdata' ./node_modules/.bin/tsc -p electron/tsconfig.json
 *   APPDATA='E:\linkdesk-rmt-appdata' node scripts/electron-commonjs-fix.cjs
 *   # ③ 带 CDP ＋ 隔离 profile 起壳（--user-data-dir 必须与 APPDATA 同一盘位）
 *   APPDATA='E:\linkdesk-rmt-appdata' ./node_modules/.bin/electron . \
 *     --remote-debugging-port=9222 --user-data-dir='E:\linkdesk-rmt-appdata\linkdesk'
 *   # ④ 人工把要采的插件视图打开（设置 / 文件树 / 编辑器…）
 *   # ⑤ 采
 *   npm run audit:runtime-style -- --json scratch/runtime-style-audit.json --raw scratch/runtime-style-audit.raw.json
 *   ```
 *   ⚠️ **坑 A（本仓 dev 环境特有，踩过两次）**：池内插件视图的 bundle 走 Vite `/@fs/`，而
 *     `vite.config.ts` 的 `server.fs.allow` 只放行 `join(process.env.APPDATA, "linkdesk", "plugins")`
 *     ⇒ **Vite 进程与 electron 的 `--user-data-dir` 必须指向同一个盘位**（上面两处 `E:\linkdesk-rmt-appdata`
 *     就是这件事）。不一致 → 插件视图报 `Failed to fetch dynamically imported module`。
 *   ⚠️ **坑 B**：换 `APPDATA` 前**必须确认端口 1420 上的旧 vite 真死了**——旧 vite 没杀干净时，
 *     新 vite 只打印一行 `Port 1420 is already in use`，而 `curl localhost:1420` 仍 200（**看着像成功**）。
 *     验证：`netstat -ano | grep :1420` 看 PID，别只看日志。
 *   🔑 **对历史版本跑改前读数**：探针脚本与实例**解耦** ⇒ **用 HEAD 的探针脚本连那个版本的实例**即可
 *     （`git worktree` 拉旧提交 → 用**它自己的** APPDATA 起实例 → 用 HEAD 的脚本采）。
 *
 * ── 🔴 探针覆盖不到什么（**不许省**——量尺的诚实边界，1.20 报告要用）────────────
 *   1. **没挂载的插件视图**：插件 CSS 随视图挂载注入 ⇒ 没打开过的插件**一根样式表都采不到**。
 *      ⇒ 采集层把「插件方 < 2」判为**方名册不够真**（插件↔插件轴未被验证）⇒ **结论不成立**。
 *   2. **交互态命中**：`:hover` / `:focus` / `:active` / `:checked` 的跨方污染**要交互才触发**。
 *      探针只看**已落进 CSSOM 的规则**——规则看得见，**"此刻有没有真的命中"看不见**。
 *   3. **媒体 / 容器查询分支**：本探针 **dump 全量**（含当前未命中的分支），并在每条规则上记 `at`
 *      前置（`@media …`）供人读 ⇒ 「未命中分支里有一处撞车」**会被报出来**（有意偏严）。
 *   4. **运行时由数据拼出来的名字**（类名/属性名由字符串拼出）：探针只看**落到 DOM 里的结果**。
 *      — 静态可绕过、动态能看见，但**由数据拼出的**仍可能躲过断言。
 *   5. **CSS 嵌套（CSS Nesting）里的相对选择器**：`&` 形态的嵌套规则**按 scoped 处理**（不占名），
 *      与静态门禁的口径一致（`hasAncestor()` 对 `& .b` 判真）。
 *   6. **`!important` / 权重战**：探针能看见规则共存，**判不出「这是有意的还是手滑」**（意图不可机械化，
 *      见 22 号档 §3.6 末）。
 *   7. **打包态（`dist/`）的宿主×共享组件**：打包后宿主池 CSS 与共享组件 CSS **合并成一张 bundle**
 *      ⇒ 那两方在**同一张表**里无法分开归属。此时探针会把它标成**未归属**并显式要求**声明粒度**
 *      （见下）——**绝不静默当宿主**。要拆开请看 dev 态读数或静态门禁。
 *   8. **CORS 不可读的样式表**（`cssRules` 抛异常）：**看不见内容 = 结论不成立**（不静默跳过）。
 *   9. **`ldk-` 命名空间内部的语义归属**（哪个名字"本该"属谁）：探针只报「同名跨域」，不判语义。
 *  10. **非文档级（类限定）的 token 定义判不了 V4/V5**（E6#109n-b 新增）：运行时的作用域描述符
 *      只留**主体**（`class:.foo`）、**丢了祖先** ⇒ 重建 compound 会漏掉 `.我的根类 .ldk-x` 里的
 *      自有类 ⇒ **假红**。⇒ 类限定一律传 `compound: null`（**不判 ≠ 合规**，那两格由静态腿管）。
 *      同一处口径差：事实面按「任何 `[data-…]`」算文档级，比门禁（只认 `[data-theme…]`）**宽**
 *      ⇒ 判级一律**从 compound 原文重推**（`tokenScopeOf`），两边由构造一致。
 *   ⚠️ 本探针在 dev 态（逐文件注入、`data-vite-dev-id` 带绝对路径）能分开**宿主 / 共享组件 / codicon /
 *      每只插件**四方；这是它的**主用法**。
 *
 * ── 后续消费者 ──
 *   · **1.23（件 6 · token 轴）**：轴 ③ 就是它的现状读数（尤其"哪只插件在 document 级定义 token"）。
 *   · **1.25（件 7 · 选择器形态轴）**：轴 ④ 就是它的运行时镜像。
 *   · **1.26（件 7 落地）**：轴 ④ 的 F1/F2 已修 ＋ `--compare-static` 出「静态 = 运行时」读数；
 *     🔴 **从本格起每轮收尾跑一遍并记账**（32 号档 §九.2／§九.3）。
 *   · **1.20（系列收口）**：判据「探针终态零跨方碰撞」用它 ＋ 两条「逐字相等」证明（域一致 ＋ 轴 ④）。
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { ROOT } from "./runtime-style-audit/root.mjs";
import { analyzeDump } from "./runtime-style-audit/grading.mjs";
import { sharedDomainSeed, compareStatic, printPrefixAudit, printCompare } from "./runtime-style-audit/static-compare.mjs";
import { collect, printReport } from "./runtime-style-audit/cdp.mjs";
import { selfTest } from "./runtime-style-audit/selftest.mjs";

/**
 * ⚠️ **E6#0.6d 第一刀 · feature-folder**：本体 1565 行超 800 红线，按层拆成
 *   ① 纯分析层 `runtime-style-audit/grading.mjs`（判级 / 碰撞 / analyzeDump）
 *   ①b 静态↔运行时对账 `runtime-style-audit/static-compare.mjs`（含两个打印器）
 *   ② 自测 `runtime-style-audit/selftest.mjs`（原内联自测，判据一字未改）
 *   ③ 采集层 `runtime-style-audit/cdp.mjs`（CDP 连实例 → dump）
 * 本文件是**门面**——保留原路径 ⇒ `npm run audit:runtime-style`、`--analyze`、`--self-test` 全部调用点不动。
 * 下面几行转出 ① / ①b / ③ 的公开判据，维持本路径原有的 import 面（**路径级兼容**）。
 */
export { AXES, partyOf, PARTY_RULES, attributeSheet, selectorShape, scopeShape, DOC_LEVEL_CRITERION, isClassAnchoredShape } from "./runtime-style-audit/grading.mjs";
export { PROBE_HOST_DOMAIN } from "./runtime-style-audit/static-compare.mjs";
export { labelOf } from "./runtime-style-audit/cdp.mjs";

/* ════════════════════════════════════════════════════════════════════════
   ④ CLI 入口（采集 → 判 → 打印 / 落盘）
   ════════════════════════════════════════════════════════════════════════ */

const args = process.argv.slice(2);
/** 取选项值：`--x` 后跟非 `--` 参数则当值，否则视为布尔开关 */
const takeOpt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : true;
};

if (args.includes("--self-test")) selfTest();
if (args.includes("--analyze")) {
  const file = takeOpt("--analyze");
  if (typeof file !== "string") {
    console.error("用法：node scripts/runtime-style-audit.mjs --analyze <dump.json>");
    process.exit(2);
  }
  const report = analyzeDump(JSON.parse(readFileSync(resolve(file), "utf8")), { sharedDomainNames: sharedDomainSeed() });
  printReport(report);
  if (args.includes("--prefix-audit")) printPrefixAudit(report);
  if (args.includes("--compare-static")) printCompare(compareStatic(report));
  process.exit(report.ok ? 0 : 1);
}

const jsonOpt = takeOpt("--json");
const rawOpt = takeOpt("--raw");
const cdpOpt = takeOpt("--cdp");
const docOpt = takeOpt("--doc");
const wantCompare = args.includes("--compare-static");
if (typeof cdpOpt === "string") process.env.LINKDESK_CDP = cdpOpt;

const dump = await collect({ docFilter: typeof docOpt === "string" ? docOpt : undefined, rawPath: typeof rawOpt === "string" ? rawOpt : undefined });
const report = analyzeDump(dump, { sharedDomainNames: sharedDomainSeed() });
printReport(report);
if (args.includes("--prefix-audit")) printPrefixAudit(report);
let cmp = null;
if (wantCompare) {
  cmp = compareStatic(report);
  printCompare(cmp);
}

if (jsonOpt !== undefined) {
  const out = typeof jsonOpt === "string" ? jsonOpt : join(ROOT, "scratch", "runtime-style-audit.json");
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(resolve(out), JSON.stringify({ ...report, staticCompare: cmp }, null, 1), "utf8");
  console.log(`\n[探针] 报告已落盘：${out}`);
}
process.exit(report.ok ? 0 : 1);
