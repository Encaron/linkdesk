/**
 * check-css-namespace 腿·**插件域关键帧引用判据**（E6#112 · 2026-09-18）。
 *
 * ── 规则一句话 ──
 * `animation` / `animation-name` 里写的**名字**，必须在本方有 `@keyframes` 定义；没有 ⇒
 * **动画静默消失**（不报错、不抛异常、只是不动）——「改名忘改引用」是这条判据的**真实发生率**来源
 * （1.21／1.21b 两轮把关键帧名全改成 `ldk-*` 时踩的就是它）。规则正文 =
 * `docs/02-Electron架构/E6_插件生态与发布/插件规范化层/08-任务-插件域关键帧引用判据.md`。
 *
 * ── 为什么值得一条腿（不是理论风险）──
 * 壳侧判据⑧（`scripts/check-css-namespace.mjs:381`，`kind: "animation-ref-dangling"`）把这件事做了，
 * 但它的域是**宿主域 ＋ 共享组件域**（`allowedKeyframes = sharedKf + shellKf`）——**插件域那一半
 * 此前没有任何尺子**。1.27 复量推翻了 1.26 的「缺口为空」：官方 18 仓有 **3 处** `animation:` 引用
 * 与 3 处同名定义（`marketplace-ms-icon-spin` / `serial-monitor-slideDown` / `serial-monitor-fadeIn`），
 * **今天全自解析、零违规** ⇒ 本条是**纯预防性**：补的是「下一次有人改关键帧名时，有没有东西叫醒他」。
 *
 * ── 允许集 = 三条并集（本格的裁，别再推倒重来）──
 *   ① 本仓**被扫描 CSS 里的 `@keyframes` 定义** ← 主集（1.3 的三对就是这个形态）；
 *   ② **宿主保留账** `schemas/reserved-class-names.json#keyframes`（8 条）——**已登记的公共面**，
 *      插件引用它属于**合法消费**（⛔ 不许判红）；
 *   ③ **同批扫描到的其他 CSS 单元里的定义**——定义先**全量收齐**再判引用，故「定义写在另一个被
 *      扫描的文件里」同样算数（`scan.ts` 的 `SKIP_DIRS` 已排掉 `node_modules`／`dist`，所以这里说的是
 *      作者放进 `src/` 的 vendored CSS）。
 *
 * ── 明确不做的四件（防越界——那是别的判据／别的轴的活）──
 *   ⛔ 不判**前缀**（「关键帧名必须 `<pluginId>-` 开头」是 `plugin-prefix.ts` 判据② 的活）；
 *   ⛔ 不判**意图**（只判**悬空**：不判断「该不该引用某一个名字」——照 S2/S3 的纪律，管形态不管意图）；
 *   ⛔ 不判**跨仓**（「引用了别的插件的关键帧」不可判 ⇒ 连黄灯都难，别顺手做）；
 *   ⛔ **不给白名单／基线／棘轮兜底**（手抄表必腐烂——CSS 系列反复否决过的形态）。
 *
 * ── 口径与豁免 ──
 *   · 名字抽取**与壳侧 `scripts/lib/css-selectors.mjs` 的 `animationRefs()` 同源**——跨包不能 import
 *     ⇒ 各写一份，由壳门禁 `--self-test` 的 `锚⑨` 用锚词钉住（本包那份在 `css-selectors.ts`）。
 *   · 知情绕行 = 标准 disable 注释（`CHECK_IDS.cssNamespace`，与类名／关键帧／token／形态同一 id）。
 *   · **fail-closed**：拿不到 `pluginId` ⇒ 红（照 `selector-form.ts` 的既有纪律：**静默放过 = 门禁变瞎子**）。
 *     ⚠️ 那条报点与 `plugin-prefix.ts` 的身份错误落在同一处 `plugin.json:1` ⇒ `lint.ts` 汇总时会被
 *     前缀腿的话吃掉（**同一件事不说两遍**）；它真正暴露的场合是**单独调用本判据**的审计路径。
 */
import { resolve } from "node:path";
import { collectCssUnits, type CheckViolation } from "./scan.js";
import { animationRefs, keyframeDefinitions } from "./css-selectors.js";
import { isDisabled, CHECK_IDS } from "./disable.js";
import { resolvePluginIdForCss, type PluginIdResolution } from "./plugin-prefix.js";
import { loadReservedNames, type ReservedNames } from "./reserved-classes.js";

/** 判级文案——**与壳侧判据⑧ 同源口径**（域不同：那边宿主域＋共享组件域，本处插件域） */
export const KEYFRAME_REF_WHY = {
  dangling:
    "`animation` / `animation-name` 引用的关键帧**在本方没有 `@keyframes` 定义**" +
    "——症状是**动画静默消失**（不报错、不抛异常、只是不动）。「改名忘改引用」是这条判据的" +
    "**真实发生率**来源（1.21／1.21b 把关键帧名全改 `ldk-*` 时踩的就是它）。",
} as const;

/** 一处悬空引用站点 */
export interface KeyframeRefSite {
  /** 工程相对路径（正斜杠） */
  file: string;
  /** 1-based（属性名所在行） */
  line: number;
  /** 被引用但找不到定义的关键帧名 */
  name: string;
  /** 属性名原文（`animation` / `-webkit-animation`…） */
  decl: string;
}

export interface KeyframeRefReport {
  root: string;
  pluginId: string | null;
  /** 非 null ⇒ fail-closed（拿不到身份 ⇒ 照本腿纪律报红） */
  error: string | null;
  /** 允许集（排序后）：本仓被扫描 CSS 的 `@keyframes` ∪ 宿主保留账 */
  allowed: string[];
  /** 引用点总数（含合规引用——审计读数用） */
  refs: number;
  /** 悬空引用站点 */
  dangling: KeyframeRefSite[];
  /** 腿报点 = fail-closed ＋ 悬空 */
  violations: CheckViolation[];
}

/** 一处悬空引用的报点文案 */
function messageOf(site: KeyframeRefSite, allowedSize: number): string {
  return (
    `\`${site.decl}: … ${site.name} …\` 引用的关键帧 "${site.name}" 在**本方**` +
    `（本仓被扫描的 CSS ＋ 宿主保留账，共 ${allowedSize} 个名字）**没有 \`@keyframes\` 定义**——` +
    `${KEYFRAME_REF_WHY.dangling}` +
    `改法：要么补 \`@keyframes ${site.name}\`，要么把引用改成**真实存在**的名字（**两处同笔改**）。` +
    `引用宿主/共享组件的关键帧是**合法**的（` +
    `\`reserved-class-names.json#keyframes\` 那 8 条就在允许集里）。`
  );
}

/**
 * 跑本仓关键帧引用判据。返回结构化报告（审计工具 / lint 打印用）——**同一份实现，没有第二条判据路径**。
 * ⚠️ `resolution` 可复用调用方已经取过的 `pluginId`；`reserved` 可注入（自测用），默认读包内账。
 */
export function runKeyframeRefCheck(
  root: string,
  resolution: PluginIdResolution = resolvePluginIdForCss(root),
  reserved: ReservedNames = loadReservedNames(),
): KeyframeRefReport {
  const absRoot = resolve(root);
  const report: KeyframeRefReport = {
    root: absRoot,
    pluginId: resolution.pluginId,
    error: resolution.error,
    allowed: [],
    refs: 0,
    dangling: [],
    violations: [],
  };

  // ── fail-closed（不可豁免）：拿不到身份 ⇒ 报红（静默放过 = 门禁变瞎子）──
  if (resolution.error || !resolution.pluginId) {
    report.violations.push({
      file: "plugin.json",
      line: 1,
      message:
        `拿不到本仓前缀：${resolution.error}。**关键帧引用判据不许静默放过**——` +
        `身份读不出来时这条腿与整条命名空间腿同命（先修 plugin.json 的 pluginId；身份问题不受 disable 管辖）。`,
    });
    return report;
  }

  const units = collectCssUnits(absRoot, [CHECK_IDS.cssNamespace]);

  // ① 定义先**全量收齐**（定义可以出现在任何被扫描单元里 ⇒ 与文件顺序无关）
  const allowed = new Set<string>();
  for (const unit of units) {
    for (const kf of keyframeDefinitions(unit.cleaned)) allowed.add(kf.name);
  }
  // ② 宿主保留账（已登记的公共面——引用它是合法消费）
  for (const k of reserved.keyframes) allowed.add(k.name);
  report.allowed = [...allowed].sort();

  // ③ 再判引用
  for (const unit of units) {
    for (const ref of animationRefs(unit.cleaned)) {
      report.refs++;
      if (allowed.has(ref.name)) continue;
      if (isDisabled(unit.disabled, ref.line, CHECK_IDS.cssNamespace)) continue;
      const site: KeyframeRefSite = { file: unit.rel, line: ref.line, name: ref.name, decl: ref.decl };
      report.dangling.push(site);
      report.violations.push({ file: unit.rel, line: ref.line, message: messageOf(site, allowed.size) });
    }
  }
  return report;
}
