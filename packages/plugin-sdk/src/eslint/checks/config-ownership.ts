/**
 * check-config-ownership 腿·**配置键归属判据**（E6#111d · 轮次 1.34）。
 *
 * ── 为什么（本件立项的那条轴）──
 * 配置键是**用户数据面**：`settings.json` 里以键存值，壳的设置页按 pluginId 分组渲染。
 * 插件占宿主的 `app.*` 键 = 顶掉宿主设置面（宿主那条键的生效值被插件的值串掉，而**两边都不报错**）；
 * 两个插件用同一个键 = 后注册者的值静默胜出（用户改一个设置，另一个插件的行为跟着变）。
 * 1.31 实测：官方 18 仓有 **19 个键**不带本仓归属（`explorer.confirmDelete` 之类，属主其实是别人的壳面）。
 *
 * ── 两条判据（与壳仓 `scripts/gen-host-reserved.mjs` 的账同源）──
 *   ① **宿主保留面**（🔴 红）：键落在账（包内 `schemas/host-reserved.json`）的 `configKeys` 里
 *      ⇒ 占用宿主设置面。**含退役键**——宿主不再写入的键也不腾位（老 `settings.json` 里可能仍有值，
 *      迁移代码还会读它）。判据出处 = 1.33 §11.1 裁决（丙）·（甲）。
 *   ② **本仓前缀**（🔴 红 · **1.49 收紧**）：**新键**第一段应是本仓 `pluginId`（`<pluginId>.<你的名字>`）。
 *      与命令 id 同形（`judgeCommandId` 的「只换第一段、词干零变化」）。
 *      ⚠️ 只对 **`declared` 面**判——`defaults` 面的键**天然是别人的键**（`configurationDefaults` 的语义
 *      就是"为已存在的键建议一个弱默认值"，要求它带本仓前缀等于取消这个能力）。运行时面同理不判键。
 *      🕐 **收紧史**：1.34 落地时按轴上排序纪律只判黄（判红会让插件仓 CI 在官方仓改名完成前处于红窗）；
 *      1.49 清账完成（官方 18 仓需改处 0）后兑现为红——照 00 档 §四「收紧为红放在 1.49」。
 *   ③ **宿主伪身份**（🔴 红）：源码里 `registerConfiguration("<字面量>", …)` / `registerConfigurationDefaults(...)`
 *      的第一个实参落在账的 `pseudoPluginIds`（app / appearance / update）⇒ 冒充宿主身份注册。
 *
 * ── 扫描面（三面）──
 *   · **声明面** `declared` = `plugin.json` 的 `contributes.configuration.properties` 的**键名**（权威面）；
 *   · **弱默认值面** `defaults` = `plugin.json` 的 `contributes.configurationDefaults` 的**键名**；
 *   · **运行时面** `runtime` = 源码里注册调用的**第一个实参**（身份字面量）。
 *     ⚠️ 实测宿主侧口径：插件**零使用**这两支 API（插件声明走 `plugin.json`）——本面是给"哪天真有人这么写"留的，
 *     面要量全但**今日恒为空**（空面不是判据失效，报告里能看出来）。
 *
 * ── 🔴 分工：本腿报红的那一条，运行时也报 ──
 * 判据① 在**运行时**（壳 `ConfigurationRegistry` 的保护区）同样生效——本腿是**提前在作者仓里**把同一件事报出来
 * （作者不必等装上壳才发现自己的键被拒）。判据② 运行时**不管**（存量键的旧名靠 `registerConfigMigration` 搬运，
 * 运行时拒前缀不合规的键会把存量插件当场弄坏）⇒ 判据② 只在这里判。
 * 🔴 **1.49 起判据② 同样是红**：清理已完成（官方 18 仓需改处 0），第三方新写的裸键＝跨插件撞名，
 * 是「本仓可答 ＋ 有真害」的真红（00 档 §10.3 宽容度模型：红灯两类之一）。
 *
 * 知情绕行 = 标准 disable 注释（`CHECK_IDS.configOwnership`）。⚠️ **fail-closed 不参与豁免**：
 * 拿不到 `pluginId` 说的不是「你的键怎么写」，而是「你的身份读不到」——那是工程根的问题。
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readPluginManifest } from "../../validate.js";
import { resolvePluginIdForCss, type PluginIdSource } from "./plugin-prefix.js";
import { HOST_RESERVED_FILE, loadHostReserved, type HostReservedNames } from "./command-ownership.js";
import {
  collectFiles,
  isTestOrMockRel,
  readSource,
  relPath,
  type CheckViolation,
} from "./scan.js";
import { buildDisableIndex, isDisabled, CHECK_IDS } from "./disable.js";

/** 判据命中的两种形态（与 `CommandIdCode` 同词表：红 = 占别人/宿主的面；黄 = 不带本仓归属） */
export type ConfigKeyCode = "host-reserved" | "no-plugin-prefix";

/** 扫描面：声明面 / 弱默认值面 / 运行时面（身份字面量） */
export type ConfigKeyFace = "declared" | "defaults" | "runtime";

/** 一处不合规站点（探针与腿共用同一份数据） */
export interface ConfigKeySite {
  face: ConfigKeyFace;
  /** 工程相对路径（正斜杠）；声明面 / 弱默认值面恒为 `plugin.json` */
  file: string;
  line: number;
  /** 配置键；`runtime` 面 = 注册调用的第一个实参（**身份字面量**，不是键） */
  key: string;
  code: ConfigKeyCode;
  /** 应改成什么：**只换第一段**（`<pluginId>.` ＋ 原键第一段之后的全部）——词干零变化 */
  suggested: string;
  /** code = host-reserved 时：撞上的那条宿主保留键 / 宿主伪身份 */
  reserved?: string;
}

export interface ConfigOwnershipReport {
  root: string;
  pluginId: string | null;
  pluginIdSource: PluginIdSource | null;
  pluginIdNote: string | null;
  /** fail-closed：非 null ⇒ 本腿报红（拿不到身份就无从判归属） */
  error: string | null;
  /** 🔴 必须改的（进腿报点）——1.49 收紧后 = 全部不合规站点 */
  red: ConfigKeySite[];
  /** 🟡 建议改的——🔴 **1.49 起恒空**（判据② 已升红，站点全进 `red`）；字段保留只为探针输出形状不塌 */
  yellow: ConfigKeySite[];
  /** 三面的**全部**名（合规 ＋ 不合规，按出现顺序去重）——探针的读数面（口径：名数，非站点数） */
  declaredKeys: string[];
  defaultsKeys: string[];
  runtimeIdentities: string[];
  /** 账的加载实况（账没读到 ⇒ 判据① 空转，报告里必须能看出来） */
  hostLedger: { file: string; found: boolean; configKeys: number; pseudoPluginIds: number };
  /** 腿报点 = fail-closed ＋ 全部红 */
  violations: CheckViolation[];
  /** 黄灯建议——🔴 **1.49 起恒空**（同上）；保留字段＝探针/渲染器的输出形状不变 */
  advisories: CheckViolation[];
}

/**
 * 一个配置键的裁决（纯函数——单测与探针共用，别在别处再写一份判据）。
 *
 * 🔴 建议名的形状 = **只替换第一段**（`app.theme` → `myplugin.theme`，词干零变化），与 `judgeCommandId` 同形。
 * ⚠️ `face` 在这里**真的参与判定**：`defaults` 面不判判据②（弱默认值的键天然是别人的键——见文件头）。
 */
export function judgeConfigKey(
  key: string,
  pluginId: string,
  reserved: HostReservedNames,
  face: ConfigKeyFace,
): { code: ConfigKeyCode; suggested: string; reserved?: string } | null {
  const dot = key.indexOf(".");
  const suggested = `${pluginId}.${dot > 0 ? key.slice(dot + 1) : key}`;
  // ① 宿主保留面（比**全等**——保留面是一张逐个列出的键名清单，不是前缀面）
  if (reserved.configKeys.includes(key)) return { code: "host-reserved", suggested, reserved: key };
  // ② 本仓前缀——只对声明面判（弱默认值面的键不是"插件新键"，运行时面压根不是键）
  if (face === "declared" && !key.startsWith(`${pluginId}.`)) return { code: "no-plugin-prefix", suggested };
  return null;
}

/**
 * 运行时面：注册调用**第一个实参**（身份字面量）的裁决（纯函数）。
 * 🔴 落在 `pseudoPluginIds` ⇒ 冒充宿主身份（红）：用 "app" 注册 ⇒ 壳的冲突检测永不响（因为宿主自己就是 "app"），
 *    且注销插件时会**摘掉宿主自己的条目**。改法 = 用自己的 pluginId（或干脆别在插件源码里调这两支 API）。
 */
export function judgeRegisterIdentity(
  id: string,
  pluginId: string,
  reserved: HostReservedNames,
): { code: ConfigKeyCode; suggested: string; reserved?: string } | null {
  if (reserved.pseudoPluginIds.includes(id)) return { code: "host-reserved", suggested: pluginId, reserved: id };
  if (id !== pluginId) return { code: "no-plugin-prefix", suggested: pluginId };
  return null;
}

/** 运行时面：`registerConfiguration("<字面量>", …)` ＋ `registerConfigurationDefaults("<字面量>", …)`
 *  （两支 API 的第一个实参都是身份；`(?:Defaults)?` 让一条正则覆盖两支——⛔ 别拆成两条） */
export const RE_REGISTER_CONFIGURATION = /registerConfiguration(?:Defaults)?\s*\(\s*["'`]([^"'`]+)["'`]/g;

/** 源码字面量扫描：`collect` 返回 id——行号按 1-based 计（与 `command-ownership.ts` 同实现，口径一致） */
function scanLiterals(
  src: string,
  re: RegExp,
  collect: (m: RegExpMatchArray) => string | null,
): { id: string; line: number }[] {
  const out: { id: string; line: number }[] = [];
  for (const m of src.matchAll(re)) {
    const id = collect(m);
    if (!id) continue;
    out.push({ id, line: src.slice(0, m.index ?? 0).split("\n").length });
  }
  return out;
}

/** 取 manifest 里某个键的行号（JSONC 原文里找 `"<key>":`；找不到 ⇒ 1，不许当成「不存在」） */
export function manifestKeyLine(raw: string, key: string): number {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = raw.match(new RegExp(`"${esc}"\\s*:`));
  if (!m || m.index === undefined) return 1;
  return raw.slice(0, m.index).split("\n").length;
}

/** `contributes.configuration` 允许对象或对象数组 ⇒ 统一摊平成 properties 记录（读不出 ⇒ null） */
function configPropertiesOf(node: unknown): Record<string, unknown> | null {
  const one = (v: unknown): Record<string, unknown> | null => {
    const props = (v as { properties?: unknown } | null)?.properties;
    return props && typeof props === "object" && !Array.isArray(props) ? (props as Record<string, unknown>) : null;
  };
  if (Array.isArray(node)) {
    const out: Record<string, unknown> = {};
    let any = false;
    for (const item of node) {
      const props = one(item);
      if (props) {
        Object.assign(out, props);
        any = true;
      }
    }
    return any ? out : null;
  }
  return one(node);
}

/**
 * 跑本仓配置键归属判据。返回结构化报告（探针用）＋ 腿报点（`lint.ts` 用）——**同一份实现**。
 */
export function runConfigOwnershipCheck(
  root: string,
  reserved: HostReservedNames = loadHostReserved(),
  reservedFile: string = HOST_RESERVED_FILE,
): ConfigOwnershipReport {
  const absRoot = resolve(root);
  const manifestPath = join(absRoot, "plugin.json");
  const resolution = resolvePluginIdForCss(absRoot);
  const violations: CheckViolation[] = [];
  const report: ConfigOwnershipReport = {
    root: absRoot,
    pluginId: resolution.pluginId,
    pluginIdSource: resolution.source,
    pluginIdNote: resolution.note,
    error: resolution.error,
    red: [],
    yellow: [],
    declaredKeys: [],
    defaultsKeys: [],
    runtimeIdentities: [],
    hostLedger: {
      file: reservedFile,
      found: existsSync(reservedFile),
      configKeys: reserved.configKeys.length,
      pseudoPluginIds: reserved.pseudoPluginIds.length,
    },
    violations,
    advisories: [],
  };

  // ── fail-closed（不可豁免：拿不到身份 = 判据①② 全部无从谈起）──
  if (resolution.error || !resolution.pluginId) {
    violations.push({
      file: "plugin.json",
      line: 1,
      message:
        `拿不到本仓 pluginId：${resolution.error}。归属判据以「本仓身份」为唯一前缀来源——读不到它就无从判` +
        `「这个键是不是你的」。在插件工程根修好 plugin.json（或显式声明 pluginId），` +
        `别用 disable 注释绕：这是身份问题，不受豁免注释管辖。`,
    });
    return report;
  }

  const pluginId = resolution.pluginId;
  const prefix = `${pluginId}.`;
  const manifestRaw = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : "";
  const manifestDisabled = buildDisableIndex(manifestRaw, [CHECK_IDS.configOwnership]);

  const push = (
    site: ConfigKeySite,
    message: string,
    disabled?: { idx: ReturnType<typeof buildDisableIndex>; line: number },
  ): void => {
    if (disabled && isDisabled(disabled.idx, disabled.line, CHECK_IDS.configOwnership)) return;
    /**
     * 🔴 **1.49 起两条判据都是红**（收紧前：`host-reserved` 红 ／ `no-plugin-prefix` 黄 ⇒ 进 `advisories`
     * 只打印不拦）。收紧后**全部进 `violations`** ⇒ 插件仓 CI（`ci-verify.mjs` 的严格腿）当场判红。
     * `yellow` / `advisories` 两个字段保留为**空容器**：探针与报告仍按原形状读数（面不塌），
     * 但不再有任何站点落进去——⛔ 别把它们删了（删了等于改探针的输出形状，与本格射程无关）。
     */
    report.red.push(site);
    violations.push({ file: site.file, line: site.line, message });
  };

  /** 判据①②合一的报点（声明面 / 弱默认值面） */
  const judgeAndPush = (face: "declared" | "defaults", key: string, line: number): void => {
    const verdict = judgeConfigKey(key, pluginId, reserved, face);
    if (!verdict) return;
    const where =
      face === "declared"
        ? "声明面（plugin.json contributes.configuration.properties）"
        : "弱默认值面（plugin.json contributes.configurationDefaults）";
    const message =
      verdict.code === "host-reserved"
        ? `${where}：配置键 "${key}" 属于**宿主的保留名字空间**（保留键清单见包内 schemas/host-reserved.json 的 configKeys）。` +
          `占用它 = 顶替宿主设置面——宿主那条键的生效值会被你的值串掉，**两边都不报错**（用户在设置页看到的值与宿主实际行为不一致）。` +
          `改法：改成 "${verdict.suggested}"（只换第一段、词干零变化）。`
        : `${where}：配置键 "${key}" 不带本仓归属（本插件 pluginId = "${pluginId}"，新键应以 "${prefix}" 开头）` +
          `——键是**用户数据面**：同名键被两个插件声明时只有一个能生效（壳 1.34 起"首撞保留"，后到者被拒），` +
          `改名后归属才唯一。改成 "${verdict.suggested}"（只换第一段、词干零变化）。`;
    push(
      { face, file: "plugin.json", line, key, code: verdict.code, suggested: verdict.suggested, ...(verdict.reserved !== undefined ? { reserved: verdict.reserved } : {}) },
      message,
      { idx: manifestDisabled, line },
    );
  };

  // ── ①② 声明面 ＋ 弱默认值面：plugin.json（读不出 ⇒ 两面跳过——plugin-prefix 腿已对同一件事 fail-closed 报红，不重复报）
  if (manifestRaw) {
    let manifest: unknown = null;
    try {
      manifest = readPluginManifest(manifestPath);
    } catch {
      manifest = null;
    }
    const contributes = (manifest as { contributes?: Record<string, unknown> } | null)?.contributes;
    const props = configPropertiesOf(contributes?.configuration);
    if (props) {
      for (const key of Object.keys(props)) {
        if (!report.declaredKeys.includes(key)) report.declaredKeys.push(key);
        judgeAndPush("declared", key, manifestKeyLine(manifestRaw, key));
      }
    }
    const defaults = contributes?.configurationDefaults;
    if (defaults && typeof defaults === "object" && !Array.isArray(defaults)) {
      for (const key of Object.keys(defaults as Record<string, unknown>)) {
        if (!report.defaultsKeys.includes(key)) report.defaultsKeys.push(key);
        judgeAndPush("defaults", key, manifestKeyLine(manifestRaw, key));
      }
    }
  }

  // ── ③ 运行时面：源码里注册调用的第一个实参（只扫真源码——测试/mock 跳过，与另几条腿同口径） ──
  for (const abs of collectFiles(absRoot, [".ts", ".tsx", ".js", ".jsx"])) {
    const rel = relPath(absRoot, abs);
    if (isTestOrMockRel(rel)) continue;
    const src = readSource(abs);
    const idx = buildDisableIndex(src, [CHECK_IDS.configOwnership]);
    for (const hit of scanLiterals(src, RE_REGISTER_CONFIGURATION, (m) => m[1])) {
      if (!report.runtimeIdentities.includes(hit.id)) report.runtimeIdentities.push(hit.id);
      const verdict = judgeRegisterIdentity(hit.id, pluginId, reserved);
      if (!verdict) continue;
      const message =
        verdict.code === "host-reserved"
          ? `运行时面（源码里 registerConfiguration* 的第一个实参）：身份 "${hit.id}" 是**宿主自己的身份**` +
            `（app / appearance / update 由宿主用来注册配置/外观/更新）——插件用它注册 ⇒ 壳的冲突检测永不响` +
            `（因为宿主自己就是这个身份），且**注销插件时会摘掉宿主自己的条目**。改用本仓 pluginId "${pluginId}"。` +
            `⚠️ 插件声明配置的正常路径是 plugin.json 的 contributes.configuration——别在自己的源码里调壳的注册 API。`
          : `运行时面（源码里 registerConfiguration* 的第一个实参）：身份 "${hit.id}" 与本仓 pluginId "${pluginId}" 不同` +
            `——身份是归属的唯一来源，用别人的 id 注册会让这些键挂到别人名下（注销时按身份摘条目，摘错人）。` +
            `改用 "${pluginId}"（若这是给别人的键建议弱默认值，键名照旧、身份仍须是你自己）。`;
      push(
        { face: "runtime", file: rel, line: hit.line, key: hit.id, code: verdict.code, suggested: verdict.suggested, ...(verdict.reserved !== undefined ? { reserved: verdict.reserved } : {}) },
        message,
        { idx, line: hit.line },
      );
    }
  }

  return report;
}
