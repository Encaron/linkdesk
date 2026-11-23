/**
 * 壳默认确认渲染器——把 `ConfirmPlan` 包成 DialogHost 富内容推给池（D1/D8）。
 *
 * 三段分工，一段都不许越界：
 *   ① 本文件（壳）：把确认计划翻成**文案包**（t() 解析）+ 选宿主视图 id + 推弹窗；
 *   ② 池侧视图（`src/pool/shared/plugin-install-confirm`）：读载荷 → 建视图模型 → 哑渲染；
 *   ③ 共享件（`@linkdesk/ui`）：卡的结构与长相。
 *
 * 为什么文案在壳算：显示文本铁律——池只渲染，不查字典。载荷必须结构化克隆安全（⛔ 函数过不去）。
 *
 * 第三方替换渲染器（批 3 贡献点）：壳只换「推哪个 viewId」——判定/令牌/队列全在 confirm-service，
 * 替换体拿到的仍是同一个 `PluginConfirmDialogPayload`，⛔ 碰不到 token。
 */

import i18n from "../../../../i18n";
import { confirmContent } from "../../ui/DialogService";
import {
  PLUGIN_CONFIRM_HOST_VIEWS,
  type PluginConfirmDialogPayload,
  type PluginInstallConfirmLabels,
} from "../../../../components/shared/plugin-install-confirm/types";
import { setConfirmRenderer } from "./confirm-service";
import { getUpdatePolicy } from "./trust";
import type { ConfirmPresentInfo } from "./types";
import type { PluginConfirmPlan } from "../../../api/linkdesk-api/types";

/**
 * 文案包——**壳侧唯一出处**（`t()` 在这里解析一次）。
 * 键的中文原文即 i18n key；英文译名住 lang-defaults（`audit-i18n --strict` 会盯）。
 */
function buildLabels(): PluginInstallConfirmLabels {
  const t = (key: string) => i18n.t(key);
  return {
    installTitle: t("安装 {{name}}"),
    subFirst: t("首次安装 · 壳托管确认"),
    subSourceChanged: t("来源已变更 · 按新装处理"),
    subDowngrade: t("降级安装 · 壳托管确认"),
    subOfficial: t("官方更新 · 壳托管确认"),
    subUpdate: t("更新 · 壳托管确认"),
    noteFirst: t("首次安装始终确认。请核对来源、发布者与版本；安装后插件可调用壳的公开 API。"),
    noteSourceChanged: t("下载来源与上次安装时不同。来源或发布者变化意味着代码提供方变了——确认后才会执行。"),
    noteDowngrade: t("这是旧版本。除非你在排查问题，通常不需要降级。"),
    kvPlugin: t("插件"),
    kvPublisher: t("发布者"),
    kvSource: t("来源"),
    kvVersion: t("版本"),
    kvSize: t("大小"),
    kvIntegrity: t("完整性"),
    kvOldSource: t("旧来源"),
    kvNewSource: t("新来源"),
    integrityToVerify: t("sha256 {{hash}} · 下载后校验"),
    integrityMissing: t("未提供校验值（过渡期不阻断）"),
    warnSourceChanged: t("壳会把它当新装：确认后才签发一次性令牌；不确认就什么都不做。"),
    rememberSource: t("以后此来源的更新不再询问（首装仍会确认）"),
    actionInstall: t("确认安装"),
    actionUpdate: t("确认更新"),
    actionUpdateAnyway: t("仍要更新"),
    actionCancel: t("取消"),
    unknownPublisher: t("未知发布者"),
    unknownSize: t("未知大小"),
    batchTitle: t("更新插件"),
    batchSub: t("壳托管确认 · 只列需要确认的项"),
    statTotal: t("本批总数"),
    statAsk: t("需要确认"),
    statSilent: t("按设置免问"),
    groupAsk: t("{{n}} 个需要确认"),
    groupSilent: t("{{n}} 个免问"),
    groupSilentSummary: t("{{label}} {{n}} 个"),
    badgeOfficial: t("官方"),
    badgeThird: t("第三方"),
    silentLine: t("{{summary}}按设置免问，将随本批一起执行。"),
    silentAction: t("改为逐个确认"),
    rememberOfficial: t("以后官方源更新不再询问"),
    batchEmpty: t("没有需要确认的项。按当前设置，这批更新将直接执行。"),
    batchNote: t("取消 = 整批取消；免问项也随本批一起执行。"),
    actionConfirmBatch: t("确认更新 {{n}} 个"),
    actionRunBatch: t("直接更新 {{n}} 个"),
    actionCancelBatch: t("取消"),
  };
}

/**
 * 第三方渲染器解析器——返回 { pluginId, viewId } = 该插件在 `contributes.renderers` 声明了整套替换
 */
export type RendererContributionResolver = (kind: "install" | "batch") => { pluginId: string; viewId: string } | null;

let _resolveRenderer: RendererContributionResolver | null = null;

/** 注册默认渲染器——壳启动期调用一次（`registerIpcBridgeHandler` 同批）。
 *  `resolveRenderer` = D8 渲染槽：某插件声明了整套替换 ⇒ 推插件视图；未声明/Views 缺失 ⇒ 宿主默认卡；
 *  默认卡也推不出去 ⇒ confirm-service 纯文字兜底。推失败/无池环境返回 false（= 取消，安全方向）。
 */
export function registerInstallConfirmRenderer(resolveRenderer?: RendererContributionResolver): void {
  _resolveRenderer = resolveRenderer ?? null;
  setConfirmRenderer({
    async present(plan: PluginConfirmPlan, kind: "install" | "batch", info?: ConfirmPresentInfo) {
      const payload: PluginConfirmDialogPayload = {
        kind,
        labels: buildLabels(),
        plan,
        fromVersion: info?.fromVersion ?? null,
        policy: getUpdatePolicy(),
        reqs: info?.reqs ?? [],
      };
      // D8：第三方整套替换优先（它只吃同一份 payload——判定/令牌/队列仍在壳，⛔ token 不递给渲染体）；
      // 未声明 ⇒ 宿主默认卡。
      const override = _resolveRenderer?.(kind);
      return confirmContent({
        title: i18n.t("更新插件"),
        // 兜底正文（宿主视图缺席时 DialogHost 不会画 message；纯文字兜底在 confirm-service 里另有一路）
        message: "",
        content: override
          ? { pluginId: override.pluginId, viewId: override.viewId, payload }
          : { hostView: PLUGIN_CONFIRM_HOST_VIEWS[kind], payload },
      });
    },
  });
}
