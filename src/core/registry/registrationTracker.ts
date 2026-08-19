/**
 * 可逆注册追踪器——一切注册返回 disposer，卸载逆序回滚（E5.8#9）。
 *
 * 🔥 为什么是模块级而非类：11 核心注册表中 7 个是模块函数式注册表
 *   （Command/Keybinding/Menu/Configuration/LangDef/Protocol…——module state + 自由函数），
 *   类形态的 RegistryBase 够不着它们。v2 抽本追踪器——类注册表（RegistryBase.track）
 *   与函数注册表（trackRegistration 直接调）共用同一套 LIFO 逆序回滚。
 *
 * 对标 dsh `ctx.effect`：execute 立即跑（disposer 登记即注册），卸载逆序跑。
 * 触发器 = PluginLifecycle.onWillUninstall（Emitter.event，本模块加载时订阅一次）——
 * 任何注册过 disposer 的插件卸载/禁用自动逆序回滚，机械保证。
 *
 * 回滚中断容错（#9 验收）：单 disposer 抛错不中断后续回滚，错误入诊断面（ErrorService）。
 *
 * @see [[reversible-registration-decision]]（决策记录）
 * @see docs/02-Electron架构/E5.8_归一化基建/可逆注册/02-可逆注册设计.md §1
 */

import { PluginLifecycle } from "../../pluginLoader/lifecycle-events";
import { reportError } from "../services/bootstrap/ErrorService";

/** pluginId → LIFO disposer 栈（后注册的排后面 → 回滚时先滚） */
const _layers = new Map<string, Array<() => void>>();

// 模块加载时订阅一次——任何有登记的插件卸载/禁用自动逆序回滚
PluginLifecycle.onWillUninstall.event(({ pluginId }) => {
  rollback(pluginId);
});

/**
 * 登记一个 disposer——返回可单独调用的幂等 disposer。
 *
 * - 注册方：register() 内部把条目入表后调此函数登记"删这一条"的 disposer；
 * - 返回值 = 包装后的 run 函数：done 守卫保证幂等（手动 dispose + rollback 双跑不双清）；
 * - 卸载/禁用时 PluginLifecycle 自动触发 rollback，无需调用方保存返回值。
 */
export function trackRegistration(pluginId: string, disposer: () => void): () => void {
  const layer = _layers.get(pluginId) ?? [];
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    try {
      disposer();
    } catch (err) {
      reportError({
        message: `[registrationTracker] 回滚失败（${pluginId}）: ${err instanceof Error ? err.message : String(err)}`,
        source: "registrationTracker",
        error: err,
      });
      // 不中断——后续 disposer 继续逆序回滚
    }
  };
  layer.push(run);
  _layers.set(pluginId, layer);
  return run;
}

/**
 * 逆序回滚一个插件的全部登记（LIFO——后注册的先滚）。
 *
 * - 先删层再跑——幂等：重复 rollback / rollback 后手动 dispose 均为 no-op；
 * - 逐条经 run 包装执行——单条抛错不中断后续，错误入诊断面；
 * - 主动清理（测试/非卸载场景）也用此函数。
 */
export function rollback(pluginId: string): void {
  const layer = _layers.get(pluginId);
  if (!layer) return;
  _layers.delete(pluginId);
  for (let i = layer.length - 1; i >= 0; i--) {
    layer[i]();
  }
}

/** 插件在此追踪器是否有登记项（原 RegistryBase.hasPlugin 归并） */
export function hasRegistrations(pluginId: string): boolean {
  return _layers.has(pluginId);
}

/** 测试用——清空全部登记（不执行 disposer） */
export function clearRegistrationLayers(): void {
  _layers.clear();
}
