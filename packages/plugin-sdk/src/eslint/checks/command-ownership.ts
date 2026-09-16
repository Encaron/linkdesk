/**
 * check-command-ownership 腿·**命令 id 与协议 id 的归属判据**（E6#111b · 轮次 1.32）。
 *
 * ── 为什么（本件立项的那条轴）──
 * 命令 id 是**跨插件调用面**（`executeCommand`）＋ `menus[].command` / `keybindings[].command` 的引用目标。
 * 1.31 实测：官方 18 仓有 **26 个名 / 46 处** 的命令 id **不带本仓归属**（`editor.selectForCompare`
 * 属主其实是 `file-tree` 插件），且壳侧旧实现的归属**从名字第一段猜**（`commandId.split(".")[0]`）
 * ⇒ 两个插件用同一前缀时**静默互相覆盖**（不报错、只是有一个永远不生效）。
 * ⇒ 归属必须**从身份来**：`contributes.commands[].id` 的第一段就该是本仓 `pluginId`。
 *
 * ── 三条判据（与壳仓 `scripts/gen-host-reserved.mjs` 的账同源）──
 *   ① `<pluginId>.` 前缀：命令 id / 协议 id 的第一段 == 本仓 `pluginId`（**结构判定，不查表**）。
 *   ② **宿主保留面**：不得落在账（包内 `schemas/host-reserved.json`）的 `commandPrefixes` /
 *      `protocolIds` 里——占了就是「顶替宿主命令」（`workbench.action.showCommands` 那种真形态）。
 *      🔴 账是**生成式 ＋ 双向对账**的（壳仓 `npm run check` 守），**本腿只许读账、不许内联一份**：
 *        规则里内联前缀清单 = 手抄表 = 假判据（1.31 §八 已把这条写成禁区）。
 *   ③ **扫描面**（三面都判 ①②，分别报点、读口径不同）：
 *      · **声明面** = `plugin.json` 的 `contributes.commands[].id`（**权威面**，loader 用真身份注册）；
 *      · **运行时面** = 源码里 `registerCommand("<字面量>")` 的调用点（**改名要同笔改的另一半**）；
 *      · **协议面** = 源码里 `registerProtocol({ id: "<字面量>" })`（协议 id 与命令 id 同族：都是
 *        全局名册的键，`ProtocolRegistry` 用 `Map` ＋ 重复注册只 `console.warn` 后照旧覆盖）。
 *
 * ── 🔴 本格（1.32）只判**黄**，别在这里自行判红 ──
 * 官方仓此刻**还没改名**（改名归 1.42–1.48，前置 1.41）；判红会让插件仓 CI 处于一段无谓的红窗。
 * 本腿的报点**进 `runPluginLint` 的 WARN 通道**（`bin lint` 退出码只看 eslint 的 severity 2
 * ——见 `src/bin.ts`）⇒ 天然是黄灯。**1.49 才收紧为红**（照 1.31 §12 的分级表）。
 *
 * 知情绕行 = 标准 disable 注释（`CHECK_IDS.commandOwnership`）。⚠️ **fail-closed 不参与豁免**：
 * 拿不到 `pluginId` 说的不是「你的 id 怎么写」，而是「你的身份读不到」——那是工程根的问题。
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readPluginManifest } from "../../validate.js";
import { resolvePluginIdForCss, type PluginIdSource } from "./plugin-prefix.js";
import {
  collectFiles,
  isTestOrMockRel,
  readSource,
  relPath,
  type CheckViolation,
} from "./scan.js";
import { buildDisableIndex, isDisabled, CHECK_IDS } from "./disable.js";

/**
 * 包内宿主保留面账定位（dist/eslint/checks/x.js → ../../../schemas = 包根/schemas；src 直跑同样命中）。
 * 🔴 写法必须是「路径式」（resolve + fileURLToPath）——`new URL(<字面量>, import.meta.url)` 是
 * Vite 的资产 URL 惯用式，本模块一旦被 Vite 处理会被改写成构建期资产引用（validate.ts 同款坑，E6#91e）。
 */
export const HOST_RESERVED_FILE = resolve(dirname(fileURLToPath(import.meta.url)), "../../../schemas/host-reserved.json");

/** 本腿要读的两栏 ＋ **E6#111d（1.34）起原地补齐另两栏**——`configKeys`（配置键归属腿：判「不得占用宿主
 *  设置面」）与 `pseudoPluginIds`（宿主伪身份：判「不得冒充宿主身份注册」）。**同一个 loader、同一份账**——
 *  ⛔ 不许在各腿里各写一份 loader（两份 = 迟早漂，而这两条判据的输入必须是同一本账）。
 *  剩下两栏（contextKeys / appearanceIds）由上下文旗子、外观 id 的后续轮次消费，此处不读也不删。 */
export interface HostReservedNames {
  commandPrefixes: string[];
  protocolIds: string[];
  /** E6#111d：宿主 app.* 配置键（保护区输入；含退役键） */
  configKeys: string[];
  /** E6#111d：宿主伪身份（app / appearance / update）——插件用它注册 = 冒充宿主 */
  pseudoPluginIds: string[];
}

/** 读宿主保留面账；文件缺失 ⇒ 空表 ＋ 报告里打一条 note（静默空表 = 判据②变瞎子，不许不吭声） */
export function loadHostReserved(file: string = HOST_RESERVED_FILE): HostReservedNames {
  if (!existsSync(file)) return { commandPrefixes: [], protocolIds: [], configKeys: [], pseudoPluginIds: [] };
  const raw = JSON.parse(readFileSync(file, "utf8")) as {
    commandPrefixes?: string[];
    protocolIds?: string[];
    configKeys?: string[];
    pseudoPluginIds?: string[];
  };
  return {
    commandPrefixes: raw.commandPrefixes ?? [],
    protocolIds: raw.protocolIds ?? [],
    configKeys: raw.configKeys ?? [],
    pseudoPluginIds: raw.pseudoPluginIds ?? [],
  };
}

/** 判据命中的两种形态 */
export type CommandIdCode = "no-plugin-prefix" | "host-reserved";

/** 扫描面：声明面（plugin.json）/ 运行时面（registerCommand 字面量）/ 协议面（registerProtocol 字面量） */
export type CommandIdFace = "declared" | "runtime" | "protocol";

/** 一处不合规站点（探针 `scripts/audit-nonnaming.mjs` 与腿共用同一份数据） */
export interface CommandIdSite {
  face: CommandIdFace;
  /** 工程相对路径（正斜杠）；声明面恒为 `plugin.json` */
  file: string;
  line: number;
  id: string;
  code: CommandIdCode;
  /** 应改成什么：**只换第一段**（`<pluginId>.` ＋ 原 id 第一段之后的全部）——
   *  ⚠️ 不是「前缀插入」：`explorer.newFile` ⇒ `file-tree.newFile`（1.31 §10.2 的改名形状），
   *  词干零变化 ⇒ 改名映射可机械生成、同笔引用点替换无歧义。 */
  suggested: string;
  /** code = host-reserved 时：撞上的那条宿主保留前缀 / 宿主内置协议 id */
  reserved?: string;
}

export interface CommandOwnershipReport {
  root: string;
  pluginId: string | null;
  pluginIdSource: PluginIdSource | null;
  pluginIdNote: string | null;
  /** fail-closed：非 null ⇒ 本腿报红（拿不到身份就无从判归属） */
  error: string | null;
  /** 不合规站点（已过豁免） */
  sites: CommandIdSite[];
  /** 三面的**全部** id（合规 ＋ 不合规，按出现顺序去重）——探针的读数面（口径：名数，非站点数） */
  declaredIds: string[];
  runtimeIds: string[];
  protocolIds: string[];
  /** 账的加载实况（账没读到 ⇒ 判据②空转，报告里必须能看出来） */
  hostLedger: { file: string; found: boolean; commandPrefixes: number; protocolIds: number };
  /** 腿报点（= fail-closed ＋ 不合规站点） */
  violations: CheckViolation[];
}

/**
 * 一条命令/协议 id 的裁决（纯函数——单测与探针共用，别在别处再写一份判据）。
 *
 * 🔴 建议名的形状 = **只替换第一段**（`explorer.newFile` → `file-tree.newFile`，词干零变化）——
 *    命令 id 是 `<pluginId>.<名>` 的**两段结构**，归属段就是第一段（1.31 §10.2 拍板的改名形状，
 *    也是 1.42 改名轮要用的映射）。⚠️ 这与 CSS 腿的「**叠加**前缀」形状（`ms-item` →
 *    `marketplace-ms-item`）**不同**：那里没有结构化的第一段，只有"插进命名空间"一种改法。
 */
export function judgeCommandId(
  id: string,
  pluginId: string,
  reserved: HostReservedNames,
  face: CommandIdFace,
): { code: CommandIdCode; suggested: string; reserved?: string } | null {
  const dot = id.indexOf(".");
  const suggested = `${pluginId}.${dot > 0 ? id.slice(dot + 1) : id}`;
  // ② 宿主保留面（协议面比**全等**——协议 id 是扁平名；命令面比**前缀**——宿主命令带 `.` 分段）
  const hit =
    face === "protocol"
      ? reserved.protocolIds.includes(id)
        ? id
        : undefined
      : reserved.commandPrefixes.find((p) => id.startsWith(p));
  if (hit !== undefined) return { code: "host-reserved", suggested, reserved: hit };
  // ① 本仓前缀
  if (!id.startsWith(`${pluginId}.`)) return { code: "no-plugin-prefix", suggested };
  return null;
}

/** 源码字面量扫描：`collect` 返回 [{id, line, lineText}]——行号按 1-based 计 */
function scanLiterals(
  src: string,
  re: RegExp,
  collect: (m: RegExpMatchArray) => string | null,
): { id: string; line: number; lineText: string }[] {
  const out: { id: string; line: number; lineText: string }[] = [];
  for (const m of src.matchAll(re)) {
    const id = collect(m);
    if (!id) continue;
    const at = m.index ?? 0;
    const line = src.slice(0, at).split("\n").length;
    const lineStart = src.lastIndexOf("\n", at) + 1;
    const lineEnd = src.indexOf("\n", at);
    out.push({ id, line, lineText: src.slice(lineStart, lineEnd < 0 ? src.length : lineEnd) });
  }
  return out;
}

/** 运行时面：`registerCommand("<字面量>")`——与壳仓 `scripts/audit-plugin-scope.mjs` 同一条正则口径 */
export const RE_REGISTER_COMMAND = /registerCommand\s*\(\s*["'`]([^"'`]+)["'`]/g;
/** 协议面：`registerProtocol({ id: "<字面量>" })`（id 在对象字面量里，允许中间隔着别的键） */
export const RE_REGISTER_PROTOCOL = /registerProtocol\s*\(\s*\{[\s\S]{0,400}?\bid\s*:\s*["'`]([^"'`]+)["'`]/g;

/** 取 manifest 里某个 id 的行号（JSONC 原文里找 `"id": "<id>"`；找不到 ⇒ 1，不许当成「不存在」） */
export function manifestIdLine(raw: string, id: string): number {
  const esc = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = raw.match(new RegExp(`"id"\\s*:\\s*"${esc}"`));
  if (!m || m.index === undefined) return 1;
  return raw.slice(0, m.index).split("\n").length;
}

/**
 * 跑本仓命令/协议 id 归属判据。返回结构化报告（探针用）＋ 腿报点（`lint.ts` 用）——**同一份实现**。
 */
export function runCommandOwnershipCheck(
  root: string,
  reserved: HostReservedNames = loadHostReserved(),
  reservedFile: string = HOST_RESERVED_FILE,
): CommandOwnershipReport {
  const absRoot = resolve(root);
  const manifestPath = join(absRoot, "plugin.json");
  const resolution = resolvePluginIdForCss(absRoot);
  const violations: CheckViolation[] = [];
  const report: CommandOwnershipReport = {
    root: absRoot,
    pluginId: resolution.pluginId,
    pluginIdSource: resolution.source,
    pluginIdNote: resolution.note,
    error: resolution.error,
    sites: [],
    declaredIds: [],
    runtimeIds: [],
    protocolIds: [],
    hostLedger: {
      file: reservedFile,
      found: existsSync(reservedFile),
      commandPrefixes: reserved.commandPrefixes.length,
      protocolIds: reserved.protocolIds.length,
    },
    violations,
  };

  // ── fail-closed（不可豁免：拿不到身份 = 判据①② 全部无从谈起）──
  if (resolution.error || !resolution.pluginId) {
    violations.push({
      file: "plugin.json",
      line: 1,
      message:
        `拿不到本仓 pluginId：${resolution.error}。归属判据以「本仓身份」为唯一前缀来源——读不到它就无从判` +
        `「这条命令 id 是不是你的」。在插件工程根修好 plugin.json（或显式声明 pluginId），` +
        `别用 disable 注释绕：这是身份问题，不受豁免注释管辖。`,
    });
    return report;
  }

  const pluginId = resolution.pluginId;
  const prefix = `${pluginId}.`;
  const manifestRaw = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "";
  const manifestDisabled = buildDisableIndex(manifestRaw, [CHECK_IDS.commandOwnership]);

  const pushSite = (site: CommandIdSite, message: string, disabled?: { idx: ReturnType<typeof buildDisableIndex>; line: number }): void => {
    if (disabled && isDisabled(disabled.idx, disabled.line, CHECK_IDS.commandOwnership)) return;
    report.sites.push(site);
    violations.push({ file: site.file, line: site.line, message });
  };

  const judgeAndPush = (
    face: CommandIdFace,
    id: string,
    file: string,
    line: number,
    disabled?: { idx: ReturnType<typeof buildDisableIndex>; line: number },
  ): void => {
    const verdict = judgeCommandId(id, pluginId, reserved, face);
    if (!verdict) return;
    const where = face === "declared" ? "声明面（plugin.json contributes.commands）" : face === "runtime" ? "运行时面（registerCommand 字面量）" : "协议面（registerProtocol 字面量）";
    const message =
      verdict.code === "host-reserved"
        ? `${where}：id "${id}" 落在**宿主保留面**（${verdict.reserved}）里——占用宿主命名 = 顶替宿主命令/协议` +
          `（宿主那条同名命令会永远不生效，且不报错）。改成 "${verdict.suggested}"（只换第一段、"${verdict.reserved}" 之后的词干一个字不改）。`
        : `${where}：id "${id}" 不带本仓归属（本插件 pluginId = "${pluginId}"，应以 "${prefix}" 开头）` +
          `——命令 id 是跨插件调用面，壳侧按第一段找属主：前缀不对 = 归属落到别人头上（或谁都不认）。` +
          `改成 "${verdict.suggested}"（只换第一段、词干零变化）。`;
    pushSite({ face, file, line, id, code: verdict.code, suggested: verdict.suggested, ...(verdict.reserved !== undefined ? { reserved: verdict.reserved } : {}) }, message, disabled);
  };

  // ── ① 声明面：contributes.commands[].id（真字段是 id；`command` 是菜单引用用的键名，别读错） ──
  if (manifestRaw) {
    let manifest: unknown = null;
    try {
      manifest = readPluginManifest(manifestPath);
    } catch {
      manifest = null; // 读不出 ⇒ 声明面判据跳过（plugin-prefix 腿已对同一件事 fail-closed 报红，不重复报）
    }
    const cmds = (manifest as { contributes?: { commands?: { id?: unknown }[] } } | null)?.contributes?.commands;
    if (Array.isArray(cmds)) {
      for (const c of cmds) {
        const id = c?.id;
        if (typeof id !== "string" || !id) continue;
        if (!report.declaredIds.includes(id)) report.declaredIds.push(id);
        judgeAndPush("declared", id, "plugin.json", manifestIdLine(manifestRaw, id), { idx: manifestDisabled, line: manifestIdLine(manifestRaw, id) });
      }
    }
  }

  // ── ② 运行时面 ＋ ③ 协议面：源码字面量（只扫真源码——测试/mock 跳过，与另几条腿同口径） ──
  for (const abs of collectFiles(absRoot, [".ts", ".tsx", ".js", ".jsx"])) {
    const rel = relPath(absRoot, abs);
    if (isTestOrMockRel(rel)) continue;
    const src = readSource(abs);
    const idx = buildDisableIndex(src, [CHECK_IDS.commandOwnership]);

    for (const hit of scanLiterals(src, RE_REGISTER_COMMAND, (m) => m[1])) {
      if (!report.runtimeIds.includes(hit.id)) report.runtimeIds.push(hit.id);
      judgeAndPush("runtime", hit.id, rel, hit.line, { idx, line: hit.line });
    }
    for (const hit of scanLiterals(src, RE_REGISTER_PROTOCOL, (m) => m[1])) {
      if (!report.protocolIds.includes(hit.id)) report.protocolIds.push(hit.id);
      judgeAndPush("protocol", hit.id, rel, hit.line, { idx, line: hit.line });
    }
  }

  return report;
}
