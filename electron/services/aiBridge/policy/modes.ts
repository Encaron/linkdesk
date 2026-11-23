/**
 * AI 权限档位（`PolicyMode`）——**档位字符串的唯一常量源**。
 *
 * 规格：`docs/04-软件更新/待抉择池/AI安全-权限档位与提权/01-设计/01-策略模型与风险分级.md` §一
 *   · 四档：只读 / 逐次确认 / 自主（默认）/ 完全访问；
 *   · 默认 `auto`（D1 已拍板）：AI 通道默认关 ⇒ 用户开通道本身就是一次授权；
 *   · 升到 `full` 需二次确认（D8）；降档随时、立即生效；
 *   · 🔴 不变式：**没点头 = 不做**（所有档位 fail-closed，见 02 §五）。
 *
 * ⛔ 别在别处写 `"auto"` / `"full"` 字面量 —— 判红见 `scripts/check-ai-policy.mjs` P4/P5。
 */

/** 四档 id——顺序即「权限从低到高」（比较升/降档时依赖它，⛔ 不要重排） */
export const POLICY_MODES = ["read", "ask", "auto", "full"] as const;

export type PolicyMode = (typeof POLICY_MODES)[number];

/** 默认档（D1 拍板）：配置键缺席 = 自主 */
export const DEFAULT_POLICY_MODE: PolicyMode = "auto";

/**
 * 读不到策略时的档（02 §五 fail-closed）——**最保守的可执行档**。
 * ⛔ 不许退回 `auto`/`full`：配置损坏时按最宽档放行 = 把「防自提权」自己拆了。
 */
export const FALLBACK_POLICY_MODE: PolicyMode = "ask";

/** 档位的人读名（主进程错误文案 / 账本用；UI 的整句说明在壳配置声明里，⛔ 不是这一份） */
export const POLICY_MODE_LABEL: Record<PolicyMode, string> = {
  read: "只读",
  ask: "逐次确认",
  auto: "自主",
  full: "完全访问",
};

/** 值收敛——未知值一律 false（调用方据此走 fail-closed，⛔ 别默认成 auto） */
export function isPolicyMode(value: unknown): value is PolicyMode {
  return typeof value === "string" && (POLICY_MODES as readonly string[]).includes(value);
}

/** 档位高低（升/降档判定）：索引大 = 权限高 */
export function modeRank(mode: PolicyMode): number {
  return POLICY_MODES.indexOf(mode);
}
