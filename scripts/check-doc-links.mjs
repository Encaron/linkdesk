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
 * ```
 *
 * ## 已知边界（写下来，免得下一个人当成 bug）
 *  1. **不校验锚点 `#L123` / `#标题`**。文件在 ≠ 锚点在（行号会随代码漂）。锚点校验需要
 *     读目标文件 + 解析 markdown 标题，误报率高、修复成本高——**闸 1/闸 2 都过不了**，
 *     故本门禁**只管文件级存在性**（E6#96c 的人工重算仍是必需的，那是内容工作不是门禁能代的）。
 *  2. **不做大小写归一**。Windows 文件系统不区分大小写，`Foo.md` 与 `foo.md` 在本地都能打开，
 *     但推到 Linux CI 就断——**本脚本在 Windows 上跑，这类问题它看不见**（记在此，不假装能管）。
 *  3. **不解引用**：`../a/../b.md` 之类不做规范化后再判——`path.resolve` 已代劳。
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join, relative, sep } from "node:path";
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

const excludes = readList(EXCLUDE_FILE, "doc-links-exclude.txt");
const allowlist = readList(ALLOWLIST_FILE, "doc-links-allowlist.txt");

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
    if (fence !== null) return; // 代码块内部不算引用

    const line = maskInlineCode(rawLine);
    const targets = [];
    let m;
    INLINE_LINK.lastIndex = 0;
    while ((m = INLINE_LINK.exec(line))) targets.push(m[1]);
    const ref = REF_DEF.exec(line);
    if (ref) targets.push(ref[1]);

    for (const raw of targets) {
      if (/^(https?:|mailto:|tel:|data:)/i.test(raw)) continue; // 外链
      if (raw.startsWith("#")) continue; // 纯锚点（同文件内跳转）
      if (/^[a-zA-Z]:[\\/]/.test(raw)) continue; // Windows 绝对路径
      if (raw.startsWith("/")) continue; // 站内绝对路径（仓内违规写法，另行处理）
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

/* ── 主流程 ────────────────────────────────────────────────────────────── */

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

/* ── 输出 ──────────────────────────────────────────────────────────────── */

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
