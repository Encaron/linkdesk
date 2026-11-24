/**
 * AI bridge（CLI/MCP）命令结果契约——S6/T11 的单一来源。
 *
 * A 的 `electron/services/aiBridge/{whitelist,opRegistry}.ts` 与 C 的客户端类型都从这里取；
 * ⛔ 在 CLI/MCP/SDK 另存一份形状（第二份真相）。
 *
 * 形状按 A 的 T11 规格（交接.md）：
 *   - 异步命令 exec 回执 = `AiBridgeExecPending`（⛔ 同步命令不带 pending）；
 *   - `opStatus` 回执 = `AiBridgeOpStatus`（state 封闭枚举；过期抛 EOPEXPIRED）。
 */
export interface AiBridgeExecPending {
  commandId: string;
  pending: true;
  opId: string;
  startedAt: string;
}

/** 同步命令回执的可选相位字段（异步命令整体走 AiBridgeExecPending） */
export interface AiBridgeCommandResult {
  pending?: boolean;
  opId?: string;
  [key: string]: unknown;
}

export type AiBridgeOpState = "running" | "done" | "failed" | "expired";

export interface AiBridgeOpError {
  code: string;
  message: string;
  hint?: string;
}

export interface AiBridgeOpStatus {
  state: AiBridgeOpState;
  /** state=done 时的命令结果 */
  result?: unknown;
  /** state=failed 时的统一错误信封 */
  error?: AiBridgeOpError;
  startedAt: string;
  elapsedMs: number;
}
