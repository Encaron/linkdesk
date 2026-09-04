/**
 * 配置服务——三层合并读属主（E5.8#0.4a 拆 ConfigurationService/ feature-folder）。
 * 纯读域：getConfigurationValue / hasConfigurationValue / inspectConfiguration + enum 验证 + 系统兜底。
 * 无 mutable 状态——缓存读经 cache.ts accessor（live ref 只读不写）；enum/schema 读 ConfigurationRegistry。
 *
 * 分层依赖（单向无环）：cache（叶子）→ value-access（读层）→ settings-io（写层——复位/批量取回退值
 * 消费本层 getConfigurationValue，不反向）。
 */

import {
  getMergedSchema,
  getConfigurationDefaults,
  type InspectResult,
} from "../../../registry/ConfigurationRegistry";
import { getUserCache, getWorkspaceCache } from "./cache";

/* ── 读取：三层合并 ── */

/**
 * 获取配置值——自动 Workspace > User > configurationDefaults > Default 合并。
 * VS Code 对标：IConfigurationService.getValue<T>(key)
 */
export function getConfigurationValue<T>(key: string): T {
  // 1. Workspace scope（最高优先级）
  if (key in getWorkspaceCache()) {
    const v = _validateEnum(key, getWorkspaceCache()[key], "workspace");
    if (v !== undefined) return v as T;
  }

  // 2. User scope
  if (key in getUserCache()) {
    const v = _validateEnum(key, getUserCache()[key], "user");
    if (v !== undefined) return v as T;
  }

  // 3. configurationDefaults（盲区 2：弱默认值——插件建议但用户可覆盖）
  const configDefaults = getConfigurationDefaults();
  if (key in configDefaults) {
    return configDefaults[key] as T;
  }

  // 4. 插件 default（plugin.json 声明的）
  const schema = getMergedSchema();
  if (schema[key]) {
    return schema[key].default as T;
  }

  // 5. 系统 fallback（硬编码兜底）
  return getSystemFallback<T>(key);
}

/**
 * E5.8#56：判断配置是否被显式写过（presence 语义）——User/Workspace scope 存在该 key 即真。
 * 与 getConfigurationValue（合并 default 层）不同：default 值 ≠「用户写过」。
 * 消费场景：getAppearanceOverrides 玻璃 neutral 门控——glassBlur 拖到 0（关闭）/ glassOpacity 拖到 1（不透明）
 * 是用户显式意图，presence 覆盖端点值；reset 摘除 key 后回主题基线。对标 VS Code inspect().userValue。
 */
export function hasConfigurationValue(key: string): boolean {
  return key in getUserCache() || key in getWorkspaceCache();
}

/**
 * 检查某个 key 的完整来源——对标 VS Code IConfigurationService.inspect<T>()。
 * 返回每一层的值，让 Settings Editor 可以显示"Workspace 覆盖了 User"。
 */
export function inspectConfiguration<T>(key: string): InspectResult<T> {
  const schema = getMergedSchema();
  const prop = schema[key];

  return {
    key,
    defaultValue: (prop?.default ?? getSystemFallback(key)) as T,
    userValue: key in getUserCache() ? (getUserCache()[key] as T) : undefined,
    workspaceValue: key in getWorkspaceCache() ? (getWorkspaceCache()[key] as T) : undefined,
    effectiveValue: getConfigurationValue<T>(key),
  };
}

/* ── M3：enum 验证 —— */

/** 验证 enum 值——无效时 warn + 返回 undefined，调用方 fallthrough 到默认值。不删缓存——enum 可能瞬态为空（插件重载）。 */
function _validateEnum(key: string, value: unknown, _scope: "user" | "workspace"): unknown {
  const schema = getMergedSchema();
  const prop = schema[key];
  if (!prop?.enum) return value;
  if (prop.enum.includes(value as string)) return value;

  console.warn(`[ConfigurationService] "${key}: ${value}" 不在 enum [${prop.enum}] 中——本次回退到默认值`);
  return undefined;
}

/* ── 系统兜底 ── */

/**
 * 硬编码的系统 fallback 值——对标 VS Code defaultThemeColors。
 * 当所有层都没有值时，这些值保证 UI 不崩。
 */
function getSystemFallback<T>(key: string): T {
  const fallbacks: Record<string, unknown> = {
    // E5.8#50.21：系统兜底 = 壳内置配方 id "dark"（legacy "Dark" 已随迁移归一化落盘）
    "app.theme": "dark",
    "app.language": "zh",
  };
  return (fallbacks[key] ?? undefined) as T;
}
