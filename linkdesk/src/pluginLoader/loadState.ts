/**
 * loader 生命周期状态机——加载/卸载全过程状态追踪 + 失败原因诊断（E5.8#11）。
 *
 * 状态图（设计文档 §3.1）：
 *   PENDING ──loadPlugin──▶ LOADING ──注册全量生效──▶ ACTIVE
 *      ▲                      │                        │ 卸载/禁用
 *      │                      ▼ 加载抛错                ▼
 *      └────────── FAILED ◀──记录 failureReason      UNLOADING
 *      （重试回 LOADING）                              │ rollback 完成
 *                                                     ▼
 *                                                   DISPOSED
 *
 * 三方状态边界（设计文档 §3.2）：
 *   - LoadState（本状态机）      ——"插件为什么没激活"诊断面；
 *   - CachedPluginMeta.status    ——安装态（installed/disabled/uninstalled），marketplace 消费，
 *                                   不进本状态机——disabled 插件停在 PENDING；
 *   - PluginStateService         ——插件私有存储，非状态，无映射。
 *
 * E5.8#14：pendingReason——缺依赖挂起的可读原因（设计支柱 3「依赖未就绪 → PENDING 挂起」）。
 *   - parkPending：loading → pending（迁移图 + 记录原因）；已 pending 只更新原因；
 *   - 语义：pending + pendingReason = "已尝试加载但依赖未就绪，等待中"（≠ 默认态"未加载"），
 *     诊断面/#15.5 marketplace 据此显示 "等待依赖: xxx"；
 *   - 重新加载（markLoadStarted）/ 卸载 / 失败 → pendingReason 自动清。
 *
 * 🔥 L6b 机械保障：生命周期事件只在合法状态迁移上发（unloadPlugin 是唯一卸载路径），
 *   顺序由迁移图定义——事件三次静默跳过（revert 在 theme 注销后 / toast 在 viewRegistry
 *   注销后 / marketplace 刷新在文件移动前）的根治方案。
 *   非法迁移 console.warn 不 throw——状态机是诊断面不是看门狗，禁止把加载流程带崩。
 */

import { PluginLifecycle, notifyPluginRemoved } from "./lifecycle";
import type { PluginUninstallEvent } from "./lifecycle-events";
import { loadedPluginIds, _deferredPlugins } from "./state";
import { registrationCount } from "../core/registry/registrationTracker";

/** 加载状态——三方边界之"LoadState"，见模块头注释。
 *  不 export——零外部消费方（knip 实锤）；消费方（dev 面板等）出现时再开。 */
type LoadState =
  | "pending"    // 未开始加载（含 disabled 插件——设计 §3.2：停在 PENDING 不进状态机）
  | "loading"    // loadPlugin 运行中
  | "active"     // 注册全量生效，可消费
  | "unloading"  // 卸载/禁用中——rollback 执行区间
  | "disposed"   // rollback 完成，登记清空
  | "failed";    // 加载失败——failureReason 可查

/** 合法迁移图——非法迁移 console.warn（诊断面，不 throw）。
 * 卸载侧收敛：pending/loading/failed → unloading 一律允许——卸载必须总能完成到 DISPOSED
 * （加载中卸载 = 竞态收敛；失败态/未加载态卸载 = 诚实清场），防止插件卡在中间态。
 * 加载侧严格：active→loading（双重加载）等非法迁移 warn 不生效——抓真 bug。
 * E5.8#14：loading → pending——缺依赖挂起（parkPending），对齐设计支柱 3「依赖未就绪 → PENDING」。 */
const ALLOWED: Record<LoadState, LoadState[]> = {
  pending:   ["loading", "unloading"],
  loading:   ["active", "failed", "unloading", "pending"],
  active:    ["unloading"],
  unloading: ["disposed"],
  disposed:  ["loading"],   // 重装/启用
  failed:    ["loading", "unloading"],  // 重试 / 失败态卸载
};

interface LoadStateEntry {
  state: LoadState;
  /** 加载失败原因——LOADING→FAILED 时记录，重试/恢复清空 */
  failureReason?: string;
  /** 挂起原因——缺依赖等待中（E5.8#14）。pending 态可读诊断；加载/卸载/失败自动清。 */
  pendingReason?: string;
}

/** pluginId → 状态条目（查无此键 = PENDING——Map 只存有历史的，不预填全量） */
const _states = new Map<string, LoadStateEntry>();

/** 状态迁移——非法迁移 console.warn 不 throw（状态机是诊断面，禁止带崩加载流程）。
 * pendingReason 规则（E5.8#14）：加载/卸载/失败 → 清空（不再等待）；否则透传或按参设置。 */
function transition(pluginId: string, next: LoadState, failureReason?: string, pendingReason?: string): void {
  const entry = _states.get(pluginId);
  const current = entry?.state ?? "pending";
  if (!ALLOWED[current]?.includes(next)) {
    console.warn(`[loadState] 非法状态迁移 "${pluginId}": ${current} → ${next}`);
    return;
  }
  const clearsPending = next === "loading" || next === "unloading" || next === "disposed" || next === "failed";
  _states.set(pluginId, {
    state: next,
    failureReason: failureReason ?? undefined,
    pendingReason: clearsPending ? undefined : (pendingReason ?? entry?.pendingReason),
  });
}

/** 加载开始——loadPlugin IIFE 入口处调用（PENDING/DISPOSED/FAILED → LOADING），清 failureReason */
export function markLoadStarted(pluginId: string): void {
  transition(pluginId, "loading");
}

/** 加载成功——注册全量生效（applyPostLoadSteps 末尾，LOADING → ACTIVE） */
export function markLoadSuccess(pluginId: string): void {
  transition(pluginId, "active");
}

/** 加载失败——记录原因供诊断（LOADING → FAILED）；重试 markLoadStarted 自动清原因 */
export function markLoadFailed(pluginId: string, reason: string): void {
  transition(pluginId, "failed", reason);
}

/** 缺依赖挂起（E5.8#14）——LOADING → PENDING + 记录挂起原因（设计支柱 3：依赖未就绪 → PENDING）。
 *  已 pending 时只更新原因（避免 pending→pending 非法迁移告警）；其他状态防御性不生效。 */
export function parkPending(pluginId: string, reason: string): void {
  const entry = _states.get(pluginId);
  if ((entry?.state ?? "pending") === "pending") {
    _states.set(pluginId, { state: "pending", failureReason: undefined, pendingReason: reason });
    return;
  }
  transition(pluginId, "pending", undefined, reason);
}

/**
 * 卸载插件全过程——L6b 顺序机械保障（唯一卸载路径，3 生产流共用：disable/uninstall/watcher）。
 * 顺序（迁移图定）：unloading → notifyPluginRemoved → onWillUninstall.fire（tracker 逆序回滚在
 * 其内同步完成）→ 集合清理 → disposed → onDidUninstall.fire。
 * 🔥 notifyPluginRemoved 必须先于 fire——App/lifecycle.ts revertContainerIfCurrent 读
 * viewRegistry 的 manifest，tracker 回滚后 viewRegistry 条目已删。
 * 重复卸载（已在 unloading/disposed）→ console.warn + 跳过（幂等）。
 */
export function unloadPlugin(
  pluginId: string,
  reason: PluginUninstallEvent["reason"],
  displayName?: string,
): void {
  const entry = _states.get(pluginId);
  const current = entry?.state ?? "pending";
  if (current === "unloading" || current === "disposed") {
    console.warn(`[loadState] 重复卸载 "${pluginId}"（当前 ${current}）——跳过`);
    return;
  }
  transition(pluginId, "unloading");
  notifyPluginRemoved(pluginId);
  PluginLifecycle.onWillUninstall.fire({ pluginId, reason, displayName });
  loadedPluginIds.delete(pluginId);
  _deferredPlugins.delete(pluginId);
  transition(pluginId, "disposed");
  PluginLifecycle.onDidUninstall.fire({ pluginId, reason, displayName });
}

/** 诊断面载荷——设计文档 §3.3 */
export interface LoadDiagnostics {
  loadState: LoadState;
  failureReason?: string;
  /** 挂起原因——缺依赖等待中（E5.8#14）。pending 态才有；marketplace/#15.5 展示 "等待依赖: xxx" */
  pendingReason?: string;
  registeredEffects: number;
}

/** 诊断面——"插件为什么没激活"（设计文档 §3.3） */
export function getLoadDiagnostics(pluginId: string): LoadDiagnostics {
  const entry = _states.get(pluginId);
  return {
    loadState: entry?.state ?? "pending",
    failureReason: entry?.failureReason,
    pendingReason: entry?.pendingReason,
    registeredEffects: registrationCount(pluginId),
  };
}

/** 全量诊断摘要——启动收尾打日志（诊断面，UI 零变化） */
export function getLoadDiagnosticsSummary(): Array<{ pluginId: string } & LoadDiagnostics> {
  return [..._states.keys()].map((pluginId) => ({
    pluginId,
    ...getLoadDiagnostics(pluginId),
  }));
}

/** 测试用——清空状态机 */
export function clearLoadStates(): void {
  _states.clear();
}
