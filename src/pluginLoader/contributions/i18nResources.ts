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
 *
 * E6#111j（1.40）：补「注册时键覆盖出声」——深合并的静默覆盖此前对用户不可见、对被覆盖方作者
 * 也不可见（他机器上没装对方插件）。详见 warnOnKeyOverlap。🔴 只出声不拦：i18n 键可以合法住在
 * 应用级字典（官方 settings 的 t() 键全在 lang-defaults），插件仓判不出撞键 ⇒ 硬判必出假红。
 */
import i18n from "../../i18n";
import { trackRegistration } from "../../core/registry/registrationTracker";

/** 每插件语言数据留存——{ pluginId → [{ lang, data }] }，注册序即合并序 */
const _pluginI18nData = new Map<string, Array<{ lang: string; data: Record<string, unknown> }>>();

/** 已出声过的「语言码 + 键」——同一键反复注册（重装/热重载）不刷屏 */
const _warnedKeyOverlaps = new Set<string>();

/**
 * 清空「已出声」记账（E6#111j）。
 * 用途：热重载后允许同一批键**再报一次**（否则用户改完插件重装，覆盖提示就再也看不见了）；
 * 单测也靠它拿到干净起点——该记账是模块级单例，跨用例不隔离。
 */
export function resetKeyOverlapWarnings(): void {
  _warnedKeyOverlaps.clear();
}

/**
 * 键覆盖出声（E6#111j）。
 *
 * 为什么只说「覆盖」不说「被谁占」：`_pluginI18nData` 是 Map 插入序，本函数**报不出原属谁**
 * ——说做不到的事就是假话。作者也不在自己机器上装对方插件，「被覆盖」原本永远收不到通知。
 *
 * 🔴 为什么只出声不拦：i18n 键**可以合法住在应用级字典**（官方 settings 的 254 个 t() 键
 * 一个都不在自己仓），插件仓里判不出「你的键撞了别人」⇒ 硬判必出假红，而假红会让真红失效。
 * 故本条**天然只能是黄灯**：值照写（后注册者胜，语义不变），只多一行可查的提示。
 */
function warnOnKeyOverlap(
  langCode: string,
  data: Record<string, unknown>,
  pluginId: string,
): void {
  const existing = i18n.getResourceBundle(langCode, "translation") as
    | Record<string, unknown>
    | undefined;
  if (!existing) return;
  // 归并本次 data 的**自有**顶层键——插件 en/zh 两份同键是同一方写两遍，不是共写
  const own = new Set(
    (_pluginI18nData.get(pluginId) ?? [])
      .filter((e) => e.lang === langCode)
      .flatMap((e) => Object.keys(e.data)),
  );
  for (const key of Object.keys(data)) {
    if (!(key in existing)) continue;
    // 本插件已写过该键 ⇒ 是自己覆盖自己，不出声（零误报是本条的硬判据）
    if (own.has(key)) continue;
    // 去重按「语言 ＋ 键 ＋ 写入者」——否则第三个写同一个键的人会被静默吞掉（那正是本轴要消灭的静默）
    const dedup = `${langCode}\u0000${key}\u0000${pluginId}`;
    if (_warnedKeyOverlaps.has(dedup)) continue;
    _warnedKeyOverlaps.add(dedup);
    console.warn(
      `[i18nResources] 键 "${key}"（${langCode}）被 ${pluginId} 覆盖——已有同键，来源未知；值以后注册者为准`,
    );
  }
}

export function registerPluginLanguageBundle(
  langCode: string,
  data: Record<string, unknown>,
  pluginId: string,
): () => void {
  const ns = "translation";
  warnOnKeyOverlap(langCode, data, pluginId);
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
