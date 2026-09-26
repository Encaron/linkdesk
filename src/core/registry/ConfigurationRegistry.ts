/**
 * 配置注册表——对标 VS Code ConfigurationRegistry。
 * Phase 5 柱子 2：插件声明 contributes.configuration → Settings Editor 自动渲染。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子2 + §柱子6.3
 * VS Code 对标：IConfigurationRegistry.registerConfiguration / IConfigurationService
 * VS Code 源码：src/vs/platform/configuration/common/configurationRegistry.ts
 *
 * ── 键归属仲裁（E6#111d／1.34 落地；判据出处 1.33 §11.1 裁决 = 丙 = 甲 ＋ 乙）──
 * 两档，都只**拒一个键**、都**不抛错**（抛错 = 整个插件装不上，代价远大于一个键失效）：
 *   🔴 **保护区**：非宿主身份的插件注册的键落在宿主保留面（`HOST_RESERVED_CONFIG_KEYS`）⇒ 拒该键。
 *   🟡 **首撞保留**：两个非宿主插件注册同一个键 ⇒ 先注册者保留，后者的该键被拒。
 * 宿主身份 = pluginId ∈ `HOST_PSEUDO_PLUGIN_IDS`（app / appearance；"update" 已于 2026-09-26 退役——04 设置页通用归类，见 scripts/host-reserved.json 的 retired[]）——保护区对宿主自己不生效。
 * 保留面清单是**生成式**的（`src/core/registry/host-reserved.generated.ts`，改法见 `npm run audit:plugin-scope:regen`）；
 * 为什么运行时需要一份静态副本而不是"看谁先注册"：宿主有**从未注册**的真键（`app.schemaVersion`）。
 */

import { trackRegistration } from "./registrationTracker"; // E5.8#10：register 返 disposer——卸载自动逆序回滚
import { HOST_PSEUDO_PLUGIN_IDS, HOST_RESERVED_CONFIG_KEYS } from "./host-reserved.generated";

/* ── 类型 ── */

export type ConfigurationType = "string" | "number" | "boolean" | "object" | "array";

export interface ConfigurationProperty {
  type: ConfigurationType;
  default: unknown;
  enum?: string[];            // 下拉选项（string 类型时可选）
  enumDescriptions?: string[];// 选项说明（和 enum 一一对应）
  description: string;        // 设置项说明——Settings Editor 渲染为提示
  minimum?: number;           // number 类型时可选的 min/max
  maximum?: number;
  /** E5.8 Phase 12 #161：数值步进——number 型配置项的增减步长（uiHint "fontSize"/"slider" 渲染读）。
   *  slider 缺省由 renderControl inferSliderStep 按区间推导（浮点区间 0.01），schema 显式 step 覆盖；
   *  NumberInput 缺省 1（editor.fontSize 不声明 → 8/72/1 零回归）；app.uiFontScale 声明 5（① 拍板百分比步进）。
   *  可选字段：第三方不声明 = 各控件缺省步进。 */
  step?: number;
  /** Phase 5f ConfigurationApplier：配置值变化时框架自动调用。
   *  可 async——applyAllConfigurations 按注册顺序 await 保证时序。
   *  如：theme onApply (async load) → accent onApply (sync setProperty) 不会竞态。 */
  onApply?: (value: unknown) => void | Promise<void>;
  /** E3f #59d0：声明式条件显隐——依赖 key 的值不等于 value 时整行不渲染。
   *  对标 VS Code package.json `when` 条件。所有配置项通用，一次写完，任意插件复用。 */
  dependsOn?: { key: string; value: unknown };
  /** E3f #59d3：渲染提示——SettingsView 按 hint 决定控件样式。
   *  "color" → 文本输入框旁显示色块预览（#59e ColorPicker 替换为弹出调色器）。
   *  "action" → 渲染按钮而非输入框，点击执行 onApply。场景：一键重置、清空缓存等操作型配置。
   *  E5.7#74：闭合 union → string——插件独立铁律：第三方声明新 hint 不被壳 TS 类型拒绝
   *  （SettingsView 已有降级逻辑，未知 hint 回退 type 默认渲染）。 */
  renderHint?: string;
  /** E5#57：声明式编辑控件提示——plugin.json 中声明，SettingsView 按 hint 选择控件。
   *  优先级高于 type。不认识的 hint 降级回 type 默认渲染——不抛错。
   *  E5.7#74：闭合 union → string（同上——已知值 "fontFamily"/"fontSize"/"color"/"file"/"directory"
   *  仅文档化，不构成类型白名单）。 */
  uiHint?: string;
  /** E5.8#50.20：等宽限定——仅 uiHint "fontFamily" 有意义。true/缺省 = 只列等宽族
   *  （编辑器字体）；false = 全字族（UI 字体，如 app.fontFamily 写 --font-ui）。 */
  monoOnly?: boolean;
  /** E5.8#50.23：动态下拉数据源——uiHint "select" 时读取（渲染时调 theme.listRecipes() 动态取）。
   *  渲染器扩展，不改本注册表存储结构（08 §7.3 #3）。"theme.colorways" = 活动配方配色；
   *  "theme.sources" = 混搭来源（按 optionsFromDomain 过滤 RecipeMeta.domains）。 */
  optionsFrom?: string;
  /** 混搭来源域过滤——optionsFrom "theme.sources" 时按此域过滤（10 §2 六域之一） */
  optionsFromDomain?: string;
  /** E5.8#50.26：renderHint "action" 按钮动作——点击执行此壳命令（混搭复位执行 theme.resetMix，
   *  单一写入点；onApply 被 IPC 剥除不可达插件，按钮经命令触发壳侧 onApply 链）。 */
  actionCommand?: string;
  /** E5.8#50.26：renderHint "action" 按钮禁用条件——全部 {key,value} 匹配当前配置值时禁用
   *  （混搭复位「6 来源全跟随主题 → 置灰」，10 §6 决策记录 3）。 */
  actionDisabledAll?: Array<{ key: string; value: unknown }>;
  /** E5.8#78：组内二级标题——SettingsView 按本字段把同组 key 归到子标题下渲染（主题组 5 分节）。
   *  可选字段：第三方不声明 = 保持平铺原样（零侵入）。组标题字符串走壳 t() i18n（lang-defaults）。 */
  group?: string;
  /** E5.8#77：数值单位——uiHint "slider" 值标签单位（"×" 倍数前缀 / "px" 像素后缀；空 = 裸数值）。
   *  可选字段：第三方不声明 = 只显示数值不显示单位（零侵入）。 */
  unit?: string;
  /** E5.8#87：来源徽标——本键所属外观域 mix 来源 key（设置页每槽显示值来源：混搭域生效时 🔀）。
   *  可选字段：第三方不声明 = 不显示来源徽标（零侵入）。 */
  sourceKey?: string;
  /** E5.8#155：跟随主题生效值徽标——本键跟随主题时行尾显示的生效 token key（设置页读
   *  theme.getEffectiveTokens 显示实际生效值，对标 VS Code「从默认值继承」）。
   *  token 映射声明进配置 schema（对齐 sourceKey 先例）——设置插件零映射表，读到声明即显示。
   *  可选字段：第三方不声明 = 不显示生效值徽标（零侵入）。 */
  effectiveToken?: string;
  /** E5.8 用户审计 #3：跟随主题语义——本键 user scope 删除后回落主题基线（非 schema 默认）。
   *  声明该字段的键，设置行齿轮菜单出现「跟随主题」项（SettingRow 设 context key settingFollowTheme →
   *  coreCommands workbench.action.followTheme → resetConfigurationValue 删 user scope → 外观键切主题跟变）。
   *  壳 appearance 17 键声明；第三方设置/主题插件可在自己键上声明获得同能力（零壳改动）。
   *  不含 = 齿轮无此项（模式开关/布尔开关/动作按钮等 reset≠回落主题 的键不声明）。 */
  resetsToTheme?: boolean;
  /** E5.8#158：默认项语义——本键有独立「默认项」落点（= 内置 dark/light 配方值，:root 硬兜底）。
   *  声明该字段的键，设置行齿轮「重置此设置」改写成 `CONFIG_NONE_SENTINEL`（__none__）——字体/背景
   *  键落到系统栈/无图（不跟随主题），与「跟随主题」（删 user scope 主题胜出）真正区分两语义。
   *  SettingRow 设 context key settingResetsToDefault → coreCommands resetSetting 分流。
   *  壳 appearance 四键（fontFamily/fontFamilyMono/backgroundImage/zoneBackgroundImage）声明；
   *  第三方键声明即得同能力（零壳改动）。不含 = 「重置此设置」保持删 user scope 回 schema 默认。 */
  resetsToDefault?: boolean;
}

/** 插件贡献的 configuration 分组——对标 VS Code package.json contributes.configuration */
export interface ConfigurationContribution {
  title: string;                                    // 分组名——Settings Editor 左侧树节点
  properties: Record<string, ConfigurationProperty>;// key → 设置项定义
}

/** 单个 property 的杂项信息（在 ConfigurationService 里用） */
export interface InspectResult<T> {
  key: string;
  defaultValue: T;
  userValue?: T;
  workspaceValue?: T;
  effectiveValue: T;
}

/* ── Registry ── */

const _contributions = new Map<string, ConfigurationContribution>(); // pluginId → contribution
const _configKeyOwner = new Map<string, string>();                      // configKey → pluginId（归属仲裁：首撞保留）

/** 宿主保留面（Set 化——注册热路径上每键一次 O(1)） */
const HOST_RESERVED_KEYS = new Set<string>(HOST_RESERVED_CONFIG_KEYS);
const HOST_IDENTITIES = new Set<string>(HOST_PSEUDO_PLUGIN_IDS);

/** 宿主身份（壳自己的三个注册身份）——保护区对它们不生效：宿主当然要注册自己的 app.* 键。
 *  伪造这个身份的两道闸在插件身份侧（plugin.schema pattern ＋ manifest 校验），不在这里。 */
export function isHostIdentity(pluginId: string): boolean {
  return HOST_IDENTITIES.has(pluginId);
}

/** 🔴 保护区拒绝出口（registerConfiguration 与 registerConfigurationDefaults 共用**同一个**出口——
 *  两条路各写一份文案，在作者眼里就会变成两条规矩）。
 *  措辞出处 = 1.33 任务书 §二 判据 1（**最终措辞，照抄**）。
 *  建议名 = **只换第一段、词干零变化**（与 SDK 腿 `judgeConfigKey` 的 `suggested` 同形；取末段会丢词干：
 *  `app.osIntegration.fileMenu` 应给 `plugin.osIntegration.fileMenu`，不是 `plugin.fileMenu`）。
 *  保留面指向 **SDK 包内那份**（`packages/plugin-sdk/schemas/host-reserved.json`）——它随 npm 包下发，
 *  第三方作者手上能读到；仓内 `scripts/host-reserved.json` 是维护者侧的同源账，作者读不到。
 *  ⚠️ 「出口」而非「返回文案」是刻意的：诊断文案必须待在 console 调用内（本仓 i18n 审计只认这个形状），
 *  与 CommandRegistry 的异归属拒绝同形。 */
function logHostReservedRejection(pluginId: string, key: string): void {
  const dot = key.indexOf(".");
  const stem = dot >= 0 ? key.slice(dot + 1) : key;
  console.error(
    `[ConfigurationRegistry] ❌ 拒绝注册：配置键 "${key}" 属于宿主的保留名字空间（"${pluginId}" 不是宿主身份）。` +
      `改法：改成 "${pluginId}.${stem}"——只换第一段、词干零变化。` +
      `（保留面见 packages/plugin-sdk/schemas/host-reserved.json 的 configKeys）`
  );
}

/** 注册插件的配置贡献——loader 在 parseContributions 阶段调用。
 *  E5.8#10 返 disposer：删"本次 contribution 的属性" + 该批 _configKeyOwner——
 *  merge 语义对称（同插件多次注册合并进同一对象）：合并后空 → 删整个插件条目，
 *  最后一次注册的 disposer 负责收尾。
 *  E6#111d：上面的"异插件同 key 归后注册者"已废除——改为**首撞保留**（后注册者的该键被拒，所有权不动）；
 *  disposer 只摘**本次真正被接受**的键（防删他人所有权——被拒的键从来不属于本插件）。 */
export function registerConfiguration(
  pluginId: string,
  contribution: ConfigurationContribution
): () => void {
  // E2c #13 16.2 那句「暂不抛硬错误……待 #19b 审计后改 fail-fast」——🔴 已在 1.33（E6#111c）**裁决为永久否决**，
  // 不再挂在待办上。三条理由：① parseContributions 没有 try/catch，抛错 = **整个插件装不上**，
  // 而不是"这个键没生效"；② 一个坏键的收益损失远小于一个装不上的插件；③ 替代方案已落地 = **拒键不拒插件**（下方两档）。
  // 同笔废除的历史行为：原实现对本循环**每个** key 无条件 `_configKeyOwner.set` ⇒ 后注册者静默顶掉先注册者
  // 的设置面，且只有一句 warn。warn 对一个"必然写错"的写法是错的语气——现在报 error（仍是提示不抛错）。
  const hostIdentity = isHostIdentity(pluginId);
  const accepted: Record<string, ConfigurationProperty> = {};
  for (const [key, prop] of Object.entries(contribution.properties)) {
    // 🔴 保护区：宿主保留键（非宿主身份才判——宿主注册自己的 app.* 是正常的）
    if (!hostIdentity && HOST_RESERVED_KEYS.has(key)) {
      logHostReservedRejection(pluginId, key);
      continue;
    }
    // 🟡 首撞保留：同键已被**别的**插件注册 ⇒ 拒后者的这一个键，所有权不转移
    const owner = _configKeyOwner.get(key);
    if (owner && owner !== pluginId) {
      // 文案出处 = 1.33 任务书 §二 判据 3（最终措辞，照抄）。
      console.error(
        `[ConfigurationRegistry] ❌ 拒绝注册：配置键 "${key}" —— 归属 "${owner}"（先到），插件 "${pluginId}" 后到。` +
          `原因：一个键只能有一个声明者，否则两者取值互相串。本次声明被忽略，本键仍由 "${owner}" 提供。`
      );
      continue;
    }
    _configKeyOwner.set(key, pluginId);
    accepted[key] = prop;
  }
  // E2c #19g：merge 语义——同一个 pluginId 多次注册时合并属性（如 contributes.configuration + 自动注册的 statusBar 配置）
  const existing = _contributions.get(pluginId);
  if (existing) {
    Object.assign(existing.properties, accepted);
  } else if (Object.keys(accepted).length > 0) {
    // 全被拒（或本就为空）⇒ 不建条目：否则设置页会多出一个没有任何键的空分组
    _contributions.set(pluginId, { ...contribution, properties: accepted });
  }

  return trackRegistration(pluginId, () => {
    const current = _contributions.get(pluginId);
    if (!current) return;
    for (const key of Object.keys(accepted)) {
      delete current.properties[key];
      if (_configKeyOwner.get(key) === pluginId) {
        _configKeyOwner.delete(key);
      }
    }
    // merge 后已空 → 删整个插件条目
    if (Object.keys(current.properties).length === 0) {
      _contributions.delete(pluginId);
    }
  });
}

/** 动态更新配置项的 enum + default——不影响 onApply。用于主题列表/语言列表等运行时变化。 */
export function updateConfigurationEnum(key: string, enumValues: string[], defaultValue?: string): void {
  for (const [, contrib] of _contributions) {
    if (contrib.properties[key]) {
      contrib.properties[key].enum = enumValues;
      if (defaultValue !== undefined) {
        contrib.properties[key].default = defaultValue;
      }
    }
  }
}

/** 获取所有配置贡献——Settings Editor 消费 */
export function getConfigurationContributions(): Map<string, ConfigurationContribution> {
  return new Map(_contributions);
}

/** 获取单个插件的配置贡献 */
export function getPluginConfiguration(
  pluginId: string
): ConfigurationContribution | undefined {
  return _contributions.get(pluginId);
}

/* ── 合并 schema ── */

/**
 * 将所有插件的配置合并成一个完整的 schema。
 * Settings Editor 用这个构建搜索索引和表单渲染。
 */
export function getMergedSchema(): Record<string, ConfigurationProperty> {
  const merged: Record<string, ConfigurationProperty> = {};
  for (const contrib of _contributions.values()) {
    for (const [key, prop] of Object.entries(contrib.properties)) {
      // E6#111d：本分支已**不可达**——同键不可能同时存在于两个 contribution（异插件同键在 registerConfiguration
      // 处即被首撞保留拒掉）。保留它作**防退化触发线**：哪天有人给 _contributions 另开一条写入口
      // （绕过归属仲裁），这里会响，而不是安静地 last-wins 覆盖。⛔ 不许删成"已确认死代码"——
      // 死的是路径，不是判据；也⛔不许再声称"后注册覆盖"是设计行为（那是 1.34 前的旧语义，已废除）。
      if (merged[key]) {
        console.error(
          `[ConfigurationRegistry] 🔴 合并 schema 时发现同键 "${key}" 出现在两个 contribution 里——` +
            `这是**不该发生**的状态（异插件同键在注册处就该被首撞保留拒掉），说明有人绕过了归属仲裁。`
        );
      }
      merged[key] = prop;
    }
  }
  return merged;
}

/** 获取所有 property 的默认值（用于初始化 settings.json） */
export function getDefaults(): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const contrib of _contributions.values()) {
    for (const [key, prop] of Object.entries(contrib.properties)) {
      defaults[key] = prop.default;
    }
  }
  return defaults;
}

/**
 * Phase 5 盲区 2（P0）：configurationDefaults——插件的弱默认值。
 * 优先级：用户手动设置 > configurationDefaults > 插件 default > 系统 fallback
 */
const _configurationDefaults = new Map<string, Record<string, unknown>>();
/** 弱默认值的键归属（只用于**提示**，不用于拒绝——弱默认值本就是"建议"，多来源合并是它的正常形态） */
const _defaultsKeyOwner = new Map<string, string>();

/** 注册弱默认值——插件建议其他配置项的值，但用户手动设置优先。
 *  E5.8#10 返 disposer：删本插件条目。
 *  E6#111d：与 registerConfiguration **对称**两档——🔴 保护区照拒（宿主配置面不许被插件写建议值，
 *  性质与 registerConfiguration 完全相同）；🟡 跨插件同键**只提示不拒**（弱默认值 = 建议，
 *  `getConfigurationDefaults` 本就是按插入顺序 Object.assign 合并；拒掉会凭空让某些建议消失，
 *  比"两个插件建议同一个键"更坏）。 */
export function registerConfigurationDefaults(
  pluginId: string,
  defaults: Record<string, unknown>
): () => void {
  const hostIdentity = isHostIdentity(pluginId);
  const accepted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (!hostIdentity && HOST_RESERVED_KEYS.has(key)) {
      logHostReservedRejection(pluginId, key);
      continue;
    }
    const owner = _defaultsKeyOwner.get(key);
    if (owner && owner !== pluginId) {
      // ⚠️ 判据 6 = **黄**（不是红线）：本机制的设计用途就是"建议别人的键"，跨插件同键**不拒**——
      // 两边都登记、合并时后写者胜出（既有语义）。文案出处 = 1.33 任务书 §二 判据 6（最终措辞，照抄）。
      console.warn(
        `[ConfigurationRegistry] ⚠️ 插件 "${pluginId}" 为 "${key}" 建议了弱默认值，但 "${owner}" 也建议了同一个键` +
          `——后者生效（静默 last-wins 已取消）。`
      );
    }
    _defaultsKeyOwner.set(key, pluginId);
    accepted[key] = value;
  }
  _configurationDefaults.set(pluginId, accepted);
  return trackRegistration(pluginId, () => {
    _configurationDefaults.delete(pluginId);
    for (const key of Object.keys(accepted)) {
      if (_defaultsKeyOwner.get(key) === pluginId) {
        _defaultsKeyOwner.delete(key);
      }
    }
  });
}

/** 获取所有弱默认值合并结果 */
export function getConfigurationDefaults(): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const defaults of _configurationDefaults.values()) {
    Object.assign(merged, defaults);
  }
  return merged;
}

/** 清空注册表（测试用） */
export function clearConfigurationRegistrations(): void {
  _contributions.clear();
  _configKeyOwner.clear();
  _configurationDefaults.clear();
  _defaultsKeyOwner.clear();
}

/* ── 设置页跳转目标——双通道：Emitter（已打开时跳转）+ pending 变量（未打开时 mount 消费）── */

import { Emitter } from "../react/events/CoreEvents";

let _pendingSettingsGroup: string | null = null;

/** Emitter 通道——SettingsView 已打开时实时跳转 */
export const onRequestSettingsGroup = new Emitter<string>();

/** 标记：下次打开设置页时选中此插件分组。同时 fire Emitter——设置已打开时即时跳转。 */
export function requestSettingsGroup(pluginId: string): void {
  _pendingSettingsGroup = pluginId;
  onRequestSettingsGroup.fire(pluginId);
}

/** 消费：SettingsView mount 时调用，返回目标插件 ID 并清空 */
export function consumeSettingsGroup(): string | null {
  const v = _pendingSettingsGroup;
  _pendingSettingsGroup = null;
  return v;
}

/* ── E3f #53e：滚动到指定配置项——对标 VS Code "跳转到设置中的具体配置项" ── */

let _pendingScrollToKey: string | null = null;

/** Emitter 通道——SettingsView 已打开时实时滚动 */
export const onRequestScrollToSetting = new Emitter<string>();

/** 标记：下次 SettingsView 渲染后滚动到指定 key。同时 fire Emitter——设置已打开时即时滚动。 */
export function requestScrollToSetting(key: string): void {
  _pendingScrollToKey = key;
  onRequestScrollToSetting.fire(key);
}

/** 消费：SettingsView mount/update 时调用，返回目标 key 并清空 */
export function consumeScrollToSetting(): string | null {
  const v = _pendingScrollToKey;
  _pendingScrollToKey = null;
  return v;
}

/* ── E5.8#41.14 🔴 修复：打开快捷键子栏——契约双通道（M1 同款）。
 *    原 window 事件 dispatch/lisen 字面量错配（kebab linkdesk:open-keybindings-settings vs
 *    camel linkdesk:openKeybindingsSettings）→ 快捷键 tab 永不跳转。改 Emitter + pending 双通道，错配结构性消失。── */

let _pendingOpenKeybindings: { query?: string } | null = null;

/** Emitter 通道——设置页已打开时实时切快捷键 tab */
export const onRequestOpenKeybindings = new Emitter<{ query?: string }>();

/** 标记：下次设置页 mount 后切快捷键 tab（query 可预填搜索框）。同时 fire Emitter——已打开时即时切换。 */
export function requestOpenKeybindings(query?: string): void {
  _pendingOpenKeybindings = { query };
  onRequestOpenKeybindings.fire({ query });
}

/** 消费：SettingsView mount 时调用，返回目标（含预填 query）并清空 */
export function consumeOpenKeybindings(): { query?: string } | null {
  const v = _pendingOpenKeybindings;
  _pendingOpenKeybindings = null;
  return v;
}
