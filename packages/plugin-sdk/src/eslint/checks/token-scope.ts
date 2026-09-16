/**
 * check-css-namespace 腿·**自定义属性（token）作用域判据**（E6#109n-b · 轮次 1.24）。
 *
 * ── 规则一句话 ──
 * **作用域才是命名空间。** 自定义属性名不需要前缀 —— 它**住在哪棵子树里**才是它属于谁：
 *   (a) **文档级**（`:root` / `html` / `body` / `[data-theme=…]` / 通配 `*`）只有**宿主契约块**能写；
 *   (b) 其余定义必须挂在**自有命名空间**的子树下（插件 = `.<pluginId>-*`）；
 *   (c) 浮层宿主根 `#ld-float-layer` 一族 = portal 面例外（放宽「元素归谁」，不放宽「名字归谁」）；
 *   (d) 名字层只有一句：**任何一方不得定义 `ldk-` 开头的自定义属性**。
 * 规则正文：31-任务-token轴门禁与清账.md §一（`docs/02-Electron架构/E6_插件生态与发布/01-插件独立构建/样式命名空间归一化/`）。
 *
 * ── 为什么插件侧必须有这条腿（不是理论风险）──
 * 1.23 实测（真跑的池文档）：宿主 94 个契约名里 **83 个只有样式表提供、引擎不写 inline**
 * ——默认主题是壳的**空兜底配方**（`colors: {}`）⇒ `commitTokens({})` 的差集清理把主题键全清掉、
 * 值回落 `src/index.css` 的硬兜底（那是设计）。**后果**：插件在 `:root` 写一个宿主契约名就能
 * **全局改写宿主的颜色 / 圆角 / z-index**（级联实验实证：`--success` / `--error` / `--z-dropdown` /
 * `--badge-text` / `--bg-window` / `--radius-md` 全被改写），而且这个「屏蔽」随主题变化
 * ⇒ **看着时好时坏**——最坏的一类 bug。这正是 `marketplace` 那次 `--status-connected` 覆写事故的形态。
 *
 * ── 四条判据（分级依据 = 22 号档 §10.3「判红只给 ① 本仓可答 ② 有真害」）──
 *   V2 🔴 定义了 `ldk-*` 自定义属性（**任何作用域**）——`ldk-` 整个命名空间属宿主，
 *      与类名 / 关键帧**同一句**（CLAUDE.md 硬约束 23 ②）。
 *   V1 🔴 文档级 ＋ 名字**不带本仓前缀** ⇒ 全局改写宿主 / 他方（真害已实测，见上）。
 *   V5 🔴 类限定 ＋ 该 compound 里**没有**任何 `.<pluginId>-*` 类 ⇒ 定义落到了宿主 / 他方元素上
 *      （与件 7 的 R3「跨方命中必须有自有根类作祖先」同形）。
 *   V6 🟡 文档级 ＋ 名字**自带本仓前缀** ⇒ 无人同吃、近乎无害 ⇒ **只报不拦**
 *      （判红只给「有真害」——升格成红 = 假红，而假红会让真红失效）。
 *
 * ── 级别与豁免 ──
 *   · 🔴 红进腿报点（`violations`）⇒ 插件仓 CI 的**严格腿**判红（`ci-verify.mjs` 的 strictLegs
 *     是 fail-closed 的：SDK 新增一条腿自动进严格档）。
 *   · 🟡 黄进 `advisories`：**打印但不进腿报点** ⇒ 不拦 CI（这正是「只报不拦」的结构实现）。
 *   · 知情绕行 = 标准 disable 注释（`CHECK_IDS.cssNamespace`，与类名 / 关键帧判据**同一个 id**）。
 *     ⚠️ **身份层不可豁免**：拿不到 `pluginId` ⇒ fail-closed 红（没有前缀就无从判「有主 / 无主」）。
 *   · 口径与壳仓同源：定义点、作用域形态、多选择器规则的切分**都调 `css-selectors.ts` 的同一份实现**
 *     （`tokenDefinitions()` / `hasOwnClass()`）——不许各写一份近似版（22 号档 §一 层 3：尺子不止一把
 *     就是本系列的病根）。
 */
import { resolve } from "node:path";
import { collectCssUnits, type CheckViolation } from "./scan.js";
import { tokenDefinitions, hasOwnClass, type TokenScope } from "./css-selectors.js";
import { isDisabled, CHECK_IDS } from "./disable.js";
import { resolvePluginIdForCss, type PluginIdResolution } from "./plugin-prefix.js";

/** 判级文案——**与壳仓 `scripts/lib/css-selectors.mjs` 的 `TOKEN_WHY` 逐字一致**
 *  （跨包不能 import ⇒ 只能钉文案：壳门禁 `--self-test` 的 `锚⑦` 用锚词把两份钉在一起）。 */
export const TOKEN_WHY = {
  V2:
    "自定义属性名以 `ldk-` 开头——`ldk-` **整个命名空间属宿主**（与类名 / 关键帧同一句，CLAUDE.md 硬约束 23 ②），" +
    "任何一方都不得定义（占名即「宿主契约名被他人改写」的入口）。",
  V1:
    "非宿主方在**文档级**（`:root` / `html` / `body` / `[data-theme=…]` / `*`）定义了**不带自有前缀**的自定义属性" +
    "——1.23 实测：宿主 94 个契约名里 **83 个只有样式表提供、引擎不写 inline**（默认主题是空兜底配方 ⇒ " +
    "差集清理把主题键全清掉）⇒ **一条 `:root` 就能全局改写宿主的颜色 / 圆角 / z-index**，" +
    "而且这个「屏蔽」随主题变化＝时好时坏（`marketplace` 那次 `--status-connected` 覆写事故正是此形态）。",
  V5:
    "插件的**类限定**自定义属性定义**不含本仓 `pluginId` 前缀的类**（`.<pluginId>-*`）" +
    "——定义落到了宿主 / 他方元素上（与件 7 的 R3「跨方命中必须有自有根类作祖先」同形）。",
  V6:
    "插件的**文档级**定义、但名字自带本仓前缀（`<pluginId>-`）——无人同吃、**近乎无害**（🟡 只报不拦，" +
    "22 号档 §10.3：判红只给「本仓可答 ＋ 有真害」），建议改挂自有根类。",
} as const;

export type TokenScopeCode = "V1" | "V2" | "V5" | "V6";

/** 一处 token 定义点的判级结果 */
export interface TokenScopeSite {
  /** 工程相对路径（正斜杠） */
  file: string;
  /** 1-based（规则块选择器首行） */
  line: number;
  /** 名字（不含前导 `--`） */
  name: string;
  /** compound 原文（供报点回显；V5 用它判「有没有自有类」） */
  selector: string;
  scope: TokenScope;
  level: "red" | "yellow";
  code: TokenScopeCode;
  why: string;
}

export interface TokenScopeReport {
  root: string;
  pluginId: string | null;
  /** 非 null ⇒ fail-closed（拿不到前缀 ⇒ 本腿判不了「有主 / 无主」，一律红） */
  error: string | null;
  /** 🔴 必须改的（进腿报点 ⇒ CI 严格腿判红） */
  red: TokenScopeSite[];
  /** 🟡 建议改的（只打印，不拦） */
  yellow: TokenScopeSite[];
  /** 腿报点 = fail-closed ＋ 全部红 */
  violations: CheckViolation[];
  /** 黄灯建议（`lint.ts` 打印用；**不进** `LintLeg.violations` ⇒ 不拦 CI） */
  advisories: CheckViolation[];
}

/**
 * 判一个定义点的级别。**判定式只此一处**（壳仓 `scripts/lib/css-selectors.mjs` 的
 * `judgeTokenScope()` 是同一套判定式的镜像——壳门禁与运行时探针共用那一份）。
 * 顺序 = **先出最具体的那条**：同一站点可能同时命中 V2 与 V1（`:root { --ldk-x: … }`）——不重复报，
 * 报对该方最可操作的那一条（名字层比作用域层更根本）。
 */
export function judgePluginTokenScope(site: {
  name: string;
  scope: TokenScope;
  selector: string;
  pluginId: string;
}): { level: "red" | "yellow"; code: TokenScopeCode; why: string } | null {
  const prefix = `${site.pluginId}-`;
  if (site.name.startsWith("ldk-")) return { level: "red", code: "V2", why: TOKEN_WHY.V2 };
  if (site.scope === "doc") {
    return site.name.startsWith(prefix)
      ? { level: "yellow", code: "V6", why: TOKEN_WHY.V6 }
      : { level: "red", code: "V1", why: TOKEN_WHY.V1 };
  }
  if (site.scope === "class") {
    if (hasOwnClass(site.selector, prefix)) return null; // 自有类之下 ⇒ 合规（那里的名字随你）
    return { level: "red", code: "V5", why: TOKEN_WHY.V5 };
  }
  // id（(c) portal 面）/ other（元素·通配·属性形态，归件 7 的选择器形态轴）⇒ 本轴不判
  return null;
}

/** 一处站点的报点文案（红 / 黄共用；`level` 决定抬头与措辞） */
function messageOf(site: TokenScopeSite, pluginId: string): string {
  const head =
    site.level === "red"
      ? `[${site.code}] ${site.selector} { --${site.name}: … }  ← 本仓 pluginId = "${pluginId}"`
      : `[${site.code}] ${site.selector} { --${site.name}: … }  ← 🟡 建议（不拦 build）`;
  const fix =
    site.code === "V1"
      ? `改成挂在自有根类之下（如 \`.${pluginId}-root { --${site.name}: … }\`）——**那里的名字不需要前缀**；` +
        `要改宿主契约的样子请走主题（主题的配方键），不要在 CSS 里覆写宿主契约名。`
      : site.code === "V2"
        ? `换成自有语义名（\`ldk-\` 名字空间归宿主）。`
        : site.code === "V5"
          ? `把定义搬到自有根类之下（\`.<pluginId>-*\`）——顶层 \`.ldk-*\` 是宿主 / 共享组件的地盘，` +
            `跨方命中必须有自己的根类作祖先。注意 \`.${pluginId}-root .ldk-x { … }\` 这类 **scoped 调优是合规的**` +
            `（compound 里有自有类），本判据只拦「一个自有类都没有」的形态。`
          : `把它搬进本插件的根类之下（形如 \`.${pluginId}-root { --${site.name}: … }\`）——` +
            `同文档同 bundle 时视觉完全一样，但作用域从「整个文档」缩回「我自己的子树」。`;
  return `${head}——${site.why} 改法：${fix}`;
}

/**
 * 跑本仓 token 作用域判据。返回结构化报告（审计工具 / lint 打印用）——**同一份实现，没有第二条判据路径**。
 * ⚠️ `resolution` 可复用调用方已经取过的 `pluginId`（`lint.ts` 与前缀腿共用一次解析）。
 */
export function runTokenScopeCheck(
  root: string,
  resolution: PluginIdResolution = resolvePluginIdForCss(root),
): TokenScopeReport {
  const absRoot = resolve(root);
  const report: TokenScopeReport = {
    root: absRoot,
    pluginId: resolution.pluginId,
    error: resolution.error,
    red: [],
    yellow: [],
    violations: [],
    advisories: [],
  };

  // ── fail-closed（不可豁免）：拿不到前缀 ⇒ 判不了「有主 / 无主」 ──
  if (resolution.error || !resolution.pluginId) {
    report.violations.push({
      file: "plugin.json",
      line: 1,
      message:
        `拿不到本仓前缀：${resolution.error}。**token 作用域判据不许静默放过**——它要判的正是「名字是不是你自己的」，` +
        `拿不到 \`pluginId\` 就判不了（fail-closed）。在插件工程根修好 plugin.json（或显式声明 pluginId）；` +
        `身份问题不受 disable 注释管辖。`,
    });
    return report;
  }

  const pluginId = resolution.pluginId;
  for (const unit of collectCssUnits(absRoot, [CHECK_IDS.cssNamespace])) {
    for (const def of tokenDefinitions(unit.cleaned)) {
      const verdict = judgePluginTokenScope({ name: def.name, scope: def.scope, selector: def.selector, pluginId });
      if (!verdict) continue;
      // 知情绕行：同一个 check id（与类名 / 关键帧判据同一套 disable 机制）——红黄同样静默
      if (isDisabled(unit.disabled, def.line, CHECK_IDS.cssNamespace)) continue;
      const site: TokenScopeSite = {
        file: unit.rel,
        line: def.line,
        name: def.name,
        selector: def.selector,
        scope: def.scope,
        level: verdict.level,
        code: verdict.code,
        why: verdict.why,
      };
      const message = messageOf(site, pluginId);
      if (verdict.level === "red") {
        report.red.push(site);
        report.violations.push({ file: unit.rel, line: def.line, message });
      } else {
        report.yellow.push(site);
        report.advisories.push({ file: unit.rel, line: def.line, message });
      }
    }
  }
  return report;
}
