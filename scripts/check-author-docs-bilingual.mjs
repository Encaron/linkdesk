#!/usr/bin/env node
/**
 * 作者面文档门禁 ③ —— **双语对齐**（E6#105n）。
 *
 * 出处（唯一真源，本文不重述判据）：`docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/11-作者面文档收口.md`
 * 执行记录 §11.8（2026-09-14 用户拍板：中文树留作维护者面、英文树是作者面主显，双语必须上尺子）。
 *
 * 判据一句话：**中文树 `docs/03-插件制造/**` 与英文树 `docs/03-plugin-authoring/**` 必须篇篇对应**——
 *   中文有英文没有 ⇒ 红；英文有中文没有 ⇒ 红；文件名对不上那张映射表 ⇒ 红。
 *
 * 为什么必须有它（用户的原话顾虑：「这样就有中英双版本要维护，怎么办」）：
 *   双版本的真实代价不是"改两遍"，而是**改了一边忘了另一边、且没有任何灯会亮**——
 *   那正是本项目已经吃过的那类亏（记忆 `plugin-repo-gate-model` §八：教具与实现长期相反却没人报警）。
 *   ⇒ 给双语上尺子之后，「漏翻」变成跑一次 `npm run check` 就知道的事，而不是三个月后才发现英文版是假的。
 *
 * ## 扫描域与边界
 *  - **扫**：上面两棵树下的 `*.md`（含子夹）。**不扫** `plugin.schema.json`——它是**两棵树共用的单一文件**
 *    （三份字节相等的拷贝之一，`check-plugin-schema-sync` 守），其 description 已统一为英文，不属于"翻译对齐"。
 *  - **不扫**：`.html` mockup 等非 markdown。
 *
 * 用法：
 *   node scripts/check-author-docs-bilingual.mjs              # 挂 npm run check
 *   node scripts/check-author-docs-bilingual.mjs --self-test  # 负控：缺一篇 ⇒ 红
 * 退出码 0 = 篇篇对齐，1 = 有缺口（打印到 stderr）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const ZH = "docs/03-插件制造";
const EN = "docs/03-plugin-authoring";
/** 两棵树各自的入口（必须互相指路） */
const ENTRY = { zh: "00-README.md", en: "00-readme.md" };
/** 两棵树互为入口的那行（各自入口里必须出现对方的相对路径） */
const CROSS_LINK = { zh: "03-plugin-authoring/00-readme.md", en: "03-插件制造/00-README.md" };

/**
 * 🔴 文件名映射表（唯一真源：加一篇文档必须同时加进这张表，否则门禁红）。
 * 左侧 = 中文树文件名（相对 `docs/03-插件制造/`）；右侧 = 英文树文件名（相对 `docs/03-plugin-authoring/`）。
 * ⚠️ 英文树用**英文文件名**（作者面主显），所以这层映射必须显式维护——别想着靠"同名"自动推。
 */
export const FILENAME_MAP = {
  "00-README.md": "00-readme.md",
  "01-插件API契约.md": "01-plugin-api-contract.md",
  "02-插件生命周期.md": "02-plugin-lifecycle.md",
  "03-插件contributes规范.md": "03-contributes-spec.md",
  "04-插件分发格式.md": "04-distribution-format.md",
  "05-插件UI写法规约.md": "05-ui-conventions.md",
  "06-plugin.json规范.md": "06-plugin-json-spec.md",
  "07-插件间通信.md": "07-plugin-to-plugin-communication.md",
  "08-ViewContainer-视图容器API.md": "08-view-container-api.md",
  "09-插件目录规范.md": "09-plugin-directory-layout.md",
  "10-如何造一个设置插件.md": "10-building-a-settings-plugin.md",
  "11-主题制作.md": "11-authoring-themes.md",
  "12-README说明区媒体契约.md": "12-readme-media-contract.md",
  "13-插件开发指南.md": "13-development-guide.md",
  "14-数据管道命令约定.md": "14-data-pipeline-command-conventions.md",
  "15-多仓开发与本地工作区.md": "15-multi-repo-and-local-workspace.md",
  "16-命名规范.md": "16-naming-conventions.md",
  "17-区域地图.md": "17-region-map.md",
  "18-区域间互动.md": "18-cross-region-wiring.md",
  "19-组件速查.md": "19-component-cheatsheet.md",
  "20-我的插件加一条配置项.md": "20-adding-a-setting.md",
  "主题/01-做一个主题插件.md": "themes/01-build-a-theme-plugin.md",
  "主题/02-主题字段速查.md": "themes/02-theme-field-index.md",
};

function listMd(relDir) {
  const abs = join(ROOT, relDir);
  if (!existsSync(abs)) return [];
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) out.push(relative(abs, p).split("\\").join("/"));
    }
  };
  walk(abs);
  return out.sort();
}

export function checkBilingual() {
  const zh = listMd(ZH);
  const en = listMd(EN);
  const problems = [];
  const zhSet = new Set(zh);
  const enSet = new Set(en);

  for (const [z, e] of Object.entries(FILENAME_MAP)) {
    if (!zhSet.has(z)) problems.push(`中文树缺篇（映射表里有，磁盘上没有）：${ZH}/${z}`);
    if (!enSet.has(e)) problems.push(`英文树缺篇（映射表里有，磁盘上没有）：${EN}/${e}`);
  }
  for (const z of zh) if (!(z in FILENAME_MAP)) problems.push(`中文树有篇目未登记进映射表：${ZH}/${z}`);
  for (const e of en) if (!Object.values(FILENAME_MAP).includes(e)) problems.push(`英文树有篇目未登记进映射表：${EN}/${e}`);

  const zhEntry = join(ROOT, ZH, ENTRY.zh);
  const enEntry = join(ROOT, EN, ENTRY.en);
  if (existsSync(zhEntry) && !readFileSync(zhEntry, "utf8").includes(CROSS_LINK.zh))
    problems.push(`中文入口没指向英文版：${ZH}/${ENTRY.zh} 里应有指向 ${CROSS_LINK.zh} 的一行`);
  if (existsSync(enEntry) && !readFileSync(enEntry, "utf8").includes(CROSS_LINK.en))
    problems.push(`英文入口没指向中文版：${EN}/${ENTRY.en} 里应有指向 ${CROSS_LINK.en} 的一行`);

  return { zh: zh.length, en: en.length, problems };
}

function main() {
  const { zh, en, problems } = checkBilingual();
  if (problems.length > 0) {
    console.error(`\n❌ [author-docs-bilingual] 中英两棵树没有篇篇对齐（${problems.length} 处）：\n`);
    for (const p of problems) console.error("  " + p);
    console.error(
      "\n  判据与处置口径 → docs/02-Electron架构/E6_插件生态与发布/插件源码外移层/11-作者面文档收口.md §11.8" +
        "\n  （加一篇文档 = 两棵树都加 + 在 scripts/check-author-docs-bilingual.mjs 的 FILENAME_MAP 里登记一行。）\n",
    );
    process.exit(1);
  }
  console.log(`✅ [author-docs-bilingual] 中英对齐——中文 ${zh} 篇 / 英文 ${en} 篇，入口互指。`);
}

function selfTest() {
  const fakeMap = { "a.md": "a.md" };
  const cases = [
    ["两棵树都有 ⇒ 不缺", ["a.md"], ["a.md"], 0],
    ["英文缺 ⇒ 报", ["a.md"], [], 1],
    ["中文缺 ⇒ 报", [], ["a.md"], 1],
    ["有篇目未登记 ⇒ 报", ["a.md", "b.md"], ["a.md", "b.md"], 1],
  ];
  let bad = 0;
  for (const [name, zhList, enList, expectMin] of cases) {
    const problems = [];
    const zhSet = new Set(zhList);
    const enSet = new Set(enList);
    for (const [z, e] of Object.entries(fakeMap)) {
      if (zhSet.has(z) && !enSet.has(e)) problems.push("en miss");
      if (!zhSet.has(z) && enSet.has(e)) problems.push("zh miss");
    }
    for (const z of zhSet) if (!(z in fakeMap)) problems.push("unmapped");
    for (const e of enSet) if (!Object.values(fakeMap).includes(e)) problems.push("unmapped");
    const ok = problems.length >= expectMin && (expectMin === 0 ? problems.length === 0 : problems.length > 0);
    if (!ok) bad++;
    console.log(`  ${ok ? "✓" : "✗"} ${name}（判定 ${problems.length} 处，期望 ${expectMin === 0 ? "0" : ">0"}）`);
  }
  console.log(`[author-docs-bilingual] self-test 判定：${bad === 0 ? "✓ 负控会红、正控会绿" : `✗ FAIL（${bad}）`}`);
  return bad === 0 ? 0 : 1;
}

if (process.argv.slice(2).includes("--self-test")) process.exit(selfTest());
main();
