/**
 * `check-config-titles`——配置项短名（`contributes.configuration.properties.*.title`）三族判据。
 * **D6 分级门禁的插件侧「黄灯腿」判据本体**（2026-10-04 配置项短名案，层 1）。
 *
 * ── 三族判据（01 层 1）──
 *   ① 无 `title`        —— 声明了 configuration.properties 却没给行名短名 ⇒ 黄
 *                          （设置页/市场功能页只能裸显英文配置键，D1 的「人话行名」缺位）
 *   ② 有 `title` 缺译名 —— title 值（中文原文 = i18n key）不在本仓自有字典 ⇒ 黄
 *                          ⚠️ **本族与 own-dict-coverage ⑧ 段同域**——⑧ 对「可渲染串缺译」判**红**
 *                          （manifest 腿），此处只作黄灯汇总；且 ⑧ 连「本仓零字典声明」的形态一起管。
 *                          调用方把 ⑧ 的 `dict.keys` 传进来即可复用（⛔ 不在两处各自读盘，两把尺子同一份实现）。
 *   ③ 有 enum 缺 `enumDescriptions` —— 枚举值无显示名 ⇒ 设置页下拉裸显英文值（取证 ⑦）
 *
 * ── severity 归调用方 ──
 * 本模块是**纯判据**（无 fs、无 process.exit）：官方各仓 CI（ci-verify ⑨ 段）内测期按 **warn** 消费
 * ——列黄单不判红；预留 `--strict`（v1 正式版统一切红，E21——黄单清零前 ⛔ 无预告判红）。
 * 壳是软件本体、一步红灯不设黄灯——壳侧红门禁（壳 scripts/check-config-titles.mjs 默认模式）
 * 只借本模块的 `--plugin` 模式（同一份三族判据），壳四文件的 TS 提取与「无 title 判红」住壳侧脚本。
 *
 * 自测口径（⛔ 空转判据 ≠ 零存量）：真缺 title 的 fixture 必须出黄、齐全 fixture 必须安静
 * ——见 src/check-config-titles.test.ts。
 */

/** 一句话口径——报错文案与文档同源引用 */
export const CONFIG_TITLES_CALIBER =
  "配置项短名（title）＝ 设置页与市场功能页的行级人话名——谁的声明谁补名，缺省时渲染回退显配置键（D1/D2）。";

/**
 * 从 manifest 收集三族缺口。**纯函数**（不读盘）：
 * @param manifest 已解析的 plugin.json（任意形状——形状不对按「无 configuration」处理）
 * @param options.dictKeys 本仓自有字典的 key 集合（⑧ 段 cov.dict.keys）；不传 = 跳过 ② 族（无字典可对）
 * @returns {{ scanned: {properties: number, enums: number}, noTitle: Array<{key: string, group: string}>,
 *            missingEn: Array<{key: string, title: string}>, missingEnumDescriptions: Array<{key: string, group: string, enumCount: number}>,
 *            hasConfiguration: boolean }}
 */
export function collectConfigTitleGaps(manifest, options = {}) {
  const props = manifest?.contributes?.configuration?.properties;
  const out = {
    scanned: { properties: 0, enums: 0 },
    noTitle: [],
    missingEn: [],
    missingEnumDescriptions: [],
    hasConfiguration: Boolean(
      props && typeof props === "object" && Object.keys(props).length > 0,
    ),
  };
  if (!out.hasConfiguration) return out;
  const dictKeys = options.dictKeys instanceof Set ? options.dictKeys : null;
  for (const [key, prop] of Object.entries(props)) {
    // E6#151 同口径：形状不可信——非对象条目剔出判域（manifest 校验拦形状，这里不重复报）
    if (!prop || typeof prop !== "object" || Array.isArray(prop)) continue;
    out.scanned.properties += 1;
    const group = typeof prop.group === "string" ? prop.group : "";
    if (typeof prop.title !== "string" || prop.title.trim() === "") {
      out.noTitle.push({ key, group });
    } else if (dictKeys && !dictKeys.has(prop.title)) {
      out.missingEn.push({ key, title: prop.title });
    }
    const hasEnum = Array.isArray(prop.enum) && prop.enum.length > 0;
    if (hasEnum) {
      out.scanned.enums += 1;
      const ed = prop.enumDescriptions;
      // 空对象/空数组 = 没给（占位也算缺——下拉照样裸显英文值）
      const edUsable =
        Array.isArray(ed)
          ? ed.length > 0
          : ed !== null && typeof ed === "object" && Object.keys(ed).length > 0;
      if (!edUsable) {
        out.missingEnumDescriptions.push({ key, group, enumCount: prop.enum.length });
      }
    }
  }
  return out;
}

/** 黄单一行——三族同款格式（key 打头，组名随行） */
export function formatTitleGap(family, gap) {
  const at = gap.group ? `（节：${gap.group}）` : "";
  if (family === "noTitle") return `无 title——设置页/市场只能裸显配置键：${gap.key}${at}`;
  if (family === "missingEn") return `title「${gap.title}」缺 en 译名（配置键 ${gap.key}）——英文界面回退显中文`;
  return `enum ${gap.enumCount} 档全无 enumDescriptions——下拉裸显英文值：${gap.key}${at}`;
}

/** 修法指路——三族各一句（文案与 own-dict 的 hint 同风格：说清落点，不让人猜） */
export function titleGapHint(family) {
  if (family === "noTitle")
    return `在本仓 plugin.json 的该条声明里加 "title": "<中文短名>"（≤12 字名词短语、去插件前缀；renderHint "action" 行按按钮语义起动词名），en 译名进本仓 i18n/en.json。`;
  if (family === "missingEn")
    return `把 title 的中文原文作为 key 补进本仓 i18n/en.json（谁声明谁供译——英译不进壳的语言包）。`;
  return `给该条声明补 "enumDescriptions"（对象形态：enum 值 → 中文显示名），en 译名同笔进 i18n/en.json。`;
}
