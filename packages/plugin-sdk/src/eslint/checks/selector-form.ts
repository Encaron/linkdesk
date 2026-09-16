/**
 * check-css-namespace 腿·**选择器形态判据**（E6#109o-b · 轮次 1.26）。
 *
 * ── 规则一句话 ──
 * **类名与 id 是「名字锚」；元素 / 通配 / 属性 / 伪类 / 伪元素不是** —— 后者
 * **不需要与任何人同名**就能命中别人的元素：一条 `button { border: none }` 静默改掉宿主与其他
 * 插件的所有按钮，而且**不报错、只是长得不对**（与 `.badge` 案同一形态，只是少了「同名」这个前提）。
 * 规则正文 = 32-任务-选择器形态轴门禁与落地.md §一（R0–R3）/§三.2。
 *
 * ── 两条判据 ──
 *   S2 🔴 **禁无锚选择器**（含 **id**，一视同仁）：`formOf()` 判 `anchorless`（顶层**或**限定一律禁）
 *      ⇒ 红。**id 与元素同罪**：id 是全局的、可猜的，优先级还高于类（32 号档 §四 裁决 (b)）。
 *      正确解法只有一条：**挂在自己的根类之下**（`.serial-monitor-root input { … }`）。
 *   S3 🔴 **跨方命中必须自带自有命名空间**：选择器里**出现任何 `ldk-*` 类**（**含 `:has(…)` 内的提及**）
 *      ⇒ 该选择器**必须同时含至少一个 `.<pluginId>-*` 类**；否则红。
 *      ⚠️ **管形态、不管意图**：**不禁止**插件改共享组件外观（那是**合法特性**，文档口径的
 *      scoped 调优）——它只要求「带着自家前缀作锚」，即「调优必须在地盘里发生」。
 *
 * ── 为什么这两条值得一条腿（不是理论风险）──
 *   插件视图的一张样式表里同时装着宿主 ＋ 共享组件 ＋ **所有已加载插件**的 CSS（实机读数：池文档
 *   27 张表 / 4,280 条规则）⇒ 无锚选择器命中「该文档里**所有那一类元素**」，与谁渲染无关。
 *   1.25 实测：**插件侧存量 0**（官方 18 仓 ＋ 壳内夹具）⇒ 这两条是**纯预防性、零重发成本**——
 *   但宿主侧那 17 处基线（`*` reset / `html`·`body` / `[data-theme]` / `*:focus-visible` /
 *   `::-webkit-scrollbar` 一族 / `input[type=number]`·`select`）正是「无锚选择器能改所有人」的活证明：
 *   它们**有意**共享（插件依赖它们），所以宿主侧走「文件级登记 ＋ 条数守卫」（判据⑩），
 *   插件侧则**一条都不许**——插件没有「我改的是大家的按钮、这是有意的」这种正当性。
 *
 * ── 口径与豁免 ──
 *   · 形态一律用 `css-selectors.ts` 的 `formOf()`——**不许**用 `hasAncestor()`/`subjectOf()`
 *     （F3：它们把 `.x :pseudo` 误判成 `.x` 的一次顶层定义 ⇒ 假红；那条偏差属轴 ①、已冻结）。
 *   · 知情绕行 = 标准 disable 注释（`CHECK_IDS.cssNamespace`，与类名 / 关键帧 / token 判据**同一个 id**）。
 *   · **fail-closed**：拿不到 `pluginId` ⇒ 红（S3 判不了「自有命名空间」是哪一族；照 `plugin-prefix.ts`
 *     既有纪律——**静默放过 = 门禁变瞎子**）。
 */
import { resolve } from "node:path";
import { collectCssUnits, type CheckViolation } from "./scan.js";
import { selectorFormSites, formOf, hasIdSelector, mentionsLdkClass, hasOwnPrefixedClass, type SelectorForm } from "./css-selectors.js";
import { isDisabled, CHECK_IDS } from "./disable.js";
import { resolvePluginIdForCss, type PluginIdResolution } from "./plugin-prefix.js";

/** 判级文案——**与壳仓 `scripts/lib/css-selectors.mjs` 同源口径**（跨包不能 import ⇒ 只能钉文本：
 *  壳门禁 `--self-test` 的 `锚⑧` 用锚词把两份的形态口径钉在一起）。 */
export const SELECTOR_FORM_WHY = {
  S2:
    "插件 CSS 里的**无锚选择器**（元素 / 通配 / 属性 / 伪类 / 伪元素 / **id** 一视同仁；顶层或限定一律禁）" +
    "——插件视图的一张样式表里同时装着宿主 ＋ 共享组件 ＋ **所有已加载插件**的 CSS，" +
    "**这类选择器不需要与任何人同名**就能命中「该文档里所有那一类元素」：一条 `button { }` 改掉所有人的按钮，" +
    "而且**不报错、只是长得不对**。（id 与元素同罪：id 是全局的、可猜的，优先级还高于类。）",
  S3:
    "选择器里出现 `ldk-*` 类（**含 `:has(…)` 内的提及**），却**没有自带一个 `.<pluginId>-*` 类**" +
    "——`ldk-` 整个命名空间属宿主（类名 / 关键帧 / token 同一句，硬约束 23 ②）；**跨方命中必须带着自家" +
    "前缀作锚**：调优要在地盘里发生。⚠️ 本条**管形态、不管意图**——改共享组件外观本身是**合法特性**" +
    "（scoped 调优），只要写在自己的根类之下就合规。",
} as const;

export type SelectorFormCode = "S2" | "S3";

/** 一处不合规站点 */
export interface SelectorFormSite {
  /** 工程相对路径（正斜杠） */
  file: string;
  /** 1-based（规则块选择器首行） */
  line: number;
  /** compound 原文（供报点回显） */
  selector: string;
  form: SelectorForm;
  code: SelectorFormCode;
  why: string;
}

export interface SelectorFormReport {
  root: string;
  pluginId: string | null;
  /** 非 null ⇒ fail-closed（拿不到前缀 ⇒ S3 判不了「自有命名空间」是哪一族） */
  error: string | null;
  /** S2 的站点（禁无锚） */
  anchorless: SelectorFormSite[];
  /** S3 的站点（跨方命中不带自有锚） */
  crossParty: SelectorFormSite[];
  /** 腿报点 = fail-closed ＋ S2 ＋ S3 */
  violations: CheckViolation[];
}

/**
 * 判一处选择器站点的级别。**判定式只此一处**（壳仓 `scripts/lib/css-selectors.mjs` 的
 * `formOf()` 是同一套形态口径的镜像——壳门禁判据⑩⑪ 与运行时探针共用那一份）。
 * 顺序：先 S2（更根本——它说的是「这个选择器根本没有落点」），再 S3。
 */
export function judgeSelectorForm(site: {
  selector: string;
  pluginId: string;
}): { code: SelectorFormCode; why: string } | null {
  const form = formOf(site.selector);
  // S2：无锚（顶层或限定）**或**含 id ⇒ 红
  if (form.kind === "anchorless" || hasIdSelector(site.selector)) {
    return { code: "S2", why: SELECTOR_FORM_WHY.S2 };
  }
  // S3：出现 `ldk-*` 提及（含 `:has(…)` 内）⇒ 必须同时含本仓前缀类
  if (mentionsLdkClass(site.selector) && !hasOwnPrefixedClass(site.selector, `${site.pluginId}-`)) {
    return { code: "S3", why: SELECTOR_FORM_WHY.S3 };
  }
  return null;
}

/** 一处站点的报点文案 */
function messageOf(site: SelectorFormSite, pluginId: string): string {
  const head = `[${site.code}] \`${site.selector}\`  ← 本仓 pluginId = "${pluginId}"`;
  const fix =
    site.code === "S2"
      ? `改法：挂在自己插件的根类之下——\`.${pluginId}-root input { … }\`、\`.${pluginId}-root div { … }\`；` +
        `id 选择器同理（要选中自己的元素就用类）。`
      : `改法：把自有根类加进这条选择器——\`.${pluginId}-root .ldk-badge { … }\`（**这就是 scoped 调优的` +
        `正确形态**：想改共享组件的样子完全可以，只要写在自己的地盘里）。`;
  return `${head}——${site.why} ${fix}`;
}

/**
 * 跑本仓选择器形态判据。返回结构化报告（审计工具 / lint 打印用）——**同一份实现，没有第二条判据路径**。
 * ⚠️ `resolution` 可复用调用方已经取过的 `pluginId`（`lint.ts` 与另两条腿共用一次解析）。
 */
export function runSelectorFormCheck(
  root: string,
  resolution: PluginIdResolution = resolvePluginIdForCss(root),
): SelectorFormReport {
  const absRoot = resolve(root);
  const report: SelectorFormReport = {
    root: absRoot,
    pluginId: resolution.pluginId,
    error: resolution.error,
    anchorless: [],
    crossParty: [],
    violations: [],
  };

  // ── fail-closed（不可豁免）：拿不到前缀 ⇒ S3 判不了「自有命名空间」是哪一族 ──
  if (resolution.error || !resolution.pluginId) {
    report.violations.push({
      file: "plugin.json",
      line: 1,
      message:
        `拿不到本仓前缀：${resolution.error}。**选择器形态判据不许静默放过**——S3（跨方命中必须自带自有命名空间）` +
        `要先知道「自有」是哪一族，拿不到 \`pluginId\` 就判不了（fail-closed）。在插件工程根修好 plugin.json` +
        `（或显式声明 pluginId）；身份问题不受 disable 注释管辖。`,
    });
    return report;
  }

  const pluginId = resolution.pluginId;
  for (const unit of collectCssUnits(absRoot, [CHECK_IDS.cssNamespace])) {
    for (const s of selectorFormSites(unit.cleaned)) {
      const verdict = judgeSelectorForm({ selector: s.selector, pluginId });
      if (!verdict) continue;
      // 知情绕行：同一个 check id（与类名 / 关键帧 / token 判据同一套 disable 机制）
      if (isDisabled(unit.disabled, s.line, CHECK_IDS.cssNamespace)) continue;
      const site: SelectorFormSite = {
        file: unit.rel,
        line: s.line,
        selector: s.selector,
        form: s.form,
        code: verdict.code,
        why: verdict.why,
      };
      (verdict.code === "S2" ? report.anchorless : report.crossParty).push(site);
      report.violations.push({ file: unit.rel, line: s.line, message: messageOf(site, pluginId) });
    }
  }
  return report;
}
