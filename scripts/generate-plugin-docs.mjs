#!/usr/bin/env node
/**
 * 作者面文档 npm 包 —— `@linkdesk/plugin-docs` 的**生成器**（E6#105l）。
 *
 * 出处（唯一真源，本文不重述判据）：`docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/11-作者面文档收口.md` §七。
 *
 * 形态（复用 `@linkdesk/contracts` 的成熟模式，零新机制）：
 *
 *     真源   docs/03-插件制造/**            ← 手工只改这一份
 *       ↓ 本脚本
 *     产物   packages/plugin-docs/docs/**
 *       ↓ `--check`
 *     判据   与磁盘逐字节比对（**链接重写处除外**，规则见下）；不等 ⇒ exit 1
 *
 * 🔴 **唯一的改写规则（显式登记——加规则必须写在这张表里）**
 *   作者面文档会指到目录外的**作者真该看的东西**（API 契约 / 工具链 / 主题变量契约…）。
 *   在 GitHub 上点得通，在 npm 包里点不通 ⇒ 生成时把它们**绝对化**成 GitHub 链接：
 *
 *     `../02-Electron架构/…`（出 docs/03-插件制造 的相对路径）
 *        → `https://github.com/Encaron/linkdesk/blob/electron/docs/02-Electron架构/…`
 *
 *   落点无扩展名 = 目录 ⇒ 用 `/tree/`（如 `packages/plugin-sdk`）；有扩展名 = 文件 ⇒ 用 `/blob/`。
 *   锚点（`#…`）原样保留。**界内链接（仍在 docs/03-插件制造/ 里）一律不动**——包内点得通。
 *
 * ⚠️ 只改**正文里的 markdown 链接**：围栏代码块与行内代码里的 `[x](y)` 是示例文本，不碰。
 *    （判据与 `check-author-docs-links.mjs` 同源：两处的"什么算链接"必须一致，否则新门禁
 *     会在生成物上假阳性。）
 *
 * 用法：
 *   node scripts/generate-plugin-docs.mjs              # 生成/刷新产物
 *   node scripts/generate-plugin-docs.mjs --check      # 只比对（挂 npm run check）：不一致 ⇒ exit 1
 *   node scripts/generate-plugin-docs.mjs --self-test  # 规则自测（五条改写规则）
 * 退出码 0 = 一致/自测过，1 = 不一致（打印到 stderr）。
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SRC_DIR = join(ROOT, "docs", "03-插件制造");
const DEST_DIR = join(ROOT, "packages", "plugin-docs", "docs");
/** 在线锚（11 号档案 §二 Y7） */
const REPO_URL = "https://github.com/Encaron/linkdesk";
const BRANCH = "electron";

/** 递归列文件（相对 base 的 posix 路径，排序稳定） */
function listFiles(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) listFiles(full, base, out);
    else out.push(relative(base, full).split("\\").join("/"));
  }
  return out.sort();
}

/** 把出界相对链接绝对化（围栏块与行内代码不碰） */
export function rewriteOutboundLinks(text) {
  const FENCE = /(^[ \t]*(?:```|~~~)[\s\S]*?^[ \t]*(?:```|~~~)[ \t]*$)/m;
  return text
    .split(FENCE)
    .map((seg, i) => {
      if (i % 2 === 1) return seg; // 围栏块原样
      return seg
        .split(/(`[^`\n]*`)/)
        .map((piece, j) => {
          if (j % 2 === 1) return piece; // 行内代码原样
          return piece.replace(/\]\(([^)\s]+)((?:\s+"[^"]*")?)\)/g, (full, target, tail) => {
            if (/^(https?:|mailto:|tel:|#|\/)/i.test(target)) return full;
            const [pathPart, anchor] = target.split("#");
            // 🔴 出界判定走**绝对路径**解析：path.relative 会把相对参数按 CWD 解析，
            //    直接喂 `../x` 这种相对串会算错层级（本脚本的自测就是为这条存在的）。
            const abs = resolve(SRC_DIR, pathPart);
            if (!relative(SRC_DIR, abs).startsWith("..")) return full; // 界内不动
            const repoRel = relative(ROOT, abs).split("\\").join("/");
            const kind = /\.[a-z0-9]+$/i.test(repoRel) ? "blob" : "tree";
            return `](${REPO_URL}/${kind}/${BRANCH}/${repoRel}${anchor ? "#" + anchor : ""}${tail})`;
          });
        })
        .join("");
    })
    .join("");
}

/** 生成内容（Map<相对路径, 文本>） */
export function build() {
  const out = new Map();
  for (const rel of listFiles(SRC_DIR)) {
    const raw = readFileSync(join(SRC_DIR, rel), "utf8");
    out.set(rel, rel.endsWith(".md") ? rewriteOutboundLinks(raw) : raw);
  }
  return out;
}

function writeAll(files) {
  rmSync(DEST_DIR, { recursive: true, force: true });
  for (const [rel, text] of files) {
    const p = join(DEST_DIR, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, text, "utf8");
  }
}

function check(files) {
  const problems = [];
  if (!existsSync(DEST_DIR)) problems.push("产物目录不存在（先跑 npm run docs:build）");
  else {
    const onDisk = listFiles(DEST_DIR);
    const expected = [...files.keys()];
    for (const rel of expected) if (!onDisk.includes(rel)) problems.push(`缺文件：${rel}`);
    for (const rel of onDisk) if (!expected.includes(rel)) problems.push(`多文件：${rel}`);
    for (const rel of expected) {
      if (!onDisk.includes(rel)) continue;
      if (readFileSync(join(DEST_DIR, rel), "utf8") !== files.get(rel)) problems.push(`内容不一致：${rel}`);
    }
  }
  if (problems.length > 0) {
    console.error(`\n❌ [plugin-docs] 产物与真源不一致（${problems.length} 处）：\n`);
    for (const p of problems.slice(0, 30)) console.error("  " + p);
    console.error("\n  真源 = docs/03-插件制造/** · 产物 = packages/plugin-docs/docs/**");
    console.error("  修法：npm run docs:build（改了真源就必须重生成，同 contracts 的纪律）\n");
    process.exit(1);
  }
  console.log(`✅ [plugin-docs] 产物与真源一致（${files.size} 个文件）。`);
}

function selfTest() {
  const sample =
    "正文 [a](../02-Electron架构/x/01.md#锚) 与界内 [b](17-区域地图.md)。\n\n```\n示例 [c](../02-Electron架构/y/02.md)\n```\n行内 `[d](../02-Electron架构/z/03.md)` 结束。";
  const got = rewriteOutboundLinks(sample);
  const want = "](https://github.com/Encaron/linkdesk/blob/electron/docs/02-Electron架构/x/01.md#锚)";
  const checks = [
    ["出界相对链接绝对化（含锚点保留）", got.includes(want)],
    ["界内链接不动", got.includes("](17-区域地图.md)")],
    ["围栏代码块里的示例链接不碰", got.includes("示例 [c](../02-Electron架构/y/02.md)")],
    ["行内代码里的示例链接不碰", got.includes("`[d](../02-Electron架构/z/03.md)`")],
    [
      "目录落点用 /tree/（无扩展名）",
      rewriteOutboundLinks("[p](../../packages/plugin-sdk)").includes("/tree/electron/packages/plugin-sdk"),
    ],
  ];
  let bad = 0;
  for (const [name, ok] of checks) {
    if (!ok) bad++;
    console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  }
  console.log(`[plugin-docs] self-test 判定：${bad === 0 ? "✓ 五条规则全对" : `✗ FAIL（${bad} 条）`}`);
  return bad === 0 ? 0 : 1;
}

const argv = process.argv.slice(2);
if (argv.includes("--self-test")) process.exit(selfTest());
const files = build();
if (argv.includes("--check")) check(files);
else {
  writeAll(files);
  console.log(`✅ [plugin-docs] 已生成 ${files.size} 个文件 → packages/plugin-docs/docs/`);
}
