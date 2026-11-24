#!/usr/bin/env node
/**
 * 「有视图声明却零命令」审计尺 —— **只报不拦**。
 *
 * ── 它守的是哪句话 ──
 *   插件被 AI 操作**唯一**的途径是「它注册了命令」（见 `docs/03-插件制造/21-插件命令化规范.md`）。
 *   于是一条**静态信号**可以直接机械查：「**声明了视图（= 有界面给人点）却一条命令都没有**」——
 *   这类插件的每个动作都只活在界面上，快捷键、命令面板与 AI **全部够不着**。
 *
 * ── 🔴 只报不拦（硬纪律，与审计族同款）──
 *   ⛔ **不进 `npm run check` / CI / 各仓 `ci-verify.mjs`**：存量插件一定会被报出（本尺首跑即 2 只），
 *   上拦会当场退化成**假门禁**——所有人学会了绕开它，真红也就失效了。
 *   （同款纪律先例：L11 插件测试覆盖尺 `audit-plugin-tests.mjs`。）退出码**恒 0**。
 *   ⛔ 不引百分比、不设阈值、不判红黄灯：本尺**只出名单**，改不改由各插件作者定（规范不追溯存量）。
 *
 * ── 判据（一句话）──
 *   `contributes.views` 声明了 ≥1 个视图 **且** `contributes.commands` 为空/缺失 ⇒ 报进名单。
 *   ⚠️ 边界（都在自测里有正控，⛔ 别收紧成「无命令就报」）：
 *     · **无视图无命令**（主题包 / 语言包）⇒ **不报**——它们没有"界面上的动作"这回事；
 *     · **有命令无视图**（数据型 / 服务型插件）⇒ **不报**；
 *     · `views: { sidebar: [] }` 这种**空容器** ⇒ 视图数算 0 ⇒ **不报**（声明了空数组不是"有视图"）。
 *
 * ── 附带第二份名单（AI 面质量，非本尺判据）──
 *   「命令一条不缺、但**整批缺 `description`**」——AI 选命令**就看那一句**（`description` 写意图），
 *   缺了它命令在 AI 眼里只剩一个 id。本尺**只列数**，不判死。
 *
 * ── 附带第三份名单（S7 风险声明面，非本尺判据）──
 *   「命令缺 `risk` 或 risk 值非法」——S7 兜底 R2 下这些命令会被 AI 档位**逐次问**（想免确认
 *   必须显式声明 `risk: "R0"`）。本尺**只列数**，不判死；值只认 `"R0"`–`"R3"` 字符串。
 *
 * ── 输入从哪来 ──
 *   仓发现与官方名单来源走 `scripts/lib/plugin-repos.mjs`（**单一真相源**，与 `audit-plugin-tests.mjs` 同一份）；
 *   `plugin.json` 是 **JSONC**（注释 + 尾逗号），解析走同一 lib 的 `readManifestJson`（与壳侧同一套 parser 口径）。
 *
 * 用法：
 *   node scripts/audit-plugin-commands.mjs [容器目录] [--json]
 *   node scripts/audit-plugin-commands.mjs --self-test     # 判据自测（正控/负控；⛔ 不进 npm run check）
 *   或 npm run audit:plugin-commands / audit:plugin-commands:json / audit:plugin-commands:selftest
 *   容器默认 E:/linkdesk-plugins（可被 LINKDESK_PLUGIN_CONTAINER 覆盖）
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverPluginRepos, officialPluginIds, readManifestJson } from "./lib/plugin-repos.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_SCRIPT = path.join(ROOT, "scripts", "sync-plugin-agents.mjs");
const CONTAINER = process.argv.slice(2).find((a) => !a.startsWith("--")) || process.env.LINKDESK_PLUGIN_CONTAINER || "E:/linkdesk-plugins";
const JSON_OUT = process.argv.includes("--json");

/* ─────────────────────────── 判据（纯函数，自测直接打它） ─────────────────────────── */

/** 风险级合法值（S7：字符串 "R0"–"R3"；⛔ 数字 0–3） */
const RISKS = new Set(["R0", "R1", "R2", "R3"]);

/** `views` 两种形态都认：对象 `{ container: [view,…] }` 与数组 `[view,…]`；空容器算 0。 */
function countViews(views) {
  if (Array.isArray(views)) return views.length;
  if (views && typeof views === "object") {
    return Object.values(views).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
  }
  return 0;
}

function countItems(v) {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v).length;
  return 0;
}

/**
 * 一只插件的命令化体检。
 * @param {{id: string, manifest?: any, official?: boolean, parseError?: string|null}} input
 * @returns {{id, official, views, containers, commands, noDescription, noTitle, noRisk, badRisk, verdict, parseError}}
 *   verdict: "views-no-commands"（本尺判据）| "ok" | "commands-only" | "silent" | "unreadable"
 *   noRisk = 缺 risk 声明的命令数；badRisk = 声明了但值非 "R0"–"R3" 的命令数（S7 黄灯名单，只报不拦）
 */
export function judgePlugin({ id, manifest, official = true, parseError = null }) {
  if (parseError || !manifest || typeof manifest !== "object") {
    return { id, official, views: 0, containers: 0, commands: 0, noDescription: 0, noTitle: 0, noRisk: 0, badRisk: 0, verdict: "unreadable", parseError: parseError || "清单不可读" };
  }
  const c = manifest.contributes || {};
  const views = countViews(c.views);
  const containers = countItems(c.viewsContainers);
  const cmds = Array.isArray(c.commands) ? c.commands : [];
  const commands = cmds.length;
  const noDescription = cmds.filter((x) => !x || typeof x.description !== "string" || x.description.trim() === "").length;
  const noTitle = cmds.filter((x) => !x || typeof x.title !== "string" || x.title.trim() === "").length;
  const noRisk = cmds.filter((x) => !x || x.risk === undefined || x.risk === null || x.risk === "").length;
  const badRisk = cmds.filter((x) => x && x.risk !== undefined && x.risk !== null && x.risk !== "" && !(typeof x.risk === "string" && RISKS.has(x.risk.trim()))).length;

  let verdict = "silent";
  if (views > 0 && commands === 0) verdict = "views-no-commands";
  else if (views > 0) verdict = "ok";
  else if (commands > 0) verdict = "commands-only";

  return { id, official, views, containers, commands, noDescription, noTitle, noRisk, badRisk, verdict, parseError: null };
}

/* ─────────────────────────── 自测（正控/负控） ─────────────────────────── */

function selfTest() {
  const C = (name, got, want) => ({ name, ok: JSON.stringify(got) === JSON.stringify(want), got, want });
  /** 只取 S7 risk 计数两字段（C 是全对象严格比，⛔ 直接比整对象） */
  const riskOf = (inp) => {
    const j = judgePlugin(inp);
    return { noRisk: j.noRisk, badRisk: j.badRisk };
  };
  const cases = [
    C("正控① 有视图 ＋ 有命令 ⇒ ok（不进名单）", judgePlugin({ id: "a", manifest: { contributes: { views: { sidebar: [{ id: "v" }] }, commands: [{ id: "a.x", title: "X", description: "d" }] } } }).verdict, "ok"),
    C("负控① 有视图 ＋ 无 commands 键 ⇒ 报", judgePlugin({ id: "b", manifest: { contributes: { views: { sidebar: [{ id: "v" }] } } } }).verdict, "views-no-commands"),
    C("负控② 有视图 ＋ `commands: []` **空数组** ⇒ 报（空数组 ≠ 有命令）", judgePlugin({ id: "c", manifest: { contributes: { views: { sidebar: [{ id: "v" }] }, commands: [] } } }).verdict, "views-no-commands"),
    C("正控② 无视图无命令（主题/语言包）⇒ silent", judgePlugin({ id: "d", manifest: { contributes: { themes: [{ id: "t" }] } } }).verdict, "silent"),
    C("正控③ 有命令无视图（数据型插件）⇒ commands-only（不报）", judgePlugin({ id: "e", manifest: { contributes: { commands: [{ id: "e.x" }] } } }).verdict, "commands-only"),
    C("负控③ views 是**数组**形态 ⇒ 计数正确且仍报", judgePlugin({ id: "f", manifest: { contributes: { views: [{ id: "v1" }, { id: "v2" }] } } }).views, 2),
    C("负控③b 同一形态的判定", judgePlugin({ id: "f", manifest: { contributes: { views: [{ id: "v1" }] } } }).verdict, "views-no-commands"),
    C("正控④ **空容器**（views:{sidebar:[]}）⇒ 视图数 0、不报（⛔ 不收紧成假红）", judgePlugin({ id: "g", manifest: { contributes: { views: { sidebar: [] } } } }).verdict, "silent"),
    C("正控⑤ 缺 description 只数不判死：3 条命令 2 条无说明 ⇒ noDescription=2 且判定仍 ok", judgePlugin({ id: "h", manifest: { contributes: { views: { sidebar: [{ id: "v" }] }, commands: [{ id: "h.1", title: "A" }, { id: "h.2", title: "B" }, { id: "h.3", title: "C", description: "d" }] } } }).noDescription, 2),
    C("正控⑤b 同一条的判定（缺说明不进「零命令」名单）", judgePlugin({ id: "h", manifest: { contributes: { views: { sidebar: [{ id: "v" }] }, commands: [{ id: "h.1", title: "A" }] } } }).verdict, "ok"),
    C("负控④ 清单不可读（解析失败）⇒ unreadable（fail-visible，⛔ 不静默跳过）", judgePlugin({ id: "i", parseError: "JSONC 语法错误：第 9 行" }).verdict, "unreadable"),
    C("负控④b manifest 为 null 也不崩", judgePlugin({ id: "j", manifest: null }).verdict, "unreadable"),
    C("负控⑤ views 是字符串（坏数据）⇒ 视图数 0、不崩", judgePlugin({ id: "k", manifest: { contributes: { views: "sidebar" } } }).views, 0),
    C("正控⑥ S7 risk 齐全：3 条全声明合法值 ⇒ noRisk=0/badRisk=0", riskOf({ id: "l", manifest: { contributes: { commands: [{ id: "l.1", risk: "R0" }, { id: "l.2", risk: "R2" }, { id: "l.3", risk: "R3" }] } } }), { noRisk: 0, badRisk: 0 }),
    C("负控⑥ S7 缺 risk：2 缺 1 非法值 ⇒ noRisk=2/badRisk=1（黄灯名单，不判死）", riskOf({ id: "m", manifest: { contributes: { commands: [{ id: "m.1" }, { id: "m.2", risk: "R1" }, { id: "m.3" }, { id: "m.4", risk: "5" }] } } }), { noRisk: 2, badRisk: 1 }),
    C("负控⑥b 数字 risk（旧写法 0–3）算非法值", riskOf({ id: "n", manifest: { contributes: { commands: [{ id: "n.1", risk: 0 }] } } }), { noRisk: 0, badRisk: 1 }),
  ];
  const bad = cases.filter((x) => !x.ok);
  console.log("[plugin-commands] 自测（判据纯函数，正控绿 / 负控红）：");
  for (const x of cases) console.log(`  ${x.ok ? "✓" : "✗"} ${x.name}${x.ok ? "" : `（实得 ${JSON.stringify(x.got)}，期望 ${JSON.stringify(x.want)}）`}`);
  console.log(`[plugin-commands] 自测判定：${bad.length === 0 ? "✓ 全过" : `✗ FAIL（${bad.length}/${cases.length}）`}`);
  return bad.length === 0 ? 0 : 1;
}

if (process.argv.slice(2).includes("--self-test")) process.exit(selfTest());

/* ─────────────────────────── 主流程（只读盘点） ─────────────────────────── */

const ids = officialPluginIds(AGENTS_SCRIPT);
const repos = discoverPluginRepos(CONTAINER).map((r) => {
  const parsed = readManifestJson(path.join(r.dir, "plugin.json"));
  return {
    group: r.group,
    ...judgePlugin({
      id: r.id,
      manifest: parsed.ok ? parsed.manifest : null,
      parseError: parsed.ok ? null : parsed.why,
      official: ids ? ids.has(r.id) : true,
    }),
  };
});

const flagged = repos.filter((r) => r.verdict === "views-no-commands");
const unreadable = repos.filter((r) => r.verdict === "unreadable");
const noDescRepos = repos.filter((r) => r.commands > 0 && r.noDescription === r.commands);
const riskYellow = repos.filter((r) => r.commands > 0 && r.noRisk + r.badRisk > 0);
const inventory = {
  repos: repos.length,
  withViews: repos.filter((r) => r.views > 0).length,
  withCommands: repos.filter((r) => r.commands > 0).length,
  both: repos.filter((r) => r.views > 0 && r.commands > 0).length,
  neither: repos.filter((r) => r.views === 0 && r.commands === 0).length,
  unreadable: unreadable.length,
};

const payload = {
  container: CONTAINER,
  officialListSource: ids ? "scripts/sync-plugin-agents.mjs FACTS 表" : null,
  officialListWarning: ids ? null : "官方仓名单读取失败（按全部官方报）",
  criterion: "contributes.views ≥1 且 contributes.commands 空/缺 ⇒ 有视图声明却零命令",
  repos,
  inventory,
  flagged: flagged.map((r) => ({ id: r.id, views: r.views, containers: r.containers })),
  riskYellow: riskYellow.map((r) => ({ id: r.id, commands: r.commands, noRisk: r.noRisk, badRisk: r.badRisk })),
};

if (JSON_OUT) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const pad = (s, w) => {
  const str = String(s);
  const d = displayWidth(str);
  return d >= w ? str : str + " ".repeat(w - d);
};
/** 显示宽度（CJK 全角算 2）——表里混着中文列名与「（第三方·只读）」后缀，不按宽度补就错位 */
function displayWidth(s) {
  let w = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0);
    w += c >= 0x1100 && (c <= 0x115f || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6)) ? 2 : 1;
  }
  return w;
}

const VERDICT_TAG = {
  "views-no-commands": "⚠️ 有视图零命令",
  ok: "✅ 有视图有命令",
  "commands-only": "— 只有命令（无视图）",
  silent: "— 无视图无命令（主题/语言包一类）",
  unreadable: "🔴 清单不可读",
};

console.log(`[plugin-commands] 容器 ${CONTAINER} · ${repos.length} 仓（官方名单${ids ? "" : "读取失败，降级为全部按官方报"}）`);
console.log(`[plugin-commands] 官方名单源：${ids ? "scripts/sync-plugin-agents.mjs FACTS 表" : "—（读取失败）"}`);
console.log(`[plugin-commands] 判据：${payload.criterion}`);
console.log(`[plugin-commands] 🔴 只报不拦（exit 0）——⛔ 不进 npm run check / CI / ci-verify；改不改由各插件作者定\n`);

console.log(`${pad("仓", 30)}${pad("视图", 6)}${pad("容器", 6)}${pad("命令", 6)}${pad("缺说明", 8)}${pad("缺risk", 8)}判定`);
console.log("-".repeat(108));
for (const r of repos) {
  const tag = r.official ? r.id : `${r.id}（第三方·只读）`;
  const extra = r.verdict === "unreadable" ? ` — ${r.parseError}` : "";
  const riskCell = r.commands ? `${r.noRisk}${r.badRisk ? `(+${r.badRisk}非法)` : ""}` : "—";
  console.log(`${pad(tag, 30)}${pad(r.views, 6)}${pad(r.containers, 6)}${pad(r.commands, 6)}${pad(r.commands ? `${r.noDescription}/${r.commands}` : "—", 8)}${pad(riskCell, 8)}${VERDICT_TAG[r.verdict]}${extra}`);
}
console.log("-".repeat(108));

console.log(`\n[plugin-commands] **名单：有视图声明却零命令（${flagged.length} 只）**——每个界面动作都只活在界面上，快捷键/命令面板/AI 全够不着：`);
if (flagged.length === 0) {
  console.log("[plugin-commands]   （空——⚠️ 空名单必须先看下面的输入盘点：证明「输入里真没有」,而不是把判据改松了）");
} else {
  for (const r of flagged) console.log(`[plugin-commands]   · ${r.id}（视图 ${r.views}${r.containers ? ` · 容器 ${r.containers}` : ""}）`);
}

if (noDescRepos.length) {
  console.log(`\n[plugin-commands] 附带名单：**整批缺 description**（${noDescRepos.length} 只）——命令一条不缺，但 AI 选命令只看那一句：`);
  for (const r of noDescRepos) console.log(`[plugin-commands]   · ${r.id}（${r.noDescription}/${r.commands} 条无说明）`);
}

if (riskYellow.length) {
  console.log(`\n[plugin-commands] 附带名单：**risk 未声明/非法（S7 黄灯，${riskYellow.length} 只）**——未声明 ⇒ 兜底 R2 ⇒ AI 档位下会被问；想免确认请显式声明 "risk": "R0"–"R3"：`);
  for (const r of riskYellow) console.log(`[plugin-commands]   · ${r.id}（缺 ${r.noRisk}${r.badRisk ? ` · 非法值 ${r.badRisk}` : ""} / 共 ${r.commands} 条）`);
}

if (unreadable.length) {
  console.log(`\n[plugin-commands] 🔴 清单不可读（${unreadable.length} 只）——不是「合规」，是**读不到**：`);
  for (const r of unreadable) console.log(`[plugin-commands]   · ${r.id} — ${r.parseError}`);
}

console.log(
  `\n[plugin-commands] 输入盘点（空名单的举证）：${inventory.repos} 仓 · 有视图 ${inventory.withViews} · 有命令 ${inventory.withCommands} · 两者皆有 ${inventory.both} · 两者皆无 ${inventory.neither} · 不可读 ${inventory.unreadable}`,
);
console.log(`[plugin-commands] ⚠️ 静态绿 ≠ 语义清：本尺只查「有视图零命令」这条**静态信号**；`);
console.log(`[plugin-commands]    「哪个动作算业务动作」「每条动作是否另有非鼠标路径」机器判不了——那靠作者照 docs/03-插件制造/21-插件命令化规范.md 的清单自检。`);
process.exitCode = 0;
