/* 校验-拟真度.cjs —— 本 case 设计图的**拟真度机械门**
 * 图：`mockups/01-设计图-编辑器二进制提示页.html`　档案：`00-README.md` ～ `交接.md`
 *
 * 运行（仓库根）：`node "docs/04-软件更新/已落地/兜底打开链与二进制文本选项/mockups/校验-拟真度.cjs"`
 *   负控自证：　`node "…/校验-拟真度.cjs" --self-test`
 *   （纯 Node，无第三方依赖——`.cjs` 因为仓库是 "type":"module"）
 *
 * 覆盖（＝图尾「可点」行的断言清单 I1–I10）：
 *   I1  token 同源：本图 `:root` / `[data-theme="light"]` 里每个与壳源码 `src/index.css` **同名**的 token
 *       **逐值相等**（含 `color-mix` 派生式）；真源没有的 token 必须在 DEMO 登记表里（多一枚也红）
 *   I2  变量不悬空：图里用到的每个 `var(--x)` 都在图的 `:root` 里有声明（防写错名 → 静默失效）
 *   I3  零裸色：两个 token 块**之外**的 CSS 不许出现 `#hex` / `rgb()` / `hsl()` 字面量
 *   I4  提示块同源：`.notice*` 的父子尺寸/留白/字号 ＝ editor 插件 `editor.css` 的
 *       `.editor-binary-notice*`（跨仓真源不在本机时**降级为档内自洽**并明示，⛔ 不静默通过）
 *   I5  真 zone 尺寸：titlebar 30 ／ icon-bar 42 ／ sidebar 216 ／ tabbar 35 ／ statusbar 22
 *   I6  帧与场景完备：6 个 `data-f` 帧 ＋ 6 个 `data-sc` 场景，且帧名 ∈ SCN 帧集
 *   I7  第三颗钮在位：文案「仍旧以该编辑器插件打开」在图上、命令 id 在图**和** `04-任务清单.md` 里同字
 *   I8  图 ↔ 档互指：图头列出 6 个档案文件名且逐个存在；`00-README` 与 `04` 里都出现本图文件名
 *   I9  声明在位：「mockup 仅示意」＋「硬约束 16」（参考图纪律）
 *   I10 交互齐全：场景条 / 三颗钮 / 退回 / D1 开关 / 主题开关 / 打开方式面板，六个挂点都在
 *
 * ⚠️ 口径：本门只保证「**token、结构、类名、文字、互指**」五件事不错，**不**保证观感
 *    （无浏览器布局引擎 ⇒ 位置/像素类断言一律不写）。观感以实机为准（用户 dev 版目视）。
 * ⚠️ CSS 断言一律只扫 `<style>` 内容，且**先 stripComments**——真源注释里有 `colors:{}` 这类花括号，
 *    不剥注释会把 brace 配对带偏；正文里的 `%PDF-1.7` 之类字面量也不会被误当色值。
 */
const fs = require("fs");
const path = require("path");

const dir = __dirname;
const HTML_NAME = "01-设计图-编辑器二进制提示页.html";
const HTML_PATH = path.join(dir, HTML_NAME);
function findRepo(start) {
  let d = start;
  for (let i = 0; i < 14; i++) {
    if (fs.existsSync(path.join(d, ".git")) && fs.existsSync(path.join(d, "package.json"))) return d;
    const p = path.dirname(d);
    if (p === d) break;
    d = p;
  }
  throw new Error("找不到仓库根（须同时有 .git 与 package.json）");
}
const REPO = findRepo(dir);
const CASE_REL = path.relative(REPO, path.resolve(dir, "..")).replace(/\\/g, "/");

/** 档案六件（I8 用） */
const DOCS = ["00-README.md", "01-方案与落点契约.md", "02-决策区.md", "03-边缘情况清单.md", "04-任务清单.md", "交接.md"];
/** 图自有 token（真源无此名）——**登记才可用**；新增一枚必须同笔登记进这张表 */
const DEMO = ["--page-bg", "--mono-bg"];
const FRAMES = ["welcome", "editor", "notice2", "notice3", "forced", "reader"];
const SCENES = ["s1", "s2", "s3", "s4", "s5", "s6"];
const CMD_ID = "editor.forceOpenAsText";
const THIRD_BTN = "仍旧以该编辑器插件打开";
/** I4 的真源真值（editor 插件 editor.css 的 .editor-binary-notice*）＋ 跨仓可选核对路径 */
const NOTICE_TRUE = [
  [".notice", "gap:8px"],
  [".notice", "padding:24px"],
  [".notice", "background:var(--bg-window)"],
  [".notice-title", "font-size:var(--font-size-sm)"],
  [".notice-desc", "font-size:var(--font-size-2xs)"],
  [".notice-desc", "max-width:480px"],
  [".notice-desc", "line-height:1.6"],
];
const EDITOR_CSS_REL = ["linkdesk-plugins", "official", "editor", "src", "styles", "editor.css"];

/* ────────────────────────────── 解析小工具 ────────────────────────────── */
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 取某个选择器的声明块体（brace 配对；CSS 已剥注释） */
function blockOf(css, sel) {
  const m = new RegExp(escapeRe(sel) + "\\s*\\{").exec(css);
  if (!m) return null;
  const start = m.index + m[0].length;
  let d = 0;
  for (let j = start; j < css.length; j++) {
    if (css[j] === "{") d++;
    else if (css[j] === "}") { if (d === 0) return css.slice(start, j); d--; }
  }
  return null;
}
/** 删掉某个块（含选择器），返回剩余 CSS */
function stripBlock(css, sel) {
  const m = new RegExp(escapeRe(sel) + "\\s*\\{").exec(css);
  if (!m) return css;
  const start = m.index + m[0].length;
  let d = 0, end = -1;
  for (let j = start; j < css.length; j++) {
    if (css[j] === "{") d++;
    else if (css[j] === "}") { if (d === 0) { end = j + 1; break; } d--; }
  }
  return end < 0 ? css : css.slice(0, m.index) + css.slice(end);
}
/** 块体 → {token: 值}（值取到 `;` 为止，压缩空白） */
function decls(body) {
  const out = {};
  if (!body) return out;
  for (const m of body.matchAll(/(--[a-zA-Z0-9-]+)\s*:\s*([^;]+)/g)) out[m[1]] = m[2].replace(/\s+/g, " ").trim();
  return out;
}
/** 值归一：大小写 / 空白 / 前导零小数（`0.06` ≡ `.06`）——两仓书写习惯不同，只比语义 */
const norm = (v) => String(v).toLowerCase().replace(/\s+/g, "").replace(/(^|[^\d])0\.(\d)/g, "$1.$2");
const styleOf = (html) => { const m = /<style[^>]*>([\s\S]*?)<\/style>/.exec(html); return m ? stripComments(m[1]) : ""; };

/* ────────────────────────────── 判定（纯函数，自测可注入） ────────────────────────────── */
/**
 * @param {{html:string,index:string,doc00:string,doc04:string,editorCss:string|null,exists:(rel:string)=>boolean}} env
 * @returns {{id:string,msg:string}[]}  空数组 = 全绿
 */
function judge(env) {
  const F = [];
  const bad = (id, msg) => F.push({ id, msg });
  const html = env.html || "";
  const css = styleOf(html);

  /* I1 · token 同源（＋DEMO 登记表） */
  const srcDark = decls(blockOf(stripComments(env.index || ""), ":root"));
  const srcLightBlk = decls(blockOf(stripComments(env.index || ""), '[data-theme="light"]'));
  const srcLight = Object.assign({}, srcDark, srcLightBlk);
  const scenes = [[":root", srcDark], ['[data-theme="light"]', srcLight]];
  const demoSeen = new Set();
  for (const [sel, src] of scenes) {
    const mine = decls(blockOf(css, sel));
    if (!Object.keys(mine).length) { bad("I1", `图里找不到 token 块 ${sel}`); continue; }
    for (const [k, v] of Object.entries(mine)) {
      if (DEMO.includes(k)) { demoSeen.add(k); continue; }
      if (!(k in src)) { bad("I1", `${sel} 里的 ${k} 真源没有，也没登记进 DEMO`); continue; }
      if (norm(v) !== norm(src[k])) bad("I1", `${sel} ${k}：图=${v} ↔ src/index.css=${src[k]}`);
    }
  }
  for (const d of DEMO) if (!demoSeen.has(d)) bad("I1", `DEMO 登记表里的 ${d} 图里没声明（登记表该删或图该补）`);

  /* I2 · 变量不悬空 */
  const declared = new Set(Object.keys(decls(blockOf(css, ":root"))));
  const used = new Set([...css.matchAll(/var\((--[a-zA-Z0-9-]+)/g)].map((m) => m[1]));
  for (const u of used) if (!declared.has(u)) bad("I2", `图里用了 var(${u})，但 :root 没声明`);

  /* I3 · 零裸色 */
  let bare = stripBlock(css, ":root");
  bare = stripBlock(bare, '[data-theme="light"]');
  for (const m of bare.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) bad("I3", `token 块之外出现裸 hex：${m[0]}`);
  for (const m of bare.matchAll(/\b(?:rgba?|hsla?)\(/g)) bad("I3", `token 块之外出现裸色函数：${m[0]}`);

  /* I4 · 提示块同源（.notice* ↔ editor.css 真值）——两仓书写习惯不同（`font-size: X` vs `font-size:X`），故剥空白后比 */
  const N4 = (s) => String(s).replace(/\s+/g, "");
  for (const [sel, decl] of NOTICE_TRUE) {
    const body = blockOf(css, sel);
    if (body === null) { bad("I4", `图里没有 ${sel}`); continue; }
    if (!N4(body).includes(N4(decl))) bad("I4", `${sel} 缺 ${decl}（对齐 editor.css .editor-binary-notice*）`);
  }
  if (env.editorCss) {
    const e = stripComments(env.editorCss);
    for (const [sel, decl] of NOTICE_TRUE) {
      const real = sel.replace(".notice", ".editor-binary-notice");
      const body = blockOf(e, real) || "";
      if (!N4(body).includes(N4(decl))) bad("I4", `跨仓真源 ${real} 不含 ${decl}——图与插件已分岔，请对账后再改本门`);
    }
  }

  /* I5 · 真 zone 尺寸 */
  const ZONES = [["titlebar", "height:30px"], ["icon-bar", "width:42px"], ["sidebar", "width:216px"], ["tabbar", "height:35px"], ["statusbar", "height:22px"]];
  for (const [z, decl] of ZONES) {
    const body = blockOf(css, "." + z);
    if (body === null || !body.includes(decl)) bad("I5", `.${z} 缺 ${decl}（壳 zone 实测尺寸）`);
  }

  /* I6 · 帧与场景完备 */
  const frameIds = [...html.matchAll(/class="frame" data-f="([a-z0-9]+)"/g)].map((m) => m[1]);
  const sceneIds = [...html.matchAll(/data-sc="(s\d+)"/g)].map((m) => m[1]);
  for (const f of FRAMES) if (!frameIds.includes(f)) bad("I6", `缺帧 data-f="${f}"`);
  for (const s of SCENES) if (!sceneIds.includes(s)) bad("I6", `缺场景 data-sc="${s}"`);
  if (frameIds.length !== FRAMES.length) bad("I6", `帧数 = ${frameIds.length}（应 ${FRAMES.length}）`);
  if (sceneIds.length !== SCENES.length) bad("I6", `场景数 = ${sceneIds.length}（应 ${SCENES.length}）`);
  for (const f of frameIds) if (!new RegExp(`frame: "${f}"`).test(html)) bad("I6", `帧 ${f} 在 SCN 表里没有对应场景`);

  /* I7 · 第三颗钮 ＋ 命令 id（图 ↔ 04 同字） */
  if (!html.includes(THIRD_BTN)) bad("I7", `图上没有第三颗钮文案「${THIRD_BTN}」`);
  if (!html.includes(CMD_ID)) bad("I7", `图上没有命令 id ${CMD_ID}`);
  if (!(env.doc04 || "").includes(CMD_ID)) bad("I7", `04-任务清单.md 里没有命令 id ${CMD_ID}（图档不同字）`);

  /* I8 · 互指 */
  for (const d of DOCS) {
    if (!html.includes(d)) bad("I8", `图头没列档案 ${d}`);
    else if (!env.exists(`${CASE_REL}/${d}`)) bad("I8", `图头引用的 ${d} 在磁盘不存在`);
  }
  if (!(env.doc00 || "").includes(HTML_NAME)) bad("I8", `00-README.md 里没出现本图文件名 ${HTML_NAME}`);
  if (!(env.doc04 || "").includes(HTML_NAME)) bad("I8", `04-任务清单.md 里没出现本图文件名 ${HTML_NAME}`);

  /* I9 · 声明在位 */
  if (!html.includes("mockup 仅示意")) bad("I9", "缺「mockup 仅示意」声明");
  if (!html.includes("硬约束 16")) bad("I9", "缺「硬约束 16」参考图纪律声明");

  /* I10 · 交互齐全 */
  const HOOKS = [
    ['data-sc="s1"', "场景条"],
    ['data-act="openwith"', "打开方式"],
    ['data-act="market"', "在市场搜索阅读器"],
    ['data-act="force"', "第三颗钮（强制文本）"],
    ['data-act="back"', "退回提示页"],
    ['id="d1Btn"', "D1 开关"],
    ['id="themeBtn"', "主题开关"],
    ['id="owPanel"', "打开方式面板"],
  ];
  for (const [hook, what] of HOOKS) if (!html.includes(hook)) bad("I10", `${what} 的挂点 ${hook} 不在`);

  return F;
}

/* ────────────────────────────── 环境装配 ＋ 跑 ────────────────────────────── */
function envFromDisk() {
  const html = read(HTML_PATH);
  if (html === null) {
    console.error(`❌ 读不到设计图：${HTML_PATH}`);
    process.exit(1);
  }
  return {
    html,
    index: read(path.join(REPO, "src", "index.css")) || "",
    doc00: read(path.join(REPO, CASE_REL, "00-README.md")) || "",
    doc04: read(path.join(REPO, CASE_REL, "04-任务清单.md")) || "",
    editorCss: read(path.resolve(REPO, "..", ...EDITOR_CSS_REL)),
    exists: (rel) => fs.existsSync(path.join(REPO, rel)),
  };
}

function report(F) {
  if (!F.length) return true; // 干净
  const by = {};
  for (const f of F) (by[f.id] = by[f.id] || []).push(f.msg);
  for (const id of Object.keys(by).sort()) for (const m of by[id]) console.error(`❌ ${id} · ${m}`);
  return false;
}

const base = envFromDisk();
const args = process.argv.slice(2);

if (args.includes("--self-test")) {
  const baseF = judge(base);
  if (baseF.length) {
    console.error("⛔ 自测前基线就不干净——先修图，再谈负控：");
    report(baseF);
    process.exit(1);
  }
  /** 负控：每种篡改**必须**打出指定断言（尺子不是橡皮图章）；末条是正控（应零违规） */
  const CASES = [
    ["I1 改坏 token 值", (e) => { e.html = e.html.replace("--accent:#0078D4;", "--accent:#0078D5;"); return "I1"; }],
    ["I1 塞一枚未登记的图 token", (e) => { e.html = e.html.replace("--page-bg:#0D0D0D;", "--page-bg:#0D0D0D; --my-own-bg:#000;"); return "I1"; }],
    ["I2 var 写错名（悬空）", (e) => { e.html = e.html.replace("background:var(--mono-bg)", "background:var(--mono-bg-x)"); return "I2"; }],
    ["I3 token 块之外塞裸 hex", (e) => { e.html = e.html.replace(".welcome .big{font-size:20px;", ".welcome .big{color:#123456; font-size:20px;"); return "I3"; }],
    ["I3 token 块之外塞裸 rgba", (e) => { e.html = e.html.replace(".welcome .sub{font-size:12px;", ".welcome .sub{background:rgba(1,2,3,.5); font-size:12px;"); return "I3"; }],
    ["I4 提示块留白被我改小", (e) => { e.html = e.html.replace("max-width:480px", "max-width:460px"); return "I4"; }],
    ["I5 zone 尺寸被我改掉", (e) => { e.html = e.html.replace(".titlebar{height:30px;", ".titlebar{height:31px;"); return "I5"; }],
    ["I6 删一帧", (e) => { e.html = e.html.replace('class="frame" data-f="reader"', 'class="frame" data-f="reader-x"'); return "I6"; }],
    ["I6 删一场景", (e) => { e.html = e.html.replace('data-sc="s6"', 'data-sc="s7"'); return "I6"; }],
    ["I7 图上删命令 id", (e) => { e.html = e.html.replace(/editor\.forceOpenAsText/g, "editor.forceOpenText"); return "I7"; }],
    ["I7 04 档与图不同字", (e) => { e.doc04 = e.doc04.replace(/editor\.forceOpenAsText/g, "editor.forceOpenText"); return "I7"; }],
    ["I8 图头少列一件档案", (e) => { e.html = e.html.replace("02-决策区.md", "02-决策区-X.md"); return "I8"; }],
    ["I8 04 档不提本图", (e) => { e.doc04 = e.doc04.split(HTML_NAME).join("图.html"); return "I8"; }],
    ["I9 删「仅示意」声明", (e) => { e.html = e.html.replace("mockup 仅示意", "mockup"); return "I9"; }],
    ["I10 删一个交互挂点", (e) => { e.html = e.html.replace('data-act="back"', 'data-act="back-x"'); return "I10"; }],
    ["（正控）只改一段裁决链文案——应零违规", (e) => { e.html = e.html.replace("⚠ 提示页无「就当文本打开」= 用户被挡死", "⚠ 提示页没有「就当文本打开」这条路"); return null; }],
  ];
  let ok = 0;
  for (const [name, mutate] of CASES) {
    const env = Object.assign({}, base);
    const want = mutate(env);
    const got = [...new Set(judge(env).map((f) => f.id))];
    const pass = want === null ? got.length === 0 : got.includes(want);
    console.log(`${pass ? "✅" : "❌"} ${name}${want ? `　→ 期望红 ${want}，实得 [${got.join(",")}]` : `　→ 期望零违规，实得 [${got.join(",")}]`}`);
    if (pass) ok++;
  }
  console.log(`\n负控自证：${ok}/${CASES.length} ${ok === CASES.length ? "全过 ✅" : "有漏 ❌"}`);
  process.exit(ok === CASES.length ? 0 : 1);
}

const F = judge(base);
if (!report(F)) {
  console.error(`\n⛔ 拟真度门未过：${F.length} 条（图：${HTML_NAME}；口径：只判 token / 结构 / 类名 / 文字 / 互指，不判观感）`);
  process.exit(1);
}
const note = base.editorCss ? "跨仓真源 editor.css 已核对" : "跨仓真源 editor.css 不可达 ⇒ I4 降级为档内自洽（⛔ 不是通过）";
console.log(`✅ 拟真度门全绿（I1–I10）：token 同源 · 变量不悬空 · 零裸色 · 提示块同源 · zone 尺寸 · 6 帧 6 场景 · 第三颗钮 ＋ 命令 id · 图↔档互指 · 声明 · 交互 8 挂点`);
console.log(`   ── 图：${HTML_NAME}｜档案：${CASE_REL}｜DEMO 登记 ${DEMO.length} 枚：${DEMO.join(" ")}｜${note}`);
