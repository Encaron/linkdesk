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
 * ── 四条判据（全部可证伪，见 --self-test）──
 *   ① 共享组件**新增裸定义** ⇒ 🔴 红
 *      （共享组件的类名是跨仓公共 CSS 面：插件会写 `.control-bar .combobox` 这类 scoped 调优；
 *        新增即意味着「又占了一个全局名」，必须先登记理由再放行）
 *   ② **跨组件借用**：某个共享组件裸定义的类名，被**别的组件目录**（或壳源码）渲染 ⇒ 🔴 红
 *      （`.badge` 案的机械化判据——徽标类的名字只能由它自己的组件渲染）
 *   ③ 宿主 `index.css` 的**全局工具类**新增 ⇒ 🔴 红
 *      （插件实测在用 `.input`：settings / serial-monitor 渲染 `className="input"`——扩面要走登记）
 *   ④ `@keyframes` 跨方重名（共享组件 × 壳）⇒ 🔴 红（关键帧名同样是全局的，第二条命名空间）
 *
 * ── 登记表 = 既成事实面（不是「允许随便加」）──
 *   登记项都带理由；新增一律红 ⇒ 逼一次「这是公共面还是漏网借用」的判断。想加请改本题表并写明理由。
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/* ── 登记表（数据，不是代码里的散落判断）────────────────────────────── */

/** 共享组件已登记的裸定义：类名 → { owner: 组件目录名, why: 为什么它可以叫这个名字 } */
const SHARED_BARE_REGISTRY = {
  badge: { owner: "badge", why: "壳基础件「小圆角徽标」（E6#30.14b）——市场/详情的 chip 形态" },
  button: { owner: "button", why: "壳基础件按钮（E6#30.13）——插件按 .button--sm/--ghost 变体消费" },
  combobox: { owner: "combobox", why: "组合输入控件（E3.5）——插件 scoped 调优（.control-bar .combobox）" },
  mdv: { owner: "markdown-view", why: "Markdown 渲染容器（E6#30.6a）——详情的 README/发行说明" },
  selectbox: { owner: "select-box", why: "下拉选择（E3.5）——插件 scoped 调优" },
  sle: { owner: "string-list-editor", why: "字符串数组编辑器（E6#30c）——插件 scoped 调优" },
  slider: { owner: "slider", why: "滑杆（E5.8#50.9）——插件 scoped 调优（.settings-slider-control .slider）" },
  toggle: { owner: "toggle", why: "开关（E5.8#50）——.toggle.on / .toggle.disabled 状态约定" },
};

/** 宿主 index.css 已登记的全局工具类：类名 → why */
const HOST_GLOBAL_REGISTRY = {
  about: { why: "关于页正文容器" },
  divider: { why: "通用分隔线" },
  input: { why: "🔴 插件在用的输入框工具类（settings/serial-monitor 实测渲染 className=\"input\"）" },
  rn: { why: "发行说明容器（ReleaseNotes）" },
  titlebar: { why: "标题栏容器" },
  vta: { why: "视图过渡动画容器" },
};

/* ── 解析 ──────────────────────────────────────────────────────────── */

/** 剥注释（选择器/属性里不会有 // 风格注释） */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** 按逗号切复合选择器（括号深度感知，够用） */
function splitSelector(sel) {
  const parts = [];
  let depth = 0;
  let buf = "";
  for (const ch of sel) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** 取选择器主体（最后一个 compound，去伪类/伪元素） */
function subjectOf(compound) {
  const noPseudo = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "");
  return noPseudo.trim().split(/[\s>+~]+/).pop() ?? "";
}

/** 该复合选择器是否有祖先（有 ⇒ 是 scoped 调优，不是裸定义） */
function hasAncestor(compound) {
  const noPseudo = compound.replace(/::?[a-zA-Z-]+(\([^)]*\))?/g, "").trim();
  return noPseudo.split(/[\s>+~]+/).length > 1;
}

const classesOf = (s) => [...s.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]);

/** 收集一个 CSS 文件里的：裸定义类名、关键帧名 */
function parseCss(file) {
  const css = stripComments(readFileSync(file, "utf8"));
  const bareDefs = new Set();
  const keyframes = new Set();
  for (const m of css.matchAll(/@keyframes\s+([\w-]+)/g)) keyframes.add(m[1]);
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sel = m[1].trim();
    if (sel.startsWith("@") || !m[2].trim()) continue;
    for (const one of splitSelector(sel)) {
      if (hasAncestor(one)) continue; // scoped 调优——不算定义
      const sub = subjectOf(one);
      const cls = classesOf(sub);
      if (cls.length !== 1) continue; // 复合（.x.on）不算裸定义
      const only = sub.replace(/\./g, "").trim();
      if (cls[0] === only) bareDefs.add(cls[0]);
    }
  }
  return { bareDefs, keyframes };
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

/** 源码里渲染/查询过的 class 名 token（className="a b" / className={`a ${x}`} / classList / querySelector） */
const CLASS_TOKEN = /className\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g;
const CSS_QUERY = /(?:classList\.(?:add|remove|toggle|contains)|querySelector(?:All)?)\(\s*['"]([^'"]+)['"]/g;

function renderedTokens(file) {
  const txt = readFileSync(file, "utf8");
  const out = new Set();
  for (const m of txt.matchAll(CLASS_TOKEN)) {
    const s = (m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " ");
    for (const t of s.matchAll(/[a-zA-Z][\w-]*/g)) out.add(t[0]);
  }
  for (const m of txt.matchAll(CSS_QUERY)) for (const c of classesOf(m[1])) out.add(c);
  return out;
}

/* ── 判据 ──────────────────────────────────────────────────────────── */

/** 跑全部判据；返回 violations: [{ kind, msg }] */
export function runChecks(root = ROOT, registry = { shared: SHARED_BARE_REGISTRY, host: HOST_GLOBAL_REGISTRY }) {
  const violations = [];
  const sharedDir = join(root, "src", "components", "shared");

  // ① 共享组件裸定义登记（「裸」= 类名不含连字符——带前缀的已自带命名空间，不在本条判据内）
  const sharedCss = walk(sharedDir, (n) => n.endsWith(".css"));
  const ownedBy = new Map(); // 裸类名 → 组件目录名
  for (const f of sharedCss) {
    const comp = relative(sharedDir, f).split(/[\\/]/)[0];
    const { bareDefs } = parseCss(f);
    for (const name of bareDefs) {
      if (name.includes("-")) continue;
      if (!(name in registry.shared)) {
        violations.push({
          kind: "shared-bare-unregistered",
          msg: `共享组件新增裸定义 .${name}（${relative(root, f).replace(/\\/g, "/")}）——裸类名是全局标识符，` +
            `池文档里与其他插件同表。要么改名加前缀（推荐，如 .tbadge），要么登记进 check-css-namespace.mjs 的 SHARED_BARE_REGISTRY 并写明理由。`,
        });
      } else if (registry.shared[name].owner !== comp) {
        violations.push({
          kind: "shared-bare-moved",
          msg: `裸类名 .${name} 登记在「${registry.shared[name].owner}」，但现在由「${comp}」定义（${relative(root, f).replace(/\\/g, "/")}）——归属漂移，请核对登记表。`,
        });
      }
      if (!ownedBy.has(name)) ownedBy.set(name, comp);
    }
  }

  // ② 跨组件借用：共享组件裸定义的类名，被别的组件目录 / 壳源码渲染
  const srcFiles = walk(join(root, "src"), (n) => /\.tsx?$/.test(n) && !n.endsWith(".d.ts") && !/\.(test|spec)\.tsx?$/.test(n));
  for (const f of srcFiles) {
    const rel = relative(root, f).replace(/\\/g, "/");
    const isShared = rel.startsWith("src/components/shared/");
    const comp = isShared ? rel.split("/")[3] : null;
    for (const token of renderedTokens(f)) {
      const owner = ownedBy.get(token);
      if (!owner) continue; // 不是共享组件的裸定义 ⇒ 不归本条判据管（宿主工具类见 ③）
      if (comp === owner) continue; // 自己组件渲染自己的类名 ✓
      violations.push({
        kind: "cross-render",
        msg: `跨组件借用裸类名：${rel} 渲染了 class "${token}"，而 .${token} 是「${owner}」组件定义的公共类名` +
          ` ⇒ 该元素的样式会被「${owner}」的组件样式命中（.badge 案同形）。请给本组件的元素起自己的类名。`,
      });
    }
  }

  // ③ 宿主 index.css 全局工具类登记
  const indexCss = join(root, "src", "index.css");
  if (statSync(indexCss, { throwIfNoEntry: false })) {
    const { bareDefs } = parseCss(indexCss);
    for (const name of bareDefs) {
      if (name.includes("-")) continue;
      if (!(name in registry.host)) {
        violations.push({
          kind: "host-global-unregistered",
          msg: `宿主 index.css 新增全局工具类 .${name}——它随池文档进入所有插件视图，是跨仓公共面。` +
            `请登记进 check-css-namespace.mjs 的 HOST_GLOBAL_REGISTRY（写明为什么必须是全局的）。`,
        });
      }
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
    mk("src/components/shared/toggle/Toggle.css", ".toggle { background: red; }\n");
    mk("src/components/shared/toggle/Toggle.tsx", 'export const T = () => <div className="toggle" />;\n');
    mk("src/index.css", ".input { background: var(--bg-input); }\n");
    mk("src/App.tsx", "export const A = () => <div className='x' />;\n");
  };
  const registry = {
    shared: { toggle: { owner: "toggle", why: "test" } },
    host: { input: { why: "test" } },
  };

  // 正控：与登记表一致 ⇒ 零违规
  setup();
  cases.push(["正控：登记齐全 ⇒ 绿", runChecks(tmp, registry).length === 0]);

  // 负控①：共享组件新增未登记裸定义
  setup();
  mk("src/components/shared/theme-picker/ThemePicker.css", ".badge { color: red; }\n");
  cases.push(["负控①：新增裸定义 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "shared-bare-unregistered")]);

  // 负控②：跨组件借用（别的组件目录渲染了 toggle 组件定义的 .toggle）
  setup();
  mk("src/components/shared/theme-picker/ThemePicker.tsx", 'export const P = () => <span className="toggle" />;\n');
  cases.push(["负控②：跨组件借用 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "cross-render")]);

  // 负控③：壳源码渲染共享组件的裸类名
  setup();
  mk("src/App.tsx", "export const A = () => <div className='toggle' />;\n");
  cases.push(["负控③：壳渲染共享裸类名 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "cross-render")]);

  // 负控④：宿主新增全局工具类未登记
  setup();
  mk("src/index.css", ".input { color: red; }\n.mybrand { color: blue; }\n");
  cases.push(["负控④：宿主新增工具类 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "host-global-unregistered")]);

  // 负控⑤：关键帧重名
  setup();
  mk("src/components/shared/toggle/Toggle.css", ".toggle { animation: fade-in 1s; }\n@keyframes fade-in { to { opacity: 1 } }\n");
  mk("src/App.css", "@keyframes fade-in { to { opacity: 0 } }\n");
  cases.push(["负控⑤：关键帧重名 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "keyframes-clash")]);

  // 负控⑥：归属漂移
  setup();
  mk("src/components/shared/theme-picker/X.css", ".toggle { color: red; }\n");
  cases.push(["负控⑥：裸定义换组件 ⇒ 红", runChecks(tmp, registry).some((v) => v.kind === "shared-bare-moved")]);

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
  console.log(
    `✅ [css-namespace] 共享组件裸定义 ${Object.keys(SHARED_BARE_REGISTRY).length} 个 / 宿主全局工具类 ` +
      `${Object.keys(HOST_GLOBAL_REGISTRY).length} 个均在登记表内；无跨组件借用、无关键帧重名。`
  );
  process.exit(0);
}
console.error(`❌ [css-namespace] ${violations.length} 处违规（样式命名空间纪律）：`);
for (const v of violations) console.error(`   · [${v.kind}] ${v.msg}`);
console.error("   判据与登记表见 scripts/check-css-namespace.mjs 文件头；档案见 docs/…/01-插件独立构建/11-样式命名空间审计.md");
process.exit(1);
