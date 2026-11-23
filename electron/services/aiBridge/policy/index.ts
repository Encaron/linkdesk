/**
 * AI 权限策略——对外唯一入口（`electron/services/aiBridge/policy/`）。
 *
 * 分工（判红见 `scripts/check-ai-policy.mjs`）：
 *   · `modes.ts`      四档枚举与默认值（档位字符串唯一常量源）
 *   · `risk.ts`       R0–R3 登记表（**唯一风险真相源**，含确认文案）
 *   · `decide.ts`     纯函数 4×4 判定（唯一判定实现）
 *   · `protected.ts`  `userOnly` 判定（L2 命令锁）
 *   · `policyState.ts` 读 `userData/settings.json`（fail-closed）
 *   · `elevation.ts`  提权回路（只问不答；批准写点在用户点击的 handler 里）
 *
 * ⛔ 外部模块只从这里取；⛔ 别在调用点复制矩阵或另写一份风险表。
 * 只导出**外部真的用到的**（`check-dead-code` 按「导出未被消费」判红；新增消费者再加一行）。
 */

export { POLICY_MODE_LABEL } from "./modes.js";

export {
  riskOfCommand,
  riskOfOp,
  askTextForCommand,
  askTextForOp,
  askFirstCatalog,
  isRisk,
} from "./risk.js";

export { decide } from "./decide.js";

export { isUserOnlyCommand } from "./protected.js";

export { getPolicySnapshot, setPolicySettingsFile } from "./policyState.js";

export { requestElevationFlow } from "./elevation.js";
