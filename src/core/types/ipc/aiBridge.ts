/**
 * The reply shape of `app:getAiBridge` (M4 `AI#38.4`)—field-for-field identical to the
 * `AiBridgeInfo` in `electron/services/aiBridge/info.ts` (that one is authoritative; ⛔ the two may only stay structurally aligned; the renderer must not import main-process modules).
 *
 * 🔴 Here there is only **data**, no phrasing: human-readable strings like "running" or "closed" are assembled by shell commands (t())—
 * the status line's display text does not enter the main process (division of labor per hard constraint 2).
 */

/** Whitelisted operation entry (verbatim from `opCatalog()`; `kind` is what the "read/do" open-scope columns derive from) */
export interface AiBridgeOpDesc {
  name: string;
  kind: 'read' | 'write';
  help: string;
  params: Array<{ name: string; type: string; required?: boolean; description?: string }>;
}

/** Operation ledger entry (same shape as the kernel's LedgerEntry; referenced only by AiBridgeInfo in this file, not exported separately) */
interface AiBridgeLedgerEntry {
  ts: string;
  op: string;
  arg: string | null;
  ok: boolean;
  code: string | null;
  ms: number;
}

export interface AiBridgeInfo {
  /** Whether this process has initialized the kernel (a second contender that failed to take the lock = false; the other fields are then meaningless) */
  present: boolean;
  pid: number;
  /** Whether the switch is on (the config result at kernel startup) */
  enabled: boolean;
  listening: boolean;
  mode: 'pipe' | 'tcp' | 'off';
  endpoint: { transport: 'pipe'; pipe: string } | { transport: 'tcp'; host: string; port: number } | null;
  lastError: string | null;
  startedAt: string | null;
  uptimeMs: number;
  /** CDP debug port live state (argv is the single source of truth; null = not open) */
  debugPort: number | null;
  /** Audit-log-to-disk switch config value (`ai.auditLog.enabled`) */
  auditLogEnabled: boolean;
  logFileExists: boolean;
  /** Whitelisted operations table (the data source for `ai.scope.summary` / the full list) */
  ops: AiBridgeOpDesc[];
  ledger: AiBridgeLedgerEntry[];
  /** Credential file name (name only; the plaintext never leaves the main process) */
  tokenFile: string;
  userData: string;
}

/** `app:getAiBridge` request action (omitted = get) */
export interface AiBridgeInfoRequest {
  action?: 'get' | 'regenerateToken';
}
