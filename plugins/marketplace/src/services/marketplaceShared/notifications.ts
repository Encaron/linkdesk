/**
 * notifications — 市场的**事件型反馈通道**（右下角 error toast，唯一的失败发声处）。
 * E6#86（第 3.6.3 轮）feature-folder 拆分：自 `marketplaceShared.ts` 原样搬出，零行为变更。
 *
 * 依赖方向：messages / catalogStore → 本文件。本文件不 import 安装流（安装流 import 本文件）。
 *
 * #64 A1/A2 事件型失败统一入口（2026-09-09 定案——toast = 操作回执；禁弹大框、禁页面长红字推 UI）：
 * marketplace 全视图共用一个失败通道：右下角 error toast（E6#13.5 notifications.show，settle 同源）。
 * 显示文本由调用方 t() 解析成当前语言传入（组件本地译）——与 settle 侧模块 i18n.t 同汇壳层单渲染。
 */

// #30.9b 失败 toast 文案走 i18n.t——非组件模块 import i18next 默认实例（serial-monitor 先例；
// 插件 i18n 资源已按 ns="translation" 合并进全局实例，t(key) 直取中英）
import i18n from "i18next";
import { classifyInstallError, failText, installFailLabelKey, updateFailText } from "./messages";
import { pluginDisplayNameOf } from "./catalogStore";

const lk = () => window.linkdesk;

/** E6#73g（S5）：市场自己的 source id——机器读的归属键，人类可读名由壳解析（见壳 `notif.ts`）。
 *  **一处定义、全部市场通知引用**：分组键必须同一个字面量，写散 = 同一次操作被劈成两组。 */
export const MARKET_SOURCE = "marketplace";

/** 发一条 error toast——进程不可用（预览环境/壳进程）静默 no-op，不影响调用方流程 */
export function notifyError(message: string): void {
  const show = lk()?.notifications?.show;
  // E6#73g（S5）：市场自报身份——本条与全部安装回执同属一个来源桶（面板一组、常驻配额一份）
  if (show) void show(message, { type: "error", source: MARKET_SOURCE });
}

/** 失败终局——归因 + 失败 toast[重试]。返回 false 供调用方直接当结果用。
 *  行内失败态由 job 行表达（壳侧 job 表 terminal:"failed" + error；市场视图经 `useInstallJob` 读），
 *  本函数不再写任何会话状态。 */
export async function settleInstallFailure(pluginId: string, downloadUrl: string, error: string | undefined): Promise<boolean> {
  const reason = classifyInstallError(error);
  // 失败 toast = 事件通道（右下角唯一事件反馈，11-API §三）——归因文案 + [重试] 主动作
  // （消费 E6#13.5f actions；command 走既有命令系统，marketplace.retryInstall 注册在 marketplaceShared
  //  模块顶 ensureMarketplaceCommands——本模块被全部市场池面 import，任意视图激活即注册，toast 落点不再
  //  依赖市场落地页 index.tsx 加载；args 带 pluginId+downloadUrl 使 [重试] 不依赖会话残留自给自足）。
  //  行内错误态由消费方从会话读。
  // E6#71j：失败 toast 长驻（persistent:true → 壳 ttl:0 不自动消失）——归因诊断需要时间读、用户决定重试
  //  还是放弃，不该 8s 静默溜走；常驻类互相淘汰（壳侧**按来源分桶各 5 条**，E6#73f S3 起，
  //  超出顶掉同来源最老的并在该组给「另有 N 条已折叠」汇总），不越摞越多。
  const show = lk()?.notifications?.show;
  if (show) {
    // E6#73e：① **带插件名**——此前只报「安装失败：网络连接不可用」，连点几个时用户不知道是哪一个；
    //         ② 归因认不出时**直显引擎原文**（failText，同 E6#71b 更新域先例）——「未知错误」是谎，
    //            用户得拿真因去判断该重试还是该放弃。
    const failName = pluginDisplayNameOf(pluginId);
    const failReasonText = failText((k) => i18n.t(k), installFailLabelKey, reason, error);
    void show(i18n.t("{{name}}：{{reason}}", { name: failName, reason: failReasonText }), {
      type: "error",
      // E6#73g（S5）：归市场来源桶——连装 N 个的失败条同组、共享那 5 条常驻配额（73f S3），
      // 且不会因「来源缺失」被劈进「其他」组跟无关通知混在一起。
      source: MARKET_SOURCE,
      persistent: true,
      actions: [
        {
          id: "retry",
          label: i18n.t("重试"),
          isPrimary: true,
          command: "marketplace.retryInstall",
          args: [{ pluginId, downloadUrl }],
        },
      ],
    });
  }
  return false;
}

/* ═══ E6#73j（G2）：更新失败 = 安装失败同等待遇（常驻 + [重试]） ═══
 *
 * 改前：更新失败走 `notifyError`（8 秒自灭、无按钮），而同一类失败在安装域是常驻 + [重试]。
 * 同一种事两套待遇，用户在更新上永远只能「再手动点一次详情页的更新钮」——还得先想起来去哪点。 */

/**
 * 更新失败终局——与 `settleInstallFailure` 同款（常驻 error + 归因 + 原文兜底 + [重试]）。
 * 归因文案走更新域字典（`updateFailText`），不与安装域混用。
 */
export function settleUpdateFailure(
  pluginId: string,
  displayName: string,
  downloadUrl: string,
  error: string | undefined,
): void {
  const show = lk()?.notifications?.show;
  if (!show) return;
  const reason = classifyInstallError(error);
  const reasonText = updateFailText((k) => i18n.t(k), reason, error);
  void show(i18n.t("{{name}}：{{reason}}", { name: displayName, reason: reasonText }), {
    type: "error",
    source: MARKET_SOURCE,
    // E6#71j / E6#73j：常驻——归因诊断需要时间读，重试与否是用户的决定，不该 8 秒静默溜走
    persistent: true,
    actions: [
      {
        id: "retry",
        label: i18n.t("重试"),
        isPrimary: true,
        command: "marketplace.retryUpdate",
        args: [{ pluginId, downloadUrl, displayName }],
      },
    ],
  });
}
