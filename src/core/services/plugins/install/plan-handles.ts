/**
 * 确认计划句柄表——**`prepareInstall` 的产物，`commitInstall` 的凭据**（D1′ 两步 API）。
 *
 * 为什么需要一层句柄：UI 归市场之后，"算计划"与"执行"必须能被市场拆成两跳
 * （市场自己画完卡、用户点了确认，才来 commit）。句柄把「壳算过什么」固化下来：
 *   · `planId` 一次性、短 TTL（默认 5 分钟）——⛔ 不落盘、⛔ 不跨进程，重启即全部失效；
 *   · 绑定项 = 请求指纹（pluginId+version+downloadUrl+sha256），commit 时逐字段比对，
 *     防「拿着 A 的票装 B」（与 token 同口径，但 token 在 commit 时才签）。
 *
 * 诚实边界：句柄表在壳渲染进程内存里，同一进程内的代码理论上能绕过——它防的是"漏一步"，
 * 不是密码学对抗（那在 P2 权限系统 / 主进程校验）。真正的执行门仍是 token（download 前核销）。
 */

import type { PluginConfirmPlan, PluginInstallRequest } from "../../../api/linkdesk-api/types";

/** 句柄有效期——够用户读完卡再点，又不会让旧计划活到"情况已变" */
export const PLAN_HANDLE_TTL_MS = 5 * 60_000;

/** 单次 prepare 的产物 */
export interface PlanHandle {
  planId: string;
  /** 这一跳是单项还是批量（commit 的执行形态据此分流） */
  kind: "install" | "batch";
  /** 本次全部原始请求（commit 时按它们重新签 token＋执行；批量含 silent 项） */
  requests: PluginInstallRequest[];
  /** 壳算出的计划（市场照它画，⛔ 不许自造） */
  plan: PluginConfirmPlan;
  expiresAt: number;
}

const _handles = new Map<string, PlanHandle>();
let _seq = 0;

function mintPlanId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `plan-${uuid}`;
  return `plan-${Date.now().toString(36)}-${++_seq}`;
}

/** 清过期句柄（`put`/`take` 时自动调——表不会长命也不会无限涨） */
export function prunePlanHandles(now: number = Date.now()): void {
  for (const [id, h] of _handles) {
    if (h.expiresAt <= now) _handles.delete(id);
  }
}

/** 登记一次计划（唯一签发处——只在 `prepareInstall` 内调） */
export function putPlanHandle(
  kind: "install" | "batch",
  requests: PluginInstallRequest[],
  plan: PluginConfirmPlan,
  now: number = Date.now(),
): PlanHandle {
  prunePlanHandles(now);
  const handle: PlanHandle = { planId: mintPlanId(), kind, requests, plan, expiresAt: now + PLAN_HANDLE_TTL_MS };
  _handles.set(handle.planId, handle);
  return handle;
}

/** 查询（不消耗）——`commit` 前先看是否过期 */
export function getPlanHandle(planId: string): PlanHandle | undefined {
  return _handles.get(planId);
}

/**
 * 取用并核销（一次性）——`commitInstall` 专用。
 * 返回 `undefined` = 不存在/已用过/已过期（调用方统一回 `unknown-plan`，⛔ 不区分是哪一种，
 * 免得调用方拿它当"再来一次"的信号）。
 */
export function takePlanHandle(planId: string, now: number = Date.now()): PlanHandle | undefined {
  const h = _handles.get(planId);
  if (!h) return undefined;
  _handles.delete(planId);
  if (h.expiresAt <= now) return undefined;
  return h;
}

/** 主动释放（用户取消 / 页面关闭）——不取用、不执行 */
export function dropPlanHandle(planId: string): void {
  _handles.delete(planId);
}

/** 单测：清表 */
export function __resetPlanHandlesForTests(): void {
  _handles.clear();
  _seq = 0;
}

/** 单测：表大小 */
export function __planHandleCountForTests(): number {
  return _handles.size;
}
