#!/usr/bin/env node
/**
 * 官方插件仓「测试覆盖」审计尺（只报不拦）——E6#153（L11 插件测试覆盖层第五棒）。
 *
 * ── 它守的是哪句话 ──
 *   本层立案的第二件真缺口：**没有判据、也没有尺子**（插件仓 `ci-verify.mjs` 五段全是结构/声明、
 *   没有一段问「测试」；壳仓几十把 `check-*.mjs` 里没有一把量插件测试的）。会话二/三/四把 5 只官方仓的
 *   纯逻辑与替身层补齐之后，若不立尺，**下一条新插件、下一次改动**照样没人问这个问题——门会自己再关上。
 *
 * ── 口径（与 00-整理档案 §〇b 逐字同源；立案 2026-09-25，本尺 2026-09-26 落地）──
 *   · 生产行 = `src` 下全部 `.ts` `.tsx` `.css`（任意深度）去掉 `*.test.ts(x)`，逐文件 `split(/\r?\n/).length`
 *     求和（= 含末行换行，与立案读数同法——实测 editor 2,800 / settings 3,375 逐字复现）。
 *   · 测试行 = `src` 下全部 `*.test.ts(x)`（任意深度）；测试文件数单列。
 *   · **宽口径单元** = `src` 下全部 `.ts` 去 `.d.ts` / `*.test.ts` / barrel（`types.ts`·`index.ts`·`constants.ts`）。
 *     ⇒ 立案 §〇b 那一列的「47/44/31/22/44」用的就是这把（实测五仓逐字复现）。
 *   · **纯逻辑单元（严口径，本表主列）** = 宽口径再减：`use*` 开头的 hook / 内容含 `window.linkdesk` /
 *     含 React 导入的文件（`.tsx` 本就不在 `*.ts` 口径内）。
 *     🔴 **两把尺子不可混用**：立案那句「44 个纯逻辑单元里 15 个零测试」是「宽 44 ＋ 严 15」拼出来的
 *     （file-tree 严口径只有 18、marketplace 严口径实测 16）——本表把两列并排印出来就是为了让这件事一眼可见。
 *   · 覆盖命中（两条任一即算）：
 *     ① `basename` —— 存在同名测试文件：测试文件基名 = 单元基名 ∨ 单元所在目录名
 *        （照 file-tree `FileTreeModel/*` 由 `FileTreeModel.test.ts` 覆盖这条实测反例）；
 *     ② `reference` —— 任一测试文件的模块说明符引用了它：`from` / `import()` / `require()` / `vi.mock()`
 *        的字符串等于单元路径 ∨ 以其结尾；单元所在目录有 `index.ts(x)` 时，目录桶路径也算
 *        （照 marketplace「桶遮蔽」实测反例：经 barrel 命中的实现按文件名 grep 看不见）。
 *   🔴 **两条都要实现**——只做 ① 就是立案读数里那批假红（file-tree 27% / marketplace 47%）；
 *     只做 ② 会漏掉「有同名测试但测试没直接 import」的形态。
 *
 *   ⚠️ **已知盲区（首跑实测，2026-09-26）**：本尺只跟**一跳**——`A` 被**已测**的 `B` import
 *     （`A ← B ← 测试`）不判命中（传递覆盖看不见）。首跑全表唯一一只官方命中项 file-tree
 *     `components/CompactFolder.ts` 经逐条裁决即此类（`CompactController.test.ts` 经 `isCompacted` /
 *     `getCompactedSegments` 覆到它 6 条分支里的 5 条）⇒ **报出 ≠ 判死**，这正是报告尾那句提示的用途。
 *
 * ── 定位 ──
 *   审计族：需要插件容器在场、**只读**（第三方仓只读报出、一字不写）、**不进 `npm run check`**、
 *   退出码恒 0（同 audit-plugin-dead-css / audit-plugin-scope）。⛔ 不引覆盖率百分比、不设阈值、不判红黄灯
 *   ——「要不要升格成『拦』」是待拍板题（层内 06 号档 ①）。
 *   ⛔ 本脚本不进 `check-gate-health.mjs` 自测域（那域的判据是文件名 `check-*.mjs`）⇒ 无需 `--self-test`。
 *
 * ── 官方仓名单来源 ──
 *   现场读 `scripts/sync-plugin-agents.mjs` 的 FACTS 表（那 = **官方仓名单唯一真相源**，会话一刚同步过
 *   AGENTS.md）。不在表里的仓 = 第三方作者仓（如 `geme-tihu-bicycle`）⇒ 单列、只读报出、⛔ 不代改。
 *
 * 用法：node scripts/audit-plugin-tests.mjs [容器目录] [--json]
 *       （或 npm run audit:plugin-tests；默认容器 E:/linkdesk-plugins，两级内 <组>/<仓>/plugin.json）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_SCRIPT = path.join(ROOT, "scripts", "sync-plugin-agents.mjs");
const CONTAINER = process.argv.slice(2).find((a) => !a.startsWith("--")) || process.env.LINKDESK_PLUGIN_CONTAINER || "E:/linkdesk-plugins";
const JSON_OUT = process.argv.includes("--json");

/** barrel 三件套（无逻辑、只搬运/声明）——与 §〇b 口径逐字同源。 */
const BARRELS = new Set(["types.ts", "index.ts", "constants.ts"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "release", "resources"]);

const isTestFile = (p) => /\.(test|spec)\.tsx?$/.test(p);
/** 计行 = 含末行换行（逐文件 split 后求和）——与立案读数同法。 */
const countLines = (p) => fs.readFileSync(p, "utf8").split(/\r?\n/).length;
const read = (p) => fs.readFileSync(p, "utf8");

function walk(dir, filter, out = []) {
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of ents) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, filter, out);
    else if (filter(p)) out.push(p);
  }
  return out;
}

/** 官方仓名单 = sync-plugin-agents.mjs 的 FACTS 表（唯一真相源）；读不到 ⇒ null（降级：全部按官方报，并打一行警告）。 */
function officialIds() {
  try {
    const text = read(AGENTS_SCRIPT);
    const start = text.indexOf("const FACTS = {");
    const end = text.indexOf("\n};", start);
    if (start < 0 || end < 0) return null;
    const ids = [...text.slice(start, end).matchAll(/^ {2}(?:"([^"]+)"|([A-Za-z][\w-]*)): \{/gm)].map((m) => m[1] || m[2]);
    return ids.length ? new Set(ids) : null;
  } catch {
    return null;
  }
}

/** 容器两级内找 <组>/<仓>/plugin.json（也接受容器本身就是一只仓）。 */
function discoverRepos(root) {
  const isRepo = (d) => {
    try {
      return fs.statSync(path.join(d, "plugin.json")).isFile();
    } catch {
      return false;
    }
  };
  if (isRepo(root)) return [{ dir: root, id: path.basename(root), group: "" }];
  const out = [];
  let groups = [];
  try {
    groups = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const g of groups) {
    if (!g.isDirectory() || SKIP_DIRS.has(g.name)) continue;
    const gp = path.join(root, g.name);
    if (isRepo(gp)) {
      out.push({ dir: gp, id: g.name, group: "" });
      continue;
    }
    let kids = [];
    try {
      kids = fs.readdirSync(gp, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const k of kids) {
      if (!k.isDirectory() || SKIP_DIRS.has(k.name)) continue;
      const kp = path.join(gp, k.name);
      if (isRepo(kp)) out.push({ dir: kp, id: k.name, group: g.name });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** 严口径：`.ts` 单元再减 `use*` hook / 含 `window.linkdesk` / 含 React 导入。 */
function isPureLogic(file) {
  if (/^use/.test(path.basename(file))) return false;
  const text = read(file);
  if (text.includes("window.linkdesk")) return false;
  if (/\bfrom\s+["']react["']/.test(text)) return false;
  if (/\brequire\(\s*["']react["']\s*\)/.test(text)) return false;
  if (/\bimport\s+React\b/.test(text)) return false;
  return true;
}

/** 测试文件里出现的模块说明符（from / import() / require() / vi.mock 的字符串）。 */
function specifiersOf(text) {
  const out = [];
  const re = /(?:from|import|require|vi\.mock|vi\.doMock|vi\.importActual|vi\.importMock)\s*\(?\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

/** 一个单元「被引用」的全部可能写法：路径 ∨ 基名 ∨ 目录桶（含 index）。 */
function unitSpecifiers(unitPath, srcDir) {
  const rel = path.relative(srcDir, unitPath).split(path.sep).join("/").replace(/\.ts$/, "");
  const base = path.posix.basename(rel);
  const dirRel = path.posix.dirname(rel);
  const specs = new Set([rel, base, `${rel}.ts`, `${base}.ts`, `${base}.js`]);
  const dirAbs = path.dirname(unitPath);
  if (fs.existsSync(path.join(dirAbs, "index.ts")) || fs.existsSync(path.join(dirAbs, "index.tsx"))) {
    specs.add(dirRel);
    specs.add(`${dirRel}/index`);
  }
  return { rel, specs: [...specs] };
}

/** 声明式 / 零逻辑仓的**有据豁免**：先看结构事实，再看 entry 头注自述（⛔ 不硬编码白名单）。 */
function exemptReason(repoDir, srcExists, wideCount) {
  if (!srcExists) return "不适用（纯声明式：无 `src/`，无可测单元；门禁 = `ci-verify.mjs` 的结构与声明判据）";
  if (wideCount === 0) {
    for (const entry of ["src/index.tsx", "src/index.ts"]) {
      const p = path.join(repoDir, entry);
      if (!fs.existsSync(p)) continue;
      const quote = read(p)
        .split(/\r?\n/)
        .slice(0, 40)
        .find((l) => l.includes("零逻辑"));
      if (quote) return `不适用（零逻辑空壳 entry——${entry} 头注自述「${quote.replace(/^[\s*/]+/, "").trim()}」）`;
    }
    return "不适用（零逻辑空壳 entry：`src/` 下无非 barrel `.ts` 单元）";
  }
  return null;
}

function analyze(repo, official) {
  const srcDir = path.join(repo.dir, "src");
  const srcExists = fs.existsSync(srcDir);
  const srcFiles = srcExists ? walk(srcDir, (p) => /\.(ts|tsx|css)$/.test(p)) : [];
  const testFiles = srcFiles.filter(isTestFile);
  const prodFiles = srcFiles.filter((p) => !isTestFile(p));
  const candidates = srcFiles.filter((p) => p.endsWith(".ts") && !p.endsWith(".d.ts") && !isTestFile(p) && !BARRELS.has(path.basename(p)));
  const units = candidates.filter(isPureLogic);

  const prodLines = prodFiles.reduce((a, p) => a + countLines(p), 0);
  const testLines = testFiles.reduce((a, p) => a + countLines(p), 0);
  const testBaseNames = new Set(testFiles.map((p) => path.basename(p).replace(/\.(test|spec)\.tsx?$/, "")));
  const testSpecs = testFiles.map((p) => specifiersOf(read(p)));

  const judged = units.map((p) => {
    const base = path.basename(p, ".ts");
    const parent = path.basename(path.dirname(p));
    const hitBasename = testBaseNames.has(base) || testBaseNames.has(parent);
    const { rel, specs } = unitSpecifiers(p, srcDir);
    const hitReference = testSpecs.some((list) => list.some((s) => specs.some((c) => s === c || s.endsWith(`/${c}`))));
    return { unit: rel, hitBasename, hitReference, covered: hitBasename || hitReference };
  });
  const zeroTest = judged.filter((j) => !j.covered);

  let kind = "logic";
  let exempt = null;
  if (!official) kind = "third-party";
  else if (!srcExists || candidates.length === 0) {
    kind = "exempt";
    exempt = exemptReason(repo.dir, srcExists, candidates.length);
  }

  return {
    id: repo.id,
    group: repo.group,
    kind,
    exempt,
    prodLines,
    testLines,
    testFiles: testFiles.length,
    wideUnits: candidates.length,
    logicUnits: units.length,
    zeroTest: zeroTest.map((j) => ({ unit: j.unit, evidence: ["basename-miss", "reference-miss"] })),
    coveredBasenameOnly: judged.filter((j) => j.hitBasename && !j.hitReference).map((j) => j.unit),
    coveredReferenceOnly: judged.filter((j) => !j.hitBasename && j.hitReference).map((j) => j.unit),
    coveredBoth: judged.filter((j) => j.hitBasename && j.hitReference).map((j) => j.unit),
  };
}

/* ─────────────────────────── 主流程 ─────────────────────────── */

const ids = officialIds();
const repos = discoverRepos(CONTAINER);
const rows = repos.map((r) => analyze(r, ids ? ids.has(r.id) : true));
const officialRows = rows.filter((r) => r.kind !== "third-party");
const logicRows = officialRows.filter((r) => r.kind === "logic");
const exemptRows = officialRows.filter((r) => r.kind === "exempt");
const thirdPartyRows = rows.filter((r) => r.kind === "third-party");

const payload = {
  container: CONTAINER,
  officialListSource: ids ? "scripts/sync-plugin-agents.mjs FACTS 表" : null,
  officialListWarning: ids ? null : "官方仓名单读取失败（按全部官方报）",
  caliber: {
    prodLines: "src/**/*.{ts,tsx,css} 去 *.test.ts(x)，逐文件 split(/\\r?\\n/).length 求和（含末行换行）",
    testLines: "src/**/*.test.ts(x)",
    wideUnits: "src/**/*.ts 去 .d.ts / *.test.ts / barrel(types|index|constants)",
    logicUnits: "宽口径再减 use* hook / 含 window.linkdesk / 含 React 导入",
    hit: "① 同名测试文件（基名 = 单元名 ∨ 目录名）∨ ② 任一测试文件的模块说明符引用（含目录桶）",
    zeroTestNote: "零测 = 待裁决，不是判死——同名判据看不见跨文件覆盖，请逐条核",
  },
  repos: rows,
  summary: {
    repos: rows.length,
    official: officialRows.length,
    thirdParty: thirdPartyRows.length,
    logic: logicRows.length,
    exempt: exemptRows.length,
    prodLines: rows.reduce((a, r) => a + r.prodLines, 0),
    testLines: rows.reduce((a, r) => a + r.testLines, 0),
    testFiles: rows.reduce((a, r) => a + r.testFiles, 0),
    logicUnits: logicRows.reduce((a, r) => a + r.logicUnits, 0),
    zeroTest: logicRows.reduce((a, r) => a + r.zeroTest.length, 0),
  },
};

if (JSON_OUT) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const pad = (s, w) => {
  const str = String(s);
  const d = displayWidth(str);
  return d >= w ? str : str + " ".repeat(w - d);
};
const num = (n, w) => pad(String(n), w);
/** 显示宽度（CJK 全角算 2）——表里混着中文列名与「（第三方·只读）」后缀，不按宽度补就错位。 */
function displayWidth(s) {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    w += c >= 0x1100 && (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6)) ? 2 : 1;
  }
  return w;
}

console.log(`[plugin-tests] 容器 ${CONTAINER} · ${rows.length} 仓（官方 ${officialRows.length}${ids ? "" : "（名单读取失败，降级）"} · 第三方 ${thirdPartyRows.length}）`);
console.log(`[plugin-tests] 官方名单源：${ids ? "scripts/sync-plugin-agents.mjs FACTS 表" : "—（读取失败）"}`);
console.log(`[plugin-tests] 口径：生产行 = src/**/*.{ts,tsx,css} 去测试（含末行换行）· 纯逻辑单元 = 严口径（去 .d.ts/测试/barrel/use*/window.linkdesk/React）`);
console.log(`[plugin-tests]　　　命中 = ① 同名测试文件（基名 = 单元名 ∨ 目录名）∨ ② 任一测试文件的说明符引用（含目录桶）——两条任一即算\n`);

console.log(`${pad("仓", 30)}${pad("生产行", 8)}${pad("测试行", 8)}${pad("夹具", 6)}${pad("宽口径", 8)}${pad("纯逻辑", 8)}${pad("零测", 6)}零测名单`);
console.log("-".repeat(118));
for (const r of rows) {
  const tag = r.kind === "third-party" ? `${r.id}（第三方·只读）` : r.id;
  if (r.kind === "exempt") {
    console.log(`${pad(tag, 30)}${num(r.prodLines, 8)}${num(r.testLines, 8)}${num(r.testFiles, 6)}${num(r.wideUnits, 8)}${pad("—", 8)}${pad("不适用", 6)} ${r.exempt}`);
    continue;
  }
  const names = r.zeroTest.map((z) => z.unit).slice(0, 6);
  const more = r.zeroTest.length > names.length ? ` …另 ${r.zeroTest.length - names.length} 个` : "";
  console.log(
    `${pad(tag, 30)}${num(r.prodLines, 8)}${num(r.testLines, 8)}${num(r.testFiles, 6)}${num(r.wideUnits, 8)}${num(r.logicUnits, 8)}${num(r.zeroTest.length, 6)} ${names.join(" · ") || "—"}${more}`,
  );
}
console.log("-".repeat(118));

const s = payload.summary;
console.log(
  `\n[plugin-tests] 合计：${rows.length} 仓 · 生产 ${s.prodLines.toLocaleString("en-US")} 行 / 测试 ${s.testLines.toLocaleString("en-US")} 行（${s.testFiles} 文件）`,
);
console.log(`[plugin-tests] 官方逻辑仓 ${logicRows.length} 只 · 纯逻辑单元（严口径）${s.logicUnits} · **零测 ${s.zeroTest}** · 声明式/零逻辑豁免 ${exemptRows.length} 只`);
if (thirdPartyRows.length) {
  const tp = thirdPartyRows.map((r) => `${r.id}（纯逻辑 ${r.logicUnits} · 零测 ${r.zeroTest.length}）`).join(" · ");
  console.log(`[plugin-tests] 第三方仓（只读报出，⛔ 不代改）：${tp}`);
}

const baseOnly = logicRows.reduce((a, r) => a + r.coveredBasenameOnly.length, 0);
const refOnly = logicRows.reduce((a, r) => a + r.coveredReferenceOnly.length, 0);
const both = logicRows.reduce((a, r) => a + r.coveredBoth.length, 0);
console.log(`[plugin-tests] 命名判据命中分布：同名 only ${baseOnly} · 引用 only ${refOnly} · 两者都中 ${both}`);
if (refOnly) {
  const samples = logicRows.flatMap((r) => r.coveredReferenceOnly.map((u) => `${r.id}/${u}`)).slice(0, 8);
  console.log(`[plugin-tests]　↳「引用 only」这批就是**只做同名判据会假红**的部分（含目录桶命中），前 ${samples.length} 例：`);
  for (const x of samples) console.log(`[plugin-tests]　　 · ${x}`);
}

if (s.zeroTest || thirdPartyRows.some((r) => r.zeroTest.length)) {
  console.log(`\n[plugin-tests] 零测名单（逐条待裁决，判据 = basename-miss + reference-miss）：`);
  for (const r of rows) {
    if (r.kind === "exempt") continue;
    const tag = r.kind === "third-party" ? `${r.id}（第三方·只读，⛔ 不代改）` : r.id;
    for (const z of r.zeroTest) console.log(`[plugin-tests]   · ${tag}/${z.unit}（${z.evidence.join("+")}）`);
  }
  if (s.zeroTest === 0) console.log(`[plugin-tests]   （官方逻辑仓 ${logicRows.length} 只零测 0——本层验收判据「纯逻辑零测试 = 0」达成）`);
}

console.log(`\n[plugin-tests] ⚠️ 零测 = 待裁决，不是判死——同名判据看不见跨文件覆盖，请逐条核（本层两次实测：file-tree 27%、marketplace 47% 的立案读数是假红）。`);
console.log(`[plugin-tests] 只报不拦（exit 0）——不进 npm run check / CI / ci-verify.mjs；要不要升格为「拦」是待拍板题（插件测试覆盖层/06-待拍板方向题.md ①）。`);
process.exitCode = 0;
