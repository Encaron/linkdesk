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

/** 注销插件的配置贡献——卸载时调用 */
export function unregisterConfiguration(pluginId: string): boolean {
  // 清理 configKey → owner 映射
  const contrib = _contributions.get(pluginId);
  if (contrib) {
    for (const key of Object.keys(contrib.properties)) {
      if (_configKeyOwner.get(key) === pluginId) {
        _configKeyOwner.delete(key);
      }
    }
  }
  return _contributions.delete(pluginId);
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

/** 注销弱默认值 */
export function unregisterConfigurationDefaults(pluginId: string): boolean {
  return _configurationDefaults.delete(pluginId);
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
