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

import { readFileSync, readdirSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { bareClassDefinitions, keyframeDefinitions, stripComments } from "./lib/css-selectors.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

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

/** 源码里渲染/查询过的 class 名 token —— ⚠️ 目前**没有消费方**（唯一用户判据② 已退役）。
 *  E6#109l-b 起不再需要：判据①③ 是结构性的（看定义、不看渲染点）。
 *  留此说明以防「这个函数怎么没了」——真要用请连同判据一起加回来，别留悬空工具。 */

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

  // ③ 宿主独立定义必须 `ldk-` 开头——**结构性判定**（E6#109l 起；域 = 在池文档里生效的宿主 CSS：
  //    index.css + src/pool/**；池入口 pool-main.tsx 引 index.css，其余池组件样式随池 bundle 一起进同一张表）
  //    ⇒ 与判据① 同为结构性 = 件 4 的**终态**（两个定义域一条规则：宿主与共享组件定义 = `ldk-` 开头）。
  const hostCssFiles = [join(root, "src", "index.css"), ...walk(join(root, "src", "pool"), (n) => n.endsWith(".css"))].filter(
    (f) => statSync(f, { throwIfNoEntry: false })
  );
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
  console.log(
    `✅ [css-namespace] 两个定义域独立定义全部 \`ldk-\`（宿主 ／ 共享组件，判据①③ 结构性、零登记表）；` +
      `跨域同名 0；关键帧 ${reg.keyframes.length} 个与实况双向一致。`
  );
  process.exit(0);
}
console.error(`❌ [css-namespace] ${violations.length} 处违规（样式命名空间纪律）：`);
for (const v of violations) console.error(`   · [${v.kind}] ${v.msg}`);
console.error("   判据与登记表见 scripts/check-css-namespace.mjs 文件头；档案见 docs/…/01-插件独立构建/11-样式命名空间审计.md");
process.exit(1);
