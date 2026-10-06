#!/usr/bin/env node
/**
 * check-settings-hint-canon.mjs —— 设置控件词表正典的两条轻门禁（阶段 4.4）。
 *
 * 案情见 docs/04-软件更新/已落地/设置控件-词表正典与共享化/：
 *   · 01 §0.3 门禁：「改正典 hint 名单而不动作者面 description 时 npm run check 要红」
 *   · 01 §0.2 正典表 13 条 ＋ 02 E4d（renderHint 是 3 值）
 *   · 02 E4 哨兵字面量收敛门禁
 *
 * ① 正典 ↔ 作者面 description 双向对账
 *    正典 = src/components/shared/settings-hints/settingsHints.ts 的
 *      SETTINGS_UI_HINTS（13）／ SETTINGS_RENDER_HINTS（3）—— **现读源码**，⛔ 不手抄第二份名单。
 *    作者面 = 四份 plugin.schema.json 拷贝里 uiHint／renderHint 的「Known hints: …」锚点清单。
 *      （四份拷贝本身等值由 check-plugin-schema-sync 守；本门禁只管「名单 ↔ description」）
 *    任一方向不同 ⇒ 红：漏值（正典有、description 没写）与多值（description 写了、正典没有）都报。
 *
 * ② 哨兵字面量门禁（02 E4）：`"__none__"` 不许在 src/ 里再被复制一份。
 *    豁免：正典定义件本体（它就是定义处）＋ *.test.ts(x)（测试有意固定契约线值）。
 *    注释不判（先剥注释再搜）——文档/说明里提这个词是正常的。
 *
 * ③ 隐藏位名单 ⊆ uiHint 正典（C2b「挂载键不画行」的名单，2026-10-06 加）。
 *    `SETTINGS_HIDDEN_HINTS` 里的值若不在 `SETTINGS_UI_HINTS` 里，那条判定**永远为假**
 *    ——挂载键就藏不住了，而症状是「多出一行只读垃圾」这种没人会当成 bug 的形态。
 *    ⚠️ 只判「子集」一个方向：uiHint 里绝大多数值**本来就该画行**，⛔ 不要求反向相等。
 *
 * 用法：node scripts/check-settings-hint-canon.mjs
 *       node scripts/check-settings-hint-canon.mjs --self-test
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const CANON_FILE = "src/components/shared/settings-hints/settingsHints.ts";
const SCHEMA_COPIES = [
  "public/schemas/plugin.schema.json",
  "docs/03-插件制造/plugin.schema.json",
  "packages/plugin-sdk/schemas/plugin.schema.json",
  "packages/plugin-docs/docs/zh/plugin.schema.json",
];
/** ② 的扫描根与豁免 */
const SCAN_ROOT = "src";
const SENTINEL_LITERAL = "__none__";

/* ────────────────────────── ① 正典 ↔ description ────────────────────────── */

/**
 * 从正典源码里现读某个 `export const X: readonly T[] = [...]` 的字面量项（⛔ 不手抄第二份名单）。
 * 🔴 两处讲究（② 是踩过的坑）：
 *   ① **锚 `export const` ＋ `\b`**——防同前缀名互相命中。
 *   ② **先剥注释**：正典文件里别的名单会在注释里被引用（`…见 SETTINGS_HIDDEN_HINTS`），
 *      不剥注释时 `[^=]*` 会从那条提及一路吃到**下一个名单的 `= [`**，静默读出**别家那份名单**
 *      （本门禁 v1 就这样把 `SETTINGS_UI_HINTS` 的 14 枚当成隐藏位名单读了出来，还印进成功行）。
 *      E4「注释/文档不判」在这里同样适用。
 */
export function readCanonNames(src, constName) {
  const code = stripComments(src);
  const m = code.match(new RegExp(`export const ${constName}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

/** 递归收 schema 里 uiHint／renderHint 的 description */
export function collectHintDescriptions(node, out = {}) {
  if (!node || typeof node !== "object") return out;
  for (const [k, v] of Object.entries(node)) {
    if (
      (k === "uiHint" || k === "renderHint") &&
      v &&
      typeof v === "object" &&
      typeof v.description === "string"
    ) {
      out[k] = v.description;
    }
    collectHintDescriptions(v, out);
  }
  return out;
}

/** 取 description 里「Known hints: a, b, c.」的清单（锚点＝本门禁与 description 的契约） */
export function listedHints(description) {
  const m = /Known hints: ([^.]+)\./.exec(description ?? "");
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 双向集合差——返回 { missing, extra }；空对象＝对账通过 */
export function diffNames(canon, listed) {
  const c = new Set(canon ?? []);
  const l = new Set(listed ?? []);
  return {
    missing: [...c].filter((x) => !l.has(x)),
    extra: [...l].filter((x) => !c.has(x)),
  };
}

/** 子集检查（③ 隐藏位 ⊆ uiHint 正典）——返回「不在超集里的项」；空数组＝通过 */
export function subsetDiff(sub, sup) {
  const s = new Set(sup ?? []);
  return (sub ?? []).filter((x) => !s.has(x));
}

/* ────────────────────────── ② 哨兵字面量 ────────────────────────── */

/** 剥注释（块注释 + 行注释）——E4「注释/文档不判」；块注释按等量空白替换，行号不漂 */
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, "");
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** 找 src/ 里残留的哨兵字面量（返回 "相对路径:行号" 列表） */
export function findSentinelLiterals(root, literal = SENTINEL_LITERAL) {
  const hits = [];
  for (const abs of walk(join(root, SCAN_ROOT))) {
    const rel = relative(root, abs).split("\\").join("/");
    if (rel === CANON_FILE) continue; // 正典定义件本体＝豁免
    if (/\.test\.tsx?$/.test(rel)) continue; // 测试固定契约线值＝豁免
    const code = stripComments(readFileSync(abs, "utf8"));
    if (code.includes(`"${literal}"`) || code.includes(`'${literal}'`)) {
      const line = code.split("\n").findIndex((s) => s.includes(literal)) + 1;
      hits.push(`${rel}:${line}`);
    }
  }
  return hits;
}

/* ────────────────────────── 跑门禁 ────────────────────────── */

function run() {
  const problems = [];
  let hiddenCount = null;

  // ① 正典 ↔ description
  const canonSrc = readFileSync(join(ROOT, CANON_FILE), "utf8");
  const uiCanon = readCanonNames(canonSrc, "SETTINGS_UI_HINTS");
  const renderCanon = readCanonNames(canonSrc, "SETTINGS_RENDER_HINTS");
  if (!uiCanon || !renderCanon) {
    problems.push(`🔴 正典名单读不出来（${CANON_FILE} 的 SETTINGS_UI_HINTS／SETTINGS_RENDER_HINTS 形态变了？）`);
  } else {
    for (const rel of SCHEMA_COPIES) {
      let descriptions;
      try {
        descriptions = collectHintDescriptions(JSON.parse(readFileSync(join(ROOT, rel), "utf8")));
      } catch (e) {
        problems.push(`🔴 ${rel} 读/解析失败：${e.message}`);
        continue;
      }
      const pairs = [
        ["uiHint", uiCanon],
        ["renderHint", renderCanon],
      ];
      for (const [key, canon] of pairs) {
        const listed = listedHints(descriptions[key]);
        if (!listed) {
          problems.push(`🔴 ${rel} 的 ${key}.description 里找不到「Known hints: …」锚点清单`);
          continue;
        }
        const { missing, extra } = diffNames(canon, listed);
        if (missing.length) {
          problems.push(`🔴 ${rel} 的 ${key}：正典有、description 没写 ⇒ ${missing.join(", ")}`);
        }
        if (extra.length) {
          problems.push(`🔴 ${rel} 的 ${key}：description 写了、正典没有 ⇒ ${extra.join(", ")}`);
        }
      }
    }
  }

  // ② 哨兵字面量
  const hits = findSentinelLiterals(ROOT);
  if (hits.length) {
    problems.push(
      `🔴 \`"${SENTINEL_LITERAL}"\` 字面量在 src/ 里被复制了（应 import 正典；豁免只有 ${CANON_FILE} 与 *.test.ts(x)）：\n    ` +
        hits.join("\n    "),
    );
  }

  // ③ 隐藏位名单 ⊆ uiHint 正典（C2b「挂载键不画行」的名单）
  if (uiCanon) {
    const hiddenCanon = readCanonNames(canonSrc, "SETTINGS_HIDDEN_HINTS");
    if (!hiddenCanon) {
      problems.push(`🔴 读不出 SETTINGS_HIDDEN_HINTS（${CANON_FILE}）——隐藏位名单是 C2b 的判定源，⛔ 不许缺`);
    } else {
      hiddenCount = hiddenCanon.length;
      const stray = subsetDiff(hiddenCanon, uiCanon);
      if (stray.length) {
        problems.push(
          `🔴 隐藏位名单里有 uiHint 正典不认识的值 ⇒ 该判定**永远为假**（藏不住那行）：${stray.join(", ")}`,
        );
      }
    }
  }

  if (problems.length) {
    console.error("\n" + problems.join("\n") + "\n");
    console.error("   修法：① 名单与 description 互相对齐（description 锚点＝「Known hints: a, b, c.」）");
    console.error("        ② 用 `import { CONFIG_NONE_SENTINEL } from \"@linkdesk/ui\"`（或壳内正典件）取值");
    console.error("  说明：见 docs/04-软件更新/已落地/设置控件-词表正典与共享化/02-边缘情况清单.md E3/E4\n");
    return 1;
  }
  console.log(
    `✅ check-settings-hint-canon：正典 ${uiCanon?.length ?? "?"} 枚 uiHint／${renderCanon?.length ?? "?"} 枚 renderHint ↔ ` +
      `${SCHEMA_COPIES.length} 份 schema description 对账一致；隐藏位名单 ${hiddenCount ?? "?"} 枚 ⊆ uiHint 正典；` +
      `src/ 无残留 \`${SENTINEL_LITERAL}\` 字面量。`,
  );
  return 0;
}

/* ────────────────────────── self-test（尺子不是在恒绿） ────────────────────────── */

function selfTest() {
  const cases = [];
  const push = (name, ok) => cases.push({ name, ok });

  // ① diffNames 双向
  push("diffNames 全等 → 无差", JSON.stringify(diffNames(["a", "b"], ["b", "a"])) === '{"missing":[],"extra":[]}');
  push("diffNames 漏值 → missing", diffNames(["a", "b", "c"], ["a", "b"]).missing.join(",") === "c");
  push("diffNames 多值 → extra", diffNames(["a"], ["a", "d"]).extra.join(",") === "d");
  // ① listedHints 锚点
  push("listedHints 取锚点清单", JSON.stringify(listedHints("x. Known hints: a, b, c. y.")) === '["a","b","c"]');
  push("listedHints 无锚点 → null", listedHints("no anchor here") === null);
  // ① readCanonNames 现读源码
  push(
    "readCanonNames 读源码数组",
    JSON.stringify(readCanonNames('export const SETTINGS_RENDER_HINTS: readonly X[] = ["a", "b"];', "SETTINGS_RENDER_HINTS")) ===
      '["a","b"]',
  );
  push(
    "readCanonNames 同前缀名不互串（export const ＋ \\b 锚）",
    JSON.stringify(
      readCanonNames(
        'export const SETTINGS_RENDER_HINTS_EXTRA: readonly X[] = ["zz"];\nexport const SETTINGS_RENDER_HINTS: readonly X[] = ["a"];',
        "SETTINGS_RENDER_HINTS",
      ),
    ) === '["a"]',
  );
  // ② 哨兵字面量
  push("stripComments 剥行注释", !stripComments('const a = 1; // "__none__"').includes("__none__"));
  push("stripComments 剥块注释", !stripComments('/* "__none__" */ const a = 1;').includes("__none__"));
  push("stripComments 保留代码", stripComments('const a = "__none__";').includes("__none__"));
  // ③ 隐藏位 ⊆ uiHint 正典
  push("subsetDiff 子集 → 空", subsetDiff(["a"], ["a", "b"]).length === 0);
  push("subsetDiff 空子集 → 空", subsetDiff([], ["a"]).length === 0);
  push("subsetDiff 漏登记正典 → 报出那项", subsetDiff(["a", "zz"], ["a"]).join(",") === "zz");
  push(
    "subsetDiff 不判反方向（uiHint 多出来的值不算错）",
    subsetDiff(["a"], ["a", "b", "c"]).length === 0,
  );
  push(
    "readCanonNames 能读隐藏位名单",
    JSON.stringify(readCanonNames('export const SETTINGS_HIDDEN_HINTS: readonly X[] = ["fileAssociationsManager"];', "SETTINGS_HIDDEN_HINTS")) ===
      '["fileAssociationsManager"]',
  );
  push(
    "readCanonNames 不误抓注释里的提及（真形状：提及 → 别家名单 → 自家声明）",
    JSON.stringify(
      readCanonNames(
        "/** 隐藏位语义见 SETTINGS_HIDDEN_HINTS 那条说明 */\n" +
          'export const SETTINGS_UI_HINTS: readonly X[] = ["p", "q", "r"];\n' +
          'export const SETTINGS_HIDDEN_HINTS: readonly X[] = ["h"];',
        "SETTINGS_HIDDEN_HINTS",
      ),
    ) === '["h"]',
  );

  // 真机对照（跑一次真的，正控必须绿）
  const real = run();
  push("真机正控（当前仓＝绿）", real === 0);

  const bad = cases.filter((c) => !c.ok);
  console.log();
  for (const c of cases) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}`);
  console.log(
    bad.length
      ? `\n🔴 check-settings-hint-canon self-test ${bad.length} 例不符。\n`
      : `\n✅ check-settings-hint-canon self-test 全过（${cases.length} 例——含真机正控，尺子不是在恒绿）。\n`,
  );
  return bad.length ? 1 : 0;
}

process.exit(process.argv.includes("--self-test") ? selfTest() : run());
