/**
 * check 腿——**菜单槽位 id 写成了宿主成员名（而不是它的值）判红**（文件树「打开文件夹入口」门禁件 ·
 * 2026-09-29 · 出处：[05-插件更新/文件树/01-打开文件夹入口-设计.md §二·六](../../../../../docs/05-插件更新/文件树/01-打开文件夹入口-设计.md)）。
 *
 * ── 这条禁令为什么要有腿（一条真实事故，不是假想）──
 *   2026-08-11 的池核心隔离（壳仓 commit `af2ef5712`）把一份
 *   `const MenuId = { FileContext: "FileContext", MenuBar: "MenuBar" }` 的**枚举成员名**当成槽位值
 *   搬进了插件，于是 `menu.registerItems("MenuBar", …)` 与 `menuId={"FileContext"}` 全部落进**死键**。
 *   后果：插件给宿主「文件」菜单做的那些项**凭空消失两个多月**，用户以为是自己删的，
 *   期间**没有任何一道门禁报过**。
 *
 * ── 根因不是「没人审」，是「判据不存在」（这决定了本腿只判一条规则）──
 *   `export type MenuId = string`（宿主 `MenuRegistry.ts`）——**槽位 id 是开放字符串**，第三方可以
 *   自造注册点，所以「未知 id」在原理上**无法判红**；而 `contributes.menus` 的键在 schema 里是自由
 *   格式（无 enum）⇒ 写错键在**两条注册路径**（声明式 `contributes.menus` ／ 命令式
 *   `menu.registerItems`）上都是**静默无输出**，连报错都没有。
 *   唯一既零假红、又**没有任何合法用途**的判据是这条：
 *
 *      🔴 **槽位 id 与宿主某个值仅大小写不同 ⇒ 红。**
 *
 *   为什么零假红：宿主槽位值一律小驼峰（`fileContext` / `menuBar` / `cardContext`…），而
 *   `FileContext` / `MenuBar` 是**成员名**——它长得像值，却是另一码事。一个人写下 `MenuBar` 时，
 *   想要的**只可能**是 `menuBar`；没有哪种插件设计会故意自造一个「只差大小写」的注册点
 *   （那等于给自己挖一个永远读不出东西的键）。
 *
 * ── 判据物（三个通道，全是**字面量站点**，⛔ 不是「文件里出现某个词」）──
 *   ① `plugin.json` 的 `contributes.menus` **键**（声明式注册点）；
 *   ② `.registerItems("<字面量>"` / `.getItems("<字面量>"`（命令式菜单 API，含 `?.` 可选链与解构后的裸调用）；
 *   ③ `menuId={"<字面量>"`（`@linkdesk/ui` 的 `ContextMenu` 等件的菜单 id prop，含 `menuId: "…"` 写法）。
 *   ⚠️ 匹配前一律先剥注释（`stripComments` ＋ `stripLineComments`，等长替换 ⇒ 行号不漂移）——
 *   本腿的**文档注释里就写着** `"FileContext"` / `"MenuBar"` 这两个反面例子，
 *   不剥注释的话这条腿会被自己的文档判红。
 *
 * ── 豁免 ──
 *   `// eslint-disable-next-line linkdesk/no-menu-slot-case -- 理由`。⚠️ 说实话：这条判据的合法偏离
 *   形态我**想不出一个**（写下只差大小写的槽位 id 没有任何正当用途）——所以本腿实质上不接受绕行，
 *   豁免机制只是与其余腿同形（`disable.ts` 是全局解析器，不为单腿改语义），⛔ 别把它当许可。
 *
 * ── 🔴 保底（fail-closed）──
 *   宿主名单读不到（`@linkdesk/plugin-sdk` 包不完整）⇒ 报「**未核验**」并红。
 *   「0 处通过」在这里是**假绿**——假绿比假红更坏：你会以为已经查过了。
 *   名单随包下发（`schemas/host-menu-slots.json`），唯一真源 = 壳的 `MENU_SLOTS`，
 *   由壳仓 `scripts/gen-host-menu-slots.mjs` 生成（`--check` 对账，挂壳 check 链）。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectFiles,
  countNewlines,
  isTestOrMockRel,
  readSource,
  relPath,
  stripComments,
  stripLineComments,
  type CheckViolation,
} from "./scan.js";
import { buildDisableIndex, isDisabled, CHECK_IDS } from "./disable.js";
import { manifestKeyLine } from "./config-ownership.js";

export const MENU_SLOT_CASE_ID = CHECK_IDS.menuSlotCase;

/** 判级文案——错在哪 ＋ 怎么改 ＋ 豁免出口 */
export const MENU_SLOT_WHY =
  "宿主菜单槽位 id 一律**小驼峰**（`menuBar` / `fileContext` / `cardContext`…），" +
  "而 `MenuBar` / `FileContext` 是宿主 `MENU_SLOTS` 的**成员名**，不是槽位值——" +
  "写成成员名不会报错，只会**静默落进一个死键**（菜单项从此不出现，声明式 `contributes.menus` 与" +
  "命令式 `menu.registerItems` 两条路径都一样）。修法：把槽位 id 换成宿主成员名对应的**值**" +
  "（`MenuBar` → `menuBar`、`FileContext` → `fileContext`）。" +
  `确需绕行 = // eslint-disable-next-line ${MENU_SLOT_CASE_ID} -- 理由。`;

/** 随包下发的宿主菜单槽位名单（`schemas/host-menu-slots.json`，壳 `MENU_SLOTS` 的投影） */
export interface HostMenuSlotEntry {
  /** 宿主 `MENU_SLOTS` 的成员名（**不是**要写进插件的东西——报错时用来说明「这是成员名，值在下一格」） */
  key: string;
  /** 宿主 `MENU_SLOTS` 的值 = 真正的槽位 id（插件该写这个） */
  value: string;
}

export interface HostMenuSlots {
  version: number;
  generatedFrom: string;
  source: string;
  slotCount: number;
  entries: HostMenuSlotEntry[];
}

/**
 * 🔴 路径式 resolve（`dangling-names.ts` / `reserved-classes.ts` 同款）——
 * `new URL(<字面量>, import.meta.url)` 会被 Vite 改写。
 */
export const HOST_MENU_SLOTS_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../schemas/host-menu-slots.json",
);

/** 读随包名单；缺失/坏 ⇒ null（调用方 fail-closed 报「未核验」，⛔ 不许当 0 处通过） */
export function loadHostMenuSlots(file: string = HOST_MENU_SLOTS_FILE): HostMenuSlots | null {
  if (!existsSync(file)) return null;
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<HostMenuSlots>;
    if (!Array.isArray(raw.entries) || raw.entries.length === 0) return null;
    const entries = raw.entries.filter(
      (e): e is HostMenuSlotEntry => !!e && typeof e.key === "string" && typeof e.value === "string",
    );
    if (entries.length === 0) return null;
    return {
      version: typeof raw.version === "number" ? raw.version : 1,
      generatedFrom: typeof raw.generatedFrom === "string" ? raw.generatedFrom : "?",
      source: typeof raw.source === "string" ? raw.source : "?",
      slotCount: typeof raw.slotCount === "number" ? raw.slotCount : entries.length,
      entries,
    };
  } catch {
    return null; // JSON 坏了 = 读不到（同 fail-closed）
  }
}

/**
 * 唯一判据：`slot` 与某个宿主值**仅大小写不同** ⇒ 返回那条宿主条目；否则 null。
 * ⚠️ 完全相等不算（那是正解）；与所有值大小写都不同也不算（自造注册点，合法）。
 */
export function judgeMenuSlot(slot: string, entries: HostMenuSlotEntry[]): HostMenuSlotEntry | null {
  const lower = slot.toLowerCase();
  for (const e of entries) {
    if (e.value.toLowerCase() === lower) return e.value === slot ? null : e;
  }
  return null;
}

/** 站点通道（三档，见文件头「判据物」） */
export type MenuSlotVia = "declarative" | "menu-api" | "menu-id-prop";

export interface MenuSlotSite {
  file: string;
  line: number;
  slot: string;
  via: MenuSlotVia;
}

export interface MenuSlotReport {
  root: string;
  /** 非 null ⇒ fail-closed（宿主名单读不到 ⇒ 「未核验」，⛔ 不许当 0 处通过） */
  error: string | null;
  /** 宿主名单规模（读数用；error 非 null 时为 0） */
  hostSlotCount: number;
  /** 看过的槽位字面量站点（合法值与豁免的也算在「看见了」里） */
  sites: MenuSlotSite[];
  /** 腿报点 = fail-closed ＋ 别名站点 */
  violations: CheckViolation[];
}

const EXT = [".ts", ".tsx", ".js", ".jsx"];

/** 剥注释（等长替换 ⇒ 行号不漂移；`https://` 的 `//` 不误伤——与其余腿同口径） */
function cleanSource(src: string): string {
  return stripLineComments(stripComments(src));
}

/** 命令式菜单 API——`menu.registerItems("X"` / `menu?.getItems("X"` / `window.linkdesk.menu.registerItems("X"` */
const RE_MENU_API_QUALIFIED = /\bmenu\s*\??\s*\.\s*(?:registerItems|getItems)\(\s*(['"])([^'"]+)\1/g;
/** 解构后的裸调用（`const { registerItems } = menu; registerItems("X", …)`）——前面不是 `.`/标识符 才算 */
const RE_MENU_API_BARE = /(?<![\w$.])(?:registerItems|getItems)\(\s*(['"])([^'"]+)\1/g;
/** 菜单 id prop（`menuId={"X"}` / `menuId="X"` / `menuId: "X"`——`@linkdesk/ui` 的 ContextMenu 等件） */
const RE_MENU_ID_PROP = /\bmenuId\s*[=:]\s*\{?\s*(['"])([^'"]+)\1/g;

/** 一段（已剥注释的）源码里的槽位字面量站点（行号 1-based） */
export function findMenuSlotSites(src: string): { line: number; slot: string; via: MenuSlotVia }[] {
  const cleaned = cleanSource(src);
  const out: { line: number; slot: string; via: MenuSlotVia }[] = [];
  const push = (index: number, slot: string, via: MenuSlotVia): void => {
    out.push({ line: countNewlines(cleaned.slice(0, index)) + 1, slot, via });
  };
  for (const re of [RE_MENU_API_QUALIFIED, RE_MENU_API_BARE]) {
    re.lastIndex = 0;
    for (const m of cleaned.matchAll(re)) push(m.index ?? 0, m[2], "menu-api");
  }
  RE_MENU_ID_PROP.lastIndex = 0;
  for (const m of cleaned.matchAll(RE_MENU_ID_PROP)) push(m.index ?? 0, m[2], "menu-id-prop");
  // 同点去重（`menu.registerItems("X"` 会被两条 API 正则同时命中——保留先到的第一条）
  const seen = new Set<string>();
  return out.filter((s) => {
    const k = `${s.line}:${s.slot}:${s.via}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * 跑本仓菜单槽位大小写判据（作者侧唯一入口）。返回结构化报告——**同一份实现，没有第二条判据路径**。
 * ⚠️ `host` 可注入（单测用）；缺省读随包 `schemas/host-menu-slots.json`。
 */
export function runMenuSlotCheck(root: string, opts: { host?: HostMenuSlots | null } = {}): MenuSlotReport {
  const absRoot = resolve(root);
  const host = opts.host !== undefined ? opts.host : loadHostMenuSlots();
  const report: MenuSlotReport = {
    root: absRoot,
    error: null,
    hostSlotCount: host?.entries.length ?? 0,
    sites: [],
    violations: [],
  };

  // 🔴 保底（fail-closed）：宿主名单读不到 ⇒ 「未核验」报红——⛔ 不许静默当 0 处通过
  if (!host) {
    report.error = "宿主菜单槽位名单读不到";
    report.violations.push({
      file: "plugin.json",
      line: 1,
      message:
        "宿主菜单槽位名单（@linkdesk/plugin-sdk 的 schemas/host-menu-slots.json）**读不到** ⇒ 本腿**未核验**。" +
        "「0 处通过」在这里是假绿（假绿比假红更坏：你会以为已经查过了）。修复：重装 @linkdesk/plugin-sdk（包不完整）。",
    });
    return report;
  }

  // ① 声明式：plugin.json 的 contributes.menus 键
  const manifestAbs = resolve(absRoot, "plugin.json");
  const manifestExists = existsSync(manifestAbs);
  const manifestRaw = manifestExists ? readSource(manifestAbs) : "";
  if (manifestExists) {
    try {
      const parsed = JSON.parse(manifestRaw) as { contributes?: { menus?: unknown } };
      const menus = parsed.contributes?.menus;
      if (menus && typeof menus === "object" && !Array.isArray(menus)) {
        for (const key of Object.keys(menus as Record<string, unknown>)) {
          report.sites.push({ file: "plugin.json", line: manifestKeyLine(manifestRaw, key), slot: key, via: "declarative" });
        }
      }
    } catch {
      /* manifest 坏 JSON 由别处报（本腿只管槽位大小写，⛔ 不越界判格式） */
    }
  }

  // ② ③ 源码：命令式 API ＋ menuId prop（先剥注释——本腿文档注释里就写着反面例子）
  for (const abs of collectFiles(absRoot, EXT)) {
    const rel = relPath(absRoot, abs);
    if (isTestOrMockRel(rel)) continue; // 与其余 check 同口径：测试夹具里的菜单 id 不是真注册
    const src = readSource(abs);
    for (const site of findMenuSlotSites(src)) {
      report.sites.push({ file: rel, line: site.line, slot: site.slot, via: site.via });
    }
  }

  // 判定（三个通道同一个判据、同一个豁免索引口径——逐文件建索引）
  const disableCache = new Map<string, ReturnType<typeof buildDisableIndex>>();
  const disableFor = (file: string): ReturnType<typeof buildDisableIndex> => {
    let idx = disableCache.get(file);
    if (!idx) {
      const src = file === "plugin.json" ? manifestRaw : readSource(resolve(absRoot, file));
      idx = buildDisableIndex(src, [MENU_SLOT_CASE_ID]);
      disableCache.set(file, idx);
    }
    return idx;
  };
  for (const site of report.sites) {
    const hit = judgeMenuSlot(site.slot, host.entries);
    if (!hit) continue; // 合法值 / 自造注册点（不判）
    if (isDisabled(disableFor(site.file), site.line, MENU_SLOT_CASE_ID)) continue;
    const viaText =
      site.via === "declarative"
        ? "`contributes.menus` 的键"
        : site.via === "menu-api"
          ? "命令式菜单 API 的槽位参数"
          : "菜单 id prop";
    report.violations.push({
      file: site.file,
      line: site.line,
      message:
        `${viaText}写成了 \`${site.slot}\`（${site.file}:${site.line}）——` +
        `那是宿主 \`MENU_SLOTS.${hit.key}\` 的**成员名**，槽位**值**是 \`${hit.value}\`。` +
        `这个键在宿主注册表里查不到 ⇒ 菜单项不会出现，且**不报任何错**。${MENU_SLOT_WHY}`,
    });
  }
  report.violations.sort((x, y) => x.file.localeCompare(y.file) || x.line - y.line);
  return report;
}
