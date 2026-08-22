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
import { trackRegistration } from "../core/registry/registrationTracker";

/** 每插件语言数据留存——{ pluginId → [{ lang, data }] }，注册序即合并序 */
const _pluginI18nData = new Map<string, Array<{ lang: string; data: Record<string, unknown> }>>();

export function registerPluginLanguageBundle(
  langCode: string,
  data: Record<string, unknown>,
  pluginId: string,
): () => void {
  const ns = "translation";
  i18n.addResourceBundle(langCode, ns, data, true, true);
  i18n.addResourceBundle(langCode, pluginId, data, true, true);
  let rec = _pluginI18nData.get(pluginId);
  if (!rec) {
    rec = [];
    _pluginI18nData.set(pluginId, rec);
  }
  const record = { lang: langCode, data };
  rec.push(record);

  // E5.8#10：per-entry disposer——只撤本次 bundle，该语言 translation 命名空间按剩余记录整份重建
  // （碰撞正确 + 注册序保持）。幂等：记录已不在 → 早退。
  return trackRegistration(pluginId, () => {
    const list = _pluginI18nData.get(pluginId);
    if (!list) return;
    const idx = list.indexOf(record);
    if (idx === -1) return;
    list.splice(idx, 1);
    if (list.length === 0) _pluginI18nData.delete(pluginId);
    const stillHasSameLang = list.some((e) => e.lang === langCode);
    // translation 命名空间整份重建——该语言下其余插件（含其他插件同语言）相对顺序不变
    i18n.removeResourceBundle(langCode, "translation");
    for (const [, entries] of _pluginI18nData) {
      for (const e of entries) {
        if (e.lang === langCode) {
          i18n.addResourceBundle(langCode, "translation", e.data, true, true);
        }
      }
    }
    // pluginId 命名空间——仅当插件不再有该语言 bundle 才整删（同插件多份同语言 bundle 共存时保留）
    if (!stillHasSameLang) {
      i18n.removeResourceBundle(langCode, pluginId);
    }
  });
}
