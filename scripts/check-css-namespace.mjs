/**
 * 机械检查：CSS 命名空间纪律——**裸类名的「定义」与「借用」**。
 *
 * 🔴 出处（先读判据再读代码）：`docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/11-样式命名空间审计.md`
 *   ＋ bug 图谱 §C4（`.badge` 案：主题卡片徽标被通用徽标组件的同名裸类名吃掉，字被自己的背景吞掉）。
 *
 * ── 为什么必须有（本轮实测的文档同表关系）──
 *   池文档 `pool.html` 一张表里同时装着：**宿主 CSS（含 index.css 全局工具类）＋ 共享组件 CSS ＋
 *   全部已加载插件的 CSS**（实机读数：8 张样式表 = 宿主 pool CSS + codicon + 7 只插件 bundle）。
 *   ⇒ 任何**裸类名**（`.badge` / `.toggle` / `.input` …）都是**全局标识符**：一方定义、他方渲染，
 *     两边的样式就落到同一个元素上。这就是 `.badge` 案的形态，而且它**不报错、只是长得不对**。
 *
 * ── 判据（全部可证伪，见 --self-test）──
 *   ① 共享组件**独立定义必须 `ldk-` 开头** ⇒ 🔴 红
 *      （E6#109l-b 起从「新增裸定义要登记」改成**结构性判定**——共享组件自己定义的类名一律 `ldk-`，
 *        规则一句话、不需查表、没有白名单。三方带进来的名字（`codicon*`）天然出射程：
 *        本仓**只消费、从不独立定义**它，实测交集 = 0。）
 *   ② **【已退役】跨组件借用**（原：共享组件裸定义的类名被别的目录/壳渲染 ⇒ 红）
 *      （它的输入 =「共享组件的**裸**定义」——件 1 收完后裸定义清零、1.21b 之后独立定义全部 `ldk-`
 *        ⇒ 该判据再也报不出任何东西。**退役而不是留着**：一个每天跑绿、什么都拦不住的判据
 *        等价于死代码，且比死代码更坏（给人「有门禁」的错觉）。它想守的那件事由 ⑥ 接管。）
 *   ③ 宿主**独立定义必须 `ldk-` 开头** ⇒ 🔴 红
 *      （E6#109l 起从「逐个登记」改成**结构性判定**。域 = 池文档里生效的宿主 CSS：`index.css` ＋ `src/pool/**`。）
 *   ④ `@keyframes` 跨方重名（共享组件 × 壳）⇒ 🔴 红（关键帧名同样是全局的，第二条命名空间）
 *   ⑥ **`ldk-` 名跨域唯一性**：宿主域与共享组件域各自「独立定义」的**同名** `ldk-` 类 ⇒ 🔴 红
 *      （1.21 ＋ 1.21b 之后**两个域共用同一个 `ldk-` 命名空间**；一旦同名，宿主的元素会被共享组件的
 *        样式命中——`.badge` 案同形。这是 1.21b 补的判据：件 4 的两半合起来才让「两个域同一命名空间」
 *        成为事实，而在此之前没有任何一条判据看着这件事。）
 *   ⑨ **token（自定义属性）作用域**（E6#109n-b · 轮次 1.24）⇒ 🔴 红
 *      （**作用域才是命名空间**：文档级只有宿主契约块能写、其余定义必须挂在自有命名空间的类之下、
 *        任何方不得定义 `ldk-*` 自定义属性。域 = `src/**\/*.css`。规则正文 = 31 号档 §一；
 *        判定体 = `lib/css-selectors.mjs` 的 `judgeTokenScope()`——**与运行时探针同一个函数**。）
 *   ⑦ **共享组件族段规则**（E6#109o-b · 轮次 1.26）⇒ 🔴 红
 *      （`src/components/shared/**` 的每个**组件目录**里，`ldk-*` 独立定义的**族段必须与目录族一致**
 *        ——族根 = 该目录内那个「其余 `ldk-*` 名字都是它延伸（`-`／`__`／相等）」的最短 `ldk-*` 名
 *        ＝ 目录内所有 `ldk-*` 名的**共同族根**。一处耦合成本的机械守卫：新组件**自成一个族段**、
 *        不与既有族撞名 ⇒ 「加新组件」永远是一次安全的加法。规则正文 = 32 号档 §三.2 判据⑦。）
 *   ⑧ **关键帧引用不悬空**（E6#109o-b · 轮次 1.26）⇒ 🔴 红
 *      （`animation` / `animation-name` 引用的每个名字必须在**同方**有关键帧定义；同方 = 宿主编译域
 *        （宿主域 ＋ 共享组件域）——两边最终进同一张表。1.21／1.21b 把关键帧名全改成 `ldk-*`
 *        ⇒「改名忘改引用」从此有真实发生率，而它的症状是**动画静默消失**（不报错）。）
 *   ⑩ **宿主基线块**（R1 · E6#109o-b · 轮次 1.26）⇒ 🔴 红
 *      （宿主 CSS 里的**顶层「无名字锚」选择器**只允许出现在**登记文件**里：登记 = **文件 ＋ 条数**
 *        （`scripts/css-selector-baseline.json`，**零名字清单、零白名单**——名字级登记会腐）。
 *        域 = 本文件的 `HOST_DOMAIN`（与探针 `host` 归属域**逐字一致**）。
 *        ⚠️ 基线内站点**每次逐条打印**（文件:行 ＋ 选择器原文）⇒「哪几条」永远可见、不靠记忆。）
 *
 * ── 登记表 = 既成事实面（不是「允许随便加」）──
 *   登记表的 `classes` 整块已于 E6#109l-b **删除**：判据①③ 双双结构性之后，它没有消费方了
 *   （`classes.shared` 自件 1 起就是空数组，`classes.host` 自 1.21 起摘空）——**留一个永远为空的字段
 *   当装饰 = 死代码**。`keyframes` 段保留（它还有真输入：关键帧表 ＋ 作者面两棵树 §12 双向对账）。
 *
 * 用法：
 *   node scripts/check-css-namespace.mjs              # 判据（挂 npm run check）
 *   node scripts/check-css-namespace.mjs --self-test  # 判据自测（正控会绿 + 负控会红）
 * 退出码 0 = 合规；1 = 违规（打印到 stderr）。
 */

import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import {
  bareClassDefinitions,
  keyframeDefinitions,
  stripComments,
  tokenDefinitions,
  judgeTokenScope,
  TOKEN_WHY,
  selectorFormSites,
  animationRefs,
  hasIdSelector,
} from "./lib/css-selectors.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/* ── 🔴 宿主域（E6#109o-b 起**三处逐字一致**）─────────────────────────────────

   判据③（类名结构性）／判据⑩（宿主基线块）／探针 `runtime-style-audit.mjs` 的 `host` 归属域
   ——三处必须是**同一句**。1.22 实机抓到过不一致（`src/App.css` 在探针域内、却不在判据③ 域内
   ⇒ 「宿主自己定义的类名 100% 是 `ldk-`」按门禁口径为假）；1.25 裁决 (a)＝**对齐域**，1.26 落地。

   ⚠️ **域可以按判据分别设定**（1.24 已实证：判据⑨ 的域是更宽的 `src/**\/*.css`）——但「宿主域」这个名字
   只有一个定义。改这一行必须同笔改 `scripts/css-selector-baseline.json` 的 `domain.files`
   ＋ 探针 `PARTY_RULES` 的两条 host 规则（两处消费方各有断言钉住这一次漂移）。 */
export const HOST_DOMAIN = ["src/*.css", "src/pool/**"];

/** 宿主域的文件集合（非递归 `src/*.css` ＋ 递归 `src/pool/**`）——判据③ 与判据⑩ 共用 */
function hostDomainFiles(root = ROOT) {
  let entries = [];
  try {
    entries = readdirSync(join(root, "src"), { withFileTypes: true });
  } catch {
    return []; // 自测夹具里没有 src/ 时安静回空（walk() 同款行为）
  }
  const top = entries.filter((e) => e.isFile() && e.name.endsWith(".css")).map((e) => join(root, "src", e.name));
  return [...top, ...walk(join(root, "src", "pool"), (n) => n.endsWith(".css"))];
}

/* ── 登记表（**单一真相源在 SDK 包里**，本脚本与插件侧检查腿读同一份）────────

   🔴 为什么不写在脚本里：同一张表要发给**插件作者**（`@linkdesk/plugin-sdk` 的
   check-css-namespace 腿，插件仓 CI 跑）——写在壳脚本里就得再抄一份到 SDK（两份必漂）。
   真相源 = `packages/plugin-sdk/schemas/reserved-class-names.json`（随 npm 包下发，
   作者也能自己读）。本脚本额外做**反向核对**（登记 ↔ 实况），防止表烂掉。
   ⚠️ E6#109l-b 删掉 `classes` 整块后，本脚本读它的 `keyframes` 段（`classes` 已无消费方；
       SDK 侧 `loadReservedNames()` 对缺失的 `classes` 是「空表」语义，不崩、只是那条腿不再有输入
       —— 那条既有空转腿的处置点名给了件 8／1.28）。 */

const RESERVED_FILE_REL = "packages/plugin-sdk/schemas/reserved-class-names.json";

/** 读登记表：→ { keyframes: string[] } */
function loadRegistry(root = ROOT) {
  const file = join(root, RESERVED_FILE_REL);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return { keyframes: (raw.keyframes ?? []).map((k) => k.name) };
}

/* ── 解析 ────────────────────────────────────────────────────────────
   🔴 口径**不在本文件**：`splitSelector` / `hasAncestor` / `subjectOf` / 「什么算一个独立定义」
   全部来自 `scripts/lib/css-selectors.mjs`——**同一份实现**也被运行时探针
   `scripts/runtime-style-audit.mjs` 用（E6#109m 抽出的）。理由见 22 号档 §一 层 3：
   本系列的真根因就是**尺子不止一把**；「静态说干净、运行时说撞车」时没人知道该信谁。
   本文件只负责「**扫哪些目录、拿什么去比对**」，不负责「什么算一个定义」。 */

/** 收集一个 CSS 文件里的：独立定义类名、关键帧名（口径 = lib，见上） */
function parseCss(file) {
  const cleaned = stripComments(readFileSync(file, "utf8"));
  return {
    bareDefs: new Set(bareClassDefinitions(cleaned).map((d) => d.name)),
    keyframes: new Set(keyframeDefinitions(cleaned).map((d) => d.name)),
  };
}

/** 递归收集某目录下的文件 */
function walk(dir, test, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, test, out);
    else if (test(e.name)) out.push(full);
  }
  return out;
}

/**
 * 判据⑨ 的巡检单元：宿主 ＋ 共享组件域（`src/**\/*.css`）的全部 token 定义点。
 * 一处 = `{ file, party, name, selector, line, scope }`；域与「谁定义的」在这里定一次，
 * 判级一律交给 `lib` 的 `judgeTokenScope()`（本文件不自带第二条判定路径）。
 */
export function tokenSites(root = ROOT) {
  const out = [];
  for (const f of walk(join(root, "src"), (n) => n.endsWith(".css"))) {
    const rel = relative(root, f).replace(/\\/g, "/");
    // 共享组件域是独立的一方（与宿主**共用**同一个 `ldk-` 命名空间，判据⑥），其余 = 宿主
    const party = rel.startsWith("src/components/shared/") ? "shared" : "host";
    for (const def of tokenDefinitions(stripComments(readFileSync(f, "utf8")))) {
      out.push({ ...def, file: rel, party });
    }
  }
  return out;
}

/** 源码里渲染/查询过的 class 名 token —— ⚠️ 目前**没有消费方**（唯一用户判据② 已退役）。
 *  E6#109l-b 起不再需要：判据①③ 是结构性的（看定义、不看渲染点）。
 *  留此说明以防「这个函数怎么没了」——真要用请连同判据一起加回来，别留悬空工具。 */

/* ── 选择器形态轴（E6#109o-b · 轮次 1.26）─────────────────────────────────

   判据⑦（族段规则）· 判据⑧（关键帧引用不悬空）· 判据⑩（宿主基线块）＋ 壳内夹具扫描。
   口径**不在本文件**：`formOf()` / `selectorFormSites()` / `animationRefs()` 全部来自 lib——
   与运行时探针（`runtime-style-audit.mjs` 的轴 ④）**同一份实现**，探针就是这一层的运行时镜像。
   本文件只负责「扫哪些目录、拿什么去比对」。 */

/** 基线登记表（**门禁与探针共读**＝同源；登记 = 文件 ＋ 条数，**零名字清单**） */
const SELECTOR_BASELINE_REL = "scripts/css-selector-baseline.json";

/** 读基线登记表。读不到 ⇒ 抛（由 runChecks 转成 🔴 —— 「登记表读不到」= 基线判据瞎了，不许静默放过） */
export function loadSelectorBaseline(root = ROOT) {
  return JSON.parse(readFileSync(join(root, SELECTOR_BASELINE_REL), "utf8"));
}

/** 判据⑩ 的站点：宿主域里 `formOf()` 为 **anchorless ∧ top** 的每个 compound（**逐条带文件:行**）。 */
export function hostBaselineSites(root = ROOT) {
  const out = [];
  for (const f of hostDomainFiles(root)) {
    const rel = relative(root, f).replace(/\\/g, "/");
    for (const s of selectorFormSites(stripComments(readFileSync(f, "utf8")))) {
      if (s.form.kind !== "anchorless" || !s.form.top) continue;
      out.push({ file: rel, line: s.line, selector: s.selector, purePseudo: s.form.purePseudo });
    }
  }
  return out;
}

/** 共享组件域的**族根**：目录内所有 `ldk-*` 名的**共同族根**（= 「其余名字都是它延伸
 *  （`-`／`__`／相等）」的那个最短 `ldk-*` 名）。无共同族根 ⇒ `null`（调用方按「取最短名」兜底并报红）。 */
export function familyRootOf(names) {
  const uniq = [...new Set(names.filter((n) => n.startsWith("ldk-")))].sort();
  if (uniq.length === 0) return null;
  if (uniq.length === 1) return uniq[0];
  let p = uniq[0];
  for (const n of uniq) while (!n.startsWith(p)) p = p.slice(0, -1);
  p = p.replace(/[-_]+$/, "");
  if (p === "ldk" || p === "ldk-" || p === "") return null;
  return uniq.every((n) => n === p || n.startsWith(p + "-") || n.startsWith(p + "__")) ? p : null;
}

/** 共享组件**组件目录**（`src/components/shared/<dir>/…` 的 `<dir>`；文件直接躺在域根时记 `(根)`） */
function sharedComponentDir(rel) {
  const rest = rel.slice("src/components/shared/".length);
  const parts = rest.split("/");
  return parts.length > 1 ? parts[0] : "(根)";
}

/* ── 判据 ──────────────────────────────────────────────────────────── */

/** 跑全部判据；返回 violations: [{ kind, msg }] */
export function runChecks(root = ROOT, registry = loadRegistry(root)) {
  const violations = [];
  const sharedDir = join(root, "src", "components", "shared");

  // ① 共享组件独立定义必须 `ldk-` 开头——**结构性判定**（E6#109l-b 起）
  //    域 = `src/components/shared/**`（`@linkdesk/ui` 的单一真源；它的 CSS 会打进插件 bundle）。
  //    规则与宿主侧同款、同一句话：**自己定义的类名一律 `ldk-` 开头**（不查表、无白名单）。
  //    ⚠️ 退役说明见文件头判据②——原「跨组件借用」的输入是「共享组件的裸定义」，已清零。
  const sharedCss = walk(sharedDir, (n) => n.endsWith(".css"));
  const sharedDefsNow = new Set(); // 共享组件域的 `ldk-` 独立定义（供判据⑥ 用）
  for (const f of sharedCss) {
    for (const name of parseCss(f).bareDefs) {
      if (name.startsWith("ldk-")) {
        sharedDefsNow.add(name);
        continue;
      }
      violations.push({
        kind: "shared-bare-unprefixed",
        msg: `共享组件独立定义 .${name}（${relative(root, f).replace(/\\/g, "/")}）不带 \`ldk-\` 前缀——` +
          `它随共享组件 CSS 进入池文档（宿主 + 共享组件 + 所有已加载插件同一张表），是跨方公共标识符（硬约束 23）。` +
          `共享组件侧的规则只有一条：**自己定义的类名一律 \`ldk-\` 开头**（不需要登记、也没有白名单）。` +
          `改法：把名字并进本组件目录的族段（形如 .ldk-<目录组件族>-<元素>），并同笔改渲染它的 TSX/测试与 .css 里的复合/动画引用。`,
      });
    }
  }

  // ② 【已退役】跨组件借用（原判据）——保留位号，不保留代码。
  //    它的输入 =「共享组件的**裸**定义」（`ownedBy`）；件 1 收完裸定义清零、1.21b 收完全部独立定义
  //    ⇒ 它从此报不出任何东西。**退役而不是留着**：每天跑绿却拦不住任何东西的判据 = 死代码，
  //    且比死代码更坏（给人「有门禁」的错觉）。替代：⑥（`ldk-` 名跨域唯一性）。
  //    ⚠️ 不许把它改成「共享组件的 `ldk-` 名被别的目录渲染」——`.form-row > .ldk-toggle` 这类
  //      **合法消费**（宿主给的输入框工具类 + 组件组合）会被误判成红。**判据必须零假红。**

  // ③ 宿主独立定义必须 `ldk-` 开头——**结构性判定**（E6#109l 起）
  //    🔴 **域 = `HOST_DOMAIN`（`src/*.css` ＋ `src/pool/**`）**——E6#109o-b（1.26）起**并进 `src/*.css`**：
  //       原先只有 `index.css` ⇒ `src/App.css` 的 `.app-shell` 落在域外，「宿主自己定义的类名 100% 是
  //       `ldk-`」这句话**按门禁口径为假**（1.22 实机抓到、1.25 裁决 (a) 对齐域）。此后它**无条件为真**，
  //       且与探针 `host` 归属域、基线登记表的 `domain.files` **三处逐字一致**（§六.3 的验收）。
  //    池入口 pool-main.tsx 引 index.css；壳窗口入口 main.tsx 引 index.css ＋ App.css —— 两者都在域内。
  //    ⇒ 与判据① 同为结构性 = 件 4 的**终态**（两个定义域一条规则：宿主与共享组件定义 = `ldk-` 开头）。
  const hostCssFiles = hostDomainFiles(root);
  const hostDefsNow = new Set();
  for (const f of hostCssFiles) {
    for (const name of parseCss(f).bareDefs) {
      hostDefsNow.add(name);
      if (name.startsWith("ldk-")) continue;
      violations.push({
        kind: "host-bare-unprefixed",
        msg: `宿主独立定义 .${name}（${relative(root, f).split("\\").join("/")}）不带 \`ldk-\` 前缀——` +
          `它随池文档进入所有插件视图，是跨仓公共标识符（硬约束 23）。宿主侧的规则只有一条：` +
          `**自己定义的类名一律 \`ldk-\` 开头**（不需要登记、也没有白名单）。` +
          `改法：改成 .ldk-${name}，并同笔改渲染它的 TSX 与 .css 里的复合/动画引用。`,
      });
    }
  }

  // ④ 关键帧跨方重名（共享组件 × 壳）
  const shellCss = walk(join(root, "src"), (n) => n.endsWith(".css")).filter(
    (f) => !relative(root, f).replace(/\\/g, "/").startsWith("src/components/shared/")
  );
  const sharedKf = new Set();
  for (const f of sharedCss) for (const k of parseCss(f).keyframes) sharedKf.add(k);
  const shellKf = new Map();
  for (const f of shellCss) for (const k of parseCss(f).keyframes) shellKf.set(k, relative(root, f).replace(/\\/g, "/"));
  for (const k of sharedKf) {
    if (shellKf.has(k)) {
      violations.push({
        kind: "keyframes-clash",
        msg: `@keyframes 跨方重名 "${k}"：共享组件与 ${shellKf.get(k)} 都定义了它——关键帧名是全局的，先加载者/后定义者互相覆盖。请加命名空间前缀。`,
      });
    }
  }

  // ⑥ `ldk-` 名跨域唯一性：宿主域 × 共享组件域 各自「独立定义」的同名 ⇒ 红（E6#109l-b 补）
  //    ⚠️ 只看**定义 × 定义**：`.form-row > .ldk-toggle`（共享组件消费宿主的 `ldk-input` 工具类）
  //      与 `.ldk-titlebar .ldk-button`（宿主 scoped 调优共享组件的按钮）是**设计内的消费边**，不算撞车。
  for (const name of sharedDefsNow) {
    if (hostDefsNow.has(name)) {
      violations.push({
        kind: "ldk-cross-domain-clash",
        msg: `\`ldk-\` 名跨域同名 "${name}"：宿主域与共享组件域**各自独立定义**了它——两个域共用同一个 ` +
          `\`ldk-\` 命名空间（E6#109l／1.21b 之后的事实），同名即意味着**宿主的元素会被共享组件的样式命中**` +
          `（\`.badge\` 案同形）。请给其中一侧换名——共享组件侧并入本目录族段，宿主侧用自己的语义名。`,
      });
    }
  }

  // ⑨ **token 作用域**（E6#109n-b · 轮次 1.24；规则正文见 31 号档 §一）——
  //    自定义属性（token）的**定义作用域**受结构约束：**作用域才是命名空间**（名字随你、地盘由构造判）。
  //    本仓能判的三条：
  //      V2  任何方定义 `ldk-*` 自定义属性 ⇒ 红（`ldk-` 整个命名空间属宿主，与类名/关键帧同一句）
  //      V3  宿主／共享组件的**文档级**定义越出契约块 ⇒ 红（契约块 = 文件级登记：`src/index.css` 的
  //          `:root` 与 `[data-theme="light"]`；里面放什么名字**不设名单**）
  //      V4  宿主／共享组件的**类限定**定义不含任何 `.ldk-*` 类 ⇒ 红（定义落在非自有子树）
  //    （V1/V5/V6 是**插件侧**的三条，壳仓够不着插件源码 ⇒ 在 SDK 的 `check-css-namespace` 腿，
  //      见 `packages/plugin-sdk/src/eslint/checks/token-scope.ts`；两条腿互不覆盖。）
  //    🔴 **域 = `src/**/*.css`（全部宿主 ＋ 共享组件 CSS）**，比判据③ 的域（`index.css` ＋ `src/pool/**`）**宽**：
  //      V3 要抓的正是「契约块之外冒出文档级定义」，域越宽越有意义。⚠️ **判据③（类名）的域不动**——
  //      `.app-shell` 那条域边界账归 26 号档 §5b（1.25 裁决）；**域可以按判据分别设定**。
  //    ⚠️ 判定体不在本文件：`judgeTokenScope()` 来自 `lib/css-selectors.mjs`——**运行时探针用的同一个函数**
  //      ⇒ 31 号档 §4.3 要的「判级文案与门禁逐字一致」由构造保证（不是靠人抄）。
  const tokenSitesNow = tokenSites(root);
  for (const site of tokenSitesNow) {
    const { file: rel, name, selector, line, scope, party } = site;
    const verdict = judgeTokenScope({ party, name, scope, compound: selector, file: rel });
    if (verdict.level !== "red") continue; // 黄 / 不在射程内 ⇒ 只报不拦（本仓今天不产生黄）
    violations.push({
      kind: `token-scope-${verdict.code.toLowerCase()}`,
      msg:
        `[${verdict.code}] ${rel}:${line}  \`${selector} { --${name}: … }\`——${verdict.why} ` +
        (verdict.code === "V3"
          ? `改法：定义搬进自有命名空间的类之下（\`.ldk-*\`）；契约块只有 \`src/index.css\` 的 \`:root\` 与 \`[data-theme=…]\` 两块。`
          : verdict.code === "V4"
            ? `改法：把定义搬到自有根类之下（如 \`.ldk-<你的族段>-root { --${name}: … }\`）。`
            : `改法：换成自有语义名（契约名归宿主）——自定义属性不得以 \`ldk-\` 开头。`),
    });
  }

  /* ── ⑦⑧⑩ ＋ 壳内夹具：**选择器形态轴**（E6#109o-b · 轮次 1.26）────────────────────
     规则正文 = 32-任务-选择器形态轴门禁与落地.md §一（R0–R3）/§三.2。
     一句话：**类名与 id 是「名字锚」；元素 / 通配 / 属性 / 伪类 / 伪元素不是** ——
     后者**不需要与任何人同名**就能命中别人的元素（一条 `button { }` 静默改掉所有人的按钮），
     而它们在两侧门禁里**此前根本不存在**。
     ⚠️ 形态一律用 lib 的 `formOf()` 判——**不许**用 `hasAncestor()`／`subjectOf()`
       （F3：它们把 `.x :pseudo` 误判成 `.x` 的一次顶层定义 ⇒ 会造出假红；那条偏差属轴 ①、已冻结）。 */

  // ⑦ 共享组件**族段规则**——每个组件目录内的 `ldk-*` 独立定义必须与**目录族**一致
  const sharedByDir = new Map();
  for (const f of sharedCss) {
    const rel = relative(root, f).replace(/\\/g, "/");
    const dir = sharedComponentDir(rel);
    const names = [...parseCss(f).bareDefs].filter((n) => n.startsWith("ldk-"));
    sharedByDir.set(dir, [...(sharedByDir.get(dir) ?? []), ...names]);
  }
  for (const [dir, names] of sharedByDir) {
    if (names.length === 0) continue;
    // 族根 = 目录内 `ldk-*` 名的**共同族根**；退化（并列两个不相干的族）⇒ 取最短名兜底 —— 此时
    // 其余名字都会落在下面那条 red 上（正是我们要的：报出来，让人重新起名）。
    const family =
      familyRootOf(names) ??
      [...new Set(names)].sort((a, b) => a.length - b.length || a.localeCompare(b))[0];
    const fam = family.slice("ldk-".length);
    for (const name of new Set(names)) {
      if (name === family || name.startsWith(`${family}-`) || name.startsWith(`${family}__`)) continue;
      violations.push({
        kind: "shared-family-mismatch",
        msg: `共享组件族段越界：\`src/components/shared/${dir}/\` 定义了 .${name}，而本目录的族是 ` +
          `"${fam}"（族根 .${family}，由目录内共同族根推定）——同一目录里的 \`ldk-*\` 独立定义必须与目录族一致 ` +
          `（BEM 修饰 \`--\` 与元素后缀 \`__\` 允许）。` +
          `改法：并进本目录族（.${family}-… ／ .${family}__…），并同笔改渲染它的 TSX/测试与 .css 里的复合、动画引用。` +
          `⛔ 不要用「换个短前缀」绕过：族段规则是**新组件自成一个族段**这件事的机械守卫。`,
      });
    }
  }

  // ⑧ 关键帧引用不悬空——`animation` / `animation-name` 引用的名字必须在**同方**有 `@keyframes`
  //    同方 = 宿主编译域（宿主域 ＋ 共享组件域）：两边最终进同一张表，且宿主/共享共用 `ldk-` 空间。
  const allowedKeyframes = new Set([...sharedKf, ...shellKf.keys()]);
  for (const f of [...hostDomainFiles(root), ...sharedCss]) {
    const rel = relative(root, f).replace(/\\/g, "/");
    for (const ref of animationRefs(stripComments(readFileSync(f, "utf8")))) {
      if (allowedKeyframes.has(ref.name)) continue;
      violations.push({
        kind: "animation-ref-dangling",
        msg: `${rel}:${ref.line}  \`${ref.decl}: … ${ref.name} …\` 引用的关键帧 "${ref.name}" 在本方` +
          `（宿主域 ＋ 共享组件域，共 ${allowedKeyframes.size} 个）**没有 \`@keyframes\` 定义**——` +
          `症状是**动画静默消失**（不报错、不抛异常）。1.21／1.21b 把关键帧名全改成 \`ldk-*\` ⇒` +
          `「改名忘改引用」是这条判据的**真实发生率**来源。` +
          `改法：要么补 \`@keyframes ${ref.name}\`，要么把引用改成真实存在的名字（两处同笔改）。`,
      });
    }
  }

  // ⑩ 宿主**基线块**（R1）——顶层「无名字锚」选择器只允许出现在登记文件里（**文件 ＋ 条数**）
  //    ⚠️ 登记表读不到 ⇒ **fail-closed 红**（基线判据瞎了 ≠ 合规）。
  let selectorBaseline = null;
  let baselineError = null;
  try {
    selectorBaseline = loadSelectorBaseline(root);
  } catch (e) {
    baselineError = e instanceof Error ? e.message : String(e);
  }
  if (baselineError) {
    violations.push({
      kind: "selector-baseline-missing",
      msg: `宿主基线登记表读不到（${SELECTOR_BASELINE_REL}）：${baselineError}——判据⑩ 以它为唯一真相源，` +
        `读不到就判不了「哪几条基线是**有意的**」⇒ **fail-closed 报红**（静默放过 = 这条判据变瞎子）。`,
    });
  } else {
    if (JSON.stringify(selectorBaseline.domain?.files) !== JSON.stringify(HOST_DOMAIN)) {
      violations.push({
        kind: "selector-baseline-domain-drift",
        msg: `基线登记表声明的宿主域 ${JSON.stringify(selectorBaseline.domain?.files)} 与判据③⑩ 的域 ` +
          `${JSON.stringify(HOST_DOMAIN)} **不一致**——「域不一致」就是「尺子不止一把」（本系列的病根）。` +
          `改域必须同笔改三处：本脚本的 \`HOST_DOMAIN\` · 登记表的 \`domain.files\` · 探针 \`PARTY_RULES\` 的 host 两条。`,
      });
    }
    const registered = new Map((selectorBaseline.files ?? []).map((x) => [x.file, x.count]));
    const actualByFile = new Map();
    for (const s of hostBaselineSites(root)) {
      actualByFile.set(s.file, [...(actualByFile.get(s.file) ?? []), s]);
    }
    for (const file of new Set([...actualByFile.keys(), ...registered.keys()])) {
      const list = actualByFile.get(file) ?? [];
      if (!registered.has(file)) {
        violations.push({
          kind: "host-baseline-outside",
          msg: `宿主基线之外出现顶层「无名字锚」选择器 ${list.length} 处（${file}）：` +
            `${list.map((s) => `${file}:${s.line} \`${s.selector}\``).join(" · ")}——` +
            `这类选择器**不需要与任何人同名**就能命中宿主与他方的元素（宿主、共享组件、所有已加载插件同表）。` +
            `改法：挂到自有命名空间之下（\`.ldk-… select { }\`——注意**带锚**就不在本判据射程内）；` +
            `确实是有意的共享基线 ⇒ **不许静默加**：把它并进基线文件（今天 = \`src/index.css\` 的文档级区块）` +
            `**并同笔改 ${SELECTOR_BASELINE_REL} 的条数**（那是一次显式动作，且会被下面这条条数守卫盯住）。`,
        });
        continue;
      }
      const want = registered.get(file);
      if (want !== list.length) {
        violations.push({
          kind: "host-baseline-count",
          msg: `宿主基线**条数守卫**：${file} 实况 ${list.length} 条顶层无锚选择器，登记 ${want} 条——` +
            `不一致即红（新增一条基线**必须同笔**改登记数，删掉一条也一样）。实况逐条：` +
            `${list.map((s) => `:${s.line} \`${s.selector}\``).join(" · ")}。` +
            `⇒ 这不是「数字对不上」这种小事：它正是「静默加一条跨方泄漏」与「静默去掉一条基线」的**唯一传感器**。`,
        });
      }
    }
  }

  // ⑪ 的**壳内夹具**（E6#109o-b）：`plugins/**` ＋ `dev-fixtures/**` 的 CSS 里没有「基线区块」这个概念
  //    ⇒ 任何**无锚选择器**站点 ⇒ 红（插件侧 R2）。今天实测 0 处（纯预防）。
  //    ⚠️ 夹具的 `dist/`（构建产物）由 `walk()` 跳过——产物不该被源码门禁管（那是打包期的事）。
  //    ⚠️ R3（跨方命中必须自带自有命名空间）在夹具侧**不做**：它需要「本仓 pluginId」，而夹具不是
  //       插件工程（没有可解析的 plugin.json 身份链）⇒ 如实登记为边界（32 号档 §七 的夹具那行只点 ⑪）。
  const fixtureCss = [
    ...walk(join(root, "plugins"), (n) => n.endsWith(".css")),
    ...walk(join(root, "dev-fixtures"), (n) => n.endsWith(".css")),
  ];
  for (const f of fixtureCss) {
    const rel = relative(root, f).replace(/\\/g, "/");
    for (const s of selectorFormSites(stripComments(readFileSync(f, "utf8")))) {
      // R2 的形态：**无锚**（元素/通配/属性/伪类/伪元素）**或含 id** —— 一视同仁（32 号档 §四）
      const anchorless = s.form.kind === "anchorless";
      const byId = hasIdSelector(s.selector);
      if (!anchorless && !byId) continue;
      violations.push({
        kind: "plugin-anchorless-selector",
        msg: `${rel}:${s.line}  \`${s.selector}\`——插件 CSS 里的**${byId ? "id 选择器" : "无锚选择器"}**（R2：` +
          `元素 / 通配 / 属性 / 伪类 / 伪元素 / **id** 一视同仁；顶层或限定一律禁）。插件视图的一张样式表里同时装着 ` +
          `宿主 ＋ 共享组件 ＋ **所有已加载插件**的 CSS ⇒ 这类选择器命中「该文档里所有那一类元素」，与谁渲染无关` +
          `${byId ? "（id 还额外是全局的、可猜的，优先级高于类）" : ""}。` +
          `改法：挂在自己的根类之下（\`.panel-demo-root input { … }\`／用类替掉 id）。`,
      });
    }
  }

  // ⑤ 反向核对：登记表 ↔ 实况（表是发给插件作者的数据，烂了会误导 + 假绿）
  //    ⚠️ E6#109l-b 起**只剩 `keyframes` 段**——`classes` 整块已删（判据①③ 双双结构性后无消费方）。
  const actualKf = new Set([...sharedKf, ...shellKf.keys()]);
  for (const name of registry.keyframes ?? []) {
    if (!actualKf.has(name)) {
      violations.push({
        kind: "registry-stale",
        msg: `登记表里的关键帧 "${name}" 已不存在于共享组件/壳 CSS——请从 ${RESERVED_FILE_REL} 的 keyframes 摘掉。`,
      });
    }
  }
  for (const k of actualKf) {
    if (!(registry.keyframes ?? []).includes(k)) {
      violations.push({
        kind: "keyframes-unregistered",
        msg: `关键帧 "${k}" 未登记（共享组件/壳实际定义了它）——插件作者会以为这个名字可用。请补进 ${RESERVED_FILE_REL} 的 keyframes。`,
      });
    }
  }

  return violations;
}

/* ── 自测（正控会绿 / 负控会红）────────────────────────────────────── */

function selfTest() {
  const cases = [];
  const tmp = mkdtempSync(join(tmpdir(), "ldk-css-ns-"));
  const mk = (rel, content) => {
    const full = join(tmp, rel);
    mkdirSync(dirname(full), { recursive: true }); // 判据⑨ 的夹具要落到 `src/pool/**` 深层
    writeFileSync(full, content, { flag: "w", encoding: "utf8" });
  };
  const setup = () => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(join(tmp, "src", "components", "shared", "toggle"), { recursive: true });
    mkdirSync(join(tmp, "src", "components", "shared", "theme-picker"), { recursive: true });
    mkdirSync(join(tmp, "src"), { recursive: true });
    mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { background: red; }\n");
    mk("src/components/shared/toggle/Toggle.tsx", 'export const T = () => <div className="ldk-toggle" />;\n');
    mk("src/index.css", ".ldk-input { background: var(--bg-input); }\n");
    mk("src/App.tsx", "export const A = () => <div className='x' />;\n");
    // 判据⑩ 的基线登记表（夹具默认「任何文件都不许有顶层无锚站点」）——E6#109o-b 起它是 ⑩ 的
    // 唯一真相源，且它声明的 `domain.files` 必须与 `HOST_DOMAIN` 逐字一致（域漂移会另报一条红）。
    mkBaseline({ files: [] });
  };
  /** 写夹具的基线登记表（`files` = [{file,count}]） */
  const mkBaseline = (body) => {
    mk(
      "scripts/css-selector-baseline.json",
      JSON.stringify({ why: "(夹具)", domain: { files: HOST_DOMAIN }, ...body }, null, 1)
    );
  };
  const registry = { keyframes: [] };

  // 正控：两域都 `ldk-` 化 ＋ 关键帧表一致 ⇒ 零违规（**终态**：判据①③ 双双结构性）
  setup();
  cases.push(["正控：两域独立定义均 `ldk-` ＋ 无关键帧 ⇒ 绿（终态）", runChecks(tmp, registry).length === 0]);

  // 负控①：共享组件**带连字符**的独立定义（`.foo-bar`）⇒ 红
  //   🔴 这正是旧启发式（`name.includes("-") ? 跳过`）漏掉的那一整类——1.21b 把判据① 转结构性就为它。
  setup();
  mk("src/components/shared/theme-picker/ThemePicker.css", ".foo-bar { color: red; }\n");
  cases.push(["负控①：共享组件带连字符的裸定义 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "shared-bare-unprefixed")]);

  // 负控①b：共享组件**不带连字符**的独立定义（`.mybrand`）同样红（不是「只拦带连字符的」）
  setup();
  mk("src/components/shared/theme-picker/ThemePicker.css", ".mybrand { color: red; }\n");
  cases.push(["负控①b：共享组件不带连字符的裸定义 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "shared-bare-unprefixed")]);

  // 🔴 tripwire（**已翻面**——混合态结束的钉子）：同一份 `.foo-bar` 放共享组件与放宿主**两侧都报**。
  //   E6#109l（宿主转结构性）与本格（共享组件转结构性）之间那段混合态里，这条断言是「共享组件侧不报」；
  //   件 4 收官后它翻成「两侧同为结构性」。⇒ 它同时钉住「判据①③ 形态一致」这件事本身。
  setup();
  mk("src/components/shared/theme-picker/ThemePicker.css", ".foo-bar { color: red; }\n");
  mk("src/index.css", ".ldk-input { color: red; }\n.foo-bar { color: blue; }\n");
  {
    const ks = new Set(runChecks(tmp, registry).map((v) => v.kind));
    cases.push([
      "tripwire（翻面）：同一 `.foo-bar` 放共享组件与宿主两侧都报 ⇒ 判据①③ 同为结构性（终态）",
      ks.has("shared-bare-unprefixed") && ks.has("host-bare-unprefixed"),
    ]);
  }

  // 负控②：宿主**带连字符**的独立定义（`.foo-bar`）⇒ 红（E6#109l 加的，保留）
  setup();
  mk("src/index.css", ".ldk-input { color: red; }\n.foo-bar { color: blue; }\n");
  cases.push(["负控②：宿主带连字符的裸定义 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "host-bare-unprefixed")]);

  // 负控②b：宿主不带连字符的裸定义（`.mybrand`）⇒ 红
  setup();
  mk("src/index.css", ".mybrand { color: blue; }\n");
  cases.push(["负控②b：宿主不带连字符的裸定义 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "host-bare-unprefixed")]);

  // 负控③：**判据⑥**——宿主定义了一条共享组件已有的 `ldk-` 名（演示目录组件 `ldk-toggle`）
  setup();
  mk("src/index.css", ".ldk-input { color: red; }\n.ldk-toggle { color: blue; }\n");
  cases.push(["负控③：`ldk-` 名跨域同名 ⇒ 红（判据⑥）", runChecks(tmp, registry).some((v) => v.kind === "ldk-cross-domain-clash")]);

  // 正控⑥：**消费边不算撞车**——共享组件 CSS 里 scoped 消费宿主的 `ldk-input`、宿主 scoped 调优 `ldk-toggle`
  //   （判据⑥ 只看「定义 × 定义」；这两条是文档明写的设计内消费）
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { background: red; }\n.ldk-form-row > .ldk-input { flex-shrink: 0; }\n");
  mk("src/index.css", ".ldk-input { background: var(--bg-input); }\n.ldk-titlebar .ldk-toggle { margin: 0; }\n");
  cases.push(["正控⑥：scoped 消费/调优（有祖先）不算跨域撞车 ⇒ 绿", runChecks(tmp, registry).length === 0]);

  // 负控④：关键帧重名
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { animation: fade-in 1s; }\n@keyframes fade-in { to { opacity: 1 } }\n");
  mk("src/App.css", "@keyframes fade-in { to { opacity: 0 } }\n");
  cases.push(["负控④：关键帧重名 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "keyframes-clash")]);

  // 负控⑤：关键帧未登记（实况有、表里没有 ⇒ 插件作者会以为该名字可用）
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { animation: my-in 1s; }\n@keyframes my-in { to { opacity: 1 } }\n");
  cases.push(["负控⑤：关键帧未登记 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "keyframes-unregistered")]);

  // 负控⑥：登记过期（表里的关键帧实况已不存在 ⇒ 发给作者的清单在误导）
  //   ⚠️ `classes` 整块已删（E6#109l-b）⇒ 登记过期只剩关键帧这一条腿。
  setup();
  cases.push(["负控⑥：登记过期（关键帧）⇒ 红", runChecks(tmp, { keyframes: ["gone-anim"] }).filter((v) => v.kind === "registry-stale").length === 1]);

  /* ── 判据⑨（token 作用域 · E6#109n-b）────────────────────────────────
     🔴 正控条数 ≥ 负控条数（件 2 立下的纪律）：判据**不许朝严的方向腐烂** ⇒
        每一条「该红的」旁边都配一条「长得很像但该绿的」。 */

  // 负控⑦：宿主把文档级定义写在契约块之外 ⇒ V3（**带连字符的名字照样红** ⇒ 尺子不是「连字符即安全」）
  setup();
  mk("src/pool/views/about/AboutView.css", ":root { --shadow-tiny: red; }\n");
  cases.push([
    "负控⑦：宿主非契约文件里的文档级定义 ⇒ 红（判据⑨ V3；带连字符的名字照样红）",
    runChecks(tmp, registry).some((v) => v.kind === "token-scope-v3"),
  ]);

  // 负控⑧：共享组件挂非自有类 ⇒ V4
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { background: red; }\n.foo-bar { --x: 1; }\n");
  cases.push(["负控⑧：共享组件类限定定义挂非自有类 ⇒ 红（判据⑨ V4）", runChecks(tmp, registry).some((v) => v.kind === "token-scope-v4")]);

  // 负控⑨：共享组件在文档级定义（且带 `ldk-` 名）⇒ **V3**（这条钉住「共享组件也在宿主文档级约束内」）
  //   ——同一站点同时命中 V3 与 V2，判级**只报最具体的一条**（先 V3、过契约块后才落到 V2）；
  //   V2 的「与作用域无关」由下一条（负控⑩）单独钉。
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { background: red; }\n:root { --ldk-toggle-bg: red; }\n");
  {
    const kinds = runChecks(tmp, registry).map((v) => v.kind);
    cases.push([
      "负控⑨：共享组件文档级定义 ⇒ 红 V3（共享组件也在宿主文档级约束内）",
      kinds.includes("token-scope-v3") && kinds.filter((k) => k.startsWith("token-scope-")).length === 1,
    ]);
  }

  // 负控⑩：宿主在**类限定**下定义 `ldk-*` 自定义属性 ⇒ V2（**与作用域无关**：名字层一句话）
  setup();
  mk("src/index.css", ".ldk-input { --ldk-input-bg: red; }\n");
  cases.push(["负控⑩：`ldk-*` 自定义属性即便挂在自有类之下也红（V2，名字层一句话）", runChecks(tmp, registry).some((v) => v.kind === "token-scope-v2")]);

  // 正控⑦：契约块里的文档级定义 ⇒ 绿（`index.css` 的 `:root` 与 `[data-theme="light"]` 是**文件级**登记）
  //   ⚠️ E6#109o-b 起这两条同时是判据⑩ 的基线站点 ⇒ 夹具必须登记它们（这正是「登记域」的真实形态：
  //     **同一批文档级选择器**在判据⑨ 眼里是契约块、在判据⑩ 眼里是基线块 —— 两个判据、同一处事实）。
  setup();
  mk("src/index.css", ':root { --bg-window: #111; }\n[data-theme="light"] { --bg-window: #eee; }\n');
  mkBaseline({ files: [{ file: "src/index.css", count: 2 }] });
  cases.push(["正控⑦：契约块（`src/index.css` 的 `:root` / `[data-theme=…]`）里的文档级定义 ⇒ 绿", runChecks(tmp, registry).length === 0]);

  // 正控⑧：类限定 + 自有类（**名字随你、无需前缀**）⇒ 绿
  setup();
  mk("src/index.css", ".ldk-panel-zone { --panel-inset: 4px; }\n");
  cases.push(["正控⑧：类限定定义挂在自有类之下（名字不带前缀也合规）⇒ 绿", runChecks(tmp, registry).length === 0]);

  // 正控⑨：**`(c)` portal 面的浮层宿主根**（id 作用域）⇒ 绿（放宽的是「元素归谁」，不是「名字归谁」）
  setup();
  mk("src/index.css", "#ld-float-layer { --float-blur-floor: 8px; }\n");
  cases.push(["正控⑨：`#ld-float-layer` 的 token 定义 ⇒ 绿（判据⑨ (c) portal 面）", runChecks(tmp, registry).length === 0]);

  // 正控⑩：域扩到 `src/**` 之后，**类限定定义照样按类判**（`.ldk-*` 之下 ⇒ 绿，哪怕它不在 index.css）
  //   ——这条防的是「把域宽误当成把规则也变宽」。
  setup();
  mk("src/pool/views/about/AboutView.css", ".ldk-about-view { --about-gap: 8px; }\n");
  cases.push(["正控⑩：池域文件里的类限定定义（挂自有类）⇒ 绿（域宽 ≠ 规则宽）", runChecks(tmp, registry).length === 0]);

  // 锚⑦：**跨包文案同源** —— 判级文案在壳（本文件的 `TOKEN_WHY`，门禁与运行时探针共用）与
  //   SDK 腿（`packages/plugin-sdk/src/eslint/checks/token-scope.ts`）各一份（跨包无法 import）
  //   ⇒ 用锚词把两份钉在一起：**改一边不改另一边 ⇒ 自测当场红**（口径文本一致不靠自觉）。
  {
    const anchors = [
      "83 个只有样式表提供、引擎不写 inline", // V1
      "整个命名空间属宿主", // V2
      "跨方命中必须有自有根类作祖先", // V5
      "无人同吃", // V6
    ];
    const sdkSrc = readFileSync(join(ROOT, "packages", "plugin-sdk", "src", "eslint", "checks", "token-scope.ts"), "utf8");
    const shellText = Object.values(TOKEN_WHY).join("\n");
    cases.push([
      "锚⑦：判级文案壳 / SDK 同源（4 句锚词两边都在 ⇒ 改一边不改另一边必红）",
      anchors.every((a) => shellText.includes(a) && sdkSrc.includes(a)),
    ]);
  }

  // 锚⑥：**行号可映射** —— `stripComments` 保留换行（原先把换行也换成空格 ⇒ 多行注释后行号全部上移）。
  //   这条同时是 SDK 腿报点（`文件:行`）的前提。
  setup();
  mk("src/pool/views/about/AboutView.css", "/* 多行注释\n   第二行\n   第三行 */\n:root { --shadow-tiny: red; }\n");
  {
    const line = /AboutView\.css:(\d+)/.exec(runChecks(tmp, registry).find((v) => v.kind === "token-scope-v3")?.msg ?? "")?.[1];
    cases.push(["锚⑥：多行注释之后的定义点行号不乱（`stripComments` 保留换行）⇒ 报点在第 4 行", line === "4"]);
  }

  /* ── 判据⑦⑧⑩ ＋ 壳内夹具（**选择器形态轴** · E6#109o-b · 轮次 1.26）────────────
     🔴 正控条数 ≥ 负控条数（件 2 立下的纪律）：每条「该红的」旁边都配一条「长得很像但该绿的」。 */

  // 负控⑪：**基线文件之外**出现顶层无锚选择器（`button`）⇒ ⑩ 红
  setup();
  mk("src/pool/views/about/AboutView.css", "button { color: red; }\n");
  cases.push([
    "负控⑪：基线文件之外出现顶层无锚选择器 ⇒ 红（判据⑩ · R1）",
    runChecks(tmp, registry).some((v) => v.kind === "host-baseline-outside"),
  ]);

  // 负控⑫：**`@media` 内的规则同样是顶层**（相对它所在的层叠上下文无祖先）⇒ ⑩ 红
  setup();
  mk("src/pool/views/about/AboutView.css", "@media (min-width: 1px) { button { color: red } }\n");
  cases.push([
    "负控⑫：`@media` 内的无锚选择器**同样算顶层** ⇒ 红（判据⑩）",
    runChecks(tmp, registry).some((v) => v.kind === "host-baseline-outside" && /button/.test(v.msg)),
  ]);

  // 负控⑬：通配选择器落在基线文件之外 ⇒ ⑩ 红
  setup();
  mk("src/pool/views/about/AboutView.css", "* { margin: 0 }\n");
  cases.push([
    "负控⑬：`*` 落在基线文件之外 ⇒ 红（判据⑩）",
    runChecks(tmp, registry).some((v) => v.kind === "host-baseline-outside"),
  ]);

  // 负控⑭：**条数守卫**——基线文件里多塞一条顶层无锚（稳态 2 条被打破）⇒ ⑩ 红
  //   这条钉住「**静默加一条跨方泄漏**」这个动作：新增基线必须同笔改登记数 = 一次显式动作。
  setup();
  mk("src/index.css", ":root { --bg: #111 }\nhtml { height: 100% }\n");
  mkBaseline({ files: [{ file: "src/index.css", count: 2 }] });
  {
    const before = runChecks(tmp, registry).length === 0;
    mk("src/index.css", ":root { --bg: #111 }\nhtml { height: 100% }\ntextarea { resize: none }\n");
    const caught = runChecks(tmp, registry).some((v) => v.kind === "host-baseline-count");
    cases.push(["负控⑭：条数守卫（基线文件里多塞一条 ⇒ 站点数 ≠ 登记数）⇒ 红（判据⑩）", before && caught]);
  }

  // 负控⑭b：基线**域**漂移——登记表声明的宿主域 ≠ 判据③⑩ 的域 ⇒ 红
  //   （「域不一致」就是「尺子不止一把」：这条断言是它唯一的机械传感器。）
  setup();
  mkBaseline({ domain: { files: ["src/index.css", "src/pool/**"] }, files: [] });
  cases.push([
    "负控⑭b：登记表声明的宿主域与门禁的域不一致 ⇒ 红（域一致性断言）",
    runChecks(tmp, registry).some((v) => v.kind === "selector-baseline-domain-drift"),
  ]);

  // 负控⑭c：基线登记表**读不到** ⇒ fail-closed 红（静默放过 = 判据瞎了）
  setup();
  rmSync(join(tmp, "scripts", "css-selector-baseline.json"), { force: true });
  cases.push([
    "负控⑭c：基线登记表读不到 ⇒ fail-closed 红（判据⑩ 不许静默放过）",
    runChecks(tmp, registry).some((v) => v.kind === "selector-baseline-missing"),
  ]);

  // 负控⑮：共享组件目录里定义 `ldk-not-toggle`（族段 ≠ 目录族 `toggle`）⇒ ⑦ 红
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { background: red; }\n.ldk-not-toggle { color: red; }\n");
  cases.push([
    "负控⑮：共享组件目录里定义族外名字 ⇒ 红（判据⑦ 族段规则）",
    runChecks(tmp, registry).some((v) => v.kind === "shared-family-mismatch"),
  ]);

  // 负控⑯：`animation` 引用的关键帧没有定义 ⇒ ⑧ 红（症状是动画静默消失）
  setup();
  mk("src/pool/views/about/AboutView.css", ".ldk-about-view { animation: ldk-gone 1s; }\n");
  cases.push([
    "负控⑯：`animation` 引用的关键帧没有定义 ⇒ 红（判据⑧ 引用不悬空）",
    runChecks(tmp, registry).some((v) => v.kind === "animation-ref-dangling"),
  ]);

  // 负控⑰：壳内夹具（`plugins/**`）里的无锚选择器 ⇒ ⑪ 红（夹具没有「基线区块」这个概念）
  setup();
  mk("plugins/demo-fixture/src/styles/demo.css", "button { color: red; }\n");
  cases.push([
    "负控⑰：壳内夹具（`plugins/**`）里的无锚选择器 ⇒ 红（判据⑪ 的夹具面）",
    runChecks(tmp, registry).some((v) => v.kind === "plugin-anchorless-selector"),
  ]);

  // 负控⑰b：夹具里的 **id 选择器**同样红（R2 对 id 与元素一视同仁，32 号档 §四）
  setup();
  mk("plugins/demo-fixture/src/styles/demo.css", "#demo-hook { color: red; }\n");
  cases.push([
    "负控⑰b：壳内夹具里的 **id 选择器** ⇒ 同样红（R2 一视同仁）",
    runChecks(tmp, registry).some((v) => v.kind === "plugin-anchorless-selector" && /id 选择器/.test(v.msg)),
  ]);

  // 正控⑪：文档级基线**在基线文件里**且条数相等 ⇒ 绿（现况的等价夹具）
  setup();
  mk(
    "src/index.css",
    ":root { --bg: #111 }\nhtml, body { height: 100% }\n* { box-sizing: border-box }\n::-webkit-scrollbar { width: 4px }\n"
  );
  mkBaseline({ files: [{ file: "src/index.css", count: 5 }] });
  cases.push([
    "正控⑪：基线文件里的文档级基线 ＋ 条数相等 ⇒ 绿（判据⑩ 正控；含**纯伪元素形态**）",
    runChecks(tmp, registry).length === 0,
  ]);

  // 正控⑫：复合（`.ldk-toggle.on::after`）**不占基线站点**（有名字锚）⇒ 绿（与轴 ① 同口径）
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".ldk-toggle { background: red; }\n.ldk-toggle.on::after { color: red; }\n");
  cases.push([
    "正控⑫：共享组件复合选择器（`.ldk-toggle.on::after`）不算基线站点 ⇒ 绿",
    runChecks(tmp, registry).length === 0,
  ]);

  // 正控⑬：🔴 `@keyframes` 体内的 `from` / `to` **不是选择器**——不算站点（钉住 `maskKeyframes()`）
  setup();
  mk("src/index.css", ":root { --bg: #111 }\n@keyframes ldk-probe { from { opacity: 0 } to { opacity: 1 } }\n");
  mkBaseline({ files: [{ file: "src/index.css", count: 1 }] });
  cases.push([
    "正控⑬：`@keyframes` 体内的 `from`/`to` 不算站点（钉住 `maskKeyframes()`）⇒ 绿",
    runChecks(tmp, { keyframes: ["ldk-probe"] }).length === 0,
  ]);

  // 正控⑭：宿主域文件里写 `.ldk-about-view textarea { }`（**有类锚**）⇒ 绿（⑩ 只管网子锚的）
  setup();
  mk("src/pool/views/about/AboutView.css", ".ldk-about-view textarea { resize: none; }\n");
  cases.push([
    "正控⑭：挂自有类之下的元素样式（有锚）⇒ 绿（判据⑩ 的射程只有无锚）",
    runChecks(tmp, registry).length === 0,
  ]);

  // 正控⑮：族段**合规**形态——同目录内的 `--` 修饰与 `__` 元素后缀都算同族 ⇒ 绿
  setup();
  mk(
    "src/components/shared/toggle/Toggle.css",
    ".ldk-toggle { background: red; }\n.ldk-toggle--on { background: blue; }\n.ldk-toggle__knob { color: red; }\n"
  );
  cases.push([
    "正控⑮：同目录内 `--` 修饰 ／ `__` 元素后缀算同族 ⇒ 绿（判据⑦）",
    runChecks(tmp, registry).length === 0,
  ]);

  // 正控⑯：`animation` 引用的名字**在共享组件域**有定义（宿主域文件引用它）⇒ 绿
  //   （判据⑧ 的「同方」= 宿主域 ＋ 共享组件域——两边最终进同一张表，跨边引用是设计内形态。）
  setup();
  mk(
    "src/components/shared/toggle/Toggle.css",
    ".ldk-toggle { animation: ldk-toggle-in 0.15s; }\n@keyframes ldk-toggle-in { from { opacity: 0 } }\n"
  );
  mk("src/pool/views/about/AboutView.css", ".ldk-about-view { animation: ldk-toggle-in 1s; }\n");
  cases.push([
    "正控⑯：宿主域引用共享组件域定义的关键帧 ⇒ 绿（判据⑧ 的「同方」= 宿主域 ＋ 共享组件域）",
    runChecks(tmp, { keyframes: ["ldk-toggle-in"] }).length === 0,
  ]);

  // 锚⑧：**形态口径文案跨包同源**——`formOf()` 的锚词在壳 lib 与 SDK 的 `css-selectors.ts` 各一份
  //   （跨包无法 import ⇒ 只能钉文本；照 1.24 `锚⑦` 先例：改一边不改另一边 ⇒ 自测当场红）。
  {
    const anchors = ["纯伪类/纯伪元素主体 ⇒ 无锚（不是无主体）", "不是顶层无锚（F3 反面）"];
    const sdkSrc = readFileSync(join(ROOT, "packages", "plugin-sdk", "src", "eslint", "checks", "css-selectors.ts"), "utf8");
    const shellSrc = readFileSync(join(ROOT, "scripts", "lib", "css-selectors.mjs"), "utf8");
    cases.push([
      "锚⑧：`formOf()` 口径文案壳 / SDK 同源（2 句锚词两边都在 ⇒ 改一边不改另一边必红）",
      anchors.every((a) => shellSrc.includes(a) && sdkSrc.includes(a)),
    ]);
  }

  // 锚⑨：**关键帧名抽取口径跨包同源**（E6#112 · 2026-09-18）——`animationRefs()` 在主仓的域是
  //   宿主域 ＋ 共享组件域（判据⑧），在 SDK 是**插件域**（第 46 号档那条腿）；域不同、**抽取口径必须同一份**，
  //   否则「同一个 `animation:` 值，壳说有一个名字、SDK 说没有」——两边报点会各说各话。
  //   跨包无法 import ⇒ 照 `锚⑦`/`锚⑧` 先例钉文本：**改一边不改另一边 ⇒ 自测当场红**。
  //   4 句锚词各钉一件事：① 关键字表（漏一个 ⇒ 把时长/缓动当名字 ⇒ 假红）；
  //   ② `--*` 跳过（自定义属性名里含 "animation" 的一大把）；③ 那条跳过的**理由**（口径不是巧合）；
  //   ④ 属性名正则本体（放宽一位 ⇒ `animation-timing-function: linear` 当场变假红）。
  {
    const anchors = [
      '"none", "initial", "inherit", "unset", "revert", "revert-layer",',
      "--my-animation:",
      "会造出假红",
      "if (!/(^|-)animation(-name)?$/.test(prop)) continue;",
    ];
    const sdkSrc = readFileSync(join(ROOT, "packages", "plugin-sdk", "src", "eslint", "checks", "css-selectors.ts"), "utf8");
    const shellSrc = readFileSync(join(ROOT, "scripts", "lib", "css-selectors.mjs"), "utf8");
    cases.push([
      "锚⑨：`animationRefs()` 口径壳 / SDK 同源（4 句锚词两边都在 ⇒ 改一边不改另一边必红）",
      anchors.every((a) => shellSrc.includes(a) && sdkSrc.includes(a)),
    ]);
  }

  rmSync(tmp, { recursive: true, force: true });
  let ok = true;
  for (const [name, pass] of cases) {
    console.log(`  ${pass ? "✓" : "✗"} ${name}`);
    if (!pass) ok = false;
  }
  console.log(`check-css-namespace self-test ${ok ? "✔️ 全部符合预期（正控绿 / 负控红）" : "❌ 有判据不符预期"}`);
  process.exit(ok ? 0 : 1);
}

/* ── 入口 ──────────────────────────────────────────────────────────── */

const args = process.argv.slice(2);
if (args.includes("--self-test")) selfTest();

const violations = runChecks();
if (violations.length === 0) {
  const reg = loadRegistry();
  const tokens = tokenSites();
  const baselineSites = hostBaselineSites();
  const kfNames = new Set([
    ...walk(join(ROOT, "src", "components", "shared"), (n) => n.endsWith(".css")).flatMap((f) =>
      keyframeDefinitions(stripComments(readFileSync(f, "utf8"))).map((k) => k.name)
    ),
    ...hostDomainFiles().flatMap((f) => keyframeDefinitions(stripComments(readFileSync(f, "utf8"))).map((k) => k.name)),
  ]);
  console.log(
    `✅ [css-namespace] 两个定义域独立定义全部 \`ldk-\`（宿主 ／ 共享组件，判据①③ 结构性、零登记表）；` +
      `跨域同名 0；关键帧 ${reg.keyframes.length} 个与实况双向一致（引用不悬空，判据⑧）；` +
      `token 作用域（判据⑨，域 src/**/*.css）${tokens.length} 个定义点零越界；` +
      `共享组件族段（判据⑦）逐目录一致；壳内夹具无锚/id 选择器 0（判据⑪）。`
  );
  // 🔴 基线**逐条打印**（R1 的纪律）：让「哪几条」永远可见、不依赖任何人的记忆。
  console.log(
    `\n   宿主基线块（判据⑩ · R1）——域 ${HOST_DOMAIN.join(" ＋ ")}，登记 ` +
      `\`${SELECTOR_BASELINE_REL}\`（**文件 ＋ 条数**，零名字清单）：`
  );
  const byFile = new Map();
  for (const s of baselineSites) byFile.set(s.file, [...(byFile.get(s.file) ?? []), s]);
  for (const [file, list] of byFile) {
    console.log(`   · ${file}   ${list.length} 条（登记 ${list.length}）`);
    for (const s of list) console.log(`       :${String(s.line).padEnd(4)} ${s.selector}${s.purePseudo ? "   〔纯伪元素形态：无主体但**有意的**站点〕" : ""}`);
  }
  console.log(
    `   ⇒ 这 ${baselineSites.length} 处 = **有意的共享基线**（插件依赖它们、且可覆写；32 号档 §二.1 有逐条实证）。` +
      `\n   ⛔ 不许把基线当 bug 删（那是无障碍/布局地基）；🚫 也不许在基线文件里**静默加**一条——条数守卫会红。`
  );
  console.log(`\n   关键帧引用（判据⑧）：本方实际定义的 ${kfNames.size} 个名字可解析；悬空引用 0。`);
  process.exit(0);
}
console.error(`❌ [css-namespace] ${violations.length} 处违规（样式命名空间纪律）：`);
for (const v of violations) console.error(`   · [${v.kind}] ${v.msg}`);
console.error("   判据与登记表见 scripts/check-css-namespace.mjs 文件头；档案见 docs/…/01-插件独立构建/11-样式命名空间审计.md");
process.exit(1);
