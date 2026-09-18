#!/usr/bin/env node
/**
 * 退役登记对账门禁（E6#116）——**账自己自不自洽**（⛔ 不看插件、⛔ 不是黑名单、⛔ 不拦任何东西）。
 *
 * 用法：
 *   node scripts/check-retired-ledger.mjs              # 门禁（已挂 npm run check）
 *   node scripts/check-retired-ledger.mjs --json       # 人读那套之外多一段 JSON
 *   node scripts/check-retired-ledger.mjs --self-test  # 自测（正控 1 ／ 负控 5 ／ 计数 1）
 *
 * ── 它判什么（形状 ＋ 三条断言；口径的唯一真相源 = `scripts/lib/retired-ledger.mjs`）──
 *   形状：7 字段齐 ／ `kind` 在词表内 ／ `since` 是日期 ／ `approvedBy` 是 `用户 · YYYY-MM-DD` ／ 不重名。
 *   断言 1 **退役的必须真退役**：退役名不许还挂在**插件能用的活面**（①②③ 栏）上；
 *     `configKey` 另判「**还有没有写入 / 声明点**」（账对退役键的定义就是「现已不再写入」）。
 *   断言 2 **有落点必须绑得住**：`landing` 写的 `file:line` ⇒ 文件在 ＋ 名字在该文件里（**不判行号**，行会漂）。
 *   断言 3 **真删除不许含混**：`landing: "无落点"` ⇒ 全仓**代码**再 grep 不到它
 *     （账的三份拷贝**不算**——账记它正是它的存档；`.md` 也不算，作者面正要写「它已退役」）。
 *
 * ── 三条硬边界（改之前先读）──
 *   ① 🔴 **本表不是黑名单**：门禁只判「账是否自洽」，⛔ 绝不拿 `retired[]` 去拦插件（拦 = 拒绝墙，本批不做）。
 *   ② 🔴 **`approvedBy` 的机械形态**：`用户 · YYYY-MM-DD`——维护者 AI 自己签 ⇒ 当场红（禁区②）。
 *   ③ 🔴 **「有登记即放行」的唯一归属在格 2 的红出口**（`scripts/check-api-surface-additive.mjs` 用
 *      `exemptionFor` 放行缺项）；本门禁**只管账内部**，⛔ 两条逻辑不同时存在（双份口径 = 迟早对不上）。
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectApiSurface, flattenSurface } from "./lib/api-surface.mjs";
import { ROOT } from "./lib/host-surface.mjs";
import {
  KIND_COLUMNS,
  LEDGER_REL,
  NO_LANDING,
  checkRegistry,
  ledgerExists,
  readRegistry,
  scanNameInHost,
  scanWriteShapeInHost,
} from "./lib/retired-ledger.mjs";

const SELF_TEST = process.argv.includes("--self-test");
const JSON_OUT = process.argv.includes("--json");

function describe(e) {
  const rep = e?.replacedBy ? e.replacedBy : "无替身";
  return `${e?.name}（${e?.kind} · ${e?.since}）→ 替身 ${rep} ｜ 落点 ${e?.landing}`;
}

function run() {
  if (!ledgerExists()) {
    console.log(`🔴 retired-ledger：账文件不在（${LEDGER_REL}）⇒ **拒绝判定**（⛔ 不静默放行，缺读数不是 0 条）。`);
    return 1;
  }
  let registry;
  try {
    registry = readRegistry();
  } catch (err) {
    console.log(`🔴 retired-ledger：账读不动（${LEDGER_REL}）——${err.message}`);
    return 2;
  }
  let facePaths;
  try {
    facePaths = flattenSurface(collectApiSurface());
  } catch (err) {
    console.log(`🔴 retired-ledger：面重算失败 ⇒ **拒绝判定**（不静默放行）：${err.message}`);
    return 2;
  }

  const violations = checkRegistry(registry, {
    facePaths,
    exists: (rel) => existsSync(resolve(ROOT, rel)),
    readText: (rel) => readFileSync(resolve(ROOT, rel), "utf8"),
    scanAlive: (name) => scanNameInHost(name),
    scanWriteShape: (name) => scanWriteShapeInHost(name),
  });

  console.log(
    `retired-ledger：\`${LEDGER_REL}\` 的 retired[] —— ${registry.length} 条（形状 7 字段 ／ kind 词表 ` +
      `${Object.keys(KIND_COLUMNS).length} 档 ／ 签名形态 \`用户 · YYYY-MM-DD\` ／ 比对面 ${facePaths.length} 条）`,
  );
  for (const e of registry) console.log(`   · ${describe(e)}`);

  if (violations.length > 0) {
    console.log(`\n🔴 退役登记 ${violations.length} 处不自洽：\n`);
    for (const v of violations) console.log(`   [${v.assertion}] ${v.msg}`);
    console.log(`\n   怎么修（按报的断言选）：`);
    console.log(`     · 形状 ⇒ 补字段 / 改 kind / \`since\` 写日期 / \`approvedBy\` 必须是**用户本人**签的日期`);
    console.log(`     · 断言1 ⇒ 它还活着（或还挂在插件能用的活面上）⇒ 要么改回代码，要么这条登记写错了`);
    console.log(`     · 断言2 ⇒ 落点写错（文件不在 / 名字不在文件里）⇒ 把 \`landing\` 指到真活口上`);
    console.log(`     · 断言3 ⇒ 它其实还在仓里 ⇒ 把 \`landing\` 从「${NO_LANDING}」改成真活口`);
    if (JSON_OUT) console.log(JSON.stringify({ ledger: LEDGER_REL, count: registry.length, violations }, null, 2));
    return 1;
  }

  console.log(
    `✅ 形状 ＋ 三条断言全过（0 违例）：退役的必须真退役 ／ 有落点必须绑得住 ／ 真删除不许含混。`,
  );
  console.log(`   ⚠️ 本门禁只管账自己：\`retired[]\` ⛔ 不许被任何门禁拿去拦插件（那是拒绝墙，本批不做）。`);
  if (JSON_OUT) console.log(JSON.stringify({ ledger: LEDGER_REL, count: registry.length, violations: [] }, null, 2));
  return 0;
}

/* ══════════════════════════════════════════════════════════════════════════
   自测——正控（该绿的真绿）／负控（该红的真红）／计数。**纯桩，不读仓库**。
   ══════════════════════════════════════════════════════════════════════════ */

/** 一条形状齐整的登记（首条真登记的模板：`app.themeColorMode`） */
function entry(over = {}) {
  return {
    name: "app.themeColorMode",
    kind: "configKey",
    since: "2026-03-14",
    why: "并入 app.theme（颜色模式改走 appearance 配方）",
    replacedBy: "app.theme",
    landing: "src/App/startup.ts:246（仍被读 + 清扫）",
    approvedBy: "用户 · 2026-09-18",
    ...over,
  };
}

/** 正常仓库的桩 io：落点文件在、名字在文件里、没有写入点、没有别处代码站点 */
function ioStub(over = {}) {
  return {
    facePaths: ["ledger.configKeys.app.themeColorMode", "hostClassNames.ldk-brand"],
    exists: () => true,
    readText: () => `const tcm = inspectConfiguration<string>("app.themeColorMode");`,
    scanAlive: () => [],
    scanWriteShape: () => [],
    ...over,
  };
}

function selfTest() {
  const cases = [];
  const push = (name, ok, detail) => cases.push({ name, ok, detail });
  const assertions = (vs) => vs.map((v) => v.assertion);

  // ── 正控 ──
  {
    // 首条真登记**必须绿**：它按设计还留在 ledger.configKeys（不腾位）⇒ ④ 栏不算「还活着」，
    // 而它的活口是「读 + 清扫」，不是写入点。
    const vs = checkRegistry([entry()], ioStub());
    push(
      "正控1：首条真登记（app.themeColorMode：留在账里＋只有读/清扫活口）⇒ 0 违例",
      vs.length === 0,
      JSON.stringify(vs),
    );
  }

  // ── 负控 ──
  {
    // 判据②：登记一个**还活着的**配置键（它还有写入/声明点）⇒ 红
    const vs = checkRegistry([entry({ name: "app.themeColor", replacedBy: null })], ioStub({ scanWriteShape: () => ["src/App/config/appearance.ts:108"] }));
    push(
      "负控A（判据②）：登了还活着的 app.themeColor（有写入/声明点）⇒ 断言1 红",
      assertions(vs).includes("断言1") && /写入 \/ 声明点/.test(vs[0].msg),
      JSON.stringify(vs),
    );
  }
  {
    // 判据③：landing 写「无落点」但名字其实还在代码里 ⇒ 红
    const vs = checkRegistry([entry({ landing: `${NO_LANDING}（已彻底删除）` })], ioStub({ scanAlive: () => ["src/App/startup.ts:246"] }));
    push("负控B（判据③）：无落点却还在仓里 ⇒ 断言3 红", assertions(vs).includes("断言3"), JSON.stringify(vs));
  }
  {
    // 判据④的账侧半边：退役名还挂在**插件能用的活面**上（类名）⇒ 红
    const vs = checkRegistry([entry({ name: "ldk-brand", kind: "class", replacedBy: null })], ioStub());
    push("负控C：退役类名还挂在 hostClassNames 活面上 ⇒ 断言1 红", assertions(vs).includes("断言1"), JSON.stringify(vs));
  }
  {
    // 落点绑不住：文件在，但里面找不到这个名字 ⇒ 红（行号不判——本例故意写了个不存在的行号）
    const vs = checkRegistry([entry({ landing: "src/App/startup.ts:99999" })], ioStub({ readText: () => "// 这文件里没那个名字" }));
    push("负控D：落点文件在、名字不在 ⇒ 断言2 红（⛔ 不判行号：99999 行本身不报）", assertions(vs).includes("断言2"), JSON.stringify(vs));
  }
  {
    // 禁区②的机械形态：AI 自己签的字当场红
    const vs = checkRegistry([entry({ approvedBy: "AI · 2026-09-18" })], ioStub());
    push("负控E（禁区②）：approvedBy 不是「用户 · 日期」⇒ 形状红", assertions(vs).includes("形状"), JSON.stringify(vs));
  }

  // ── 计数 ──
  {
    // 账形状坏了（retired 不是数组）⇒ 形状红且**不往下走**（别在坏账上跑三条断言）
    const a = checkRegistry({ nope: true }, ioStub());
    // 一条登记 → 违例数 = 正控那套的补集：这里数「一次真跑的违例条数」
    const b = checkRegistry([entry(), entry({ name: "app.mixColor", kind: "configKey", replacedBy: null, landing: `${NO_LANDING}` })], ioStub({ scanAlive: () => [] }));
    push(
      "计数：retired 不是数组 ⇒ 形状 1 条且短路；两条登记（一条真删无落点）⇒ 0 违例",
      a.length === 1 && a[0].assertion === "形状" && b.length === 0,
      JSON.stringify({ a, b }),
    );
  }

  const bad = cases.filter((c) => !c.ok);
  for (const c of cases) console.log(`${c.ok ? "✅" : "🔴"} ${c.name}${c.ok ? "" : `\n     ↳ ${c.detail}`}`);
  console.log(
    bad.length === 0
      ? `\n✅ check-retired-ledger self-test 全过（${cases.length} 例：正控 1 ／ 负控 5 ／ 计数 1）——门禁不是在恒绿。`
      : `\n🔴 check-retired-ledger self-test ${bad.length} 例不符（共 ${cases.length} 例）。`,
  );
  return bad.length === 0 ? 0 : 1;
}

if (SELF_TEST) process.exit(selfTest());
process.exit(run());
