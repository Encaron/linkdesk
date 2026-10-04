#!/usr/bin/env node
/**
 * 作者面文档门禁 ⑤ —— **菜单槽位清单的单一真相源**（文件打开方式与贡献点 T5 · 2026-10-05）。
 *
 * 出处：`docs/04-软件更新/待抉择池/文件打开方式与贡献点/01-方案与落点契约.md` T5「SDK 腿：
 *   `host-menu-slots.json` 已防『成员名当值』，**补作者文档同步检查**」＋ 04 阶段 5
 *   「SDK 腿：作者文档同步检查挂 `check-gate-health` 自测清单」。
 *
 * ── 判据一句话 ──
 *   机器侧真源 = `packages/plugin-sdk/schemas/host-menu-slots.json`（＝壳 `MENU_SLOTS` 的投影，
 *   `scripts/gen-host-menu-slots.mjs --check` 守它与壳源码一致）；作者读的那份 = 新篇
 *   「菜单贡献点」两棵树的**槽位表**。本门禁把这几份**双向**钉在一起：
 *     ① **账 → 表**：账里每个槽位**值**都要在对应那一行出现（`slot-not-in-doc`）；
 *     ② **表 → 账**：表里那个槽位列**只许出现账里的值**（`slot-not-in-ledger`）；
 *     ③ **中英两棵树相等**（`doc-drift`）：同一张表的两个译本，必须同笔改；
 *     ④ **表找不到 ⇒ 红**（`table-missing`）：门禁的射程就是这张表，表被搬走/改名/改结构 ⇒
 *        作者面的槽位清单成了瞎子，**不许静默放过**。
 *
 * ── 为什么这条腿非有不可（不是「多一道更保险」）──
 *   槽位 id 是**开放字符串**（`export type MenuId = string`）：写错一个键，**两条注册路径都静默无输出**
 *   ——2026-08-11 的池核心隔离把 `FileContext`（成员名）当值搬进插件，插件的菜单项**凭空消失两个多月**，
 *   期间没有任何门禁报过（详见 SDK `menu-slots.ts` 文件头）。SDK 那条腿只能判「**只差大小写**」这一种形态；
 *   而**作者面文档自己写错/写漏**（比如某天有人把 `panelViewContext` 误写成 `panelContext`）时，
 *   那条腿毫无反应——作者照着文档抄，抄出来的就是一个死键。
 *   ⇒ 文档与名单之间必须有对账，**两侧都查**：只查一侧的「对账」在**账多一条**时照样是绿的。
 *
 * ── 与 `check-reserved-names-doc-sync.mjs` 的关系 ──
 *   同一套形态（账 ↔ 双语作者面表，双向 ＋ fail-closed ＋ `--self-test`），但**不同的一对真源**
 *   （那份管类名/关键帧/宿主保留名，本份管菜单槽位）。⛔ **不要合并**：两份的射程、表头锚与
 *   消费方都不同，合并只会让一次改动同时动两处不相关的判据。
 *
 * 用法：
 *   node scripts/check-menu-slots-doc-sync.mjs              # 挂 npm run check
 *   node scripts/check-menu-slots-doc-sync.mjs --self-test  # 正控 ＋ 负控（见 .test.mjs）
 * 退出码 0 = 各份一致；1 = 有漂移（打印到 stderr）。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 主入口判定——被 `import` 时不许自己跑 main（判据函数要能被复用／被单测直接调） */
const IS_MAIN = (() => {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  const norm = (p) => resolve(p).replace(/\\/g, "/").toLowerCase();
  return norm(argv1) === norm(fileURLToPath(import.meta.url));
})();

/** 机器侧真源（＝`MENU_SLOTS` 的投影；与 SDK 的 `loadHostMenuSlots` 读**同一份**） */
export const SLOTS_LEDGER_REL = "packages/plugin-sdk/schemas/host-menu-slots.json";

/** 作者面两棵树（路径 = `FILENAME_MAP` 里的那对，`check-author-docs-bilingual` 守篇目对齐） */
export const DOCS = [
  { lang: "zh", label: "zh（维护者面原文）", rel: "docs/03-插件制造/22-菜单贡献点.md" },
  { lang: "en", label: "en（作者面主显）", rel: "docs/03-plugin-authoring/22-menu-contribution-points.md" },
];

/** 槽位表那一列的表头（中英）——**表按表头定位，不写死列序/节号**（篇号与列序调整不该把门禁变瞎） */
const SLOT_COL_RE = /槽位值|Slot value/;

/** 表格行 → 单元格（不切被转义的 `\|`） */
const splitCells = (line) => {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim());
};

/** markdown 表格的分隔行（`|---|---|`） */
const isSeparator = (line) => {
  const t = line.trim();
  return t.startsWith("|") && t.includes("-") && /^[|\s:-]+$/.test(t);
};

/** 抽单元格里的 `` `名字` `` token（这一列**只放槽位值**，散文写别的列） */
export function extractSlots(cell) {
  const out = [];
  for (const m of String(cell).matchAll(/`([^`]+)`/g)) {
    const n = m[1].trim();
    if (n) out.push(n);
  }
  return out;
}

/**
 * 定位槽位表 → { colIndex, rows: [{slots: string[]}] }；找不到 ⇒ null。
 * 判据：某个表头行里有一格命中 `槽位值` / `Slot value`（**不写死列序**）。
 */
export function parseSlotTable(text) {
  const lines = text.split("\n");
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!lines[i].startsWith("|")) continue;
    if (!isSeparator(lines[i + 1])) continue;
    const colIndex = splitCells(lines[i]).findIndex((c) => SLOT_COL_RE.test(c));
    if (colIndex < 0) continue;
    const rows = [];
    for (let j = i + 2; j < lines.length && lines[j].startsWith("|"); j++) {
      rows.push({ slots: extractSlots(splitCells(lines[j])[colIndex] ?? "") });
    }
    if (rows.length === 0) return null;
    return { colIndex, rows };
  }
  return null;
}

/** 账里的槽位值（去重保序：按 `MENU_SLOTS` 的声明序给作者面读） */
export function loadSlotValues(root = ROOT) {
  const raw = JSON.parse(readFileSync(resolve(root, SLOTS_LEDGER_REL), "utf8"));
  return (raw.entries ?? []).map((e) => e.value).filter((v) => typeof v === "string" && v);
}

/**
 * 核心判据（纯函数，`--self-test` 与真跑共用）。
 * @param {{docs:{lang:string,label:string,text:string}[], slotValues:string[]}} input
 * @returns {{kind:string,msg:string}[]}
 */
export function checkMenuSlotsDocs({ docs, slotValues }) {
  const violations = [];
  const ledger = new Set(slotValues);

  const parsed = new Map();
  for (const d of docs) {
    const p = parseSlotTable(d.text);
    if (!p) {
      violations.push({
        kind: "table-missing",
        msg:
          `${d.label}：找不到「菜单槽位」表（表头须有一格含「槽位值」/「Slot value」，且至少一行内容）。` +
          `——门禁的射程就是这张表：表被移走/改名/改结构，作者面的槽位清单就成了瞎子（照抄一个错键 = 菜单项静默消失）。` +
          `若确实要改表形，请同笔改 scripts/check-menu-slots-doc-sync.mjs 的解析口径。`,
      });
      continue;
    }
    const collected = new Set();
    for (const row of p.rows) for (const s of row.slots) collected.add(s);
    parsed.set(d.label, collected);
  }
  if (parsed.size !== docs.length) return violations; // 表都没了 ⇒ 后面的比对没有意义

  // ① 账 → 表：账里每个槽位值都要被作者面列到（作者读不到 ⇒ 抄不出来，或抄成自己想当然的名字）
  for (const [label, set] of parsed) {
    for (const v of slotValues) {
      if (set.has(v)) continue;
      violations.push({
        kind: "slot-not-in-doc",
        msg:
          `${label}：账（${SLOTS_LEDGER_REL}）里有槽位 \`${v}\`，作者面的槽位表里没有——` +
          `作者读不到它，就会**自造**一个（自造槽位没有宿主渲染方 ⇒ 项不出现，且不报错）。` +
          `改法：补进表里（**两棵树都要**）。`,
      });
    }
  }

  // ② 表 → 账：表里只许出现账里的值（多出来的一律红——那是「文档发明了一个宿主不认的槽位」）
  for (const [label, set] of parsed) {
    for (const v of set) {
      if (ledger.has(v)) continue;
      violations.push({
        kind: "slot-not-in-ledger",
        msg:
          `${label}：槽位表里列了 \`${v}\`，但账（${SLOTS_LEDGER_REL}）里没有这个**值**——` +
          `要么是笔误，要么写成了宿主 \`MENU_SLOTS\` 的**成员名**（\`FileContext\` 那类：只差大小写，\`check-menu-slot-case\` 也拦）。` +
          `两种都让作者抄出一个**死键**（菜单项不出现、不报错）。改法：改成账里的值（小驼峰），或先想清楚是不是自造槽位——` +
          `自造槽位可以写进正文，但**不进这张表**。`,
      });
    }
  }

  // ③ 中英两棵树：同一张表的两个译本，集合必须相等
  if (parsed.size === 2) {
    const [a, b] = docs.map((d) => d.label);
    const pa = parsed.get(a);
    const pb = parsed.get(b);
    const onlyA = [...pa].filter((x) => !pb.has(x));
    const onlyB = [...pb].filter((x) => !pa.has(x));
    if (onlyA.length > 0 || onlyB.length > 0) {
      violations.push({
        kind: "doc-drift",
        msg:
          `两棵树的槽位集合不一致：${a} 独有 [${onlyA.sort().join("、")}]；${b} 独有 [${onlyB.sort().join("、")}]。` +
          `中英是同一张表的两个译本，必须同笔改。`,
      });
    }
  }

  return violations;
}

/** 主流程（仅直接运行时执行；被 import 时只暴露判据函数） */
async function main() {
  if (process.argv.slice(2).includes("--self-test")) {
    const { selfTest } = await import("./check-menu-slots-doc-sync.test.mjs");
    process.exit(selfTest());
  }

  for (const d of DOCS) {
    if (!existsSync(resolve(ROOT, d.rel))) {
      console.error(`❌ [menu-slots-doc] 作者面文档不存在：${d.rel}`);
      process.exit(1);
    }
  }
  const slotValues = loadSlotValues();
  const docs = DOCS.map((d) => ({ lang: d.lang, label: d.label, text: readFileSync(resolve(ROOT, d.rel), "utf8") }));
  const violations = checkMenuSlotsDocs({ docs, slotValues });

  if (violations.length === 0) {
    console.log(
      `✅ [menu-slots-doc] 「菜单贡献点」两棵树的槽位表与账 ${SLOTS_LEDGER_REL} 双向一致（槽位 ${slotValues.length} 个 · 两棵树相等）。`,
    );
    process.exit(0);
  }
  console.error(`❌ [menu-slots-doc] ${violations.length} 处不一致（菜单槽位清单的单一真相源）：`);
  for (const v of violations) console.error(`   · [${v.kind}] ${v.msg}`);
  console.error(
    `   要对齐的三份：① 真源 ${SLOTS_LEDGER_REL}（＝壳 MENU_SLOTS 的投影）↔ ② ${DOCS[0].rel} ↔ ③ ${DOCS[1].rel}。` +
      `判据见 scripts/check-menu-slots-doc-sync.mjs 文件头。`,
  );
  process.exit(1);
}

if (IS_MAIN) main();
