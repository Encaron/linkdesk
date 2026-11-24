/** 完全访问二次确认卡（手动切换 / AI 提权共用同一张）——纯数据，供壳命令与主进程共用。 */
import type { AiConfirmCardPayload } from "./types";

export function buildFullAccessCard(reason?: string): AiConfirmCardPayload {
  return {
    kind: "full",
    titleKey: "开启完全访问",
    subtitleKey: "所有操作都不再询问，直到你手动改回。",
    target: {
      icon: "!",
      titleKey: "完全访问",
      metaKey: "常驻生效，直到你在设置中恢复",
      chipKey: "高风险",
    },
    consequences: [
      "不再询问：写文件、改设置、安装 / 更新 / 卸载插件、处理主软件更新。",
      "仍然拦截：修改权限设置本身（仅限你）、受保护命令、不在能力清单内的操作。",
      "每一次操作都会记账；你可以在「设置 → AI 接入 → 记录」中回看。",
    ],
    aiReason: reason,
    effectKey: "开启期间，AI 的操作由你承担。你可以在「设置 → AI 接入 → 权限档位」中随时恢复。",
    responsibilityKey: "点击「仍要开启完全访问」即代表你已阅读并接受以上后果。",
    confirmKey: "仍要开启完全访问",
    cancelKey: "取消",
    danger: true,
  };
}
