#!/usr/bin/env node
/**
 * 宿主 CSS 定义集**运行时清单**生成器（`E6#117` · 第 8.4 轮）。
 *
 * ── 一句话 ──
 * 把「宿主今天定义了哪些类名 / 哪些关键帧名」生成成一份**随包下发的 TS 清单**
 * （`src/core/compat/host-css.generated.ts`），让壳在**运行时**算兼容读数时用与
 * `scripts/plugin-dangling-name-audit.mjs`（格 1 尺子）**同一个宿主定义集**判悬空。
 *
 * ── 🔴 口径单一源（⛔ 本生成器不自采数据）──
 * 全部数据来自 `scripts/lib/host-surface.mjs` 的 `collectHostDefs()`——格 1（尺子）与
 * 格 2（面快照第 ③ 栏）的宿主定义集都由它采集；本生成器是它的**第三个消费方**。
 * 口径原文（动之前先读）：[01-任务-悬空名核验.md §8.2](../docs/02-Electron架构/E6_插件生态与发布/插件兼容机械化/01-任务-悬空名核验.md)——
 *   ① 壳源码树全部 `*.css`（含共享组件单一源码）；② 宿主实际 import 的第三方 CSS（今天只有 codicon）；
 *   ③ `reserved-class-names.json` 的保留关键帧。⛔ 不读 `packages/linkdesk-ui/dist/`（派生物）。
 *
 * ── 与 `gen-host-reserved.mjs` 的关系 ──
 * 同族不同物：那份生成「宿主保留名账」（注册表运行时副本，`src/core/registry/host-reserved.generated.ts`）；
 * 本份生成「宿主 CSS 定义集」（兼容读数的运行时输入）。两者都是「构建期扫描 → 运行时 TS 清单」
 * 的既有模式，但账与面不混装——`host-reserved.json` 的形状由退役账门禁（E6#116）看管，
 * 本清单纯粹是 `collectHostDefs()` 的投影，无人工栏。
 *
 * ── 消费方 ──
 * `src/core/compat/dangling-scan.ts`（运行时悬空扫描腿）——`HOST_CSS_MANIFEST.classes` /
 * `.keyframes` 与格 1 `judge()` 里的 `host.classes` / `host.keyframes` 同名同义。
 *
 * 用法：
 *   node scripts/gen-host-css-manifest.mjs             # 重写生成物
 *   node scripts/gen-host-css-manifest.mjs --check     # 磁盘 == 重算（不一致退出码 1）——check 链成员
 *   node scripts/gen-host-css-manifest.mjs --self-test # 数据形状自检
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { collectHostDefs } from "./lib/host-surface.mjs";

const HERE = fileURLToPath(import.meta.url);
const OUT = new URL("../src/core/compat/host-css.generated.ts", `file://${HERE.replace(/\\/g, "/")}`);

/** file URL pathname（/E:/…）→ 盘上路径（E:/…） */
const fromFileUrlPath = (p) => p.replace(/^\/([A-Za-z]:)/, "$1");

/** 生成物文本（classes / keyframes 排序去重——diff 稳定） */
function render(host) {
  const classes = [...host.classes].sort();
  const keyframes = [...host.keyframes].sort();
  const rel = (f) => relative(process.cwd(), f).split(sep).join("/");
  const genFrom = rel(HERE);
  const head = `/**
 * 宿主 CSS 定义集——**生成物，勿手改**（E6#117）。
 *
 * 生成器：\`scripts/gen-host-css-manifest.mjs\`（数据唯一源 = \`scripts/lib/host-surface.mjs\`
 * 的 \`collectHostDefs()\`——格 1 悬空尺子与格 2 面快照第 ③ 栏的同一采集器）。
 * 口径 = 壳 src 树的全部 .css（含共享组件单一源码）＋ 宿主实际加载的第三方 CSS（codicon）＋
 * \`reserved-class-names.json\` 保留关键帧；⛔ 不含 \`packages/linkdesk-ui/dist/\`（派生物）。
 *
 * 消费方：\`src/core/compat/dangling-scan.ts\`（运行时悬空扫描腿——兼容读数 E6#117）。
 * 改了壳 CSS 后跑 \`npm run host-css:regen\`；check 链的 \`--check\` 会抓漂移。
 */
export interface HostCssManifest {
  /** 生成器在仓内相对于仓库根的路径（自证） */
  generatedFrom: string;
  /** 宿主定义/提及的类名全集（裸定义全 ldk-*，提及集含宿主 CSS 里出现的全部类名） */
  classes: readonly string[];
  /** 宿主关键帧名全集（@keyframes 定义 ＋ 保留关键帧账） */
  keyframes: readonly string[];
  /** 保留关键帧账条数（reserved-class-names.json） */
  reservedKeyframeCount: number;
}

export const HOST_CSS_MANIFEST: HostCssManifest = {
  generatedFrom: ${JSON.stringify(genFrom)},
  classes: [
${chunk(classes).map((row) => `    ${row.map((n) => JSON.stringify(n)).join(", ")},`).join("\n")}
  ],
  keyframes: [
${chunk(keyframes).map((row) => `    ${row.map((n) => JSON.stringify(n)).join(", ")},`).join("\n")}
  ],
  reservedKeyframeCount: ${host.reservedKeyframes.length},
};
`;
  return head;
}

/** 数组按 size 切块（生成物按行压缩用——check-file-size ≤800 行门禁友好，diff 仍稳定：排序去重在前） */
const chunk = (arr, size = 8) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

function selfTest() {
  const host = collectHostDefs();
  const classes = [...host.classes];
  const keyframes = [...host.keyframes];
  const cases = [];
  const eq = (label, got, expect) => cases.push({ label, ok: got === expect, got, expect });
  eq("宿主类名非空（壳 CSS 在）", classes.length > 0, true);
  eq("宿主类名全部像标识符", classes.every((n) => /^-?[_a-zA-Z][\w-]*$/.test(n)).toString(), "true");
  eq("保留关键帧账已并入（8 条）", host.reservedKeyframes.length, 8);
  eq("关键帧全集 ⊇ 保留账", keyframes.length >= host.reservedKeyframes.length, true);
  eq("codicon 在宿主类名里（第三方 CSS 解析成功）", classes.some((n) => n.startsWith("codicon-")).toString(), "true");
  let bad = 0;
  for (const c of cases) {
    if (!c.ok) bad++;
    console.log(`${c.ok ? "✅" : "❌"} ${c.label}${c.ok ? "" : `（实得 ${JSON.stringify(c.got)}，期望 ${JSON.stringify(c.expect)}）`}`);
  }
  console.log(`\n自测：${cases.length - bad}/${cases.length} 通过（宿主类名 ${classes.length} · 关键帧 ${keyframes.length}）`);
  return bad === 0 ? 0 : 1;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) process.exit(selfTest());
  const text = render(collectHostDefs());
  if (argv.includes("--check")) {
    let disk = null;
    try { disk = readFileSync(fromFileUrlPath(OUT.pathname), "utf8"); } catch { /* 缺文件 ⇒ 判漂 */ }
    if (disk !== text) {
      console.error("✗ host-css.generated.ts 与重算不一致——跑了 gen-host-css-manifest.mjs 吗？");
      console.error("  修复：npm run host-css:regen（同笔提交生成物）");
      process.exit(1);
    }
    console.log("✅ host-css.generated.ts 与 collectHostDefs() 重算一致");
    process.exit(0);
  }
  const outPath = fromFileUrlPath(OUT.pathname);
  mkdirSync(outPath.slice(0, outPath.lastIndexOf("/") === -1 ? outPath.lastIndexOf("\\") : outPath.lastIndexOf("/")), { recursive: true });
  writeFileSync(outPath, text);
  console.log(`✅ 已重写 ${relative(process.cwd(), fromFileUrlPath(OUT.pathname))}`);
}

main();
