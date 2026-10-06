/**
 * R8 · 落位禁忌句式门禁——「一次到位」（2026-10-06 用户拍板，逐字）：
 *   「当前仅有xx这一个插件，等第二个插件出现的时候再做xxx」——⛔ 禁止这种东西出现。我们必须一次到位。
 *
 * 守什么：docs ＋ 源码里出现「等第二个/第二台/第二家 …… 的时候再 …」式的**落位拖延句**——
 * 判据 A 指向哪层就**当场**做到哪层（硬约束 28 ＋ `docs/开发管理/新能力设计流程.md` §10.4）。
 * 🔴 概念（2026-10-06 用户拍板＋释疑）：本软件核心＝**万物皆可插件**，可替换角色的第二个使用者＝**必然**——
 * **未雨绸缪**＝把必然的第二作者直接设计进今天，能力完成度以「第二个作者不看第一个人的源码、
 * 只凭共享包接槽位也能做全」为准；⛔ 拖延句与已废止混淆概念（「先有消费者后搬移」「出现才抽」）一并判红。
 * 「将来条件变化」不是今天的设计理由，届时照同一条判据重新决策即可——⛔ 不写进文档当理由／当计划／当触发条件。
 * 判据正文：memory `ownership-layer-criterion-a`（禁忌节）＋ 新能力设计流程 §10.4 第三条。
 *
 * ⛔ 不拦的：**引用废止句式作否定对象**的判据正文与用户原话引文——白名单在
 * `scripts/deferred-placement-allowlist.json`（每条必须带 reason，照 `check-no-foreign-command-ids` 的白名单纪律）；
 * 新增白名单 = 判据面扩大，须能在判据正文找到同源依据。
 *
 * 负控（⛔ 不许「只改字不加尺」）：--self-test 三查——正例（用户原话句式）必须判红；
 * 干净例（含「第二阶段/第二个参数」这类非禁忌同形串）必须 0 命中；白名单必须真的放行。
 *
 * 用法：node scripts/check-no-deferred-placement.mjs             // 全量扫描（挂 npm run check）
 *       node scripts/check-no-deferred-placement.mjs --self-test // 自测
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");
const ALLOWLIST_PATH = join(ROOT, "scripts", "deferred-placement-allowlist.json");

/** 禁忌句式——「第二个/第二台/第二家/第二只 × 拖延词」同现；⛔ 故意不收「第二阶段/第二个参数/幂等阻止/等待第二个键/第二只实例退出」这类同形串（后两类无「出现/再说/再做」类动词即放行） */
export const DEFER_PATTERNS = [
  {
    re: /(等|待)[^。；\n]{0,12}(第二个|第二台|第二家|第二只)[^。；\n]{0,16}(出现|有了|进场|到来|上线|再说|再做)/,
    why: "「等/待 第二个…出现/再说/再做」",
  },
  {
    re: /(等|待)[^。；\n]{0,12}(第二个|第二台|第二家|第二只)[^。；\n]{0,12}再(做|共享|归|迁|抽|转|拆|搬|公共)/,
    why: "「等/待 第二个…再…」",
  },
  {
    re: /(第二个|第二台|第二家|第二只)[^。；\n]{0,24}(出现|有了|进场|到来|上线|再说|再做)/,
    why: "「第二个…出现/有了/再说/再做」",
  },
  {
    re: /(将来|未来|以后|下次|到时候)[^。；\n]{0,16}(第二个|第二台|第二家|第二只)/,
    why: "「将来/未来…第二个…」",
  },
  {
    re: /先有[^。；\n]{0,10}(消费者|使用者)[^。；\n]{0,10}(后|再)(搬|共享|抽|做)/,
    why: "「先有消费者后搬移」——已废止的混淆概念（2026-10-06 必然论）",
  },
  {
    re: /(出现|进场|有了)[^。；\n]{0,8}才(抽|共享|搬|泛化)/,
    why: "「出现才抽/共享/泛化」——已废止的混淆概念（2026-10-06 必然论）",
  },
];

/** 扫描域：docs 全部 md ＋ 壳/主进程/包源码 ＋ 根 md（⛔ 不含 scripts/ 自身——本文件与各门禁的内嵌样本不在域内） */
const SCAN_DIRS = ["docs", "src", "electron"];
const PKG_SRC = ["packages"];
const ROOT_FILES = ["CLAUDE.md", "AGENTS.md", "README.md", "CHANGELOG.md"];
const EXT_RE = /\.(md|ts|tsx)$/;
const SKIP_DIRS = new Set([
  "node_modules", "dist", "dist-electron", ".git", "scratch", "coverage",
  "dev-fixtures", "bundled-plugins", "build", "plugins", "tests-results",
]);

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, out);
    } else if (EXT_RE.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

function collectFiles() {
  const files = [];
  for (const d of SCAN_DIRS) files.push(...walk(join(ROOT, d), []));
  for (const d of PKG_SRC) {
    let pkgs = [];
    try {
      pkgs = readdirSync(join(ROOT, d), { withFileTypes: true }).filter((e) => e.isDirectory());
    } catch {
      /* packages 不存在则跳过 */
    }
    for (const p of pkgs) files.push(...walk(join(ROOT, d, p.name, "src"), []));
  }
  for (const f of ROOT_FILES) files.push(join(ROOT, f));
  return files;
}

/** 判定一组行——供 self-test 复用（files: [{file, lines: string[]}]）；白名单支持 file 精确 ＋ dir 前缀 */
export function judge({ files, allowlist = [] }) {
  const violations = [];
  for (const { file, lines } of files) {
    if (allowlist.some((a) => a.file === file || (a.dir && file.startsWith(a.dir)))) continue;
    lines.forEach((text, i) => {
      for (const { re, why } of DEFER_PATTERNS) {
        if (re.test(text)) {
          violations.push({ file, line: i + 1, why, text: text.trim().slice(0, 120) });
          break; // 一行记一次，避免多模式刷屏
        }
      }
    });
  }
  return violations;
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return [];
  if (!readFileSync(ALLOWLIST_PATH, "utf8").trim()) return [];
  const parsed = JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"));
  const entries = parsed.entries ?? [];
  const bad = entries.filter((e) => !e.reason || (!e.file && !e.dir));
  if (bad.length) throw new Error(`白名单条目缺 file/dir/reason：${JSON.stringify(bad)}`);
  return entries;
}

export function selfTest() {
  const positives = [
    "当前仅有xx这一个插件，等第二个插件出现的时候再做xxx", // 用户原话（2026-10-06）
    "先放在这里，未来第二个有了再公共",
    "现在只有 file-tree 一个消费者，等第二个消费者出现再共享",
    "第二台设置插件出现的时候再做适配",
    "警告配方 v1 editor 自绘，第二只真实编辑器插件出现才抽共享件", // 已废止概念的原话（2026-10-06 必然论收编）
    "Slider/ReadOnlyText 同律：先有真实消费者后搬移", // 同上
  ];
  const negatives = [
    "等第二阶段排期确定后再启动", // 第二阶段 ≠ 第二个/台/家
    "第二个参数为可选的 anchor（缺省居中）",
    "卸载插件时再清理注册表——常规清理语义，非落位拖延",
    "未来版本将移除该兼容转发",
    "「换一套设置插件不再丢控件」",
    "已有则不创建——幂等阻止第二个 WebView", // 「幂等」尾字 同形，无出现类动词 ⇒ 放行
    "显示和弦键（如 Ctrl+K 等待第二个键）", // 键盘 chord 语义 ⇒ 放行
  ];
  const allowlist = [{ file: "canonical.md", reason: "正典档引用废止句式作否定对象" }];
  const cases = [
    { file: "sample-bad.md", lines: positives },
    { file: "sample-clean.md", lines: negatives },
    { file: "canonical.md", lines: positives }, // 白名单必须整档放行
  ];
  const hits = judge({ files: cases, allowlist });
  const fail = [];
  if (hits.some((h) => h.file !== "sample-bad.md")) fail.push(`正例漏判或误伤他档：${JSON.stringify(hits)}`);
  if (hits.length !== positives.length) fail.push(`正例 ${positives.length} 条只判中 ${hits.length} 条：${JSON.stringify(hits)}`);
  if (!hits.length) fail.push("零命中——门禁抓不住已知句式（能抓住才算门禁）");
  // 白名单档必须 0 命中
  if (hits.some((h) => h.file === "canonical.md")) fail.push("白名单未生效");
  // 负例必须 0 命中（judge 不会产出 clean 档的行，除非误报——直接单独判一次）
  const cleanHits = judge({ files: [{ file: "sample-clean.md", lines: negatives }], allowlist: [] });
  if (cleanHits.length) fail.push(`干净例误伤：${JSON.stringify(cleanHits)}`);
  // 白名单必须命中扫描域内的真实路径（file 精确 / dir 前缀）——防悬空白名单
  const list = loadAllowlist();
  const realPaths = collectFiles().map((f) => relative(ROOT, f).split(sep).join("/"));
  for (const e of list) {
    const hit = realPaths.some((p) => (e.file ? p === e.file : p.startsWith(e.dir)));
    if (!hit) fail.push(`白名单指向扫描域内不存在的文件/目录：${e.file ?? e.dir}`);
  }
  return { ok: fail.length === 0, fail };
}

function main() {
  if (process.argv.includes("--self-test")) {
    const { ok, fail } = selfTest();
    if (!ok) {
      console.error("R8 自测失败：\n" + fail.map((f) => `  - ${f}`).join("\n"));
      process.exit(1);
    }
    console.log("R8 self-test：正例判红 / 干净例放行 / 白名单生效 —— 全过");
    return;
  }
  const allowlist = loadAllowlist();
  const files = collectFiles();
  const payload = files.map((f) => ({
    file: relative(ROOT, f).split(sep).join("/"),
    lines: readFileSync(f, "utf8").split(/\r?\n/),
  }));
  const hits = judge({ files: payload, allowlist });
  if (hits.length) {
    console.error(`R8 · 落位禁忌句式命中 ${hits.length} 行（判据：一次到位，2026-10-06 用户拍板——「等第二个…的时候再做」⛔）：`);
    for (const h of hits) console.error(`  ${h.file}:${h.line}  [${h.why}]  ${h.text}`);
    console.error("  判据指向哪层就当场做到哪层；「将来条件变化」届时照判据重新决策即可，⛔ 不写进文档当理由。");
    console.error("  ⛔ 白名单（scripts/deferred-placement-allowlist.json）只收「引用废止句式作否定对象」的正典档，必须带 reason。");
    process.exit(1);
  }
  console.log(`R8 · 落位禁忌句式：0 命中（扫 ${files.length} 文件；白名单 ${allowlist.length} 档）`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
