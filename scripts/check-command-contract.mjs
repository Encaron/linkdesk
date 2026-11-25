#!/usr/bin/env node
/**
 * 命令契约门禁 —— 防“新命令退回旧模式”（risk/activation/returns/example 四件必填）。
 *
 * T3 已把 risk/activation 做成**运行期硬拒绝**（loader 不注册）；本尺把同一口径提前到**静态/CI**，
 * 并把 returns/example 也纳入——否则命令能跑，但 AI 看 describe 时又回到“靠试错猜请求体/回执”。
 *
 * ── 判据（每条命令）──
 *   ① `risk` ∈ R0–R3；② `activation` ∈ entry/view；
 *   ③ `returns` **字段存在且是数组**（`[]` 合法，语义 = 无返回内容；⛔ 不强制非空——否则空返回命令被迫编字段）；
 *   ④ `example` **字段存在且是普通对象**（无参命令写 `{}`）；
 *   ⑤ example 形状与 `expandNamedArgs` 同语义：无 params ⇒ `{}`；**单 object 参数 ⇒ 载荷对象（键不比对）**；
 *      其余 ⇒ 键 ⊆ `params[].name`（允许省略可选参数）。
 *   ⛔ 对单 object 参数不做键比对：存量约定里 handler 读 `args[0].xxx`，改写成 `{args:{…}}` 反而不可执行。
 *
 * ── 扫描范围（CI 口径，写死避免误解）──
 *   · `bundled-plugins/*.linkdesk-plugin`（6 只种子）：**永远必查**，GitHub CI 也覆盖；
 *   · 官方插件容器（默认 E:/linkdesk-plugins，可用 LINKDESK_PLUGIN_CONTAINER 覆盖）：
 *     **存在则查官方 14 仓**（本地 A/B 能拦存量）；容器缺失 ⇒ 输出「跳过（无容器）」但⛔ 不假绿；
 *   · 第三方仓不查（不是本仓可管辖的面，避免假门禁）。
 *
 * ── 用法 ──
 *   node scripts/check-command-contract.mjs            # 报告（exit 0；补存量期间用）
 *   node scripts/check-command-contract.mjs --strict   # 门禁（有违例 ⇒ exit 1；存量补齐后挂 npm run check）
 *   node scripts/check-command-contract.mjs --json
 *   node scripts/check-command-contract.mjs --self-test
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import { readZipManifest } from "./lib/bundled-fingerprint.mjs";
import { discoverPluginRepos, officialPluginIds, readManifestJson } from "./lib/plugin-repos.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGENTS_SCRIPT = path.join(ROOT, "scripts", "sync-plugin-agents.mjs");
const CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:/linkdesk-plugins";
const STRICT = process.argv.includes("--strict");
const JSON_OUT = process.argv.includes("--json");

const RISKS = new Set(["R0", "R1", "R2", "R3"]);
const ACTIVATIONS = new Set(["entry", "view"]);

/** 纯函数：一只 manifest 的命令契约违例（自测直接打它） */
export function judgeManifest(pluginId, manifest) {
  const violations = [];
  const cmds = manifest && manifest.contributes && Array.isArray(manifest.contributes.commands)
    ? manifest.contributes.commands
    : [];
  cmds.forEach((c, i) => {
    const at = `${pluginId}:${c && typeof c.id === "string" ? c.id : `commands[${i}]`}`;
    if (!c || typeof c !== "object") {
      violations.push({ at, kind: "bad-item", detail: "命令不是对象" });
      return;
    }
    if (!RISKS.has(c.risk)) violations.push({ at, kind: "risk", detail: `risk 缺失/非法（${JSON.stringify(c.risk)}）` });
    if (!ACTIVATIONS.has(c.activation)) violations.push({ at, kind: "activation", detail: `activation 缺失/非法（${JSON.stringify(c.activation)}）` });
    if (!("returns" in c) || !Array.isArray(c.returns)) {
      violations.push({ at, kind: "returns", detail: "returns 缺失或不是数组（无返回内容也要写 []）" });
    }
    const example = c.example;
    if (!("example" in c) || !example || typeof example !== "object" || Array.isArray(example)) {
      violations.push({ at, kind: "example", detail: "example 缺失或不是对象（无参命令写 {}）" });
      return;
    }
    // ⑤ example 形状与 expandNamedArgs 同语义（B 复核口径 2026-11-25）：
    //   ① 无 params ⇒ 必须 {}；② 单 object 参数 ⇒ example = 载荷对象（键不比对）；
    //   ③ 其余（多参/标量）⇒ 键 ⊆ params 名（允许省略可选参数）。
    const params = Array.isArray(c.params) ? c.params : [];
    const exampleKeys = Object.keys(example);
    if (params.length === 1 && params[0] && params[0].type === "object") {
      // 载荷对象：handler 读 args[0].xxx——改写成 {args:{...}} 反而不可执行
    } else if (params.length === 0) {
      if (exampleKeys.length) {
        violations.push({ at, kind: "example-keys", detail: `无 params 但 example 有键：${exampleKeys.join(", ")}（应写 {}）` });
      }
    } else {
      const names = new Set(params.map((x) => x && typeof x.name === "string" ? x.name : null).filter(Boolean));
      const extra = exampleKeys.filter((k) => !names.has(k));
      if (extra.length) {
        violations.push({ at, kind: "example-keys", detail: `example 出现未声明键：${extra.join(", ")}（声明：${[...names].join(", ")}）` });
      }
    }
  });
  return violations;
}

async function scanBundled() {
  const dir = path.join(ROOT, "bundled-plugins");
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".linkdesk-plugin")) continue;
    const zipPath = path.join(dir, f);
    try {
      const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
      const manifest = await readZipManifest(zip);
      out.push({ source: `bundled:${f}`, pluginId: manifest.pluginId || f.replace(/\.linkdesk-plugin$/, ""), violations: judgeManifest(manifest.pluginId || f, manifest) });
    } catch (e) {
      out.push({ source: `bundled:${f}`, pluginId: f, violations: [{ at: f, kind: "unreadable", detail: `包不可读：${e instanceof Error ? e.message : String(e)}` }] });
    }
  }
  return out;
}

function scanContainer() {
  if (!fs.existsSync(CONTAINER)) return null;
  const ids = officialPluginIds(AGENTS_SCRIPT);
  const repos = discoverPluginRepos(CONTAINER)
    .filter((r) => !r.id.startsWith("."))
    .filter((r) => (ids ? ids.has(r.id) : true));
  return repos.map((r) => {
    const parsed = readManifestJson(path.join(r.dir, "plugin.json"));
    if (!parsed.ok) {
      return { source: `repo:${r.id}`, pluginId: r.id, violations: [{ at: r.id, kind: "unreadable", detail: parsed.why }] };
    }
    return { source: `repo:${r.id}`, pluginId: r.id, violations: judgeManifest(r.id, parsed.manifest) };
  });
}

/* ── 自测（正控/负控；⛔ 不进 npm run check 的自测段也要能真红） ── */
function selfTest() {
  const C = (name, got, want) => ({ name, ok: JSON.stringify(got) === JSON.stringify(want), got, want });
  const base = (extra = {}) => ({
    contributes: {
      commands: [{ id: "p.ok", title: "OK", risk: "R1", activation: "entry", params: [{ name: "a" }], returns: [], example: { a: 1 }, ...extra }],
    },
  });
  const kinds = (m) => judgeManifest("p", m).map((v) => v.kind);
  const cases = [
    C("正控：四件齐 ⇒ 0 违例", kinds(base()), []),
    C("正控：returns: [] 合法（无返回内容）", kinds(base({ returns: [] })), []),
    C("正控：无参命令 example: {} 合法", kinds({ contributes: { commands: [{ id: "p.x", risk: "R0", activation: "entry", returns: [], example: {} }] } }), []),
    C("负控：缺 returns ⇒ 红", kinds(base({ returns: undefined })), ["returns"]),
    C("负控：returns 非数组 ⇒ 红", kinds(base({ returns: {} })), ["returns"]),
    C("负控：缺 example ⇒ 红", kinds(base({ example: undefined })), ["example"]),
    C("负控：缺 risk/activation ⇒ 红", kinds({ contributes: { commands: [{ id: "p.x", returns: [], example: {} }] } }), ["risk", "activation"]),
    C("负控：数组 example ⇒ 红", kinds(base({ example: [] })), ["example"]),
    C("正控⑤：无 params + {} ⇒ 绿", kinds({ contributes: { commands: [{ id: "p.x", risk: "R0", activation: "entry", returns: [], example: {} }] } }), []),
    C("负控⑤：无 params + 有键 ⇒ 红", kinds({ contributes: { commands: [{ id: "p.x", risk: "R0", activation: "entry", returns: [], example: { a: 1 } }] } }), ["example-keys"]),
    C("正控⑤：单 object 参数 + 载荷字段 ⇒ 绿（键不比对）", kinds({ contributes: { commands: [{ id: "p.x", risk: "R0", activation: "entry", params: [{ name: "args", type: "object" }], returns: [], example: { sessionId: "s1" } }] } }), []),
    C("正控⑤：多参 + 子集键 ⇒ 绿", kinds({ contributes: { commands: [{ id: "p.x", risk: "R0", activation: "entry", params: [{ name: "uri", type: "string" }, { name: "name", type: "string" }], returns: [], example: { uri: "a" } }] } }), []),
    C("负控⑤：多参 + 多余键 ⇒ 红", kinds({ contributes: { commands: [{ id: "p.x", risk: "R0", activation: "entry", params: [{ name: "uri", type: "string" }, { name: "name", type: "string" }], returns: [], example: { uri: "a", bad: 1 } }] } }), ["example-keys"]),
  ];
  const bad = cases.filter((x) => !x.ok);
  console.log("[command-contract] 自测：");
  for (const x of cases) console.log(`  ${x.ok ? "✓" : "✗"} ${x.name}${x.ok ? "" : `（实得 ${JSON.stringify(x.got)}，期望 ${JSON.stringify(x.want)}）`}`);
  console.log(`[command-contract] 自测判定：${bad.length === 0 ? "✓ 全过" : `✗ FAIL（${bad.length}/${cases.length}）`}`);
  return bad.length === 0 ? 0 : 1;
}

if (process.argv.includes("--self-test")) process.exit(selfTest());

const bundled = await scanBundled();
const container = scanContainer();
const all = container ? [...bundled, ...container] : bundled;
const seen = new Set();
const violations = all.flatMap((r) => r.violations.map((v) => ({ source: r.source, ...v })))
  .filter((v) => {
    const k = `${v.at}|${v.kind}|${v.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
const byPlugin = {};
for (const v of violations) byPlugin[v.at.split(":")[0]] = (byPlugin[v.at.split(":")[0]] ?? 0) + 1;

if (JSON_OUT) {
  console.log(JSON.stringify({ bundled: bundled.length, container: container ? container.length : null, violations, byPlugin }, null, 2));
} else {
  console.log(`[command-contract] bundled ${bundled.length} 只${container ? ` · 官方容器 ${container.length} 只（${CONTAINER}）` : ` · 容器缺失（${CONTAINER}）⇒ 只查 bundled`}`);
  if (!container) console.log("[command-contract] ⚠ 无容器：本次不含官方仓存量（CI 即此口径；⛔ 不是“全部合规”）");
  if (violations.length === 0) {
    console.log("[command-contract] ✅ 无违例");
  } else {
    console.log(`[command-contract] ${STRICT ? "🔴" : "⚠️"} 违例 ${violations.length} 条（${Object.keys(byPlugin).length} 只插件）：`);
    for (const v of violations) console.log(`  · [${v.kind}] ${v.at} — ${v.detail}`);
  }
}
process.exitCode = STRICT && violations.length > 0 ? 1 : 0;
