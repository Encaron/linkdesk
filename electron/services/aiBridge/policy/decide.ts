/**
 * 策略求值——**纯函数、零 IO、零 UI**（唯一判定实现）。
 *
 * 规格：`docs/04-软件更新/已落地/AI安全-权限档位与提权/01-设计/01-策略模型与风险分级.md` §四
 *
 * 判定矩阵：
 *
 * | 档 \ 风险 | R0 | R1 | R2 | R3 |
 * |:--|:--:|:--:|:--:|:--:|
 * | `read` | allow | deny | deny | deny |
 * | `ask`  | allow | ask  | ask  | ask  |
 * | `auto` | allow | allow| allow| ask  |
 * | `full` | allow | allow| allow| allow|
 *
 * 🔴 不在本函数里做的事：读配置（`policyState.ts`）、弹窗（`sensitive.ts` 的 `askUser`）、
 *    判断 `userOnly`（`protected.ts`）。判定只此一处，调用方不许复制矩阵。
 */

import { isPolicyMode, FALLBACK_POLICY_MODE, type PolicyMode } from "./modes.js";
import type { Risk } from "./risk.js";

export type Decision = "allow" | "ask" | "deny";

const MATRIX: Record<PolicyMode, Record<Risk, Decision>> = {
  read: { R0: "allow", R1: "deny", R2: "deny", R3: "deny" },
  ask: { R0: "allow", R1: "ask", R2: "ask", R3: "ask" },
  auto: { R0: "allow", R1: "allow", R2: "allow", R3: "ask" },
  full: { R0: "allow", R1: "allow", R2: "allow", R3: "allow" },
};

/**
 * 判定（16 格）。
 *
 * `mode` 收 `string`：运行期可能拿到配置里的脏值——**非法档位按 fail-closed 档走**
 * （`ask`，不是 `allow`）。这也保证「配置写坏 = 变成逐次确认」，⛔ 不会变成放行。
 */
export function decide(mode: PolicyMode | string, risk: Risk): Decision {
  const safeMode: PolicyMode = isPolicyMode(mode) ? mode : FALLBACK_POLICY_MODE;
  return MATRIX[safeMode][risk];
}
