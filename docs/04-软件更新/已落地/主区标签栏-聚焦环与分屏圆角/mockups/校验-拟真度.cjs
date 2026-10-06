/* 校验-拟真度.cjs —— 本 case 设计图的**拟真度机械门**
 * 图：`mockups/01-设计图-聚焦环与分屏圆角.html`　　档案：`00`–`04`
 *
 * 运行（仓库根）：`node "docs/04-软件更新/已落地/主区标签栏-聚焦环与分屏圆角/mockups/校验-拟真度.cjs"`
 *   负控自证：　`node "…/校验-拟真度.cjs" --self-test`
 *   （纯 Node，无第三方依赖——.cjs 因为仓库是 "type":"module"）
 *
 * 覆盖（＝图尾 §E 的断言清单 I1–I16）：
 *   I1  真 token 同源：本图 `:root` / `[data-theme="light"]` 的每个 token 与 `src/index.css` **逐值相等**
 *   I2  零硬编码色：真源 token 块**之外**的 `<style>` 里不许出现 `#hex`
 *   I3  真类名：本图每个 `ldk-*` 类名要么在真源里存在，要么是已登记的**提案类名**
 *   I4  现状规则逐字：`.demo-current .ldk-group-pane-focused` 声明集 = **立案基线快照**（`BASELINE_COMMIT`，⛔ 不是活源码）里同名规则声明集
 *   I5  拟改规则在位：覆盖层环的五条声明（inset / border / border-radius / z-index / pointer-events）全在
 *   I6  缝法则＋几何真源同源：`constants.ts` 的 `SURFACE_SEAM_INSET_PX = 2` ＋ `tokens.ts` 派生口径 = 图内 JS 口径；
 *       且实况台按真件百分比几何跑（`HANDLE_PCT = 0.4%` 与「先扣缝再分」`(W - HP) / 2` 两态都在——症状 S5）
 *   I7  零手填 px：`ldk-*` 规则里 `border-radius` 一律 `var(--…)` ／ `inherit` ／ `%`（圆点用 `50%`）
 *   I8  真铁律尺寸：标签栏 `calc(35px * var(--ui-scale))` ＋ 图标栏 42 ／ 顶栏 30 ／ 状态栏 22
 *   I9  帧完备：12 个 `figure.frame`，每个都有 `frame-caption` ＋ `frame-note`
 *   I10 帧号唯一 ＋ 每个帧 id 都在 `04-任务清单.md` 里被引用
 *   I11 图 → 档案：图上出现的每个 `T#／D#／E#` 在 `01/02/04` 里存在
 *   I12 档案 → 图：`04` 里的每个 `T1–T7` / `D1–D5` 都在图上出现
 *   I13 窗口宽度 `min(1280px, calc(100vw - 30px))`（不越视口）
 *   I14 硬约束 16 声明 ＋「mockup 仅示意」注释在位
 *   I15 交互齐全：6 个开关 ＋ 圆角滑杆 ＋ 读数
 *   I16 负控自证：17 种篡改各自必红，且**每条断言 I1–I15 都至少有一条负控打它**（尺子不是橡皮图章）
 *
 * ⚠️ 口径：本门只保证「**结构、类名、token、文字、互指**」五件事不错，**不**保证观感
 *    （无浏览器布局引擎 ⇒ 位置/像素类断言不写）。观感以实机为准。
 * ⚠️ CSS 断言一律只扫 `<style>` 内容（`cssOf`）——扫整份 HTML 会把正文里的字面量当声明误判；
 *    解析前先 `stripComments`，否则真源注释里的 `{}`（如 `colors:{}`）会把 brace 配对带偏。
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const dir = __dirname;
const repo = path.resolve(dir, "../../../../..");
const HTML_PATH = path.join(dir, "01-设计图-聚焦环与分屏圆角.html");
const CASE = path.resolve(dir, "..");
const REL = {
  index: "src/index.css",
  constants: "src/core/services/ui/ThemeEngine/constants.ts",
  tokens: "src/core/services/ui/ThemeEngine/tokens.ts",
  groupTabBar: "src/pool/shared/group-tab-bar/GroupTabBar.css",
  layout: "src/pool/zones/main/MainZone/layout.ts",
  contentLayer: "src/pool/zones/main/MainZone/TabContentLayer.tsx",
  task: "docs/04-软件更新/已落地/主区标签栏-聚焦环与分屏圆角/04-任务清单.md",
  cause: "docs/04-软件更新/已落地/主区标签栏-聚焦环与分屏圆角/01-根因与修法.md",
  edge: "docs/04-软件更新/已落地/主区标签栏-聚焦环与分屏圆角/02-边缘情况清单.md",
};
/** 提案类名：真源里**还没有**、由本案提出并已登记的类名（I3 的正控，防「图里自己发明类名」） */
const PROPOSED = ["ldk-group-pane", "ldk-group-pane-split"];
/** 本案的任务号与决策号（I12 用；须与 04 一致） */
const TASKS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7"];
const DECISIONS = ["D1", "D2", "D3", "D4", "D5"];

/* ────────────────────────────── 解析小工具 ────────────────────────────── */
const readRel = (r) => {
  try {
    return fs.readFileSync(path.join(repo, r), "utf8");
  } catch {
    return null;
  }
};
/** 🔴 I4 的「现状」真源＝**立案基线快照**（首次把本夹加进仓库的那一笔）＝图里「现状」引用的那版代码。
 *  诊断图引用的是**修前**；修复一旦落地，活源码必然与图分岔 ⇒ 若 I4 拿活源码当真源，
 *  这条断言落地后**恒假**，等于反过来逼图把「现状」改画成修后（毁掉图的用途）。
 *  改造先例：`已落地/共享输入框圆角与候选名漏译` 的同一门落地后 76/77 红（同一种漂移，只是没治）。
 *  ⛔ 钉 SHA 不钉 `HEAD~n`；⛔ 读不到基线时 I4 判红，**不许**静默退回活源码。 */
const BASELINE_COMMIT = "5d68368e3c170456b9f02fe0975f8ecfb4b5a333";
const B8 = BASELINE_COMMIT.slice(0, 9);
/** 取立案基线那一版文件（git 历史是这件事唯一的恒真源）；读不到 ⇒ `null` ⇒ 由调用方判红 */
function readBaseline(rel) {
  try {
    return execFileSync("git", ["show", `${BASELINE_COMMIT}:${rel}`], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}
const norm = (s) => s.replace(/\s+/g, " ").trim();
/** 取 `<style>` 内容——CSS 断言只扫它 */
function cssOf(html) {
  return (html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || [])
    .map((s) => s.replace(/^<style[^>]*>/, "").replace(/<\/style>\s*$/, ""))
    .join("\n");
}
/** 去注释（⚠️ 必须先做——真源注释里有 `{}` 会把配对带偏） */
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, " ");
/** 选择器 → 声明块体（brace 配对，取第一次出现） */
function findBlock(css, selector) {
  const i = css.indexOf(selector);
  if (i < 0) return null;
  const open = css.indexOf("{", i);
  if (open < 0) return null;
  let depth = 0;
  for (let j = open; j < css.length; j++) {
    if (css[j] === "{") depth++;
    else if (css[j] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, j);
    }
  }
  return null;
}
/** 声明块体 → 排序后的 `name:value` 数组（用于集合比较） */
function decls(body) {
  if (body == null) return [];
  return body
    .split(";")
    .map((d) => norm(d))
    .filter((d) => d && d.includes(":"))
    .map((d) => d.slice(0, d.indexOf(":")).trim() + ":" + d.slice(d.indexOf(":") + 1).trim())
    .sort();
}
/** 声明块体 → Map（用于取单个值） */
function declMap(body) {
  const m = new Map();
  for (const d of decls(body)) m.set(d.slice(0, d.indexOf(":")), d.slice(d.indexOf(":") + 1));
  return m;
}
/** 遍历盒内所有 `选择器{...}` 规则（单层，够本图用） */
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) out.push({ sel: norm(m[1]), body: m[2] });
  return out;
}
/** 递归收集真源里出现过的所有 `ldk-*` 类名 */
function realClassNames(root) {
  const set = new Set();
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        walk(full);
      } else if (/\.(css|tsx|ts)$/.test(e.name)) {
        const src = fs.readFileSync(full, "utf8");
        for (const mm of src.matchAll(/ldk-[a-z0-9-]+/g)) set.add(mm[0]);
      }
    }
  };
  if (fs.existsSync(root)) walk(root);
  return set;
}

/* ────────────────────────────── 审计主体 ────────────────────────────── */
function audit(htmlText) {
  const fails = [];
  const info = [];
  const pass = [];
  const css = stripComments(cssOf(htmlText));
  const ok = (id, cond, msg) => {
    if (cond) pass.push(id);
    else fails.push(`${id} ${msg}`);
  };

  const realIndex = readRel(REL.index) ?? "";
  const realIndexCss = stripComments(realIndex);
  const darkRoot = findBlock(realIndexCss, ":root");
  const lightRoot = findBlock(realIndexCss, '[data-theme="light"]');
  const mockDark = findBlock(css, ":root");
  const mockLight = findBlock(css, '[data-theme="light"]');

  /* ── I1 真 token 同源（逐值） ── */
  const i1 = [];
  if (darkRoot == null || lightRoot == null) i1.push("真源 `src/index.css` 里找不到 `:root` / `[data-theme=\"light\"]` 块");
  if (mockDark == null || mockLight == null) i1.push("本图缺 `:root` / `[data-theme=\"light\"]` 块");
  const compareBlock = (mockBody, realBody, tag) => {
    const real = declMap(realBody);
    for (const [k, v] of declMap(mockBody)) {
      if (!real.has(k)) i1.push(`${tag}：本图多出 token \`${k}\`（真源无此键）`);
      else if (real.get(k) !== v) i1.push(`${tag}：\`${k}\` 本图 ${v} ≠ 真源 ${real.get(k)}`);
    }
  };
  if (mockDark && darkRoot) compareBlock(mockDark, darkRoot, "暗色");
  if (mockLight && lightRoot) compareBlock(mockLight, lightRoot, "亮色");
  info.push(`真 token 对账：暗色 ${declMap(mockDark).size} 键 / 亮色 ${declMap(mockLight).size} 键`);
  ok("I1", i1.length === 0, `真 token 与 src/index.css 不同源：\n      ${i1.join("\n      ")}`);

  /* ── I2 零硬编码色（真源 token 块之外） ── */
  let outside = css;
  for (const body of [mockDark, mockLight, darkRoot, lightRoot]) {
    if (body != null) outside = outside.split(body).join(" ");
  }
  const hexes = [...outside.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
  info.push(`真源块之外的硬编码色：${hexes.length} 处`);
  ok("I2", hexes.length === 0, `真源 token 块之外出现硬编码色 ${hexes.join(", ")}（应走 var(--xxx)）`);

  /* ── I3 真类名 / 已登记提案类名 ── */
  const used = new Set([...htmlText.matchAll(/ldk-[a-z0-9-]+/g)].map((m) => m[0]));
  const real = realClassNames(path.join(repo, "src"));
  const docsText = (readRel(REL.cause) ?? "") + (readRel(REL.task) ?? "");
  const unknown = [];
  for (const c of used) {
    if (real.has(c)) continue;
    if (PROPOSED.includes(c) && docsText.includes(c)) continue;
    unknown.push(c);
  }
  info.push(`本图用到 ldk-* 类名 ${used.size} 个（真源命中 ${[...used].filter((c) => real.has(c)).length} ／ 提案 ${[...used].filter((c) => PROPOSED.includes(c)).length}）`);
  ok("I3", unknown.length === 0, `这些 ldk-* 类名在真源里不存在、也不是已登记提案类名：${unknown.join(", ")}`);

  /* ── I4 现状规则逐字（真源＝立案基线快照，见 BASELINE_COMMIT） ──
     ⚠️ 与 I1 的分工：I1（token 表）钉**活**源码——主题契约变了图就得跟；I4（这条规则）钉**基线**——图引用的是修前。 */
  const baselineRaw = readBaseline(REL.index);
  const baselineCss = baselineRaw == null ? null : stripComments(baselineRaw);
  const baseRing = baselineCss == null ? [] : decls(findBlock(baselineCss, ".ldk-group-pane-focused"));
  const liveRing = decls(findBlock(realIndexCss, ".ldk-group-pane-focused"));
  const mockRing = decls(findBlock(css, ".demo-current .ldk-group-pane-focused"));
  const sameRing = baselineCss != null && JSON.stringify(baseRing) === JSON.stringify(mockRing);
  info.push(`现状环声明集：立案基线 ${B8} [${baseRing.join(" | ")}] ／ 本图 [${mockRing.join(" | ")}]`);
  info.push(`活源码同名规则 [${liveRing.join(" | ")}]——${JSON.stringify(liveRing) === JSON.stringify(baseRing) ? "＝基线（本案未动这条）" : "≠ 基线（本案已动这条 ⇒ I4 真源必须钉基线）"}`);
  ok("I4", sameRing && baseRing.length > 0, baselineCss == null
    ? `拿不到立案基线快照（\`git show ${B8}:${REL.index}\` 失败）——I4 缺真源，⛔ 不判绿`
    : `本图的「现状」环声明与立案基线 ${B8} 的 ${REL.index} 不逐字相同（基线 [${baseRing.join(" | ")}] ≠ 本图 [${mockRing.join(" | ")}]）`);

  /* ── I5 拟改规则在位 ── */
  const fixBody = findBlock(css, ".demo-fix .ldk-group-pane-focused::after");
  const fix = declMap(fixBody);
  const need = [
    ["inset", "0"],
    ["border", "1px solid var(--accent)"],
    ["border-radius", "inherit"],
    ["z-index", "1"],
    ["pointer-events", "none"],
  ];
  const miss = need.filter(([k, v]) => fix.get(k) !== v).map(([k, v]) => `${k}: ${v}（实得 ${fix.get(k) ?? "无"}）`);
  ok("I5", miss.length === 0, `覆盖层环缺声明／值不符：${miss.join("；")}`);

  /* ── I6 缝法则同源 ── */
  const constants = readRel(REL.constants) ?? "";
  const tokens = readRel(REL.tokens) ?? "";
  const realSeam = /SURFACE_SEAM_INSET_PX\s*=\s*2\b/.test(constants);
  const realDerive = /surface-inset/.test(tokens) && /SURFACE_SEAM_INSET_PX/.test(tokens) && /0px/.test(tokens);
  const mockDerive = /radius === 0 \? ["']0px["'] : ["']2px["']/.test(htmlText);
  // S5：实况台须按真几何真源跑——缝宽 `HANDLE_PCT = 0.4` 与「先扣缝再分」`(W - HP) / 2` 两态都在图里
  const mockHp = /HP = 0?\.4\b/.test(htmlText);
  const mockGeoSplit = /\(W - HP\) \/ 2/.test(htmlText);
  ok("I6", realSeam && realDerive && mockDerive && mockHp && mockGeoSplit,
    `缝法则／几何真源不同源（constants:${realSeam} ／ tokens:${realDerive} ／ 图内派生:${mockDerive} ／ ` +
    `缝宽 0.4:${mockHp} ／ 扣缝再分:${mockGeoSplit}）——` +
    `口径须为「--surface-radius 为 0 → 0px，否则 ${2}px」＋ 实况台 ` +
    `HANDLE_PCT = 0.4% 与 (W - HP) / 2 两态`);

  /* ── I7 零手填 px（ldk-* 规则的 border-radius） ── */
  const hand = [];
  for (const r of rules(css)) {
    if (!/ldk-/.test(r.sel)) continue;
    const m = /border(-[a-z]+)?-radius\s*:\s*([^;]+)/.exec(r.body);
    // `%` 放行：真源把手圆点就是 `border-radius: 50%`（相对值，不是写死的像素）
    if (m && !/var\(|inherit|%/.test(m[2])) hand.push(`${r.sel} → ${norm(m[2])}`);
  }
  ok("I7", hand.length === 0, `产品区圆角写死了（应走 var(--…) / inherit / %）：${hand.join("；")}`);

  /* ── I8 真铁律尺寸 ── */
  const tabBar = findBlock(css, ".ldk-group-tab-bar") ?? "";
  const bar35 = /calc\(35px\s*\*\s*var\(--ui-scale\)\)/.test(tabBar);
  const i42 = /42px/.test(findBlock(css, ".icon-bar") ?? "");
  const t30 = /30px/.test(findBlock(css, ".titlebar") ?? "");
  const s22 = /22px/.test(findBlock(css, ".statusbar") ?? "");
  ok("I8", bar35 && i42 && t30 && s22,
    `真铁律尺寸缺读：标签栏35(calc×ui-scale)=${bar35} ／ 图标栏42=${i42} ／ 顶栏30=${t30} ／ 状态栏22=${s22}`);

  /* ── I9 帧完备 ── */
  const figs = [...htmlText.matchAll(/<figure class="frame" id="([^"]+)"/g)].map((m) => m[1]);
  const caps = (htmlText.match(/class="frame-caption"/g) || []).length;
  const notes = (htmlText.match(/class="frame-note"/g) || []).length;
  info.push(`帧：${figs.length} 个（caption ${caps} ／ note ${notes}）`);
  ok("I9", figs.length === 12 && caps === 12 && notes === 12,
    `帧不完备：figure ${figs.length} ／ caption ${caps} ／ note ${notes}（应各 12）`);

  /* ── I10 帧号唯一 ＋ 在 04 里被引用 ── */
  const dup = figs.filter((f, i) => figs.indexOf(f) !== i);
  const taskDoc = readRel(REL.task) ?? "";
  const notRef = figs.filter((f) => !taskDoc.includes(f));
  ok("I10", dup.length === 0 && notRef.length === 0,
    `帧号问题：重复 ${dup.join(",") || "无"} ／ 未被 04 引用 ${notRef.join(",") || "无"}`);

  /* ── I11 图 → 档案 ── */
  // ⚠️ 编号提取一律排除「# 前缀」与词字符前缀：否则真 token 块里的 `#D4D4D4` / `#E06C75`
  //    会被读成编号 `D4` / `E06`（假红）。版本号 `E5.8#30.15` 由 `(?![\d.])` 挡掉。
  const pick = (re) => [...new Set([...htmlText.matchAll(re)].map((m) => m[0]))];
  const tUsed = pick(/(?<![\w.#-])T\d(?![\w.])/g);
  const dUsed = pick(/(?<![\w.#-])D\d(?![\w.])/g);
  const eUsed = pick(/(?<![\w.#-])E\d{1,2}(?![\d.])/g);
  const causeDoc = readRel(REL.cause) ?? "";
  const edgeDoc = readRel(REL.edge) ?? "";
  const dangling = [
    ...tUsed.filter((t) => !taskDoc.includes(t)),
    ...dUsed.filter((d) => !taskDoc.includes(d)),
    ...eUsed.filter((e) => !edgeDoc.includes(e)),
  ];
  info.push(`图上编号：T ${tUsed.join(",")} ／ D ${dUsed.join(",")} ／ E ${eUsed.join(",")}`);
  ok("I11", dangling.length === 0, `图上出现但档案里找不到的编号：${dangling.join(", ")}（T/D → 04，E → 02）`);

  /* ── I12 档案 → 图 ── */
  const notDrawn = [...TASKS, ...DECISIONS].filter((t) => !htmlText.includes(t));
  ok("I12", notDrawn.length === 0, `04 里有、图上没画的编号：${notDrawn.join(", ")}`);

  /* ── I13 窗口宽度 ── */
  ok("I13", /min\(1280px, calc\(100vw - 30px\)\)/.test(css), "舞台窗口宽度不是 `min(1280px, calc(100vw - 30px))`（会越出视口）");

  /* ── I14 硬约束 16 ＋ mockup 仅示意 ── */
  ok("I14", htmlText.includes("硬约束 16") && htmlText.includes("mockup 仅示意"),
    "缺「硬约束 16」声明或「mockup 仅示意」注释");

  /* ── I15 交互齐全 ── */
  const ids = ["btnTheme", "btnMode", "btnLayout", "btnAlpha", "btnGeo", "btnDir", "radiusRange", "readout"];
  const missIds = ids.filter((i) => !htmlText.includes(`id="${i}"`));
  ok("I15", missIds.length === 0, `交互控件缺 id：${missIds.join(", ")}`);

  return { pass: pass.length, fail: fails.length, fails, info };
}

/* ────────────────────────────── 负控自证 ────────────────────────────── */
const NEG = [
  // 每条：篡改锚点都用「在真件里已核实唯一」的字面量 ⇒ 篡改必生效；锚点一漂，自测会自报「篡改没生效」
  ["I1 改真 token 的值", (h) => h.replace("--bg-card: #2D2D2D;", "--bg-card: #2E2E2E;"), /^I1 /],
  ["I1 塞一个真源没有的 token", (h) => h.replace("--bg-card: #2D2D2D;", "--bg-card: #2D2D2D;\n  --bogus-token: 3px;"), /^I1 /],
  ["I2 真源块之外写死颜色", (h) => h.replace("</style>", "\n.demo-scaffold-probe { color: #FF0000; }\n</style>"), /^I2 /],
  ["I3 造一个真源没有的类名", (h) => h.replace(".ldk-split-handle {", ".ldk-fake-pane { color: var(--text-primary); }\n.ldk-split-handle {"), /^I3 /],
  ["I4 给「现状」环多塞一条声明", (h) => h.replace(".demo-current .ldk-group-pane-focused {", ".demo-current .ldk-group-pane-focused { outline-offset: 1px;"), /^I4 /],
  // ⚠️ I5 的负控必须**整块覆写**规则体：往规则体开头**追加**同名声明没用——取值是后写覆盖先写（last-wins），追加会被原声明压回去 ⇒ 负控假绿
  ["I5 让环吃点击（pointer-events 失守）", (h) => h.replace(/(\.demo-fix \.ldk-group-pane-focused::after\s*\{)[\s\S]*?\}/, "$1 pointer-events: auto; }"), /^I5 /],
  ["I6 篡改缝法则口径", (h) => h.replace(/radius === 0 \? '0px' : '2px'/g, "radius === 0 ? '1px' : '3px'"), /^I6 /],
  ["I6 抹掉扣缝再分（几何真源漂成 W / 2）", (h) => h.replace(/\(W - HP\) \/ 2/g, "W / 2"), /^I6 /],
  ["I7 产品区圆角写死 px", (h) => h.replace(".ldk-group-tab-item { height", ".ldk-group-tab-item { border-radius: 4px; height"), /^I7 /],
  ["I8 改标签栏铁律高度", (h) => h.replace(/calc\(35px \* var\(--ui-scale\)\)/g, "calc(32px * var(--ui-scale))"), /^I8 /],
  ["I9 删一个 frame-note", (h) => h.replace('class="frame-note"', 'class="frame-note-x"'), /^I9 /],
  ["I10 加一个 04 里没有的帧", (h) => h.replace("<!-- f-current-1 -->", '<figure class="frame" id="f-bogus"><figcaption class="frame-caption">x</figcaption><div class="frame-note">x</div></figure><!-- f-current-1 -->'), /^I(9|10) /],
  ["I11 图上编一个新编号 T9", (h) => h.replace("<!-- f-current-1 -->", "<!-- f-current-1 ｜ T9 -->"), /^I11 /],
  ["I12 抹掉图上的 T4", (h) => h.replace(/T4/g, "TX"), /^I12 /],
  ["I13 窗口宽度写死", (h) => h.replace("min(1280px, calc(100vw - 30px))", "1280px"), /^I13 /],
  ["I14 删「硬约束 16」声明", (h) => h.replace(/硬约束 16/g, "门禁声明"), /^I14 /],
  ["I15 删一个控件 id", (h) => h.replace('id="radiusRange"', 'id="radiusRangeX"'), /^I15 /],
];

function runSelfTest(html) {
  let bad = 0;
  const base = audit(html);
  const baseOk = base.fail === 0;
  if (!baseOk) {
    bad++;
    console.log("❌ 正控失败：真件本身就不绿 ——\n   " + base.fails.join("\n   "));
  } else {
    console.log(`✅ 正控：真件全绿（${base.pass} 条）`);
  }

  const covered = new Set();
  let negHit = 0;
  for (const [name, mut, expect] of NEG) {
    const h = mut(html);
    if (h === html) {
      console.log(`⚠️  负控「${name}」的篡改没生效（fixture 变了？）—— 本项计失败`);
      bad++;
      continue;
    }
    const r = audit(h);
    const hit = r.fail > 0 && r.fails.some((f) => expect.test(f));
    if (hit) {
      negHit++;
      r.fails.filter((f) => expect.test(f)).forEach((f) => covered.add(f.split(" ")[0]));
      console.log(`✅ 负控生效：${name} ⇒ 跑红 ${r.fail} 条（${r.fails[0].slice(0, 70)}）`);
    } else {
      console.log(`❌ 负控失效：${name} ⇒ fail=${r.fail} ／ fails=${r.fails.join(" | ").slice(0, 160)}`);
      bad++;
    }
  }

  /* 断言覆盖：I1–I15 每条都必须至少被一条负控打过（否则那条是橡皮图章） */
  const need = Array.from({ length: 15 }, (_, i) => `I${i + 1}`);
  const naked = need.filter((i) => !covered.has(i));
  if (naked.length) {
    bad++;
    console.log(`❌ 断言覆盖不足：${naked.join(", ")} 没有任何负控打它（尺子会恒绿）`);
  } else {
    console.log(`✅ 断言覆盖：I1–I15 每条都至少有 1 条负控打它`);
  }

  console.log(
    (bad ? "\n❌" : "\n✅") +
      ` 负控 ${negHit} / ${NEG.length} 项生效 ｜ 正控 1 例全绿 ｜ 断言覆盖 ${15 - naked.length} / 15` +
      (bad ? "" : "（尺子不是在恒绿）"),
  );
  return bad;
}

/* ────────────────────────────── 入口 ────────────────────────────── */
const html = fs.readFileSync(HTML_PATH, "utf8");
if (process.argv.includes("--self-test")) {
  process.exit(runSelfTest(html) ? 1 : 0);
}
const r = audit(html);
r.info.forEach((l) => console.log("INFO: " + l));
if (r.fail) {
  console.error(`\n❌ 设计图拟真度门 ${r.fail} 处不符：\n   ${r.fails.join("\n   ")}`);
  process.exit(1);
}
console.log(`\n✅ 设计图拟真度门通过 ${r.pass} / ${r.pass}（改图后必跑；红了就是漂了）`);
