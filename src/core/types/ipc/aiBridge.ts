/**
 * `app:getAiBridge` 的回包形状（M4 `AI#38.4`）——与 `electron/services/aiBridge/info.ts` 的
 * `AiBridgeInfo` 逐字段同形（那里是权威；⛔ 两处只许结构对齐，不许渲染进程 import 主进程模块）。
 *
 * 🔴 这里只有**数据**没有话术：「运行中」「已关闭」等人话由壳命令拼装（t()）——状态行的显示
 * 文字不进主进程（硬约束 2 的分工）。
 */

/** 白名单操作条目（`opCatalog()` 原样；`kind` = 开放范围「读/做」两栏的派生源） */
export interface AiBridgeOpDesc {
  name: string;
  kind: 'read' | 'write';
  help: string;
  params: Array<{ name: string; type: string; required?: boolean; description?: string }>;
}

/** 操作账条目（与内核 LedgerEntry 同形；仅供本文件 AiBridgeInfo 引用，不单独导出） */
interface AiBridgeLedgerEntry {
  ts: string;
  op: string;
  arg: string | null;
  ok: boolean;
  code: string | null;
  ms: number;
}

export interface AiBridgeInfo {
  /** 本进程是否初始化过内核（未持锁的第二只 = false，其余字段无意义） */
  present: boolean;
  pid: number;
  /** 开关合上没（内核启动时的配置结果） */
  enabled: boolean;
  listening: boolean;
  mode: 'pipe' | 'tcp' | 'off';
  endpoint: { transport: 'pipe'; pipe: string } | { transport: 'tcp'; host: string; port: number } | null;
  lastError: string | null;
  startedAt: string | null;
  uptimeMs: number;
  /** CDP 调试端口实况（argv 唯一真相；null = 没开） */
  debugPort: number | null;
  /** 操作日志落盘开关配置值（`ai.auditLog.enabled`） */
  auditLogEnabled: boolean;
  logFileExists: boolean;
  /** 白名单操作表（`ai.scope.summary` / 完整清单的数据源） */
  ops: AiBridgeOpDesc[];
  ledger: AiBridgeLedgerEntry[];
  /** 凭据文件名（只给名字，明文永不出主进程） */
  tokenFile: string;
  userData: string;
}

/** `app:getAiBridge` 请求动作（缺省 = get） */
export interface AiBridgeInfoRequest {
  action?: 'get' | 'regenerateToken';
}
