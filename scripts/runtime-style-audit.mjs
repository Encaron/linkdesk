/**
 * 运行时全表断言探针（E6#109m · 轮次 1.22 · 件 5）——**把量尺提进仓**。
 *
 * 出处（先读判据再读代码）：
 *   [22-收口总方案-跨方样式污染九件套.md](../../docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/22-收口总方案-跨方样式污染九件套.md) §三.4 ＋ §八
 *   [24-任务-运行时全表断言探针.md](../../docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/24-任务-运行时全表断言探针.md)
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
 *   · ⚠️ **token 轴只报事实、不判红**：`--*` 的归属与作用域规则由 **1.23（件 6）定案**；
 *     本格是量尺、不是立法者（把没定案的规则写进探针 = 又一次「把正确寄托在一句话上」）。
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
 *   `--compare-static`  追加一段**静态源 ↔ 运行时 对账**（类名/关键帧轴；只覆盖仓内 host / shared 两个域）
 *                       ——它专门让「**域边界不一致**」自己浮出来（真实用例：`src/App.css` 在探针归属域内、
 *                       却不在门禁判据③ 域内 ⇒ 「宿主 100% 是 `ldk-`」这句话按门禁口径并不覆盖它）。
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
 *   ⚠️ 本探针在 dev 态（逐文件注入、`data-vite-dev-id` 带绝对路径）能分开**宿主 / 共享组件 / codicon /
 *      每只插件**四方；这是它的**主用法**。
 *
 * ── 后续消费者 ──
 *   · **1.23（件 6 · token 轴）**：轴 ③ 就是它的现状读数（尤其"哪只插件在 document 级定义 token"）。
 *   · **1.25（件 7 · 选择器形态轴）**：轴 ④ 就是它的运行时镜像。
 *   · **1.20（系列收口）**：判据「探针终态零跨方碰撞」用它；🔴 **从本格起每轮收尾跑一遍并记账**（§九.3）。
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { splitSelector, hasAncestor, subjectOf, soleClassOf, stripComments, bareClassDefinitions, keyframeDefinitions, SOLE_CLASS } from "./lib/css-selectors.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/* ════════════════════════════════════════════════════════════════════════
   ① 纯分析层——吃 dump JSON，出碰撞报告（可自测、可离线、进 check）
   ════════════════════════════════════════════════════════════════════════ */

export const AXES = ["class", "keyframes", "token", "selector-shape"];

/** 把一只插件记成一方 */
export const partyOf = (id) => `plugin:${id}`;

/**
 * 🔴 归属规则表（**声明式**：一条规则 = 一条正则 ＋ 一句「凭什么」）。
 * 顺序有意义：**先具体后一般**（`shared` / `codicon` / `index.css` 先于 `src/pool/`；插件目录先于 node_modules）。
 * 设计纪律：**归不出来一律报「未归属」**——表里**不许**出现 `.*` 兜底分支
 * （静默兜底 = 又一个错的启发式，正是本系列的病根；自测里有一条锚钉住这件事）。
 */
export const PARTY_RULES = [
  { re: /^linkdesk:\/\/([^/]+)\//i, party: (m) => partyOf(m[1]), why: "`linkdesk://<pluginId>/…` 协议 = 该插件（生产态插件视图产物）" },
  { re: /\/src\/components\/shared\//, party: () => "shared", why: "共享组件域 = `src/components/shared/**`（`@linkdesk/ui` 的单一真源）" },
  { re: /\/@vscode\/codicons\//, party: () => "codicon", why: "三方 codicon（本仓只消费它、从不独立定义）" },
  { re: /\/src\/[^/]+\.css$/, party: () => "host", why: "宿主入口层样式 = `src/*.css`（`src/index.css` 池入口 ＋ `src/App.css` 壳窗口入口）" },
  { re: /\/src\/pool\//, party: () => "host", why: "宿主池域 = `src/pool/**`" },
  { re: /[\\/]linkdesk-plugins[\\/](?:official|third-party)[\\/]([^\\/]+)[\\/]/, party: (m) => partyOf(m[1]), why: "本地插件容器 `linkdesk-plugins/{official,third-party}/<id>/`" },
  { re: /[\\/]plugins[\\/]([^\\/]+)[\\/]/, party: (m) => partyOf(m[1]), why: "`plugins/<id>/`——含壳内夹具与用户的 `userData/plugins/<id>/`" },
];

/** 归属一张样式表：→ `{ party, why, clue }`；`party = null` = **未归属**（结论不成立） */
export function attributeSheet(origin) {
  const clues = [];
  if (origin?.href) clues.push({ text: origin.href, from: "href" });
  if (origin?.devId) clues.push({ text: String(origin.devId).replace(/\\/g, "/"), from: "data-vite-dev-id" });
  if (origin?.tag === "LINK" && !origin?.href) clues.push({ text: "<link> 但无 href（运行时改写的样式表？）", from: "tag" });
  if (clues.length === 0) {
    return { party: null, why: "无 href、无 `data-vite-dev-id`（运行时注入的 `<style>`？）——**不许静默当宿主**", clue: null };
  }
  for (const clue of clues) {
    for (const rule of PARTY_RULES) {
      if (!rule.re.test(clue.text)) continue;
      const m = rule.re.exec(clue.text);
      return { party: rule.party(m), why: rule.why, clue: `${clue.from}: ${clue.text}` };
    }
  }
  return { party: null, why: "没有任何一条归属规则命中——**不许静默当宿主**（是新的加载形态？把它加进 PARTY_RULES 并写明理由）", clue: clues.map((c) => `${c.from}: ${c.text}`).join(" ｜ ") };
}

/** 轴 ④：顶层「非类名」选择器的**形态**（单类名主体 = 轴 ① 的地盘 ⇒ 这里回 `null`）。
 *  形态的取法（**有意偏保守**：宁可多报一种形态，也不把两种不同的东西并成一种）：
 *    · 纯形态给名字：`universal:*` · `id:root` · `attr:[data-theme="light"]` · `element:select`
 *    · **带限定符/复合的主体一律原样报**：`input[type="number"]` / `.a.b` / `div.x` ⇒ `other:<主体原文>`
 *      —— 因为「`input` 的样式」与「`input[type=number]` 的样式」是**两件不同的事**，
 *      并成一个 `element:input` 会制造假碰撞（假红会让真红失效，22 号档 §10.3）。
 *  ⚠️ CSSOM 会归一引号与空白 ⇒ 同一形态的不同写法在运行时是同一个字符串（不会漏报）。 */
export function selectorShape(compound) {
  const sub = subjectOf(compound);
  if (!sub) return null;
  if (SOLE_CLASS.test(sub)) return null;
  if (sub === "*") return "universal:*";
  let m;
  if ((m = /^#(-?[_a-zA-Z][\w-]*)$/.exec(sub))) return `id:${m[1]}`;
  if (/^\[[^\]]+\]$/.test(sub)) return `attr:${sub}`;
  if (/^-?[_a-zA-Z][\w-]*$/.test(sub)) return `element:${sub.toLowerCase()}`;
  return `other:${sub.replace(/\s+/g, "")}`;
}

/** token 轴的**作用域**描述符（⚠️ 与轴 ①/④ 的口径不同域：token 挂在什么选择器之下，
 *  所以要能表达 `:root` / `html` / `[data-theme]` / 选择器列表这些轴 ①④ 不认的形态）。 */
export function scopeShape(compound) {
  const raw = compound.trim();
  if (!raw) return "(空)";
  if (/^:root$/i.test(raw)) return "doc:root";
  if (/^html$/i.test(raw)) return "doc:html";
  if (/^body$/i.test(raw)) return "doc:body";
  if (raw === "*") return "doc:universal";
  const sub = subjectOf(raw); // 去伪类/伪元素
  if (SOLE_CLASS.test(sub)) return `class:${sub}`;
  let m;
  if ((m = /^#(-?[_a-zA-Z][\w-]*)$/.exec(sub))) return `id:${m[1]}`;
  if ((m = /^\[([^\]]+)\]$/.exec(sub))) return `attr:[${m[1]}]`;
  if (/^-?[_a-zA-Z][\w-]*$/.test(sub)) return `element:${sub.toLowerCase()}`;
  return `other:${raw.replace(/\s+/g, "")}`;
}

/** 一条规则的选择器 → 作用域（单 compound 直接给形态；列表给 `list:` 聚合） */
function scopeOf(selectorText) {
  const compounds = splitSelector(selectorText);
  if (compounds.length === 1) return scopeShape(compounds[0]);
  return `list:${compounds.map((c) => scopeShape(c)).join(" | ")}`;
}

/** 🔴 「document 级」的**字面判据**（事实面的分类规则，写出来让 1.23 能复核——不是裁决）：
 *  ① 作用域是 `doc:*`（`:root` / `html` / `body` / `*`）；
 *  ② 或作用域里有 `attr:[data-…]`（本仓 `data-theme` 挂在 `<html>` 上）。
 *  ⚠️ 选择器列表里**任一项**命中即算 document 级（那正是一条规则同时写 `:root, .x` 的形态）。 */
export const DOC_LEVEL_CRITERION = "作用域含 doc:* 或 attr:[data-…]（本仓 data-theme 挂在 <html>）";
const isDocLevel = (scope) => /\bdoc:/.test(scope) || /attr:\[data-/.test(scope);

/** 从一段声明块里取**自定义属性的定义名**（`--x:` 形态；`var(--x)` 用法没有冒号，天然不命中） */
function customPropDefs(declText) {
  const out = [];
  for (const m of String(declText ?? "").matchAll(/(?:^|;|\{)\s*(--[\w-]+)\s*:/g)) out.push(m[1]);
  return out;
}

/** 收集一份文档里**每一方**在四条轴上的名字集合（＋ 证据点，供碰撞报告回显） */
export function collectParties(doc) {
  const parties = new Map();
  const bump = (party) => {
    if (!parties.has(party)) {
      parties.set(party, { classes: new Set(), keyframes: new Set(), tokens: new Map(), shapes: new Set(), sheets: [], evidence: [] });
    }
    return parties.get(party);
  };
  const unattributed = [];

  for (const sheet of doc.sheets ?? []) {
    const { party, why, clue } = attributeSheet(sheet);
    if (!party) {
      unattributed.push({ document: doc.label ?? doc.url, index: sheet.index, href: sheet.href ?? null, devId: sheet.devId ?? null, why, clue });
      continue;
    }
    const p = bump(party);
    p.sheets.push(sheet.index);
    if (sheet.blocked) {
      unattributed.push({
        document: doc.label ?? doc.url,
        index: sheet.index,
        href: sheet.href ?? null,
        devId: sheet.devId ?? null,
        why: "样式表规则**读不到**（cssRules 抛异常 = CORS）——看不见内容 ≠ 干净 ⇒ 结论不成立",
        clue,
      });
      continue;
    }
    for (const r of sheet.rules ?? []) {
      if (r.empty) continue; // 空规则体：与静态门禁 parseCss() 同口径（跳）
      if ((r.nested ?? 0) > 0) continue; // CSS 嵌套：相对选择器带隐式祖先 = scoped，不占名（见"覆盖不到"第 5 条）
      for (const one of splitSelector(r.sel)) {
        if (hasAncestor(one)) continue; // scoped 调优 = 合法消费
        const name = soleClassOf(one);
        if (name) {
          p.classes.add(name);
          p.evidence.push({ axis: "class", name, sheet: sheet.index, sel: one, at: r.at ?? "" });
          continue;
        }
        const shape = selectorShape(one);
        if (shape) {
          p.shapes.add(shape);
          p.evidence.push({ axis: "selector-shape", name: shape, sheet: sheet.index, sel: one, at: r.at ?? "" });
        }
      }
    }
    for (const k of sheet.keyframes ?? []) {
      p.keyframes.add(k.name);
      p.evidence.push({ axis: "keyframes", name: k.name, sheet: sheet.index, sel: `@keyframes ${k.name}`, at: k.at ?? "" });
      for (const name of customPropDefs(k.decl)) {
        const set = p.tokens.get(name) ?? new Set();
        set.add(`@keyframes ${k.name}`);
        p.tokens.set(name, set);
        p.evidence.push({ axis: "token", name, sheet: sheet.index, sel: `@keyframes ${k.name} 体内的定义`, at: k.at ?? "" });
      }
    }
    if (sheet.rules?.length) {
      for (const r of sheet.rules) {
        if (r.empty || !r.decl) continue;
        const scope = scopeOf(r.sel);
        for (const name of customPropDefs(r.decl)) {
          const set = p.tokens.get(name) ?? new Set();
          set.add(scope);
          p.tokens.set(name, set);
          p.evidence.push({ axis: "token", name, sheet: sheet.index, sel: `${scope} 之下的定义`, at: r.at ?? "" });
        }
      }
    }
  }
  return { parties, unattributed };
}

/** 轴 ④ 的形态是否**带类名锚**（`other:.x…` / `other:.x[y]`）——
 *  带锚 ⇒ 命中范围被那个类限定 ⇒ 归属问题落回**轴 ①（类名命名空间）**；
 *  不带锚（`universal:*` / `element:*` / `id:*` / `attr:*` / `other:input[type=…]`）⇒ 命中
 *  「该文档里所有那一类元素」，与谁渲染无关（22 号档 §3.2 的真害：插件写 `button{}` 会改掉所有人的按钮）。
 *  ⚠️ 这条分界**就是 22 号档 §3.2「16 处」那条读数的口径边界**（它只数 元素/通配/属性/id）。 */
export const isClassAnchoredShape = (shape) => shape.startsWith("other:") && /\.-?[_a-zA-Z]/.test(shape.slice(6));

/** 一处碰撞在**共享组件域**里对应的名字（用来判「是不是内联的 UI 库 CSS」）：
 *  轴 ① 的名字本身就是类名；轴 ② 的名字就是关键帧名（种子集合把两者并在一起 —— 问题问的是
 *  「这个名字属于共享组件的 CSS 吗」，类名与关键帧名不会互相混淆）；轴 ④ 取形态里锚定的类名
 *  （`other:.ldk-toggle.on` → `ldk-toggle`）；轴 ③ 与共享域的关系另有判据（token 轴归 1.23）⇒ 回 `null`。 */
function anchoredClassOf(axis, name) {
  if (axis === "class" || axis === "keyframes") return name;
  if (axis === "selector-shape" && isClassAnchoredShape(name)) {
    const m = /\.(-?[_a-zA-Z][\w-]*)/.exec(name.slice(6));
    return m ? m[1] : null;
  }
  return null;
}

/**
 * 🔴 一处碰撞的**性质**与判红分级（依据 22 号档 §10.3「宽容度模型」；**不许自创判红**）。
 *
 * ── 为什么需要「已内联的共享组件 CSS」这一档（**本格实测出来的，不是理论**）──
 * 实机读数：`@linkdesk/ui` **不是 external** ⇒ **每只插件的 bundle 里都内联了一整份共享组件 CSS**。
 * 于是池文档里同一个 `ldk-toggle` 会被 `shared`（宿主 import 的那份）＋ `file-tree` ＋ `marketplace`
 * **各自独立定义**——按字面就是「三方各自定义同名」。
 * ⇒ 但它**不是两套规则打架**：实测两侧声明块**逐字段等价**（只有小压缩带来的写法差：
 *   `150ms` ↔ `0.15s`、逗号后空格有无），肉眼与浏览器都看不出差别。
 * 🔴 **本格刻意不做「规则体逐字比较」**：上面那种等价写法会被逐字比较**误判成冲突** ⇒ 制造假红，
 *    而假红会让真红失效（§10.3 原话）。⇒ 判据改为看**命名空间归属**：
 *    「该名字属于**共享组件域**（`ldk-` 族段，`src/components/shared/**` 里有静态定义）⇒
 *     插件产物里出现它 = **把 UI 库的 CSS 内联进产物**这个已知结构性事实，**逐条列名但不判红**」。
 * 🔑 **这条豁免不会漏掉真正的借用**：插件**源码**里写 `ldk-*` 由**静态腿**判红
 *    （SDK `check-css-namespace`／`plugin-prefix`；18 仓实测 0 违规）⇒ 两把尺子合起来仍无死角。
 *    豁免面**全部逐条列出**（`facts.vendoredSharedNames`），不是悄悄放过。
 */
export function classifyCollision(axis, name, parties, sharedDomain = new Set()) {
  const anchored = axis === "class" ? name : anchoredClassOf(axis, name);
  if (anchored && sharedDomain.has(anchored)) {
    return {
      severity: "info",
      kind: "vendored-shared-css",
      why:
        "该名字属于**共享组件域**（`src/components/shared/**` 里有静态定义）⇒ 插件产物里出现它 = " +
        "`@linkdesk/ui` 的 CSS 被**内联进每只插件 bundle**（它不是 external 的已知结构性事实），" +
        "实测两侧声明块逐字段等价（仅小压缩的写法差：`150ms`↔`0.15s`）⇒ **不判红、只列名**。" +
        "插件**源码**里的 `ldk-` 借用由 SDK 静态腿判红（两把尺子合起来无死角）。",
    };
  }
  if (axis === "selector-shape" && isClassAnchoredShape(name)) {
    return {
      severity: "yellow",
      kind: "class-anchored-shape",
      why:
        "形态**带类名锚** ⇒ 命中范围被那个类限定，归属问题落在轴 ①（类名命名空间）；且状态类写成复合" +
        "（硬约束 23 ③）正是被鼓励的形态 ⇒ **黄灯只报事实**（用一条没定案的规则判红会制造假红，§10.3）。",
    };
  }
  if (parties.some((x) => x === "host" || x === "shared")) {
    return {
      severity: "red",
      kind: "cross-party-clash",
      why:
        "任一方是 `host` / `shared` ⇒ 软件自己的元素会被别人的样式命中（`.badge` 案同形）；" +
        "「本仓可答 ＋ 有真害」两条都满足 ⇒ 红（§10.3）。",
    };
  }
  return {
    severity: "yellow",
    kind: "plugin-plugin-clash",
    why: "碰撞只发生在两只插件之间 ⇒ 只有**跨仓**才能回答「已知它在哪、该改哪」⇒ 黄灯（§10.3 判红范围判据）。",
  };
}

/** 一方在某个轴上的名字集合（轴 → 收集字段的**唯一映射点**，加轴时只改这里） */
const AXIS_FIELD = { class: "classes", keyframes: "keyframes", token: "tokens", "selector-shape": "shapes" };
const namesOn = (p, axis) => (axis === "token" ? new Set(p.tokens.keys()) : p[AXIS_FIELD[axis]]);

/** 「被 ≥2 方独立定义」的名字 / 形态 */
function collisionsOn(axis, parties, sharedDomain) {
  const byName = new Map();
  for (const [party, p] of parties) {
    for (const name of namesOn(p, axis)) {
      const list = byName.get(name) ?? [];
      list.push(party);
      byName.set(name, list);
    }
  }
  const out = [];
  for (const [name, ps] of byName) {
    if (ps.length < 2) continue;
    const sorted = [...ps].sort();
    const verdict = classifyCollision(axis, name, sorted, sharedDomain);
    out.push({
      axis,
      name,
      parties: sorted,
      ...verdict,
      evidence: sorted.flatMap((party) =>
        parties
          .get(party)
          .evidence.filter((e) => e.axis === axis && e.name === name)
          .slice(0, 3)
          .map((e) => ({ party, sheet: e.sheet, sel: e.sel, at: e.at }))
      ),
    });
  }
  return out;
}

/**
 * **纯分析层入口**：吃一份 dump（多文档）→ 出报告。
 * @param {{documents: Array}} dump
 * @param {{minPlugins?: number, sharedDomainNames?: Iterable<string>}} opts
 *   `minPlugins` 方名册下限（默认 2 只插件——否则插件↔插件轴未被验证）；
 *   `sharedDomainNames` **共享组件域的静态名字集合**（`src/components/shared/**` 的独立定义
 *   ＋ 关键帧）——它是「插件产物里的 `ldk-` 名 = 内联的 UI 库 CSS」这条豁免的**唯一依据**。
 *   ⚠️ **不给这个种子 ⇒ 按最严处理**（插件里的 `ldk-` 名一律算越界），这是有意的 fail-loud 方向。
 */
export function analyzeDump(dump, { minPlugins = 2, sharedDomainNames = [] } = {}) {
  const sharedDomain = new Set(sharedDomainNames);
  const documents = [];
  const allCollisions = [];
  const allUnattributed = [];

  for (const doc of dump?.documents ?? []) {
    const { parties, unattributed } = collectParties(doc);
    const collisions = AXES.flatMap((axis) => collisionsOn(axis, parties, sharedDomain)).sort((a, b) =>
      a.axis === b.axis ? a.name.localeCompare(b.name) : a.axis.localeCompare(b.axis)
    );

    // ── 事实面（只报，不裁决）──
    const ldkIntrusions = [];
    const vendoredSharedNames = [];
    for (const [party, p] of parties) {
      if (party === "host" || party === "shared") continue;
      for (const axis of ["class", "keyframes"]) {
        for (const name of namesOn(p, axis)) {
          if (!name.startsWith("ldk-")) continue;
          if (sharedDomain.has(name)) {
            vendoredSharedNames.push({ axis, name, party, severity: "info", why: "共享组件域里的名字 ⇒ 内联的 `@linkdesk/ui` CSS（不是借用；插件源码里的 `ldk-` 借用由 SDK 静态腿判红）" });
            continue;
          }
          ldkIntrusions.push({
            axis,
            name,
            party,
            severity: "red",
            why: "非宿主方独立定义了 `ldk-` 开头的名字、且它**不属于共享组件域** = 占用宿主命名空间（CLAUDE.md 硬约束 23 ②；22 号档 §10.3 判红第 ① 类）",
          });
        }
      }
    }
    const documentLevelTokens = {};
    const allTokens = {};
    for (const [party, p] of parties) {
      allTokens[party] = Object.fromEntries([...p.tokens.entries()].sort().map(([n, s]) => [n, [...s].sort()]));
      const dl = [];
      for (const [name, scopes] of p.tokens) if ([...scopes].some(isDocLevel)) dl.push({ name, scopes: [...scopes].sort() });
      if (dl.length) documentLevelTokens[party] = dl.sort((a, b) => a.name.localeCompare(b.name));
    }

    const pluginParties = [...parties.keys()].filter((x) => x.startsWith("plugin:")).sort();
    documents.push({
      label: doc.label ?? doc.url,
      url: doc.url,
      title: doc.title ?? null,
      sheetCount: (doc.sheets ?? []).length,
      ruleCount: (doc.sheets ?? []).reduce((n, s) => n + (s.ruleCount ?? 0), 0),
      parties: Object.fromEntries(
        [...parties.entries()].sort().map(([party, p]) => [
          party,
          {
            sheets: [...p.sheets].sort((a, b) => a - b),
            counts: {
              class: p.classes.size,
              keyframes: p.keyframes.size,
              token: p.tokens.size,
              "selector-shape": p.shapes.size,
              nonLdkClass: [...p.classes].filter((n) => !n.startsWith("ldk-")).length,
              nonLdkKeyframes: [...p.keyframes].filter((n) => !n.startsWith("ldk-")).length,
            },
            classes: [...p.classes].sort(),
            keyframes: [...p.keyframes].sort(),
            tokens: allTokens[party],
            "selector-shapes": [...p.shapes].sort(),
            nonLdkClasses: [...p.classes].filter((n) => !n.startsWith("ldk-")).sort(),
            nonLdkKeyframes: [...p.keyframes].filter((n) => !n.startsWith("ldk-")).sort(),
          },
        ])
      ),
      collisions,
      unattributed,
      facts: {
        ldkIntrusions: ldkIntrusions.sort((a, b) => a.name.localeCompare(b.name)),
        vendoredSharedNames: vendoredSharedNames.sort((a, b) => a.name.localeCompare(b.name)),
        documentLevelTokens,
        documentLevelCriterion: DOC_LEVEL_CRITERION,
        inlineHostTokens: [...(doc.inlineTokens ?? [])].sort(),
        inlineBodyTokens: [...(doc.bodyTokens ?? [])].sort(),
        pluginParties,
      },
    });
    const label = doc.label ?? doc.url;
    allCollisions.push(...collisions.map((c) => ({ ...c, document: label })));
    allUnattributed.push(...unattributed);
  }

  const reds = allCollisions.filter((c) => c.severity === "red");
  const yellows = allCollisions.filter((c) => c.severity === "yellow");
  const infos = allCollisions.filter((c) => c.severity === "info");
  const intrusions = documents.flatMap((d) => d.facts.ldkIntrusions);
  const rosterOk = documents.length > 0 && documents.some((d) => d.facts.pluginParties.length >= minPlugins);
  const ok = allUnattributed.length === 0 && reds.length === 0 && intrusions.length === 0 && rosterOk;

  return {
    probe: { ...(dump?.probe ?? {}), analyzer: "runtime-style-audit/v1", minPlugins, sharedDomainSeed: sharedDomain.size },
    ok,
    summary: {
      documents: documents.length,
      collisions: allCollisions.length,
      red: reds.length,
      yellow: yellows.length,
      info: infos.length,
      unattributed: allUnattributed.length,
      ldkIntrusions: intrusions.length,
      rosterOk,
      perDocument: Object.fromEntries(
        documents.map((d) => [
          d.label,
          {
            parties: Object.keys(d.parties).length,
            plugins: d.facts.pluginParties.length,
            sheets: d.sheetCount,
            rules: d.ruleCount,
            collisions: d.collisions.length,
            red: d.collisions.filter((c) => c.severity === "red").length,
            info: d.collisions.filter((c) => c.severity === "info").length,
            unattributed: d.unattributed.length,
          },
        ])
      ),
    },
    documents,
    collisions: allCollisions,
    unattributed: allUnattributed,
  };
}

/* ────────────────────────────────────────────────────────────────────────
   ①b 静态源 ↔ 运行时 对账（**只覆盖仓内两个域**的**类名轴 ＋ 关键帧轴**）
   ────────────────────────────────────────────────────────────────────────
   为什么要它：本系列的病根是「**尺子不止一把**」。现在两把尺子共用
   `lib/css-selectors.mjs` 的口径，但「口径相同」≠「读数相同」——本对账就是那个
   **可证伪的验证**：
     · **运行时 ⊆ 静态源**（同名域）：运行时出现、静态源里没有的名字 ⇒
       要么它来自**域外的文件**（如 `src/App.css` 不在门禁判据③ 域内），
       要么**有人在运行时注入了源码里不存在的样式** ⇒ 两种都必须被人看见；
     · 静态 − 运行时 = **本次没被 import/挂载的 CSS 文件**（dev 逐文件注入的天然结果，正常）。
   ⚠️ 射程：插件与 codicon 的**源不在本仓**（在插件仓产物 / `node_modules`）⇒ 不进本对账。
   ⚠️ 本对账**只报事实**，不改任何域（域是门禁的事，改域 = 改规则，属件 7/件 8 的活）。
   ──────────────────────────────────────────────────────────────────────── */

function walkCss(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walkCss(full, out);
    else if (e.name.endsWith(".css")) out.push(full);
  }
  return out;
}

/** 一组 CSS 文件 → 该域的静态名字集合（**走 lib 的同一份口径**） */
function staticNames(files) {
  const classes = new Set();
  const keyframes = new Set();
  for (const f of files) {
    if (!statSync(f, { throwIfNoEntry: false })) continue;
    const cleaned = stripComments(readFileSync(f, "utf8"));
    for (const d of bareClassDefinitions(cleaned)) classes.add(d.name);
    for (const k of keyframeDefinitions(cleaned)) keyframes.add(k.name);
  }
  return { classes, keyframes };
}

/** 共享组件域的静态名字集合（类名 ＋ 关键帧）= 「内联的 UI 库 CSS」豁免判据的**唯一依据** */
function sharedDomainSeed(root = ROOT) {
  const s = staticNames(walkCss(join(root, "src", "components", "shared")));
  return [...s.classes, ...s.keyframes];
}

/** 从报告里取某一方（跨全部文档求并集）的运行时名字集合 */
function runtimeNames(report, party) {
  const classes = new Set();
  const keyframes = new Set();
  const classSheets = new Map();
  for (const d of report.documents) {
    const p = d.parties[party];
    if (!p) continue;
    for (const n of p.classes) {
      classes.add(n);
      if (!classSheets.has(n)) classSheets.set(n, { document: d.label, sheets: p.sheets });
    }
    for (const k of p.keyframes) keyframes.add(k);
  }
  return { classes, keyframes, classSheets };
}

/**
 * 静态 ↔ 运行时对账。两个 host 域并列，**专门让「域边界不一致」自己浮出来**：
 *   · `探针归属域` = `src/*.css` ＋ `src/pool/**`（= 探针 PARTY_RULES 里 host 那条的射程）
 *   · `门禁判据③ 域` = `src/index.css` ＋ `src/pool/**`（= `check-css-namespace.mjs` 的射程）
 */
export function compareStatic(report, root = ROOT) {
  const srcTop = readdirSync(join(root, "src"), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".css"))
    .map((e) => join(root, "src", e.name));
  const pool = walkCss(join(root, "src", "pool"));
  const shared = walkCss(join(root, "src", "components", "shared"));
  const domains = [
    { key: "host", label: "host（探针归属域：src/*.css ＋ src/pool/**）", files: [...srcTop, ...pool] },
    { key: "host", label: "host（门禁判据③ 域：src/index.css ＋ src/pool/**）", files: [...srcTop.filter((f) => f.endsWith("index.css")), ...pool] },
    { key: "shared", label: "shared（src/components/shared/**）", files: shared },
  ];

  const out = [];
  for (const dom of domains) {
    const stat = staticNames(dom.files);
    const run = runtimeNames(report, dom.key);
    const runtimeOnly = [...run.classes].filter((n) => !stat.classes.has(n)).sort();
    const staticOnly = [...stat.classes].filter((n) => !run.classes.has(n)).sort();
    const kfRuntimeOnly = [...run.keyframes].filter((n) => !stat.keyframes.has(n)).sort();
    out.push({
      domain: dom.label,
      files: dom.files.map((f) => relative(root, f).replace(/\\/g, "/")),
      staticClasses: stat.classes.size,
      runtimeClasses: run.classes.size,
      runtimeOnly: runtimeOnly.map((n) => ({ name: n, seenIn: run.classSheets.get(n) ? { document: run.classSheets.get(n).document, sheets: run.classSheets.get(n).sheets } : null })),
      staticOnly,
      staticKeyframes: [...stat.keyframes].sort(),
      runtimeKeyframes: [...run.keyframes].sort(),
      keyframesRuntimeOnly: kfRuntimeOnly,
    });
  }
  // 域外补充：探针归属域里有、而门禁判定域里没有的独立定义（= 域边界不一致的**直接证据**）
  const gateStat = staticNames([...srcTop.filter((f) => f.endsWith("index.css")), ...pool]).classes;
  const probeStat = staticNames([...srcTop, ...pool]).classes;
  const outsideGateDomain = [...probeStat].filter((n) => !gateStat.has(n)).sort();
  return { domains: out, outsideGateDomain };
}

function printPrefixAudit(report) {
  console.log("\n═══ 前缀审计（**改前/改后对账用的那把尺子**）——每方「非 `ldk-` 独立定义」的计数 ═══");
  console.log("   （口径 = 与静态门禁同一份 `soleClassOf()`；空规则体同 parseCss() 跳过 ⇒ 两把尺子读数应逐字相等）");
  for (const d of report.documents) {
    console.log(`\n▸ ${d.label}`);
    for (const [party, info] of Object.entries(d.parties)) {
      const c = info.counts;
      console.log(`   ${party.padEnd(22)} 非 ldk- 类名 ${String(c.nonLdkClass).padStart(4)} ｜ 非 ldk- 关键帧 ${String(c.nonLdkKeyframes).padStart(2)} ｜ （总 类名 ${c.class} / 关键帧 ${c.keyframes}）`);
      if (c.nonLdkClass) console.log(`        ${info.nonLdkClasses.slice(0, 24).join(" ")}${info.nonLdkClasses.length > 24 ? " …" : ""}`);
      if (c.nonLdkKeyframes) console.log(`        ${info.nonLdkKeyframes.join(" ")}`);
    }
  }
}

function printCompare(cmp) {
  console.log("\n═══ 静态源 ↔ 运行时 对账（类名轴 ＋ 关键帧轴；只覆盖仓内两个域）═══");
  for (const d of cmp.domains) {
    console.log(`\n▸ ${d.domain}`);
    console.log(`   文件 ${d.files.length} 个 ｜ 静态独立定义 ${d.staticClasses} ｜ 运行时独立定义 ${d.runtimeClasses}`);
    console.log(`   运行时独有（**必须为 0**，否则是"运行时注入了源码里没有的样式"或"来自域外文件"）：${d.runtimeOnly.length === 0 ? "0 ✔️" : d.runtimeOnly.map((x) => `${x.name}@${x.seenIn?.document ?? "?"}`).join(" ")}`);
    console.log(`   静态独有（= 本次**没被 import/挂载**的文件里的名字，正常）：${d.staticOnly.length} 个${d.staticOnly.length ? ` —— ${d.staticOnly.slice(0, 12).join(" ")}${d.staticOnly.length > 12 ? " …" : ""}` : ""}`);
    console.log(`   关键帧：静态 ${d.staticKeyframes.length} ｜ 运行时 ${d.runtimeKeyframes.length} ｜ 运行时独有 ${d.keyframesRuntimeOnly.length}`);
  }
  if (cmp.outsideGateDomain.length) {
    console.log(`\n🔴 **域边界不一致**：探针归属域里有、而**门禁判据③ 域里没有**的独立定义 ${cmp.outsideGateDomain.length} 个：`);
    console.log(`   ${cmp.outsideGateDomain.join(" ")}`);
    console.log("   ⇒ 这些名字来自 `src/*.css` 里**除 index.css 之外**的文件（本仓 = `src/App.css`，只在**壳窗口文档**生效）。");
    console.log("   ⇒ 今天不构成跨方碰撞（壳窗口文档里没有别的方的 CSS），**但它不在任何一条门禁的射程内**——");
    console.log("      「宿主自己定义的类名 100% 是 `ldk-`」这句话，按**门禁当前口径**不覆盖它。");
    console.log("   ⛔ 本格**不改域、也不改 src/**（改域 = 改规则；改 src = 产品改动）⇒ 如实记账并交棒（见交接段）。");
  }
}

/* ════════════════════════════════════════════════════════════════════════
   ② 自测（正控绿 / 负控红）——**判据的存活不能寄托在人工上**（记忆 gate-selftest-must-be-wired）
   ════════════════════════════════════════════════════════════════════════ */

/** 造一张表：`rules` = [{sel, decl?}]（无 decl 或 decl 为空串 ⇒ **空规则体**） */
function sheet(index, origin, rules = [], keyframes = []) {
  const rs = rules.map((r) => {
    const decl = r.decl ?? "color: red";
    return { at: "", nested: r.nested ?? 0, sel: r.sel, empty: decl === "", decl: decl.includes("--") ? decl : null };
  });
  return { index, href: origin.href ?? null, devId: origin.devId ?? null, tag: "STYLE", blocked: origin.blocked ?? false, ruleCount: rs.length, rules: rs, keyframes };
}
const rules = (...sels) => sels.map((sel) => ({ sel }));
const doc = (label, sheets, extra = {}) => ({ label, url: `http://localhost:1420/${label}.html`, title: label, sheets, inlineTokens: [], bodyTokens: [], ...extra });

const HOST_CSS = { devId: "E:/linkdesk/src/pool/zones/icon-bar/IconBarZone.css" };
const SHARED_CSS = { devId: "E:/linkdesk/src/components/shared/button/Button.css" };
const PLUG_A = { href: "http://localhost:1420/@fs/E:/linkdesk-rmt-appdata/linkdesk/plugins/alpha/dist/index.bundle.css" };
const PLUG_B = { href: "http://localhost:1420/@fs/E:/linkdesk-rmt-appdata/linkdesk/plugins/beta/dist/index.bundle.css" };

function selfTest() {
  const cases = [];
  const t = (name, pass) => cases.push([name, pass]);

  // ① 正控：各方各定义各的 ⇒ 零碰撞
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-icon-bar")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("正控①：各方各自定义、零交集 ⇒ ok 且碰撞 0", r.ok === true && r.collisions.length === 0);
  }
  // ② 负控：宿主 × 插件 同名裸类名 ⇒ red（`.badge` 案同形）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".badge")), sheet(1, PLUG_A, rules(".badge")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const c = r.collisions.find((x) => x.axis === "class" && x.name === "badge");
    t("负控①：宿主×插件 同名类名 ⇒ red 碰撞 ＋ ok=false", !!c && c.severity === "red" && r.ok === false);
  }
  // ③ 负控：关键帧跨方重名 ⇒ red（轴 ②）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-a"), [{ name: "spin" }]), sheet(1, PLUG_A, rules(".alpha-root"), [{ name: "spin" }]), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("负控②：关键帧跨方重名 ⇒ red 碰撞（轴 ②）", r.collisions.some((x) => x.axis === "keyframes" && x.name === "spin" && x.severity === "red"));
  }
  // ④ 负控：归不出来 ⇒ 未归属 且 **结论不成立**
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, {}, rules(".mystery")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("负控③：归不出来的样式表 ⇒ 未归属 1 ＋ ok=false（不许静默当宿主）", r.unattributed.length === 1 && r.ok === false);
  }
  // ⑤ 负控：插件定义 `ldk-` 名 ⇒ 占用宿主命名空间（即使没有第二方也红）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, PLUG_A, rules(".ldk-pretend-host")), sheet(1, PLUG_B, rules(".beta-root"))])] });
    t("负控④：插件独立定义 `ldk-` 类名 ⇒ 越界 red ＋ ok=false", r.documents[0].facts.ldkIntrusions.length === 1 && r.ok === false);
  }
  // ⑥ 正控：**scoped 调优不算定义**（口径锚）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-icon-bar .badge")), sheet(1, PLUG_A, rules(".badge")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("正控②：有祖先的 scoped 调优不算独立定义 ⇒ 宿主侧不占名、零碰撞", r.collisions.length === 0);
  }
  // ⑦ 正控：复合 `.badge.on` 不算类名定义（落轴 ④）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".badge.on")), sheet(1, PLUG_A, rules(".badge")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const p = r.documents[0].parties.host;
    t("正控③：复合 `.badge.on` 不算类名定义（轴 ① 零命中 ／ 轴 ④ 命中 `other:.badge.on`）", !p.classes.includes("badge") && p["selector-shapes"].includes("other:.badge.on"));
  }
  // ⑧ 正控：空规则体不吃 —— **与静态门禁同口径**（两把尺子读数必须逐字相等）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, [{ sel: ".empty-badge", decl: "" }]), sheet(1, PLUG_A, rules(".empty-badge")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("正控④：空规则体（只有注释）不算定义 ⇒ 不产生碰撞（同 parseCss() 口径）", r.collisions.length === 0);
  }
  // ⑨ 负控：token 跨方同名 ⇒ 报（轴 ③）＋ document 级定义进事实面
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, [{ sel: ":root", decl: "--status-connected: green" }]), sheet(1, PLUG_A, [{ sel: ":root", decl: "--status-connected: red" }]), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const c = r.collisions.find((x) => x.axis === "token" && x.name === "--status-connected");
    t("负控⑤：token 跨方同名 ⇒ 报（轴 ③）＋ 双方 document 级定义被记为事实", !!c && r.documents[0].facts.documentLevelTokens["plugin:alpha"]?.length === 1 && r.documents[0].facts.documentLevelTokens.host?.length === 1);
  }
  // ⑩ 负控：轴 ④ 形态跨方 ⇒ 报
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules("*, *::before")), sheet(1, PLUG_A, rules("button")), sheet(2, PLUG_B, rules("button"))])] });
    t("负控⑥：顶层非类名选择器形态跨方 ⇒ 报（轴 ④）", r.collisions.some((x) => x.axis === "selector-shape" && x.name === "element:button"));
  }
  // ⑪ 正控：插件 × 插件 同名 ⇒ **yellow 不是 red**（钉住 §10.3 判红范围判据）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, PLUG_A, rules(".shared-name")), sheet(1, PLUG_B, rules(".shared-name"))])] });
    const c = r.collisions.find((x) => x.name === "shared-name");
    t("正控⑤：插件×插件 同名 ⇒ yellow（跨仓才答得了 ⇒ 不许升格成红）", !!c && c.severity === "yellow" && r.summary.red === 0);
  }
  // ⑫ 负控：**方名册不够真** ⇒ 结论不成立
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".ldk-a")), sheet(1, PLUG_A, rules(".alpha-root"))])] });
    t("负控⑦：插件方 < 2 ⇒ 方名册不够真 ＋ ok=false", r.summary.rosterOk === false && r.ok === false);
  }
  // ⑬ 负控：CORS 不可读的表 ⇒ 未归属 ＋ 结论不成立
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, { ...HOST_CSS, blocked: true }, rules(".ldk-a")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("负控⑧：样式表规则读不到（CORS） ⇒ 未归属 ＋ ok=false", r.unattributed.length === 1 && r.ok === false);
  }
  // ⑭ 正控：打包态归不出的 bundle ⇒ 未归属（**不臆造成 host+shared**）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, { href: "http://localhost:1420/assets/pool-abc123.css" }, rules(".ldk-a")), sheet(1, PLUG_A, rules(".alpha-root")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    t("正控⑥：打包态归不出的 bundle ⇒ 未归属（不臆造；按「覆盖不到」第 7 条如实要求声明粒度）", r.unattributed.length === 1 && r.ok === false);
  }
  // ⑮ 正控：共享组件方被单独识别（共享 × 插件 同名 ⇒ red，别把它并进宿主）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, SHARED_CSS, rules(".badge")), sheet(1, PLUG_A, rules(".badge")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const c = r.collisions.find((x) => x.name === "badge");
    t("正控⑦：共享组件域是独立的一方（共享×插件 同名 ⇒ red，`shared` 与 `host` 不混）", !!c && c.parties.includes("shared") && r.summary.red === 1);
  }
  // ⑯ 锚：轴 ④ 形态函数逐条符合预期
  {
    const shapes = ["*", "*::before", "#root", '[data-theme="light"]', 'input[type="number"]', "select", ".a.b", "button"].map(selectorShape);
    t(
      "锚①：形态函数（轴 ④）逐条符合预期（复合主体原样报 ⇒ 不制造假碰撞）",
      JSON.stringify(shapes) === JSON.stringify(["universal:*", "universal:*", "id:root", 'attr:[data-theme="light"]', 'other:input[type="number"]', "element:select", "other:.a.b", "element:button"])
    );
  }
  // ⑰ 锚：归属规则表**没有 `.*` 兜底**（fail-loud 的结构保证）
  {
    const catchAll = PARTY_RULES.some((r) => r.re.source === ".*" || r.re.source === "^.*$");
    t("锚②：归属规则表里没有 `.*` 兜底规则（fail-loud 由构造保证，不靠自觉）", catchAll === false);
  }
  // ⑱ 锚：`:root` 被认成 document 级作用域（token 轴事实面的分类规则可证伪）
  {
    t("锚③：`:root` / `html` / `[data-theme=…]` 的 token 作用域判成 document 级", ["doc:root", "doc:html", 'attr:[data-theme="light"]'].every((s) => isDocLevel(s)) && !isDocLevel("class:.ldk-a"));
  }
  // ⑲ 正控：**类名锚定的复合形态**（如宿主定制三方 codicon 类）⇒ 只报事实、**黄灯不判红**
  //    🔴 真实读数就在这套软件的活体上：`other:.codicon[class*="codicon-"]` 被 codicon 与 host 各自定义
  //    ——那是「宿主定制三方类」，不是污染；判红会制造假红（假红会让真红失效）。
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules('.codicon[class*="codicon-"]')), sheet(1, { devId: "E:/linkdesk/node_modules/@vscode/codicons/dist/codicon.css" }, rules('.codicon[class*="codicon-"]')), sheet(2, PLUG_A, rules(".alpha-root")), sheet(3, PLUG_B, rules(".beta-root"))])] });
    const c = r.collisions.find((x) => x.axis === "selector-shape");
    t("正控⑧：类名锚定的复合形态跨方 ⇒ **yellow 不判红**（宿主定制三方类 ≠ 污染）", !!c && c.severity === "yellow" && r.summary.red === 0 && r.ok === true);
  }
  // ⑳ 负控：**不带类名锚**的形态跨方 ⇒ red（元素/通配/属性/id 级基线被两方各自定义 = 22 号档 §3.2 的真害）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules("input[type=\"number\"]")), sheet(1, PLUG_A, rules("input[type=\"number\"]")), sheet(2, PLUG_B, rules(".beta-root"))])] });
    const c = r.collisions.find((x) => x.axis === "selector-shape");
    t("负控⑨：不带类名锚的形态跨方 ⇒ red（宿主 × 插件 各自给同一类元素上样式）", !!c && c.severity === "red" && r.ok === false);
  }
  // ㉑ 锚：判红依据（why）对三类都写得出——**判红必须能复核，不许"探针说红就红"**
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, HOST_CSS, rules(".x")), sheet(1, PLUG_A, rules(".x")), sheet(2, PLUG_B, rules(".x"))])] });
    const c = r.collisions.find((x) => x.name === "x");
    t("锚④：每处碰撞都带 `why`（判红依据），且宿主侧真红 / 纯插件侧黄灯的措辞不同", !!c?.why?.includes("§10.3") && r.collisions.every((x) => typeof x.why === "string" && x.why.length > 10));
  }
  // ㉒ 锚：`.app-shell` 这类**域外文件**的名字**不会**被静默算进宿主域（对账能把它抓出来）
  {
    t("锚⑤：静态↔运行时对账函数可调用（域边界不一致必须能被机械列出来，而不是靠人记得）", typeof compareStatic === "function");
  }
  // ㉓ 正控：**共享组件域里的 `ldk-` 名出现在插件产物里** ⇒ info（内联的 UI 库 CSS），**不判红**
  //    🔴 这是本格实机跑出来的主读数：`@linkdesk/ui` 不是 external ⇒ 每只插件 bundle 内联一份
  {
    const seed = ["ldk-toggle", "ldk-ctx-menu", "ldk-selectbox-in"];
    const r = analyzeDump(
      { documents: [doc("pool", [sheet(0, SHARED_CSS, rules(".ldk-toggle")), sheet(1, PLUG_A, rules(".ldk-toggle")), sheet(2, PLUG_B, rules(".ldk-toggle"))])] },
      { sharedDomainNames: seed }
    );
    const c = r.collisions.find((x) => x.name === "ldk-toggle");
    t("正控⑨：共享域名字被插件内联 ⇒ **info 不判红**（结构性事实，不是两套规则打架）", !!c && c.severity === "info" && c.kind === "vendored-shared-css" && r.summary.red === 0 && r.ok === true);
  }
  // ㉔ 负控：插件定义了**不属于共享域**的 `ldk-` 名 ⇒ 仍是**越界 red**（豁免不许被滥用成"什么都放过"）
  {
    const seed = ["ldk-toggle"];
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, PLUG_A, rules(".ldk-icon-btn")), sheet(1, PLUG_B, rules(".beta-root"))])] }, { sharedDomainNames: seed });
    t("负控⑩：插件定义**共享域之外**的 `ldk-` 名 ⇒ 越界 red ＋ ok=false（豁免只认共享域，不是「放过 ldk-」）", r.documents[0].facts.ldkIntrusions.length === 1 && r.ok === false);
  }
  // ㉕ 负控：**不给种子**时按最严处理（fail-loud 方向）——插件里的 `ldk-` 名一律算越界
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, PLUG_A, rules(".ldk-toggle")), sheet(1, PLUG_B, rules(".beta-root"))])] });
    t("负控⑪：不给共享域种子 ⇒ 按最严处理（`ldk-` 一律算越界，不静默放过）", r.documents[0].facts.ldkIntrusions.length === 1 && r.summary.red === 0 && r.ok === false);
  }
  // ㉖ 正控：轴 ④ 的类名锚豁免同样按共享域走（`other:.ldk-toggle.on` ⇒ info；`other:.codicon[…]` ⇒ 仍 yellow）
  {
    const seed = ["ldk-toggle"];
    const r = analyzeDump(
      { documents: [doc("pool", [sheet(0, PLUG_A, rules(".ldk-toggle.on", ".codicon[class*=\"codicon-\"]")), sheet(1, PLUG_B, rules(".ldk-toggle.on", ".codicon[class*=\"codicon-\"]"))])] },
      { sharedDomainNames: seed }
    );
    const t1 = r.collisions.find((x) => x.name === "other:.ldk-toggle.on");
    const t2 = r.collisions.find((x) => x.name.startsWith("other:.codicon"));
    t("正控⑩：轴 ④ 的类名锚也按共享域分级（`.ldk-toggle.on` ⇒ info；`.codicon[…]` 非共享域 ⇒ yellow）", t1?.severity === "info" && t2?.severity === "yellow");
  }
  // ㉗ 锚：方名册够真 = **至少一个有插件的文档**满足 ≥2（壳窗口文档永远没有插件，不能因此判不成立）
  {
    const r = analyzeDump({ documents: [doc("pool", [sheet(0, PLUG_A, rules(".alpha-root")), sheet(1, PLUG_B, rules(".beta-root"))]), doc("shell", [sheet(0, HOST_CSS, rules(".ldk-a")), sheet(1, { devId: "E:/linkdesk/node_modules/@vscode/codicons/dist/codicon.css" }, rules(".codicon"))])] });
    t("锚⑥：方名册判据按「至少一个文档 ≥2 只插件」——壳窗口文档没有插件不该把结论打成不成立", r.summary.rosterOk === true && r.ok === true);
  }

  let ok = true;
  for (const [name, pass] of cases) {
    console.log(`  ${pass ? "✓" : "✗"} ${name}`);
    if (!pass) ok = false;
  }
  console.log(`runtime-style-audit self-test ${ok ? "✔️ 全部符合预期（正控绿 / 负控红）" : "❌ 有判据不符预期"}`);
  process.exit(ok ? 0 : 1);
}

/* ════════════════════════════════════════════════════════════════════════
   ③ 采集层——连 CDP → dump → 调 ①（**不进 check**）
   ════════════════════════════════════════════════════════════════════════ */

/** 注入页面执行的抽取表达式（**只搬事实，不判口径**——口径全在 Node 侧，见文件头） */
const EXTRACT = `(() => {
  const sheets = [];
  let i = 0;
  for (const s of document.styleSheets) {
    const owner = s.ownerNode;
    const base = {
      index: i++,
      href: s.href,
      tag: owner && owner.tagName ? owner.tagName : null,
      devId: owner && owner.getAttribute ? owner.getAttribute("data-vite-dev-id") : null,
    };
    let rules;
    try { rules = s.cssRules; } catch (e) {
      sheets.push(Object.assign({}, base, { blocked: true, ruleCount: 0, rules: [], keyframes: [] }));
      continue;
    }
    const out = Object.assign({}, base, { blocked: false, ruleCount: rules.length, rules: [], keyframes: [] });
    // 🔴 Chrome 112+ 起 CSSStyleRule.cssRules 因 CSS Nesting 存在且常为空 ⇒ **必须先判 selectorText**
    //    再递归（历轮踩过：顺序反了会让类名词表恒空）。
    const walk = (list, at, nested) => {
      for (const r of list) {
        const t = r.type;
        if (t === 1 || typeof r.selectorText === "string") {
          const decl = r.style ? r.style.cssText : "";
          out.rules.push({
            at: at,
            nested: nested,
            sel: r.selectorText,
            empty: !r.style || r.style.length === 0,
            decl: decl.indexOf("--") >= 0 ? decl : null,
          });
          if (r.cssRules && r.cssRules.length) walk(r.cssRules, at, nested + 1);
        } else if (t === 7) {
          const text = r.cssText || "";
          out.keyframes.push({ name: String(r.name), at: at, decl: text.indexOf("--") >= 0 ? text : null });
          // ⛔ 不递归进 @keyframes：内部是 CSSKeyframeRule（keyText，非选择器）
        } else if (r.cssRules && r.cssRules.length) {
          const full = r.cssText || "";
          const brace = full.indexOf("{");
          const prelude = brace > 0 ? full.slice(0, brace).trim() : String(r.type);
          walk(r.cssRules, at ? at + " && " + prelude : prelude, nested);
        }
      }
    };
    walk(rules, "", 0);
    sheets.push(out);
  }
  const readInline = (el) => {
    const out = [];
    if (!el || !el.style) return out;
    for (let k = 0; k < el.style.length; k++) {
      const name = el.style[k];
      if (name.indexOf("--") === 0) out.push(name);
    }
    return out;
  };
  return JSON.stringify({
    url: location.href,
    title: document.title,
    theme: document.documentElement.getAttribute("data-theme"),
    inlineTokens: readInline(document.documentElement),
    bodyTokens: readInline(document.body),
    sheets: sheets,
  });
})()`;

const CDP_BASE = process.env.LINKDESK_CDP ?? "http://127.0.0.1:9222";

async function listTargets() {
  const res = await fetch(`${CDP_BASE}/json/list`);
  if (!res.ok) throw new Error(`CDP /json/list HTTP ${res.status}`);
  const list = await res.json();
  return list.filter((t) => t.type === "page" && /^https?:/.test(t.url ?? "") && t.webSocketDebuggerUrl);
}

/** 连一个 target 跑表达式（照 scratch/cdp.mjs 的连法，别重写） */
function evaluateOn(target, expression) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    const pending = new Map();
    let seq = 0;
    const send = (method, params = {}) =>
      new Promise((res2, rej2) => {
        const id = ++seq;
        pending.set(id, { res: res2, rej: rej2 });
        ws.send(JSON.stringify({ id, method, params }));
      });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res: r, rej: j } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? j(new Error(JSON.stringify(msg.error))) : r(msg.result);
      }
    });
    ws.addEventListener("error", () => rej(new Error("WebSocket 连接失败")));
    ws.addEventListener("open", async () => {
      try {
        await send("Runtime.enable");
        const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
        if (r.exceptionDetails) throw new Error(`页面内异常：${r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)}`);
        ws.close();
        res(r.result?.value);
      } catch (e) {
        try { ws.close(); } catch { /* 已关 */ }
        rej(e);
      }
    });
  });
}

/** 文档标签：`pool` / `shell` / `other:<文件>`——供人读与「按文档对账」 */
export function labelOf(url) {
  try {
    const u = new URL(url);
    const base = u.pathname.split("/").pop() || "";
    if (base === "pool.html") return "pool";
    if (base === "" || base === "index.html") return "shell";
    return `other:${base}`;
  } catch {
    return `other:${url}`;
  }
}

async function collect({ docFilter, rawPath } = {}) {
  let targets;
  try {
    targets = await listTargets();
  } catch (e) {
    console.error(`❌ 连不上 CDP（${CDP_BASE}）：${e.message}`);
    console.error("   ⇒ 先按文件头「启动配方」起一个带 `--remote-debugging-port=9222` 的实例。");
    process.exit(2);
  }
  const picked = docFilter ? targets.filter((t) => t.url.includes(docFilter)) : targets;
  if (picked.length === 0) {
    console.error(`❌ 没有匹配的文档。候选：${targets.map((t) => `${t.title} <${t.url}>`).join(" ｜ ") || "（无）"}`);
    process.exit(2);
  }
  const documents = [];
  for (const t of picked) {
    const raw = JSON.parse(await evaluateOn(t, EXTRACT));
    documents.push({ label: labelOf(raw.url), url: raw.url, title: raw.title, theme: raw.theme, inlineTokens: raw.inlineTokens, bodyTokens: raw.bodyTokens, sheets: raw.sheets });
  }
  const dump = {
    probe: { version: 1, cdp: CDP_BASE, capturedAt: new Date().toISOString(), docFilter: docFilter ?? null, note: "**原始事实** dump——口径与判据全在 runtime-style-audit.mjs 的纯分析层，本文件不含结论" },
    documents,
  };
  if (rawPath) {
    mkdirSync(dirname(resolve(rawPath)), { recursive: true });
    writeFileSync(resolve(rawPath), JSON.stringify(dump, null, 1), "utf8");
  }
  return dump;
}

/* ════════════════════════════════════════════════════════════════════════
   ④ 人读输出 ＋ 入口
   ════════════════════════════════════════════════════════════════════════ */

function printReport(report) {
  console.log(`\n═══ 运行时全表断言探针（E6#109m · 件 5）═══ 采集于 ${report.probe.capturedAt ?? "(离线复算)"}`);
  for (const d of report.documents) {
    console.log(`\n▸ 文档 ${d.label}  <${d.url}>${d.title ? `  「${d.title}」` : ""}`);
    console.log(`  ${d.sheetCount} 张样式表 / ${d.ruleCount} 条规则`);
    for (const [party, info] of Object.entries(d.parties)) {
      const c = info.counts;
      console.log(
        `    · ${party.padEnd(22)} 表 ${String(info.sheets.length).padStart(2)} ｜ 类名 ${String(c.class).padStart(4)} ｜ 关键帧 ${String(c.keyframes).padStart(2)} ｜ token ${String(c.token).padStart(4)} ｜ 顶层形态 ${String(c["selector-shape"]).padStart(3)}`
      );
    }
    if (d.facts.inlineHostTokens.length) console.log(`    · documentElement 上的 inline token（宿主契约，单列、不参与碰撞）：${d.facts.inlineHostTokens.length} 个`);
    for (const [party, list] of Object.entries(d.facts.documentLevelTokens)) console.log(`    · ${party} 的 document 级 token 定义：${list.length} 个（${list.map((x) => x.name).slice(0, 8).join(" ")}${list.length > 8 ? " …" : ""}）`);
    for (const intr of d.facts.ldkIntrusions) console.log(`    🔴 [${intr.axis}] ${intr.name} —— ${intr.party} 占用了宿主 \`ldk-\` 命名空间`);
    if (d.facts.vendoredSharedNames.length) {
      const parties = [...new Set(d.facts.vendoredSharedNames.map((x) => x.party))].join(" / ");
      console.log(`    ℹ️ 内联的共享组件 CSS：${d.facts.vendoredSharedNames.length} 个 \`ldk-\` 名被 ${parties} 定义（逐条见 JSON；**不判红**——它不是 external 的已知结构性事实）`);
    }
  }
  const byAxis = report.collisions.reduce((acc, c) => ((acc[c.axis] = (acc[c.axis] ?? 0) + 1), acc), {});
  console.log(`\n▸ 跨方碰撞：${report.collisions.length} 处（red ${report.summary.red} / yellow ${report.summary.yellow} / info ${report.summary.info}）｜按轴 ${JSON.stringify(byAxis)}`);
  for (const c of report.collisions) {
    const mark = c.severity === "red" ? "🔴" : c.severity === "yellow" ? "🟡" : "ℹ️";
    if (c.severity === "info") {
      console.log(`   ${mark} [${c.axis}] ${c.name}  ←  ${c.parties.join(" × ")}   (${c.document})`);
      continue; // info 的 `why` 在摘要行里已说明，逐条打印会淹掉真信号
    }
    console.log(`   ${mark} [${c.axis}] ${c.name}  ←  ${c.parties.join(" × ")}   (${c.document})`);
    console.log(`        依据：${c.why}`);
    for (const e of c.evidence.slice(0, 4)) console.log(`        ${e.party} · 表#${e.sheet} · ${e.sel}${e.at ? `  @${e.at}` : ""}`);
  }
  if (report.summary.info) console.log(`\n   ℹ️ 那 ${report.summary.info} 处 info 的判据依据（同一句）：${report.collisions.find((c) => c.severity === "info")?.why ?? ""}`);
  if (report.unattributed.length) {
    console.log(`\n▸ 🔴 未归属样式表：${report.unattributed.length} 张（**结论不成立**——不许静默当宿主）`);
    for (const u of report.unattributed) console.log(`   表#${u.index} (${u.document})  ${u.why}${u.clue ? `  ｜ ${u.clue}` : ""}`);
  }
  if (!report.summary.rosterOk) console.log(`\n▸ ⚠️ 方名册不够真：插件方 < ${report.probe.minPlugins} ⇒ **插件↔插件轴未被验证**（先把要采的插件视图打开，见文件头启动配方第 ④ 步）`);
  console.log(`\n${report.ok ? "✅ 探针结论成立：零 red 跨方碰撞、零未归属、方名册够真" : "❌ 探针结论**不成立**（上面逐条见）"}`);
}

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
