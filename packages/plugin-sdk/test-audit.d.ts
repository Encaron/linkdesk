/**
 * @linkdesk/plugin-sdk/test-audit 的类型声明（实现 = 同目录 test-audit.mjs，免构建直发）。
 * 口径与判据说明见 .mjs 头注——那里是单一真源，这里不重述。
 */

export interface AuditedUnit {
  /** 仓相对路径（POSIX 斜杠，不含 .ts 后缀） */
  unit: string;
  /** 判据来源标注（basename-miss / reference-miss） */
  evidence: string[];
}

export interface RepoAudit {
  /** logic = 有纯逻辑单元；exempt = 纯声明式/零逻辑（豁免理由见 exempt）；third-party = 第三方仓（消费方只读报出） */
  kind: "logic" | "exempt" | "third-party";
  exempt: string | null;
  prodLines: number;
  testLines: number;
  testFiles: number;
  /** 宽口径单元数 */
  wideUnits: number;
  /** 纯逻辑单元数（严口径） */
  logicUnits: number;
  zeroTest: AuditedUnit[];
  coveredBasenameOnly: string[];
  coveredReferenceOnly: string[];
  coveredBoth: string[];
}

export declare const AUDIT_CALIBER: Record<string, string>;

export declare function analyzeRepo(repoDir: string, opts?: { official?: boolean }): RepoAudit;
