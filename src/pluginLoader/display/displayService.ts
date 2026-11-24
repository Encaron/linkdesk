/**
 * 插件显示文本解析（宿主层）——把 manifest 的声明式显示字段按**插件自己的 i18n 命名空间**
 * 解析成当前语言的纯显示值。UI（市场/命令面板/菜单/设置）只消费结果，⛔ 不再自己 t() 插件数据。
 *
 * 语义：
 *   · key = 中文原文；插件字典缺键 → 原文兜底（base 永远可读）；
 *   · 只解析 manifest 声明面；插件自己视图的 t() 仍由插件负责；
 *   · 用 pluginId 命名空间，避免「打开」这类通用键在插件之间互相覆盖。
 */

import i18n from "../../i18n";
import {
  resolveDisplayManifest,
  type DisplayTextEntry,
} from "@linkdesk/plugin-sdk";

/** 单条显示文本按插件命名空间解析；缺键 → 原文。 */
export function resolvePluginDisplayText(pluginId: string, text: string, lang = i18n.language): string {
  if (!text) return text;
  const t = i18n.getFixedT(lang, pluginId);
  const value = t(text);
  return typeof value === "string" && value.trim() ? value : text;
}

/** 整份 manifest → 已解析显示视图（机器字段原样保留）。 */
export function resolvePluginManifestForDisplay<T>(
  pluginId: string,
  manifest: T,
  lang = i18n.language,
): T {
  return resolveDisplayManifest(manifest, (text: string, _entry: DisplayTextEntry) =>
    resolvePluginDisplayText(pluginId, text, lang),
  );
}
