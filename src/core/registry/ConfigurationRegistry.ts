/**
 * 配置注册表——对标 VS Code ConfigurationRegistry。
 * Phase 5 柱子 2：插件声明 contributes.configuration → Settings Editor 自动渲染。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子2 + §柱子6.3
 * VS Code 对标：IConfigurationRegistry.registerConfiguration / IConfigurationService
 * VS Code 源码：src/vs/platform/configuration/common/configurationRegistry.ts
 */

import { trackRegistration } from "./registrationTracker"; // E5.8#10：register 返 disposer——卸载自动逆序回滚

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
  /** E5.8 用户审计 #3：跟随主题语义——本键 user scope 删除后回落主题基线（非 schema 默认）。
   *  声明该字段的键，设置行齿轮菜单出现「跟随主题」项（SettingRow 设 context key settingFollowTheme →
   *  coreCommands workbench.action.followTheme → resetConfigurationValue 删 user scope → 外观键切主题跟变）。
   *  壳 appearance 17 键声明；第三方设置/主题插件可在自己键上声明获得同能力（零壳改动）。
   *  不含 = 齿轮无此项（模式开关/布尔开关/动作按钮等 reset≠回落主题 的键不声明）。 */
  resetsToTheme?: boolean;
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
const _configKeyOwner = new Map<string, string>();                      // configKey → pluginId（冲突检测）

/** 注册插件的配置贡献——loader 在 parseContributions 阶段调用。
 *  E5.8#10 返 disposer：删"本次 contribution 的属性" + 该批 _configKeyOwner——
 *  merge 语义对称（同插件多次注册合并进同一对象）：合并后空 → 删整个插件条目，
 *  最后一次注册的 disposer 负责收尾；异插件同 key 冲突时 _configKeyOwner 归后注册者，
 *  dispose 只在仍归本插件时摘（防删他人所有权）。 */
export function registerConfiguration(
  pluginId: string,
  contribution: ConfigurationContribution
): () => void {
  // E2c #13 16.2：检测重复 key → console.warn（暂不抛硬错误——parseContributions 没有 try/catch，
  // 抛错会导致整个插件加载失败。待 E2c #19b 审计后改 fail-fast。）
  for (const key of Object.keys(contribution.properties)) {
    const owner = _configKeyOwner.get(key);
    if (owner && owner !== pluginId) {
      console.warn(
        `[ConfigurationRegistry] 配置项 "${key}" 已由插件 "${owner}" 注册，` +
        `插件 "${pluginId}" 重复声明。修改 plugin.json 中 contributes.configuration 的 key 名。`
      );
    }
    _configKeyOwner.set(key, pluginId);
  }
  // E2c #19g：merge 语义——同一个 pluginId 多次注册时合并属性（如 contributes.configuration + 自动注册的 statusBar 配置）
  const existing = _contributions.get(pluginId);
  if (existing) {
    Object.assign(existing.properties, contribution.properties);
  } else {
    _contributions.set(pluginId, contribution);
  }

  return trackRegistration(pluginId, () => {
    const current = _contributions.get(pluginId);
    if (!current) return;
    for (const key of Object.keys(contribution.properties)) {
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
      // E2c #13 16.2：重复 key——运行时 warn，待 #19b 审计后改 fail-fast
      if (merged[key]) {
        const owner = _configKeyOwner.get(key);
        console.warn(`[ConfigurationRegistry] 配置项 "${key}" 重复` +
          (owner ? `——先注册插件 "${owner}"，后注册覆盖` : "——后注册覆盖先注册"));
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

/** 注册弱默认值——插件建议其他配置项的值，但用户手动设置优先。
 *  E5.8#10 返 disposer：删本插件条目。 */
export function registerConfigurationDefaults(
  pluginId: string,
  defaults: Record<string, unknown>
): () => void {
  _configurationDefaults.set(pluginId, defaults);
  return trackRegistration(pluginId, () => {
    _configurationDefaults.delete(pluginId);
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
