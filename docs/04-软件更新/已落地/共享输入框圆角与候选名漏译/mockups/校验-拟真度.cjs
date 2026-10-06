/* 校验-拟真度.cjs —— 本 case 设计图的**拟真度机械门**（`mockups/01-设计图-输入框圆角与候选名翻译-同屏对照.html`）
 *
 * 运行：在仓库根执行　`node "docs/04-软件更新/已落地/共享输入框圆角与候选名漏译/mockups/校验-拟真度.cjs"`
 *       负控（篡改 fixture，必须跑红）　`node "…/校验-拟真度.cjs" --self-test`
 *       （jsdom 自仓库 node_modules 解析；本文件须为 .cjs —— 仓库是 "type":"module"）
 *
 * 覆盖（对应图尾 §D 断言清单 I1–I18）：
 *   段 A 字体与「零手绘」：真 codicon 字形在位 ／ 产品区 svg 清零 ／ 无原生 <select>
 *   段 B **真 token 逐值同源**：本图半径/字号/颜色 token 与 `src/index.css` 逐字节相等
 *   段 C 亮色块同源 ＋ 主题切换真改 `data-theme`
 *   段 D **真类名**：本图用到的每个 ldk-* 类名都能在对应真源 CSS 里找到
 *   段 E **改后 = 真件 ＋ 恰一条**：`.ldk-inline-input` 声明集 = 真源声明集 ∪ {border-radius: var(--radius-sm)}
 *   段 F **⛔ 零手填 px**：产品区字号/圆角/高度一律走 token 或 calc(Npx * var(--ui-scale))
 *   段 G **真件 DOM 形状**：InlineInput＝裸 input（无 wrapper/子元素）；SelectBox＝trigger＞label＋chevron；面板＝dropdown＞ul＞li
 *   段 H 文字断言：🟥 冒烟枪（合成项已翻、候选未翻）／🟩 改后四处一致／中文态回归／两个边界态（E9/E10）
 *   段 I 交互：开合可点、焦点靠 JS 挪类且**节点同一**、真件无 `.ldk-selectbox-item:hover` 规则
 *   段 J 图与文档完备：断言清单在位、相对链接不断链、**图内无 markdown 裸语法**、硬约束 16 声明在位
 *   段 L **圆角标尺机制**（I15–I18）：滑杆上限＝真源 RADIUS_MAX_PX ／ 六档键名＝真源 RADIUS_SCALE_STEPS 派生
 *          ／ 写面＝六档＋--radius-pill 同值且 ⛔ 不碰 --radius-full ／ 载入播种·拖动跟随·重置摘除
 *   段 K `--self-test`：十种篡改各自必须跑红（负控自证）
 *
 * 口径：真件一致性（真 token/真类名/真规则/真 DOM 形状/真焦点机制）＋ 零手填 px ＋ 文字与交互不变量。
 * 依据：2026-10-06 用户判据「已有组件长什么样就是什么样」（先例＝滑杆搬迁）
 *       ＋「html 展示基本就是实机效果：比例、大小、尺寸、显示文字」。改动本图后必跑；红了就是漂了。
 * ⚠️ jsdom 无布局引擎（getBoundingClientRect 恒 0）⇒ 位置类断言不可写，只写不变量；
 *    颜色/尺寸的**实际观感以实机为准**，本门只保证「结构、类名、token、文字」四件事不错。
 * ⚠️ CSS 断言一律只扫 `<style>` 内容（`cssOf`）——扫整份 HTML 会把正文里的字面量当声明误判
 *    （首版实测：`:root` 选择器被前面的 HTML 标签污染 ⇒ 段 B/C 全瞎；`.…:hover` 被正文注释命中 ⇒ 段 I 假红）。
 */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const dir = __dirname;
const repo = path.resolve(dir, "../../../../..");
const htmlPath = path.join(dir, "01-设计图-输入框圆角与候选名翻译-同屏对照.html");
const readSrc = (rel) => fs.readFileSync(path.join(repo, rel), "utf8");

const SRC = {
  index: "src/index.css",
  inline: "src/components/shared/inline-input/InlineInput.css",
  famgr: "src/components/shared/file-associations-manager/file-associations-manager.css",
  selbox: "src/components/shared/select-box/SelectBox.css",
};
const real = {};
const srcMissing = [];
for (const k of Object.keys(SRC)) {
  try { real[k] = readSrc(SRC[k]); } catch (e) { real[k] = ""; srcMissing.push(SRC[k]); }
}

/* ── 解析小工具 ─────────────────────────────────────────────────────────────── */

/** 取 `<style>` 内容：CSS 断言只扫它（正文里的字面量不算声明） */
function cssOf(htmlText) {
  return (htmlText.match(/<style[^>]*>[\s\S]*?<\/style>/g) || [])
    .map((s) => s.replace(/^<style[^>]*>/, "").replace(/<\/style>\s*$/, ""))
    .join("\n");
}
/** 去掉注释与 @keyframes（含一层嵌套），免得正则误配 */
function stripCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/@keyframes[^{]*\{(?:[^{}]|\{[^{}]*\})*\}/g, "");
}
/** 取所有 `选择器{声明}` 规则 */
function rulesOf(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  const s = stripCss(css);
  let m;
  while ((m = re.exec(s))) out.push({ sel: m[1].trim().replace(/\s+/g, " "), body: m[2] });
  return out;
}
const normDecl = (d) => d.trim().replace(/\s*:\s*/, ":").replace(/\s+/g, " ");
/** 某选择器的**第一条**规则的声明集（已归一） */
function declSet(css, sel) {
  const r = rulesOf(css).find((x) => x.sel === sel);
  if (!r) return null;
  return new Set(r.body.split(";").map(normDecl).filter((d) => d.length > 0));
}
/** 取 token 块（`:root` / `[data-theme="light"]`）的 `名 → 值` 映射 */
function tokenMap(css, blockSel) {
  const r = rulesOf(css).find((x) => x.sel === blockSel);
  const map = {};
  if (!r) return map;
  r.body.split(";").forEach((d) => {
    const i = d.indexOf(":");
    if (i < 0) return;
    map[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  });
  return map;
}
const diff = (a, b) => [...a].filter((x) => !b.has(x));
const replaceFirst = (s, a, b) => { const i = s.indexOf(a); return i < 0 ? s : s.slice(0, i) + b + s.slice(i + a.length); };

/* ── 审计主体（对任意 html 文本跑一遍；--self-test 靠重跑它做负控）────────────── */

async function audit(html) {
  let pass = 0, fail = 0;
  const fails = [];
  const ok = (name, cond, extra = "") => {
    if (cond) pass++;
    else { fail++; fails.push(name); console.log("FAIL: " + name + (extra ? "  [" + extra + "]" : "")); }
  };
  const info = [];
  const cssText = cssOf(html);
  const cssS = stripCss(cssText);

  // ══ 段 A · 字体与「零手绘」(I6) ══
  const link = html.match(/<link[^>]+href="([^"]*codicon\.css)"[^>]*>/);
  ok("A1 head 挂了 codicon.css 链接", !!link);
  const resolved = link ? path.resolve(dir, link[1]) : "";
  ok("A2 链接可解析到真字体 CSS", !!resolved && fs.existsSync(resolved), resolved);
  const fontCss = resolved && fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : "";
  ok("A3 字体文件在同目录存在（.ttf）",
    !!fontCss && fs.existsSync(path.resolve(path.dirname(resolved), "codicon.ttf")));
  ok("A4 字形在位：codicon-search / codicon-chevron-down",
    /\.codicon-search:before/.test(fontCss) && /\.codicon-chevron-down:before/.test(fontCss));
  ok("A5 页面挂了 codicon 字体（与产品同支）", /@vscode\/codicons\/dist\/codicon\.css/.test(html));

  // ══ 段 B · 真 token 逐值同源 (I1) ══
  ok("B0 真源文件读齐（index/inline/famgr/selbox）", srcMissing.length === 0, srcMissing.join(","));
  const mt = tokenMap(cssText, ":root");
  const rt = tokenMap(real.index, ":root");
  const same = (keys) => keys.filter((k) => (mt[k] || "") !== (rt[k] || "")).map((k) => k + ":" + mt[k] + "≠" + rt[k]);
  const radiusKeys = ["--radius-xs", "--radius-sm", "--radius-md", "--radius-lg", "--radius-2xl", "--radius-pill", "--radius-full"];
  const fontKeys = ["--font-size-2xs", "--font-size-xs", "--font-size-sm", "--font-size-md", "--font-size-lg",
    "--font-size-xl", "--font-size-2xl", "--font-size-3xl", "--font-size-4xl", "--ui-scale"];
  const colorKeys = ["--bg-window", "--bg-card", "--bg-input", "--bg-side-panel", "--text-primary", "--text-secondary",
    "--text-muted", "--text-on-accent", "--accent", "--accent-hover", "--border", "--separator", "--hover-overlay"];
  ok("B0b 本图 :root 解出 token（防「解析瞎了也算过」）", Object.keys(mt).length > 30, "实测 " + Object.keys(mt).length);
  const dR = same(radiusKeys), dF = same(fontKeys), dC = same(colorKeys);
  ok("B1 圆角七档 token 与 src/index.css 逐字节相等", dR.length === 0, dR.join(" | "));
  ok("B2 字号九档 ＋ --ui-scale 逐字节相等", dF.length === 0, dF.join(" | "));
  ok("B3 配色 token（13 项）逐字节相等", dC.length === 0, dC.join(" | "));
  ok("B4 --font-mono 逐值", mt["--font-mono"] === rt["--font-mono"], mt["--font-mono"]);
  ok("B5 --shadow-pop 逐值（下拉面板用）", mt["--shadow-pop"] === rt["--shadow-pop"], mt["--shadow-pop"]);
  ok("B6 --z-dropdown 逐值", mt["--z-dropdown"] === rt["--z-dropdown"], mt["--z-dropdown"]);

  // ══ 段 C · 亮色块同源 (I2) ══
  const ml = tokenMap(cssText, '[data-theme="light"]');
  const rl = tokenMap(real.index, '[data-theme="light"]');
  ok("C0 真源含 [data-theme=\"light\"] 块", Object.keys(rl).length > 10);
  const lightKeys = ["--bg-window", "--bg-card", "--bg-input", "--text-primary", "--text-secondary", "--text-muted",
    "--accent", "--accent-hover", "--border", "--separator", "--bg-side-panel", "--hover-overlay", "--text-on-accent"];
  const dL = lightKeys.filter((k) => (ml[k] || "") !== (rl[k] || "")).map((k) => k + ":" + ml[k] + "≠" + rl[k]);
  ok("C1 亮色块 13 项各自逐字节相等", dL.length === 0, dL.join(" | "));

  // ══ 段 D · 真类名 (I3) ══
  const miss = (css, list) => list.filter((c) => !css.includes(c));
  const inlineCls = [".ldk-inline-input", ".ldk-inline-input--compact", ".ldk-inline-input--normal", ".ldk-inline-input:focus"];
  const famgrCls = [".ldk-famgr-row", ".ldk-famgr-ext", ".ldk-famgr-pill", ".ldk-famgr-pill--cand", ".ldk-famgr-pill--auto",
    ".ldk-famgr-filter", ".ldk-famgr-filter-icon", ".ldk-famgr-hit"];
  const selboxCls = [".ldk-selectbox", ".ldk-selectbox-trigger", ".ldk-selectbox-label", ".ldk-selectbox-arrow",
    ".ldk-selectbox-arrow-up", ".ldk-selectbox-dropdown", ".ldk-selectbox-list", ".ldk-selectbox-item",
    ".ldk-selectbox-item-focus", ".ldk-selectbox-item-selected"];
  ok("D0 真源四文件都非空", Object.values(real).every((t) => t.length > 0));
  const mI = miss(real.inline, inlineCls), mF = miss(real.famgr, famgrCls), mS = miss(real.selbox, selboxCls);
  ok("D1 InlineInput 类名在真源里齐备", mI.length === 0, mI.join(","));
  ok("D2 ldk-famgr-* 类名在真源里齐备", mF.length === 0, mF.join(","));
  ok("D3 ldk-selectbox-* 类名在真源里齐备", mS.length === 0, mS.join(","));
  // §A5 契约基准格：壳输入框 `.ldk-input`（真源 src/index.css）——同一个界面里**跟着滑杆变**的输入框
  const shellMissing = miss(real.index, [".ldk-input", ".ldk-input:focus"]);
  ok("D4 壳输入框契约类名在 src/index.css 里齐备（§A5 基准格）", shellMissing.length === 0, shellMissing.join(","));
  const mkLi = declSet(cssText, ".ldk-input"), rlLi = declSet(real.index, ".ldk-input");
  ok("D5 §A5 契约格 .ldk-input 声明逐条同源（是本图抄壳，⛔ 不是壳随本图改）",
    !!mkLi && !!rlLi && [...diff(mkLi, rlLi), ...diff(rlLi, mkLi)].length === 0,
    mkLi && rlLi ? [...diff(mkLi, rlLi), ...diff(rlLi, mkLi)].join(" | ") : "解析失败");

  // ══ 段 E · 改后 = 真件 ＋ 恰一条 (I4) ══
  const mkBase = declSet(cssText, ".ldk-inline-input");
  const rlBase = declSet(real.inline, ".ldk-inline-input");
  ok("E0 本图与真源都能解出 .ldk-inline-input 基类", !!mkBase && !!rlBase);
  if (mkBase && rlBase) {
    const extra = diff(mkBase, rlBase), missing = diff(rlBase, mkBase);
    ok("E1 本图基类**只多**一条：border-radius:var(--radius-sm)",
      extra.length === 1 && extra[0] === "border-radius:var(--radius-sm)", "多余=" + extra.join(" | "));
    ok("E2 真源 8 条声明一条不缺（几何零位移）", missing.length === 0, "缺=" + missing.join(" | "));
  }
  ok("E3 「改前」影子类显式 0（真源**没有**这个类，是本图对照用）",
    /\.ldk-inline-input-noradius\{[^}]*border-radius:\s*0/.test(cssS));
  ok("E4 影子类不在真源里（⛔ 不是产品类）", !/\.ldk-inline-input-noradius/.test(real.inline));
  const declDiff = (sel) => {
    const a = declSet(cssText, sel), b = declSet(real.inline, sel);
    return a && b ? [...diff(a, b), ...diff(b, a)] : ["解析失败"];
  };
  const dNorm = declDiff(".ldk-inline-input--normal"), dComp = declDiff(".ldk-inline-input--compact");
  ok("E5 32px 档（--normal）声明逐条同源", dNorm.length === 0, dNorm.join(" | "));
  ok("E6 22px 档（--compact）声明逐条同源", dComp.length === 0, dComp.join(" | "));
  info.push("真源 InlineInput.css 现行 border-radius 声明数 = " +
    (real.inline.match(/border-radius/g) || []).length +
    "（0＝病灶在位，符合本图取景；落地方案后本行变 1 亦不影响 E1）");

  // ══ 段 F · ⛔ 零手填 px (I7) ══
  const prodRules = rulesOf(cssText).filter((r) => /(^|[\s,])\.ldk-/.test(r.sel));
  ok("F0 产品区规则数 > 20（解析到位）", prodRules.length > 20, "实测 " + prodRules.length);
  const rawFont = prodRules.filter((r) => /font-size:\s*[\d.]+px/i.test(r.body)).map((r) => r.sel);
  ok("F1 产品区零手填 px 字号（一律 --font-size-*）", rawFont.length === 0, rawFont.join(" | "));
  const rawRadius = prodRules.filter((r) => /border-radius:\s*[\d.]+px/i.test(r.body)).map((r) => r.sel);
  ok("F2 产品区圆角一律 token（⛔ 无裸 px）", rawRadius.length === 0, rawRadius.join(" | "));
  // ⚠️ 只盯**裸** height —— min-height / max-height（真源 .ldk-famgr-row:30px、.ldk-selectbox-dropdown:260px）不在此列
  const badHeight = prodRules.filter((r) => /(?:^|[^-a-z])height:\s*[\d.]+px/i.test(r.body)).map((r) => r.sel);
  ok("F3 产品区裸高度一律 calc(Npx * var(--ui-scale))", badHeight.length === 0, badHeight.join(" | "));
  ok("F4 输入框两档高度确是 calc(... * var(--ui-scale))",
    /\.ldk-inline-input--normal\{[^}]*height:calc\(32px \* var\(--ui-scale\)\)/.test(cssS) &&
    /\.ldk-inline-input--compact\{[^}]*height:calc\(22px \* var\(--ui-scale\)\)/.test(cssS));

  // ══ 段 G · 真件 DOM 形状 (I5) ══
  const dom = new JSDOM(html, { runScripts: "dangerously", pretendToBeVisual: true });
  const w = dom.window, d = w.document;
  const $ = (s) => d.querySelector(s);
  const $$ = (s) => Array.from(d.querySelectorAll(s));
  const fire = (el, t) => el.dispatchEvent(new w.Event(t, { bubbles: true }));
  const click = (el) => el.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  const texts = (s) => $$(s).map((e) => e.textContent.trim());
  await new Promise((r) => setTimeout(r, 60));   // 等内联脚本执行完

  const a2 = $("#in-a2-after");
  ok("G1 InlineInput ＝ 裸 input（无 wrapper／无子元素）",
    !!a2 && a2.tagName === "INPUT" && a2.children.length === 0 &&
    a2.classList.contains("ldk-inline-input") && a2.classList.contains("ldk-inline-input--normal"));
  ok("G2 管理器过滤槽 ＝ span.ldk-famgr-filter ＞ codicon-search ＋ input",
    !!$("span.ldk-famgr-filter > span.codicon.codicon-search.ldk-famgr-filter-icon") &&
    !!$("span.ldk-famgr-filter > input.ldk-inline-input--normal") &&
    !!a2 && a2.parentElement.tagName === "SPAN" && a2.parentElement.classList.contains("ldk-famgr-filter"));
  const a3 = $("#in-a3-after");
  ok("G3 22px 档＝同一支件的 --compact（不是另一支控件）",
    !!a3 && a3.tagName === "INPUT" && a3.classList.contains("ldk-inline-input--compact") && a3.children.length === 0);
  const box = $('[data-sel="c2-after"]');
  const trig = box ? box.querySelector(".ldk-selectbox-trigger") : null;
  ok("G4 SelectBox ＝ div.ldk-selectbox ＞ button.ldk-selectbox-trigger",
    !!box && !!trig && box.firstElementChild === trig && trig.tagName === "BUTTON");
  ok("G5 触发条 ＝ label ＋ codicon-chevron-down（真字形，非手绘）",
    !!trig && trig.children.length === 2 &&
    trig.children[0].classList.contains("ldk-selectbox-label") &&
    trig.children[1].classList.contains("codicon") &&
    trig.children[1].classList.contains("codicon-chevron-down") &&
    trig.children[1].classList.contains("ldk-selectbox-arrow"));
  const panel = $('[data-sel="c2-after"] .ldk-selectbox-dropdown');
  ok("G6 面板 ＝ div.ldk-selectbox-dropdown ＞ ul.ldk-selectbox-list ＞ li.ldk-selectbox-item",
    !!panel && !!panel.querySelector("ul.ldk-selectbox-list > li.ldk-selectbox-item") &&
    panel.firstElementChild.tagName === "UL");
  ok("G7 ⛔ 无原生 <select>（下拉一律共享件）", $$("select").length === 0, "实测 " + $$("select").length);
  ok("G8 ⛔ 产品区零手绘 svg 图标", $$(".page svg").length === 0, "实测 " + $$(".page svg").length);

  // ══ 段 H · 文字断言 (I8/I9/I10/I13) ══
  const c2b = texts('[data-sel="c2-before"] .ldk-selectbox-item');
  const c2a = texts('[data-sel="c2-after"] .ldk-selectbox-item');
  ok("H1 🟥 冒烟枪：英文态合成项已翻（「自动」）", c2b[0] === "自动", "实测 " + c2b[0]);
  ok("H2 🟥 冒烟枪：英文态候选**未翻**（「编辑器」）", c2b[1] === "编辑器", "实测 " + c2b[1]);
  ok("H3 🟩 改后：英文态两项都在词典口径内（自动 ／ Editor）",
    c2a[0] === "自动" && c2a[1] === "Editor", "实测 " + c2a.join(" / "));
  const c2la = $('[data-sel="c2-after"] .ldk-selectbox-label');
  const c2lb = $('[data-sel="c2-before"] .ldk-selectbox-label');
  ok("H4 触发条 label 与候选同源（改前未翻 / 改后已翻）",
    !!c2lb && c2lb.textContent.trim() === "编辑器" && !!c2la && c2la.textContent.trim() === "Editor");
  const c3a = texts('[data-sel="c3-after"] .ldk-selectbox-item');
  const c3b = texts('[data-sel="c3-before"] .ldk-selectbox-item');
  ok("H5 竞争区下拉同病同治（改前「文本查看器」/ 改后 Text Viewer）",
    c3b[2] === "文本查看器" && c3a[2] === "Text Viewer", "实测 " + c3b[2] + " / " + c3a[2]);
  ok("H6 卡头三态：中文「编辑器」、英文两态均 Editor（这一处今天就对）",
    $("#c1-zh").textContent.trim() === "编辑器" &&
    $("#c1-en-before").textContent.trim() === "Editor" &&
    $("#c1-en-after").textContent.trim() === "Editor");
  ok("H7 C4 胶囊：中文态回归原样", $("#c4-zh").textContent.trim() === "候选 · 默认：编辑器",
    $("#c4-zh").textContent.trim());
  ok("H8 C4 胶囊：改前＝外层英文＋内插值中文（半句病征）",
    /Default:.*编辑器/.test($("#c4-en-before").textContent.trim()), $("#c4-en-before").textContent.trim());
  ok("H9 C4 胶囊：改后整句一致", $("#c4-en-after").textContent.trim() === "Default: Editor",
    $("#c4-en-after").textContent.trim());
  ok("H10 E10 缺词条 ⇒ 原样显示原文（预期，⛔ 非 bug）",
    $("#c5-missing").textContent.includes("某种没有词条的插件"));
  ok("H11 E9 无 manifest.name ⇒ pluginId 原样（⛔ id 不翻）",
    $("#c5-pluginid").textContent.includes("linkdesk.editor"));
  ok("H12 同一支下拉里「合成项已翻」与「候选未翻」并置（这就是病征本身）",
    c2b[0] === "自动" && c2b[1] !== "Auto" && c2a[0] === "自动");

  // ══ 段 I · 交互与焦点机制 (I11/I12) ══
  ok("I1 真件无 .ldk-selectbox-item:hover 规则（本图同样不写）",
    !/\.ldk-selectbox-item:hover/.test(cssS) && !/\.ldk-selectbox-item:hover/.test(stripCss(real.selbox)));
  const a4 = $('[data-sel="a4"]');
  const a4trig = a4.querySelector(".ldk-selectbox-trigger");
  ok("I2 初始未展开（aria-expanded=false）", a4trig.getAttribute("aria-expanded") === "false");
  click(a4trig);
  const opened = a4.querySelector(".ldk-selectbox-dropdown");
  ok("I3 点触发器开面板（真件机制：加节点 ＋ aria-expanded=true ＋ 箭头翻转）",
    !!opened && a4trig.getAttribute("aria-expanded") === "true" &&
    a4.querySelector(".ldk-selectbox-arrow").classList.contains("ldk-selectbox-arrow-up"));
  const items = opened ? Array.from(opened.querySelectorAll("li.ldk-selectbox-item")) : [];
  ok("I4 面板项由 data-items 生成（两项排序项）", items.length === 2 && items[0].textContent === "按字母序");
  const firstRef = items[0], secondRef = items[1];
  ok("I5 开面板后焦点落在第一项（恰 1 项）",
    !!firstRef && Array.from(opened.querySelectorAll(".ldk-selectbox-item-focus")).length === 1 &&
    firstRef.classList.contains("ldk-selectbox-item-focus"));
  fire(secondRef, "mouseover");
  const focused = Array.from(opened.querySelectorAll(".ldk-selectbox-item-focus"));
  ok("I6 🔴 悬停只挪焦点类：节点**同一**（⛔ 不重建面板）",
    focused.length === 1 && focused[0] === secondRef &&
    opened.querySelectorAll("li.ldk-selectbox-item")[0] === firstRef &&
    opened.querySelectorAll("li.ldk-selectbox-item")[1] === secondRef);
  fire(opened.querySelector("ul"), "keydown");
  click(a4trig);
  ok("I7 再点触发器收面板（节点删除 ＋ aria-expanded=false）",
    !a4.querySelector(".ldk-selectbox-dropdown") && a4trig.getAttribute("aria-expanded") === "false");
  const tb = $("#themeBtn"), sb = $("#uiScaleBtn"), root = d.documentElement;
  ok("I8 主题按钮真改 data-theme（实机同一机制）",
    (click(tb), root.dataset.theme === "light") && (click(tb), !root.dataset.theme));
  ok("I9 --ui-scale 按钮真改根上自定义属性",
    (click(sb), root.style.getPropertyValue("--ui-scale") === "1.25") &&
    (click(sb), root.style.getPropertyValue("--ui-scale") === "1"));

  // ══ 段 J · 图与文档完备 ══
  ok("J1 断言清单 I1–I18 在位", /I1\b/.test(html) && /I18\b/.test(html));
  const links = Array.from(d.querySelectorAll("a")).map((a) => a.getAttribute("href"));
  const rel = links.filter((h) => h && !/^https?:/.test(h));
  const broken = rel.filter((h) => !fs.existsSync(path.resolve(dir, h)));
  ok("J2 相对链接 ≥3 条且不断链（00/01/02）", rel.length >= 3 && broken.length === 0,
    "共 " + rel.length + " 条，断链=" + broken.join(","));
  // ⚠️ 必须剔除 <script>/<style> 再取文本：`body.textContent` 会把内联脚本的注释也算进来
  //    （首版实测：脚本里说明机制的 `**加/删节点**` 被当成图内残留 markdown ⇒ 假红）
  const clone = d.body.cloneNode(true);
  Array.from(clone.querySelectorAll("script,style")).forEach((n) => n.remove());
  const bodyText = clone.textContent;
  const mdLeaks = (bodyText.match(/\*\*/g) || []).length + (bodyText.match(/\]\(/g) || []).length +
    (bodyText.match(/`/g) || []).length;
  ok("J3 图内无 markdown 裸语法（可见文本零 ** / ]( / 反引号）", mdLeaks === 0, "残留 " + mdLeaks + " 处");
  ok("J4 硬约束 16 声明在位（设计门已走 ui-ux-pro-max）", /ui-ux-pro-max/.test(html) && /硬约束 16/.test(html));
  ok("J5 页脚给了图的机械门运行命令", /校验-拟真度\.cjs/.test(html));

  // ══ 段 L · 圆角标尺机制 (I15–I18) ══
  //   本案真机制**不是**「写死 4px」：圆角由 app.surfaceRadius（绝对 px 滑杆）拉，一拉就把六档
  //   --radius-xs..2xl **平铺写成同一个值**，--radius-pill 也随滑杆（applyOverrides ①c），
  //   --radius-full 是 50% 几何值不参与。真源常量跨文件对账，防本图自说自话。
  const maxPx = (readSrc("src/core/services/ui/ThemeEngine/constants.ts").match(/RADIUS_MAX_PX\s*=\s*(\d+)/) || [])[1];
  const stepsRaw = (readSrc("src/core/types/theme.ts").match(/RADIUS_SCALE_STEPS\s*=\s*\[([^\]]*)\]/) || [])[1];
  const stepKeys = stepsRaw
    ? stepsRaw.split(",").map((s) => "--radius-" + s.trim().replace(/"/g, "")).filter((s) => s !== "--radius-")
    : [];
  ok("L0 真源常量读齐（RADIUS_MAX_PX ＋ RADIUS_SCALE_STEPS 六档）",
    !!maxPx && stepKeys.length === 6, "max=" + maxPx + " steps=" + stepKeys.join(","));
  const rr = $("#radiusRange");
  ok("L1 圆角滑杆＝真件形状（range · min=0 · step=1 · max＝真源 RADIUS_MAX_PX）",
    !!rr && rr.getAttribute("type") === "range" && rr.getAttribute("min") === "0" &&
    rr.getAttribute("step") === "1" && rr.getAttribute("max") === maxPx,
    rr ? ["min=" + rr.getAttribute("min"), "max=" + rr.getAttribute("max"), "step=" + rr.getAttribute("step")].join(" ") : "无滑杆");
  const jsKeysRaw = (html.match(/var RADIUS_SCALE_KEYS = \[([^\]]*)\]/) || [])[1];
  const mkStepKeys = jsKeysRaw
    ? jsKeysRaw.split(",").map((s) => s.trim().replace(/"/g, "")).filter((s) => s.length > 0)
    : [];
  ok("L2 本图六档键名＝真源 RADIUS_SCALE_STEPS 派生（两份清单不许漂）",
    JSON.stringify(mkStepKeys) === JSON.stringify(stepKeys), mkStepKeys.join(",") + " vs " + stepKeys.join(","));
  const jsWriteRaw = (html.match(/var RADIUS_WRITE_KEYS = ([^;]*);/) || [])[1] || "";
  ok("L3 写面＝六档 ＋ --radius-pill 同值，⛔ 不含 --radius-full",
    /RADIUS_SCALE_KEYS\.concat\(\[RADIUS_PILL_KEY\]\)/.test(jsWriteRaw) &&
    /var RADIUS_PILL_KEY = "--radius-pill"/.test(html) && !/radius-full/.test(jsWriteRaw),
    jsWriteRaw.trim());
  const rootEl = d.documentElement;
  const wKeys = stepKeys.concat(["--radius-pill"]);
  const wVals = () => wKeys.map((k) => rootEl.style.getPropertyValue(k));
  ok("L4 载入即按默认主题 md 档播种：七键同值（＝滑杆值）",
    wVals().every((v) => v === "8px"), wVals().join(","));
  ok("L5 --radius-full（50% 几何值）不被写", rootEl.style.getPropertyValue("--radius-full") === "");
  if (rr) { rr.value = "20"; fire(rr, "input"); }
  ok("L6 拉滑杆 ⇒ 六档平铺同值 ＋ pill 随滑杆", wVals().every((v) => v === "20px"), wVals().join(","));
  click($("#radiusReset"));
  ok("L7 「重置为跟随主题」摘除全部 inline 值（presence 门控：不写即主题）",
    wVals().every((v) => v === ""), wVals().join(","));
  const a5b = $("#in-a5-before"), a5a = $("#in-a5-after");
  ok("L8 改前格带影子类（根上 token 怎么变它都是 0——「没接上标尺」的可视化）",
    !!a5b && a5b.classList.contains("ldk-inline-input-noradius") &&
    /\.ldk-inline-input-noradius\{[^}]*border-radius:0/.test(cssS));
  ok("L9 改后格不带影子类（吃 var(--radius-sm) ⇒ 跟滑杆走）＋ 契约格在排内",
    !!a5a && !a5a.classList.contains("ldk-inline-input-noradius") &&
    !!$("#in-a5-contract") && $("#in-a5-contract").classList.contains("ldk-input"));

  dom.window.close();
  return { pass, fail, fails, info };
}

/* ── 负控：十种篡改，各自必须跑红 ─────────────────────────────────────────── */
async function selfTest(html) {
  const cases = [
    { name: "K1 篡改 token 值（--radius-sm 4px→5px）",
      html: html.replace("--radius-sm:4px;", "--radius-sm:5px;"), expect: /token/ },
    { name: "K2 删掉本图新增的 border-radius 声明",
      html: replaceFirst(html, "border-radius:var(--radius-sm);   /* 🟩 本案唯一新增行", "/* 🟩 已删"), expect: /基类/ },
    { name: "K3 把改后候选文字改回中文（Editor→编辑器）",
      html: replaceFirst(replaceFirst(html, 'data-items="自动|Editor"', 'data-items="自动|编辑器"'),
        '<li class="ldk-selectbox-item ldk-selectbox-item-selected" role="option" data-opt="plugin">Editor</li>',
        '<li class="ldk-selectbox-item ldk-selectbox-item-selected" role="option" data-opt="plugin">编辑器</li>'),
      expect: /改后/ },
    { name: "K4 字号改手填 px（--font-size-md → 14px）",
      html: html.split("font-size:var(--font-size-md);").join("font-size:14px;"), expect: /手填 px 字号|零手填/ },
    { name: "K5 codicon 链接指到不存在的路径",
      // ⚠️ 必须瞄准 `<link>` 那一条：文件头注释里也有同名字符串（`import ".../codicon.css"`），
      //    首版 `replace("dist/codicon.css", …)` 打中了注释 ⇒ 篡改没生效、负控假绿
      html: replaceFirst(html,
        'id="codiconLink" href="../../../../../node_modules/@vscode/codicons/dist/codicon.css"',
        'id="codiconLink" href="../../../../../node_modules/@vscode/codicons/dist/nope.css"'),
      expect: /字体/ },
    { name: "K6 产品区塞一个手绘 svg",
      html: replaceFirst(html, '<div class="page">', '<div class="page"><svg viewBox="0 0 16 16"></svg>'), expect: /svg/ },
    { name: "K7 圆角滑杆上限改成 31（真源 RADIUS_MAX_PX=32）",
      html: replaceFirst(html, 'id="radiusRange" type="range" min="0" max="32"',
        'id="radiusRange" type="range" min="0" max="31"'), expect: /滑杆/ },
    { name: "K8 机制键表删掉 --radius-2xl（与真源六档漂移）",
      html: replaceFirst(html,
        '["--radius-xs", "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl", "--radius-2xl"]',
        '["--radius-xs", "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl"]'),
      expect: /六档键名/ },
    { name: "K9 写面漏掉 pill（用户覆盖时胶囊不跟滑杆）",
      html: replaceFirst(html, "RADIUS_SCALE_KEYS.concat([RADIUS_PILL_KEY])", "RADIUS_SCALE_KEYS"),
      expect: /写面/ },
    { name: "K10 摘掉改前格的影子类（对照就做假了）",
      html: replaceFirst(html,
        'id="in-a5-before" class="ldk-inline-input ldk-inline-input--normal ldk-inline-input-noradius"',
        'id="in-a5-before" class="ldk-inline-input ldk-inline-input--normal"'),
      expect: /改前格带影子类/ },
  ];
  let bad = 0;
  for (const c of cases) {
    if (c.html === html) { console.log("⚠️  负控 " + c.name + " 的篡改没生效（fixture 变了？）—— 本项计失败"); bad++; continue; }
    const r = await audit(c.html);
    const hit = r.fail > 0 && r.fails.some((f) => c.expect.test(f));
    if (hit) console.log("✅ 负控生效：" + c.name + " ⇒ 跑红 " + r.fail + " 条（" + r.fails[0] + "）");
    else { console.log("❌ 负控失效：" + c.name + " ⇒ fail=" + r.fail + " fails=" + r.fails.join(" | ")); bad++; }
  }
  console.log("\n" + (bad ? "❌" : "✅") + " 负控 " + (cases.length - bad) + " / " + cases.length +
    " 项生效（篡改必须跑红——本门才不是橡皮图章）");
  return bad;
}

(async () => {
  const html = fs.readFileSync(htmlPath, "utf8");
  if (process.argv.includes("--self-test")) {
    process.exit((await selfTest(html)) ? 1 : 0);
  }
  const r = await audit(html);
  r.info.forEach((l) => console.log("INFO: " + l));
  console.log("\n" + (r.fail ? "❌" : "✅") + " 通过 " + r.pass + " / " + (r.pass + r.fail));
  process.exit(r.fail ? 1 : 0);
})();
