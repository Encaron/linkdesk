/**
 * 安装/更新确认域的内部形状——**⛔ 不进契约、不过 IPC、不给池**。
 *
 * 为什么令牌住这里：D2 的全部价值是「没有确认就没有执行」。令牌一旦出现在契约或 IPC 面上，
 * 市场就能自己签一张——确认门当场归零。所以：
 *   · 契约面（`src/core/api/linkdesk-api/types.ts`）只放**请求/计划/回执**；
 *   · 令牌只在壳渲染进程的内存表里，签发者 = confirm-service（唯一），核销者 = 执行端口（唯一）。
 *
 * 落点纪律（硬约束 27 / 用户机落点规范）：本域只多一个 `plugin-source-ledger.json`，
 * 住 userData 根（被规范 §二 A#1 的 `%APPDATA%\linkdesk\` 覆盖，**不新增落点**）。
 */

import type {
  PluginConfirmPlan,
  PluginConfirmReason,
  PluginConfirmRejected,
  PluginInstallRequest,
  PluginSourceIdentity,
  PluginUpdatePolicy,
} from "../../../api/linkdesk-api/types";

/** 一次性确认令牌有效期——spec §8「60s」；过期即作废（不续期，重走确认） */
export const TOKEN_TTL_MS = 60_000;

/**
 * 令牌绑定面——签发与核销必须**逐字段全同**。
 * `version` + `sha256` 是「确认时用户看到的那一版」与「真要装的那一版」之间的唯一联结；
 * 少一个字段，就允许「确认 A 版、装 B 版」。
 */
export interface TokenBinding {
  pluginId: string;
  version: string;
  sourceUrl: string;
  sha256?: string;
}

/** 壳内存表里的一条——`used` 只是账面（核销即删；表里还能看到 used 说明有人绕过 consume） */
export interface InstallConfirmationToken extends TokenBinding {
  /** 一次性 nonce（壳签发；⛔ 不落盘、不过 IPC） */
  token: string;
  expiresAt: number;
  used: boolean;
}

/** 核销结论——`no-token` 是给用户/日志看的唯一对外词（与 spec §3.2 的拒因同一词） */
export type TokenVerdict = "ok" | "no-token" | "mismatch" | "expired" | "used";

/** 来源身份账本一条（pluginId → 最近一次安装/更新的来源事实；同名来源多插件各记一条） */
export interface SourceLedgerEntry {
  sourceId: string;
  sourceUrl: string;
  repo?: string;
  publisher?: string;
  version: string;
  sha256?: string;
  /** 首次落地时间 ISO（重装/升级保留） */
  installedAt: string;
  /** 最近一次见到该来源 ISO */
  seenAt: string;
}

/** 来源身份账本形状——pluginId → 记录 */
export type SourceLedger = Record<string, SourceLedgerEntry>;

/** 按 sourceId 聚合后的已知来源——信任清单的行数据（唯一来源：ledger.ts） */
export interface KnownSource {
  sourceId: string;
  url: string;
  repo?: string;
  publisher?: string;
  pluginIds: string[];
  lastSeenAt: string;
}

/** 每项请求的**既知事实**——由 confirm-service 一次性预取，policy 只读它（纯函数） */
export interface RequestFacts {
  /** 已装版本（null = 未装 ⇒ 首装） */
  installedVersion: string | null;
  /** 账本里的来源身份（null = 无记录 ⇒ 首装语义） */
  knownSource: PluginSourceIdentity | null;
}

/** policy 判定上下文——纯函数入参；一切 I/O 在调用方做完 */
export interface PolicyContext {
  policy: PluginUpdatePolicy;
  /** 来源在信任清单（官方 fixed 恒 true，调用方负责 fixed 语义） */
  isTrusted(sourceId: string): boolean;
  /** 来源显示名（壳解析 = 单一来源；⛔ 市场拼） */
  labelOf(source: PluginSourceIdentity): string;
  /** 既知事实查询 */
  facts(pluginId: string): RequestFacts;
  /** 本批临时「全都问一遍」——预览重算时用（⛔ 不改设置、不落盘） */
  forceAsk?: boolean;
}

/** 单项判定——`ask` 带原因（渲染体只按原因选文案） */
export type PolicyDecision =
  | { kind: "ask"; reason: PluginConfirmReason; previous?: PluginSourceIdentity }
  | { kind: "silent" }
  | { kind: "rejected"; reason: PluginConfirmRejected["reason"]; message?: string };

/**
 * 确认卡渲染端口——壳默认渲染器（批 2）与第三方渲染槽（批 3 贡献点）都实现它。
 * `kind` 决定用哪张卡：`install` = 单项（首装/更新/来源变更/降级，同一张卡四种原因）；
 * `batch` = 批量汇总。`false` = 用户取消/关闭（⛔ 不区分「点了取消」与「按了 Esc」——用户意图相同）。
 */
export interface ConfirmRenderer {
  present(plan: PluginConfirmPlan, kind: "install" | "batch", info?: ConfirmPresentInfo): Promise<boolean>;
}

/** 渲染器附带上文（纯数据，可结构化克隆）——不参与判定，只影响卡面信息 */
export interface ConfirmPresentInfo {
  /** 已装版本（安装卡画「旧 → 新」；null = 首装） */
  fromVersion?: string | null;
  /** 本批原始请求（批量卡「改设置后就地重算」要拿全量请求——`ConfirmPlan.silent` 是摘要行，装不下下载地址） */
  reqs?: PluginInstallRequest[];
}

/** 执行结果——与 loader 的 `PluginInstallResult`/`PluginUpdateResult` 同口径的窄投影 */
export interface ExecResult {
  success: boolean;
  error?: string;
  cancelled?: boolean;
  version?: string;
  needRestart?: boolean;
}

/**
 * 执行端口——由 `index.ts` 接到 loader（`setInstallExecutor`）。
 * 🔴 实现方**必须先核销令牌**再执行（`consumeToken`）；⛔ 不得「先执行后补票」——
 *    那样令牌只是装饰，D2 归零。
 */
export interface InstallExecutor {
  install(req: PluginInstallRequest, token: string): Promise<ExecResult>;
  update(req: PluginInstallRequest, token: string): Promise<ExecResult>;
  /** 已装版本（null = 未装）——确认判定的事实来源（loader 读盘） */
  installedVersion(pluginId: string): Promise<string | null>;
}
