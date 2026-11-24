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
import { PLUGIN_CONFIRM_HOST_VIEWS } from "../../../../components/shared/plugin-install-confirm/types";
import { setConfirmRenderer } from "./confirm-service";
import { buildConfirmPayload } from "./view-payload";
import type { ConfirmPresentInfo } from "./types";
import type { PluginConfirmPlan } from "../../../api/linkdesk-api/types";

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
      const payload = buildConfirmPayload(plan, kind, info);
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
