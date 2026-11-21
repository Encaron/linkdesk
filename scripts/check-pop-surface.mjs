#!/usr/bin/env node
/**
 * check-pop-surface —— F14 浮起面配方门禁（16 号档平台案 · 2026-11-21 用户拍板）。
 *
 * 判据：**浮起面**（菜单/弹层/下拉/hover 展开层——按类名形态识别）的背景 ⛔ 裸用
 * `--bg-card`／`--bg-input`，必须消费 `--ldk-pop-surface`（ThemeEngine 派生：玻璃态
 * card-solid≥可读下限＋磨砂；非玻璃态 card 原样）。
 *
 * 为什么存在：玻璃主题下 --bg-card 本身半透——裸用 = 用户实测的「透底/双层叠影/下层颜色
 * 糊透」三连（16 号档 F14/F11/F13）。本腿把坑做进门禁：以后自绘浮起面忘接配方，check 直接红，
 * 不用再靠人抓（用户原话：「不能让以后的人把你踩过的坑全踩一遍」）。
 *
 * 浮起面识别（保守白名单式——类名含下列形态之一才判，⛔ 误伤普通面）：
 *   menu / modal / dropdown / popover / popup / -over（hover 展开层）/ float-panel / scrim
 * 消费形态（白名单放行）：`background: var(--ldk-pop-surface)`、渐变含 ldk-pop-surface、
 *   `transparent`（纯透明占位）、`none`。
 *
 * 用法：
 *   node scripts/check-pop-surface.mjs            # 扫默认域（src/styles src/components/shared src/pool）
 *   node scripts/check-pop-surface.mjs --path <dir> [--path <dir> …]   # 扫任意 css 目录（插件仓取证用）
 *   node scripts/check-pop-surface.mjs --self-test                     # 内置用例自测（无需仓库）
 * 退出码：0 绿 / 1 红（含自测失败）。
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SELF_TEST = process.argv.includes("--self-test");
const pathArgs = (() => {
  const i = process.argv.indexOf("--path");
  if (i === -1) return [];
  const out = [];
  for (let k = i + 1; k < process.argv.length; k++) {
    if (process.argv[k].startsWith("--")) break;
    out.push(process.argv[k]);
  }
  return out;
})();

/** 浮起面类名形态（子串匹配，小写）——scrim 不算（刻意半透的暗背板，非可读面） */
const FLOATING_SHAPES = ["menu", "modal", "dropdown", "popover", "popup", "-over", "float-panel"];
/** 违规背景源（裸表面 token——玻璃下半透） */
const RAW_SURFACE_RE = /background(?:-color)?\s*:\s*var\(--(?:bg-card|bg-input)\)/;
/** 非面板本体：交互态与内部件（衬色合法，不判） */
const NOT_PANEL_RE = /:hover|:focus|:active|-item\b|-sep\b|-btn\b/;

const collectCss = (dir, acc = []) => {
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      collectCss(p, acc);
    } else if (e.name.endsWith(".css")) {
      acc.push(p);
    }
  }
  return acc;
};

/** 纯函数：给定 css 文本 → 违规 [{selector, line}]（自测与实跑同一条路） */
export function scanCss(text) {
  // 去注释（/* */ 与 // 行注——CSS 里 // 不合法但防御）
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const violations = [];
  // 内层优先迭代匹配块（@media 嵌套一层也能覆盖）
  let rest = clean;
  for (;;) {
    const m = /([^{}]+)\{([^{}]*)\}/.exec(rest);
    if (!m) break;
    const [whole, selectorRaw, body] = m;
    rest = rest.replace(whole, "");
    const selector = selectorRaw.trim();
    if (selector.startsWith("@")) continue; // @keyframes/@media 头本身非选择器
    const lower = selector.toLowerCase();
    if (!FLOATING_SHAPES.some((s) => lower.includes(s))) continue;
    if (NOT_PANEL_RE.test(lower)) continue; // 交互态/内部件衬色不判
    if (RAW_SURFACE_RE.test(body)) {
      // 同块内若已有 ldk-pop-surface（多声明覆盖）也算违规——后面的声明才生效，前面裸用仍会闪
      const lines = clean.slice(0, clean.indexOf(body)).split("\n").length;
      violations.push({ selector: selector.slice(0, 120), line: lines });
    }
  }
  return violations;
}

function selfTest() {
  const cases = [
    {
      name: "违规：浮起面裸 --bg-card",
      css: ".x-menu { background: var(--bg-card); color: red; }",
      want: 1,
    },
    {
      name: "放行：消费 --ldk-pop-surface",
      css: ".x-menu { background: var(--ldk-pop-surface); backdrop-filter: var(--ldk-pop-blur); }",
      want: 0,
    },
    {
      name: "放行：非浮起面（普通卡）用 --bg-card",
      css: ".x-card { background: var(--bg-card); }",
      want: 0,
    },
    {
      name: "违规：hover 展开层（-over 形态）裸 --bg-input",
      css: ".card-x-over { background: var(--bg-input); }",
      want: 1,
    },
    {
      name: "放行：透明占位",
      css: ".x-modal { background: transparent; }",
      want: 0,
    },
    {
      name: "放行：注释里的 --bg-card 不算",
      css: ".x-menu { /* background: var(--bg-card); */ background: var(--ldk-pop-surface); }",
      want: 0,
    },
    {
      name: "违规：@media 内嵌浮起面",
      css: "@media (max-width: 700px) { .x-dropdown { background: var(--bg-card); } }",
      want: 1,
    },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = scanCss(c.css).length;
    if (got !== c.want) {
      console.error(`  ✘ ${c.name}——期望 ${c.want} 条违规，实际 ${got}`);
      bad++;
    }
  }
  if (bad) {
    console.error(`--self-test ✘ ${bad}/${cases.length} 用例失败`);
    process.exit(1);
  }
  console.log(`--self-test ✔ ${cases.length}/${cases.length} 用例过`);
}

if (SELF_TEST) {
  selfTest();
  process.exit(0);
}

const roots = pathArgs.length
  ? pathArgs
  : ["src/index.css", "src/App.css", "src/components", "src/pool"];
const files = [];
for (const r of roots) {
  try {
    if (statSync(r).isFile()) files.push(r);
    else files.push(...collectCss(r));
  } catch {
    console.error(`路径不存在：${r}`);
    process.exit(1);
  }
}

let total = 0;
for (const f of files) {
  const vs = scanCss(readFileSync(f, "utf8"));
  for (const v of vs) {
    total++;
    console.error(`✘ ${relative(process.cwd(), f)}:${v.line}  ${v.selector}（浮起面裸表面 token）`);
  }
}
if (total) {
  console.error(`\n✘ 浮起面配方门禁：${total} 处违规——浮起面 background 必须消费 var(--ldk-pop-surface)` +
    `（玻璃态由 ThemeEngine 派生；见 16 号档 F14 / 05-插件UI写法规约 §自绘浮起面）`);
  process.exit(1);
}
console.log(`✅ 浮起面配方门禁：${files.length} 个 css 文件零违规（浮起面全部消费 --ldk-pop-* 或放行形态）`);
