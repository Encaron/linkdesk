#!/usr/bin/env node
/**
 * R5 · 宿主命令常量对账（`check-shell-command-constants.mjs`）——「能力落位」六条腿之五。
 *
 * 判据出处：`docs/04-软件更新/待抉择池/文件打开方式与贡献点/10-纠正案-共享件转正与归一/05-防复发-机械准入原则.md` §三 R5。
 *
 * ══ 守的是哪句话 ══
 *   > 宿主命令 id 一旦被插件硬编码，改名就是全生态事故——本表是「一处改名、全体跟随」的
 *   > 机械保证（`src/core/commands/shell/shellCommands.ts` 头注原话）。
 *
 * ── 依赖方向决定了必须「对账」而不是「共享」──
 *   壳**不许** import `@linkdesk/plugin-sdk`（依赖方向：SDK 依赖 contracts，壳不依赖 SDK）。
 *   于是同一张表存在**两份同名字面量**：
 *     · 壳侧 `src/core/commands/shell/shellCommands.ts`
 *     · SDK 侧 `packages/plugin-sdk/src/shell-commands.ts`
 *   两份之间没有任何编译期联系 ⇒ 只能机器逐字对账（本腿）。这就是本案「声明对等律」在
 *   命令 id 上的落点：**表是共享件，允许有两份字面量，但不允许两份漂移**。
 *
 * ── 三条判定（全部红灯：本腿是硬门禁，不是黄灯名单）──
 *   ① **键集相等**：壳有的键 SDK 必须有，反之亦然（一边加了键忘了另一边 ⇒ 红）。
 *   ② **值逐字相等**：同键的值必须字符级相同（改一边 ⇒ 红——🔴 本腿的 `--self-test` 自证即此）。
 *   ③ **表里的 id 真的有人认领**：值必须出现在壳的**命令注册面**里（用 R3 同款采集器）。
 *      ⛔ 否则两处**一起**写死一个没人注册的 id ⇒ 两表「对得上」而命令是空转——
 *      这正是本案的空转项缺陷形状（`02-归一化-齿轮锚点与假菜单项.md` §四），必须拦。
 *
 * ── 剥注释在先 ──
 *   两个文件头注都大段引用了对方路径与常量名；注释里的 `SHELL_COMMANDS = { … }` 若被当成
 *   真表 ⇒ 假红。故一律走 `readStripped`（字符串感知的剥注释，见 `scripts/lib/strip-comments.mjs`）。
 *
 * 用法：node scripts/check-shell-command-constants.mjs [根目录] / `--self-test`
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectShellCommandIds, readStripped } from "./lib/gate-scan.mjs";
import { stripComments } from "./lib/strip-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");

/** 两张表的位置（**唯二**合法落点；作者文档是第三处，由 author-docs 腿管）。 */
export const SHELL_TABLE = "src/core/commands/shell/shellCommands.ts";
export const SDK_TABLE = "packages/plugin-sdk/src/shell-commands.ts";

/**
 * 从源码里抠出 `SHELL_COMMANDS = { key: "value", … } as const`。
 *
 * 逐字对账的是**键值对**，不是文本：引号风格（`'` / `"`）、缩进、键序、注释**都不参与**比较
 * ——否则格式一动就是假红，人会学会绕开这条腿。
 *
 * @returns {{ entries: Map<string, string>, ok: boolean, reason?: string }}
 */
export function extractTable(src) {
  const m = src.match(/SHELL_COMMANDS\s*=\s*\{([\s\S]*?)\}\s*as\s+const/);
  if (!m) return { entries: new Map(), ok: false, reason: "找不到 `SHELL_COMMANDS = { … } as const`（表被改名/拆走了？）" };
  const entries = new Map();
  for (const kv of m[1].matchAll(/["']?([A-Za-z_$][\w$]*)["']?\s*:\s*["']([^"']*)["']/g)) {
    if (entries.has(kv[1]) && entries.get(kv[1]) !== kv[2]) {
      return { entries, ok: false, reason: `同一键 \`${kv[1]}\` 在表内出现两次且值不同（后者覆盖前者，人会看错）` };
    }
    entries.set(kv[1], kv[2]);
  }
  if (entries.size === 0) return { entries, ok: false, reason: "表是空的（常量表必须至少有一条）" };
  return { entries, ok: true };
}

/**
 * 纯判定：两张表逐字对账 ＋ 值须在壳注册面里有人认领。
 *
 * @param {Map<string, string>} shell
 * @param {Map<string, string>} sdk
 * @param {Set<string>} registered 壳的命令注册面（R3 同款采集器）
 * @returns {{ onlyShell: string[], onlySdk: string[], mismatched: {key:string,shell:string,sdk:string}[], unclaimed: {key:string,id:string}[] }}
 */
export function judgeParity(shell, sdk, registered) {
  const onlyShell = [...shell.keys()].filter((k) => !sdk.has(k));
  const onlySdk = [...sdk.keys()].filter((k) => !shell.has(k));
  const mismatched = [...shell.keys()]
    .filter((k) => sdk.has(k) && sdk.get(k) !== shell.get(k))
    .map((k) => ({ key: k, shell: shell.get(k), sdk: sdk.get(k) }));
  const unclaimed = [...shell.keys()]
    .filter((k) => registered && !registered.has(shell.get(k)))
    .map((k) => ({ key: k, id: shell.get(k) }));
  return { onlyShell, onlySdk, mismatched, unclaimed };
}

const FIX_HINTS = [
  "🔴 三处同笔改（壳内自用 · SDK 导出 · 作者文档）——这是 `shellCommands.ts` 头注定下的纪律：",
  `   ① 壳侧 ${SHELL_TABLE}（并确认壳里真的注册了这个 id，否则表里是个空转命令）`,
  `   ② SDK 侧 ${SDK_TABLE}（插件唯一的合法写法）`,
  "   ③ 作者文档「调用宿主命令」一节（`docs/03-插件制造/**` ＋ `docs/03-plugin-authoring/**`，再重生 plugin-docs）",
];

function main() {
  const shellPath = path.join(ROOT, SHELL_TABLE);
  const sdkPath = path.join(ROOT, SDK_TABLE);
  for (const p of [shellPath, sdkPath]) {
    if (!fs.existsSync(p)) {
      console.log(`🔴 R5 常量表不在场：${path.relative(ROOT, p)}（表被挪走/改名 ⇒ 对账失去对象）`);
      process.exit(1);
    }
  }
  const shellSrc = readStripped(shellPath);
  const sdkSrc = readStripped(sdkPath);
  const sh = extractTable(shellSrc);
  const sd = extractTable(sdkSrc);
  const registered = collectShellCommandIds(path.join(ROOT, "src"));
  const v = judgeParity(sh.entries, sd.entries, registered);

  let red = 0;
  console.log(`── R5 宿主命令常量对账（壳 ${sh.entries.size} 键 ⇄ SDK ${sd.entries.size} 键；壳注册面 ${registered.size} 条）──`);
  if (!sh.ok) (red++, console.log(`  🔴 壳侧表读不出来：${sh.reason}`));
  if (!sd.ok) (red++, console.log(`  🔴 SDK 侧表读不出来：${sd.reason}`));
  for (const k of v.onlyShell) (red++, console.log(`  🔴 键 \`${k}\` 只在**壳侧**：SDK 少了它 ⇒ 插件没有合法写法可用（只能去硬编码）`));
  for (const k of v.onlySdk) (red++, console.log(`  🔴 键 \`${k}\` 只在 **SDK 侧**：壳侧没这条 ⇒ 表在教插件调一条不存在的命令`));
  for (const m of v.mismatched) (red++, console.log(`  🔴 键 \`${m.key}\` **两份字面量不等**：壳 "${m.shell}" ≠ SDK "${m.sdk}" ⇒ 插件照 SDK 写会调用到没人认领的 id`));
  for (const u of v.unclaimed) (red++, console.log(`  🔴 键 \`${u.key}\` = "${u.id}" 在**壳的命令注册面里没人认领** ⇒ 表两处对齐了，命令仍是空转（本案空转项缺陷形状）`));

  if (red === 0) {
    console.log(`✅ R5 两表逐字相等（${sh.entries.size} 键）且每个 id 都在壳注册面里有人认领 —— 改名只有一处要改，全体跟随。`);
    process.exit(0);
  }
  console.log(`\n🔴 R5 对账 ${red} 处不过。`);
  for (const h of FIX_HINTS) console.log(h);
  process.exit(1);
}

/* ────────────────────────────────── 自测 ────────────────────────────────── */

function selfTest() {
  const S = (o) => new Map(Object.entries(o));
  const cases = [
    // ── 正控 ──
    [
      "正控①（**spec 点名的自证**）：故意改一边的值 ⇒ 报 mismatched（红）",
      judgeParity(S({ openWith: "workbench.action.openWith" }), S({ openWith: "workbench.action.openWithX" }), new Set(["workbench.action.openWith"]))
        .mismatched.map((m) => m.key).join(","),
      "openWith",
    ],
    [
      "正控②：壳侧多一个键（SDK 忘了跟）⇒ 报 onlyShell",
      judgeParity(S({ openWith: "a.b", other: "a.c" }), S({ openWith: "a.b" }), new Set(["a.b", "a.c"])).onlyShell.join(","),
      "other",
    ],
    [
      "正控③：SDK 侧多一个键（壳侧没有）⇒ 报 onlySdk",
      judgeParity(S({ openWith: "a.b" }), S({ openWith: "a.b", ghost: "a.z" }), new Set(["a.b"])).onlySdk.join(","),
      "ghost",
    ],
    [
      "正控④：两表都对得上，但 id 在壳注册面里**没人认领** ⇒ 报 unclaimed（两处一起写死一个空转 id）",
      judgeParity(S({ openWith: "workbench.action.nobodyOwnsMe" }), S({ openWith: "workbench.action.nobodyOwnsMe" }), new Set(["workbench.action.other"])).unclaimed.length,
      1,
    ],
    [
      "正控⑤：表头之外的**另一个** `SHELL_COMMANDS` 表（同文件第二处定义）⇒ 抽表抽得到（不至于一条都抽不出）",
      extractTable('export const SHELL_COMMANDS = {\n  openWith: "workbench.action.openWith",\n} as const;').entries.get("openWith"),
      "workbench.action.openWith",
    ],
    [
      "正控⑥：表内同键写两次且值不同 ⇒ 拒收（`ok=false`，⛔ 不当「后者胜」静默吞掉）",
      extractTable('export const SHELL_COMMANDS = {\n  openWith: "a.b",\n  openWith: "a.c",\n} as const;').ok,
      false,
    ],
    [
      "正控⑦：空表 ⇒ 拒收（常量表至少一条）",
      extractTable("export const SHELL_COMMANDS = {\n} as const;").ok,
      false,
    ],
    [
      "正控⑧：表整个被改名/拆走 ⇒ 拒收并给出理由（对账失去对象是要拦的，⛔ 不是「无差异=通过」）",
      extractTable("export const HOST_COMMANDS = { openWith: 'a.b' } as const;").ok,
      false,
    ],
    // ── 负控 ──
    [
      "负控①：**注释里**的 `SHELL_COMMANDS = { … }` 不被当成表（剥注释在先——两个文件头注都大段引用对方）",
      extractTable(stripComments('// export const SHELL_COMMANDS = { ghost: "a.z" } as const;\nexport const SHELL_COMMANDS = {\n  openWith: "a.b",\n} as const;')).entries.has("ghost"),
      false,
    ],
    [
      "负控②：键**序不同**、值相同 ⇒ 不算差异（对账的是键值对，不是文本序）",
      (() => {
        const v = judgeParity(S({ a: "x.y", b: "x.z" }), S({ b: "x.z", a: "x.y" }), new Set(["x.y", "x.z"]));
        return v.mismatched.length + v.onlyShell.length + v.onlySdk.length + v.unclaimed.length;
      })(),
      0,
    ],
    [
      "负控③：**引号风格**（单引号 vs 双引号）⇒ 不算差异（值按字面量内容比）",
      judgeParity(new Map([["openWith", "a.b"]]), extractTable("export const SHELL_COMMANDS = {\n  openWith: 'a.b',\n} as const;").entries, new Set(["a.b"])).mismatched.length,
      0,
    ],
    [
      "负控④：**行内注释**跟在值后面 ⇒ 不影响取值（剥注释在先）",
      extractTable('export const SHELL_COMMANDS = {\n  openWith: "a.b", // 注释里还有 "a.z" 这种假 id\n} as const;').entries.get("openWith"),
      "a.b",
    ],
    [
      "负控⑤：两边一致且有人认领 ⇒ 零差异（正例本身不报）",
      (() => {
        const v = judgeParity(S({ openWith: "a.b" }), S({ openWith: "a.b" }), new Set(["a.b"]));
        return v.mismatched.length + v.onlyShell.length + v.onlySdk.length + v.unclaimed.length;
      })(),
      0,
    ],
  ];

  let bad = 0;
  for (const [tag, got, want] of cases) {
    const ok = got === want;
    if (!ok) bad++;
    process.stdout.write(`${ok ? "✅" : "🔴"} ${tag} —— 实得 ${JSON.stringify(got)}（期望 ${JSON.stringify(want)}）\n`);
  }

  // 真树读数：今日两表应逐字相等且 id 有人认领（这就是本腿在生产树上的常态）
  const sh = extractTable(readStripped(path.join(ROOT, SHELL_TABLE)));
  const sd = extractTable(readStripped(path.join(ROOT, SDK_TABLE)));
  const reg = collectShellCommandIds(path.join(ROOT, "src"));
  const live = judgeParity(sh.entries, sd.entries, reg);
  const liveRed = live.mismatched.length + live.onlyShell.length + live.onlySdk.length + live.unclaimed.length;
  if (liveRed !== 0) bad++;
  process.stdout.write(
    `${liveRed === 0 ? "✅" : "🔴"} 真树读数：${sh.entries.size} 键两表逐字相等、id 均在壳注册面（${[...sh.entries.values()].join(", ")}）\n`,
  );
  process.stdout.write(
    bad === 0 ? `\n✅ check-shell-command-constants self-test 全过（${cases.length} 例 ＋ 真树读数）。\n` : `\n🔴 check-shell-command-constants self-test ${bad} 例不符。\n`,
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
    console.log("── check-shell-command-constants --self-test ──");
    selfTest();
  } else {
    main();
  }
}
