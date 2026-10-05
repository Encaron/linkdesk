#!/usr/bin/env node
/**
 * R1 · 跨仓命令 id 硬编码（`check-no-foreign-command-ids.mjs`）——「能力落位」六条腿之一。
 *
 * 判据出处：`docs/04-软件更新/已落地/文件打开方式与贡献点/10-纠正案-共享件转正与归一/05-防复发-机械准入原则.md` §三 R1。
 *
 * ══ 守的是哪句话 ══
 *   一个插件的命令 id 是**它的私有名字**。别人（另一只插件、或壳）把 `"<它的id>.<命令名>"` 写成字面量，
 *   就是把「跨仓耦合」写进了源码：那只插件改名 = 全生态事故，而**没有任何灯会亮**。
 *   本轮纠正案的真身就是这个——`file-tree.openWith` 被**三个仓**各自硬编码：
 *     · `settings` 的 `OPEN_WITH_COMMAND_ID` 常量（跨插件探活「在文件树中打开选择器」）
 *     · `editor` 的 `OPEN_WITH_COMMAND` 常量（`BinaryNotice` 的「打开方式…」钮）
 *     · `file-tree` 自己的兼容转发注册
 *   正解 = 宿主命令（`SHELL_COMMANDS.openWith` ⇒ `workbench.action.openWith`）＋ SDK helper。
 *
 * ══ 判据（一句话）══
 *   源码里的**字符串字面量**命中「**别的仓**声明的命令 id」⇒ 红。归属表两个来源并集：
 *   ① `plugin.json` 的 `contributes.commands[].id`；② 本仓 `registerCommand("…")` 的运行期面。
 *
 * ── 域 ──
 *   A. 插件容器官方仓 `src/**`（非测试）——「别的仓」＝ 除本仓外的任一官方仓。
 *   B. 壳 `src/**`（非测试）——壳是宿主，出现**任一插件仓**的命令 id 字面量即红
 *      （例外见下面的 `EXCEPTIONS`）。
 *   ⛔ 第三方仓**只报不判红**（硬约束 10：跳过一律按现场数据认）；测试文件与注释不进域
 *      （测试里写别的仓 id 是**夹具**、注释里是**追溯**，两者都不是耦合）。
 *
 * ── 自证（`--self-test`：正控必红 / 负控不误伤）──
 *   正控：`executeCommand("file-tree.openWith", p)`、`const X = "file-tree.openWith"` ⇒ 命中；
 *   负控：`SHELL_COMMANDS.openWith`（正解）、**本仓自有 id**、`workbench.action.*`（宿主 id，插件用它是对的）、
 *         注释里的 id、`"editor.fontFamily"`（配置键不是命令 id）⇒ 均不命中。
 *   反向核对：例外账本放行 + 过期例外报红。
 *
 * ── 🔴 残余边界（如实登记，⛔ 不许当成已覆盖）──
 *   ① 「插件裸写**壳**的命令 id」（`"workbench.action.selectLanguage"` 不套 `SHELL_COMMANDS`）
 *      **不在本腿判域**：那是「该走常量」的约定问题，靠 R5 的两侧常量对账 ＋ 作者面文档守，
 *      本腿管的是**跨仓**（谁的名字被谁写死）。
 *   ② 运行期**动态拼**出的 id（`"file-tree." + name`）收不到——静态腿的天然边界。
 *
 * 用法：node scripts/check-no-foreign-command-ids.mjs [容器目录] / `--self-test`
 * 退出码 0 = 无跨仓硬编码，1 = 有（或例外账本腐烂）。
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SHELL_ID,
  applyExceptions,
  buildCommandOwnership,
  listSourceFiles,
  loadOfficialRepos,
  readStripped,
  resolveContainer,
  scanLiterals,
} from "./lib/gate-scan.mjs";
import { stripComments } from "./lib/strip-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_SCRIPT = path.join(ROOT, "scripts", "sync-plugin-agents.mjs");
const SELF_TEST = process.argv.includes("--self-test");

/**
 * 例外账本（文件级 ＋ **到期条件必填**）。加条目前先问：这是「迁移数据」还是「调用」？
 * 调用一律不许例外——那就是本腿要治的东西。
 */
export const EXCEPTIONS = [
  {
    file: "src/core/services/configuration/renameMigrations.ts",
    id: "*",
    why:
      "**改名轮次的迁移数据**（`RENAME_ROUNDS`）：旧 id ↔ 新 id 的**对照表正文**，壳执行迁移时按数据读。"
      + "⛔ 不是壳在调别仓命令——它必须同时认识新旧两个名字，否则用户老配置文件迁不过来。",
    until:
      "E6 清账案 1.42–1.47 各轮跑完（renameMigrations 随最后一轮退役）时同笔删本条；"
      + "判据 = `RENAME_ROUNDS` 只剩空数组。",
  },
];

/**
 * 纯判定（自测注入假输入）：字面量命中**别仓**命令 id ⇒ 违规。
 * @param {{files: {rel: string, text: string}[], ownership: Map<string, Set<string>>, selfIds: string[]}} input
 *   files.text 必须是**已剥注释**的源码；selfIds ＝ 允许的归属仓（壳传 [SHELL_ID]，插件传 [本仓 id]）
 * @returns {{rel: string, id: string, line: number, owners: string[]}[]}
 */
export function findForeignRefs({ files, ownership, selfIds }) {
  const out = [];
  for (const f of files) {
    for (const lit of scanLiterals(f.text)) {
      const all = ownership.get(lit.value);
      if (!all) continue;
      // 壳的命令 id **不是**「外仓的名字」：插件调宿主命令（`workbench.action.*` 一族）是正解。
      // 本腿只治「谁把**别的插件仓**的名字写死了」——裸写宿主 id 的约定问题归 R5 ＋ 作者面文档。
      const owners = [...all].filter((o) => o !== SHELL_ID);
      if (owners.length === 0) continue;
      if (selfIds.some((s) => owners.includes(s))) continue;
      out.push({ rel: f.rel, id: lit.value, line: lit.line, owners: owners.sort() });
    }
  }
  return out;
}

function main() {
  const { dir: container, present } = resolveContainer();
  const repos = loadOfficialRepos(container, AGENTS_SCRIPT);

  if (!present || repos.length === 0) {
    console.log(
      `⚠️ 插件容器不在场（${container}）⇒ **插件域跳过**（本腿对插件域是空转，⛔ 不是「已干净」）；` +
        "壳域照常判。有容器时用 `npm run check:foreign-command-ids` 走全量。",
    );
  }

  const ownership = buildCommandOwnership(repos);
  const allHits = [];
  const report = [];

  // ── 插件域（官方仓判红 / 第三方只报）──
  for (const r of repos) {
    const files = listSourceFiles(path.join(r.dir, "src"))
      .map((f) => ({ rel: path.relative(ROOT, f).replace(/\\/g, "/"), text: readStripped(f) }))
      .filter((f) => f.text !== null);
    const hits = findForeignRefs({ files, ownership, selfIds: [r.id] });
    for (const h of hits) {
      (r.official ? allHits : report).push({ ...h, repo: r.id, tier: r.official ? "official" : "third-party" });
    }
  }

  // ── 壳域：壳 `src/**` 里出现任一插件仓的命令 id ⇒ 红（壳不该知道插件叫什么）──
  const shellFiles = listSourceFiles(path.join(ROOT, "src"))
    .map((f) => ({ rel: path.relative(ROOT, f).replace(/\\/g, "/"), text: readStripped(f) }))
    .filter((f) => f.text !== null);
  const shellHits = findForeignRefs({ files: shellFiles, ownership, selfIds: [SHELL_ID] }).map((h) => ({ ...h, repo: SHELL_ID }));

  // 例外只对**壳域**开（插件域是硬耦合，没有例外这回事）
  const { kept, passed, violations } = applyExceptions(EXCEPTIONS, shellHits);

  if (report.length) {
    console.log(`ℹ️ 第三方仓命中 ${report.length} 处（⛔ 只报不判红、不代改）：`);
    for (const h of report.slice(0, 20)) console.log(`   · ${h.repo} ${h.rel}:${h.line}  \`${h.id}\``);
  }

  if (violations.length) {
    console.error(`❌ R1 例外账本不达标——${violations.length} 处：\n`);
    for (const v of violations) console.error(`   [${v.kind}] ${v.msg}\n`);
    process.exit(1);
  }

  if (kept.length) {
    console.error(`❌ R1 跨仓命令 id 硬编码 ${kept.length} 处——插件改名就是全生态事故：\n`);
    for (const h of kept) {
      console.error(`   · ${h.rel}:${h.line}  \`${h.id}\`  ← 归属仓：${h.owners.join(" / ")}`);
    }
    console.error("");
    console.error("   怎么修：① 要调宿主能力 ⇒ 用壳命令 ＋ `SHELL_COMMANDS`（`@linkdesk/plugin-sdk/shell-commands`）；");
    console.error("          ② 要调**别的插件**的能力 ⇒ 同样先立一条宿主命令（⛔ 别点别人的名）；");
    console.error("          ③ 兼容转发期确实要留 ⇒ 走本脚本 `EXCEPTIONS`（文件级 ＋ 理由 ＋ **到期条件**）。");
    process.exit(1);
  }

  console.log(
    `✅ R1 无跨仓命令 id 硬编码——已扫 ${shellFiles.length} 个壳源文件 ＋ ${repos.length} 只插件仓`
      + `（命令 id 归属表 ${ownership.size} 条）。`,
  );
  if (passed.length) {
    const byFile = new Map();
    for (const p of passed) {
      if (!byFile.has(p.rel)) byFile.set(p.rel, { n: 0, why: p.why, until: p.until });
      byFile.get(p.rel).n++;
    }
    console.log(`   例外账本放行 ${passed.length} 处（${byFile.size} 个文件，按登记；逐条理由只印一次）：`);
    for (const [rel, v] of byFile) {
      console.log(`   · ${rel} —— ${v.n} 处。${v.why}`);
      console.log(`     到期条件：${v.until}`);
    }
  }
}

/* ────────────────────────────────── 自测 ────────────────────────────────── */

function selfTest() {
  const ownership = new Map([
    ["file-tree.openWith", new Set(["file-tree"])],
    ["file-tree.newFile", new Set(["file-tree"])],
    ["marketplace.disable", new Set(["marketplace"])],
    ["core.openSettings", new Set([SHELL_ID])],
  ]);
  const run = (text, selfIds = ["settings"]) =>
    findForeignRefs({ files: [{ rel: "src/x.ts", text: stripComments(text) }], ownership, selfIds });

  const cases = [
    // ── 正控：该红的红（三条都是**真实历史形态**）──
    ["正控①：`executeCommand(\"file-tree.openWith\", p)` 命中", run('executeCommand("file-tree.openWith", p);').length, 1],
    ["正控②：`const OPEN_WITH_COMMAND_ID = \"file-tree.openWith\"`（settings 当年的常量形态）命中", run('export const OPEN_WITH_COMMAND_ID = "file-tree.openWith";').length, 1],
    ["正控③：模板串里的外仓 id 命中", run("const id = `file-tree.openWith`;").length, 1],
    ["正控④：marketplace 写 file-tree 的 id 也命中（跨仓不分方向）", run('probe("file-tree.newFile");', ["marketplace"]).length, 1],
    // ── 负控：⛔ 不误伤 ──
    ["负控①：`SHELL_COMMANDS.openWith`（正解）不命中", run("host.commands.executeCommand(SHELL_COMMANDS.openWith, p);").length, 0],
    ["负控②：**本仓自有** id 不命中（file-tree 注册自己的命令）", run('registerCommand("file-tree.openWith", h);', ["file-tree"]).length, 0],
    ["负控③：宿主命令 id 不命中（插件调 `workbench.action.*` 是对的）", run('executeCommand("workbench.action.selectLanguage");').length, 0],
    ["负控④：配置键 `editor.fontFamily` 不是命令 id（归属表里没有）⇒ 不命中", run('get("editor.fontFamily");').length, 0],
    ["负控⑤：注释里的外仓 id 不命中（域先剥注释）", run('// 旧写法 executeCommand("file-tree.openWith")').length, 0],
    ["负控⑥：`core.openSettings` 归壳 ⇒ 插件引用它不算跨**插件**仓", run('executeCommand("core.openSettings");').length, 0],
  ];

  // ── 例外账本：放行 ＋ 反向核对（过期例外必红）──
  const hits = [{ rel: "src/a.ts", id: "file-tree.openWith" }];
  const good = [{ file: "src/a.ts", id: "*", why: "迁移数据", until: "1.47 清账完删" }];
  cases.push(["正控⑤：例外命中 ⇒ 放行（kept 0 / passed 1）", applyExceptions(good, hits).kept.length, 0]);
  cases.push(["正控⑥：例外条目真正放行了 ⇒ 不算过期（0 违规）", applyExceptions(good, hits).violations.length, 0]);
  cases.push([
    "🔴 负控⑦：**过期例外**（今天一条也没放行）⇒ 报 stale-exception",
    applyExceptions(good, []).violations.some((v) => v.kind === "stale-exception"),
    true,
  ]);
  cases.push([
    "🔴 负控⑧：例外缺**到期条件** ⇒ 报 exception-incomplete（⛔ 不许写「以后再删」之外的空话）",
    applyExceptions([{ file: "src/a.ts", id: "*", why: "理由", until: "  " }], hits).violations.some((v) => v.kind === "exception-incomplete"),
    true,
  ]);
  cases.push(["负控⑨：例外 `id` 写窄了（只放行另一条 id）⇒ 本条照旧留在 kept 里", applyExceptions([{ file: "src/a.ts", id: "other.id", why: "r", until: "u" }], hits).kept.length, 1]);

  let bad = 0;
  for (const [tag, got, want] of cases) {
    const ok = got === want;
    if (!ok) bad++;
    process.stdout.write(`${ok ? "✅" : "🔴"} ${tag} —— 实得 ${JSON.stringify(got)}（期望 ${JSON.stringify(want)}）\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-no-foreign-command-ids self-test 全过（${cases.length} 例：正控红 / 负控绿 ＋ 例外账本反向核对）。\n`
      : `\n🔴 check-no-foreign-command-ids self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

/** 主入口判定——被 `import` 时不许自己跑 main（判据函数要能被复用／被红证脚本直接调） */
const IS_MAIN = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  return path.resolve(argv1) === path.resolve(fileURLToPath(import.meta.url));
})();

if (IS_MAIN) {
  if (SELF_TEST) {
    console.log("── check-no-foreign-command-ids --self-test ──");
    selfTest();
  } else {
    main();
  }
}
