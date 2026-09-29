#!/usr/bin/env node
/**
 * 宿主菜单槽位名单**随包下发**生成器（文件树「打开文件夹入口」门禁件 · 2026-09-29）。
 *
 * ── 一句话 ──
 * 把「宿主今天认哪些菜单槽位 id」生成成一份**随包下发的 JSON**
 * （`packages/plugin-sdk/schemas/host-menu-slots.json`），让作者在自己仓里跑 SDK 门禁时
 * 能判出「**槽位 id 写成了宿主成员名而不是它的值**」这一类静默失效。
 *
 * ── 🔴 这条判据为什么必须是机械的（出处：`05-插件更新/文件树/01-打开文件夹入口-设计.md` §二·六）──
 *   2026-08-11 的池核心隔离（`af2ef5712`）把一份 `const MenuId = { FileContext: "FileContext",
 *   MenuBar: "MenuBar" }` 的**成员名**当成了槽位值搬进插件，于是 `menu.registerItems("MenuBar", …)`
 *   与 `menuId={"FileContext"}` 全部**落进死键**。后果：插件「文件」菜单项**凭空消失**两个多月，
 *   期间**没有任何一道门禁报过**——因为 `MenuId` 是开放字符串（`export type MenuId = string`），
 *   第三方可以自造注册点，「未知 id」在原理上无法判红；而 `contributes.menus` 的键是自由格式
 *   （schema 里没有 enum），写错键在**两条注册路径**上都只是**静默无输出**。
 *   ⇒ 不是「没人审」，是「**判据根本不存在**」。本生成器供的就是那条判据的输入。
 *
 * ── 判据只用得上「值的全集」（这点决定了本文件的形状）──
 *   SDK 腿的规则只有一条：**槽位 id 与宿主某个值仅大小写不同 ⇒ 红**（零假红；见 SDK
 *   `checks/menu-slots.ts` 文件头）。所以「未知 id 不判」这个开放性问题被绕开了——
 *   真正会让人栽跟头、且**没有任何合法用途**的，只有 `FileContext`（成员名）压在 `fileContext`
 *   （值）头上这一种形态。名单按值排序、附带回成员名只为**报错时能把话说全**。
 *
 * ── ⛔ 生成器不自采数据 ──
 *   唯一真源 = `src/core/registry/commands/MenuRegistry.ts` 的 `MENU_SLOTS` 常量表（壳代码唯一引用面）。
 *   这里只做「读那份 TS 文本 → 抽 `Key: "value"` 对」的机械投影，⛔ 不复制一份值到本文件。
 *
 * ── 🔴 自检里钉着一条不变量（本条门禁的题眼）──
 *   `MENU_SLOTS` 的**值**不许等于任何**成员名**（否则「成员名 vs 值」这对概念在名单里自撞，
 *   判据立刻退化成满屏红）。当年那句 `FileContext: "FileContext"` 一旦进真源，本生成器的
 *   `--self-test` 当场红——这是把「以后别再这么写」从人的记性挪到机器上。
 *
 * 用法：
 *   node scripts/gen-host-menu-slots.mjs             # 重写随包 JSON
 *   node scripts/gen-host-menu-slots.mjs --check     # 磁盘 == 重算（不一致退出码 1）——check 链成员
 *   node scripts/gen-host-menu-slots.mjs --self-test # 解析器 ＋ 不变量自检
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(import.meta.url);
const ROOT = dirname(dirname(HERE));
/** 唯一真源：壳的菜单槽位常量表 */
const SOURCE = "src/core/registry/commands/MenuRegistry.ts";
/** 随包下发：SDK schema（作者侧 `checks/menu-slots.ts` 的输入） */
const SDK_OUT = `${ROOT}/packages/plugin-sdk/schemas/host-menu-slots.json`;

/** 真源里菜单槽位表的两个界标（改壳那份文件时若重命名，这里当场炸——fail-closed，⛔ 不静默 0 条） */
const BLOCK_START = "export const MENU_SLOTS = {";
const BLOCK_END = "} as const;";

/**
 * 从 `MenuRegistry.ts` 全文抽 `MENU_SLOTS` 的 `成员名: "值"` 对。
 * 界标缺失 / 块内一条都没抽到 ⇒ **抛**（调用方打印并退出 1）——⛔ 绝不让「读不到」静默成「0 条」。
 */
export function parseMenuSlots(source) {
  const at = source.indexOf(BLOCK_START);
  if (at === -1) throw new Error(`真源里找不到 \`${BLOCK_START}\`——名单生成器的界标过期了（改名了？）`);
  const end = source.indexOf(BLOCK_END, at);
  if (end === -1) throw new Error(`真源里 \`${BLOCK_START}\` 之后找不到 \`${BLOCK_END}\`——块未闭合？`);
  const body = source.slice(at + BLOCK_START.length, end);
  const entries = [];
  for (const m of body.matchAll(/^[ \t]*([A-Za-z_$][\w$]*)[ \t]*:[ \t]*"([^"]*)"[ \t]*,/gm)) {
    entries.push({ key: m[1], value: m[2] });
  }
  if (entries.length === 0) throw new Error(`\`${BLOCK_START}\` 块里一条槽位都没抽到——解析器与真源格式脱节了`);
  return entries;
}

/**
 * 🔴 不变量：**值不得等于任何成员名**。
 * 命中 ⇒ 返回冒犯者列表（今天的真源应为 0 条）。这条不变量不是洁癖：
 * 判据是「与某个值仅差大小写 ⇒ 红」，而成员名恰好长得像值（`FileContext` vs `fileContext`）是
 * 唯一的现实威胁；真源里若出现 `X: "X"` 这种值，判据的词根就不成立了。
 */
export function menuSlotValueInvariant(entries) {
  const keys = new Set(entries.map((e) => e.key));
  return entries.filter((e) => keys.has(e.value));
}

/** 随包 JSON 文本（按值排序 ⇒ diff 稳定；`entries` 而非裸数组，为了报错时能报出成员名） */
function renderSdkJson(entries) {
  const sorted = [...entries].sort((a, b) => a.value.localeCompare(b.value));
  return (
    JSON.stringify(
      {
        $comment:
          "宿主菜单槽位名单（随包下发）——生成物勿手改。唯一真源 = src/core/registry/commands/MenuRegistry.ts 的 MENU_SLOTS，由 scripts/gen-host-menu-slots.mjs 生成（--check 对账）。用途：作者侧 check 腿判「槽位 id 写成了 MENU_SLOTS 的成员名而不是它的值」——那种键在两条注册路径上都静默失效（判据与出处见 docs/05-插件更新/文件树/01-打开文件夹入口-设计.md §二·六）。",
        version: 1,
        generatedFrom: "scripts/gen-host-menu-slots.mjs",
        source: SOURCE,
        slotCount: sorted.length,
        entries: sorted,
      },
      null,
      2,
    ) + "\n"
  );
}

function readSourceText() {
  return readFileSync(`${ROOT}/${SOURCE}`, "utf8");
}

function selfTest() {
  const cases = [];
  const eq = (label, got, expect) => cases.push({ label, ok: JSON.stringify(got) === JSON.stringify(expect), got, expect });

  // ── 解析器正控：夹具（含注释、含 as const 收尾、含嵌套对象值不该被误抽）──
  const fixture = `export type MenuId = string;
/** 注释里的样子不该被抽出来：Fake: "fake" */
export const MENU_SLOTS = {
  /** Ctrl+Shift+P */
  CommandPalette: "commandPalette",
  FileContext: "fileContext",
} as const;
export const MENU_SUB = { Inner: "inner" } as const;`;
  eq("夹具解析（只抽块内、不碰注释与块后常量）", parseMenuSlots(fixture), [
    { key: "CommandPalette", value: "commandPalette" },
    { key: "FileContext", value: "fileContext" },
  ]);

  // ── 解析器负控：界标缺失 ⇒ 抛（fail-closed，⛔ 不许静默 0 条）──
  let threw = "";
  try {
    parseMenuSlots("export const NOT_MENU_SLOTS = {};");
  } catch (e) {
    threw = e.message;
  }
  eq("界标缺失 ⇒ 抛（不静默）", threw.includes("找不到"), true);

  // ── 不变量正控/负控：`X: "X"` ⇒ 冒犯；正常值 ⇒ 干净 ──
  eq("不变量负控（值 ≠ 成员名）", menuSlotValueInvariant([{ key: "FileContext", value: "fileContext" }]), []);
  eq(
    "不变量正控（值 == 成员名 ⇒ 报出冒犯者）",
    menuSlotValueInvariant([{ key: "FileContext", value: "FileContext" }]).map((e) => e.key),
    ["FileContext"],
  );

  // ── 真源读数 ＋ 不变量 ──
  const entries = parseMenuSlots(readSourceText());
  const offenders = menuSlotValueInvariant(entries);
  eq("真源槽位数 ≥ 10（今天 14）", entries.length >= 10, true);
  eq("真源值全为小驼峰（`fileContext` 形态——成员名是大驼峰）", entries.every((e) => /^[a-z][A-Za-z0-9]*$/.test(e.value)), true);
  eq("真源值互不重复", new Set(entries.map((e) => e.value)).size, entries.length);
  eq(
    `🔴 不变量：值不得等于任何成员名（今天 ${entries.length} 条）`,
    offenders.map((e) => `${e.key}=${e.value}`),
    [],
  );

  // ── 磁盘漂移对账（改了真源没重生成 ⇒ 当场红）──
  let disk = null;
  try {
    disk = readFileSync(SDK_OUT, "utf8");
  } catch {
    /* 缺文件 ⇒ 判漂 */
  }
  eq("SDK 随包 JSON（host-menu-slots.json）与重算一致", disk, renderSdkJson(entries));

  let bad = 0;
  for (const c of cases) {
    if (!c.ok) bad++;
    console.log(`${c.ok ? "✅" : "❌"} ${c.label}${c.ok ? "" : `（实得 ${JSON.stringify(c.got)}，期望 ${JSON.stringify(c.expect)}）`}`);
  }
  console.log(`\n自测：${cases.length - bad}/${cases.length} 通过（真源槽位 ${entries.length} 条）`);
  return bad === 0 ? 0 : 1;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) process.exit(selfTest());
  let entries;
  try {
    entries = parseMenuSlots(readSourceText());
  } catch (e) {
    console.error(`✗ [menu-slots] ${e.message}`);
    process.exit(1);
  }
  const offenders = menuSlotValueInvariant(entries);
  if (offenders.length > 0) {
    console.error("✗ [menu-slots] 真源违反不变量——槽位**值**撞上了成员名：");
    for (const o of offenders) console.error(`  ├ MENU_SLOTS.${o.key} = "${o.value}"`);
    console.error("  ⇒ 判据（「与值仅差大小写 ⇒ 红」）的词根不成立，先修真源再生成。");
    process.exit(1);
  }
  const text = renderSdkJson(entries);
  if (argv.includes("--check")) {
    let disk = null;
    try {
      disk = readFileSync(SDK_OUT, "utf8");
    } catch {
      /* 缺文件 ⇒ 判漂 */
    }
    if (disk !== text) {
      console.error("✗ packages/plugin-sdk/schemas/host-menu-slots.json 与重算不一致（随包名单漂了）——");
      console.error("  修复：npm run menu-slots:regen（同笔提交生成物）");
      process.exit(1);
    }
    console.log(`✅ host-menu-slots.json 与 MENU_SLOTS 重算一致（${entries.length} 条）`);
    process.exit(0);
  }
  mkdirSync(dirname(SDK_OUT), { recursive: true });
  writeFileSync(SDK_OUT, text);
  console.log(`✅ 已重写 packages/plugin-sdk/schemas/host-menu-slots.json（${entries.length} 条槽位）`);
}

main();
