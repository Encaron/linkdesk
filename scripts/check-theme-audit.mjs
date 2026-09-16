/**
 * 机械检查：主题数据防回潮——`toggle-knob-on` 不得与 `accent` 同色。
 *
 * E5.8#144（2026-08-27 用户拍板加 audit）：toggle 开关 ON 态「轨道=旋钮」同色整团淹掉——
 * 根因之一 = 主题数据把 toggle-knob-on 设成与 accent 同值（4 主题全中）。机制 fallback 兜底
 * 「当前」（index.css:216 fallback → text-on-accent），本脚本兜底「未来」——主题作者再写同值
 * 被 `npm run check` 拦下（与 #130 CSS 消费面审计门禁同族）。
 *
 * 用法：node scripts/check-theme-audit.mjs
 *       node scripts/check-theme-audit.mjs --self-test
 * 退出码 0 = 全部合规，退出码 1 = 有违规（打印到 stderr）。
 *
 * 规则：扫描 plugins 下各插件 themes 目录的 JSON，对每个主题每个 colorway：若 colors 同时含
 * `toggle-knob-on` 与 `accent`，二者必须不同色。缺 toggle-knob-on 的主题（走 fallback
 * → text-on-accent）天然合规，跳过。
 *
 * ── 🔴 E6#109p-b（1.28）补自测 ──
 *   1.27 体检结论：本门禁**没有自测**，是 34 道 `check-*` 里的「假活」之一——今天扫描对象为 0
 *   却照常打印 ✅。本轮抽出纯判据 `export function colorwayConflicts(theme)`（吃**已解析**的主题
 *   对象，不碰文件系统）＋ `--self-test`（内存夹具，正控绿 / 负控红）。
 *   ⛔ 判据语义、现有输出格式、`keyLine` 行号定位与退出码**全不变**；那段「覆盖域变更（E6#99）」
 *   的 ⚠️ 提示是全链的诚实样板，**保持不动**。
 */

import { readFileSync, readdirSync } from "fs";
import { resolve, dirname, join, relative } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

/** 收集 plugins/ 下所有 themes/*.json（排除 node_modules） */
function collectThemeFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules") {
      files.push(...collectThemeFiles(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".json") &&
      entry.name !== "plugin.json" &&
      entry.name !== "package.json"
    ) {
      // 只收 themes/ 目录下的主题定义（plugin.json/package.json 混在同目录时排除）
      if (dir.split(/[\\/]/).includes("themes")) files.push(full);
    }
  }
  return files;
}

/** 定位 colors 对象内某键的起始行号（1-based） */
function keyLine(raw, key) {
  const idx = raw.indexOf(`"${key}"`);
  if (idx === -1) return 0;
  return raw.slice(0, idx).split("\n").length;
}

/**
 * 纯判据（`--self-test` 与 main() 用的是**同一个函数**）：吃已解析的主题对象，
 * 返回该主题里所有「`accent` 与 `toggle-knob-on` 同色」的 colorway。
 * 每条 = `{ index, id, accent, knobOn }`（id 缺省回落到索引）。
 *
 * 边界（全部在自测里钉住，不崩）：
 *   · `colorways` 缺失 / 非数组 ⇒ 空数组；
 *   · colorway 为 null、`colors` 缺失或为 null ⇒ 视为无 colors，跳过；
 *   · 缺 `accent` 或缺 `toggle-knob-on`（后者走 fallback → text-on-accent）⇒ 天然合规，跳过。
 */
export function colorwayConflicts(theme) {
  const colorways = Array.isArray(theme?.colorways) ? theme.colorways : [];
  const out = [];
  for (const [i, cw] of colorways.entries()) {
    const colors = cw?.colors ?? {};
    const accent = colors.accent;
    const knobOn = colors["toggle-knob-on"];
    // 缺 toggle-knob-on（走 fallback → text-on-accent）天然合规
    if (accent === undefined || knobOn === undefined) continue;
    if (knobOn !== accent) continue;
    out.push({ index: i, id: cw.id ?? i, accent, knobOn });
  }
  return out;
}

// ────────────────────────────────── 自测 ──────────────────────────────────

/**
 * 正控 = 合规输入 ⇒ 判据必须**零违规**（绿）；负控 = 违规输入 ⇒ 必须**报出**（红）。
 * 每例真跑 `colorwayConflicts` 并断言实得条数（个别例另断言内容），不靠「应该会红」的自觉。
 */
function runSelfTest() {
  const SAME = { accent: "#112233", "toggle-knob-on": "#112233" };
  const DIFF = { accent: "#112233", "toggle-knob-on": "#ffffff" };

  const cases = [
    // ── 正控：合规 ⇒ 0 条（绿） ──
    ["正控①：异色（accent #112233 / toggle-knob-on #ffffff）⇒ 0 条", { colorways: [{ id: "dark", colors: DIFF }] }, 0],
    [
      "正控②：缺 toggle-knob-on（走 fallback → text-on-accent）⇒ 0 条",
      { colorways: [{ id: "dark", colors: { accent: "#112233" } }] },
      0,
    ],
    ["正控③：缺 accent ⇒ 0 条", { colorways: [{ id: "dark", colors: { "toggle-knob-on": "#112233" } }] }, 0],
    ["正控④：`colorways` 缺失 ⇒ 0 条（不崩）", { name: "无 colorways" }, 0],
    ["正控⑤：`colorways` 非数组（对象）⇒ 0 条（不崩）", { colorways: { 0: { colors: SAME } } }, 0],
    ["正控⑥：`colors` 为 null ⇒ 0 条（不崩）", { colorways: [{ id: "dark", colors: null }] }, 0],
    ["正控⑦：colorway 为 null ⇒ 0 条（不崩）", { colorways: [null] }, 0],
    ["正控⑧：空 `colorways` 数组 ⇒ 0 条", { colorways: [] }, 0],
    ["正控⑨：主题整体为 null ⇒ 0 条（不崩）", null, 0],
    ["正控⑩：缺 `colors` 键 ⇒ 0 条", { colorways: [{ id: "dark" }] }, 0],

    // ── 负控：违规 ⇒ 必须报出（红） ──
    [
      "负控①：同色（两色皆 #112233）⇒ 1 条（含索引/id/两色值实证）",
      { colorways: [{ id: "dark", colors: SAME }] },
      1,
      (got) => got[0].index === 0 && got[0].id === "dark" && got[0].accent === "#112233" && got[0].knobOn === "#112233",
    ],
    [
      "负控②：两个 colorway 都同色 ⇒ 2 条",
      { colorways: [{ id: "dark", colors: SAME }, { id: "light", colors: SAME }] },
      2,
    ],
    [
      "负控③：3 个 colorway 只有第 2 个同色 ⇒ 1 条（须指向 index 1）",
      { colorways: [{ id: "a", colors: DIFF }, { id: "mid", colors: SAME }, { id: "c", colors: DIFF }] },
      1,
      (got) => got[0].index === 1 && got[0].id === "mid",
    ],
    ["负控④：colorway 无 id ⇒ 1 条（id 回落索引）", { colorways: [{ colors: SAME }] }, 1, (got) => got[0].id === 0],
  ];

  let bad = 0;
  for (const [tag, theme, want, verify] of cases) {
    const got = colorwayConflicts(theme);
    let pass = got.length === want;
    if (pass && verify) pass = verify(got);
    if (!pass) bad++;
    process.stdout.write(`${pass ? "✅" : "🔴"} ${tag} —— 实得 ${got.length} 条\n`);
    if (!pass) process.stdout.write(`      · 期望 ${want} 条，实得 ${JSON.stringify(got)}\n`);
  }
  process.stdout.write(
    bad === 0
      ? `\n✅ check-theme-audit self-test 全过（${cases.length} 例：正控绿 / 负控红）——尺子不是在恒绿。\n`
      : `\n🔴 check-theme-audit self-test ${bad} 例不符。\n`,
  );
  process.exit(bad === 0 ? 0 : 1);
}

// ────────────────────────────────── 主流程 ──────────────────────────────────

function main() {
  if (process.argv.includes("--self-test")) return runSelfTest();

  const pluginsDir = resolve(ROOT, "plugins");
  const themeFiles = collectThemeFiles(pluginsDir);

  let totalViolations = 0;

  for (const file of themeFiles) {
    const raw = readFileSync(file, "utf-8");
    let theme;
    try {
      theme = JSON.parse(raw);
    } catch (e) {
      // 非主题 JSON（schema 等）——跳过；解析失败留给其他门禁
      continue;
    }
    for (const c of colorwayConflicts(theme)) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      const line = keyLine(raw, "toggle-knob-on") || 0;
      console.error(
        `  ${rel}:${line}  ⚠  colorway「${c.id}」toggle-knob-on(${c.knobOn}) 与 accent(${c.accent}) 同色——` +
          `ON 态轨道=旋钮整团糊（E5.8#144）。应改为 text-on-accent 值或删键走 fallback。`
      );
      totalViolations++;
    }
  }

  if (totalViolations > 0) {
    console.error(`\n❌ ${totalViolations} 处 toggle-knob-on=accent 同色违规——请修主题数据。`);
    process.exit(1);
  }

  // 🔴 E6#99（L7 第 7.2 轮）：**覆盖域变更要明说，不许真空绿灯**。
  //   本门禁扫 `plugins/<id>/themes/*.json`，而 10 只主题插件 + 1 只图标集插件均已外移独立仓
  //   ⇒ 仓内 themeFiles 归零。归零时下面这行会把话说清楚（否则「0 个对象 → 无违规 → ✅」会被误读成
  //   「主题都查过了」）。真正的检查随插件走：各插件仓自己的 CI（7.5 轮落）。
  if (themeFiles.length === 0) {
    console.log(
      "⚠ 覆盖域变更（E6#99）：仓内 plugins/ 下 0 个主题文件——本门禁当前**无对象**（≠「主题都合规」）。" +
        "\n   原因：主题/图标集插件的源码已外移各自独立仓，本仓只剩两只不含 themes/ 的开发夹具。" +
        "\n   去向：主题数据检查随插件走，由各插件仓自己的 CI 负责（7.5 轮落）。"
    );
  }
  console.log(`✅ 全部主题 toggle-knob-on ≠ accent（ON 态旋钮与轨道可区分）。已扫 ${themeFiles.length} 个主题文件。`);
}

main();
