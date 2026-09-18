#!/usr/bin/env node
/**
 * 面快照生成器（E6#115 ·「只加不删门禁」的写侧）——把**插件能用的面**冻成 `scripts/host-api-surface.json`。
 *
 * 用法：
 *   node scripts/gen-api-surface.mjs           # 重算并写快照（人手工核过之后跑）
 *   node scripts/gen-api-surface.mjs --check   # 只比对：磁盘那份 vs 今天重算的（不一致退出码 1）
 *   npm run api-surface:regen / api-surface:check
 *
 * ── 它守的是哪句话（本格的由来）──
 *   平台承诺（memory `plugin-authoring-manual.md:179-180`）：「旧扩展在新版本上仍然能跑」。今天没有任何
 *   门禁拦得住「把插件能用的名字拿走」——`contracts:check` 是 d.ts 生成**字节比对**（管生成器与产物一致）、
 *   `scripts/check-api-contracts.mjs` 只管「文档不指向假命名空间」，**两条都不拦删除**。
 *   写侧只负责**如实记录**；判红是读侧 = `scripts/check-api-surface-additive.mjs`（与上一个已发布 tag 比）。
 *
 * ⚠️ `--check` **进** `npm run check`（本格的裁 · 见 `02-任务-只加不删门禁.md` §8.4 第 8 条）：不为「拦演进」，
 *   而为**不让基线陈旧**——快照是 tag 的记账本，陈旧 ⇒ 下一条 tag 的基线就错。先例 = `gen-host-reserved.mjs --check`
 *   （同一形状：真源 → 生成物必须一致）。不管面语义：**新增只提示、判红是读侧的事**。
 * 四栏的口径与「收什么/不收什么/为什么」全部写在
 *   `scripts/lib/api-surface.mjs` 的文件头注里——那是**唯一真相源**，改口径改那里，⛔ 别在这里另写一套。
 *
 * ⚠️ 集合语义（判据⑤的依据）：所有数组排序后写入 ⇒ 只改顺序、只改注释**不产生 diff**。所以本生成器
 *   的输出是逐字节可复现的：`regen` 之后 `git status` 必须干净，脏了就是口径里有非确定性输入（真 bug）。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  SNAPSHOT_REL,
  collectApiSurface,
  serializeSurface,
  flattenSurface,
  COLUMN_CALIBERS,
} from "./lib/api-surface.mjs";
import { ROOT } from "./lib/host-surface.mjs";

const CHECK = process.argv.includes("--check");
const OUT = resolve(ROOT, SNAPSHOT_REL);

/** 栏 → 条目数（人读的一行结论） */
function summarize(surface) {
  const rows = [
    ["apiNamespaces", `${Object.keys(surface.apiNamespaces).length} 命名空间 / ${Object.values(surface.apiNamespaces).reduce((a, b) => a + b.length, 0)} 成员`],
    ["apiRootMembers", `${surface.apiRootMembers.length} 个`],
    ["poolExposed", `${Object.keys(surface.poolExposed).length} 命名空间 / ${Object.values(surface.poolExposed).reduce((a, b) => a + b.length, 0)} 成员`],
    ["poolRootMembers", `${surface.poolRootMembers.length} 个`],
    ["manifestFields", `${Object.keys(surface.manifestFields).length} 路径（其中 ${Object.values(surface.manifestFields).filter((v) => v.length).length} 条带枚举）`],
    ["hostClassNames", `${surface.hostClassNames.length} 个 ldk-* 裸定义`],
    ["reservedKeyframes", `${surface.reservedKeyframes.length} 条`],
    ["ledger", `${Object.keys(surface.ledger).length} 栏`],
  ];
  return rows.map(([k, v]) => `   ${k.padEnd(18)} ${v}`).join("\n");
}

function main() {
  let surface;
  try {
    surface = collectApiSurface();
  } catch (err) {
    console.error(`🔴 面重算失败：${err.message}`);
    console.error("   （本生成器读的是仓库实况：linkdesk-api 类型图 ＋ plugin.schema.json ＋ 宿主 CSS ＋ 保留名账）");
    process.exit(2);
  }
  const text = serializeSurface(surface);

  if (CHECK) {
    if (!existsSync(OUT)) {
      console.error(`🔴 磁盘上没有 ${SNAPSHOT_REL} ⇒ 跑 \`npm run api-surface:regen\` 生成它并提交。`);
      process.exit(1);
    }
    const onDisk = readFileSync(OUT, "utf8");
    if (onDisk === text) {
      console.log(`✅ api-surface：磁盘那份与今天重算的**逐字节一致**（${flattenSurface(surface).length} 条面）。`);
      process.exit(0);
    }
    console.error(`🔴 api-surface：磁盘那份与今天重算的**不一致** ⇒ 跑 \`npm run api-surface:regen\` 更新并同笔提交。`);
    console.error(`   （快照是「上一个已发布版本的面」的记账本；它陈旧 ⇒ 下一条 tag 的基线就是错的）`);
    process.exit(1);
  }

  const before = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  writeFileSync(OUT, text);
  console.log(`✅ 已写 ${SNAPSHOT_REL}（${text.length} 字节，${flattenSurface(surface).length} 条面）：`);
  console.log(summarize(surface));
  if (before === text) console.log("   ⏎ 与改前逐字节相同——本次重算没有引入任何面变化。");
  else if (before) console.log("   ✎ 与改前不同——请 `git diff scripts/host-api-surface.json` 逐条核（新增是允许的，缺项要先想清楚）。");
  console.log(`\n   口径（每栏都写进快照的 generatedFrom）：`);
  for (const [k, v] of Object.entries(COLUMN_CALIBERS)) console.log(`   · ${k}：${v.slice(0, 60)}…`);
}

main();
