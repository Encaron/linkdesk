/**
 * 操作级错误的构造器——**一处定义**（`whitelist.ts` 与 `sensitive.ts` 共用）。
 *
 * 为什么要单独一个文件：`sensitive.ts`（敏感动作确认回路）需要把「用户没点头」做成带 code 的错误，
 * 而 `whitelist.ts` 又要 import 它（各操作都从这道门过）——把构造器留在 `whitelist.ts` 里就成**循环
 * import**。抽出来两个模块各取各的，谁也不回头。
 *
 * 本文件只有这一件事：`coded` 的形状（`Error` + `code` 字段）是内核对外错误契约的**唯一来源**，
 * 客户端（`cli/linkdeskctl/lib/bridge-client.mjs` 的错误分类表）认的就是它。
 */

/** 带 code 的操作错误——应答 `{ ok:false, code, message }` 里的 code 就是它。 */
export function coded(code: string, message: string): Error & { code: string } {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}

/* ── AI 权限档位（`01-设计/02-执行闸与防自提权.md` §六）──
 * 与 `EUSERDENIED` 分开：「用户点否」与「策略不允许」必须可分辨——
 * 否则 AI 会误判该重试（用户拒绝）还是该请求提权（策略拒绝）。 */

/** 当前档位不允许（可调 `requestElevation` 带理由；⛔ 不要原样重试） */
export const POLICY_DENIED = "EPOLICYDENIED";

/** 命令被标 `userOnly`，AI 永远不可调（提示用户去设置页；⛔ 不要重试） */
export const PROTECTED = "EPROTECTED";
