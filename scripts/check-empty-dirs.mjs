/**
 * 机械检查：**空目录扫描**（E6#95a · L3.7 门禁 G1 · 红灯）。
 *
 * 为什么必须机械扫（06 §1.1）：**`git status` 看不见空目录**（Git 不记录目录），
 * 所以「提交前看一眼 git status」这个习惯**结构性地防不住**这一类垃圾。
 * 实证（04 §〇）：探针在 `plugins/settings/src/` 下造了个空目录，用完只删脚本没删目录 ⇒
 * 工作区报 clean，垃圾躺到用户肉眼发现。
 *
 * 三档定位（06 §1.2 自审）：**红灯**——空目录**没有任何合法存在形态**（要「占位」必须放文件，
 * 放了文件就不是空目录了）⇒ 零误报，满足闸 1；修法就是删目录，成本 0，满足闸 2。
 *
 * 扫描根（06 §1.2 明确划定，**不擅自扩**——扩范围是设计决策不是实现细节）：
 *   src/  plugins/  electron/  scripts/  docs/
 * 排除同名目录：`.git` `node_modules` `dist` `dist-electron` `.vite` `*.linkdesk-plugin`（市场解包物）
 * 另排除一切 `.` 开头的目录（编辑器/工具临时目录不在版本控制视野内）。
 *
 * 用法：node scripts/check-empty-dirs.mjs（已挂 npm run check）
 *       node scripts/check-empty-dirs.mjs --self-test
 * 退出码 0 = 无空目录；1 = 有（路径 + 修法打到 stderr）。
 *
 * ── 🔴 E6#109p-b（1.28b）补自测 ──
 *   1.27 全量体检的结论是「本道**没有自测** ⇒『它会红』从来没有机械证据」（只有人工探针
 *   `mkdir src/__probe_empty__` 的红/绿各一次）。本轮补**可复跑自测**，顺带做两件结构清理：
 *   · 走查抽成 `findEmptyDirs(absRoot, relRoot)`（**返回数组、不写模块级状态**）——
 *     旧版把结果推进模块级 `emptyDirs`，是**隐藏状态**（连调两次会累积，自测里就跑不动）；
 *   · `shouldSkip(name)` 导出，纯函数逐类成例。
 *   夹具一律 `os.tmpdir()` + `finally rmSync`，**不往仓库造一个字节垃圾**。
 */

import { readdirSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SCAN_ROOTS = ["src", "plugins", "electron", "scripts", "docs"];

/** 目录名排除——构建产物 / 依赖 / 市场解包物（`*.linkdesk-plugin` 解包后是目录） */
const EXCLUDED_DIRS = new Set(["node_modules", "dist", "dist-electron", ".vite"]);
const EXCLUDED_SUFFIX = ".linkdesk-plugin";

/**
 * 纯函数：这个目录名是否整个跳过（不下降、不进判定）。
 * 三类各自成例（见 --self-test）：`.` 开头 / EXCLUDED_DIRS 精确匹配 / `*.linkdesk-plugin` 后缀。
 * ⚠️ 两类都是**精确语义**：`dist2`、`node_modules2`、`x.linkdesk-plugin.bak` 都**不跳过**。
 */
export function shouldSkip(name) {
  if (name.startsWith(".")) return true;          // .git / .vscode / .cache …（不在版本控制视野）
  if (EXCLUDED_DIRS.has(name)) return true;
  if (name.endsWith(EXCLUDED_SUFFIX)) return true;
  return false;
}

/**
 * 走查一棵树，返回其中的空目录（仓库相对、正斜杠、未排序）。
 *
 * `absRoot` 不存在 / 不可读 ⇒ 返回 `[]`（约定根缺失不是本门禁的事，别的门禁管存在性；
 * 权限/竞态也不阻断门禁）。
 *
 * 判定形状：**只在 `entries.length === 0` 时记一个并 return** ⇒
 * ① 只管**直接子项**（子项全是文件 = 非空）；② 「嵌套两层都空」**只报最深的那个**
 * （浅夹装着一个子夹 ⇒ 非空）。这两条都是判据本体，自测里逐条钉住。
 */
export function findEmptyDirs(absRoot, relRoot) {
  const out = [];
  const walk = (absDir, relDir) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // 不可读（不存在/权限/竞态）——不阻断门禁
    }
    if (entries.length === 0) {
      out.push(relDir);
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (shouldSkip(e.name)) continue;
      walk(join(absDir, e.name), `${relDir}/${e.name}`);
    }
  };
  walk(absRoot, relRoot);
  return out;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 每一例都**真跑判据、断言实得**（不是「应该会红」的旁白）。
 * 分组按判据方向：**负控 = 违规必须被抓出**（空目录被报出来），**正控 = 不该报 / 不该跳过**。
 * 因此条数上正控远多于负控——这是有意的：误报比漏报更常毁掉一道门禁的信誉。
 */
function runSelfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "linkdesk-empty-dirs-selftest-"));
  let bad = 0;
  let posOk = 0;
  let negCount = 0;
  let total = 0;

  const mk = (...segs) => mkdirSync(join(tmp, ...segs), { recursive: true });
  /** 走查结果 → 可比字符串（排序，免得踩 readdirSync 的顺序差异）；零 ⇒ `""` */
  const found = (abs, relRoot) => findEmptyDirs(abs, relRoot).sort().join(" ");
  const fmt = (v) => (v === "" ? "（零）" : v);

  try {
    // ── 夹具（全在 os.tmpdir()，finally 清）——每个 case 用**自己的子树**当扫描根，
    //    免得并列夹具互相混进计数 ──
    const plain = join(tmp, "plain"); // 扫描根本身就是空的
    mk("plain");
    const nest = join(tmp, "nest"); // nest 只装 deep ⇒ 两层都空
    mk("nest", "deep");
    const twoRoot = join(tmp, "two"); // 两个并列空目录
    mk("two", "a");
    mk("two", "b");
    const withFile = join(tmp, "with-file");
    mk("with-file");
    writeFileSync(join(withFile, "keep.txt"), "x");
    const outer = join(tmp, "outer-inner"); // 只装「非空子夹」的夹
    mk("outer-inner", "inner");
    writeFileSync(join(outer, "inner", "keep.txt"), "x");
    const excluded = join(tmp, "excluded"); // 全空，且**全在排除名单内**
    for (const n of ["node_modules", "dist", "dist-electron", ".vite", "foo.linkdesk-plugin", ".cache", ".hidden"]) {
      mk("excluded", n);
    }
    const dotDirs = join(tmp, "dot-dirs");
    mk("dot-dirs", ".cache");
    mk("dot-dirs", ".hidden");

    const cases = [
      // ── 负控：违规 ⇒ 必须被抓出（每条都是「换个输入 ⇒ 结论翻面」）──
      ["负控①：普通空目录（扫描根本身空）⇒ 报 1 个", "负控", () => found(plain, "r"), "r"],
      [
        "负控②：嵌套两层都空 ⇒ **只报最深那个**（浅夹装着一个子夹 ⇒ 不算空）",
        "负控",
        () => found(nest, "r"),
        "r/deep",
      ],
      ["负控③：两个并列空目录 ⇒ 2 个（不是 1 个，也不是把父夹算上）", "负控", () => findEmptyDirs(twoRoot, "r").length, 2],
      ["负控④：两个并列空目录 ⇒ 路径各自都对", "负控", () => found(twoRoot, "r"), "r/a r/b"],

      // ── 正控：不该报 ──
      ["正控①：含文件的目录 ⇒ 零", "正控", () => found(withFile, "r"), ""],
      [
        "正控②：排除名单内的空目录（node_modules/dist/dist-electron/.vite/*.linkdesk-plugin/.cache/.hidden）⇒ 零",
        "正控",
        () => found(excluded, "r"),
        "",
      ],
      ["正控③：`.` 开头的空目录（.cache/.hidden）⇒ 零", "正控", () => found(dotDirs, "r"), ""],
      ["正控④：只装「非空子夹」的夹 ⇒ 不算空（父夹不报，子夹也不报）", "正控", () => found(outer, "r"), ""],
      ["正控⑤：扫描根不存在 ⇒ 零、不崩", "正控", () => found(join(tmp, "no-such-root"), "r"), ""],
      ["正控⑥：两次调用互不累积（模块级 emptyDirs 已拆——旧版会得 `r | r r`）", "正控", () => `${found(plain, "r")} | ${found(plain, "r")}`, "r | r"],

      // ── 正控：纯函数 shouldSkip 每类各一例 ──
      ["正控⑦：shouldSkip(`.cache`) ⇒ true（`.` 开头）", "正控", () => shouldSkip(".cache"), true],
      ["正控⑧：shouldSkip(`.git`) ⇒ true", "正控", () => shouldSkip(".git"), true],
      ["正控⑨：shouldSkip(`node_modules`) ⇒ true", "正控", () => shouldSkip("node_modules"), true],
      ["正控⑩：shouldSkip(`dist`) ⇒ true", "正控", () => shouldSkip("dist"), true],
      ["正控⑪：shouldSkip(`dist-electron`) ⇒ true（不是被 `dist` 前缀顺带命中）", "正控", () => shouldSkip("dist-electron"), true],
      ["正控⑫：shouldSkip(`.vite`) ⇒ true", "正控", () => shouldSkip(".vite"), true],
      ["正控⑬：shouldSkip(`foo.linkdesk-plugin`) ⇒ true（市场解包物）", "正控", () => shouldSkip("foo.linkdesk-plugin"), true],
      ["正控⑭：shouldSkip(`views`) ⇒ false（正常源码夹不许被跳过）", "正控", () => shouldSkip("views"), false],
      ["正控⑮：shouldSkip(`node_modules2`) ⇒ false（精确匹配，不吃前缀）", "正控", () => shouldSkip("node_modules2"), false],
      ["正控⑯：shouldSkip(`dist2`) ⇒ false（精确匹配）", "正控", () => shouldSkip("dist2"), false],
      ["正控⑰：shouldSkip(`x.linkdesk-plugin.bak`) ⇒ false（后缀要落在末尾）", "正控", () => shouldSkip("x.linkdesk-plugin.bak"), false],
      ["正控⑱：shouldSkip(`linkdesk-plugin`) ⇒ false（缺 `.` 前缀）", "正控", () => shouldSkip("linkdesk-plugin"), false],
    ];

    for (const [tag, group, run, want] of cases) {
      let got;
      try {
        got = run();
      } catch (e) {
        got = `抛错(${e.message})`;
      }
      const pass = got === want;
      if (group === "负控") negCount++;
      if (pass && group === "正控") posOk++;
      if (!pass) bad++;
      total++;
      process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${fmt(got)}${pass ? "" : `，应 ${fmt(want)}`}\n`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true }); // 自测不许往仓库/系统留垃圾
  }

  process.stdout.write(
    bad === 0
      ? `\n✅ check-empty-dirs self-test 全过（${total} 例：正控 ${posOk} 绿 / 负控 ${negCount} 红）——尺子不是在恒绿。\n`
      : `\n🔴 check-empty-dirs self-test ${bad} 例不符（共 ${total} 例）。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const emptyDirs = [];
  for (const root of SCAN_ROOTS) {
    const abs = resolve(ROOT, root);
    if (!existsSync(abs)) continue; // 约定根缺失不是本门禁的事（别的门禁管存在性）
    emptyDirs.push(...findEmptyDirs(abs, root));
  }

  if (emptyDirs.length > 0) {
    emptyDirs.sort();
    console.error(`❌ 发现 ${emptyDirs.length} 个空目录——git 不记录目录，工作区看着 clean 但垃圾在仓里。`);
    console.error(`   修法：rmdir "<路径>"（Windows: rmdir "路径"；确认目录真的空，别误删有内容的）\n`);
    for (const d of emptyDirs) console.error(`   ${d}/`);
    console.error("");
    process.exit(1);
  }

  console.log(`✅ 无空目录——已扫 ${SCAN_ROOTS.map((r) => `${r}/`).join(" ")}（排除 .* / node_modules / dist / dist-electron / .vite / *.linkdesk-plugin）。`);
}

main();
