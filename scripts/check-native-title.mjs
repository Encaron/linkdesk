/**
 * 机械检查：壳侧 JSX 原生 `title=` 判红（04「悬停提示系统」件 2 · 门禁腿 2）。
 *
 * ── 为什么有这条腿 ──
 * 悬停提示已由 `HintTip`（`data-hint*` 属性式）统一接管（件 1）。原生 `title=` 是**第二把尺子**：
 * 它由浏览器渲染、样式不可控（深浅主题/字号缩放都不跟壳走）、与快捷键键帽那套长相必然分叉——
 * 「两把尺子必然漂移」（memory `two-rulers-one-caliber`）。本腿把它变成**新增即红**。
 *
 * ── 判据（三档，⚠️ 判据物是 **JSX 开标签上的属性**，不是文件里出现 `title` 字样）──
 *   ① 判红：`title=` 落在**小写 HTML 标签**上（`<button title=` / `<span title=` / `<div title=`…）
 *      ——小写 = DOM 元素，一定落到原生提示。
 *   ② 不判：`title=` 落在**大写组件**上。那是**组件自己的 prop**（典型：`<SidebarSection title="">`
 *      的标题文本、视图元数据对象的 `.title`）——一刀切判 `title=` 会满屏假红，假红会让真红失效。
 *      ⚠️ 共享件的 `title` **prop** 今天已改由 `data-hint` 渲染（件 3 起）⇒ 不存在"组件把 title
 *      转发到 DOM"这一档，故**本腿不设转发登记表**（登记表是给"实现行被白名单放行"的世界用的；
 *      零容忍下，转发件的实现行本身就是小写标签行，新转发件直接在那里红）。判据边界见 §残余风险。
 *   ③ 豁免口：`// eslint-disable-next-line linkdesk/no-native-title -- 理由`（同行写
 *      `eslint-disable-line` 亦可）。**理由必填**——照 SDK `disable.ts` 既有形态（同一个腿 id，
 *      插件仓那侧由 `no-native-title.ts` 认同一批注释）。
 *
 * ── 存量怎么办：白名单账（用户拍板 6「只判新增 ＋ 存量进白名单账」）──
 * 新能力落地当天壳侧 43 处（`src/` 38 ＋ 夹具 `plugins/` 5）——开盘即全红没人能提交。
 * ⇒ 存量按 **`文件 × 标签` 计数**进 `scripts/native-title-baseline.json`，**新写一处即红**；
 *    收编一处 ⇒ 实得数下降 ⇒ 本腿报「账上多余」提示销账。**账随收编递减、可对账**。
 *    ⚠️ 为什么记计数不记行号：行号会被签名/导入变更整体推移 ⇒ 假红。计数只认"多出来的一处"。
 *
 * ── 锚⑪：判据口径跨包同源（本脚本 ⇄ `packages/plugin-sdk/src/eslint/checks/no-native-title.ts`）──
 * 壳尺子与 SDK 腿跨包无法互相 import ⇒ 照 `锚⑧`/`锚⑨`/`锚⑩` 先例钉**锚词**：下面 3 句口径文本必须
 * **逐字**两边都在（本脚本 `--self-test` 断言 SDK 腿那份，SDK 的 `no-native-title.test.ts` 断言本份
 * ——两边互证，**改一边不改另一边 ⇒ 当场红**）：
 *   ① 小写 HTML 标签上的 title= 判红
 *   ② 大写组件上的 title= 是组件自己的 prop，不判
 *   ③ 豁免 = // eslint-disable-next-line linkdesk/no-native-title -- 理由（理由必填）
 *
 * 用法：node scripts/check-native-title.mjs（已挂 npm run check）
 *       node scripts/check-native-title.mjs --self-test
 * 退出码 0 = 无新增（账平或已清零），退出码 1 = 有违规（打印到 stderr）。
 *
 * ── 残余风险（诚实边界）──
 *   1. 判据是**文本级**（不引 TS 解析器，与壳其余 check 同口径）：写成变量标签（`const Tag = "button"`）
 *      或属性值里塞了未闭合的模板字面量这类写法读不出 ⇒ 漏报。窄射程宁可漏，不猜（同其余腿口径）。
 *   2. 大写组件用**标签名首字母**分档：小写名字的组件（如 `myButton`）会被判红——JSX 里小写名字本就不
 *      是组件（React 视作 DOM 标签），判红正确。
 */

import { readFileSync, readdirSync, existsSync } from "fs";
import { resolve, dirname, sep } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// 域 = 壳侧 JSX（池层 ＋ 共享件）＋ 仓内开发夹具 panel-demo（照 check-css-hardcode 的 SCAN_DIRS 口径）
const SCAN_DIRS = ["src", "plugins"];
const SKIP_DIRS = new Set(["node_modules", "dist", "dist-electron", ".git", ".vite", "coverage", "out"]);
const EXT_RE = /\.tsx$/;

const BASELINE_PATH = "scripts/native-title-baseline.json";
/** 与 SDK 腿同名（同一个腿 id：一条注释两边都认，⛔ 不另起名字） */
export const LEG_ID = "linkdesk/no-native-title";
const MTAG = `eslint-disable-next-line ${LEG_ID}`;
const STAG = `eslint-disable-line ${LEG_ID}`;

/** 注脚里的正解（报错即文档） */
export const NATIVE_TITLE_WHY =
  "壳侧 JSX 不许再用原生 title=（提示已由 HintTip 统一：深浅主题/字号缩放才跟壳走）。" +
  '正解：`title={x}` → `data-hint={x}`（说明类留默认延时；揭示类——"看全被截断的字"——加 ' +
  '`data-hint-delay="0"`）；要带快捷键就改 `data-hint-command="<命令 id>"` 并去掉手写文案。' +
  `确需原生 title（如 <optgroup> 之类提示渲染器够不到的形态）= ${MTAG} -- 理由（理由必填）。`;

/** 与 SDK `scan.ts` 同两条正则（同口径：块注释等长空格替换 ⇒ 行号不漂移；`https://` 不误伤） */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}
function stripLineComments(text) {
  return text.replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** 词法清洗后的一段源码（判据的解析输入；⛔ 换行数不变 ⇒ 行号与原文对齐） */
export function cleanSource(src) {
  return stripLineComments(stripComments(src));
}

/** JSX 开标签的名字（`<` 紧跟字母/下划线；大小写原样留）——返回 null 表示这里不是开标签 */
function tagNameAt(s, i) {
  const m = /^<([A-Za-z_][\w.$]*)/.exec(s.substring(i, i + 64));
  return m ? m[1] : null;
}

/** 从标签名之后找**本标签**的收尾 `>`（跳过字符串/模板字面量、跳过 `{}` 内的任意 `>`） */
function tagEnd(s, from) {
  let depth = 0;
  for (let j = from; j < s.length; j++) {
    const ch = s[j];
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch;
      j++;
      while (j < s.length && s[j] !== q) {
        if (s[j] === "\\") j++;
        j++;
      }
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === ">" && depth === 0) return j;
  }
  return -1;
}

/** 属性值原文（`{…}` 取到配平的花括号 / `"…"` 取到收尾引号 / 裸值取到空白） */
function attrValueAt(s, from) {
  let i = from;
  while (i < s.length && /\s/.test(s[i])) i++;
  if (s[i] === "{") {
    let depth = 0;
    for (let j = i; j < s.length; j++) {
      const ch = s[j];
      if (ch === '"' || ch === "'" || ch === "`") {
        const q = ch;
        j++;
        while (j < s.length && s[j] !== q) {
          if (s[j] === "\\") j++;
          j++;
        }
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) return s.slice(i, j + 1);
      }
    }
    return s.slice(i);
  }
  if (s[i] === '"' || s[i] === "'") {
    const q = s[i];
    for (let j = i + 1; j < s.length; j++) {
      if (s[j] === "\\") j++;
      else if (s[j] === q) return s.slice(i, j + 1);
    }
    return s.slice(i);
  }
  const m = /^[^\s>]+/.exec(s.slice(i));
  return m ? m[0] : "";
}

/** `title=` 出现在属性位（前一位不是标识符字符/`-`/`.` ⇒ `data-title=` / `myTitle=` 不算） */
const TITLE_ATTR_RE = /(?<![\w$.-])title\s*=/g;

/** 豁免注释是否覆盖第 line 行（1-based）——上一行 next-line 形 ／ 同行 line 形；**理由必填** */
function exemptReasonAt(srcLines, line) {
  const candidates = [srcLines[line - 1], srcLines[line - 2]];
  const tags = [STAG, MTAG];
  for (let k = 0; k < candidates.length; k++) {
    const text = candidates[k];
    if (!text) continue;
    const at = text.indexOf(tags[k]);
    if (at === -1) continue;
    const rest = text.slice(at + tags[k].length);
    const reason = /^\s*--\s*(\S.*)$/.exec(rest);
    return { ok: Boolean(reason), reason: reason ? reason[1].trim() : "" };
  }
  return null;
}

/**
 * 纯判据：一段源码里的原生 title 站点（不读盘 ⇒ `--self-test` 可注入）。
 * 返回 `[{ line, tag, expr, exempt, noReason }]`。
 */
export function findSites(src) {
  const cleaned = cleanSource(src);
  const srcLines = src.split("\n");
  const out = [];
  let i = 0;
  while (i < cleaned.length) {
    const lt = cleaned.indexOf("<", i);
    if (lt === -1) break;
    const tag = tagNameAt(cleaned, lt);
    if (!tag) {
      i = lt + 1;
      continue;
    }
    const end = tagEnd(cleaned, lt + 1 + tag.length);
    if (end === -1) {
      i = lt + 1;
      continue;
    }
    if (!/^[a-z]/.test(tag)) {
      // 大写（含 `_`/`$` 开头）= 组件 —— `title=` 是**组件自己的 prop**，不判（判据 ②）
      i = end + 1;
      continue;
    }
    const tagText = cleaned.slice(lt, end + 1);
    const re = new RegExp(TITLE_ATTR_RE.source, "g");
    let m;
    while ((m = re.exec(tagText)) !== null) {
      const line = countNewlines(cleaned.slice(0, lt + m.index)) + 1;
      const ex = exemptReasonAt(srcLines, line);
      out.push({
        line,
        tag,
        expr: attrValueAt(tagText, m.index + m[0].length),
        exempt: Boolean(ex && ex.ok),
        noReason: Boolean(ex && !ex.ok),
      });
    }
    i = end + 1;
  }
  return out;
}

function countNewlines(s) {
  let c = 0;
  for (const ch of s) if (ch === "\n") c++;
  return c;
}

/** 递归收集扫描域里的生产 `.tsx`（排测试/夹具/mock——同其余腿口径） */
function collectTsx(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectTsx(full, out);
    } else if (entry.isFile() && EXT_RE.test(entry.name)) {
      const rel = full.replace(ROOT + sep, "").split(sep).join("/");
      if (/\.(test|spec)\.|\.(fixture|mock)\./.test(rel)) continue;
      out.push(rel);
    }
  }
  return out;
}

/** 账（`{ 文件: { 标签: 处数 } }`）→ `文件::标签 → 处数`；顺带返回键集合 */
export function tallyOf(sites) {
  const map = new Map();
  for (const s of sites) {
    if (s.exempt) continue; // 豁免的不进账：它不是存量，是裁决过的偏离
    const key = `${s.rel}::${s.tag}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

/** 账文件 → 同样的 `文件::标签 → 处数` */
export function tallyFromBaseline(counts) {
  const map = new Map();
  for (const [rel, byTag] of Object.entries(counts ?? {})) {
    for (const [tag, n] of Object.entries(byTag ?? {})) map.set(`${rel}::${tag}`, n);
  }
  return map;
}

/**
 * 纯判据：实得站点 vs 账 ⇒ 违规列表。**只判新增**（实得 > 账）＋ **账不许腐烂**
 * （实得 < 账 ⇒ 提示销账，否则账与实况脱节、下一步"新增"判不准）。
 */
export function judge(sites, counts) {
  const real = tallyOf(sites);
  const ledger = tallyFromBaseline(counts);
  const violations = [];
  const keys = [...new Set([...real.keys(), ...ledger.keys()])].sort();
  for (const key of keys) {
    const [rel, tag] = key.split("::");
    const got = real.get(key) ?? 0;
    const want = ledger.get(key) ?? 0;
    if (got > want) {
      const lines = sites
        .filter((s) => !s.exempt && s.rel === rel && s.tag === tag)
        .map((s) => `${rel}:${s.line}`)
        .join(" / ");
      violations.push(
        `  ${rel}  <${tag}> 原生 title= 新增 ${got - want} 处（账上 ${want}）——${lines}\n    ${NATIVE_TITLE_WHY}`,
      );
    } else if (got < want) {
      violations.push(
        `  ${rel}  <${tag}> 账上 ${want} 处、实得 ${got} 处——**收编了没销账**：` +
          `把 scripts/native-title-baseline.json 里这一格降到 ${got}（降到 0 就删掉该格）。`,
      );
    }
  }
  // 无理由的豁免注释：单独报（豁免要挂账，理由必填）
  for (const s of sites) {
    if (s.noReason) {
      violations.push(
        `  ${s.rel}:${s.line}  豁免注释缺理由——\`${MTAG} -- <为什么这里必须用原生 title>\`（理由必填）`,
      );
    }
  }
  return violations;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 🔴 每例都**真跑判据**并断言实得结果——负控必须真的红、正控必须真的绿（只写不断言 = 假门禁）。
 * `锚⑪` 那一例把**跨包口径**钉住：壳尺子 / SDK 腿的 3 句锚词必须逐字两边都在。
 */
function runSelfTest() {
  const S = (rel, src) => findSites(src).map((s) => ({ ...s, rel }));
  const cases = [
    // ── 正控：不判 / 已收编 / 账平 ⇒ 0 条 ──
    [
      "正控①：小写标签无 title（`<div className>`）⇒ 0 处",
      S("x.tsx", `const A = () => <div className="d">hi</div>;`).length,
      0,
    ],
    [
      "正控②：已收编形态（`<button data-hint={x}>`）⇒ 0 处",
      S("x.tsx", `const A = () => <button data-hint={t("a")}>x</button>;`).length,
      0,
    ],
    [
      "正控③：大写组件上的 title（组件自己的 prop）⇒ 0 处（不判）",
      S("x.tsx", `const A = () => <SidebarSection title={view.title} />;`).length,
      0,
    ],
    [
      "正控④：`data-title=` / `titleTooltip=` / `myTitle=` ⇒ 0 处（不是 title 属性）",
      S("x.tsx", `const A = () => <div data-title="a" titleTooltip={b} myTitle={c} />;`).length,
      0,
    ],
    [
      "正控⑤：注释里的 `<button title=x>` ⇒ 0 处（剥注释后不解析）",
      S("x.tsx", `// <button title="dead">x</button>\nconst A = () => <div>ok</div>;`).length,
      0,
    ],
    [
      "正控⑥：`https://` 的 `//` 不误伤整行（同行后续 title 仍读得出）",
      S("x.tsx", `const A = () => <button onClick={() => open("https://a.b")} title={t("a")}>x</button>;`)
        .length,
      1,
    ],
    [
      "正控⑦：豁免注释（上一行 next-line ＋ 理由）⇒ 站点在、但不进账 ⇒ 账平 0 违规",
      judge(
        S(
          "x.tsx",
          `// eslint-disable-next-line ${LEG_ID} -- 原生 title 是这里唯一的可达形态\nconst A = () => <span title="x">y</span>;`,
        ),
        {},
      ).length,
      0,
    ],
    [
      "正控⑧：账里记着的存量 ⇒ 0 违规（只判新增）",
      judge(S("x.tsx", `const A = () => <button title={t("a")}>x</button>;`), { "x.tsx": { button: 1 } })
        .length,
      0,
    ],
    // ── 负控：判红（条数也要对） ──
    [
      "负控①：小写标签 `title=` ⇒ 1 处（空账 ⇒ 1 违规）",
      judge(S("x.tsx", `const A = () => <button title={t("a")}>x</button>;`), {}).length,
      1,
    ],
    [
      "负控②：**跨行**标签里的 title 也要读出来（属性换行不换行一个样）⇒ 1 处",
      S("x.tsx", `const A = () => (\n  <button\n    className="b"\n    title={t("a")}\n  >x</button>\n);`).length,
      1,
    ],
    [
      "负控③：自闭合 `<input title= />` ⇒ 1 处",
      S("x.tsx", `const A = () => <input title={t("a")} />;`).length,
      1,
    ],
    [
      "负控④：同文件同标签 2 处、账上只记 1 ⇒ 1 违规（计数判新增，不是「有账就放行」）",
      judge(
        S(
          "x.tsx",
          `const A = () => <button title={a}>x</button>;\nconst B = () => <button title={b}>y</button>;`,
        ),
        { "x.tsx": { button: 1 } },
      ).length,
      1,
    ],
    [
      "负控⑤：收编后没销账（账 2 / 实得 1）⇒ 1 违规（账不许腐烂）",
      judge(S("x.tsx", `const A = () => <button title={a}>x</button>;`), { "x.tsx": { button: 2 } }).length,
      1,
    ],
    [
      "负控⑥：豁免注释**没写理由** ⇒ 不豁免（站点照旧进账 ⇒ 1 违规）＋ 单独报一条缺理由",
      judge(
        S("x.tsx", `// eslint-disable-next-line ${LEG_ID}\nconst A = () => <button title={a}>x</button>;`),
        {},
      ).length,
      2,
    ],
    [
      "负控⑦：文件整份删掉后账没销 ⇒ 1 违规（账指向空气也要报）",
      judge([], { "gone.tsx": { span: 1 } }).length,
      1,
    ],
  ];

  let bad = 0;
  for (const [tag, got, want] of cases) {
    const pass = got === want;
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got} 条\n`);
  }

  // ── 锚⑪：判据口径跨包同源（本脚本 ⇄ SDK 腿）──
  //   本侧只断言 **SDK 腿那份**（断言自己那份是废话）；本份由 SDK 的 `no-native-title.test.ts` 反向断言。
  const sdkRel = "packages/plugin-sdk/src/eslint/checks/no-native-title.ts";
  const anchors = [
    "小写 HTML 标签上的 title= 判红",
    "大写组件上的 title= 是组件自己的 prop，不判",
    `豁免 = // eslint-disable-next-line ${LEG_ID} -- 理由（理由必填）`,
  ];
  const sdkSrc = existsSync(resolve(ROOT, sdkRel)) ? readFileSync(resolve(ROOT, sdkRel), "utf-8") : "";
  for (const a of anchors) {
    const ok = sdkSrc.includes(a);
    if (!ok) bad++;
    process.stdout.write(
      `${ok ? "✅" : "🔴"} 锚⑪：口径锚词在 SDK 腿里「${a}」——${ok ? "在" : "**缺**（改口径要两边一起改）"}\n`,
    );
  }

  const positives = cases.filter(([, , want]) => want === 0).length;
  const negatives = cases.length - positives;
  process.stdout.write(
    bad === 0
      ? `\n✅ check-native-title self-test 全过（${cases.length} 例：${positives} 正控绿 / ${negatives} 负控红 ＋ 锚⑪ 3 句）——尺子不是在恒绿。\n`
      : `\n🔴 check-native-title self-test ${bad} 处不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const files = SCAN_DIRS.flatMap((d) => {
    const abs = resolve(ROOT, d);
    return existsSync(abs) ? collectTsx(abs) : [];
  });
  const sites = files.flatMap((rel) => findSites(readFileSync(resolve(ROOT, rel), "utf-8")).map((s) => ({ ...s, rel })));

  if (!existsSync(resolve(ROOT, BASELINE_PATH))) {
    console.error(`❌ 缺少存量账 ${BASELINE_PATH}——本腿按「只判新增」工作，账不在就判不了。`);
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(resolve(ROOT, BASELINE_PATH), "utf-8"));
  const violations = judge(sites, baseline.counts ?? {});

  const counted = sites.filter((s) => !s.exempt).length;
  const ledgerTotal = [...tallyFromBaseline(baseline.counts ?? {}).values()].reduce((a, b) => a + b, 0);

  if (violations.length > 0) {
    console.error(violations.join("\n"));
    console.error(
      `\n❌ 原生 title= 门禁：${violations.length} 条（存量实得 ${counted} 处 / 账上 ${ledgerTotal} 处，扫 ${files.length} 个 tsx）。`,
    );
    process.exit(1);
  }

  console.log(
    `✅ 壳侧原生 title= 无新增——存量实得 ${counted} 处 ＝ 账上 ${ledgerTotal} 处（扫 ${files.length} 个 tsx；` +
      `收编进度 = 账递减，见 ${BASELINE_PATH}）。`,
  );
}

main();
