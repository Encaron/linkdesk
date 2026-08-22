/**
 * ConfigurationApplier — 配置→应用归一化管道。
 * Phase 5f：修掉"持久化到处拉屎"的根因（B55/B63/B64）。
 *
 * 设计：docs/phase5_应用基础设施/V3-Phase5f-ConfigurationApplier-设计.md
 * VS Code 对标：VS Code 走分布式（每个消费者自己订阅 onDidChangeConfiguration），
 *   但 V3（React）没有 DI 容器 + Disposable 模式，分布式会导致 useEffect 时序竞态。
 *   因此走集中式——配置注册时声明 onApply，框架保证调用时机。
 *
 * 两层 onApply：
 *   1. Schema 级——registerConfiguration 的 ConfigurationProperty.onApply（壳级配置）
 *   2. Plugin 级——registerOnApply()（插件代码注册，弥补 plugin.json 不能存函数）
 */

import { getMergedSchema } from "../../registry/ConfigurationRegistry";
import { getConfigurationValue, registerConfigApplier } from "./ConfigurationService";

// E5#41：注册 applyConfiguration 回调——消解 ConfigurationService → ConfigurationApplier 循环 import
registerConfigApplier(applyConfiguration);

/* ── 插件级 onApply 注册表 ── */

/**
 * 插件代码注册的 onApply 回调——弥补 plugin.json（JSON）不能存函数的限制。
 *
 * 用法（插件 React 组件内）：
 * ```ts
 * useEffect(() => {
 *   const dispose = registerOnApply("myPlugin.baudRate", (v) => {
 *     invoke("set_baud_rate", { rate: v });
 *   });
 *   return dispose;  // unmount 时自动注销
 * }, []);
 * ```
 *
 * 行为：
 *   1. 注册时立即调一次 callback(currentValue)——插件后加载，init 已完成，需要初始值
 *   2. 每次 setConfigurationValue 自动调 callback(newValue)
 *   3. 返回 dispose 函数，插件 unmount 时调用注销
 *   4. 同一 key 可注册多个 callback（不同插件可监听同一配置项）
 *
 * 对标 VS Code：onDidChangeConfiguration 订阅模式——每个消费者独立订阅
 */
export function registerOnApply(
  key: string,
  callback: (value: unknown) => void | Promise<void>
): () => void {
  const cbs = _pluginOnApply.get(key) ?? [];
  cbs.push(callback);
  _pluginOnApply.set(key, cbs);

  // 立即 apply 当前值（对标 VS Code 订阅时收到当前值）
  const currentValue = getConfigurationValue(key);
  if (currentValue !== undefined) {
    try {
      const result = callback(currentValue);
      if (result instanceof Promise) {
        result.catch(e =>
          console.warn(`[ConfigurationApplier] ${key} 插件 onApply 初始调用失败:`, e)
        );
      }
    } catch (e) {
      console.warn(`[ConfigurationApplier] ${key} 插件 onApply 初始调用失败:`, e);
    }
  }

  return () => {
    const updated = (_pluginOnApply.get(key) ?? []).filter(c => c !== callback);
    if (updated.length > 0) {
      _pluginOnApply.set(key, updated);
    } else {
      _pluginOnApply.delete(key);
    }
  };
}

/** 插件代码注册的 onApply 回调表。同一 key 支持多个 callback。 */
const _pluginOnApply = new Map<string, ((value: unknown) => void | Promise<void>)[]>();

/* ── 框架内部（壳调用，不对外） ── */

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
 * 先调 Schema 级 onApply（壳），再调 Plugin 级 onApply（插件），保证壳优先。
 */
export async function applyConfiguration(key: string, value: unknown): Promise<void> {
  // 1. Schema 定义的 onApply（壳级——registerConfiguration 声明）
  const schema = getMergedSchema();
  const prop = schema[key];
  if (prop?.onApply) {
    try {
      await prop.onApply(value);
    } catch (e) {
      console.warn(`[ConfigurationApplier] ${key} onApply 失败:`, e);
    }
  }

  // 2. 插件注册的 onApply（plugin.json 声明配置，插件代码注册回调）
  const cbs = _pluginOnApply.get(key);
  if (cbs) {
    for (const cb of cbs) {
      try {
        await cb(value);
      } catch (e) {
        console.warn(`[ConfigurationApplier] ${key} 插件 onApply 失败:`, e);
      }
    }
  }
}
