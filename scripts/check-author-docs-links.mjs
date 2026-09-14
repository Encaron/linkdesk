#!/usr/bin/env node
/**
 * 作者面文档门禁 ② —— **出界链接必须指向"作者真该看的东西"**（E6#105m）。
 *
 * 出处（唯一真源，本文不重述判据）：`docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/11-作者面文档收口.md`
 * （§〇 读者判定 + §二 Y1/Y7 + §八 两条门禁）。
 *
 * 判据一句话：**`docs/03-插件制造/**` 里的链接，只要落点在 `docs/03-插件制造/` **之外**，
 *   就必须出现在白名单 `scripts/author-docs-outbound-allowlist.txt` 里**，否则红。
 *
 * 为什么需要它：作者面文档长期在往目录外指——实测 48 条出界链接里混着**轮次任务档案**、
 *   壳开发者规范、设计草图。作者（和他的 AI）点进去只会撞上"无法解析的内部坐标"。
 *   这份名单把"哪些外面东西是作者该看的"变成**可审、可追账**的一张表。
 *
 * ## 与 check-doc-links 的分工（别混）
 *  - `check-doc-links.mjs`：**全树**断链（目标不存在就红）。管"**在不在**"。
 *  - 本脚本：**作者面**的出界白名单。管"**该不该**"。
 *    ⇒ 本脚本**不做存在性判断**（那是上面那位的活），只看落点是否出界 + 是否报备。
 *
 * ## 扫描边界
 *  - **扫**：`docs/03-插件制造/**` 下的 `*.md`（含子夹）。
 *  - **不扫**：围栏代码块与行内代码里的 `[x](y)`（那是**示例文本**，不是引用）；
 *    `http(s)://` / `mailto:` / `tel:` / 纯锚点 `#…` / 绝对路径（`/…`）——都不是仓内引用。
 *  - 落点**在** `docs/03-插件制造/` 内（含本目录子夹）= 不出界，本脚本不管。
 *
 * 用法：
 *   node scripts/check-author-docs-links.mjs              # 扫 docs/03-插件制造（挂 npm run check）
 *   node scripts/check-author-docs-links.mjs --self-test  # 负控：未报备的出界 ⇒ 红；报备/界内 ⇒ 绿
 * 退出码 0 = 全部报备，1 = 有未报备的出界链接（打印到 stderr）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, relative, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DOCS_ROOT = join(ROOT, "docs", "03-插件制造");
const SCOPE = relative(ROOT, DOCS_ROOT).replaceAll("\\", "/"); // docs/03-插件制造
const ALLOWLIST = join(__dirname, "author-docs-outbound-allowlist.txt");

/** 读白名单：`<仓根相对路径>\t<理由>`；`#` 起注释 */
export function readAllowlist(path = ALLOWLIST) {
  const entries = [];
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [target, reason] = line.split("\t");
    if (!target || !reason || !reason.trim()) {
      throw new Error(`白名单格式错误（必须「路径<TAB>理由」）：${raw}`);
    }
    entries.push({ target: target.trim().replaceAll("\\", "/").replace(/\/+$/, ""), reason: reason.trim() });
  }
  return entries;
}

function listMarkdown(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listMarkdown(p));
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

/** 去掉围栏代码块与行内代码，只在剩下的正文里找链接 */
export function proseOnly(text) {
  const withoutFences = text.replace(/^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[ \t]*$/gm, "");
  return withoutFences.replace(/`[^`\n]*`/g, "");
}

/** 抽链接目标（`](target)`），过滤非仓内引用 */
export function extractTargets(prose) {
  const targets = [];
  const re = /\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m;
  while ((m = re.exec(prose)) !== null) {
    const t = m[1];
    if (/^(https?:|mailto:|tel:|#|\/)/i.test(t)) continue;
    targets.push(t.replace(/[),.;]+$/, ""));
  }
  return targets;
}

/**
 * @returns {{outbound:{file:string,target:string,resolved:string}[], checked:number}}
 */
export function checkAuthorDocsLinks(docsRoot = DOCS_ROOT, allowlist = readAllowlist()) {
  const allowed = allowlist.map((e) => e.target);
  const outbound = [];
  let checked = 0;
  for (const file of listMarkdown(docsRoot)) {
    const rel = relative(ROOT, file).replaceAll("\\", "/");
    for (const target of extractTargets(proseOnly(readFileSync(file, "utf8")))) {
      checked++;
      const resolved = relative(ROOT, resolve(dirname(file), target.split("#")[0]))
        .replaceAll("\\", "/")
        .replace(/\/+$/, "");
      if (resolved === SCOPE || resolved.startsWith(SCOPE + "/")) continue; // 界内
      const ok = allowed.some((a) => resolved === a || resolved.startsWith(a + "/"));
      if (!ok) outbound.push({ file: rel, target, resolved });
    }
  }
  return { outbound, checked };
}

function main() {
  const allowlist = readAllowlist();
  const { outbound, checked } = checkAuthorDocsLinks(DOCS_ROOT, allowlist);
  if (outbound.length > 0) {
    console.error(`\n❌ [author-docs-links] 作者面文档有未报备的出界链接（${outbound.length} 条）：\n`);
    for (const o of outbound) console.error(`  ${o.file} → ${o.target}\n      落点 ${o.resolved} 不在白名单里`);
    console.error(
      "\n  两条正路：① 这链接该给作者看 ⇒ 加进 scripts/author-docs-outbound-allowlist.txt（**必须写真理由**）" +
        "\n            ② 不该给作者看（内部档案 / 壳开发规范 / 设计草图）⇒ 改成人话，别指。" +
        "\n  判据 → docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/11-作者面文档收口.md §八\n",
    );
    process.exit(1);
  }
  console.log(
    `✅ [author-docs-links] ${checked} 条仓内链接全过；出界链接全部在白名单内（${allowlist.length} 条报备）。`,
  );
}

function selfTest() {
  const docsRel = SCOPE; // docs/03-插件制造
  const cases = [
    { name: "界内", from: `${docsRel}/00-README.md`, target: "17-区域地图.md", resolvesOut: false, flag: false },
    { name: "界内子夹", from: `${docsRel}/主题/01-做一个主题插件.md`, target: "../11-主题制作.md", resolvesOut: false, flag: false },
    { name: "界外已报备（SDK README）", from: `${docsRel}/13-插件开发指南.md`, target: "../../packages/plugin-sdk/README.md", resolvesOut: true, flag: false },
    { name: "界外未报备（内部档案）", from: `${docsRel}/13-插件开发指南.md`, target: "../../docs/02-Electron架构/E6_插件生态与发布/E6-执行清单.md", resolvesOut: true, flag: true },
  ];
  const allowlist = readAllowlist();
  const allowed = allowlist.map((e) => e.target);
  let bad = 0;
  for (const c of cases) {
    const resolved = relative(ROOT, resolve(ROOT, dirname(c.from), c.target))
      .replaceAll("\\", "/")
      .replace(/\/+$/, "");
    const isOut = !(resolved === SCOPE || resolved.startsWith(SCOPE + "/"));
    const passed = allowed.some((a) => resolved === a || resolved.startsWith(a + "/"));
    const flagged = isOut && !passed;
    const ok = isOut === c.resolvesOut && flagged === c.flag;
    if (!ok) bad++;
    console.log(
      `  ${ok ? "✓" : "✗"} ${c.name}: 落点 ${resolved} · 出界=${isOut}（期望 ${c.resolvesOut}）· 未报备被拦=${flagged}`,
    );
  }
  // 代码块里的示例链接不算引用
  const prose = proseOnly("```\n[x](../02-Electron架构/E6_插件生态与发布/E6-执行清单.md)\n```\n正文 `[y](../a/b.md)` 结束\n");
  const inCode = extractTargets(prose).length;
  const okCode = inCode === 0;
  if (!okCode) bad++;
  console.log(`  ${okCode ? "✓" : "✗"} 代码块/行内代码里的示例链接不扫描（命中 ${inCode}，期望 0）`);
  console.log(`[author-docs-links] self-test 判定：${bad === 0 ? "✓ 负控会红、正控会绿" : `✗ FAIL（${bad} 条不符）`}`);
  return bad === 0 ? 0 : 1;
}

if (process.argv.slice(2).includes("--self-test")) process.exit(selfTest());
main();
