/**
 * 设置视图插件。
 * Phase 4：核心控制面（core: true），不可卸载。
 * E5.8#41.14：内置设置纯插件化——SettingsView 集群整迁本插件 src/views/（壳 src/components/views/settings 已删）。
 * 零 @src/core import——共享控件走 @linkdesk/ui（E6#54c），数据全走 window.linkdesk.*。
 */
export { default } from "./views/SettingsView";
