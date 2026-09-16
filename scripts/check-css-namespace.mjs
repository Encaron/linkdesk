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
 *        判定体 = `lib/css-selectors.mjs` 的 `judgeTokenScope()`——**与运行时探针同一个函数**。
 *        ⚠️ 判据⑦⑧ 已预留给 1.26 的族段规则 / 关键帧引用不悬空，本轴取 ⑨。）
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
import {
  bareClassDefinitions,
  keyframeDefinitions,
  stripComments,
  tokenDefinitions,
  judgeTokenScope,
  TOKEN_WHY,
} from "./lib/css-selectors.mjs";

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
  setup();
  mk("src/index.css", ':root { --bg-window: #111; }\n[data-theme="light"] { --bg-window: #eee; }\n');
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
  console.log(
    `✅ [css-namespace] 两个定义域独立定义全部 \`ldk-\`（宿主 ／ 共享组件，判据①③ 结构性、零登记表）；` +
      `跨域同名 0；关键帧 ${reg.keyframes.length} 个与实况双向一致；` +
      `token 作用域（判据⑨，域 src/**/*.css）${tokens.length} 个定义点零越界。`
  );
  process.exit(0);
}
console.error(`❌ [css-namespace] ${violations.length} 处违规（样式命名空间纪律）：`);
for (const v of violations) console.error(`   · [${v.kind}] ${v.msg}`);
console.error("   判据与登记表见 scripts/check-css-namespace.mjs 文件头；档案见 docs/…/01-插件独立构建/11-样式命名空间审计.md");
process.exit(1);
