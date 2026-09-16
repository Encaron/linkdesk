/**
 * 机械检查：设计流程自身三不变量（audit-design-flow，E5.8#145）。
 *
 * 新能力设计流程 §8.4——「不走不放行」机械层（2026-08-27 用户拍板）。
 * memory/skill 是软层靠自觉（design-flow skill #136），本脚本是硬拦截。三条不变量（全过才绿）：
 *
 *  ① 清单条目 = 指针集：`E5.8-执行清单.md` 中任务号 ≥ #145 的条目必须
 *     ≤ 2 物理行 + 含 ≥1 档案链接 + 单行 ≤ 400 字符——细节沉档案，禁塞清单（§四 4.1 机械化）。
 *  ② 档案链接存在性：#145+ 条目引用的档案路径真实存在于磁盘（相对清单所在目录解析）——防悬空指针。
 *  ③ 新能力文档必带设计前置：git 未提交（??/M/A）的 `docs/02-Electron架构/*.md`
 *     （排除 `*执行清单*` / `README`）含新能力标记（`window.linkdesk.` / `contributes.`）
 *     且无「设计前置」/「非新能力」声明 → 红灯。
 *
 * 存量豁免：#0a-#144 一律跳过（实证 216/323 无档案链接、59 条超 360 字符 = 指针集铁律
 * 在历史清单从未被机械执行）；从 #145 之后严格。新 `app.*` 配置键由 §8.2
 * check-config-baseline.mjs 覆盖，不在此列。
 *
 * L2 调用时拦截（用户拍板「只拦 commit」）：`.claude/settings.json` PreToolUse 钩子
 * 匹配 `Bash(git commit*)` → 本脚本红灯直接 block commit。
 *
 * 用法：node scripts/check-design-flow.mjs（已挂 npm run check）
 *       node scripts/check-design-flow.mjs --self-test
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 *
 * ── 🔴 E6#109p-b（1.28b）补自测：把「它会红」从一次性探针变成可复跑的机械证据 ──
 *   1.27 体检这 34 道 `check-*` 时，本脚本**没有任何自测**：三不变量全靠那次手工探针
 *   （改清单造 ①/②、造未提交文档造 ③）验证过——**一次性**。下次谁动了 parseChecklist 的
 *   边界、谁松了 existsSync 那条，没有任何东西会叫醒。⇒ 本轮抽出两个纯函数并在 `--self-test`
 *   里逐例真跑：`judgeCapabilityDoc(relPath, src)`（③ 的单文件判定，不读盘不跑 git）
 *   ＋ `checkEntries(entries, baseDir)`（① + ②，档案根可注入）。
 *   ⛔ 自测**不碰 `docs/`**——这道门禁判的就是「docs 下的未提交文档」，往那儿造夹具 = 自测污染工作区；
 *      夹具一律 `os.tmpdir()` ＋ finally 清掉。⛔ 也**不调**依赖 `git status` 的整体流程——
 *      那会把自测变成环境的函数（本机有无未提交文档不该影响尺子准不准）。
 */

import { readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { resolve, dirname, join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, ".."); // 代码根（package.json 所在：linkdesk/）
const CHECKLIST = "docs/02-Electron架构/E5.8_归一化基建/E5.8-执行清单.md";
const CHECKLIST_DIR = dirname(resolve(ROOT, CHECKLIST));
const DOC_ROOT = "docs/02-Electron架构"; // ③ 扫描根
const MIN_TASK = 145; // 存量豁免：#0a-#144 一律跳过
const MAX_LINES = 2;
const MAX_LINE_CHARS = 400;

/** 任务基号：子任务 #145.1 → 145；#0a/#36k 等历史号 → 前置数字；无数字开头 → 0（视为 <145 豁免，防误伤） */
function taskBase(raw) {
  const n = parseFloat(raw);
  return Number.isNaN(n) ? 0 : n;
}

/** 一行是否构成条目边界（结束上一条目）：空行 / 引用 / 标题 / 列表项 / 表格 / 分隔线 */
function isBoundary(line) {
  if (/^\s*$/.test(line)) return true;
  if (/^\s*([>*#-]|\|)/.test(line)) return true;
  if (/^\s*(\*\*\*|---|___)\s*$/.test(line)) return true;
  return false;
}

/**
 * 解析清单全部条目：`- [ ] **E5.8#NNN[.x]** ...` 起（兼容 `~~` 删除线 / `🔒` 暂缓锁 / 历史 `#0d.7-1` 号），边界行止。
 * 纯函数：**吃清单全文**（调用方读盘），不碰磁盘——自测拿内存夹具就能跑。
 */
export function parseChecklist(src) {
  const entries = [];
  let cur = null;
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*\[[ xX]\]\s+.*?\*\*(?:E5\.8)?#([0-9a-zA-Z]+(?:[.-][0-9a-zA-Z]+)*)\*\*/);
    if (m) {
      if (cur) entries.push(cur);
      cur = { raw: m[1], base: taskBase(m[1]), lines: [line] };
    } else if (cur) {
      if (isBoundary(line)) {
        entries.push(cur);
        cur = null;
      } else {
        cur.lines.push(line); // 条目续行（指针集 ≤2 行允许）
      }
    }
  }
  if (cur) entries.push(cur);
  return entries;
}

/** 提取档案链接：`[text](target)`——页内锚点 / 外链不计档案链接，去 #片段 查存在性。纯函数（不读盘）。 */
export function extractLinks(text) {
  const out = [];
  for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    let target = m[1];
    if (/^(#|https?:|mailto:)/.test(target)) continue;
    target = target.split("#")[0].split("?")[0];
    if (!target.trim()) continue;
    out.push(target);
  }
  return out;
}

/**
 * ① + ②：≥#145 条目指针集 + 档案链接存在性。
 * 纯函数（除档案存在性那一下 `existsSync`）：`baseDir` 是**档案链接的相对根**（默认 = 清单所在目录），
 * 自测注入 `os.tmpdir()` 夹具根，**不去 docs/ 造文件**。
 */
export function checkEntries(entries, baseDir = CHECKLIST_DIR) {
  const issues = [];
  for (const e of entries) {
    if (e.base < MIN_TASK) continue;
    const links = extractLinks(e.lines.join("\n"));
    if (e.lines.length > MAX_LINES) {
      issues.push(`  E5.8#${e.raw}: 条目 ${e.lines.length} 物理行 > ${MAX_LINES}——指针集必须 ≤ ${MAX_LINES} 行，细节沉档案（§四 4.1）`);
    }
    for (const [i, len] of e.lines.map((l) => l.length).entries()) {
      if (len > MAX_LINE_CHARS) {
        issues.push(`  E5.8#${e.raw}: 第 ${i + 1} 行 ${len} 字符 > ${MAX_LINE_CHARS}——指针集单行上限，细节沉档案（§四 4.1）`);
      }
    }
    if (links.length === 0) {
      issues.push(`  E5.8#${e.raw}: 无档案链接——指针集必须含 ≥1 档案链接（§四 4.1）`);
    }
    for (const link of links) {
      if (!existsSync(resolve(baseDir, link))) {
        issues.push(`  E5.8#${e.raw}: 档案链接悬空 → \`${link}\`（相对 ${baseDir} 不存在）`);
      }
    }
  }
  return issues;
}

/**
 * ③ 的**单文件判定**：一个「未提交文档」的路径 + 文本 → issues。
 * 纯函数：**不读盘、不跑 git**——「哪些文件算未提交」是 `checkUncommittedCapabilityDocs()` 的事，
 * 「这个文件该不该报」是本函数的事。自测直接喂夹具字符串即可（绝不往 `docs/` 造文件）。
 * 判据（一字未改）：路径在 `DOC_ROOT` 下 + `.md` + 非 `*执行清单*`/`README` + 含新能力标记
 * （`window.linkdesk.` / `contributes.`）且无「设计前置」/「非新能力」声明 ⇒ 报。
 *
 * @param {string} relPath 仓库根相对路径（posix 斜杠）
 * @param {string} src 文件全文
 * @returns {string[]} issues（空数组 = 合规）
 */
export function judgeCapabilityDoc(relPath, src) {
  const issues = [];
  if (!relPath.endsWith(".md") || !relPath.includes(DOC_ROOT)) return issues;
  const base = relPath.split("/").pop() ?? "";
  if (base.includes("执行清单") || base.includes("README")) return issues;
  const hasCap = /window\.linkdesk\.|contributes\./.test(src);
  const hasPreface = src.includes("设计前置") || src.includes("非新能力");
  if (hasCap && !hasPreface) {
    issues.push(`  ${relPath}: 含新能力标记（window.linkdesk. / contributes.）但无「设计前置」/「非新能力」声明——新能力文档必带 8 维度设计前置（§8.4 ③）`);
  }
  return issues;
}

/** ③ 未提交新能力文档必带设计前置。 */
function checkUncommittedCapabilityDocs() {
  const issues = [];
  let repoRoot;
  let out;
  try {
    repoRoot = execSync("git rev-parse --show-toplevel", { cwd: ROOT, encoding: "utf8" }).trim();
    out = execSync("git status --porcelain -z", { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 24 });
  } catch {
    issues.push("  git status 失败——无法审计未提交新能力文档（§8.4 不变量③）");
    return issues;
  }
  const resolvePath = (p) => {
    const fromRepo = resolve(repoRoot, p); // porcelain -z 给 repo 根相对路径
    return existsSync(fromRepo) ? fromRepo : resolve(ROOT, p); // 兜底 cwd 相对
  };
  for (const rec of out.split("\0")) {
    if (!rec) continue;
    const status = rec.slice(0, 2);
    const path = rec.slice(3);
    // 未提交（??/M/A——含 A 防暂存后逃逸）+ .md + docs/02-Electron架构/ 的廉价预筛（免得把每个未提交文件都读一遍）
    if (!(status.startsWith("??") || /[AM]/.test(status))) continue;
    if (!path.endsWith(".md") || !path.includes(DOC_ROOT)) continue;
    let src;
    try {
      src = readFileSync(resolvePath(path), "utf-8");
    } catch {
      continue;
    }
    issues.push(...judgeCapabilityDoc(path, src)); // 排除 *执行清单*/README 与标记判据都在纯函数里
  }
  return issues;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 解析断言：不符 ⇒ 返回一条说明（好与判据用例**同形**打印；空数组 = 解析符合预期）。
 * 守的是 parseChecklist 的两件事：**基号取对**（≥145 才进射程、`#0d` 这类历史号落 0 豁免）
 * 与**续行归并**（≤2 物理行的指针集允许换行，归并错 ⇒ ① 行数判据全歪）。
 */
function assertParse(text, wantBases, wantLens) {
  const es = parseChecklist(text);
  const issues = [];
  const bases = es.map((e) => e.base);
  if (JSON.stringify(bases) !== JSON.stringify(wantBases)) {
    issues.push(`base 序列实得 ${JSON.stringify(bases)}，应 ${JSON.stringify(wantBases)}`);
  }
  const lens = es.map((e) => e.lines.length);
  if (JSON.stringify(lens) !== JSON.stringify(wantLens)) {
    issues.push(`条目行数（续行归并）实得 ${JSON.stringify(lens)}，应 ${JSON.stringify(wantLens)}`);
  }
  return issues;
}

/**
 * 每一例都**真跑判据、断言实得结果**——「应该红」不算证据（1.27 是手工探针一次性验过的）。
 * 正控 = 合规输入 ⇒ 判据必须**零** issue（绿）；负控 = 违规输入 ⇒ 必须吐 issue（红）。
 * ⛔ 夹具根一律 `os.tmpdir()`（**绝不往 `docs/` 造文件**）；⛔ 不调 `checkUncommittedCapabilityDocs()`
 *    （它依赖 `git status`——那会把自测变成「本机工作区状态」的函数）。
 */
function runSelfTest() {
  let bad = 0;
  let pos = 0;
  let neg = 0;
  const tmp = mkdtempSync(join(tmpdir(), "design-flow-selftest-"));
  try {
    mkdirSync(join(tmp, "sub"), { recursive: true });
    writeFileSync(join(tmp, "archive.md"), "# 探针档案（tmpdir 夹具）\n");
    writeFileSync(join(tmp, "sub/deep.md"), "# 深一层的探针档案\n");

    /** ① / ② 用例入口：清单文本 → checkEntries 的实得 issues（档案根 = tmpdir） */
    const entryIssues = (text, baseDir = tmp) => checkEntries(parseChecklist(text), baseDir);

    const cases = [
      // ── 解析（正控）──
      [
        "解析①：≥#145 与 <#145 各一条 ⇒ 2 条目 / base [146,144] / 续行各归并成 2 行",
        false,
        assertParse(
          "# 探针清单\n- [ ] **E5.8#146** 条目 [档案](./archive.md)\n  续行一\n- [ ] **E5.8#144** 旧条（豁免档）\n  续行二\n",
          [146, 144],
          [2, 2],
        ),
        null,
      ],
      [
        "解析②：子任务号 #146.2 ⇒ base **146.2**（实测 taskBase 不取整，与函数注释「#145.1 → 145」不符）；历史号 #0d ⇒ base 0（<145 豁免，防误伤）",
        false,
        assertParse("- [ ] **E5.8#146.2** 子任务\n- [ ] **#0d** 历史号\n", [146.2, 0], [1, 1]),
        null,
      ],
      // ── ① 指针集（负控红 = 1.27 实测过的三条形态）──
      [
        "①负控：单条 3 物理行 ⇒ 报「> 2 物理行」",
        true,
        entryIssues("- [ ] **E5.8#146** 条目 [档案](./archive.md)\n  续行一\n  续行二\n"),
        `物理行 > ${MAX_LINES}——`,
      ],
      [
        "①负控：单行 401+ 字符 ⇒ 报「> 400 字符」",
        true,
        entryIssues(`- [ ] **E5.8#146** ${"字".repeat(420)} [档案](./archive.md)\n`),
        `字符 > ${MAX_LINE_CHARS}——`,
      ],
      [
        "①负控：无任何档案链接 ⇒ 报「无档案链接」（1.27 探针形态①）",
        true,
        entryIssues("- [ ] **E5.8#146** 探针条目——无档案链接\n"),
        "无档案链接",
      ],
      [
        "①正控：2 行 + 真实档案链接 + ≤400 字符 ⇒ 零",
        false,
        entryIssues("- [ ] **E5.8#146** 条目 [档案](./archive.md)\n  续行（指针集允许 2 行）\n"),
        null,
      ],
      // ── ② 档案链接存在性 ──
      [
        "②正控：档案链接指向 tmpdir 里**真实存在**的文件（含子目录）⇒ 不报悬空",
        false,
        entryIssues("- [ ] **E5.8#146** 条目 [档案](./sub/deep.md)\n"),
        null,
      ],
      [
        "②负控：档案链接悬空 ⇒ 报「档案链接悬空」（1.27 探针形态②）",
        true,
        entryIssues("- [ ] **E5.8#146** 条目 [档案](__probe_missing_archive__.md)\n"),
        "档案链接悬空",
      ],
      [
        "②负控：页内锚点 / https 外链 / mailto **都不算**档案链接 ⇒ 仍报「无档案链接」（真实语义，不是空过）",
        true,
        entryIssues("- [ ] **E5.8#146** [锚](#x) [外](https://example.com/a.md) [邮](mailto:a@b.c)\n"),
        "无档案链接",
      ],
      // ── ③ judgeCapabilityDoc（纯函数，喂路径 + 文本）──
      [
        "③负控：含 window.linkdesk. 且无声明 ⇒ 报（1.27 探针形态③）",
        true,
        judgeCapabilityDoc("docs/02-Electron架构/xxx.md", "面板通过 window.linkdesk.panel.open() 打开\n"),
        "无「设计前置」",
      ],
      [
        "③负控：含 contributes. 且无声明 ⇒ 报",
        true,
        judgeCapabilityDoc("docs/02-Electron架构/yyy.md", "新增 contributes.commands 一条\n"),
        "无「设计前置」",
      ],
      [
        "③正控：标记 + 「设计前置」声明 ⇒ 零",
        false,
        judgeCapabilityDoc("docs/02-Electron架构/zzz.md", "设计前置（8 维度）：…\n含 window.linkdesk.foo\n"),
        null,
      ],
      [
        "③正控：标记 + 「非新能力」声明 ⇒ 零",
        false,
        judgeCapabilityDoc("docs/02-Electron架构/zzz.md", "非新能力：只是补齐 contributes. 已有键\n"),
        null,
      ],
      [
        "③正控：文件名带「执行清单」⇒ 零（清单天然含标记）",
        false,
        judgeCapabilityDoc("docs/02-Electron架构/E5.8_归一化基建/E5.8-执行清单.md", "window.linkdesk.foo\n"),
        null,
      ],
      [
        "③正控：README 文件名 ⇒ 零",
        false,
        judgeCapabilityDoc("docs/02-Electron架构/README.md", "window.linkdesk.foo\n"),
        null,
      ],
      [
        "③正控：路径不在 docs/02-Electron架构 下 ⇒ 零（不在射程）",
        false,
        judgeCapabilityDoc("docs/03-前端/xxx.md", "window.linkdesk.foo\n"),
        null,
      ],
      [
        "③正控：非 .md（如 .ts）⇒ 零",
        false,
        judgeCapabilityDoc("docs/02-Electron架构/probe.ts", "window.linkdesk.foo\n"),
        null,
      ],
    ];

    for (const [tag, red, issues, kw] of cases) {
      if (red) neg++;
      else pos++;
      let pass = issues.length > 0 === red; // 实得红/绿 == 期望红/绿
      if (pass && kw && !issues.some((i) => i.includes(kw))) pass = false;
      if (!pass) bad++;
      process.stdout.write(
        `${pass ? "✅" : "🔴"} ${tag} —— 实得 ${issues.length} 条${red ? "（应红）" : "（应绿）"}` +
          `${issues.length && kw ? `：${issues[0].trim().slice(0, 60)}` : ""}\n`,
      );
    }

    // 用例构成自检：正控必须 ≥ 负控（全绿尺子没有证据力）
    if (pos < neg) {
      bad++;
      process.stdout.write(`🔴 用例构成不达标：正控 ${pos} < 负控 ${neg}——正控必须 ≥ 负控。\n`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true }); // 夹具一定清掉（先于 process.exit，见下）
  }

  process.stdout.write(
    bad === 0
      ? `\n✅ check-design-flow self-test 全过（${pos + neg} 例：正控绿 / 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-design-flow self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const entries = parseChecklist(readFileSync(resolve(ROOT, CHECKLIST), "utf-8"));
  const checked = entries.filter((e) => e.base >= MIN_TASK);
  const issues = [...checkEntries(entries), ...checkUncommittedCapabilityDocs()];

  if (issues.length > 0) {
    console.error(`❌ 设计流程机械门禁 ${issues.length} 处违规——不走不放行：\n${issues.join("\n")}`);
    process.exit(1);
  }
  console.log(`✅ 设计流程机械门禁干净——清单 ${entries.length} 条目，≥#145 共 ${checked.length} 条全为指针集 + 档案链接存在；未提交新能力文档无裸新能力。`);
}

main();
