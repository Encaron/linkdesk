/**
 * API 速查表生成器 + 漂移门禁（E6#41a）。
 *
 * ## 为什么必须机械生成
 *
 * 插件作者看 `@linkdesk/plugin-sdk` 的 npm 页面时，只有 `README.md` 会渲染。
 * 「有哪些命名空间、各有哪些方法」如果手写在 README 里，就等于**第二份真相源**——
 * 而第二份真相源必然漂移：实证见 `docs/02-Electron架构/E5.8_归一化基建/契约生成/命名空间矩阵.md`
 * （手维护，2026-08-20 停更；截至 2026-09-12 已漏 `appearance`/`floatingPanelHost`/`panel`/
 * `settings`/`factorySlots`/`app` 六个命名空间，且仍留着已从契约删除的 `config` 别名与 `toast`）。
 * 人读的清单一旦过期，作者就会照着不存在的面写代码。
 *
 * ⇒ 本脚本从 **`contracts/linkdesk.d.ts`** 现读现生成，一个字节都不手写。
 * 选 d.ts 而非源码：d.ts 正是作者从 npm 拿到的那个文件（@linkdesk/contracts），
 * 且 `npm run contracts:check` 已保证它与 `src/core/api/linkdesk-api/*.ts` 字节一致
 * （契约生成器 #21）——所以读 d.ts 既贴作者视角，又不引入新的漂移面。
 *
 * ## 与 check-api-contracts.mjs 的分工
 *
 * 那个脚本从**源码**加载命名空间全集，管「文档引用的 `linkdesk.X` 是不是假命名空间」（反向漂移）；
 * 本脚本从 **d.ts** 生成**清单本身**（正向漂移）。两者读不同文件、管不同方向，缺一不可。
 * ⚠️ 已知差异：那边的正则 `[a-zA-Z][a-zA-Z]*` 匹配不了带数字的命名空间（`p2p`）——
 * 本脚本用 `\w` 遮盖，那边是它的既有洞，不在本次改动范围内。
 *
 * ## 解析逻辑在 `scripts/lib/contract-parse.mjs`（不在这里复述）
 *
 * 「哪四种写法算命名空间」「两个判定坑（多行签名续行 / `?` 成员）」全写在那份共享模块里——
 * 因为 `check-namespace-matrix.mjs` 也读同一份判定，两处各写一份必然漂移。
 * **本脚本不自己解析契约**，只负责「把解析结果渲染成 README 表格」。
 *
 * ## 输出与门禁
 *
 * 产出写进 `packages/plugin-sdk/README.md` 的 `<!-- BEGIN/END API-CHEATSHEET -->` 标记之间
 * （仅此一处——`01-插件API契约.md` 有意指针式，方法明细不手写）。
 * `--check` 模式不写盘，只比对新生成的内容与盘上是否一致（门禁用，已挂 `npm run check`）。
 *
 * 用法：node scripts/generate-api-cheatsheet.mjs          # 生成/刷新
 *       node scripts/generate-api-cheatsheet.mjs --check  # 只校验漂移
 * 退出码 0 = 一致/已写入，退出码 1 = `--check` 下检测到漂移（打印到 stderr）。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT, DTS, parseContract } from "./lib/contract-parse.mjs";

const README = "packages/plugin-sdk/README.md";
const BEGIN = "<!-- BEGIN API-CHEATSHEET -->";
const END = "<!-- END API-CHEATSHEET -->";
/** 说明列压到一句话：顿号/句号截断 + 去除会撑破表格的竖线。 */
function brief(doc) {
  if (!doc) return "——";
  const cut = doc.split(/[。；;]/)[0].trim();
  const text = cut.length > 0 ? cut : doc;
  const safe = text.replace(/\|/g, "\\|");
  return safe.length > 60 ? `${safe.slice(0, 59)}…` : safe;
}

function render() {
  const { namespaces, interfaces } = parseContract();
  const rows = [...namespaces.entries()];
  // 别名行的方法面继承自目标命名空间——不重复计入总数
  const total = rows.reduce((n, [, v]) => n + (v.aliasOf ? 0 : v.methods.length), 0);
  const aliases = rows.filter(([, v]) => v.aliasOf).map(([n]) => `\`${n}\``);

  const out = [];
  out.push(BEGIN);
  out.push("");
  out.push(
    `> 自动生成，**勿手改**——由 \`scripts/generate-api-cheatsheet.mjs\` 从 \`@linkdesk/contracts\` 的 \`linkdesk.d.ts\` 现读产出，`,
  );
  out.push(
    `> \`npm run check\` 机械盯漂。完整签名与逐方法说明见 \`linkdesk.d.ts\` 本体（IDE 里可直接跳转）。`,
  );
  out.push("");
  out.push(
    `**${interfaces.length} 个域接口 → ${rows.length} 个命名空间 / ${total} 个方法**，全部经 \`window.linkdesk.<命名空间>.<方法>\` 调用。` +
      (aliases.length ? `（另含 ${aliases.length} 个废弃别名 ${aliases.join(" ")}，方法不重复计入）` : ""),
  );
  out.push("");
  out.push("| 命名空间 | 方法数 | 方法 | 说明 |");
  out.push("|:--|:--:|:--|:--|");
  for (const [name, v] of rows) {
    let cell;
    if (v.aliasOf) {
      cell = `（废弃别名 → \`${v.aliasOf}\`）`;
    } else if (v.methods.length) {
      // `°` = 契约标 `?` 的成员：仅一侧 preload 注入（多为壳侧独有），池里调用前先判存在
      cell = v.methods
        .map((m) => `\`${m}\`${(v.optionalMethods ?? []).includes(m) ? "°" : ""}`)
        .join(" ");
    } else {
      // 顶层函数属性命名空间（如 getFilePath）无子方法——直接展示签名形状
      cell = `（顶层函数）\`${(v.signature ?? "").replace(/\|/g, "\\|")}\``;
    }
    const mark = v.optional ? " ⚠️" : "";
    out.push(`| \`${name}\`${mark} | ${v.methods.length} | ${cell} | ${brief(v.doc)} |`);
  }
  const optional = rows.filter(([, v]) => v.optional).map(([n]) => `\`${n}\``);
  const anyOptionalMember = rows.some(([, v]) => (v.optionalMethods ?? []).length > 0);
  if (optional.length || anyOptionalMember) {
    out.push("");
    if (optional.length) {
      out.push(
        `⚠️ = 契约可选命名空间（只在一侧注入）：${optional.join(" ")}——调用前先判断是否存在，另一侧为 \`undefined\`。`,
      );
    }
    if (anyOptionalMember) {
      out.push(
        "° = 契约标 `?` 的成员：只在一侧 preload 注入（绝大多数是壳侧独有），**插件跑在池里**——调用前先判存在。",
      );
    }
  }
  out.push("");
  out.push(END);
  return out.join("\n");
}

function main() {
  const check = process.argv.includes("--check");
  const generated = render();
  const readmePath = resolve(ROOT, README);
  const readme = readFileSync(readmePath, "utf-8");

  const beginAt = readme.indexOf(BEGIN);
  const endAt = readme.indexOf(END);
  if (beginAt === -1 || endAt === -1) {
    console.error(`❌ ${README} 缺少速查表标记。`);
    console.error(`   修法：在 README 里加上 ${BEGIN} 与 ${END} 两行（生成器只替换这两行之间的内容）。`);
    process.exit(1);
  }

  const current = readme.slice(beginAt, endAt + END.length);
  if (current === generated) {
    console.log(`✅ API 速查表是最新的（${README}）`);
    return;
  }

  if (check) {
    console.error(`❌ API 速查表与 ${DTS} 不一致——契约变了，README 没跟上。`);
    console.error(`   修法：node scripts/generate-api-cheatsheet.mjs（然后连同契约改动一起提交）。`);
    console.error(`   差异预览：`);
    const curLines = current.split("\n");
    const newLines = generated.split("\n");
    let shown = 0;
    for (let i = 0; i < Math.max(curLines.length, newLines.length) && shown < 8; i++) {
      if (curLines[i] !== newLines[i]) {
        console.error(`     盘上: ${(curLines[i] ?? "(无)").slice(0, 100)}`);
        console.error(`     应为: ${(newLines[i] ?? "(无)").slice(0, 100)}`);
        shown++;
      }
    }
    process.exit(1);
  }

  writeFileSync(
    readmePath,
    readme.slice(0, beginAt) + generated + readme.slice(endAt + END.length),
    "utf-8",
  );
  console.log(`✅ API 速查表已刷新（${README}）`);
}

main();
