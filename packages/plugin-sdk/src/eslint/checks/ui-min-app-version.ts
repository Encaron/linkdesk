/**
 * check 腿——**`@linkdesk/ui` 消费 ⇒ `minAppVersion` 声明门禁**（E6#129 · L9 收尾遗留，2026-09-19）。
 *
 * ── 它守的是哪句话 ──
 *   L9 起 `@linkdesk/ui` 由壳池 vendor 单实例供给（import-map JS ＋ vendor css link），版本与壳
 *   同号锁步（E6#124 重锚：ui 0.3.x 线弃用，锚点 = 壳 0.2.13）。SDK 的 build 把 `@linkdesk/ui`
 *   external 化 ⇒ 用新 SDK 打出的插件在**旧壳上没有组件可解析**——装上即视图全崩。作者唯一的
 *   自保声明 = `plugin.json` 的 `minAppVersion`：低于重锚号的旧壳装到你时，加载期就拿到明确的
 *   「requires app version ≥X」提示（04-插件分发格式 §minAppVersion），而不是半个坏掉的界面。
 *   本腿 = 那句声明的**机械把关**（#128 给存量四仓补了声明，但此前没有任何机械件拦住下一个新插件漏声明）。
 *
 * ── 判定式 ──
 *   ① 消费判定：源码（.ts/.tsx/.js/.jsx/.mjs/.cjs，注释剔除、测试/夹具跳过——与其余 check 同口径）
 *      出现 `from "@linkdesk/ui…"`（静态 import/export）、`import("@linkdesk/ui…")`、
 *      `require("@linkdesk/ui…")`、`import "@linkdesk/ui…"`（side-effect）四形态之一 ⇒ 有运行时消费。
 *      **type-only import 不算**（`import type`/`export type` 编译期擦除，零运行时依赖、无义务）；
 *      ⚠️ `import { type X } from "@linkdesk/ui"` 语句整体含运行时绑定 ⇒ 照算。
 *   ② 声明核对（读到消费后才核对；不消费 ui 的插件零义务、零报点）：
 *      - `plugin.json` 缺失 / jsonc 语法坏 ⇒ **fail-closed 红**（无法核对 = 红，假绿比假红更坏）；
 *      - `minAppVersion` 未声明 / 空串 ⇒ 红；
 *      - 非 `x.y.z` 形态 ⇒ 红（没法核对 ≥ 重锚号）;
 *      - `< UI_REANCHOR_APP_VERSION` ⇒ 红（导出快照/独立重发都改变不了供给下限）。
 *   报点统一落在 `plugin.json:1`（这是**声明侧**的事实——与插件域各腿 fail-closed 同址）。
 *
 * ── 报文指向 ──
 *   `docs/03-插件制造/04-插件分发格式.md §minAppVersion`（EN `04-distribution-format.md` 同节），
 *   版本一条线语义见 `19-组件速查.md §2.1`。作者侧动作只有一种：**把 minAppVersion 抬到 ≥ 重锚号**。
 *   ⚠️ 本腿**没有豁免出口**（disable 注释对它无效——「知情地把旧壳用户放到无供给的 ui 上」不是
 *   合法偏离，是语义错误；同 `check-ui-css-import` 的先例）。存量 = 0（四只消费仓 #128 已声明
 *   `0.2.13`，其余官方仓不消费 ui）⇒ 纯预防、零重发成本。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
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
 * UI 重锚号 = 壳/ui 锁步起点（E6#124，2026-09-19；壳 0.2.12 → 0.2.13，ui 0.3.1 → 0.2.13）。
 * 🔴 这是**一次性的历史事实**、不是会漂移的目标：vendor 供给机制从这一版才存在，低它必崩；
 * 高它只是更保守。因此常量住本文件即可，不需要生成式下发。
 */
export const UI_REANCHOR_APP_VERSION = "0.2.13";

export const UI_MIN_APP_VERSION_WHY =
  `组件由壳池 vendor 单实例供给（@linkdesk/ui 与壳同号锁步）：不消费旧壳的插件必须让旧壳加载前就知道——` +
  `声明 minAppVersion ≥ ${UI_REANCHOR_APP_VERSION}；作者面说明见《插件分发格式》§minAppVersion`;

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

interface ConsumeSite {
  file: string;
  line: number;
}

function collectConsumeSites(root: string): ConsumeSite[] {
  const sites: ConsumeSite[] = [];
  for (const abs of collectFiles(root, EXT)) {
    const rel = relPath(root, abs);
    if (isTestOrMockRel(rel)) continue; // 与其余 check 同口径：测试夹具里的字符串不是真 import
    let cleaned = stripLineComments(stripComments(readSource(abs)));
    cleaned = cleaned.replace(TYPE_ONLY_RE, " ");
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

export function runUiMinAppVersionCheck(root: string): CheckViolation[] {
  const violations: CheckViolation[] = [];
  const sites = collectConsumeSites(root);
  if (sites.length === 0) return violations; // 不消费 ui ⇒ 无声明义务（本腿静默）

  const firstSite = `${sites[0].file}:${sites[0].line}`;
  const consumeSummary = `插件源码运行时消费 @linkdesk/ui（${sites.length} 处，首处 ${firstSite}）`;

  const manifest = readMinAppVersion(root);
  if (manifest.kind === "unreadable") {
    violations.push({
      file: "plugin.json",
      line: 1,
      message: `${consumeSummary}，但${manifest.reason}——minAppVersion 无法核对（fail-closed）。${UI_MIN_APP_VERSION_WHY}`,
    });
    return violations;
  }

  const declared = manifest.declared;
  if (typeof declared !== "string" || declared.trim() === "") {
    violations.push({
      file: "plugin.json",
      line: 1,
      message: `${consumeSummary}，但 plugin.json 未声明 minAppVersion——旧壳装到你 = 组件无处解析、视图全崩，加载期连提示都没有。${UI_MIN_APP_VERSION_WHY}`,
    });
    return violations;
  }

  const parsed = parseSemver(declared);
  const floor = parseSemver(UI_REANCHOR_APP_VERSION);
  if (!parsed || !floor) {
    violations.push({
      file: "plugin.json",
      line: 1,
      message: `${consumeSummary}，但 minAppVersion = ${JSON.stringify(declared)} 不是 x.y.z 形态，无法核对 ≥ ${UI_REANCHOR_APP_VERSION}（fail-closed）。${UI_MIN_APP_VERSION_WHY}`,
    });
    return violations;
  }

  if (!gte(parsed, floor)) {
    violations.push({
      file: "plugin.json",
      line: 1,
      message: `${consumeSummary}，但 minAppVersion = ${declared} 低于重锚号 ${UI_REANCHOR_APP_VERSION}——低于它的旧壳没有 vendor 供给。${UI_MIN_APP_VERSION_WHY}`,
    });
  }
  return violations;
}
