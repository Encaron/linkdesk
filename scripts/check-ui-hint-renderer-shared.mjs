#!/usr/bin/env node
/**
 * R9 · uiHint 渲染体共享化门禁（`check-ui-hint-renderer-shared.mjs`）。
 *
 * 判据出处：`docs/04-软件更新/已落地/分段预览色块边缘串色/06-尾巴总账与验收.md`
 *   —— 判据 T-A / T-B / T-C 在 §一，14 uiHint × 3 renderHint × type 词表逐条账在 §二/§三/§四，
 *      本腿要补的那个洞（G-1）写在 §八。账本（机器真相源）= `scripts/ui-hint-renderer-ledger.json`。
 *
 * ══ 守的是哪句话 ══
 *   > **凡「宿主声明的控件」（`uiHint` / `renderHint` / `type` 词表里的形态），共享件里必须有它的渲染体；
 *   >   渲染方（设置插件）只许做接线。**
 *   本案两处尾巴正是这条的反例：`uiHint:"color"` 的臂自画 `.settings-color-control`（私有几何）、
 *   `type:"object"|"array"` 的臂返回插件私有 `ObjectEditor`——**换一只设置插件这两类键就画不出来**
 *   （GUI 退化）。R4（`check-duplicate-capability`）看得见「同名/同形」，看不见这一格 ⇒ 本腿补上。
 *
 * ── 判定式（对官方设置插件的 `renderControl.tsx` 逐臂过；命中任一 ⇒ 红）──
 *   ⓪ **可达性**：插件容器或渲染体文件不在（CI / 别的克隆 / 没做过源码外移的机器）⇒ 打一行「跳过」，
 *     **退出 0**——理由同 `sync-plugin-agents.mjs`：本腿扫的是仓外目录，⛔ 不许让干净检出当场红。
 *   ① **正典覆盖**：`SETTINGS_UI_HINTS`（14）／`SETTINGS_RENDER_HINTS`（3）每枚在账本里有条目
 *     （或登记为「别处渲染」）⇒ 漏一枚 = 新 hint 没做落位决策。
 *   ② **账本反向**：账本里的键必须在正典里（已退役的 hint 留在账上 ⇒ 过期条目）。
 *   ③ **臂覆盖**：两个 `switch`（uiHint / type）**每个 `case`/`default` 臂**窗口内的 JSX 元素名
 *     ⊆ 共享件名（`scripts/ui-surface.json`）∪ 账本登记的接线件 ∪ 原生标签；
 *     ⇒ 臂里出现「插件私有组件」当场红（本案 T2 的形状）。
 *   ④ **私有类名**：臂／站点窗口内 `!ldk-` 前缀的 `className` token 必须在账本 `pluginLocalClasses` 里
 *     逐条登记（带理由）⇒ 臂里自画容器当场红（本案 T1 的形状）。登记项**反向核对**：现场已无该名字 ⇒ 红（防账本腐烂）。
 *   ⑤ **接线件真身**：账本 `adapters[名].composes` 里每个共享名必须在其 `file` 里真的出现
 *     （⛔ 不许只写「已接共享件」而不接）；「别处渲染」的 `sites[].names` 同理。
 *   ⑥ **站点标记**：`renderHintSites` 每条标记文本必须真在渲染体里找得到（改坏了标记 ⇒ 红，
 *     不许静默变成「没有站点」）。
 *
 * ── 🔴 残余边界（如实登记，见账本 `residual`）──
 *   元素名是**形状**启发式；伴生件区（两个 switch 之外）不在域内；内联样式自画零 className 时只靠 ③ 兜。
 *
 * ── 自证（`--self-test`）──
 *   正控：干净源（臂返回共享件）⇒ 绿；登记过的私有类 ⇒ 放行；真机（有插件仓时）⇒ 绿。
 *   负控：① 臂自画 `settings-*` 容器 ⇒ 红；② 臂返回插件私有组件 ⇒ 红；③ 正典多一枚而无账 ⇒ 红；
 *        ④ 账上有正典里没有的 hint ⇒ 红；⑤ 接线件声称接的共享名不在其文件里 ⇒ 红；
 *        ⑥ 登记过的私有类从现场消失（账本腐烂）⇒ 红；⑦ 站点标记被改 ⇒ 红。
 *   反向核对：真树跑一次（有插件仓时）结果必须与「账本对得上现场」一致——尺子不是在恒绿。
 *
 * 用法：node scripts/check-ui-hint-renderer-shared.mjs              // 全量（挂 npm run check）
 *       node scripts/check-ui-hint-renderer-shared.mjs --self-test  // 自测
 *   LINKDESK_PLUGIN_CONTAINER=<容器根> 覆盖插件容器位置（默认 E:\linkdesk-plugins\official）。
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LEDGER_PATH = join(ROOT, "scripts", "ui-hint-renderer-ledger.json");
const SURFACE_PATH = join(ROOT, "scripts", "ui-surface.json");
const CANON_PATH = join(ROOT, "src", "components", "shared", "settings-hints", "settingsHints.ts");
const CONTAINER = process.env.LINKDESK_PLUGIN_CONTAINER || "E:\\linkdesk-plugins\\official";
/** 账本里允许出现、但不是「正典取值」的键——`default` 是 switch 的兜底那一支，不属宿主声明面。 */
const NON_CANON_KEYS = new Set(["default"]);

/* ── 扫描原语 ────────────────────────────────────────────────────────── */

/** 剥注释（保留行数）：单趟扫描、认得字符串与模板串——⛔ 不用正则（插件里有 URL，`//` 会被误当注释头）。 */
export function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") {
        out += " ";
        i++;
      }
      continue;
    }
    if (c === "/" && d === "*") {
      const at = src.indexOf("*/", i + 2);
      const stop = at < 0 ? n : at + 2;
      for (let k = i; k < stop; k++) out += src[k] === "\n" ? "\n" : " ";
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      out += c;
      let k = i + 1;
      while (k < n) {
        if (src[k] === "\\") {
          out += src[k] + (src[k + 1] ?? "");
          k += 2;
          continue;
        }
        out += src[k];
        if (src[k] === c) {
          k++;
          break;
        }
        k++;
      }
      i = k;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** 读一个 `export const NAME: …[] = [ "a", "b" ];` 里的字符串值（现读正典源码，⛔ 不手抄第二份名单）。
 *  ⚠️ 括号要取 `=` **之后**那个——类型标注里也有 `[]`（`readonly SettingsUiHint[]`）。 */
export function readStringArray(code, constName) {
  const at = code.search(new RegExp(`export const ${constName}\\b[^=]*=`));
  if (at < 0) return null;
  const eq = code.indexOf("=", at);
  const open = code.indexOf("[", eq);
  const close = code.indexOf("]", open);
  if (eq < 0 || open < 0 || close < 0) return null;
  return (code.slice(open + 1, close).match(/"[^"]+"/g) || []).map((s) => s.slice(1, -1));
}

/** 定位一个 `switch (…) {` 的每一臂：`case "k":` / `default:` 起、到下一臂（或 switch 收尾括号）止。 */
export function switchArms(code, switchNeedle) {
  const lines = code.split("\n");
  const start = lines.findIndex((l) => l.includes(switchNeedle));
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  for (let i = start; i < lines.length && end < 0; i++) {
    for (const ch of lines[i]) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
  }
  if (end < 0) return null;
  const labels = [];
  for (let i = start; i <= end; i++) {
    const m = lines[i].match(/^\s*(?:case\s+"([^"]+)"|default)\s*:/);
    if (m) labels.push({ key: m[1] ?? "default", at: i });
  }
  return labels.map((l, idx) => ({
    key: l.key,
    text: lines.slice(l.at, idx + 1 < labels.length ? labels[idx + 1].at : end).join("\n"),
  }));
}

/** `if (prop.renderHint === "x")` 这类站点窗口：到「缩进不更深的 }」或下一臂标记为止（⛔ 不吃到隔壁分支）。 */
export function siteWindow(code, marker) {
  const lines = code.split("\n");
  const start = lines.findIndex((l) => l.includes(marker));
  if (start < 0) return null;
  const indent = lines[start].search(/\S/);
  let end = Math.min(lines.length - 1, start + 80);
  for (let i = start + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t) continue;
    const ind = lines[i].search(/\S/);
    if (ind <= indent && (t.startsWith("}") || /^(?:case\s+"|default\s*:)/.test(t))) {
      end = i - 1;
      break;
    }
  }
  return lines.slice(start, end + 1).join("\n");
}

/** 窗口内的 JSX 元素名：大写开头（组件）或原生标签。⛔ 跳过 `HTMLDivElement` 这类 TS DOM 类型名。 */
export function jsxElements(text, nativeTags) {
  const native = new Set(nativeTags);
  const out = new Set();
  for (const m of text.matchAll(/<([A-Za-z][A-Za-z0-9_]*)[\s/>]/g)) {
    const name = m[1];
    if (/^HTML[A-Z]/.test(name)) continue;
    if (native.has(name) || /^[A-Z]/.test(name)) out.add(name);
  }
  return [...out];
}

/** 窗口内的 className token（只收字面量）。 */
export function classTokens(text) {
  const out = new Set();
  for (const m of text.matchAll(/className\s*=\s*["'`]([^"'`]+)/g)) {
    for (const t of m[1].split(/\s+/)) if (t) out.add(t);
  }
  return [...out];
}

/** 参数：真源的共享件名（对账用）——`scripts/ui-surface.json` 的四栏都是「名字 ↦ { since }」形态。 */
export function readSurfaceNames(surface) {
  const out = new Set();
  for (const cat of ["components", "hooks", "helpers", "types"]) {
    const bucket = surface?.[cat];
    if (bucket && typeof bucket === "object" && !Array.isArray(bucket)) for (const k of Object.keys(bucket)) out.add(k);
  }
  return out;
}

/* ── 判定核心（纯函数：喂源码文本 ＋ 账本 ＋ 正典 ⇒ 问题清单）──────────────── */

export function judge({ code, uiHints, renderHints, ledger, surfaceNames, readPlugin }) {
  const problems = [];
  const nativeTags = ledger.nativeTags || [];
  const adapters = ledger.adapters || {};
  const localClasses = ledger.pluginLocalClasses || [];
  const registeredLocal = new Set(localClasses.map((e) => e.cls));
  const allowed = new Set([...surfaceNames, ...Object.keys(adapters), ...nativeTags]);
  /** 读插件文件体（剥注释——「名字只出现在注释里」不算现场还在）。 */
  const readBody = (rel) => {
    const b = readPlugin(rel);
    return b == null ? null : stripComments(b);
  };

  const checkWindow = (where, text) => {
    for (const el of jsxElements(text, nativeTags)) {
      if (!allowed.has(el)) {
        problems.push(
          `🔴 ${where}：臂里出现「${el}」——既不是 @linkdesk/ui 的共享件，也不是账本登记的接线件/原生标签 ⇒ 这一格换了渲染方就画不出来（判据 T-A）。`,
        );
      }
    }
    for (const cls of classTokens(text)) {
      if (cls.startsWith("ldk-")) continue;
      if (!registeredLocal.has(cls)) {
        problems.push(
          `🔴 ${where}：臂里自画容器类名「${cls}」（非 ldk-）且未登记 ⇒ 宿主声明的键不许由插件私有几何渲染（判据 T-A/T-B）。`,
        );
      }
    }
  };

  // ① 正典覆盖
  for (const h of uiHints) {
    if (!(h in (ledger.uiHintCases || {}))) {
      problems.push(`🔴 uiHint 正典「${h}」在账本里没有条目 ⇒ 新 hint 必须同笔做落位决策（§一 判据 A）。`);
    }
  }
  for (const h of renderHints) {
    if (!((ledger.renderHintSites || {})[h] || []).length) {
      problems.push(`🔴 renderHint 正典「${h}」没有站点登记 ⇒ 它的渲染体住哪层没人答过。`);
    }
  }

  // ② 账本反向（过期条目）——`default` 不是正典值（它是「其余」那一支），两向都豁免
  for (const h of Object.keys(ledger.uiHintCases || {})) {
    if (NON_CANON_KEYS.has(h) || (ledger.uiHintHandledElsewhere || {})[h]) continue;
    if (!uiHints.includes(h)) problems.push(`🔴 账本 uiHintCases 有正典里没有的「${h}」⇒ 条目过期（hint 已退役？）。`);
  }
  for (const h of Object.keys(ledger.renderHintSites || {})) {
    if (NON_CANON_KEYS.has(h)) continue;
    if (!renderHints.includes(h)) problems.push(`🔴 账本 renderHintSites 有正典里没有的「${h}」⇒ 条目过期。`);
  }

  // ③ 臂覆盖（uiHint / type 两个 switch 的每一臂都过）
  const arms = [
    { name: "uiHint 臂", list: switchArms(code, "switch (prop.uiHint)") },
    { name: "type 臂", list: switchArms(code, "switch (prop.type)") },
  ];
  const seenLabels = { uiHint: new Set(), type: new Set() };
  for (const [idx, group] of arms.entries()) {
    if (!group.list) {
      problems.push(`🔴 找不到 ${group.name} 的 switch ⇒ 渲染体形状变了（本腿判据面失效，⛔ 不许静默放过）。`);
      continue;
    }
    for (const arm of group.list) {
      if (arm.key) (idx === 0 ? seenLabels.uiHint : seenLabels.type).add(arm.key);
      checkWindow(`${group.name}「${arm.key}」`, arm.text);
    }
  }

  // ③b uiHint 臂 ↔ 账本键 一一对应（多/少都要报）
  for (const k of seenLabels.uiHint) {
    if (!(k in (ledger.uiHintCases || {}))) problems.push(`🔴 渲染体里的 uiHint 臂「${k}」在账本里没有条目（新臂未做落位决策）。`);
  }
  for (const k of Object.keys(ledger.uiHintCases || {})) {
    if (k === "@handledElsewhere" || (ledger.uiHintHandledElsewhere || {})[k]) continue;
    if (!seenLabels.uiHint.has(k)) problems.push(`🔴 账本 uiHintCases 的「${k}」在现场没有对应臂（名字写歪或臂已删）。`);
  }
  // ③c type 臂 ↔ 账本键 一一对应
  for (const k of seenLabels.type) {
    if (!(k in (ledger.typeCases || {}))) problems.push(`🔴 渲染体里的 type 臂「${k}」在账本里没有条目。`);
  }
  for (const k of Object.keys(ledger.typeCases || {})) {
    if (!seenLabels.type.has(k)) problems.push(`🔴 账本 typeCases 的「${k}」在现场没有对应臂。`);
  }

  // ④ 站点（renderHint）
  for (const [h, sites] of Object.entries(ledger.renderHintSites || {})) {
    for (const s of sites) {
      const w = siteWindow(code, s.marker);
      if (!w) {
        problems.push(`🔴 renderHint「${h}」的站点标记找不到：「${s.marker}」⇒ 标记被改坏（⛔ 不许静默变成「没有站点」）。`);
        continue;
      }
      checkWindow(`renderHint 站点「${h}」`, w);
      if (s.via && !allowed.has(s.via)) {
        problems.push(`🔴 renderHint「${h}」声称渲染体是「${s.via}」——不在共享件名单也不在接线件表里。`);
      }
    }
  }

  // ⑤ 接线件真身 ＋ 「别处渲染」真身
  for (const [name, spec] of Object.entries(adapters)) {
    const body = readBody(spec.file);
    if (body == null) {
      problems.push(`🔴 接线件「${name}」的落点文件读不到：${spec.file}`);
      continue;
    }
    for (const shared of spec.composes || []) {
      if (!body.includes(shared)) {
        problems.push(`🔴 接线件「${name}」声称接的是共享件「${shared}」，但它落点文件 ${spec.file} 里根本没这个名字 ⇒ 账目对不上现场。`);
      }
      if (!surfaceNames.has(shared)) {
        problems.push(`🔴 接线件「${name}」接的「${shared}」不在 @linkdesk/ui 导出面上 ⇒ 八成名字写错或该件已退役。`);
      }
    }
  }
  for (const [h, spec] of Object.entries(ledger.uiHintHandledElsewhere || {})) {
    if (!uiHints.includes(h)) problems.push(`🔴 「别处渲染」登记的「${h}」不在正典里 ⇒ 条目过期。`);
    for (const site of spec.sites || []) {
      const body = readBody(site.file);
      if (body == null) {
        problems.push(`🔴 「别处渲染」（${h}）的落点文件读不到：${site.file}`);
        continue;
      }
      for (const nm of site.names || []) {
        if (!body.includes(nm)) problems.push(`🔴 「别处渲染」（${h}）：${site.file} 里找不到「${nm}」⇒ 账目对不上现场。`);
        if (!surfaceNames.has(nm)) problems.push(`🔴 「别处渲染」（${h}）的「${nm}」不在 @linkdesk/ui 导出面上。`);
      }
    }
  }

  // ⑥ 私有类登记项反向核对（防账本腐烂成永久静音）
  for (const entry of localClasses) {
    const body = readBody(entry.file);
    if (body == null) {
      problems.push(`🔴 私有类登记项落点文件读不到：${entry.file}`);
      continue;
    }
    if (!body.includes(entry.cls)) {
      problems.push(`🔴 私有类登记项「${entry.cls}」在 ${entry.file} 里已不存在 ⇒ 过期条目，请删（⛔ 别让账本腐烂）。`);
    }
    if (!entry.reason) problems.push(`🔴 私有类登记项「${entry.cls}」缺 reason（照仓里白名单纪律：每条必须写清为什么不是尾巴）。`);
  }

  return problems;
}

/* ── 真机跑 ──────────────────────────────────────────────────────────── */

function run() {
  const ledger = JSON.parse(readFileSync(LEDGER_PATH, "utf8"));
  const surface = JSON.parse(readFileSync(SURFACE_PATH, "utf8"));
  const surfaceNames = readSurfaceNames(surface);
  const canonCode = stripComments(readFileSync(CANON_PATH, "utf8"));
  const uiHints = readStringArray(canonCode, "SETTINGS_UI_HINTS");
  const renderHints = readStringArray(canonCode, "SETTINGS_RENDER_HINTS");
  if (!uiHints || !renderHints) {
    console.error("🔴 [ui-hint-renderer-shared] 正典名单读不出来（settingsHints.ts 形态变了？）");
    return 1;
  }

  const repo = join(CONTAINER, ledger.pluginId || "settings");
  if (!existsSync(repo)) {
    console.log(
      `⏭️  [ui-hint-renderer-shared] 跳过——插件容器/仓不在：${repo}\n` +
        `     （本腿扫的是**仓外**目录；要跑它：LINKDESK_PLUGIN_CONTAINER=<容器根> node scripts/check-ui-hint-renderer-shared.mjs）\n` +
        `     账本自检仍在：正典 ${uiHints.length} 枚 uiHint / ${renderHints.length} 枚 renderHint，账本条目齐全与否由 --self-test 与接线方守。`,
    );
    return 0;
  }

  const renderRel = ledger.renderFile;
  const readPlugin = (rel) => {
    const abs = join(repo, rel);
    if (!existsSync(abs)) return null;
    return stripComments(readFileSync(abs, "utf8"));
  };
  const code = readPlugin(renderRel);
  if (code == null) {
    console.log(`⏭️  [ui-hint-renderer-shared] 跳过——渲染体文件不在：${join(repo, renderRel)}`);
    return 0;
  }

  const problems = judge({ code, uiHints, renderHints, ledger, surfaceNames, readPlugin });
  if (problems.length) {
    console.error(`🔴 [ui-hint-renderer-shared] ${problems.length} 处：\n`);
    for (const p of problems) console.error(`   ${p}`);
    console.error(
      `\n   账本：scripts/ui-hint-renderer-ledger.json ｜ 判据：06-尾巴总账与验收.md §一/§二/§三/§四\n` +
        `   修法只有两条：① 把这一臂改成用共享件渲染（正解）；② 若它**本该**住插件（判据 T-C 的布局/派生），\n` +
        `   在账本里写清理由再登记——⛔ 不许靠改这里的判据让它变绿。`,
    );
    return 1;
  }
  console.log(
    `✅ [ui-hint-renderer-shared] 设置插件渲染体已共享化：${uiHints.length} 枚 uiHint ＋ ${renderHints.length} 枚 renderHint ` +
      `＋ type 词表逐臂过了（臂里零私有组件、零未登记私有类；接线件 ${Object.keys(ledger.adapters || {}).length} 个的「接的共享件」都在现场）。`,
  );
  return 0;
}

/* ── 自测 ────────────────────────────────────────────────────────────── */

const CLEAN = `
function renderControl(prop, val, onChange, t) {
  if (prop.renderHint === "readonly") {
    return (<ReadonlyControl prop={prop} />);
  }
  switch (prop.uiHint) {
    case "color":
      return (<ColorField value={String(val)} onChange={(v) => onChange(v)} />);
    default:
      return null;
  }
  switch (prop.type) {
    case "string":
      if (prop.renderHint === "action") { return (<ActionButton prop={prop} />); }
      if (prop.renderHint === "color") { return (<ColorField value={String(val)} />); }
      return (<input className="ldk-input" type="text" value={String(val)} />);
    case "object":
      return (<ObjectEditor value={val} onChange={onChange} />);
    default:
      return (<span>{String(val)}</span>);
  }
}
`;

const BASE_LEDGER = {
  version: 1,
  pluginId: "settings",
  renderFile: "renderControl.tsx",
  uiHintCases: { color: "ColorField", default: "UnknownHintControl" },
  uiHintHandledElsewhere: {},
  typeCases: { string: ["ActionButton", "ColorField", "input"], object: "ObjectEditor", default: "span" },
  renderHintSites: {
    readonly: [{ marker: 'if (prop.renderHint === "readonly")', via: "ReadonlyControl" }],
    action: [{ marker: 'if (prop.renderHint === "action")', via: "ActionButton" }],
    color: [{ marker: 'if (prop.renderHint === "color")', via: "ColorField" }],
  },
  adapters: {
    ReadonlyControl: { file: "sharedAdapters.tsx", composes: ["ReadOnlyText"] },
    ActionButton: { file: "renderControl.tsx", composes: ["Button"] },
  },
  pluginLocalClasses: [],
  nativeTags: ["input", "span"],
};

const BASE_SURFACE = new Set(["ColorField", "ObjectEditor", "ReadOnlyText", "Button", "ManagerView"]);
const BASE_UI_HINTS = ["color"];
const BASE_RENDER_HINTS = ["readonly", "action", "color"];
const BASE_FILES = {
  "sharedAdapters.tsx": 'import { ReadOnlyText } from "@linkdesk/ui";',
  "renderControl.tsx": 'import { Button } from "@linkdesk/ui";\nexport const LEGACY_CLASS = "settings-color-control";',
};

export function selfTest() {
  const cases = [];
  const push = (name, ok) => cases.push({ name, ok });

  const runCase = (code, over = {}) =>
    judge({
      code: stripComments(code),
      uiHints: over.uiHints ?? BASE_UI_HINTS,
      renderHints: over.renderHints ?? BASE_RENDER_HINTS,
      ledger: over.ledger ?? BASE_LEDGER,
      surfaceNames: BASE_SURFACE,
      readPlugin: (rel) => (rel in (over.files ?? BASE_FILES) ? (over.files ?? BASE_FILES)[rel] : null),
    });

  // 正控：干净源 ⇒ 0 问题
  push("正控：臂全接共享件 ⇒ 绿", runCase(CLEAN).length === 0);

  // 负控①：臂自画私有容器类（本案 T1 的形状）
  const t1 = CLEAN.replace(
    'return (<ColorField value={String(val)} onChange={(v) => onChange(v)} />);',
    'return (<div className="settings-color-control"><ColorField value={String(val)} onChange={(v) => onChange(v)} /></div>);',
  );
  push("负控①：臂自画 settings-* 容器 ⇒ 红", runCase(t1).some((p) => p.includes("settings-color-control")));

  // 负控①b：同一条，但账本登记过 ⇒ 放行（尺子认账本）
  const t1b = runCase(t1, {
    ledger: { ...BASE_LEDGER, pluginLocalClasses: [{ file: "renderControl.tsx", cls: "settings-color-control", reason: "示例：确有理由" }] },
  });
  push("负控①b：登记过的私有类 ⇒ 放行", !t1b.some((p) => p.includes("settings-color-control")), t1b);

  // 负控②：臂返回插件私有组件（本案 T2 的形状）
  const t2 = CLEAN.replace("return (<ObjectEditor value={val} onChange={onChange} />);", "return (<MyPrivateEditor value={val} onChange={onChange} />);");
  push("负控②：臂返回插件私有组件 ⇒ 红", runCase(t2).some((p) => p.includes("MyPrivateEditor")));

  // 负控③：正典多一枚而无账
  push("负控③：正典新增 hint 无账 ⇒ 红", runCase(CLEAN, { uiHints: [...BASE_UI_HINTS, "brandNewHint"] }).some((p) => p.includes("brandNewHint")));

  // 负控④：账本有正典里没有的 hint
  push(
    "负控④：账本条目过期 ⇒ 红",
    runCase(CLEAN, { ledger: { ...BASE_LEDGER, uiHintCases: { color: "ColorField", retiredHint: "Whatever" } } }).some((p) =>
      p.includes("retiredHint"),
    ),
  );

  // 负控⑤：接线件声称接的共享名不在其文件里
  push(
    "负控⑤：接线件账目对不上现场 ⇒ 红",
    runCase(CLEAN, {
      ledger: { ...BASE_LEDGER, adapters: { ...BASE_LEDGER.adapters, ActionButton: { file: "renderControl.tsx", composes: ["Button", "GhostPiece"] } } },
    }).some((p) => p.includes("GhostPiece")),
  );

  // 负控⑥：登记过的私有类从现场消失（账本腐烂）
  push(
    "负控⑥：私有类登记项过期 ⇒ 红",
    runCase(CLEAN, {
      ledger: { ...BASE_LEDGER, pluginLocalClasses: [{ file: "renderControl.tsx", cls: "settings-long-gone", reason: "曾经在" }] },
    }).some((p) => p.includes("settings-long-gone")),
  );

  // 负控⑦：站点标记被改坏
  const t7 = runCase(CLEAN, {
    ledger: { ...BASE_LEDGER, renderHintSites: { ...BASE_LEDGER.renderHintSites, readonly: [{ marker: 'if (prop.renderHint === "readOnlyTypo")' }] } },
  });
  push("负控⑦：站点标记找不到 ⇒ 红", t7.some((p) => p.includes("readOnlyTypo")));

  // 负控⑧：接线件缺失 ⇒ 红（不许静默）
  push(
    "负控⑧：接线件落点读不到 ⇒ 红",
    runCase(CLEAN, { ledger: { ...BASE_LEDGER, adapters: { ...BASE_LEDGER.adapters, Ghost: { file: "nope.tsx", composes: [] } } } }).some((p) => p.includes("nope.tsx")),
  );

  // 真机正控：当前仓 + 当前账本（有插件仓时）必须绿——尺子不是在恒绿
  const real = run();
  push("真机正控（当前账本 × 当前插件仓）＝绿", real === 0);

  console.log();
  for (const c of cases) console.log(`  ${c.ok ? "✓" : "✗"} ${c.name}`);
  const bad = cases.filter((c) => !c.ok);
  console.log(
    bad.length
      ? `\n🔴 check-ui-hint-renderer-shared self-test ${bad.length} 例不符。\n`
      : `\n✅ check-ui-hint-renderer-shared self-test 全过（${cases.length} 例——正控会绿、负控会红、真机同绿）。\n`,
  );
  return bad.length ? 1 : 0;
}

process.exit(process.argv.includes("--self-test") ? selfTest() : run());
