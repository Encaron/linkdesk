/**
 * 《AI 操作手册》第 02 章「命令与 API 全索引」——**生成器 ＋ 漂移门禁**（M3 `AI#11`）。
 *
 * ── 为什么这一格是「生成式」而不是手抄（判据出处：`03-任务档案/M3-手册.md` `AI#11`）──
 *   手抄清单必然漂移（本仓实证：`docs/02-Electron架构/…/命名空间矩阵.md` 手维护，2026-08-20 停更，
 *   一个月后自称 40 个命名空间、实为 45）。手册是**零源码环境的 AI 唯一读物**（`AI#16` 随包发货）
 *   ⇒ 写错一个参数，AI 就照着调错，且**没有任何东西会叫醒**。⇒ 生成 ＋ 逐字节比对。
 *
 * ── 为什么门禁住在 vitest 里（而不是像 `generate-api-cheatsheet.mjs` 那样住在 `scripts/`）──
 *   命令元数据的**唯一真源 = 壳命令注册表**（`CommandRegistry.getCommands()`），它经 `import.meta.glob`
 *   接进 Vite 图 ⇒ **纯 node/tsx 加载不了**（实测：`(intermediate value).glob is not a function`）。故：
 *     ① **校验腿 = 本文件**——`npm run check` 的 `vitest run` 已覆盖它，**不新增 check 链步骤**
 *        （也就不用给 `check-gate-health.mjs` 交代）；失败信息里直接给刷新命令。
 *     ② **刷新腿 = `npm run manual:build`**（`scripts/build-ai-manual.mjs` 起 vitest ＋ 置 `AI_MANUAL_WRITE=1`）。
 *   契约那一半（API 索引）本来纯 node 读得动，但它与命令表**同住一份文档、共用同一把「读→比→写」尺子**
 *   ——⛔ 不为了省事拆成两套机制（两套必然漂移，正是本仓反复吃过的亏）。
 *   ⚠️ 代价如实记账：本门禁只被 vitest 腿覆盖，**没有** `--self-test` 接线（它不是 `check-*.mjs`，
 *   不进 `check-gate-health.mjs` 的判定域）；「比对器真会红」由下面的**负控**例自证。
 *
 * ── 判据（`AI#11`）──
 *   ① 两处生成区与实现**逐字节**一致（**行尾归一后**再比——血账见 `generate-api-cheatsheet.mjs:50-55`：
 *      生成器写 LF、Windows 检出是 CRLF ⇒ 裸串比对在干净检出上恒红，本地绿只是自己写的 LF）；
 *   ② **负控：比对器真会红**（改一个字符就报差异、缺标记不静默放过）——否则这道门禁是恒绿的装饰。
 *   ⛔ 本文件不产出手写散文（手册正文是手写的，生成区只管**机器可读的那部分事实**）。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { ensureCoreCommands } from "./shell/coreCommands";
import { getCommands, resolveCommandOwnership, type Command } from "../registry/commands/CommandRegistry";
import { APP_PLUGIN_ID } from "../services/plugins/PluginStateService";
import { ROOT, parseContract } from "../../../scripts/lib/contract-parse.mjs";

const DOC_REL = "docs/07-AI操作手册/02-命令与API索引.md";
/** 刷新腿的开关（唯一置位处 = `scripts/build-ai-manual.mjs`）——平时只读不写 */
const WRITE = process.env.AI_MANUAL_WRITE === "1";
const REFRESH_HINT = "npm run manual:build";

const CMD_BEGIN = "<!-- BEGIN COMMAND-INDEX -->";
const CMD_END = "<!-- END COMMAND-INDEX -->";
const API_BEGIN = "<!-- BEGIN API-INDEX -->";
const API_END = "<!-- END API-INDEX -->";

/** 生成物读/比/写全走 LF 空间（读取处归一，落盘也让整份收敛到 LF）。 */
const normEol = (s: string) => s.replace(/\r\n/g, "\n");

/** 表格单元格转义：换行压成空格（表格里换行会撕裂行）、`|` 转义、多空格收敛。 */
const esc = (s: string) => s.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

/** 单行说明压到 `max` 字（超出以 `…` 结尾）——完整原文永远以 `getCommands()` 返回为准。 */
function brief(s: string | undefined, max = 120): string {
  if (!s?.trim()) return "——";
  const t = esc(s);
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** 参数列——`name: type 必填/可选 — 说明`，多参数用 `<br>`（GitHub/多数渲染器认）。 */
function paramCell(params: Command["params"]): string {
  if (!params?.length) return "——";
  return params
    .map((p) => {
      const req = p.required ? "必填" : "可选";
      const desc = p.description?.trim() ? ` — ${esc(p.description)}` : "";
      return `\`${p.name}\`: ${p.type} ${req}${desc}`;
    })
    .join("<br>");
}

/** 码位序——⛔ 不用 `localeCompare`：ICU 版本差异会让同一份实现在不同机器生成不同字节 ⇒ 门禁假红。 */
const byCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** 宿主（壳）命令 = 归属为壳的那些；插件命令不在本表（运行时才发现，核心无知原则）。 */
function hostCommands(): Command[] {
  return getCommands()
    .filter((c) => resolveCommandOwnership(c.id).pluginId === APP_PLUGIN_ID)
    .sort((a, b) => byCodeUnit(a.id, b.id));
}

/** 按分类分组渲染宿主命令表（分类 = 命令面板的分组，来自注册元数据）。 */
function renderCommandIndex(commands: Command[]): string {
  const groups = new Map<string, Command[]>();
  for (const c of commands) {
    const g = c.category?.trim() || "（未分类）";
    const list = groups.get(g);
    if (list) list.push(c);
    else groups.set(g, [c]);
  }

  const out: string[] = [CMD_BEGIN, ""];
  out.push(
    `**宿主命令 ${commands.length} 条 / ${groups.size} 个分类**——插件命令不在本表（运行时用 \`getCommands()\` 查）。`,
  );
  out.push("");
  for (const [group, list] of [...groups.entries()].sort((a, b) => byCodeUnit(a[0], b[0]))) {
    out.push(`### ${group}（${list.length}）`);
    out.push("");
    out.push("| 命令 id | 标题 | 说明 | 参数（调用实参） | when 门控 |");
    out.push("|:--|:--|:--|:--|:--|");
    for (const c of list) {
      const when = c.when?.trim() ? `\`${esc(c.when)}\`` : "——";
      out.push(`| \`${c.id}\` | ${brief(c.title, 40)} | ${brief(c.description)} | ${paramCell(c.params)} | ${when} |`);
    }
    out.push("");
  }
  out.push(CMD_END);
  return out.join("\n");
}

/** 渲染 API 面（数据源 = 生成的 `linkdesk.d.ts`；解析判定在共享的 `contract-parse.mjs`，此处只排版）。 */
function renderApiIndex(): string {
  const { namespaces, interfaces } = parseContract();
  const rows = [...namespaces.entries()].sort((a, b) => byCodeUnit(a[0], b[0]));
  // 别名行的方法面继承自目标命名空间——不重复计入总数
  const total = rows.reduce((n, [, v]) => n + (v.aliasOf ? 0 : v.methods.length), 0);
  const optionalNamespaces = rows.filter(([, v]) => v.optional).map(([n]) => `\`${n}\``);
  const anyOptionalMethod = rows.some(([, v]) => (v.optionalMethods ?? []).length > 0);

  const out: string[] = [API_BEGIN, ""];
  out.push(`**${interfaces.length} 个域接口 → ${rows.length} 个命名空间 / ${total} 个方法**；调用一律 \`window.linkdesk.<命名空间>.<方法>\`。`);
  out.push("");
  out.push("| 命名空间 | 域接口 | 方法数 | 方法 | 一句话 |");
  out.push("|:--|:--|:--:|:--|:--|");
  for (const [name, v] of rows) {
    const mark = v.optional ? " ⚠️" : "";
    let methods: string;
    if (v.aliasOf) {
      methods = `（\`@deprecated\` 别名 → \`${v.aliasOf}\`，方法面同上）`;
    } else if (v.methods.length) {
      // `°` = 契约标 `?` 的成员：仅一侧 preload 注入（多为壳侧独有）——池里调用前先判存在
      methods = v.methods
        .map((m) => `\`${m}\`${(v.optionalMethods ?? []).includes(m) ? "°" : ""}`)
        .join(" ");
    } else {
      // 顶层函数属性命名空间（如 getFilePath）无子方法——直接展示签名形状
      methods = `（顶层函数）\`${esc(v.signature ?? "")}\``;
    }
    out.push(`| \`${name}\`${mark} | ${v.iface} | ${v.methods.length} | ${methods} | ${brief(v.doc)} |`);
  }
  if (optionalNamespaces.length || anyOptionalMethod) {
    out.push("");
    if (optionalNamespaces.length) {
      out.push(`⚠️ = 契约里的**可选命名空间**（只在一侧 preload 注入）：${optionalNamespaces.join(" ")}——用前先判存在，另一侧是 \`undefined\`。`);
    }
    if (anyOptionalMethod) {
      out.push("° = 契约标 `?` 的成员：只在一侧 preload 注入（几乎都是壳侧独有）。**插件跑在池侧** ⇒ 调用前先判存在。");
    }
  }
  out.push("");
  out.push(API_END);
  return out.join("\n");
}

/** 取文档内两标记之间（含标记行）的当前内容；任一标记缺失或次序颠倒 ⇒ `null`（调用方必须报红）。 */
function regionOf(doc: string, begin: string, end: string): string | null {
  const b = doc.indexOf(begin);
  const e = doc.indexOf(end);
  if (b === -1 || e === -1 || e < b) return null;
  return doc.slice(b, e + end.length);
}

/** 用生成物替换标记区（含标记行）——前提：两标记都存在（先经 `regionOf` 判过）。 */
function splice(doc: string, begin: string, end: string, generated: string): string {
  const b = doc.indexOf(begin);
  const e = doc.indexOf(end);
  return doc.slice(0, b) + generated + doc.slice(e + end.length);
}

interface Region {
  name: string;
  begin: string;
  end: string;
  generated: string;
}

function buildRegions(commands: Command[]): Region[] {
  return [
    { name: "§二 命令索引", begin: CMD_BEGIN, end: CMD_END, generated: renderCommandIndex(commands) },
    { name: "§三 API 索引", begin: API_BEGIN, end: API_END, generated: renderApiIndex() },
  ];
}

/** 与文档盘上内容比对的差异清单（空数组 = 一致）；缺标记也进这个清单，⛔ 不静默放过。 */
function drift(doc: string, regions: Region[]): string[] {
  const problems: string[] = [];
  for (const r of regions) {
    const current = regionOf(doc, r.begin, r.end);
    if (current === null) problems.push(`${r.name}：文档里缺 ${r.begin} / ${r.end} 标记（生成器只替换这两行之间的内容）`);
    else if (current !== r.generated) problems.push(`${r.name}：与实现不一致`);
  }
  return problems;
}

describe("《AI 操作手册》02 章生成区（M3 AI#11）", () => {
  it("① 生成区与实现逐字节一致", () => {
    ensureCoreCommands();
    const cmds = hostCommands();
    // 覆盖面兜底：注册没跑起来时「空表」会**恰好一致**——这条断言是那类假绿的拦网
    expect(cmds.length).toBeGreaterThan(50);

    const path = resolve(ROOT, DOC_REL);
    expect(existsSync(path), `文档不存在：${DOC_REL}`).toBe(true);
    const regions = buildRegions(cmds);
    const doc = normEol(readFileSync(path, "utf-8"));

    if (WRITE) {
      let next = doc;
      for (const r of regions) {
        expect(regionOf(next, r.begin, r.end), `${r.name} 缺标记，无法写入`).not.toBeNull();
        next = splice(next, r.begin, r.end, r.generated);
      }
      writeFileSync(path, next, "utf-8");
      return;
    }

    const problems = drift(doc, regions);
    expect(problems, `${problems.join("；")}——刷新：${REFRESH_HINT}`).toEqual([]);
  });

  it("② 负控：比对器真会红（改一个字符 / 缺标记 / 空表）", () => {
    ensureCoreCommands();
    const cmds = hostCommands();
    const regions = buildRegions(cmds);
    const cmdRegion = regions[0];

    // 正控：拿生成物自身当文档内容 ⇒ 无差异（尺子先量一次「一致」长什么样）
    const good = `前言\n\n${regions.map((r) => r.generated).join("\n\n")}\n\n后记`;
    expect(drift(good, regions)).toEqual([]);

    // 负控 1：改一个字符（命令表里第一根竖杠变 `!`）⇒ 必须报「不一致」
    const oneCharOff = good.replace(cmdRegion.generated, cmdRegion.generated.replace("|", "!"));
    expect(oneCharOff).not.toBe(good);
    expect(drift(oneCharOff, regions).length).toBeGreaterThan(0);

    // 负控 2：标记被删 ⇒ 必须报「缺标记」（不是静默当一致）
    const noMarkers = good.replace(CMD_BEGIN, "").replace(CMD_END, "");
    expect(drift(noMarkers, regions).length).toBeGreaterThan(0);

    // 负控 3：注册表读空 ⇒ 生成物与「有内容」的文档**必然**不一致（证明表内容真的进了比对）
    const empty = buildRegions([]);
    expect(drift(good, empty).length).toBeGreaterThan(0);
  });

  it("② 生成物形状自检：两表都非空、命令表按分类分组、API 表含域接口列", () => {
    ensureCoreCommands();
    const cmd = renderCommandIndex(hostCommands());
    expect(cmd).toContain(CMD_BEGIN);
    expect(cmd).toContain(CMD_END);
    expect(cmd).toMatch(/^\| 命令 id \|/m);
    const api = renderApiIndex();
    expect(api).toContain(API_BEGIN);
    expect(api).toMatch(/^\| 命名空间 \| 域接口 \|/m);
    // 两条真实命令必须在表里（防止「渲染器把行全吞了」这类静默空转）
    expect(cmd).toContain("`core.splitDown`");
    expect(cmd).toContain("`workbench.action.toggleSidebarPosition`");
    expect(api).toContain("`pool`");
  });
});
