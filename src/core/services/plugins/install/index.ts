/**
 * 插件安装/更新确认域 —— **唯一公开入口（门面）**。
 *
 * 落点判据（spec §9.5 / D9）：新功能域必须是「同名夹 ＋ 门面 index.ts」（feature-folder），
 * ⛔ 不往 `services/plugins/` 根平铺。外部（IPC 分发、设置页、通知、测试）只许 import 本文件，
 * ⛔ 不许深引 `./policy` 之类的内部模块——内部形状随时可改，门面是合同。
 *
 * 公开面分三组：
 *   ① 请求面（市场/AI 用）：`requestInstall` / `requestUpdateBatch`
 *   ② 策略面（设置页/只读命令用）：`getUpdatePolicy` / `setUpdatePolicy` / `listSourceTrust` /
 *      `trustSource` / `untrustSource`
 *   ③ 接线面（壳内部用）：`setConfirmRenderer` / `setInstallExecutor` / `consumeToken` / `isRemoteSource`
 *
 * 🔴 `issueToken` **不在门面**——令牌只能由 confirm-service 在用户确认后签发（见 token.ts 头注）；
 *    门面把它导出去，等于给「跳过确认」留了一根合法引线。
 */

/* ① 请求面 */
export { requestInstall, requestUpdateBatch, previewUpdatePlan } from "./confirm-service";

/* ② 策略面 */
export {
  POLICY_KEYS,
  DEFAULT_POLICY,
  getUpdatePolicy,
  setUpdatePolicy,
  listSourceTrust,
  trustSource,
  untrustSource,
  sourceLabel,
  isSourceTrusted,
} from "./trust";

/* ③ 接线面 */
export { setConfirmRenderer, setInstallExecutor } from "./confirm-service";
export { registerInstallConfirmRenderer } from "./renderer";
export { consumeToken, bindingOfRequest } from "./token";
export { isRemoteSource, decideOne, sameSourceIdentity, OFFICIAL_SOURCE_ID } from "./policy";
export { buildConfirmPlan } from "./batch";
export { getSourceIdentity, listKnownSources, recordSourceIdentity } from "./ledger";

/* 形状（接线方实现/消费的窄接口） */
export type {
  ConfirmRenderer,
  ExecResult,
  InstallExecutor,
  InstallConfirmationToken,
  TokenBinding,
  TokenVerdict,
  PolicyContext,
  PolicyDecision,
  RequestFacts,
  SourceLedgerEntry,
  SourceLedger,
  KnownSource,
  TOKEN_TTL_MS as INSTALL_TOKEN_TTL_MS,
} from "./types";
