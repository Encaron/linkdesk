/**
 * 壳安装门——付费插件安装的**裁决层**（R4-1.3 / I21 / #24 壳侧·正典 09 §三·补3 ＋ 05 §三·4 三层模型）。
 *
 * 为什么在壳：市场插件可被整体替换（万物皆可插件）——「是否已付费/能否安装」若由市场裁决，
 * 第三方市场一换收费插件变免费。声明（pricing）进数据层随目录走；裁决（查权益放行安装）住壳
 * 安装流水线（与 minAppVersionGate 同位模式）。本模块 = 判定单点；消费方 = install-ops 的 installPlugin。
 *
 * v1 边界（09「边界与代价」自认，如实带进注释）：无服务器 ⇒ pricing 由调用方随行（opts.pricing）、
 * 未带 = 免费放行；深度对抗强制（谁都不能少带声明）留 B3。门保证的是：官方面不漏门 ＋ 权益存储
 * 与门都在壳——市场被整体替换也绕不过门的存在。
 */

import type { LicenseEntitlement, PluginInstallRequestOpts } from "../../api/linkdesk-api/types";

/**
 * 纯判定（可单测）——**allow 的三个前提**：
 *   1. pricing 未声明 / model 缺省 = 免费条目（现状行为零变更）；
 *   2. 声明了但 pluginId 未随行 = 无法归属（v1 边界——调用方义务，B3 收口）；
 *   3. 权益存储有该插件记录且未过期（exp 缺省 = 永久）。
 */
export function decideInstallLicenseGate(
  pricing: { model?: string } | undefined,
  pluginId: string | undefined,
  entitlements: readonly LicenseEntitlement[],
  nowMs: number = Date.now(),
): "allow" | "block" {
  if (!pricing?.model) return "allow";
  if (!pluginId) return "allow";
  const record = entitlements.find((e) => e.pluginId === pluginId);
  if (!record) return "block";
  if (typeof record.exp === "number" && record.exp * 1000 <= nowMs) return "block";
  return "allow";
}

/**
 * 壳安装门入口——installPlugin 开工前调用。false = 拦（回执 licenseRequired，消费方开许可弹窗）。
 * 权益读数失败**放行**（门是裁决不是断路器——权益存储故障 ≠ 全部插件装不上；读数健康由 store owner 负责）。
 */
export async function checkInstallLicenseGate(opts?: PluginInstallRequestOpts): Promise<boolean> {
  if (!opts?.pricing?.model) return true; // 免费条目——连读数都省（现状行为零变更）
  if (!opts.pluginId) return true; // 无法归属（v1 边界）
  const licenses = window.linkdesk?.licenses;
  if (!licenses) return true; // 壳面缺失（纯浏览器预览）——门不拦
  try {
    const list = await licenses.list();
    return decideInstallLicenseGate(opts.pricing, opts.pluginId, list) === "allow";
  } catch {
    return true;
  }
}
