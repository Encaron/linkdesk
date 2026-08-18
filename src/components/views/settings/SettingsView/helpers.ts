/**
 * SettingsView 辅助层——自 SettingsView.tsx 拆出（E5.8#0d.10-7a）。
 * lk()（window.linkdesk.configuration 访问守卫）+ 跨文件共享事件常量。
 * 依赖方向：无（被聚合器 / useSettingsEvents / SettingRow 消费）。
 */

function lk() {
  if (!window.linkdesk?.configuration) {
    throw new Error("[SettingsView] window.linkdesk.configuration 不可用");
  }
  return window.linkdesk.configuration;
}

const CUSTOM_EVENT_OPEN_KEYBINDINGS = "linkdesk:openKeybindingsSettings";

export { lk, CUSTOM_EVENT_OPEN_KEYBINDINGS };
