/**
 * check 腿——**`@linkdesk/ui` 消费 ⇒ `minAppVersion` 声明门禁**（E6#129 · L9 收尾遗留，2026-09-19；
 * 「插件最低壳版本门禁」G2 起改为**账本驱动**，2026-10-06）。
 *
 * ── 它守的是哪句话 ──
 *   L9 起 `@linkdesk/ui` 由壳池 vendor 单实例供给（import-map JS ＋ vendor css link）。SDK 的 build
 *   把它 external 化 ⇒ 插件运行时用的是**壳那一版**组件，旧壳上没有的导出名 = **ESM 链接期解析失败
 *   ⇒ 整个插件崩掉**（不是「那个组件不显示」）。作者唯一的自保声明 = `plugin.json` 的
 *   `minAppVersion`：低于它的旧壳装到你时，加载期就拿到明确的「requires app version ≥X」提示
 *   （04-插件分发格式 §minAppVersion），而不是半个坏掉的界面。
 *   本腿 = 那句声明的**机械把关**。
 *
 * ── 🔴 地板从哪来（本格改的就是这一处）──
 *   旧版是**手写常量** `UI_REANCHOR_APP_VERSION = "0.2.13"`：它只说得清「vendor 机制从哪版起」，
 *   说不清「你导入了几个 0.2.40 才有的组件」——**导入新组件却只声明 0.2.13 的插件照样绿**，
 *   那正是本格事故的形态（第一方插件跑了新壳、旧壳用户装上即崩）。
 *   现在地板 = **账本算出来的**，账本随本包下发 `schemas/ui-surface.json`（壳仓生成器同笔投影，
 *   第三方 `npm i` 之后**离线可判**：不读壳仓、不联网、不看 tag）：
 *
 *     地板 = max( 基线 , max{ since(x) | x ∈ 插件**静态具名导入**的 @linkdesk/ui 导出名 } )
 *     基线 = min{ since(全部账本条目) }   ← vendor 供给机制的起点那一批，**不是一个常量**：
 *                                        壳仓改了下限，本腿跟着变，⛔ 不需要改 SDK 代码
 *     `since(x)` 的语义 = 「x 首次随哪个**壳版本**提供」（⛔ 不是 ui 包版本——ui 与壳的「同号锁步」
 *     已退役，E6#166「对货不对号」；版本号大小推不出这个事实，只能账本显式记录）。
 *   名字**不在账本里** ⇒ 红（fail-closed）：它要么拼错了，要么是私有 / 子路径 API——都不是对插件
 *   许诺的导出面，放行等于替作者赌一个不存在的组件。
 *
 * ── 判定式 ──
 *   ① 消费判定：源码（.ts/.tsx/.js/.jsx/.mjs/.cjs，注释剔除、测试/夹具跳过——与其余 check 同口径）
 *      出现 `from "@linkdesk/ui…"`（静态 import/export）、`import("@linkdesk/ui…")`、
 *      `require("@linkdesk/ui…")`、`import "@linkdesk/ui…"`（side-effect）四形态之一 ⇒ 有运行时消费。
 *      **type-only import 不算**（`import type`/`export type` 编译期擦除，零运行时依赖、无义务）；
 *      ⚠️ `import { type X } from "@linkdesk/ui"` 语句整体含运行时绑定 ⇒ 照算。
 *   ② **具名导入收名**（只有「静态具名导入**裸包名**」这一形态贡献名字，见 `collectUiImportNames`）：
 *      其它形态（动态 import / `require` / side-effect / `import * as` 命名空间 / 子路径）只算**消费**
 *      ⇒ 有声明义务、地板落到**基线**，⛔ 不按名字算 —— 命名空间取值不产生「链接期就要那个名字」的
 *      失败（取不到的成员只是 `undefined`，插件自己能降级），拿它算地板会把地板抬到最高的那个导出，
 *      那是**过度杀伤**。口径与「报点必须指向能改的那一行」一致。
 *   ③ 声明核对（读到消费后才核对；不消费 ui 的插件零义务、零报点）：
 *      - **账本读不到 / 形状烂 ⇒ fail-closed 红**（未核验 ≠ 通过；同 `dangling-names` 的先例）；
 *      - `plugin.json` 缺失 / jsonc 语法坏 ⇒ **fail-closed 红**（无法核对 = 红，假绿比假红更坏）；
 *      - `minAppVersion` 未声明 / 空串 ⇒ 红；
 *      - 非 `x.y.z` 形态 ⇒ 红（没法核对 ≥ 地板）；
 *      - 导入名不在账本 ⇒ 红（fail-closed）；
 *      - `< 地板` ⇒ 红。
 *   报点统一落在 `plugin.json:1`（这是**声明侧**的事实——与插件域各腿 fail-closed 同址）。
 *
 * ── 报文的四件（本格验收要求「有数字、有出处」）──
 *   ① 地板值 ② 把地板顶上去的那个导入名 ③ 该名字的 `since`（＝它首次随哪个壳版本提供）
 *   ④ 修法二选一（抬 `minAppVersion` ≥ 地板 ／ 换掉那个导出）。
 *   ⛔ **不许**把「改用动态 import()」写成修法——那是风格约束（何时加载是插件自己的事），
 *      写进报点等于让门禁替作者选实现，且违反插件独立化（本格边界，见案卷 06 §六）。
 *
 * ── 报文指向 ──
 *   `docs/03-插件制造/04-插件分发格式.md §minAppVersion`（EN `04-distribution-format.md` 同节），
 *   组件面一条线见 `19-组件速查.md §2.1`。作者侧动作只有两种：抬声明 ／ 换组件。
 *   ⚠️ 本腿**没有豁免出口**（disable 注释对它无效——「知情地把旧壳用户放到无供给的 ui 上」不是
 *   合法偏离，是语义错误；同 `check-ui-css-import` 的先例）。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPluginManifest } from "../../validate.js";
import {
  collectFiles,
  relPath,
  readSource,
  stripComments,
  stripLineComments,
  countNewlines,
  isTestOrMockRel,
  type CheckViolation,
} from "./scan.js";

/**
 * 随包下发的 UI 导出面账本（`dist/eslint/checks/x.js → ../../../schemas` = 包根/schemas；src 直跑同样命中）。
 * 🔴 路径式 resolve（`dangling-names.ts` / `reserved-classes.ts` 同款）——`new URL(<字面量>, import.meta.url)`
 * 会被 Vite 改写成资源 URL。
 */
export const UI_SURFACE_LEDGER_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../schemas/ui-surface.json",
);

export const UI_MIN_APP_VERSION_WHY =
  `地板由 @linkdesk/ui 导出面账本算出（本包 schemas/ui-surface.json：每个导出名 → since，` +
  `即它首次随哪个**壳版本**提供；地板 = max(基线, 你静态具名导入的导出名的 since)）；` +
  `作者面说明见《插件分发格式》§minAppVersion 与《组件速查》§2.1`;

const EXT = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];

/** type-only import/export 整句剔除——编译期擦除、零运行时依赖（lazy 到首个 `from "…"`；多行可过） */
const TYPE_ONLY_RE = /(?:import|export)\s+type\s+[\s\S]*?from\s*["'][^"']*["']\s*;?/g;

/** 运行时消费的四形态——specifier 本体 ＋ 可选子路径（/@linkdesk\/ui 后面不跟连字符或单词字符，防误伤同名前缀包） */
const CONSUME_RES: RegExp[] = [
  /from\s*["']@linkdesk\/ui(?![\w-])(?:\/[\w./-]*)?["']/g,
  /import\s*\(\s*["']@linkdesk\/ui(?![\w-])(?:\/[\w./-]*)?["']\s*\)/g,
  /require\s*\(\s*["']@linkdesk\/ui(?![\w-])(?:\/[\w./-]*)?["']\s*\)/g,
  /import\s*["']@linkdesk\/ui(?![\w-])(?:\/[\w./-]*)?["']/g,
];

/** 静态具名导入**裸包名**（唯一贡献名字的形态；⛔ 子路径不算——那不是账本许诺的面） */
const NAMED_BARE_RE = /(?:import|export)\s*\{([^}]*)\}\s*from\s*["']@linkdesk\/ui["']/g;

/** x.y.z → 元组；形态不对返回 null（由调用方 fail-closed） */
function parseSemver(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function gte(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return true;
}

/** 严格大于（地板「出处」只在**真的被顶上去**时才记——与基线并列的名字不是原因，别乱归因） */
function gt(a: [number, number, number], b: [number, number, number]): boolean {
  return gte(a, b) && !gte(b, a);
}

/** `semver` 形态守卫（账本条目必须长这样；形态烂 ⇒ fail-closed） */
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

export interface ConsumeSite {
  file: string;
  line: number;
}

/** 一条具名导入（名字 ＋ 它在哪个文件哪一行——报文要能指向能改的那一行） */
export interface UiNamedImport {
  name: string;
  file: string;
  line: number;
}

/**
 * 读随包账本 → `{ 导出名: since }`（四栏（components/hooks/helpers/types）拍平成一张名字表）。
 * 缺失 / 坏 / 有条目没有合法 `since` ⇒ **null**（调用方 fail-closed 报「未核验」，⛔ 不许当 0 处通过）。
 * 🔴 同名跨栏出现时取**较晚**的 since（保守方向：地板高一点只会更安全，绝不放过）。
 */
export function loadUiSurfaceLedger(file: string = UI_SURFACE_LEDGER_FILE): Record<string, string> | null {
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    const table: Record<string, string> = {};
    for (const col of ["components", "hooks", "helpers", "types"]) {
      const entries = raw?.[col];
      if (!entries || typeof entries !== "object" || Array.isArray(entries)) return null;
      for (const [name, v] of Object.entries(entries as Record<string, unknown>)) {
        const since = (v as { since?: unknown } | null)?.since;
        if (typeof since !== "string" || !SEMVER_RE.test(since)) return null; // 半份账本 ⇒ 未核验
        const prev = table[name];
        if (prev === undefined || gte(parseSemver(since)!, parseSemver(prev)!)) table[name] = since;
      }
    }
    return Object.keys(table).length > 0 ? table : null;
  } catch {
    return null;
  }
}

export interface UiFloor {
  /** 地板（x.y.z）；null = 账本读不到 ⇒ 调用方 fail-closed */
  floor: string | null;
  /** 基线 = 账本里最早的 since（vendor 供给机制起点那一批；无具名导入时地板就是它） */
  baseline: string | null;
  /** 把地板顶到基线之上的那个导入名（没有 ⇒ null，地板 = 基线） */
  driver: { name: string; since: string } | null;
  /** 静态具名导入里账本**没有**的名字（拼错 / 私有 / 子路径 API） */
  missing: string[];
}

/** 地板计算（纯函数——自测直接跑它，⛔ 不读盘） */
export function computeUiFloor(ledger: Record<string, string>, names: string[]): UiFloor {
  const all = Object.values(ledger).filter((s) => SEMVER_RE.test(s));
  let floor: string | null = null;
  for (const s of all) {
    if (floor === null || gte(parseSemver(floor)!, parseSemver(s)!)) floor = s; // min
  }
  const baseline = floor;
  const missing: string[] = [];
  let driver: { name: string; since: string } | null = null;
  for (const name of names) {
    const since = ledger[name];
    if (since === undefined) {
      if (!missing.includes(name)) missing.push(name);
      continue;
    }
    if (floor === null || gt(parseSemver(since)!, parseSemver(floor)!)) {
      floor = since; // max（与基线并列时不算「出处」）
      driver = { name, since };
    }
  }
  return { floor, baseline, driver, missing };
}

function collectConsumeSites(root: string): ConsumeSite[] {
  const sites: ConsumeSite[] = [];
  for (const { rel, cleaned } of cleanedSources(root)) {
    for (const re of CONSUME_RES) {
      const re2 = new RegExp(re.source, "g");
      let m: RegExpExecArray | null;
      while ((m = re2.exec(cleaned)) !== null) {
        sites.push({ file: rel, line: countNewlines(cleaned.slice(0, m.index)) + 1 });
      }
    }
  }
  return sites;
}

/**
 * 收「静态具名导入裸包名」的导出名（**只有这一形态贡献名字**，口径见头注 ②）。
 * 逐条剔除：`type X`（类型条目零运行时绑定）、`X as Y`（取源名 = ui 那边的名字）、`default` / `*`
 * （不是账本里的具名导出）。
 */
export function collectUiImportNames(root: string): UiNamedImport[] {
  const out: UiNamedImport[] = [];
  for (const { rel, cleaned } of cleanedSources(root)) {
    const re = new RegExp(NAMED_BARE_RE.source, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
      const line = countNewlines(cleaned.slice(0, m.index)) + 1;
      for (const raw of m[1].split(",")) {
        let name = raw.trim();
        if (!name || name === "default" || name === "*") continue;
        if (/^type\s/.test(name)) continue; // 条目级 type-only
        const asIdx = name.indexOf(" as ");
        if (asIdx >= 0) name = name.slice(0, asIdx).trim();
        if (!/^[A-Za-z_$][\w$]*$/.test(name)) continue; // 形态不认识就不贡献名字（消费判定已记过一笔）
        if (!out.some((o) => o.name === name)) out.push({ name, file: rel, line });
      }
    }
  }
  return out;
}

/** 读盘 + 剔除注释 + 剔除 type-only 整句（消费判定与收名共用**同一份清洗结果**，⛔ 不各洗一遍） */
function cleanedSources(root: string): { rel: string; cleaned: string }[] {
  const out: { rel: string; cleaned: string }[] = [];
  for (const abs of collectFiles(root, EXT)) {
    const rel = relPath(root, abs);
    if (isTestOrMockRel(rel)) continue; // 与其余 check 同口径：测试夹具里的字符串不是真 import
    let cleaned = stripLineComments(stripComments(readSource(abs)));
    cleaned = cleaned.replace(TYPE_ONLY_RE, " ");
    out.push({ rel, cleaned });
  }
  return out;
}

/** 声明核对——`manifest` 读不到返回 fail-closed 文案；正常返回 { declared } 供判定 */
function readMinAppVersion(root: string): { kind: "unreadable"; reason: string } | { kind: "ok"; declared: unknown } {
  const manifestPath = join(root, "plugin.json");
  if (!existsSync(manifestPath)) return { kind: "unreadable", reason: "plugin.json 不存在" };
  try {
    const manifest = readPluginManifest(manifestPath) as { minAppVersion?: unknown } | null;
    return { kind: "ok", declared: manifest?.minAppVersion };
  } catch (e) {
    return { kind: "unreadable", reason: `plugin.json 读不了（${e instanceof Error ? e.message : String(e)}）` };
  }
}

/**
 * ⚠️ `ledger` 可注入（单测用）；缺省读随包账本。传 `null` = 模拟「账本读不到」以验 fail-closed。
 */
export function runUiMinAppVersionCheck(root: string, opts: { ledger?: Record<string, string> | null } = {}): CheckViolation[] {
  const violations: CheckViolation[] = [];
  const sites = collectConsumeSites(root);
  if (sites.length === 0) return violations; // 不消费 ui ⇒ 无声明义务（本腿静默）

  const firstSite = `${sites[0].file}:${sites[0].line}`;
  const consumeSummary = `插件源码运行时消费 @linkdesk/ui（${sites.length} 处，首处 ${firstSite}）`;

  const ledger = opts.ledger === undefined ? loadUiSurfaceLedger() : opts.ledger;
  if (ledger === null) {
    violations.push({
      file: "plugin.json",
      line: 1,
      message: `${consumeSummary}，但 UI 导出面账本（本包 schemas/ui-surface.json）读不到或形状烂 ⇒ 地板算不出来、minAppVersion **未核验**（fail-closed，⛔ 未核验不等于通过）。${UI_MIN_APP_VERSION_WHY}`,
    });
    return violations;
  }
  const named = collectUiImportNames(root);
  const { floor, baseline, driver, missing } = computeUiFloor(ledger, named.map((n) => n.name));
  if (floor === null) {
    violations.push({
      file: "plugin.json",
      line: 1,
      message: `${consumeSummary}，但 UI 导出面账本里一个合法 since 都没有 ⇒ 地板算不出来、minAppVersion **未核验**（fail-closed，⛔ 未核验不等于通过）。${UI_MIN_APP_VERSION_WHY}`,
    });
    return violations;
  }
  /** 决定地板的那个导入名出现在哪（报文里给作者一行能直接跳过去的位置） */
  const driverSite = driver ? named.find((n) => n.name === driver.name) : undefined;
  const driverWhere = driverSite ? `（${driverSite.file}:${driverSite.line}）` : "";

  const manifest = readMinAppVersion(root);
  if (manifest.kind === "unreadable") {
    violations.push({
      file: "plugin.json",
      line: 1,
      message: `${consumeSummary}（地板 ${floor}），但${manifest.reason}——minAppVersion 无法核对（fail-closed）。${UI_MIN_APP_VERSION_WHY}`,
    });
    return violations;
  }

  const declared = manifest.declared;
  if (typeof declared !== "string" || declared.trim() === "") {
    violations.push({
      file: "plugin.json",
      line: 1,
      message: `${consumeSummary}，地板 ${floor}${driver ? `（由 ${driver.name} 决定，since ${driver.since}）` : `（基线：账本里最早的 since）`}，但 plugin.json 未声明 minAppVersion——旧壳装到你 = 组件无处解析、**整个插件崩掉**，加载期连提示都没有。修法：声明 minAppVersion ≥ ${floor}。${UI_MIN_APP_VERSION_WHY}`,
    });
    return violations;
  }

  const parsed = parseSemver(declared);
  if (!parsed) {
    violations.push({
      file: "plugin.json",
      line: 1,
      message: `${consumeSummary}，但 minAppVersion = ${JSON.stringify(declared)} 不是 x.y.z 形态，无法核对 ≥ 地板 ${floor}（fail-closed）。${UI_MIN_APP_VERSION_WHY}`,
    });
    return violations;
  }

  // 名字不在账本 ⇒ 红（先报，因为「这个名字根本不存在」比「声明低」更根本）
  if (missing.length > 0) {
    const shown = missing.slice(0, 5);
    const more = missing.length > shown.length ? `（另有 ${missing.length - shown.length} 个）` : "";
    violations.push({
      file: "plugin.json",
      line: 1,
      message:
        `${consumeSummary}，但导入名 ${shown.join(" / ")}${more} **不在 @linkdesk/ui 的导出面账本里**——它不是对插件许诺的导出` +
        `（拼错了？还是子路径 / 私有 API？）。账本 = @linkdesk/plugin-sdk 的 schemas/ui-surface.json（随包下发、离线可核）。` +
        `修法：照《组件速查》/《插件分发格式》§minAppVersion 改成账本里的名字（⛔ 别指望旧壳上有它）。${UI_MIN_APP_VERSION_WHY}`,
    });
  }

  if (!gte(parsed, parseSemver(floor)!)) {
    const why = driver
      ? `你导入了 ${driver.name}${driverWhere}——这个导出 @linkdesk/ui **自壳 ${driver.since} 起**才提供（账本 since）`
      : `地板 = 基线 ${baseline}（vendor 供给机制的起点那一批；你没有静态具名导入，按基线算）`;
    violations.push({
      file: "plugin.json",
      line: 1,
      message:
        `${consumeSummary}，但 minAppVersion = ${declared} **低于地板 ${floor}**：${why}。` +
        `壳 ${declared} ~ ${floor} 之间没有它——ESM 链接期解析不到 ⇒ **整个插件崩掉**（不是「那个组件不显示」）。` +
        `修法二选一：① plugin.json 的 minAppVersion 抬到 ≥ ${floor}；② 别用 ${driver ? driver.name : "该导出"}（换一个 since ≤ ${declared} 的导出——账本里查得到每个导出的 since）。` +
        `${UI_MIN_APP_VERSION_WHY}`,
    });
  }
  return violations;
}
