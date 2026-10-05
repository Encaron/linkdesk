#!/usr/bin/env node
/**
 * R3 · 菜单项可执行律（`check-menu-items-executable.mjs`）——「能力落位」六条腿之三。
 *
 * 判据出处：`docs/04-软件更新/已落地/文件打开方式与贡献点/10-纠正案-共享件转正与归一/05-防复发-机械准入原则.md` §三 R3。
 *
 * ══ 守的是哪句话 ══
 *   > 菜单项（含键位）写下的 `command` 必须**真的有人认领**——否则用户点了什么都不发生、
 *   > 键按下去像卡住。这类项叫**空转项**，本案的原始病例就是一处：
 *   > 设置页「在文件树中打开选择器」指向**别的插件**（`file-tree`）的命令，插件不在场 / 语义不合 ⇒ 假钮
 *   > （`10-纠正案…/02-归一化-齿轮锚点与假菜单项.md` §四；4.5 已改走壳命令 `SHELL_COMMANDS.openWith`）。
 *
 * ── 判据（一句话）──
 *   一处引用 `id` 合不合法，只看**它落在谁的面子上**：
 *     ① `id` 在**壳命令面**（`collectShellCommandIds`）⇒ 过（插件调宿主命令是正解）；
 *     ② `id` 归**本仓**（`buildCommandOwnership`：本仓 `plugin.json` 声明 ∪ 本仓注册面）⇒ 过；
 *     ③ `id: ""` 且**有 `children`** ⇒ 过（分组头，成员在子树里，不算引用）；
 *     ④ 其余 ⇒ **红**。含两种情况，输出里分开点名：
 *        · `unresolved`——查无此命令（含「指向**别的插件**的命令」：它的属主不是本仓）；
 *        · `shell-references-plugin-command`——**壳**的菜单项指向**插件**的命令（硬约束 10 的同一根钉子：
 *          壳核里不许出现插件 id；插件不在场时那项就是死钮）。
 *
 * ── 域与边界（四条，都实测过）──
 *   ① 域：壳 `src/**`（非测试）＋ 官方插件仓（`plugin.json` 的 `menus`（递归）`/keybindings` ＋ `src/**` 的
 *      `command:` 字面量）；⛔ 第三方仓**只报不判红**。
 *   ② **注释不算代码**（先剥注释）：注释里举例、解释某条命令 id 是常态。
 *   ③ **壳命令面是近似**（动态循环注册收不干净）⇒ 壳域允许漏报；漏的由**运行期半条**兜底
 *      （dev 构建 `executeCommand` 遇未注册命令喊 `console.error`，见 `CommandRegistry.runCommand`）。
 *      宁可漏报也不假红——假红一多，真红就没人看了。
 *   ④ `src/pool/dev/**` = **dev 预览样本**（fixture 扮演壳给出的最终形态，见该文件头注）⇒ 不进域；
 *      跳过数**打出来**（⛔ 不静默——样本文件消失时应看到 0，而不是以为它干净）。
 *
 * ── 自证（`--self-test`）──
 *   正控：① 查无此命令 ⇒ 红；② **原始病例形状**（本仓菜单项指向 `file-tree.openWith`）⇒ 红；
 *        ③ 壳菜单项指向插件命令 ⇒ 红（单列 kind）；④ 键位指向不存在命令 ⇒ 红。
 *   负控：① 壳命令面里的 id ⇒ 过；② 本仓声明的命令 ⇒ 过；③ `id: ""` 有 children ⇒ 过；
 *        ④ 注释里的 ⇒ 过；⑤ 第三方仓 ⇒ 只报不判红；⑥ 例外账本过期 ⇒ 红（机制同 R1/R2）。
 *
 * 用法：node scripts/check-menu-items-executable.mjs [容器目录] / `--self-test`
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  SAMPLE_PATH_RE,
  SHELL_ID,
  applyExceptions,
  buildCommandOwnership,
  collectManifestRefs,
  collectShellCommandIds,
  collectShellCommandIdsFromSources,
  collectSourceCommandRefs,
  listSourceFiles,
  loadOfficialRepos,
  readStripped,
  resolveContainer,
} from "./lib/gate-scan.mjs";
import { readManifestJson } from "./lib/plugin-repos.mjs";
import { stripComments } from "./lib/strip-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_SCRIPT = path.join(ROOT, "scripts", "sync-plugin-agents.mjs");
const SELF_TEST = process.argv.includes("--self-test");

/**
 * 例外账本（文件级 ＋ 到期条件必填；键为「仓前缀相对路径」）。
 * 全部是**本波（5.5）新发现**、⛔ 不在本波范围内改的项——只挂账，等用户/各仓任务书处置。
 */
export const EXCEPTIONS = [
  {
    file: "editor/src/components/EditorContextMenu.tsx",
    id: "*",
    why: "**死代码**：整份文件只有一个导出的 `registerEditorContextMenu()`，**全仓无人调用**（7 项 `editor.*` 命令也无人注册）⇒ 7 条死菜单项。本波只报未改。",
    until: "该文件被删，或**真接线**：`registerEditorContextMenu` 有调用点 ＋ 7 条 `editor.*` 命令有注册方。",
  },
  {
    file: "marketplace/src/services/marketplaceShared/commands.ts",
    id: "workbench.action.selectIconTheme",
    why: "陈旧 id（归一化遗留）——壳里图标主题选择是 `theme.pick`（本文件下一行已用对它）。本波只报未改。",
    until: "该项改指 `theme.pick`（或删项）。",
  },
  {
    file: "marketplace/src/services/marketplaceShared/commands.ts",
    id: "workbench.action.openExtensionKeybindings",
    why: "陈旧 id——壳里的对应命令是 `workbench.action.openKeybindingsSettings`（帮助菜单「快捷键列表」同一条）。本波只报未改。",
    until: "该项改指 `workbench.action.openKeybindingsSettings`（或删项）。",
  },
  {
    file: "file-tree/plugin.json",
    id: "workbench.view.explorer",
    why: "E4 设计档里的 VS Code 式 id（`docs/02-Electron架构/E4_…/04-命令系统/` 有出处），壳从未实现「聚焦视图」命令 ⇒ `Ctrl+Shift+E` 按下去静默无效（`KeybindingRegistry/dispatch.ts` 对无 handler 的键位直接丢弃）。本波只报未改。",
    until: "壳提供「聚焦视图」命令后该项改指它，或删掉该键位。",
  },
  {
    file: "src/core/commands/input-bindings/shellMenus.ts",
    id: "workbench.action.copySettingAsUrl",
    why: "**phase6 预埋位**：项上带 `when: \"false\"`（恒不显示），命令待设置同步落地才注册。本波只报未改。",
    until: "phase6 设置同步落地（`when` 摘掉、命令注册）或删项。",
  },
  {
    file: "src/core/commands/input-bindings/shellMenus.ts",
    id: "workbench.action.toggleSettingSync",
    why: "同上（phase6 预埋位，`when: \"false\"` 恒不显示）。本波只报未改。",
    until: "phase6 设置同步落地（`when` 摘掉、命令注册）或删项。",
  },
];

/**
 * 纯判定（自测注入假输入）。
 * @param {{id: string, kind: string, rel: string, line: number, repo: string, official?: boolean}[]} refs
 * @param {Set<string>} shellIds
 * @param {Map<string, Set<string>>} ownership
 * @returns {{red: any[], reported: any[]}} red = 判红；reported = 第三方只报
 */
export function judgeMenuRefs(refs, shellIds, ownership) {
  const red = [];
  const reported = [];
  for (const r of refs) {
    const isShellSide = r.repo === SHELL_ID;
    const owners = ownership.get(r.id) || new Set();
    let verdict = null;
    if (!r.id) {
      verdict = r.kind === "empty-menu-item" ? "empty-menu-item" : null; // 分组头（有 children）不判
    } else if (shellIds.has(r.id)) {
      verdict = null;
    } else if (isShellSide) {
      verdict = owners.size > 0 ? "shell-references-plugin-command" : "unresolved";
    } else if (owners.has(r.repo)) {
      verdict = null;
    } else {
      verdict = "unresolved";
    }
    if (!verdict) continue;
    (r.official === false ? reported : red).push({ ...r, kind: verdict });
  }
  return { red, reported };
}

const FIX_HINTS = {
  unresolved:
    "两种改法：① 该项要的是**本仓**能力 ⇒ 让本仓注册这条命令（`plugin.json` 声明 ＋ 运行期注册）；"
    + "② 要的是**别的插件**的能力 ⇒ 改成经**壳命令**（`SHELL_COMMANDS.*` / `@linkdesk/plugin-sdk`）或删项"
    + "——⛔ 不许直接引用别的插件的命令 id（本案 02 档 §四 的原始病例）。",
  "shell-references-plugin-command":
    "壳核里出现插件命令 id = 硬约束 10 的同一根钉子（插件不在场时那项就是死钮）。"
    + "改法：把能力**上收成壳命令**（`SHELL_COMMANDS`），或删该菜单项。",
  "empty-menu-item":
    "空 id 且无 `children` ⇒ 空壳分组头（点了什么都不发生的项）。补 `children` 或删项。",
};

/** 壳侧引用面（`src/**` 非测试；dev 样本另册，见边界④）。 */
function shellRefs() {
  const dir = path.join(ROOT, "src");
  const all = listSourceFiles(dir)
    .map((f) => ({ rel: path.relative(ROOT, f).split(path.sep).join("/"), text: readStripped(f) }))
    .filter((f) => f.text !== null);
  const sampled = all.filter((f) => SAMPLE_PATH_RE.test(f.rel));
  const files = all.filter((f) => !SAMPLE_PATH_RE.test(f.rel));
  return {
    refs: collectSourceCommandRefs(SHELL_ID, files),
    skipped: collectSourceCommandRefs(SHELL_ID, sampled).length,
    files: all.length,
  };
}

function main() {
  const shellIds = collectShellCommandIds(path.join(ROOT, "src"));
  const { dir: container, present } = resolveContainer();
  const repos = loadOfficialRepos(container, AGENTS_SCRIPT);
  const ownership = buildCommandOwnership(present ? repos : []);

  const sh = shellRefs();
  const refs = [...sh.refs];
  for (const r of repos) {
    const mf = readManifestJson(path.join(r.dir, "plugin.json"));
    const pre = `${r.id}/`;
    if (mf.ok) for (const x of collectManifestRefs(mf.manifest)) refs.push({ ...x, rel: pre + x.rel, repo: r.id, official: r.official });
    const files = listSourceFiles(path.join(r.dir, "src"))
      .map((f) => ({ rel: path.relative(r.dir, f).split(path.sep).join("/"), text: readStripped(f) }))
      .filter((f) => f.text !== null);
    for (const x of collectSourceCommandRefs(r.id, files)) refs.push({ ...x, rel: pre + x.rel, official: r.official });
  }

  const { red, reported } = judgeMenuRefs(refs, shellIds, ownership);
  const { kept, passed, violations } = applyExceptions(EXCEPTIONS, red);

  if (!present) console.log(`⚠️ 插件容器不在场（${container}）⇒ **插件域跳过**（壳域照判）。`);
  if (reported.length) {
    console.log(`ℹ️ 第三方仓查无此命令 ${reported.length} 处（⛔ 只报不判红、不代改）：`);
    for (const h of reported.slice(0, 20)) console.log(`   · ${h.rel}:${h.line || "清单"}  "${h.id}"`);
  }
  if (violations.length) {
    console.error(`❌ R3 例外账本不达标——${violations.length} 处：`);
    for (const v of violations) console.error(`   [${v.kind}] ${v.msg}`);
    process.exit(1);
  }
  if (kept.length) {
    console.error(`❌ R3 菜单项可执行律 ${kept.length} 处——写了 command 却没人认领（点了/按了不会有任何反应）：\n`);
    for (const h of kept) {
      console.error(`   · ${h.rel}:${h.line || "清单"}  ${h.line ? '"' + h.id + '"' : h.id || "（空 id）"}  [${h.kind}]`);
      console.error(`     怎么修：${FIX_HINTS[h.kind]}`);
    }
    process.exit(1);
  }

  console.log(
    `✅ R3 菜单项/键位条条可执行——引用 ${refs.length} 处（壳 ${sh.files} 个源文件 ＋ ${repos.length} 只官方插件仓；`
      + `壳命令面 ${shellIds.size} 条、命令归属表 ${ownership.size} 条）`
      + (sh.skipped ? `；dev 样本域跳过 ${sh.skipped} 处（fixture 扮演壳，见头注边界④）` : "；dev 样本域 0 处（样本文件没了？）")
      + (passed.length ? `；例外放行 ${passed.length} 处（${EXCEPTIONS.length} 条登记，反向核对已过）。` : "。"),
  );
}

/* ────────────────────────────────── 自测 ────────────────────────────────── */

function selfTest() {
  const SHELL_IDS = new Set(["workbench.action.openWith", "workbench.action.showCommands", "core.openSettings"]);
  const OWN = new Map([
    ["file-tree.openWith", new Set(["file-tree"])],
    ["file-tree.newFile", new Set(["file-tree"])],
    ["marketplace.enable", new Set(["marketplace"])],
  ]);
  const judge = (refs) => {
    const { red } = judgeMenuRefs(
      refs.map((r) => ({ kind: "menu", line: 1, repo: "settings", official: true, ...r })),
      SHELL_IDS,
      OWN,
    );
    return red;
  };
  const kindsOf = (refs) => judge(refs).map((r) => r.kind);
  const srcRefs = (text) => collectSourceCommandRefs("settings", [{ rel: "src/a.tsx", text: stripComments(text) }]);

  const cases = [
    // ── 正控：该红的红 ──
    [
      "正控①：查无此命令（`settings.doesNotExist`）⇒ 红 [unresolved]",
      kindsOf([{ id: "settings.doesNotExist", rel: "src/a.tsx" }]).includes("unresolved"),
      true,
    ],
    [
      "🔴 正控②（**本案 02 §四 的原始形状**）：本仓菜单项指向**别的插件**的命令 `file-tree.openWith` ⇒ 红",
      kindsOf([{ id: "file-tree.openWith", rel: "src/geometry/FileAssociationsManagerView.tsx" }]).includes("unresolved"),
      true,
    ],
    [
      "正控③：**壳**的菜单项指向插件命令 ⇒ 红 [shell-references-plugin-command]（硬约束 10 同源）",
      judgeMenuRefs([{ id: "file-tree.newFile", kind: "menu", rel: "src/core/commands/input-bindings/shellMenus.ts", line: 1, repo: "@shell", official: true }], SHELL_IDS, OWN)
        .red.map((r) => r.kind).includes("shell-references-plugin-command"),
      true,
    ],
    [
      "正控④：**键位**指向不存在的命令 ⇒ 红（`Ctrl+Shift+E` 按下去静默无效那一类）",
      judgeMenuRefs([{ id: "workbench.view.explorer", kind: "keybinding", rel: "file-tree/plugin.json", line: 0, repo: "file-tree", official: true }], SHELL_IDS, OWN)
        .red.map((r) => r.kind).includes("unresolved"),
      true,
    ],
    [
      "正控⑤：**源码面**采集得住真菜单项（卖家形状：`registerItems(slot, id, [{command}])`）",
      srcRefs('registerItems("slot", "marketplace", [{ command: "marketplace.enable", group: "navigation" }]);').map((r) => r.id).join(","),
      "marketplace.enable",
    ],
    [
      "正控⑥：**清单面**递归 `children`——分组头（`command:\"\"`）下的子项一条不漏",
      collectManifestRefs({
        contributes: {
          menus: { menuBar: [{ command: "", label: "文件", children: [{ command: "file-tree.cut" }, { command: "file-tree.copy" }] }] },
          keybindings: [{ key: "Ctrl+E", command: "file-tree.openFile" }],
        },
      }).map((r) => r.id).join(","),
      "file-tree.cut,file-tree.copy,file-tree.openFile",
    ],
    [
      "正控⑦：空 id 且**无 `children`**（空壳分组头）⇒ 红 [empty-menu-item]",
      kindsOf([{ id: "", kind: "empty-menu-item", rel: "plugin.json" }]).includes("empty-menu-item"),
      true,
    ],
    [
      "正控⑧：**壳命令面**四种注册形态都得收得到（漏收 = 假红）",
      (() => {
        const ids = collectShellCommandIdsFromSources([
          'registerCommand(APP_PLUGIN_ID, { id: "workbench.action.showCommands", title: "x", handler: async () => {} });',
          'export const OPEN_AI_MANUAL_COMMAND_ID = "app.openAiManual";\nregisterCommand(APP_PLUGIN_ID, { id: OPEN_AI_MANUAL_COMMAND_ID, handler: async () => {} });',
          'const PANEL_POSITION_EDGES = { "workbench.action.positionPanelTop": "top" };\nfor (const [id] of Object.entries(PANEL_POSITION_EDGES)) registerCommand(APP_PLUGIN_ID, { id, handler: async () => {} });',
          'registerCommand("core.openSettings");',
        ]);
        return ["workbench.action.showCommands", "app.openAiManual", "workbench.action.positionPanelTop", "core.openSettings"].every((x) => ids.has(x));
      })(),
      true,
    ],
    [
      "正控⑨：**映射表键形**也得认——否则面板右键 8 项全假红（`PANEL_POSITION_EDGES` 真身就是循环注册）",
      collectShellCommandIdsFromSources(['const M = { "workbench.action.alignPanelCenter": "center" };\nregisterCommand(APP_PLUGIN_ID, {});']).has("workbench.action.alignPanelCenter"),
      true,
    ],
    // ── 负控：⛔ 不误伤 ──
    ["负控①：壳命令面里的 id（`workbench.action.openWith`）⇒ 过", judge([{ id: "workbench.action.openWith", rel: "src/a.tsx" }]).length, 0],
    ["负控②：本仓声明的命令（`marketplace.enable` 归 marketplace）⇒ 过", judge([{ id: "marketplace.enable", repo: "marketplace", rel: "src/commands.ts" }]).length, 0],
    ["负控③：`id: \"\"` 但有 `children`（分组头）⇒ 不判（成员在子树里）", judge([{ id: "", kind: "menu", rel: "src/a.tsx" }]).length, 0],
    [
      "🔴 负控④：**注释里**写的 `command:` ⇒ 采不到（剥注释，⛔ 不把注释当代码）",
      srcRefs('// 这里曾经 command: "settings.ghostCommand"\nconst x = 1;').length,
      0,
    ],
    [
      "负控⑤：**字符串里的 `//`** 不会被误当注释（剥注释是字符串感知的）",
      srcRefs('const u = "https://x/y"; registerItems("s", "p", [{ command: "settings.copyPluginId" }]);').map((r) => r.id).join(","),
      "settings.copyPluginId",
    ],
    [
      "负控⑥：**第三方仓**命中的 ⇒ 只报不判红（⛔ 不代改别人家）",
      (() => {
        const { red, reported } = judgeMenuRefs(
          [{ id: "nobody.ownsMe", kind: "menu", rel: "third/x/src/a.tsx", line: 1, repo: "third", official: false }],
          SHELL_IDS, OWN,
        );
        return red.length === 0 && reported.length === 1;
      })(),
      true,
    ],
    [
      "负控⑦：例外账本过期（一条也没放行）⇒ 报 stale-exception",
      applyExceptions([{ file: "a/b.tsx", id: "*", why: "r", until: "u" }], []).violations.some((v) => v.kind === "stale-exception"),
      true,
    ],
    [
      "负控⑧：**源码面的分组头**（`command: \"\"` ＋ 另一行 `children`）⇒ 不产出引用——源码面看不见 `children`，"
        + "分不开「有意分组头」与「空壳死项」⇒ 分不开就不判（判了壳里 7 处全假红）",
      srcRefs('registerItems("menuBar", "x", [\n  { command: "", label: "文件", group: "file",\n    children: [{ command: "file-tree.cut" }] },\n]);').map((r) => r.id).join(","),
      "file-tree.cut",
    ],
  ];

  let bad = 0;
  for (const [tag, got, want] of cases) {
    const ok = got === want;
    if (!ok) bad++;
    process.stdout.write(`${ok ? "✅" : "🔴"} ${tag} —— 实得 ${JSON.stringify(got)}（期望 ${JSON.stringify(want)}）\n`);
  }
  const live = collectShellCommandIds(path.join(ROOT, "src"));
  const liveOk = ["app.openAiManual", "workbench.action.openWith", "workbench.action.positionPanelTop"].every((id) => live.has(id));
  if (!liveOk) bad++;
  process.stdout.write(
    `${liveOk ? "✅" : "🔴"} 负控⑨（**真树**）：壳命令面必须收得到 app.openAiManual（常量形）/ workbench.action.openWith（id 形）/ workbench.action.positionPanelTop（映射表键形）——实得 ${liveOk}\n`,
  );
  process.stdout.write(
    bad === 0
      ? `\n✅ check-menu-items-executable self-test 全过（${cases.length + 1} 例：正控红 / 负控绿 ＋ 真树回归）。\n`
      : `\n🔴 check-menu-items-executable self-test ${bad} 例不符。\n`,
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
    console.log("── check-menu-items-executable --self-test ──");
    selfTest();
  } else {
    main();
  }
}
