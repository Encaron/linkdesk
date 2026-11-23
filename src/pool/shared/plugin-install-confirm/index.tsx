/**
 * 池侧默认确认视图 + 宿主内容视图注册表（D8 渲染槽的池侧一半）。
 *
 * 三条职责：
 *   ① 从 `dialogHost.current()` 取壳下发的载荷（不查字典、不判策略——纯读）；
 *   ② 建视图模型（`buildViewModel`）→ 交 `@linkdesk/ui` 共享件哑渲染；
 *   ③ 把用户动作如实转回壳：确认/取消走 `dialogHost.confirm()/cancel()`；
 *      「记住来源 / 改设置」调用**同一个** `plugins.*` API（⛔ 池内不写配置、不判信任）。
 *
 * 🔴 注册表是 D8 的替换缝：第三方整套替换确认 UI = 换壳推哪个 `hostView`；
 *    本文件默认档缺席/崩溃时，壳仍有「纯文字 confirm」兜底（confirm-service 的降级梯）。
 */

import { useState } from "react";
import type { ComponentType } from "react";
import { useTranslation } from "react-i18next";
import type { PluginConfirmPlan } from "@linkdesk/contracts";
import PluginInstallConfirm from "../../../components/shared/plugin-install-confirm/PluginInstallConfirm";
import PluginUpdateBatchSummary from "../../../components/shared/plugin-install-confirm/PluginUpdateBatchSummary";
// 2026-11-24（线 1 · AI 权限档位）：风险表宿主内容视图——跨线登记，仅此两行
import AiPolicyRiskTableDialog from "../ai-policy/AiPolicyRiskTableDialog";
import { AI_POLICY_RISK_TABLE_HOST_VIEW } from "../../../core/types/ipc/aiPolicy";
import { buildBatchVM, buildInstallVM } from "../../../components/shared/plugin-install-confirm/buildViewModel";
import {
  PLUGIN_CONFIRM_HOST_VIEWS,
  type PluginConfirmDialogPayload,
} from "../../../components/shared/plugin-install-confirm/types";

export interface HostDialogViewHostProps {
  /** 壳下发的结构化载荷（⛔ 由 DialogHost 从 dialogHost.current() 取来传入） */
  payload: unknown;
}

const host = () => window.linkdesk?.dialogHost;

/** 载荷收窄——形状不对就当作「无载荷」（不抛、不猜） */
function asInstallPayload(payload: unknown): PluginConfirmDialogPayload | null {
  const p = payload as PluginConfirmDialogPayload | null;
  return p && p.kind === "install" && p.plan && p.labels ? p : null;
}

function asBatchPayload(payload: unknown): PluginConfirmDialogPayload | null {
  const p = payload as PluginConfirmDialogPayload | null;
  return p && p.kind === "batch" && p.plan && p.labels ? p : null;
}

/** 载荷缺失/未知视图的兜底——只给一颗「取消」，⛔ 不给确认（不能替用户做决定） */
function UnavailableCard() {
  const { t } = useTranslation();
  return (
    <div className="ldk-pic">
      <div className="ldk-pic-body">
        <p className="ldk-pic-note">{t("这张确认卡不可用，请取消后重试")}</p>
      </div>
      <footer className="ldk-pic-foot">
        <button type="button" className="ldk-pic-btn" onClick={() => host()?.cancel()}>
          {t("取消")}
        </button>
      </footer>
    </div>
  );
}

/** 单项卡（首装 / 更新 / 来源变更 / 降级） */
export function InstallConfirmView({ payload }: HostDialogViewHostProps) {
  const data = asInstallPayload(payload);
  if (!data) return <UnavailableCard />;

  const vm = buildInstallVM(data.plan, data.labels, data.fromVersion);
  const item = data.plan.ask[0];

  const onRememberChange = (checked: boolean): void => {
    const api = window.linkdesk?.plugins;
    if (!item || !api) return;
    const source = item.request.source;
    if (checked) {
      void api.trustSource?.({ sourceId: source.id, url: source.url, repo: source.repo, publisher: source.publisher });
    } else {
      void api.untrustSource?.(source.id);
    }
  };

  return (
    <PluginInstallConfirm
      vm={vm}
      onConfirm={() => host()?.confirm()}
      onCancel={() => host()?.cancel()}
      onRememberChange={onRememberChange}
    />
  );
}

/** 批量卡（一张汇总卡；改设置/展开免问项都**重新向壳要计划**，池内不判） */
export function BatchConfirmView({ payload }: HostDialogViewHostProps) {
  const data = asBatchPayload(payload);
  const [plan, setPlan] = useState<PluginConfirmPlan | null>(data?.plan ?? null);
  const [silentOfficial, setSilentOfficial] = useState<boolean>(data?.policy?.silentOfficial ?? true);
  const [forced, setForced] = useState(false);

  if (!data || !plan) return <UnavailableCard />;

  const api = window.linkdesk?.plugins;
  const reqs = data.reqs ?? [];

  const replan = async (opts?: { forceAsk?: boolean }): Promise<void> => {
    if (!api?.previewUpdatePlan) return;
    try {
      setPlan(await api.previewUpdatePlan(reqs, opts));
    } catch {
      // 重算失败 → 保留原计划（用户仍可按原样确认/取消，⛔ 不白屏）
    }
  };

  const onRememberChange = async (checked: boolean): Promise<void> => {
    if (!api?.setUpdatePolicy) return;
    setSilentOfficial(checked);
    try {
      await api.setUpdatePolicy({ silentOfficial: checked });
    } catch {
      return;
    }
    await replan({ forceAsk: forced });
  };

  const onForceAsk = async (): Promise<void> => {
    setForced(true);
    await replan({ forceAsk: true });
  };

  const vm = buildBatchVM(plan, data.labels, silentOfficial);

  return (
    <PluginUpdateBatchSummary
      vm={vm}
      onConfirm={() => host()?.confirm()}
      onCancel={() => host()?.cancel()}
      onRememberChange={(checked) => {
        void onRememberChange(checked);
      }}
      onForceAsk={() => {
        void onForceAsk();
      }}
    />
  );
}

/** 宿主内容视图注册表——id 唯一登记处见 `PLUGIN_CONFIRM_HOST_VIEWS` */
const HOST_VIEWS: Record<string, ComponentType<HostDialogViewHostProps>> = {
  [PLUGIN_CONFIRM_HOST_VIEWS.install]: InstallConfirmView,
  [PLUGIN_CONFIRM_HOST_VIEWS.batch]: BatchConfirmView,
  [AI_POLICY_RISK_TABLE_HOST_VIEW]: AiPolicyRiskTableDialog,
};

/** DialogHost 的宿主视图分派——未知 id 走兜底卡（⛔ 空面板把用户困住） */
export default function HostDialogView({ hostView, payload }: { hostView: string; payload?: unknown }) {
  const View = HOST_VIEWS[hostView];
  if (!View) return <UnavailableCard />;
  return <View payload={payload} />;
}
