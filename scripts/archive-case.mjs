#!/usr/bin/env node
/**
 * 归档一件：**搬 ＋ 全树回填 ＋ 自检**——把 `docs/04-软件更新/待抉择池/<案名>/` 搬进
 * `docs/04-软件更新/已落地/<案名>/`，并把全仓写着旧路径的入链同笔叫醒。
 *
 * ## 为什么要有这个脚本（2026-10-06 实测的账）
 * 「搬文件」本身零风险、**一分钟就够**；代价全在它惊动的引用。那天归档「文件打开方式与贡献点」
 * 花掉的时间**只有一分钟是搬**，其余是 58 处夹外入链 ＋ 9 处夹内兄弟链的人工扫描与回填——
 * 其中两分钟还烧在一版**判错对象**的扫描器上：它测的是「链接里有没有 `待抉择池/` 前缀」，
 * 对一个**其实已经指空**的目标返回了误导性的 0。
 * 判据与账本 = `docs/04-软件更新/已落地/00-README.md` §归档规矩（三条必扫写法 ＋ 历史叙述不许改）。
 *
 * ## 核心判据：**双解析**，不是猜
 * 「搬完谁的链接会断」**不能**靠「链接里有没有 `../`」判，要靠**解析后落不落进 `待抉择池/`**——
 * `待抉择池/` 与 `已落地/` **同深**，故夹内 `../../` 及以上相对链**原样成立**，只有指向
 * **池内兄弟件**的才断。故对每条链接做两次解析：
 *   · 新位置解得开  ⇒ **不动**（同深那批就走这条路）
 *   · 新位置解不开、**旧位置解得开** ⇒ 改指真身（夹内兄弟链 → `../../待抉择池/…`）
 *   · 两处都解不开 ⇒ **真死链**，只报，⛔ 绝不猜一个看着像的路径
 *
 * ## 三种写法都扫（只扫一种必漏，§归档规矩 6·① ② ③）
 *   ① 仓根相对 `docs/04-软件更新/待抉择池/X`（含 `src/`·`electron/`·`scripts/` 的注释指针）
 *   ② 从夹外往回写 `../../待抉择池/X`
 *   ③ 池内平写 `待抉择池/X`（池内各 README 的表里就是这种）
 *   ①② 按**链接**解（同一套双解析，链接判据 import 自 `check-doc-links.mjs`——**同一把尺子**，
 *   memory `two-rulers-one-caliber`）；③ 按**字面串**改（散文与注释里的路径提法不是链接）。
 *   两条腿互补，缺一条就漏。
 *   ⚠️ **夹内只改链接、不改字面串**——夹内提旧路径的多是抬头/历史叙述（「本档原住池里」），
 *   改了＝篡改当时；夹内的字面串一律留原样并如实报数。
 *
 * ## 用法
 * ```bash
 * node scripts/archive-case.mjs <案名>                 # 干跑（默认）：一个字节都不写，只打印计划与读数
 * node scripts/archive-case.mjs <案名> --apply         # 真搬 ＋ 真改
 * node scripts/archive-case.mjs <案名> --apply --keep docs/04-软件更新/已落地/00-README.md:12
 * node scripts/archive-case.mjs <案名> --apply --fix-dead    # 顺手修夹内真死链（按同名唯一命中）
 * node scripts/archive-case.mjs --self-test
 * ```
 * `--keep <仓根相对路径>:<行号>`（逗号分隔可多条）＝ **历史叙述的逃生口**：档案里「这件事当时
 * 发生在池里」的记述、池目录树快照一律留原样，读数里单列「有意保留 N 处」（§归档规矩 6·终段）。
 *
 * ## 安全阀（都是硬的）
 *  · **默认干跑**；`--apply` 才落笔。
 *  · **目标已存在 ⇒ 拒**（绝不覆盖）。
 *  · **index 必须干净**（`--allow-dirty-index` 可越）——`git mv` 会写 index，跟别人 staged 的改动
 *    混进同一笔提交就再也拆不开；宁可拒。
 *  · ⛔ **不提交、不推送**：只打印建议的 `git add` **精确路径**（本波文件）＋ 提交/推送命令骨架，
 *    「只 add 自己那波」这条纪律仍由操作者执行——本工具把它从手抄几十条路径变成一行复制。
 *  · 写完**复验**：重新解析每个文件的链接，把「搬完仍断」逐条报出；出现**新**断链 ⇒ 退出码 1。
 *
 * ## 退出码
 *  0 = 干净；1 = 有未落地/新断链；2 = 用法或前置不符（拒跑）。
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  rmdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join, relative, sep, extname, basename } from "node:path";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
// 链接判据**同一把尺子**（memory two-rulers-one-caliber）：⛔ 不另写一份正则。
import { fileLinkTargets, linkTargetsInLine } from "./check-doc-links.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 池与已落地**同深**（§归档规矩 6 的前提，改这里等于改判据本身） */
export const POOL = "docs/04-软件更新/待抉择池";
export const LANDED = "docs/04-软件更新/已落地";

/** 参与扫描的文本后缀——`src/`·`scripts/` 的注释指针也在射程内 */
const TEXT_EXT = new Set([
  ".md", ".markdown", ".html", ".htm", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".json", ".jsonc", ".yml", ".yaml", ".txt", ".css", ".py", ".sh", ".toml",
]);
const HTML_EXT = new Set([".html", ".htm"]);

const toPosix = (p) => p.split(sep).join("/");
const relPosix = (abs) => toPosix(relative(ROOT, abs));
const has = (p) => existsSync(p);

function die(msg) {
  console.error(`❌ ${msg}`);
  process.exit(2);
}

/* ─────────────────────────── 纯逻辑（自测直接喂字符串） ─────────────────────────── */

/** 行内 HTML 链接目标（`href` / `src`；外链·锚点·绝对路径滤掉）——mockup 是 `.html`，正文里的
 *  markdown 式链接由 `linkTargetsInLine` 那半边管。 */
const HTML_ATTR = /(?:href|src)\s*=\s*["']([^"']+)["']/gi;
export function htmlLinkTargetsInLine(line) {
  const out = [];
  HTML_ATTR.lastIndex = 0;
  let m;
  while ((m = HTML_ATTR.exec(line))) {
    const raw = m[1];
    if (/^(https?:|mailto:|tel:|data:|javascript:|#)/i.test(raw)) continue;
    if (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith("/")) continue;
    out.push(raw);
  }
  return out;
}

const decodeSafe = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** 只换**真正的链接形态**——`](raw)` / `"raw"` / `'raw'`；⛔ 不做裸串替换（那会改到散文）。 */
export function applyPairsToLine(line, raw, next) {
  let out = line;
  if (out.includes(`](${raw})`)) out = out.split(`](${raw})`).join(`](${next})`);
  if (out.includes(`"${raw}"`)) out = out.split(`"${raw}"`).join(`"${next}"`);
  if (out.includes(`'${raw}'`)) out = out.split(`'${raw}'`).join(`'${next}'`);
  return out;
}

/**
 * **重写引擎**：一份文本 → 重写后的文本 ＋ 改动点 ＋ 真死链 ＋ 有意保留。
 * 纯逻辑——存在性走注入的 `exists`，故自测不需要真文件系统（`--self-test` 就是靠这条）。
 *
 * @param {string} text
 * @param {object} ctx `{ fileAbs, oldFileAbs, mode:"inside"|"outside", isHtml, poolCaseAbs,
 *                       landedCaseAbs, stringFrom, stringTo, caseName, keeps:Set<number> }`
 * @param {(abs:string)=>boolean} exists
 */
export function repairText(text, ctx, exists) {
  const edits = [];
  const dead = [];
  const kept = [];
  const lines = text.split(/\r?\n/);

  // ⚠️ 写进文件的新写法必须是**相对该文件自己目录**的——`relPosix` 是仓根相对，用它写出的链解不开
  const relTo = (fromDir, abs) => toPosix(relative(fromDir, abs));
  const isHtml = ctx.isHtml ?? HTML_EXT.has(extname(ctx.fileAbs).toLowerCase());

  /** 目标路径片段 → 新写法（`undefined` = 不动；`null` = 真死链） */
  const remap = (pathPart) => {
    const pathAbs = resolve(dirname(ctx.fileAbs), pathPart);
    if (exists(pathAbs)) return undefined; // 新位置解得开 ⇒ 同深那批，原样成立
    if (ctx.mode === "inside") {
      const oldAbs = resolve(dirname(ctx.oldFileAbs), pathPart);
      if (exists(oldAbs)) return relTo(dirname(ctx.fileAbs), oldAbs); // 旧位置解得开 ⇒ 改指真身
      return null; // 两处都不行 ⇒ 真死链
    }
    // 夹外：文件没动过位置，**目标是搬走的那个夹** ⇒ 只认它，别碰与本案无关的断链
    const inCase = pathAbs === ctx.poolCaseAbs || pathAbs.startsWith(ctx.poolCaseAbs + sep);
    if (!inCase) return undefined;
    const landed = ctx.landedCaseAbs + pathAbs.slice(ctx.poolCaseAbs.length);
    if (!exists(landed)) return null;
    return relTo(dirname(ctx.fileAbs), landed);
  };

  lines.forEach((line, i) => {
    const lineNo = i + 1;
    if (ctx.keeps && ctx.keeps.has(lineNo)) {
      kept.push({ line: lineNo });
      return;
    }
    let out = line;
    let hadDead = false;

    // 腿①：链接（同一套双解析）
    const rawTargets = isHtml
      ? [...linkTargetsInLine(line, false), ...htmlLinkTargetsInLine(line)]
      : linkTargetsInLine(line, false);
    for (const raw of [...new Set(rawTargets)]) {
      const hash = raw.indexOf("#");
      const pathPart = hash >= 0 ? raw.slice(0, hash) : raw;
      const anchor = hash >= 0 ? raw.slice(hash) : "";
      if (!pathPart) continue;
      const next = remap(decodeSafe(pathPart));
      if (next === undefined) continue;
      if (next === null) {
        dead.push({ line: lineNo, target: raw });
        hadDead = true;
        continue;
      }
      const nextRaw = next + anchor;
      if (nextRaw === raw) continue;
      const before = out;
      out = applyPairsToLine(out, raw, nextRaw);
      if (out !== before) edits.push({ line: lineNo, kind: "link", from: raw, to: nextRaw });
    }

    // 腿②：字面串（**只对夹外**——夹内提旧路径多是抬头/历史叙述，改了＝篡改当时）。
    // ⚠️ 本行有**真死链**时整行跳过：那条链的路径片段还在，字面串腿会把刚判死的目标改写成「已落地/…」
    // ——凭空宣称它到了，读数与文件互相打脸（判死＝只报，报的就是原文）。
    if (ctx.mode === "outside" && !hadDead && ctx.stringFrom && out.includes(ctx.stringFrom)) {
      const n = out.split(ctx.stringFrom).length - 1;
      out = out.split(ctx.stringFrom).join(ctx.stringTo);
      edits.push({ line: lineNo, kind: "string", from: ctx.stringFrom, to: ctx.stringTo, count: n });
    }

    lines[i] = out;
  });

  return { text: lines.join("\n"), edits, dead, kept };
}

/** 账本草稿的分桶（照 §归档台账那行的口径，供人直接抄） */
export function bucketOf(rel) {
  if (rel === "docs/04-软件更新/00-README.md") return "顶层 04-软件更新/00-README.md";
  if (rel.startsWith("docs/05-插件更新/")) return "docs/05-插件更新/";
  if (rel.startsWith(`${POOL}/`)) return "池内其余文件";
  if (/^(src|electron|scripts)\//.test(rel)) return "源码与脚本注释指针";
  return "顶层入口与制度档";
}

/* ─────────────────────────── 真文件系统那一侧 ─────────────────────────── */

function git(...args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: (r.stderr ?? "").trim() };
}

function readText(abs) {
  const buf = readFileSync(abs);
  if (buf.subarray(0, 8000).includes(0)) return null; // 二进制，一个字节都不碰
  let s;
  try {
    s = new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return null; // 不是合法 UTF-8 —— 当二进制
  }
  const hasBom = s.charCodeAt(0) === 0xfeff;
  return { bom: hasBom ? "\ufeff" : "", text: hasBom ? s.slice(1) : s };
}

function writeText(abs, bom, text) {
  writeFileSync(abs, bom + text, "utf8"); // 逐字符原样写回 ⇒ 行尾（CRLF/LF）不被归一
}

function collectFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) collectFiles(p, out);
    else out.push(p);
  }
  return out;
}

/** 该文件的候选链接目标（markdown 式走门禁那把尺子；`.html` 另加 `href`/`src`） */
function targetsOf(abs) {
  const out = fileLinkTargets(abs);
  if (HTML_EXT.has(extname(abs).toLowerCase())) {
    readFileSync(abs, "utf8")
      .split(/\r?\n/)
      .forEach((l, i) => {
        for (const raw of htmlLinkTargetsInLine(l)) out.push({ line: i + 1, target: raw });
      });
  }
  return out;
}

/** 某文件里「解析不开」的链接（搬完复验用——与门禁同一判据） */
function unresolved(abs) {
  const bad = [];
  for (const { line, target } of targetsOf(abs)) {
    const hash = target.indexOf("#");
    const pathPart = hash >= 0 ? target.slice(0, hash) : target;
    if (!pathPart) continue;
    if (!has(resolve(dirname(abs), decodeSafe(pathPart)))) bad.push({ line, target });
  }
  return bad;
}

/** 搬：先试整夹（快、rename 一次成），被拒（Windows 句柄）⇒ 逐文件；子夹必须先建 */
function moveCase(srcAbs, dstAbs, isDir, log) {
  if (git("mv", relPosix(srcAbs), relPosix(dstAbs)).ok) {
    log.method = "整夹 git mv（一次成功）";
    return;
  }
  const firstErr = git("mv", relPosix(srcAbs), relPosix(dstAbs)).err;
  const files = isDir ? collectFiles(srcAbs) : [srcAbs];
  for (const f of files) {
    const target = isDir ? join(dstAbs, relative(srcAbs, f)) : dstAbs;
    mkdirSync(dirname(target), { recursive: true }); // ⚠️ find 式循环不会建中间子夹，漏了＝静默全败
    const r = git("mv", relPosix(f), relPosix(target));
    if (!r.ok) die(`git mv 失败（${relPosix(f)}）：${r.err}`);
  }
  log.method = `逐文件 git mv ${files.length} 件（整夹被拒：${firstErr.split("\n")[0]}）`;
  log.movedFiles = files.length;
}

/** 清掉搬空留下的目录（git 不跟踪目录，遗留空夹会被 `check-empty-dirs` 判红） */
function pruneEmptyDirs(dirAbs, removed = []) {
  if (!has(dirAbs) || !statSync(dirAbs).isDirectory()) return removed;
  for (const e of readdirSync(dirAbs, { withFileTypes: true })) {
    if (e.isDirectory()) pruneEmptyDirs(join(dirAbs, e.name), removed);
  }
  if (readdirSync(dirAbs).length === 0) {
    rmdirSync(dirAbs);
    removed.push(relPosix(dirAbs));
    const parent = dirname(dirAbs);
    pruneEmptyDirs(parent, removed);
  }
  return removed;
}

/* ─────────────────────────── 主流程 ─────────────────────────── */

function usage() {
  console.error(
    [
      "用法：node scripts/archive-case.mjs <案名> [--apply] [--keep <rel>:<line>[,…]]",
      "      node scripts/archive-case.mjs --self-test",
      "",
      "  默认**干跑**（只读，打印计划与读数——夹内按「搬完」的样子仿真）；`--apply` 才搬与改。",
      "  `--keep <rel>:<line>` = 有意保留的旧路径点（如历史叙述），读数单列、不报残留。",
    ].join("\n"),
  );
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) process.exit(runSelfTest());
  if (argv.length === 0) return usage();

  const APPLY = argv.includes("--apply");
  const ALLOW_DIRTY = argv.includes("--allow-dirty-index");
  const keeps = new Set();
  let caseArg = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--keep") {
      for (const v of (argv[i + 1] ?? "").split(",")) if (v.trim()) keeps.add(v.trim());
      i++;
      continue;
    }
    if (a.startsWith("--")) continue;
    caseArg = a;
  }
  if (!caseArg) return usage();

  const caseName = toPosix(caseArg).replace(/\/+$/, "").split("/").pop();
  const poolCaseAbs = resolve(ROOT, POOL, caseName);
  const landedCaseAbs = resolve(ROOT, LANDED, caseName);
  const caseRel = `${POOL}/${caseName}`;

  /* ── 前置 0：工具自测（判据自己先过一遍——⛔ 判据坏了绝不许动仓） ──
     这就是「自测挂门禁」的等价物，但档位更靠前：门禁是进了 CI 才拦，这里是**写盘前**就拦
     ——⛔ 不把它塞进 `npm run check` 那条链（package.json 是并行案在动的文件，混进去＝同笔混装）。 */
  if (runSelfTest({ quiet: true }) !== 0) {
    die("脚本自测未过（跑 `node scripts/archive-case.mjs --self-test` 看逐例读数）——拒绝执行。");
  }

  /* ── 前置：三个拒跑条件 ── */
  if (has(landedCaseAbs)) die(`目标已存在：${LANDED}/${caseName} —— 看起来已经归档过了，拒绝覆盖。`);
  if (!has(poolCaseAbs)) die(`源不存在：${caseRel} —— 池里没有这一件（案名拼错了？）。`);
  const staged = git("diff", "--cached", "--name-only");
  if (APPLY && staged.ok && staged.out && !ALLOW_DIRTY) {
    die(`index 不干净（${staged.out.split("\n").length} 项已 staged）——\`git mv\` 会写 index，`
      + `与别人 staged 的改动混进同一笔提交就拆不开了。先收口/暂存自便，或显式 \`--allow-dirty-index\`。`);
  }
  if (!APPLY && staged.ok && staged.out) {
    console.log(`⚠️ index 里已有 ${staged.out.split("\n").length} 项 staged 改动（干跑只读，无妨；--apply 会被本闸拦住）`);
  }

  const isDir = statSync(poolCaseAbs).isDirectory();
  console.log(`\n📦 归档 ${caseName}${isDir ? "/（整夹）" : "（单文件）"}：${caseRel} → ${LANDED}/${caseName}`);
  console.log(ALLOW_DIRTY && staged.out ? "⚠️ --allow-dirty-index：index 里本来就有 staged 改动，提交时会混在一起。" : "");
  console.log(APPLY ? "🟢 --apply：真搬 ＋ 真改\n" : "🔎 干跑（只读）——加 --apply 才落笔\n");

  /* ── 已知「真死链」基线（搬之前就该报的，与本案无关的那批） ── */
  const deadBefore = new Set();
  const scanTree = isDir ? collectFiles(poolCaseAbs) : [poolCaseAbs];
  for (const f of scanTree) {
    if (!TEXT_EXT.has(extname(f).toLowerCase())) continue;
    for (const b of unresolved(f)) deadBefore.add(`${toPosix(relative(poolCaseAbs, f))}:${b.line}:${b.target}`);
  }

  /* ── 一、搬 ── */
  const moveLog = {};
  if (APPLY) {
    moveCase(poolCaseAbs, landedCaseAbs, isDir, moveLog);
    console.log(`① 搬件：${moveLog.method}`);
  } else {
    console.log(`① 搬件：${isDir ? collectFiles(poolCaseAbs).length : 1} 件（干跑未搬）`);
  }
  /* ── 二、夹内修复（只改链接） ──
     干跑＝**仿真**：文件还在池里，但按「搬完」的样子判存在性——夹内那份随夹搬走，夹外一律不动
     （少了这层，干跑会把「搬完就解得开的兄弟链」误判成要改）。 */
  const simExists = (abs) => {
    if (abs === poolCaseAbs || abs.startsWith(poolCaseAbs + sep)) return false; // 源已空
    if (abs === landedCaseAbs || abs.startsWith(landedCaseAbs + sep)) {
      return has(poolCaseAbs + abs.slice(landedCaseAbs.length)); // 同相对位置在池里的那份
    }
    return has(abs);
  };
  const existsNow = APPLY ? has : simExists;
  const scanRootAbs = APPLY ? landedCaseAbs : poolCaseAbs;
  const newPathOf = (abs) => (APPLY ? abs : resolve(landedCaseAbs, relative(poolCaseAbs, abs)));
  const oldPathOf = (abs) => (APPLY ? resolve(poolCaseAbs, relative(landedCaseAbs, abs)) : abs);

  const insideFiles = isDir ? collectFiles(scanRootAbs) : [scanRootAbs];
  const insideEdits = [];
  const insideDead = [];
  const insideKept = [];
  for (const abs of insideFiles) {
    const ext = extname(abs).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    const newAbs = newPathOf(abs);
    const rel = relPosix(newAbs);
    const doc = readText(abs); // 干跑读池里那份（内容同一份）
    if (!doc) continue;
    const ctx = {
      fileAbs: newAbs,
      oldFileAbs: oldPathOf(abs),
      mode: "inside",
      isHtml: HTML_EXT.has(ext),
      poolCaseAbs,
      landedCaseAbs,
      caseName,
      keeps,
    };
    const r = repairText(doc.text, ctx, existsNow);
    if (r.edits.length > 0) {
      insideEdits.push({ rel, edits: r.edits });
      if (APPLY) writeText(abs, doc.bom, r.text);
    }
    for (const d of r.dead) insideDead.push({ rel, ...d });
    for (const k of r.kept) insideKept.push({ rel, ...k });
  }
  const insideCount = insideEdits.reduce((n, e) => n + e.edits.length, 0);
  console.log(`② 夹内：改动 ${insideCount} 处（仅链接）/ ${insideEdits.length} 文件`
    + `${insideDead.length ? `；真死链 ${insideDead.length} 处（只报）` : ""}`);
  for (const e of insideEdits) {
    for (const it of e.edits) console.log(`     ${e.rel}:${it.line}  ${it.from} → ${it.to}`);
  }
  for (const d of insideDead) console.log(`     🔴 真死链 ${d.rel}:${d.line} → ${d.target}（两处都解不开，只报不改）`);

  /* ── 三、夹外回填（链接腿 ＋ 字面串腿；跳过夹内文件本身） ── */
  const isCaseFile = (rel) =>
    rel === caseRel || rel.startsWith(`${caseRel}/`) // 池里（干跑时它还在池）
    || rel === `${LANDED}/${caseName}` || rel.startsWith(`${LANDED}/${caseName}/`); // 已搬（--apply 后）
  const tracked = (git("ls-files").out || "").split(/\r?\n/).filter(Boolean);
  const outsideEdits = [];
  const outsideKept = [];
  const touched = [];
  for (const rel of tracked) {
    const ext = extname(rel).toLowerCase();
    if (!TEXT_EXT.has(ext)) continue;
    if (isCaseFile(rel)) continue; // 夹内走上面那条腿
    const abs = resolve(ROOT, rel);
    const doc = readText(abs);
    if (!doc) continue;
    const ctx = {
      fileAbs: abs,
      oldFileAbs: abs,
      mode: "outside",
      isHtml: HTML_EXT.has(ext),
      poolCaseAbs,
      landedCaseAbs,
      stringFrom: `待抉择池/${caseName}`,
      stringTo: `已落地/${caseName}`,
      caseName,
      keeps,
    };
    const r = repairText(doc.text, ctx, existsNow);
    for (const k of r.kept) outsideKept.push({ rel, ...k });
    if (r.edits.length === 0) continue;
    const sites = r.edits.reduce((n, e) => n + (e.count ?? 1), 0);
    outsideEdits.push({ rel, edits: r.edits, sites });
    touched.push(rel);
    if (APPLY) writeText(abs, doc.bom, r.text);
  }
  const outsideSites = outsideEdits.reduce((n, e) => n + e.sites, 0);
  console.log(`③ 夹外入链回填：${outsideEdits.length} 文件 / ${outsideSites} 处`
    + `${outsideKept.length ? `（另有 ${outsideKept.length} 处按 --keep 有意保留）` : ""}`);

  /* ── 四、清空目录 ── */
  let pruned = [];
  if (APPLY) pruned = pruneEmptyDirs(poolCaseAbs);
  console.log(`④ 空目录清理：${APPLY ? `${pruned.length} 个（${pruned.join(" · ") || "无"}）` : "干跑未做"}`);

  /* ── 五、复验：搬完还有没有断链？ ── */
  console.log("\n⑤ 复验");
  const deadAfter = [];
  const stillThere = [];
  const rootNow = scanRootAbs;
  const rootFiles = isDir ? collectFiles(rootNow) : [rootNow]; // ⚠️ 单文件案：别对文件 readdir（ENOTDIR）
  for (const f of rootFiles) {
    if (!TEXT_EXT.has(extname(f).toLowerCase())) continue;
    for (const b of unresolved(f)) {
      const key = `${toPosix(relative(rootNow, f))}:${b.line}:${b.target}`; // 与搬前基线同一命名空间
      deadAfter.push({ key, file: relPosix(f), line: b.line, target: b.target });
      if (deadBefore.has(key)) stillThere.push(key);
    }
  }
  const fresh = deadAfter.filter((d) => !deadBefore.has(d.key));
  const residualStrings = APPLY ? scanResidualStrings(caseName, keeps) : [];
  if (APPLY) {
    for (const leg of [
      ["check-doc-links", ["node", "scripts/check-doc-links.mjs"]],
      ["check-empty-dirs", ["node", "scripts/check-empty-dirs.mjs"]],
    ]) {
      const r = spawnSync(leg[1][0], leg[1].slice(1), { cwd: ROOT, encoding: "utf8" });
      console.log(`   ${r.status === 0 ? "✅" : "🔴"} ${leg[0]} EXIT=${r.status}`
        + (r.status === 0 ? "" : `\n${(r.stdout + r.stderr).split("\n").slice(-6).join("\n")}`));
    }
  } else {
    console.log("   （干跑未跑门禁；--apply 后会跑 check-doc-links ＋ check-empty-dirs）");
  }
  console.log(`   夹内仍断链接 ${deadAfter.length} 处${deadBefore.size ? `（其中 ${stillThere.length} 处是搬之前就有的真死链）` : ""}`);
  for (const d of deadAfter) console.log(`     ${d.file}:${d.line} → ${d.target}`);
  console.log(`   全树残留旧路径串（\`待抉择池/${caseName}\`）：${APPLY ? residualStrings.length : "（干跑未扫）"} 处`);
  for (const s of residualStrings) console.log(`     ${s.rel}:${s.line}`);

  /* ── 六、账本草稿 ＋ 提交建议 ── */
  printLedgerDraft({ caseName, isDir, moveLog, APPLY, insideEdits, insideCount, outsideEdits, outsideSites, outsideKept, pruned, keeps, caseRel });
  printNextSteps({ caseName, touched, landedCaseAbs, isDir, outsideEdits, deadAfter });

  process.exit(fresh.length > 0 ? 1 : 0);
}

/** 全树残留旧路径串（`--keep` 的点单列） */
function scanResidualStrings(caseName, keeps) {
  const needle = `待抉择池/${caseName}`;
  const out = [];
  for (const rel of (git("ls-files").out || "").split(/\r?\n/).filter(Boolean)) {
    if (!TEXT_EXT.has(extname(rel).toLowerCase())) continue;
    const doc = readText(resolve(ROOT, rel));
    if (!doc) continue;
    doc.text.split(/\r?\n/).forEach((l, i) => {
      if (l.includes(needle) && !keeps.has(`${rel}:${i + 1}`)) out.push({ rel, line: i + 1 });
    });
  }
  return out;
}

function printLedgerDraft(x) {
  const bucketMap = new Map();
  for (const e of x.outsideEdits) {
    const b = bucketOf(e.rel);
    const cur = bucketMap.get(b) ?? { files: 0, sites: 0 };
    cur.files += 1;
    cur.sites += e.sites;
    bucketMap.set(b, cur);
  }
  const buckets = [...bucketMap.entries()].map(([b, v]) => `${b} ${v.files} 文件 ${v.sites} 处`).join(" · ");
  const date = new Date().toISOString().slice(0, 10);
  const nm = x.isDir ? `${x.caseName}/` : x.caseName; // 台账两列的写法：整夹带 `/`、单文件不带
  const insidePhrase = x.insideCount > 0 ? `夹内改动 ${x.insideCount} 处＝…（逐条补）` : "夹内改动 0 处";
  console.log("\n📒 台账行草稿（照 已落地/00-README.md §归档台账 抄；⚠️「所随发版」栏要人填/核）");
  console.log(
    `| ${nm} | ${nm} | ⏳ **未发版**（…待填：壳走攒批 / 随 vX.Y.Z 出货；插件轴与 npm 轴是否已发） | `
    + `${date} 归档笔（${x.moveLog.method ?? "干跑"}；${insidePhrase}；`
    + `**夹外入链同笔回填 ${x.outsideEdits.length} 文件 / ${x.outsideSites} 处**＝${buckets}；`
    + `空目录清理 ${x.pruned.length} 个；\`check-doc-links\` 复验 …；本台账 1 行；`
    + `**有意保留旧路径 ${x.outsideKept.length + x.keeps.size} 处**${x.outsideKept.length || x.keeps.size ? "（历史叙述）" : ""}） |`,
  );
  if (x.outsideKept.length) {
    console.log("   有意保留的点：");
    for (const k of x.outsideKept) console.log(`     ${k.rel}:${k.line}`);
  }
}

function printNextSteps(x) {
  const codeTouched = x.touched.filter((r) => /^(src|electron|scripts)\//.test(r));
  console.log("\n🧭 接下来（人做——工具只报不代做）");
  console.log("   1. 池表行改销账状态 ＋ 该行档案链改指已落地；`04-软件更新/00-README.md` §四 添销账行");
  console.log("   2. `已落地/00-README.md` §归档台账 加 1 行（上面那份草稿）");
  console.log("   3. `CLAUDE.md` 进度行改「最近收口」＋ 其它指向本夹的入口（`AGENTS.md` 等）——回填已覆盖，只需核对措辞");
  console.log("   4. **插件侧那一半**照 §附三「各回各家」归还各插件仓 `docs/<案名>/`（⛔ 不回壳仓 已落地/、⛔ 不混装）");
  console.log("   5. `npm run check`（🔥 全量；⚠️ 别用管道 `| tail` 读结果——退出码会被 tail 吃掉）");
  if (x.deadAfter.length) console.log("   6. 上面那些「仍断」逐条判：真死链就地修 / 与本案无关的另立案");
  console.log("\n【提交建议】⛔ 只 add 本波文件（下面这行的路径清单就是本波全部）");
  const paths = [`${LANDED}/${x.caseName}`, ...x.touched];
  console.log("  git add -A -- \\\n    " + [...new Set(paths)].map((p) => `"${p}"`).join(" \\\n    "));
  console.log('  git commit -m "chore(归档): 「' + x.caseName + '」销账归档——整夹 git mv ＋ 夹外入链回填" \\');
  console.log('    -m "所随发版：⏳ 未发版（去向=…）" -m "读数：check-doc-links 绿；npm run check EXIT=0"');
  if (codeTouched.length) {
    console.log(`  ⚠️ 其中 ${codeTouched.length} 个文件在 \`src/\`·\`electron/\`·\`scripts/\` —— 注释-only 走 commit-msg 闸的`
      + "注释豁免（写 `docs:` 放行）；若是**真代码**改动，那属软件轴，得按 feat/fix 分类。");
  }
  console.log("  https_proxy=http://127.0.0.1:7890 http_proxy=http://127.0.0.1:7890 git push origin electron");
}

/* ─────────────────────────── 自测 ─────────────────────────── */

/**
 * 每一例都**真跑判据、断言实得结果**（⛔ 「应该这样」不算证据）。存在性全部走**注入的假 exists**，
 * 故不需要真文件系统、不碰仓库的 `docs/`。
 * 最后一例是**反例**：钉住 2026-10-06 那版判错对象的扫描器（只测 `待抉择池/` 前缀 ⇒ 对已指空的
 * 目标给假 0）——本实现按**解析后的真身**判，必须报出那 1 处死链。
 */
function runSelfTest({ quiet = false } = {}) {
  let bad = 0;
  let total = 0;
  const tmp = mkdtempSync(join(tmpdir(), "archive-case-selftest-"));
  try {
    const POOLC = resolve(tmp, POOL, "本案");
    const LAND = resolve(tmp, LANDED, "本案");
    const baseCtx = (over = {}) => ({
      fileAbs: resolve(tmp, LANDED, "本案", "00-README.md"),
      oldFileAbs: resolve(tmp, POOL, "本案", "00-README.md"),
      mode: "inside",
      isHtml: false,
      poolCaseAbs: POOLC,
      landedCaseAbs: LAND,
      caseName: "本案",
      keeps: new Set(),
      ...over,
    });
    const probe = (text, ctx, existsPaths) => {
      const set = new Set(existsPaths.map((p) => resolve(tmp, p)));
      const r = repairText(text, ctx, (abs) => set.has(abs));
      return {
        n: r.edits.length,
        detail: r.edits.map((e) => `${e.kind} L${e.line}: ${e.from} → ${e.to}`).join(" | "),
        text: r.text,
        dead: r.dead.length,
        deadDetail: r.dead.map((d) => `L${d.line}:${d.target}`).join(" | "),
        kept: r.kept.length,
      };
    };
    const eq = (tag, pass, extra = "") => {
      total++;
      if (pass) {
        if (!quiet) console.log(`✅ ${tag}${extra ? ` —— ${extra}` : ""}`);
      } else {
        bad++;
        console.log(`🔴 ${tag}${extra ? ` —— ${extra}` : ""}`); // 失败**永远**出声，quiet 也不吞
      }
    };

    // ── 夹内（mode: inside） ──
    let r = probe("- [菜单补全](../菜单补全.md)\n", baseCtx(), [`${POOL}/菜单补全.md`]);
    eq("夹内①：兄弟链（新位置解不开、旧位置解得开）⇒ 改指 ../../待抉择池/…", r.n === 1 && r.text.includes("](../../待抉择池/菜单补全.md)"), r.detail);

    r = probe("- [主案](../../待抉择池/菜单补全.md)\n", baseCtx(), [`${POOL}/菜单补全.md`]);
    eq("夹内②：`../../` 及以上链原样成立（同深）⇒ 0 改动", r.n === 0, r.detail || "无改动");

    r = probe("- [没了](../根本不存在.md)\n", baseCtx(), []);
    eq("夹内③：两处都解不开 ⇒ **真死链，只报不改**", r.n === 0 && r.dead === 1 && r.text.includes("](../根本不存在.md)"), r.deadDetail);

    r = probe("> 本档原住 docs/04-软件更新/待抉择池/本案/ —— 抬头叙述\n", baseCtx(), []);
    eq("夹内④：字面串**不改**（抬头/历史叙述，改了＝篡改当时）", r.n === 0, r.detail || "无改动");

    r = probe("标题：本案\n- [x](../菜单补全.md)\n", baseCtx(), [`${POOL}/菜单补全.md`]);
    eq("夹内⑤：夹内**也不**跑字面串腿（本行同时含案名与链接）", r.n === 1 && !r.text.includes("已落地/本案"), r.detail);

    // ── 夹外（mode: outside，三种写法） ──
    const outCtx = (rel, over = {}) =>
      baseCtx({
        fileAbs: resolve(tmp, rel),
        oldFileAbs: resolve(tmp, rel),
        mode: "outside",
        stringFrom: "待抉择池/本案",
        stringTo: "已落地/本案",
        ...over,
      });
    const outExists = [`${LANDED}/本案/00-README.md`, `${LANDED}/本案/06-组件户口与组合纪律.md`];

    r = probe(
      "- [案](../../../docs/04-软件更新/待抉择池/本案/00-README.md)\n",
      outCtx("docs/05-插件更新/某插件/00-README.md"),
      outExists,
    );
    eq("夹外①：仓根相对（链接腿）⇒ 改指已落地", r.n === 1 && r.text.includes("(../../04-软件更新/已落地/本案/00-README.md)"), r.detail);

    r = probe("- [案](待抉择池/本案/00-README.md)\n", outCtx("docs/04-软件更新/某档.md"), outExists);
    eq("夹外②：从夹外往回写的相对链 ⇒ 按真身重算相对路径", r.n === 1 && r.text.includes("(已落地/本案/00-README.md)"), r.detail);

    r = probe("指针见 待抉择池/本案/06-组件户口与组合纪律.md 一节\n", outCtx("CLAUDE.md"), outExists);
    eq("夹外③：池内平写（**字面串腿**）⇒ 改已落地", r.n === 1 && r.text.includes("已落地/本案/06-组件户口与组合纪律.md"), r.detail);

    r = probe("- [无关的断链](./根本不存在.md)\n", outCtx("CLAUDE.md"), outExists);
    eq("夹外④：与本案无关的断链 ⇒ 不碰、不报（不是它的活）", r.n === 0 && r.dead === 0, r.detail || "无改动");

    r = probe("见 docs/04-软件更新/待抉择池/本案/00-README.md\n", outCtx("CLAUDE.md", { keeps: new Set([1]) }), outExists);
    eq("夹外⑤：`--keep <file>:<line>` ⇒ 有意保留，读数单列", r.n === 0 && r.kept === 1, `保留 ${r.kept} 处`);

    // ── html（mockup 两种形态） ──
    r = probe('<a href="../待抉择池/本案/00-README.md">案</a>\n', outCtx("docs/04-软件更新/某某/mock.html", { isHtml: true }), outExists);
    eq("html①：`href` 形态也认（mockup 是 .html）", r.n === 1 && r.text.includes('href="../已落地/本案/00-README.md"'), r.detail);

    r = probe("设计图见 [方案](../待抉择池/本案/00-README.md)\n", outCtx("docs/04-软件更新/某某/mock.html", { isHtml: true }), outExists);
    eq("html②：`.html` 里的 markdown 式链接同样认", r.n === 1, r.detail);

    // ── 正控：这些不算引用 ──
    r = probe("- [外链](https://example.com/本案.md)\n- [锚](#本案)\n- 示例：`[x](本案.md)`\n", baseCtx(), []);
    eq("正控：外链 / 纯锚点 / 行内代码里的示例 ⇒ 0 改动", r.n === 0 && r.dead === 0, r.detail || "无改动");

    // ── 🔴 反例：钉住「只测前缀」的假 0 ──
    const naivePrefixHit = "- [案](../../../docs/04-软件更新/待抉择池/本案/已删.md)\n".includes("待抉择池/本案");
    r = probe("- [案](../../../docs/04-软件更新/待抉择池/本案/已删.md)\n", outCtx("docs/05-插件更新/某插件/00-README.md"), outExists);
    eq(
      "🔴 反例：只测「有没有 待抉择池/ 前缀」⇒ 假 0（前缀确实在）；本实现按**解析后真身**判 ⇒ 报 1 处死链"
        + "（且整行不跑字面串腿——判死就只报原文）",
      naivePrefixHit === true && r.dead === 1 && r.n === 0 && r.text.includes("待抉择池/本案/已删.md"),
      `前缀匹配=${naivePrefixHit}，本实现报死链 ${r.dead} 处、改动 ${r.n} 处`,
    );

    // ── 分桶（账本草稿口径） ──
    const bk = [
      ["docs/04-软件更新/00-README.md", "顶层 04-软件更新/00-README.md"],
      ["docs/05-插件更新/PDF阅读器插件/00-README.md", "docs/05-插件更新/"],
      [`${POOL}/菜单补全.md`, "池内其余文件"],
      ["src/components/x.tsx", "源码与脚本注释指针"],
      ["CLAUDE.md", "顶层入口与制度档"],
    ];
    const bkBad = bk.filter(([rel, want]) => bucketOf(rel) !== want);
    eq("分桶：5 类路径各自落对桶（账本行可直接抄）", bkBad.length === 0, bkBad.map(([rel, w]) => `${rel}→${bucketOf(rel)}≠${w}`).join(" | ") || "5/5");

    if (bad === 0 && total < 15) {
      bad++;
      console.log(`🔴 用例数 ${total} < 15——用例被删了？自测缩水不许放行`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  const summary = bad === 0
    ? `✅ archive-case self-test 全过（${total} 例）`
    : `🔴 archive-case self-test ${bad} 例不符`;
  console.log(quiet ? `   ${summary}` : `\n${summary}`);
  return bad === 0 ? 0 : 1;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
