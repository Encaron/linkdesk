/**
 * @linkdesk/plugin-sdk/test-audit——插件仓「测试覆盖」结构审计核心（单一真源）。
 *
 * ── 谁在用同一份 ──
 *   · 官方覆盖尺（壳仓 `scripts/audit-plugin-tests.mjs`，19 仓只读盘点、只报不拦）；
 *   · 插件仓 CI 第六段（脚手架模板 `scripts/ci-verify.mjs` ⑥，E6#155 步二起**判红**——2026-09-26 用户拍板）。
 *   ⛔ 别在任何一处复制这套判据——判据漂移 = 两把尺子打架，假红会让真红失效。
 *
 * ── 口径（与插件测试覆盖层 00-整理档案 §〇b 同源；立案 2026-09-25，本核心 2026-09-26 落地）──
 *   · 生产行 = src 下全部 .ts / .tsx / .css（任意深度）去测试文件，逐文件按行切分求和（含末行换行）。
 *   · **纯逻辑单元** = src 下任意深度的 .ts 去 .d.ts / 测试文件 / barrel（`types.ts`·`index.ts`·`constants.ts`）
 *     再减 `use*` hook / 内容含 `window.linkdesk` / 含 React 导入（.tsx 本就不在口径内）。
 *   · 覆盖命中（两条任一即算）：① 同名测试文件（基名 = 单元名 ∨ 所在目录名）；
 *     ② 任一测试文件的模块说明符引用到它（`from`/`import()`/`require()`/`vi.mock*`，含目录桶 index）。
 *   ⚠️ 已知盲区：只跟一跳——`A ← B ← 测试` 的传递覆盖看不见（首跑唯一官方命中即此类「一跳传递假红」）。
 *     ⇒ **零测报出 ≠ 判死**：消费方判红信息必须带「先核覆盖再补测」的提示，别逼作者写无意义测试。
 *
 * ── 豁免 ──
 *   纯声明式仓（无 `src/`）与零逻辑空壳（entry 头注自述「零逻辑」）⇒ `kind: "exempt"` ＋ 有据豁免理由。
 *   ⛔ 不做硬编码白名单——豁免必须长在结构事实或仓内自述上。
 */

import fs from "node:fs";
import path from "node:path";

/** barrel 三件套（无逻辑、只搬运/声明）。 */
const BARRELS = new Set(["types.ts", "index.ts", "constants.ts"]);
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "release", "resources"]);

/** 审计口径的机器可读版——报告与判红信息直接引用，别再手抄一份。 */
export const AUDIT_CALIBER = {
  prodLines: "src/**/*.{ts,tsx,css} 去 *.test.ts(x)，逐文件 split(/\\r?\\n/).length 求和（含末行换行）",
  testLines: "src/**/*.test.ts(x)",
  wideUnits: "src/**/*.ts 去 .d.ts / *.test.ts / barrel(types|index|constants)",
  logicUnits: "宽口径再减 use* hook / 含 window.linkdesk / 含 React 导入",
  hit: "① 同名测试文件（基名 = 单元名 ∨ 目录名）∨ ② 任一测试文件的模块说明符引用（含目录桶）",
  zeroTestNote: "零测 = 待裁决，不是判死——同名判据看不见跨文件覆盖，请逐条核",
};

const isTestFile = (p) => /\.(test|spec)\.tsx?$/.test(p);
/** 计行 = 含末行换行（逐文件 split 后求和）。 */
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

/**
 * 审计一只插件仓（只读，不写任何文件）。
 * @param {string} repoDir 插件仓根（含 plugin.json 与 src/）
 * @param {{ official?: boolean }} opts official=false ⇒ 第三方仓形态（kind: "third-party"，
 *   消费方应只读报出、不代改）；默认 true。仓内结构事实判出的豁免见 `exempt`。
 * @returns {{ kind: "logic"|"exempt"|"third-party", exempt: string|null, prodLines: number,
 *   testLines: number, testFiles: number, wideUnits: number, logicUnits: number,
 *   zeroTest: Array<{unit: string, evidence: string[]}>, coveredBasenameOnly: string[],
 *   coveredReferenceOnly: string[], coveredBoth: string[] }}
 */
export function analyzeRepo(repoDir, opts = {}) {
  const official = opts.official !== false;
  const srcDir = path.join(repoDir, "src");
  const srcExists = fs.existsSync(srcDir);
  const srcFiles = srcExists ? walk(srcDir, (p) => /\.(ts|tsx|css)$/.test(p)) : [];
  const testFiles = srcFiles.filter(isTestFile);
  const prodFiles = srcFiles.filter((p) => !isTestFile(p));
  const candidates = srcFiles.filter(
    (p) => p.endsWith(".ts") && !p.endsWith(".d.ts") && !isTestFile(p) && !BARRELS.has(path.basename(p)),
  );
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
    exempt = exemptReason(repoDir, srcExists, candidates.length);
  }

  return {
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
