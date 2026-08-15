/**
 * 插件语言资源注册/清理——重装契约修复（E5.7）。
 *
 * 背景：registerLanguageBundle 向 i18next 写两份命名空间——ns="translation"（壳 t()
 * 查键 + 语言切换广播给池）与 ns=pluginId（按插件整份追踪）。原 H6 清理只删 pluginId
 * 命名空间，translation 命名空间死键永久残留——卸载后 t(key) 仍显示已卸载插件的旧译文，
 * 且下次语言切换广播还会把死键推给池。
 *
 * 方案：逐插件留存原始 data——卸载时 translation 命名空间按剩余插件整份重建。
 * 逐键 removeResource 不可行——两个插件共用顶层键时会误删对方子键；整份重建保碰撞正确
 * （Map 插入序 = 注册序，重建后其余插件相对顺序不变）。
 *
 * 独立模块（非 loader.ts 内嵌）——lifecycle 消费端 2b 静态 import 零循环依赖；单测可独立覆盖。
 */
import i18n from "../i18n";

/** 每插件语言数据留存——{ pluginId → [{ lang, data }] }，注册序即合并序 */
const _pluginI18nData = new Map<string, Array<{ lang: string; data: Record<string, unknown> }>>();

export function registerPluginLanguageBundle(
  langCode: string,
  data: Record<string, unknown>,
  pluginId: string,
): void {
  const ns = "translation";
  i18n.addResourceBundle(langCode, ns, data, true, true);
  i18n.addResourceBundle(langCode, pluginId, data, true, true);
  let rec = _pluginI18nData.get(pluginId);
  if (!rec) {
    rec = [];
    _pluginI18nData.set(pluginId, rec);
  }
  rec.push({ lang: langCode, data });
}

/**
 * 卸载/禁用语言清理——translation 命名空间整份重建（只留其余插件）+ pluginId 命名空间整删。
 * 由 lifecycle 消费端 2b 调用。
 * 已知边界：i18next add/removeResourceBundle 不触发 react-i18next 重渲染（src/i18n/index.ts:39
 * 同款注释）——当前语言下已渲染界面的旧译文保持到下次语言切换；资源层已即时干净。
 */
export function unregisterPluginLanguageBundles(pluginId: string): void {
  const rec = _pluginI18nData.get(pluginId);
  if (rec) {
    _pluginI18nData.delete(pluginId);
    for (const { lang } of rec) {
      i18n.removeResourceBundle(lang, "translation");
      for (const [, entries] of _pluginI18nData) {
        for (const e of entries) {
          if (e.lang === lang) {
            i18n.addResourceBundle(lang, "translation", e.data, true, true);
          }
        }
      }
    }
  }
  // pluginId 命名空间整份删除（原 H6 循环语义搬移至此——两份命名空间一处收敛）
  for (const lang of i18n.languages ?? []) {
    i18n.removeResourceBundle(lang, pluginId);
  }
}
