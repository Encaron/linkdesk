/**
 * ConfigurationApplier — 配置→应用归一化管道。
 * Phase 5f：修掉"持久化到处拉屎"的根因（B55/B63/B64）。
 *
 * 设计：docs/phase5_应用基础设施/V3-Phase5f-ConfigurationApplier-设计.md
 * VS Code 对标：VS Code 走分布式（每个消费者自己订阅 onDidChangeConfiguration），
 *   但 V3（React）没有 DI 容器 + Disposable 模式，分布式会导致 useEffect 时序竞态。
 *   因此走集中式——配置注册时声明 onApply，框架保证调用时机。
 */

import { getMergedSchema } from "./ConfigurationRegistry";
import { getConfigurationValue } from "./ConfigurationService";

/**
 * init 完成后调用一次——按注册顺序遍历所有配置，对有 onApply 的执行 apply。
 * onApply 可以是 async——按序 await 保证 theme 在 accent 之前完成。
 */
export async function applyAllConfigurations(): Promise<void> {
  const schema = getMergedSchema();
  for (const [key, prop] of Object.entries(schema)) {
    if (prop.onApply) {
      const value = getConfigurationValue(key);
      try {
        await prop.onApply(value);
      } catch (e) {
        console.warn(`[ConfigurationApplier] ${key} onApply 失败:`, e);
      }
    }
  }
}

/**
 * 单个配置变更时调用——setConfigurationValue 内部自动触发。
 * 无需组件手动订阅 onDidChangeConfiguration 来做 apply。
 */
export async function applyConfiguration(key: string, value: unknown): Promise<void> {
  const schema = getMergedSchema();
  const prop = schema[key];
  if (prop?.onApply) {
    try {
      await prop.onApply(value);
    } catch (e) {
      console.warn(`[ConfigurationApplier] ${key} onApply 失败:`, e);
    }
  }
}
