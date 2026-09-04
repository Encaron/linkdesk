/**
 * 配置服务——ConfigurationApplier 注册表属主（E5.8#0.4a 拆 ConfigurationService/ feature-folder）。
 * 单域属主：_configApplier 归本文件——E5#41 消循环依赖（applyConfiguration 经注册注入，
 * 不直接 import ConfigurationApplier）。写路径/reload 广播唯一调用口 = runConfigApplier。
 *
 * 分层依赖（单向无环）：叶子（零内部依赖）→ 被 settings-io 消费。
 */

// E5#41：消循环依赖——applyConfiguration 通过注册模式注入，不再直接 import ConfigurationApplier
let _configApplier: ((key: string, value: unknown) => void) | null = null;
export function registerConfigApplier(fn: typeof _configApplier): void { _configApplier = fn; }

/** 触发已注册 applier——siblings 唯一调用口（防跨文件裸触 _configApplier） */
export function runConfigApplier(key: string, value: unknown): void {
  _configApplier?.(key, value);
}
