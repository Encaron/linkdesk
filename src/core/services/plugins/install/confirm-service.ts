/**
 * 确认编排——**壳托管确认的唯一事务入口**（D1/D2 的执行侧）。
 *
 * 一次事务：预取事实 → policy 出计划（batch.ts）→ 画卡（渲染槽；缺席/崩溃退纯文字）→
 *           用户确认 → 签一次性令牌 → 交执行端口（端口第一行核销令牌）→ 成功后写来源账本。
 *
 * 🔴 令牌只在**本文件**签发（`issueToken`），⛔ 任何别处都不许调——它代表「用户刚点了确认」这件事，
 *    别处签发 = 凭空伪造用户意图。
 *
 * 🔴 呈现串行化：壳→池弹窗链路是**单槽**（`DialogService` 的 `pending` 单槽，第二次 confirm 会覆盖
 *    前一条的 settle 闭包——既有缺陷，登记在案）。两个市场同时请求安装时，必须排队呈现，
 *    否则后一次把前一次挤掉 = 那条 Promise 永不结算 = 卡死。串行化 + 呈现超时（超时按取消处理，
 *    方向安全：宁可没装，不能没人确认就装）。
 *
 * 完成态（spec §五.4 / §3.6）：**轻 toast 即时汇总 ＋ 铃铛面板留结果/重试**，同一通知 store 双呈现。
 *   ⛔ 不新开页面、⛔ 不弹新模态、⛔ 不造第三通知面。
 */

import i18n from "../../../../i18n";
import { confirm } from "../../ui/DialogService";
import { pushToast, showTransientToast } from "../../ui/NotificationService";
import type {
  PluginConfirmPlan,
  PluginInstallConfirmResult,
  PluginInstallRequest,
  PluginSourceIdentity,
  PluginUpdateBatchResult,
} from "../../../api/linkdesk-api/types";
import { buildConfirmPlan } from "./batch";
import { getSourceIdentity, recordSourceIdentity } from "./ledger";
import { bindingOfRequest, issueToken } from "./token";
import { getUpdatePolicy, isSourceTrusted, sourceLabel } from "./trust";
import type {
  ConfirmPresentInfo,
  ConfirmRenderer,
  ExecResult,
  InstallExecutor,
  PolicyContext,
  RequestFacts,
} from "./types";

/** 呈现超时——弹窗挂死（单槽缺陷/池无响应）时按「取消」收场，⛔ 不许无限等 */
const PRESENT_TIMEOUT_MS = 5 * 60_000;

let _renderer: ConfirmRenderer | null = null;
let _executor: InstallExecutor | null = null;

/** 注册确认渲染槽（批 2 的默认壳渲染器 / 批 3 的第三方渲染器都走这里）；传 null = 退回纯文字 */
export function setConfirmRenderer(renderer: ConfirmRenderer | null): void {
  _renderer = renderer;
}

/** 注册执行端口（`index.ts` → loader 接线）；传 null = 卸载（测试/热更） */
export function setInstallExecutor(executor: InstallExecutor | null): void {
  _executor = executor;
}

/* ── 呈现（串行化 + 超时） ── */

let _presentChain: Promise<unknown> = Promise.resolve();

function presentedSerialized(
  plan: PluginConfirmPlan,
  kind: "install" | "batch",
  info?: ConfirmPresentInfo,
): Promise<boolean> {
  const run = _presentChain.then(() => present(plan, kind, info), () => present(plan, kind, info));
  _presentChain = run.catch(() => {
    /* 单次呈现失败不阻塞后续 */
  });
  return run;
}

async function present(
  plan: PluginConfirmPlan,
  kind: "install" | "batch",
  info?: ConfirmPresentInfo,
): Promise<boolean> {
  const attempt = async (): Promise<boolean> => {
    if (_renderer) return await _renderer.present(plan, kind, info);
    return plainConfirm(plan);
  };
  try {
    return await Promise.race([
      attempt(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), PRESENT_TIMEOUT_MS)),
    ]);
  } catch {
    // 渲染器崩溃 → 纯文字兜底（现有降级梯的最后一级；⛔ 不许静默装）
    return plainConfirm(plan);
  }
}

/** 纯文字兜底——渲染器缺席/崩溃时仍把「要装什么、从哪来」问清楚 */
function plainConfirm(plan: PluginConfirmPlan): Promise<boolean> {
  const lines = plan.ask.map((item) =>
    `· ${item.request.display.name} ${item.request.version}（${item.request.source.id}）`,
  );
  if (plan.silent.length > 0) {
    lines.push(i18n.t("另有 {{n}} 个将直接更新", { n: String(plan.silent.length) }));
  }
  return confirm({
    title: i18n.t("更新插件"),
    message: lines.join("\n"),
    confirmLabel: i18n.t("更新"),
    cancelLabel: i18n.t("取消"),
    type: "info",
  });
}

/* ── 事实预取 ── */

function requireExecutor(): InstallExecutor {
  if (!_executor) throw new Error("[plugin-install] 执行端口未接线——壳内安装入口不可用");
  return _executor;
}

async function buildContext(
  reqs: readonly PluginInstallRequest[],
  opts?: { forceAsk?: boolean },
): Promise<PolicyContext> {
  const executor = requireExecutor();
  const policy = getUpdatePolicy();
  const versions = new Map<string, string | null>();
  const known = new Map<string, PluginSourceIdentity | null>();

  for (const req of reqs) {
    if (!versions.has(req.pluginId)) {
      let version: string | null = null;
      try {
        version = await executor.installedVersion(req.pluginId);
      } catch {
        // 读盘失败 ⇒ 按「未装」处理（安全方向：多问一次，不静默更新）
        version = null;
      }
      versions.set(req.pluginId, version);
    }
    if (!known.has(req.pluginId)) {
      try {
        const entry = await getSourceIdentity(req.pluginId);
        known.set(
          req.pluginId,
          entry
            ? { id: entry.sourceId, url: entry.sourceUrl, repo: entry.repo, publisher: entry.publisher }
            : null,
        );
      } catch {
        known.set(req.pluginId, null);
      }
    }
  }

  return {
    policy,
    forceAsk: opts?.forceAsk === true,
    isTrusted: isSourceTrusted,
    labelOf: sourceLabel,
    facts(pluginId: string): RequestFacts {
      return {
        installedVersion: versions.get(pluginId) ?? null,
        knownSource: known.get(pluginId) ?? null,
      };
    },
  };
}

/* ── 来源账本落笔（成功后） ── */

async function recordSource(req: PluginInstallRequest, result: ExecResult): Promise<void> {
  try {
    await recordSourceIdentity(req.pluginId, {
      sourceId: req.source.id,
      sourceUrl: req.source.url,
      repo: req.source.repo,
      publisher: req.source.publisher,
      version: result.version ?? req.version,
      sha256: req.sha256,
    });
  } catch {
    // 账本写失败不阻断安装（已落盘就是已落盘）；下次成功安装会刷新
  }
}

async function execute(req: PluginInstallRequest): Promise<ExecResult> {
  const executor = requireExecutor();
  const token = issueToken(bindingOfRequest(req)).token;
  try {
    return req.mode === "install" ? await executor.install(req, token) : await executor.update(req, token);
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/* ── 单一安装/更新 ── */

/**
 * 首装 / 单项更新 —— 一条请求一次确认事务（spec §3.2）。
 * 返回 `confirmed:true` = 用户确认且已交给执行端口；**成败看 job 表**（`plugin:installJobs`），
 * 这里不替用户下「装成功了」的结论（异步尾部还有重载/重启提示）。
 */
export async function requestInstall(req: PluginInstallRequest): Promise<PluginInstallConfirmResult> {
  const ctx = await buildContext([req]);
  const plan = buildConfirmPlan([req], ctx);

  const rejected = plan.rejected[0];
  if (rejected) {
    return { confirmed: false, reason: rejected.reason };
  }
  if (plan.ask.length > 0) {
    const accepted = await presentedSerialized(plan, "install", {
      fromVersion: ctx.facts(req.pluginId).installedVersion,
    });
    if (!accepted) return { confirmed: false, cancelled: true, reason: "user-cancelled" };
  }

  const result = await execute(req);
  if (result.success) await recordSource(req, result);
  return { confirmed: true };
}

/* ── 批量更新 ── */

let _batchSeq = 0;

/**
 * 批量更新 —— 一张汇总卡（只列 ask；silent 以摘要行出现）→ 全部入队 → 全部落地后一条汇总（spec §五）。
 *
 * 取消语义：用户在汇总卡上取消 = **整批 0 个入队**（spec §五.4）——不搞「只跑免问项」的惊喜。
 * 逐项勾选排除（行级 checkbox）由渲染体把它从 `reqs` 里去掉后重提交，壳不另立协议。
 *
 * 并发：**不在这里限条数**——全部同时交给执行端口，下载/解压并发仍由壳的
 * `INSTALL_CONCURRENCY = 3` 槽位把关（D4：3 是并发槽，不是条数上限）。
 */
export async function requestUpdateBatch(reqs: PluginInstallRequest[]): Promise<PluginUpdateBatchResult> {
  if (reqs.length === 0) return { confirmed: true, jobIds: [] };

  const plan = buildConfirmPlan(reqs, await buildContext(reqs));
  if (plan.ask.length > 0) {
    const accepted = await presentedSerialized(plan, "batch", { reqs });
    if (!accepted) {
      return { confirmed: false, cancelled: true, jobIds: [], rejected: plan.rejected };
    }
  }

  const rejectedIds = new Set(plan.rejected.map((r) => r.pluginId));
  const accepted = dedupe(reqs).filter((r) => !rejectedIds.has(r.pluginId));
  const batchId = `batch-${Date.now().toString(36)}-${++_batchSeq}`;

  const outcomes = await Promise.all(
    accepted.map(async (req) => {
      const result = await execute(req);
      if (result.success) await recordSource(req, result);
      return { req, result };
    }),
  );

  emitBatchSummary(outcomes);
  return { confirmed: true, jobIds: [], batchId, rejected: plan.rejected };
}

/**
 * 只读预览——按**当前**设置算一遍计划，不改状态、不入队（确认卡里改设置后就地重算；
 * AI 也能先看「这次会问哪几个」）。与 requestUpdateBatch 走**同一个** buildConfirmPlan
 * （⛔ 第二份计划实现——预览与实际执行结论不一致是最坏的那种 bug）。
 */
export async function previewUpdatePlan(
  reqs: PluginInstallRequest[],
  opts?: { forceAsk?: boolean },
): Promise<PluginConfirmPlan> {
  return buildConfirmPlan(reqs, await buildContext(reqs, opts));
}

/** 去重（首次出现优先）——与 `buildConfirmPlan` 的去重口径一致 */
function dedupe(reqs: readonly PluginInstallRequest[]): PluginInstallRequest[] {
  const seen = new Set<string>();
  const out: PluginInstallRequest[] = [];
  for (const req of reqs) {
    if (seen.has(req.pluginId)) continue;
    seen.add(req.pluginId);
    out.push(req);
  }
  return out;
}

/**
 * 完成汇总——轻 toast（即时）＋ 铃铛面板（结果/重试）；同一 store 双呈现。
 * 全成功 → 轻 toast；有失败 → 面板行（persistent + [重试]），轻 toast 同时报「有失败」。
 */
function emitBatchSummary(outcomes: Array<{ req: PluginInstallRequest; result: ExecResult }>): void {
  const okCount = outcomes.filter((o) => o.result.success).length;
  const cancelledCount = outcomes.filter((o) => !o.result.success && o.result.cancelled).length;
  const failed = outcomes.filter((o) => !o.result.success && !o.result.cancelled);

  if (failed.length === 0) {
    showTransientToast({
      message:
        cancelledCount > 0
          ? i18n.t("已更新 {{ok}} 个，{{cancelled}} 个已取消", { ok: String(okCount), cancelled: String(cancelledCount) })
          : i18n.t("已更新 {{n}} 个插件", { n: String(okCount) }),
      severity: "success",
      key: `plugin-batch-${Date.now().toString(36)}`,
    });
    return;
  }

  const failedNames = failed.map((f) => f.req.display.name).join("、");
  const message = i18n.t("已更新 {{ok}} 个，{{failed}} 个失败：{{names}}", {
    ok: String(okCount),
    failed: String(failed.length),
    names: failedNames,
  });
  const failedReqs = failed.map((f) => f.req);

  showTransientToast({ message, severity: "error", key: `plugin-batch-fail-${Date.now().toString(36)}` });
  pushToast({
    message,
    severity: "error",
    presentation: "panel",
    ttl: 0,
    key: "plugin-batch-result",
    actions: [
      {
        label: i18n.t("重试"),
        isPrimary: true,
        onClick: () => {
          void requestUpdateBatch(failedReqs);
        },
      },
    ],
  });
}
