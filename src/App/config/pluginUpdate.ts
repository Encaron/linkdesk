/**
 * 「插件更新」三键声明——并入「通用」组，紧随「更新」节（spec §3.5 / §9.5）。
 *
 * 为什么是**三个键而不是一个单选**（D5 拍板 2026-11-24）：官方与信任来源必须能**同时**免问；
 * 互斥单选在语义上做不到「两个都开」。三条各自独立：
 *   `app.pluginUpdate.silentOfficial`       官方目录的同源更新不逐项询问（默认开）
 *   `app.pluginUpdate.silentTrustedSources` 已信任第三方来源的同源更新不逐项询问（默认关）
 *   `app.pluginUpdate.trustedSources`       信任来源清单（sourceId 数组；唯一 store）
 *
 * 🔴 **不可关的三条**（不在这里声明，因为压根没有开关）：首装恒问、来源/仓库/发布者变更恒问、
 *    降级恒问——见 `src/core/services/plugins/install/policy.ts` 的判定顺序。
 *
 * 🔴 声明口径（2026-11-24 用户点名的返工先例：市场「点图标同时打开商店」当时漏了在设置里声明）：
 *    **凡壳侧新增、用户可读可写的配置键，必须在本文件声明**——⛔ 不许只在代码里 `getConfigurationValue`
 *    读一个设置页看不见的裸键。三条键全部声明，消费方 = `install/trust.ts`（唯一读取处）。
 *
 * 落点：`src/App/config/update.ts` 已在「通用」组注册「更新」节；本文件在其后注册「插件更新」节。
 * 设置页是普通插件、可整套替换——这里是**配置声明**，任何设置插件都应渲染；
 * `trustedSources` 用共享 `stringList` 控件（通用渲染器直接出，⛔ 不需要设置插件发版）。
 */

import { registerConfiguration } from "../../core/registry/ConfigurationRegistry";
import { APP_PLUGIN_ID } from "../../core/services/plugins/PluginStateService";
import { DEFAULT_POLICY, POLICY_KEYS } from "../../core/services/plugins/install";

/** t() 类型——仅声明组取 key（同 config/update.ts） */
type ConfigT = (key: string) => string;

export function registerPluginUpdateConfiguration(t: ConfigT): void {
  registerConfiguration(APP_PLUGIN_ID, {
    title: t("插件更新"),
    properties: {
      [POLICY_KEYS.silentOfficial]: {
        type: "boolean",
        group: t("插件更新"),
        default: DEFAULT_POLICY.silentOfficial,
        title: t("官方目录更新不再询问"),
        description: t("官方目录的同源更新（同一来源、版本更高、校验通过）直接安装，不再逐项询问"),
      },
      [POLICY_KEYS.silentTrustedSources]: {
        type: "boolean",
        group: t("插件更新"),
        default: DEFAULT_POLICY.silentTrustedSources,
        title: t("信任来源的更新不再询问"),
        description: t("你在下方信任过的第三方来源，其同源更新直接安装，不再逐项询问"),
      },
      [POLICY_KEYS.trustedSources]: {
        type: "array",
        group: t("插件更新"),
        default: [],
        uiHint: "stringList",
        title: t("信任来源"),
        // 「覆盖范围」写进说明——每行状态由确认卡与来源清单显式展示，⛔ 不让用户猜「在这一行是信任还是不信任」。
        description: t("已信任来源的来源 ID（每行一条）。每个来源只影响它的同源更新；首次安装与来源变更仍需确认"),
      },
    },
  });
}
