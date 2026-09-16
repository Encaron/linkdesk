/**
 * check-css-namespace 腿·**本仓前缀判据**（E6#109h-b①）——插件 CSS 里**给自有元素起的类名、以及
 * 自己的 `@keyframes` 名，必须以本仓 `pluginId` 加一个连字符开头**。
 *
 * ── 为什么（本系列立项的那条轴）──
 * 插件视图的一张样式表里同时装着宿主 CSS + 共享组件 CSS + **所有已加载插件的 CSS**（实机读数：池文档
 * 8 张样式表）⇒ 裸类名是**全局标识符**。件 1/件 4 把宿主与共享组件侧清成了 `ldk-`，剩下的
 * **插件 ↔ 插件轴今天完全没有保护**——而且不是理论风险：`file-tree/SearchView.css:24` 与
 * `serial-monitor/SerialMonitorView.css:147` **裸定义了同一个 `.search-input`**（两份规则体不同 ⇒
 * 级联合并、视觉走形），这正是 `.badge` 案的同一形态（**不报错、只是长得不对**）。
 * 升级后的规则**不需要任何清单**：唯一性由 `pluginId` 免费提供（硬约束 11：发布后不可变）。
 *
 * ── 四条判据（详案 15 §一；全部可机械校验）──
 *   ① 裸定义类名必须以 `<pluginId>-` 开头
 *   ② `@keyframes` 名必须以 `<pluginId>-` 开头（拍板 Q3=(A)：关键帧名同样是全局的）
 *   ③ `pluginId` 自身不得以 `ldk-` 开头（拍板 Q4=(A)：`ldk-` 是宿主命名空间——作者面 §12
 *      「凡 `ldk-` 开头都是宿主/共享组件的」，一个 `pluginId: "ldk-tools"` 的插件用自己的
 *      `<pluginId>-*` 前缀就会**由构造落进宿主空间**，且让 ①② 全部失效）
 *   ④ **fail-closed**：`plugin.json` 不存在 / 解析失败 / 拿不到合法的 `pluginId`（含目录名兜底也不行）
 *      ⇒ 红。**拿不到前缀就无法校验——静默放过 = 门禁变瞎子**。
 *
 * ── 口径与豁免 ──
 *   · 「裸定义」的遍历与宿主保留名判据**共用同一份实现**（`css-selectors.ts` 的
 *     `bareClassDefinitions`；巡检单元也共用 `scan.ts` 的 `collectCssUnits`）——两条腿看到的是
 *     **同一批站点**，只是裁决不同。
 *   · 保留名清单不删：命中的名字**同时**是宿主保留名时，报点里补一句措辞（详案 15 §二）。
 *   · 知情绕行 = 标准 disable 注释（`CHECK_IDS.cssNamespace`，与保留名判据**同一个 id**）。
 *     ⚠️ **③/④ 不参与豁免**：它们说的不是「你的 CSS 怎么写」，而是「你的身份/清单拿不拿得到」——
 *        那是工程根的问题，不该被样式表里的一行注释绕过去。
 *   · 前缀形状 = **叠加**（`ms-item` → `marketplace-ms-item`）：只插入不改词干，是唯一能用
 *     「逐字节只插入前缀」机械证明零视觉变化的形状（详案 10 §二）。故 `suggested` 一律是
 *     `<pluginId>-` + 原名。
 */
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { derivePluginId, readPluginManifest } from "../../validate.js";
import { collectCssUnits, type CheckViolation } from "./scan.js";
import { bareClassDefinitions, keyframeDefinitions } from "./css-selectors.js";
import { isDisabled, CHECK_IDS, type DisableIndex } from "./disable.js";
import { loadReservedNames, type ReservedNames } from "./reserved-classes.js";

/** `pluginId` 从哪来（判据④要求把「用了目录名兜底」这件事响亮打印出来） */
export type PluginIdSource = "plugin.json" | "dir-name";

export interface PluginIdResolution {
  pluginId: string | null;
  source: PluginIdSource | null;
  /** 非 null = **拿不到前缀**（判据④ fail-closed 的原因原文）；此时 pluginId/source 均为 null */
  error: string | null;
  /** 目录名兜底时的提示行（不为 null ⇒ 报告里必须打印，不许静默） */
  note: string | null;
}

/**
 * 取本仓 `pluginId`——**复用 loader 自己的裁决函数**（`derivePluginId` + `readPluginManifest`，
 * 硬约束 11 的同一份契约），不另写一套 id 规则（否则门禁认可的 id 与运行时安装的 id 会漂移）。
 *
 * `plugin.json` 是 **JSONC**（可注释/尾逗号，作者面允许）⇒ 走 `readPluginManifest`（jsonc-parser）。
 */
export function resolvePluginIdForCss(root: string): PluginIdResolution {
  const absRoot = resolve(root);
  const dirName = basename(absRoot);
  const manifestPath = join(absRoot, "plugin.json");

  if (!existsSync(manifestPath)) {
    return {
      pluginId: null,
      source: null,
      error: `plugin.json 不在工程根（${manifestPath}）——本判据以「本仓 pluginId」为唯一前缀来源，读不到它就无从校验`,
      note: null,
    };
  }

  let manifest: unknown;
  try {
    manifest = readPluginManifest(manifestPath);
  } catch (e) {
    return {
      pluginId: null,
      source: null,
      error: `plugin.json 读不出（${e instanceof Error ? e.message : String(e)}）`,
      note: null,
    };
  }

  const declared = (manifest as Record<string, unknown> | null | undefined)?.pluginId;
  try {
    const pluginId = derivePluginId(manifest, dirName);
    if (declared === undefined || declared === null) {
      return {
        pluginId,
        source: "dir-name",
        error: null,
        note:
          `plugin.json 未显式声明 pluginId——本判据按工程目录名 "${pluginId}" 兜底` +
          `（发布后身份不可变，建议显式声明以防目录改名 = 身份漂移）`,
      };
    }
    return { pluginId, source: "plugin.json", error: null, note: null };
  } catch (e) {
    return {
      pluginId: null,
      source: null,
      error:
        `${e instanceof Error ? e.message : String(e)}——且工程目录名 "${dirName}" 也不能兜底` +
        `（目录名同样不合法）`,
      note: null,
    };
  }
}

/** 一处不合规站点（审计工具与报点共用同一份数据——③–⑦ 的改名映射表由它生成） */
export interface PrefixSite {
  /** 工程相对路径（正斜杠） */
  file: string;
  /** 1-based；类名站点 = 规则块选择器首行，关键帧站点 = `@keyframes` 所在行 */
  line: number;
  /** 现名（不含前导点） */
  name: string;
  /** 应改成的名字（叠加形状：`<pluginId>-` + 现名） */
  suggested: string;
  /** 类名站点独有：逗号切开后的那一份选择器文本 */
  selector?: string;
  /** 该名字**同时**是宿主保留名（清单 `reserved-class-names.json`）——只影响措辞，不影响是否报 */
  reserved: boolean;
  reservedWhy?: string;
}

export interface PluginPrefixReport {
  root: string;
  pluginId: string | null;
  pluginIdSource: PluginIdSource | null;
  /** 目录名兜底的提示（必须打印） */
  pluginIdNote: string | null;
  /** 判据④：非 null ⇒ fail-closed 红 */
  error: string | null;
  /** 判据③：`pluginId` 以 `ldk-` 开头时 = 那个 pluginId，否则 null */
  boundary: string | null;
  /** 判据① 的站点（已过豁免） */
  classes: PrefixSite[];
  /** 判据② 的站点（已过豁免） */
  keyframes: PrefixSite[];
  /** 腿的报点 = ③④（先行、不可豁免）+ ①②（过豁免）；顺序即打印顺序 */
  violations: CheckViolation[];
}

/**
 * 跑本仓前缀判据。返回结构化报告（审计工具用）+ 腿报点（`lint.ts` 用）——**同一份实现**，
 * 没有第二条判据路径。
 */
export function runPluginPrefixCheck(root: string, reserved: ReservedNames = loadReservedNames()): PluginPrefixReport {
  const absRoot = resolve(root);
  const resolution = resolvePluginIdForCss(absRoot);
  const violations: CheckViolation[] = [];
  const report: PluginPrefixReport = {
    root: absRoot,
    pluginId: resolution.pluginId,
    pluginIdSource: resolution.source,
    pluginIdNote: resolution.note,
    error: resolution.error,
    boundary: null,
    classes: [],
    keyframes: [],
    violations,
  };

  // ── ④ fail-closed（不可豁免：拿不到前缀 = 这条腿瞎了）──
  if (resolution.error || !resolution.pluginId) {
    violations.push({
      file: "plugin.json",
      line: 1,
      message:
        `拿不到本仓前缀：${resolution.error}。**判据不许静默放过**——无法校验「裸定义/关键帧是否带本仓` +
        `前缀」时本腿一律报红（静默放过 = 门禁变瞎子）。在插件工程根修好 plugin.json（或在 plugin.json ` +
        `显式声明 pluginId），不要用 disable 注释绕：③/④ 这类身份问题不受豁免注释管辖。`,
    });
    return report;
  }

  const pluginId = resolution.pluginId;
  const prefix = `${pluginId}-`;

  // ── ③ `ldk-` 边界（不可豁免：借的是宿主命名空间，且会让 ①② 全部失效）──
  if (pluginId.startsWith("ldk-")) {
    report.boundary = pluginId;
    violations.push({
      file: "plugin.json",
      line: 1,
      message:
        `pluginId "${pluginId}" 以 "ldk-" 开头——\`ldk-\` 是**宿主/共享组件命名空间**（作者面 §12：` +
        `凡 ldk- 开头都是宿主的）。用它派生的 <pluginId>-* 前缀会**由构造落进宿主空间**，` +
        `与本判据 ①② 自相矛盾（两条都失效）。请改 pluginId（硬约束 11：发布后身份不可变，现在改最便宜）；` +
        `schema 侧同一句约束由 1.14⑧ 收进 pattern。`,
    });
  }

  // ── ①② 裸定义类名 / `@keyframes` 名必须以 `<pluginId>-` 开头 ──
  //    ⚠️ 类名侧的「宿主保留名」补充措辞已随**判据① 退役**（E6#109p-b · 1.28，见 reserved-classes.ts 文件头）：
  //       清单的 `classes` 段已随 1.21b 删除 ⇒ 类名侧的保留名查表**恒空** ⇒ 那句补充永不触发，已删。
  //       `PrefixSite.reserved` 对类名**恒 false**（字段保留 = 报点结构与只读审计工具的形状不变）；
  //       关键帧侧仍用 `kfReserved` 补「与宿主关键帧同名」（那条**真有输入**：清单有 8 条关键帧）。
  const kfReserved = new Map(reserved.keyframes.map((k) => [k.name, k]));
  const pushSite = (file: string, line: number, message: string, unitDisabled: DisableIndex): boolean => {
    if (isDisabled(unitDisabled, line, CHECK_IDS.cssNamespace)) return false;
    violations.push({ file, line, message });
    return true;
  };

  for (const unit of collectCssUnits(absRoot, [CHECK_IDS.cssNamespace])) {
    for (const def of bareClassDefinitions(unit.cleaned)) {
      if (def.name.startsWith(prefix)) continue; // 合规：本仓前缀
      const site: PrefixSite = {
        file: unit.rel,
        line: def.line,
        name: def.name,
        suggested: prefix + def.name,
        selector: def.selector,
        // 类名侧恒 false：保留名查表已随判据① 退役（`classes` 段已删 ⇒ 恒空）——见本段上方说明
        reserved: false,
      };
      const kept = pushSite(
        unit.rel,
        def.line,
        `${def.selector}  ← 裸定义类名不带本仓前缀（本插件 pluginId = "${pluginId}"，应以 "${prefix}" 开头）` +
          `——插件视图里宿主、共享组件与**所有已加载插件**同表，裸类名是全局标识符（「.badge」案同形：` +
          `不报错、只是长得不对）。改成 .${site.suggested}（前缀只插入、不改词干 ⇒ 零视觉变化）；` +
          `要那个样子就直接用对应组件（@linkdesk/ui）`,
        unit.disabled,
      );
      if (kept) report.classes.push(site);
    }

    for (const kf of keyframeDefinitions(unit.cleaned)) {
      if (kf.name.startsWith(prefix)) continue;
      const reservedEntry = kfReserved.get(kf.name);
      const site: PrefixSite = {
        file: unit.rel,
        line: kf.line,
        name: kf.name,
        suggested: prefix + kf.name,
        reserved: reservedEntry !== undefined,
        ...(reservedEntry ? { reservedWhy: reservedEntry.why } : {}),
      };
      const kept = pushSite(
        unit.rel,
        kf.line,
        `@keyframes ${kf.name}  ← 关键帧名不带本仓前缀（pluginId = "${pluginId}"，应以 "${prefix}" 开头）` +
          `——关键帧名同样是全局的，先加载者/后定义者互相覆盖。改成 @keyframes ${site.suggested}，` +
          `**并同笔改 animation: 引用处**（漏改引用 = 动画静默消失，同形风险）` +
          (reservedEntry ? `。⚠ 且与**宿主关键帧**同名（${reservedEntry.why}）` : ""),
        unit.disabled,
      );
      if (kept) report.keyframes.push(site);
    }
  }

  return report;
}
