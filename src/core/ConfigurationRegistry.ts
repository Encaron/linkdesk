/**
 * 配置注册表——对标 VS Code ConfigurationRegistry。
 * Phase 5 柱子 2：插件声明 contributes.configuration → Settings Editor 自动渲染。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子2 + §柱子6.3
 * VS Code 对标：IConfigurationRegistry.registerConfiguration / IConfigurationService
 * VS Code 源码：src/vs/platform/configuration/common/configurationRegistry.ts
 */

/* ── 类型 ── */

export type ConfigurationType = "string" | "number" | "boolean";

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

/** 注册插件的配置贡献——loader 在 parseContributions 阶段调用 */
export function registerConfiguration(
  pluginId: string,
  contribution: ConfigurationContribution
): void {
  _contributions.set(pluginId, contribution);
}

/** 注销插件的配置贡献——卸载时调用 */
export function unregisterConfiguration(pluginId: string): boolean {
  return _contributions.delete(pluginId);
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
      if (merged[key]) {
        console.warn(`[ConfigurationRegistry] 配置项 "${key}" 重复——后注册覆盖先注册`);
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

/** 注册弱默认值——插件建议其他配置项的值，但用户手动设置优先 */
export function registerConfigurationDefaults(
  pluginId: string,
  defaults: Record<string, unknown>
): void {
  _configurationDefaults.set(pluginId, defaults);
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
  _configurationDefaults.clear();
}
