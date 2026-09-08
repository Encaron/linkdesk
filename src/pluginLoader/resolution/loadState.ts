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
 * E5.8#15：依赖消失连带卸载——卸载/禁用/目录删除三途径同走 unloadPlugin（唯一卸载路径），
 *   unloadPlugin 先连带卸载消费方（orphanPlugin，逆拓扑序），再退自身：
 *   - orphanPlugin = 消费插件 rollback 全量生效 + 落 PENDING（等待依赖回归，非卸载）——
 *     与 unloadPlugin 同序（unloading → notifyPluginRemoved → onWillUninstall[tracker 回滚] →
 *     集合清理），但落点 = pending + pendingReason + _pendingPlugins，且不发 onDidUninstall；
 *   - 逆拓扑序：消费方先退（回滚期可能查询依赖注册表贡献）、依赖后退；
 *   - 卸载迁移图加 unloading → pending——连带卸载落点（合法迁移，非错误路径）。
 *
 * 🔥 L6b 机械保障：生命周期事件只在合法状态迁移上发（unloadPlugin 是唯一卸载路径），
 *   顺序由迁移图定义——事件三次静默跳过（revert 在 theme 注销后 / toast 在 viewRegistry
 *   注销后 / marketplace 刷新在文件移动前）的根治方案。
 *   非法迁移 console.warn 不 throw——状态机是诊断面不是看门狗，禁止把加载流程带崩。
 */

import { PluginLifecycle, notifyPluginRemoved, onPluginLifecycleChange } from "../lifecycle/lifecycle";
import type { PluginUninstallEvent } from "../lifecycle/lifecycle-events";
import { loadedPluginIds, _pendingPlugins, getLoadedManifest } from "./state";
import { registrationCount } from "../../core/registry/registrationTracker";
import { findActiveConsumers, formatPendingReason } from "./dependencies";
// E5.8#15.5：连带挂起后果 toast（对标 lifecycle 消费端 3 的 pushToast 机制——用户主动卸载依赖时知道后果）
import { pushToast, TOAST_TTL_ERROR } from "../../core/services/ui/NotificationService";

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
  unloading: ["disposed", "pending"],  // E5.8#15：连带卸载落点（orphanPlugin）——卸载完成可改挂起等依赖
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

/* ── E5.8#15：依赖消失连带卸载——逆拓扑序 + 落 PENDING（消费方先退，依赖后退） ── */

/** 连带卸载结果——顶层 unloadPlugin 聚合 toast 用（E5.8#15.5：一次连带一次后果通知） */
interface OrphanResult {
  pluginId: string;
  /** 显示名（连带前从 getLoadedManifest 取——落 PENDING 后清单已移） */
  displayName: string;
}

/**
 * 连带卸载消费方（逆拓扑序）——卸载/禁用/目录删除任一途径触发时，先连带卸载依赖本插件的活跃插件。
 * 递归收敛：orphanPlugin 先连带卸载它自己的消费方（深层消费方先退），再退自身。
 * 幂等：orphanPlugin 守卫跳过已 pending/unloading/disposed 的插件——双重连带不双滚。
 * 返回本次连带实际卸载的插件（含深层）——聚合后果 toast（空 = 无连带，静默）。
 */
function cascadeDependents(depId: string): OrphanResult[] {
  const consumers = findActiveConsumers(depId); // 快照——连带卸载会改 loadedPluginIds
  const orphans: OrphanResult[] = [];
  for (const consumer of consumers) {
    orphans.push(...orphanPlugin(consumer, [depId]));
  }
  return orphans;
}

/**
 * 依赖消失连带卸载——消费插件 rollback 全量生效 + 落 PENDING（等待依赖回归，非卸载）。
 * 与 unloadPlugin 同序（unloading → notifyPluginRemoved → onWillUninstall[tracker 回滚] → 集合清理），
 * 但落点 = pending + pendingReason + _pendingPlugins（依赖回归 sweep 自动补载），且不发 onDidUninstall
 * （非用户卸载——静默；后果 toast 归 #15.5 顶层 unloadPlugin 聚合）。onWillUninstall reason = "disable"——
 * iconOrder 保留原位（可回归）。
 * 逆拓扑序：先连带卸载本插件的消费方，再退自身——消费方回滚期可能查询本插件注册表贡献，本插件须最后退。
 * 守卫跳过 unloading/disposed/pending——双重连带不双滚（pending = 已连带过或从未加载），返回 []。
 * 返回 [自身 + 深层连带]——顶层聚合；同时 fire onPluginLifecycleChange（E5.8#15.5：挂起后 marketplace
 * 列表即时变——连带不发 onDidUninstall，池刷新信号由这里补发）。
 */
export function orphanPlugin(pluginId: string, missing: string[]): OrphanResult[] {
  const current = _states.get(pluginId)?.state ?? "pending";
  if (current === "unloading" || current === "disposed" || current === "pending") {
    console.warn(`[loadState] 连带卸载 "${pluginId}" 跳过（当前 ${current}）`);
    return [];
  }
  const manifest = getLoadedManifest(pluginId);
  const displayName = manifest?.name ?? pluginId;
  const nested = cascadeDependents(pluginId);
  transition(pluginId, "unloading");
  notifyPluginRemoved(pluginId);
  PluginLifecycle.onWillUninstall.fire({ pluginId, reason: "disable", displayName });
  loadedPluginIds.delete(pluginId);
  if (manifest) _pendingPlugins.set(pluginId, manifest); // sweep 重查依赖需要 manifest 留存
  parkPending(pluginId, formatPendingReason(missing));
  console.warn(`[loadState] 插件 "${pluginId}" 依赖消失连带卸载——${formatPendingReason(missing)}`);
  onPluginLifecycleChange.fire(); // 池刷新——marketplace 列表即时反映 PENDING（#15.5）
  return [{ pluginId, displayName }, ...nested];
}

/**
 * 卸载插件全过程——L6b 顺序机械保障（唯一卸载路径，3 生产流共用：disable/uninstall/watcher）。
 * 顺序（迁移图定）：unloading → notifyPluginRemoved → onWillUninstall.fire（tracker 逆序回滚在
 * 其内同步完成）→ 集合清理 → disposed → onDidUninstall.fire。
 * 🔥 notifyPluginRemoved 必须先于 fire——App/lifecycle.ts revertContainerIfCurrent 读
 * viewRegistry 的 manifest，tracker 回滚后 viewRegistry 条目已删。
 * 重复卸载（已在 unloading/disposed）→ console.warn + 跳过（幂等）。
 * E5.8#15：依赖消失连带卸载钩子——先连带卸载消费方（逆拓扑序：消费方回滚期可能查询本插件
 * 注册表贡献，本插件须最后退），再退自身；顺带清本插件的挂起登记（挂起后被正式卸载 = 清场）。
 */
export function unloadPlugin(
  pluginId: string,
  reason: PluginUninstallEvent["reason"],
  displayName?: string,
  restorable?: boolean,
): void {
  const entry = _states.get(pluginId);
  const current = entry?.state ?? "pending";
  if (current === "unloading" || current === "disposed") {
    console.warn(`[loadState] 重复卸载 "${pluginId}"（当前 ${current}）——跳过`);
    return;
  }
  const orphans = cascadeDependents(pluginId);
  _pendingPlugins.delete(pluginId);
  transition(pluginId, "unloading");
  // E6#15：bundle css <link> 移除归 pool PluginComponent 引用计数（视图挂载文档）——shell 侧无视图不处理
  notifyPluginRemoved(pluginId);
  PluginLifecycle.onWillUninstall.fire({ pluginId, reason, displayName, restorable });
  loadedPluginIds.delete(pluginId);
  transition(pluginId, "disposed");
  PluginLifecycle.onDidUninstall.fire({ pluginId, reason, displayName, restorable });
  // E5.8#15.5：连带后果 toast——一次连带一次通知（有连带才弹）。用户主动卸载/禁用依赖时知道
  // 哪些消费插件转入等待；目录删除（watcher）无既有 toast，此通知独立承担告知。依赖恢复后 sweep 自动补载。
  if (orphans.length > 0) {
    const names = orphans.map((o) => `"${o.displayName}"`).join("、");
    const depLabel = displayName ?? pluginId;
    pushToast({
      message: `插件 ${names} 因依赖 "${depLabel}" 消失转入等待——依赖恢复后自动启用`,
      source: pluginId,
      severity: "warning",
      ttl: TOAST_TTL_ERROR,
    });
  }
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
