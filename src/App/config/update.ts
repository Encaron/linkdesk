/**
 * 「更新」配置组声明——壳注册第三配置贡献（pluginId "update"，标题「更新」）。
 * E6#57.9a（06-主软件更新 / 00-README §三⑦）：`app.update.mode`（string enum auto/manual，
 *   默认 auto）+ `app.update.showReleaseNotes`（boolean，默认 true）。
 * 自 startup.ts 拆出（结构对标 config/appearance.ts，E5.8 Phase 11.13 的 Domain 拆解先例）：
 *   t() 注入而非模块级捕获——语言切换重跑（HMR/StrictMode）时注册文案取首语言。
 *
 * 🔴 **检查频率（30 秒首次延迟 / 每 4 小时）不在这里**——它是**内置常量、不暴露配置项**
 *   （01 §2.2，2026-08-30 拍板），沉在调度器 src/hooks/useUpdateScheduler.ts。
 *   本组只声明「用户可选项」，两键都不带 onApply：它们是**被读取的存量值**，没有「应用」这个动作
 *   （对标 app.menuStyle 的纯存储 enum 形态）。
 *
 * 消费方：`app.update.mode` ← 后台调度器（#57.9d，读了决定自动/手动）；
 *        `app.update.showReleaseNotes` ← 更新后首启自动打开发行说明（05 §2.5，消费点在 #57.13）。
 */
import { registerConfiguration } from "../../core/registry/ConfigurationRegistry";

/** t() 类型——仅声明组取 key（同 config/appearance.ts） */
type ConfigT = (key: string) => string;

export function registerUpdateConfiguration(t: ConfigT): void {
  registerConfiguration("update", {
    title: t("更新"),
    properties: {
      // 对标 VS Code `update.mode` 简化为两档（砍 none/start——「检查更新」入口恒显，01 §1.2）。
      // 🔴 值域是英文 `auto/manual`（对标 app.menuStyle 的 titlebar/hamburger/both）——
      //   设置页枚举值不参与 i18n，显示文案由 enumDescriptions 出中文。
      // 🔴 「手动」不等于「检查更新入口消失」：入口按**恒显原则**在任何 mode 下都在（03 §2.2）。
      "app.update.mode": {
        type: "string",
        group: t("检查更新"),
        default: "auto",
        enum: ["auto", "manual"],
        enumDescriptions: [
          t("自动——启动后检查一次，此后每 4 小时检查一次"),
          t("手动——只有你自己点「检查更新」时才检查"),
        ],
        description: t("检查更新的方式——自动后台检查 / 仅在手动点击时检查"),
      },
      // 05 §2.5：更新到新版本后**首次启动**自动打开发行说明（不是"每次发现有新版本就弹"）。
      // 关了它不砍入口——帮助菜单「显示发行说明」始终可用。
      "app.update.showReleaseNotes": {
        type: "boolean",
        group: t("发行说明"),
        default: true,
        description: t("更新到新版本后，首次启动时自动打开发行说明"),
      },
    },
  });
}
