/**
 * 悬浮面板「首开形态」解析——contributes.floatingPanel 的**形态面**（defaultForm / formKey）。
 *
 * 分工（2026-09 用户拍板）：插件只**声明**想要哪种形态，壳**决定并执行**形态。
 *   · 定死（无用户入口）＝ 作者写 defaultForm；
 *   · 交给用户    ＝ 作者写 formKey 指向一个配置键（键的 default 即作者默认形态）。
 * 调用方（core.openSettings 等壳侧入口）拿本函数的结果选 `openTab` 还是 `panel:reveal-floating`——
 * 壳侧**零插件 id 硬编码**：换任何一只声明者（含 factoryRole 一对多的另一只设置插件、将来任何插件）
 * 都同样生效，不必再改壳（本模块就是那个通用接缝）。
 *
 * 判定链（第一命中即返回）：
 *   ① formKey 已声明 **且该键已注册** → 取值是形态词汇表里的值 → 用它（值即形态，无映射层）
 *   ② defaultForm（作者定死，合法值才认）
 *   ③ null = 没声明形态 → 调用方保持**今天**的行为（有面板即面板，零回归）
 *
 * ⛔ 未注册的键不读：getConfigurationValue 的合并链末级是 getSystemFallback——键没注册还去读，
 *   等于壳替作者编了个形态（静默假生效）。这也顺带把「formKey 写错字」变成一声可见的诊断。
 *
 * @see docs/03-插件制造/03-插件contributes规范.md §3.15
 */

import type { ContributesFloatingPanel, FloatingPanelOpenForm } from "../../api/types";
import { getMergedSchema } from "../../registry/ConfigurationRegistry";
import { getConfigurationValue } from "../configuration/ConfigurationService";
import { getFloatingPanelDeclaration } from "../../../pluginLoader/contributions/viewRegistry";

/** 形态词汇表校验——声明面与配置值共用同一条（非法值一律当没声明，不崩、不猜） */
export function isFloatingPanelOpenForm(value: unknown): value is FloatingPanelOpenForm {
  return value === "floatingPanel" || value === "tab";
}

/** 判定链纯函数（不碰注册表/配置——读取器注入，测试直调） */
export function resolveOpenFormFromDeclaration(
  declaration: Pick<ContributesFloatingPanel, "defaultForm" | "formKey"> | null | undefined,
  readConfigValue: (key: string) => unknown,
): FloatingPanelOpenForm | null {
  if (!declaration) return null;
  const formKey = typeof declaration.formKey === "string" ? declaration.formKey.trim() : "";
  if (formKey) {
    const value = readConfigValue(formKey);
    if (isFloatingPanelOpenForm(value)) return value;
    // 键没注册 / 值不在词汇表（旧值、手改坏值）→ 不猜，落到作者定死的那档
  }
  return isFloatingPanelOpenForm(declaration.defaultForm) ? declaration.defaultForm : null;
}

/** formKey 指向未注册键的诊断去重——本函数每次开设置都跑，同一个错只许出声一次（不刷屏） */
const _warnedUnregisteredFormKey = new Set<string>();

/** 壳侧解析入口：读声明 + 读配置 → 首开形态（null = 未声明形态 = 现状行为） */
export function resolveFloatingPanelOpenForm(pluginId: string): FloatingPanelOpenForm | null {
  const declaration = getFloatingPanelDeclaration(pluginId);
  if (!declaration) return null;
  return resolveOpenFormFromDeclaration(declaration, (key) => {
    if (!getMergedSchema()[key]) {
      const signature = `${pluginId}\u0000${key}`;
      if (!_warnedUnregisteredFormKey.has(signature)) {
        _warnedUnregisteredFormKey.add(signature);
        console.warn(
          `[floatingPanelForm] 插件 "${pluginId}" 声明了 contributes.floatingPanel.formKey = "${key}"，` +
            `但这个键没在任何插件的 contributes.configuration 里注册——本次按作者定死的形态（或原行为）处理。` +
            `改法：在该插件自己的 contributes.configuration.properties 里声明它（键名 ${pluginId}.<词干>）。`
        );
      }
      return undefined;
    }
    return getConfigurationValue<unknown>(key);
  });
}

/** 测试用——清诊断去重（跨用例隔离） */
export function clearFloatingPanelFormDiagnostics(): void {
  _warnedUnregisteredFormKey.clear();
}
