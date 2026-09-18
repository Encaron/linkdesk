#!/usr/bin/env node
/**
 * UI 导出面快照生成器（E6#121 ·「只加不删门禁」的写侧）——把 `@linkdesk/ui` 对插件许诺的
 * 导出面冻成 `scripts/ui-surface.json`。
 *
 * 用法：
 *   node scripts/gen-ui-surface.mjs        # 重算并写快照（人手工核过之后跑；npm run ui-surface:regen）
 *   node scripts/gen-ui-surface.mjs --check # 只比对：磁盘那份 vs 今天重算的（不一致退出码 1）
 *
 * ── 为什么需要它（本格的由来）──
 *   L9 把 `@linkdesk/ui` 翻成「池 vendor 单实例供给」后，插件运行时只有壳那一版组件——
 *   每个导出名从此是终身承诺。**闸必须先于通道立起来**：写侧只负责如实记录，判红是读侧
 *   = `scripts/check-ui-surface-additive.mjs`。口径（提取 / 分类 / 集合语义）全部住在
 *   `scripts/lib/ui-surface.mjs`——那是唯一真相源，改口径改那里，⛔ 别在这里另写一套。
 *
 * ── 与 barrel 头注释的计数对账（两处数字互为对账，硬校验）──
 *   barrel 头注释里写着各栏计数（如「22 组件 · 3 hooks · 4 helpers · 5 类型」）。本生成器重算后
 *   **机械比对**：任何一栏对不上 ⇒ 退出码 1——要么导出面真变了（先走门禁的退役 / 新增流程），
 *   要么头注释陈旧（同笔改头注释再重跑）。⛔ 快照更新是**人工动作 + 审查**，本生成器
 *   ⛔ **不进** `npm run check`（照 01 号任务书 §一3 的裁定）。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BARREL_REL,
  CATEGORIES,
  ROOT,
  SNAPSHOT_REL,
  collectUiSurface,
  flattenUiSurface,
  serializeSurface,
} from "./lib/ui-surface.mjs";

const CHECK = process.argv.includes("--check");

/** barrel 头注释的计数对账：提取「N 组件 · N hooks · N helpers · N 类型」形态的数字 */
function headerCounts(root) {
  const src = readFileSync(resolve(root, BARREL_REL), "utf8");
  const commentBlock = src.slice(0, src.indexOf("export "));
  const grab = (label) => {
    const m = new RegExp(`(\\d+)\\s*${label}`).exec(commentBlock);
    return m ? Number(m[1]) : null;
  };
  return { components: grab("组件"), hooks: grab("hooks"), helpers: grab("helpers"), types: grab("类型") };
}

function main() {
  let surface;
  try {
    surface = collectUiSurface(ROOT);
  } catch (err) {
    console.error(`🔴 面重算失败：${err.message}`);
    process.exit(2);
  }

  const header = headerCounts(ROOT);
  const mismatch = CATEGORIES.filter((c) => header[c] !== null && header[c] !== surface[c].length);
  if (mismatch.length > 0) {
    console.error(`🔴 计数对账失败——barrel 头注释与实算不一致：`);
    for (const c of mismatch) console.error(`   · ${c}：头注释 ${header[c]} ≠ 实算 ${surface[c].length}`);
    console.error(`   ⇒ 导出面变了就先过 check-ui-surface-additive 门禁；只是头注释陈旧就同笔改 ${BARREL_REL} 头注释再重跑。`);
    process.exit(1);
  }

  const text = serializeSurface(surface);
  const out = resolve(ROOT, SNAPSHOT_REL);

  if (CHECK) {
    if (!existsSync(out)) {
      console.error(`🔴 磁盘上没有 ${SNAPSHOT_REL} ⇒ 跑 \`npm run ui-surface:regen\` 生成它并提交。`);
      process.exit(1);
    }
    const onDisk = readFileSync(out, "utf8");
    if (onDisk === text) {
      console.log(`✅ ui-surface：磁盘那份与今天重算的**逐字节一致**（${flattenUiSurface(surface).length} 条面）。`);
      process.exit(0);
    }
    console.error(`🔴 ui-surface：磁盘那份与今天重算的**不一致**（generatedAt 每次重算都会变；名字集合变了才要紧）⇒ 人工核对后 \`npm run ui-surface:regen\` 更新并同笔提交。`);
    process.exit(1);
  }

  writeFileSync(out, text);
  console.log(`✅ 已写 ${SNAPSHOT_REL}（${flattenUiSurface(surface).length} 条面）：`);
  for (const c of CATEGORIES) console.log(`   · ${c.padEnd(11)} ${surface[c].length} 个`);
  console.log(`   · count       ${CATEGORIES.reduce((a, c) => a + surface[c].length, 0)}（与 barrel 头注释计数对账 ✓）`);
}

main();
