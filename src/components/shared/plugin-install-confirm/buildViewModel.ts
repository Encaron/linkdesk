/**
 * 确认卡视图模型构建——**纯函数**（plan + labels → VM）。
 *
 * 为什么单独一层：卡是「哑渲染」的，但哑渲染不等于把判断散进 JSX。
 * 这里把「什么算 warn、显示哪个原因、哪些行出现、按钮怎么命名」一次算清；
 * 组件只做 map。这样单测能直接断言「首装卡 / 来源变更卡 / 批量卡」的**全部可见文本与行序**，
 * 不依赖 React 渲染（原型 `01-原型.html` 的逐屏对照也照本文件的输出对）。
 *
 * 文案一律取自 `labels`（壳侧 t() 解析）——本文件 ⛔ 不写任何用户可见中文。
 */

import type { PluginConfirmPlan } from "@linkdesk/contracts";
import {
  format,
  type PluginConfirmBatchGroup,
  type PluginConfirmKvRow,
  type PluginConfirmVM,
  type PluginInstallConfirmLabels,
} from "./types";

/** 字节 → 人读大小（KB/MB，一位小数；缺值走 labels.unknownSize） */
export function formatBytes(size: number | undefined, unknownLabel: string): string {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return unknownLabel;
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${Math.round(size)} B`;
}

/** sha256 短写（首 4…末 4；短于 8 位原样返回） */
export function shortHash(hash: string | undefined): string {
  if (!hash) return "";
  return hash.length > 8 ? `${hash.slice(0, 4)}…${hash.slice(-4)}` : hash;
}

function reasonSub(reason: string, labels: PluginInstallConfirmLabels): string {
  switch (reason) {
    case "first-install":
      return labels.subFirst;
    case "source-changed":
      return labels.subSourceChanged;
    case "downgrade":
      return labels.subDowngrade;
    case "official-source":
      return labels.subOfficial;
    default:
      return labels.subUpdate;
  }
}

function reasonNote(reason: string, labels: PluginInstallConfirmLabels): string | undefined {
  switch (reason) {
    case "first-install":
      return labels.noteFirst;
    case "source-changed":
      return labels.noteSourceChanged;
    case "downgrade":
      return labels.noteDowngrade;
    default:
      return undefined;
  }
}

/** 单项卡（首装 / 单项更新 / 来源变更 / 降级，同一张卡四种原因） */
export function buildInstallVM(
  plan: PluginConfirmPlan,
  labels: PluginInstallConfirmLabels,
  fromVersion?: string | null,
): PluginConfirmVM {
  const item = plan.ask[0];
  if (!item) {
    // 调用方保证 ask 非空；空则给一张不可确认的空卡（⛔ 不崩、⛔ 不静默确认）
    return {
      kind: "install",
      title: labels.batchTitle,
      sub: labels.batchSub,
      rows: [],
      emptyText: labels.batchEmpty,
      footer: { confirm: labels.actionCancel, cancel: labels.actionCancel },
    };
  }

  const { request, reason, previousLabel } = item;
  // 来源显示名**只从计划里取**（壳的 sourceLabel 已解析）——本文件不自己推导来源名
  const sourceText = plan.groups.find((g) => g.sourceId === request.source.id)?.label ?? request.source.id;
  const rows: PluginConfirmKvRow[] = [
    { k: labels.kvPlugin, v: request.display.name, tone: "bold" },
    { k: labels.kvPublisher, v: request.source.publisher || labels.unknownPublisher },
    { k: labels.kvSource, v: sourceText, tone: reason === "source-changed" ? "muted" : undefined },
  ];

  if (reason === "source-changed") {
    rows.push({ k: labels.kvOldSource, v: previousLabel || labels.unknownPublisher, tone: "muted" });
    rows.push({ k: labels.kvNewSource, v: sourceText, tone: "warn" });
  }

  rows.push({
    k: labels.kvVersion,
    v: fromVersion ? `${fromVersion} → ${request.version}` : request.version,
  });
  rows.push({ k: labels.kvSize, v: formatBytes(request.display.size, labels.unknownSize) });

  const hasHash = !!request.sha256;
  const integrityText = hasHash
    ? format(labels.integrityToVerify, { hash: shortHash(request.sha256) })
    : labels.integrityMissing;

  const confirmLabel =
    reason === "first-install"
      ? labels.actionInstall
      : reason === "source-changed" || reason === "downgrade"
        ? labels.actionUpdateAnyway
        : labels.actionUpdate;

  return {
    kind: "install",
    title: format(labels.installTitle, { name: request.display.name }),
    sub: reasonSub(reason, labels),
    note: reasonNote(reason, labels),
    rows,
    integrity: { k: labels.kvIntegrity, text: integrityText, ok: hasHash },
    warn: reason === "source-changed" ? labels.warnSourceChanged : undefined,
    // 官方来源恒信任（fixed）——不给「记住」勾选（勾了也没意义）
    remember:
      request.source.id === "official"
        ? undefined
        : {
            label: labels.rememberSource,
            // 已信任来源 → 勾上（取消勾 = 撤销信任）；未信任 → 空（勾上 = 加入信任清单）
            checked: plan.groups.find((g) => g.sourceId === request.source.id)?.trusted === true,
          },
    footer: {
      confirm: confirmLabel,
      cancel: labels.actionCancel,
      tone: reason === "source-changed" ? "danger" : undefined,
    },
  };
}

/** 批量卡（只列 ask；silent 以摘要行出现——spec §5.1） */
export function buildBatchVM(
  plan: PluginConfirmPlan,
  labels: PluginInstallConfirmLabels,
  silentOfficial: boolean,
): PluginConfirmVM {
  const groups: PluginConfirmBatchGroup[] = plan.groups
    .filter((g) => g.askCount > 0)
    .map((g) => ({
      label: g.label,
      badge: g.sourceId === "official" ? labels.badgeOfficial : labels.badgeThird,
      badgeTone: g.sourceId === "official" ? "free" : "third",
      countLabel: format(labels.groupAsk, { n: g.askCount }),
      rows: plan.ask
        .filter((i) => i.request.source.id === g.sourceId)
        .map((i) => ({
          pluginId: i.request.pluginId,
          name: i.request.display.name,
          sub: [i.request.source.publisher, formatBytes(i.request.display.size, labels.unknownSize)]
            .filter(Boolean)
            .join(" · "),
          from: undefined,
          to: i.request.version,
          icon: i.request.display.icon,
        })),
    }));

  // silent 摘要行：按来源聚合计数（文案来自 labels.groupSilentSummary）
  const silentSummary = plan.groups
    .filter((g) => g.silentCount > 0)
    .map((g) => format(labels.groupSilentSummary, { label: g.label, n: g.silentCount }))
    .join(" · ");

  return {
    kind: "batch",
    title: labels.batchTitle,
    sub: labels.batchSub,
    rows: [],
    stats: {
      total: plan.totals.total,
      ask: plan.totals.ask,
      silent: plan.totals.silent,
      labels: { total: labels.statTotal, ask: labels.statAsk, silent: labels.statSilent },
    },
    groups,
    silentLine: silentSummary
      ? { text: format(labels.silentLine, { summary: silentSummary }), action: labels.silentAction }
      : undefined,
    emptyText: plan.totals.ask === 0 ? labels.batchEmpty : undefined,
    remember: { label: labels.rememberOfficial, checked: silentOfficial },
    note: labels.batchNote,
    footer: {
      confirm:
        plan.totals.ask > 0
          ? format(labels.actionConfirmBatch, { n: plan.totals.total })
          : format(labels.actionRunBatch, { n: plan.totals.total }),
      cancel: labels.actionCancelBatch,
    },
  };
}
