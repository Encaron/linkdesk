/**
 * 机械检查：**文档断链**（E6#96f · 红灯）。
 *
 * ## 为什么必须机械扫
 * L3.6 文件整理层 / L3.7 插件归一化层把文件**搬走或拆掉**之后，引用没跟着回填——
 * 2026-09-11 全树扫出**数百处死链**。病根不是「当初写错」，是**搬文件这个动作
 * 没有任何机制把旧引用叫醒**（同族：3.7.3 那条「bump 了版本就必须同笔写 CHANGELOG 段」——
 * 动作有前置义务，义务没人执行）。
 * ⇒ **本脚本才是 E6#96 立案的全部意义**：不改对没门禁 ⇒ 下次搬文件又烂一遍，本次白干。
 *
 * ## 三档定位（memory `e6-gate-philosophy-three-tier` 的立项三预检）
 * **红灯**。三道闸逐条自审：
 *  - **闸 1｜零误报**——判据是**现场 `fs.existsSync`**，目标真不存在才报，不存在「风格分歧」。
 *    唯二的假阳性来源已显式处理：① 代码块/行内代码里的示例链接（**不扫**，见下）；
 *    ② **「计划新建但还没建」的文档**（如 #44a 的 `docs/06-发布管理/发布清单.md`）——
 *    走 `scripts/doc-links-allowlist.txt` 显式豁免，**每条必须写「哪条任务会建它」**。
 *  - **闸 2｜修复成本≈0**——报错直接印「文件:行 → 缺失目标」+ 相对仓根的路径，照抄即可改。
 *  - **闸 3｜规则不许腐烂**——不维护任何「目录快照」「索引副本」，每次跑都重新读盘。
 *
 * ## 扫什么（范围与边界）
 *  - **源**：`docs/**\/*.md`（`.html` mockup 不在内——它们是**静态图**，内部链接不是引用关系）。
 *  - **目标**：一切**相对路径**链接。不按扩展名过滤——`existsSync` 说没有就是没有，
 *    加白名单式后缀过滤只会**放走**本该报的（见下方「已知边界」）。
 *  - **不扫**：`http(s)://` / `mailto:` / `tel:` / 纯锚点 `#xxx` / 绝对路径（`/foo` 与 `C:\foo`）。
 *    **前四类不是本仓文件引用**；绝对路径在仓内本就是违规写法，各文档已另行处理。
 *  - **不扫**：围栏代码块（``` / ~~~）与行内代码（`` `…` ``）**内部**——那里的
 *    `[x](y)` 是**示例文本**，不是引用。这一条是闸 1 的主要保障。
 *
 * ## 用法
 * ```bash
 * node scripts/check-doc-links.mjs            # 门禁模式：有断链 → 退出码 1（已挂 npm run check）
 * node scripts/check-doc-links.mjs --json     # 机器可读输出（E6#96a 断链总账档由它生成，不手抄）
 * node scripts/check-doc-links.mjs --tree <相对路径>   # 只扫某棵子树（排查用，不改变门禁语义）
 * node scripts/check-doc-links.mjs --self-test          # 自测尺子（纯函数逐例 + tmpdir 小树端到端）
 * ```
 *
 * ### 🔴 E6#109p-b（1.28b）补自测
 * 1.27 体检这 34 道 `check-*` 时本脚本**没有自测**：当年是往 `docs/开发管理/当前状态.md`
 * 追加 `[探针断链](./__probe_missing__.md)` 手工验红的——**一次性**。下次谁动了 `INLINE_LINK`
 * 的正则、谁改了围栏状态机、谁往滤除清单里加一条，没有任何东西会叫醒。
 * ⇒ 本轮把「**一行 → 该行的候选目标**」抽成纯函数 `linkTargetsInLine(line, inFence)`，并在
 * `--self-test` 里逐例真跑（正控 = 不算引用 ⇒ 0 目标；负控 = 该抓 ⇒ ≥1 目标），另有一例端到端
 * 走 `os.tmpdir()` 小树。⛔ 夹具一律 tmpdir ＋ finally 清掉，**绝不往 `docs/` 造文件**
 * （本门禁扫的就是那棵树，往那儿造夹具 = 自测污染工作区）。
 *
 * ## 已知边界（写下来，免得下一个人当成 bug）
 *  1. **不校验锚点 `#L123` / `#标题`**。文件在 ≠ 锚点在（行号会随代码漂）。锚点校验需要
 *     读目标文件 + 解析 markdown 标题，误报率高、修复成本高——**闸 1/闸 2 都过不了**，
 *     故本门禁**只管文件级存在性**（E6#96c 的人工重算仍是必需的，那是内容工作不是门禁能代的）。
 *  2. **不做大小写归一**。Windows 文件系统不区分大小写，`Foo.md` 与 `foo.md` 在本地都能打开，
 *     但推到 Linux CI 就断——**本脚本在 Windows 上跑，这类问题它看不见**（记在此，不假装能管）。
 *  3. **不解引用**：`../a/../b.md` 之类不做规范化后再判——`path.resolve` 已代劳。
 */

import { readdirSync, readFileSync, existsSync, statSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const SCAN_ROOT = resolve(ROOT, "docs");
const EXCLUDE_FILE = resolve(__dirname, "doc-links-exclude.txt");
const ALLOWLIST_FILE = resolve(__dirname, "doc-links-allowlist.txt");

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const treeIdx = argv.indexOf("--tree");
const TREE = treeIdx >= 0 ? argv[treeIdx + 1] : null;

/* ── 豁免清单 ──────────────────────────────────────────────────────────── */

/**
 * 读一份「每行一条、`#` 起注释」的清单。行格式：`<路径片段>\t<理由>`
 * 理由必填——**没写理由的豁免条目一律视为配置错误**（豁免是债，债必须挂账）。
 */
function readList(file, label) {
  if (!existsSync(file)) return [];
  const out = [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  lines.forEach((ln, i) => {
    const s = ln.trim();
    if (!s || s.startsWith("#")) return;
    const [pattern, ...rest] = s.split("\t");
    const reason = rest.join("\t").trim();
    if (!pattern) return;
    if (!reason) {
      console.error(`❌ ${label} 第 ${i + 1} 行缺理由——豁免必须挂账（格式：<模式>\\t<理由>）。`);
      console.error(`   ${s}`);
      process.exit(1);
    }
    out.push({ pattern: pattern.trim(), reason });
  });
  return out;
}

/* ── 扫描 ──────────────────────────────────────────────────────────────── */

const relPosix = (abs) => relative(ROOT, abs).split(sep).join("/");

/** 收集要扫的 md 文件 */
function collect(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      collect(p, out);
    } else if (e.name.endsWith(".md")) {
      out.push(p);
    }
  }
  return out;
}

const INLINE_LINK = /\[[^\]]*\]\(([^)\s]+?)(?:\s+"[^"]*")?\)/g;
/** 引用式定义：`[label]: target`（可带可选 title） */
const REF_DEF = /^\s{0,3}\[[^\]]+\]:\s*(\S+)/;

/** 把行内代码 `` `…` `` 抹成等长空格——保住列号，又让其中的 `[x](y)` 失配 */
const maskInlineCode = (line) => line.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));

/**
 * **纯判据：一行 → 该行里的候选目标**（外链 / 纯锚点 / 绝对路径 / 行内代码里的示例链接都已滤掉）。
 * 只吃一行文本，**不读盘、不记状态**：
 *  · 「这个目标在磁盘上存不存在」是调用方的事（要 `dirname(file)` 才解得出）；
 *  · 「这行在不在代码块里」也是调用方的事——围栏状态机留在 `scanFile()`，用 `inFence` 传进来
 *    （本函数**只认入参**，不藏跨行状态——自测因此不需要造整个文件就能钉住围栏那条边界）。
 * ⚠️ 返回的是**原样目标**（含 `#片段`）。剥 `#` 与 `decodeURIComponent` 是存在性判定的活，不是本函数的活。
 * ⚠️ CommonMark 的尖括号 autolink（`<https://…>`）**不在射程内**（`INLINE_LINK` 只认 `[x](y)` 形态）——
 *    它既不会被报断链，也不会被当成引用；这是既有实现的真实行为，钉在 `--self-test` 里防止无声漂移。
 *
 * @param {string} line 单行原文
 * @param {boolean} [inFence] 该行是否位于围栏代码块**内部**（由调用方的状态机判定）
 * @returns {string[]} 候选目标（原样字符串，去重前）
 */
export function linkTargetsInLine(line, inFence = false) {
  if (inFence) return []; // 代码块内部不算引用（闸 1 的主要保障）
  const masked = maskInlineCode(line);
  const targets = [];
  let m;
  INLINE_LINK.lastIndex = 0;
  while ((m = INLINE_LINK.exec(masked))) targets.push(m[1]);
  const ref = REF_DEF.exec(masked);
  if (ref) targets.push(ref[1]);
  return targets.filter(
    (raw) =>
      !/^(https?:|mailto:|tel:|data:)/i.test(raw) && // 外链
      !raw.startsWith("#") && // 纯锚点（同文件内跳转）
      !/^[a-zA-Z]:[\\/]/.test(raw) && // Windows 绝对路径
      !raw.startsWith("/"), // 站内绝对路径（仓内违规写法，另行处理）
  );
}

function scanFile(file) {
  const found = [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/);
  let fence = null; // 当前围栏标记（``` 或 ~~~），null = 不在代码块内

  lines.forEach((rawLine, i) => {
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(rawLine);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      return; // 围栏行本身不含链接
    }

    // 候选目标（外链/锚点/绝对路径/行内代码/围栏内已滤）→ 逐个解存在性
    for (const raw of linkTargetsInLine(rawLine, fence !== null)) {
      const hash = raw.indexOf("#");
      const pathPart = hash >= 0 ? raw.slice(0, hash) : raw;
      if (!pathPart) continue; // `foo.md#L1` 剥完剩空 = 本来就是纯锚点
      let abs;
      try {
        abs = resolve(dirname(file), decodeURIComponent(pathPart));
      } catch {
        continue; // 非法百分号转义——不是引用，别炸
      }
      if (existsSync(abs)) continue;
      found.push({ file: relPosix(file), line: i + 1, target: raw, resolved: relPosix(abs) });
    }
  });
  return found;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 每一例都**真跑判据、断言实得结果**——只打印「应该红」不算证据（1.27 是手工探针一次性验过的）。
 * **正控** = 这些**不算引用**（判据必须吐 0 个目标）；**负控** = 这些**该被抓出**（吐 ≥1）。
 * 端到端那例（最后一例）走 tmpdir 小树 + `scanFile()`：造一条真存在的链接与一条断链，
 * 断言**只**报出断链那一条——⛔ 不碰仓库的 `docs/`。
 */
function runSelfTest() {
  let bad = 0;
  let pos = 0;
  let neg = 0;
  const tmp = mkdtempSync(join(tmpdir(), "doc-links-selftest-"));
  try {
    /** 单行探针：返回 { n, detail }（n = 候选目标数，detail = 目标原样串，便于断言抓到了谁） */
    const probe = (line, inFence = false) => {
      const ts = linkTargetsInLine(line, inFence);
      return { n: ts.length, detail: ts.join(" | ") };
    };

    // ── 端到端小树：一条好链 + 一条断链 ──
    mkdirSync(join(tmp, "sub"), { recursive: true });
    writeFileSync(join(tmp, "sub", "good.md"), "# 好目标\n");
    writeFileSync(
      join(tmp, "root.md"),
      ["# 探针", "", "- [好](./sub/good.md)", "- [坏](./sub/missing.md)", ""].join("\n"),
    );
    const broken = collect(tmp).flatMap((f) => scanFile(f));

    const cases = [
      // ── 正控：这些都不算引用 ⇒ 0 目标 ──
      ["正控①：围栏代码块**内部**（inFence=true）的 `[x](./a.md)` ⇒ 0 目标", 0, probe("[x](./a.md)", true)],
      ["正控②：行内代码 `` `[x](./a.md)` `` ⇒ 0 目标", 0, probe("示例：`[x](./a.md)` 这样写")],
      ["正控③：`https:` 外链 ⇒ 0 目标", 0, probe("- 见 [文档](https://example.com/a.md)")],
      ["正控④：`mailto:` / `tel:` / `data:` 三种 scheme ⇒ 0 目标", 0, probe("[邮](mailto:a@b.c) [电](tel:+8610) [数](data:text/plain,hi)")],
      ["正控⑤：纯锚点 `#x` ⇒ 0 目标", 0, probe("- 见 [小节](#已知边界)")],
      ["正控⑥：站内绝对路径 `/abs/path.md` ⇒ 0 目标", 0, probe("- [x](/abs/path.md)")],
      ["正控⑦：Windows 绝对路径（反斜杠与正斜杠两种写法）⇒ 0 目标", 0, probe("- [x](C:\\x\\y.md) [y](D:/x/y.md)")],
      ["正控⑧：无链接的普通文本 ⇒ 0 目标", 0, probe("这是一行普通文字，没有链接。")],
      ["正控⑨：表格分隔行 ⇒ 0 目标", 0, probe("| --- | --- |")],
      [
        "正控⑩：🔴 尖括号 autolink `<https://…>` ⇒ 0 目标（**既有实现的真实行为**：`INLINE_LINK` 只认 `[x](y)`，CommonMark 的 autolink 不在射程内——改判据时得知道动了它）",
        0,
        probe("- 见 <https://example.com/a.md>"),
      ],
      // ── 负控：这些该被抓出 ⇒ ≥1 目标 ──
      ["负控①：相对路径 `[x](./a.md)` ⇒ 1 目标", 1, probe("- [x](./a.md)")],
      ["负控②：带锚点 `[x](./a.md#L1)` ⇒ 1 目标（原样带出，剥 `#` 是存在性判定的活）", 1, probe("- [x](./a.md#L1)")],
      ["负控③：引用式定义 `[label]: ./b.md` ⇒ 1 目标", 1, probe("[label]: ./b.md")],
      ["负控④：图片式 `![alt](./c.png)` ⇒ 1 目标", 1, probe("![alt](./c.png)")],
      ["负控⑤：带 title 的 `[x](./a.md \"t\")` ⇒ 1 目标", 1, probe('- [x](./a.md "title")')],
      ["负控⑥：同一行两个链接 ⇒ 2 目标", 2, probe("- [a](./a.md) 与 [b](./b.md)")],
      [
        "负控⑦（端到端）：tmpdir 小树上「好链 existsSync 过、坏链报出」⇒ 恰好 1 处断链，且目标 = ./sub/missing.md",
        1,
        { n: broken.length, detail: broken.map((b) => b.target).join(" | ") },
        "./sub/missing.md",
      ],
    ];

    for (const [tag, want, got, kw] of cases) {
      const red = want > 0;
      if (red) neg++;
      else pos++;
      let pass = got.n === want;
      if (pass && kw && !got.detail.includes(kw)) pass = false;
      if (!pass) bad++;
      process.stdout.write(
        `${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got.n} 个目标（应 ${want}）${got.detail ? `：${got.detail}` : ""}\n`,
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
      ? `\n✅ check-doc-links self-test 全过（${pos + neg} 例：正控绿 / 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-doc-links self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

/* ── 主流程 ────────────────────────────────────────────────────────────── */

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const excludes = readList(EXCLUDE_FILE, "doc-links-exclude.txt");
  const allowlist = readList(ALLOWLIST_FILE, "doc-links-allowlist.txt");

  const scanBase = TREE ? resolve(ROOT, TREE) : SCAN_ROOT;
  if (!existsSync(scanBase)) {
    console.error(`❌ 扫描根不存在：${TREE ?? "docs/"}`);
    process.exit(1);
  }

  const files = collect(scanBase);
  const allBroken = [];
  for (const f of files) {
    const rel = relPosix(f);
    if (excludes.some((e) => rel.startsWith(e.pattern))) continue;
    allBroken.push(...scanFile(f));
  }

  const isAllowed = (b) =>
    allowlist.some((a) => b.resolved === a.pattern || b.resolved.endsWith(`/${a.pattern}`) || b.target === a.pattern);

  const excused = allBroken.filter(isAllowed);
  const failed = allBroken.filter((b) => !isAllowed(b));

  /* ── 输出 ────────────────────────────────────────────────────────────── */

  if (JSON_OUT) {
    console.log(
      JSON.stringify(
        {
          scannedFiles: files.length,
          broken: allBroken.length,
          excused: excused.length,
          failed: failed.length,
          files,
          findings: allBroken.map((b) => ({ ...b, allowed: isAllowed(b) })),
        },
        null,
        2,
      ),
    );
    process.exit(failed.length > 0 ? 1 : 0);
  }

  const head = `已扫 ${files.length} 个 md（源 ${relPosix(scanBase)}/）`;

  if (failed.length > 0) {
    console.error(`❌ 发现 ${failed.length} 处断链——搬文件/拆文件后引用没跟着回填。`);
    console.error(`   ${head}；豁免 ${excused.length} 条（allowlist），排除 ${excludes.length} 条（exclude）。`);
    console.error(`   修法：把目标改指向真身；**搬过的文件行号锚点必须重算**（旧行号 = 能点开但跳错地方，比死链更坏）。\n`);
    for (const b of failed.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)) {
      console.error(`   ${b.file}:${b.line} → ${b.target}`);
    }
    if (excused.length > 0) {
      console.error(`\n   （另有 ${excused.length} 处已在 allowlist 中挂账，未计入）`);
    }
    console.error("");
    process.exit(1);
  }

  const excusedNote = excused.length > 0 ? `，allowlist 挂账 ${excused.length} 条` : "";
  const excludeNote = excludes.length > 0 ? `，整树排除 ${excludes.length} 处` : "";
  console.log(`✅ 无断链——${head}${excusedNote}${excludeNote}。`);
}

main();
