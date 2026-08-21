/**
 * SettingsView 辅助层——自壳迁入（E5.8#41.14）。
 * lk()（window.linkdesk.configuration 访问守卫）。
 * E5.8#41.14：CUSTOM_EVENT_OPEN_KEYBINDINGS 已删——死路由（kebab/camel 字面量错配永不命中），
 * 切快捷键 tab 改契约双通道（configuration.consumeOpenKeybindings/onRequestOpenKeybindings）。
 * 依赖方向：无（被聚合器 / useSettingsEvents / SettingRow 消费）。
 */

function lk() {
  if (!window.linkdesk?.configuration) {
    throw new Error("[SettingsView] window.linkdesk.configuration 不可用");
  }
  return window.linkdesk.configuration;
}

export { lk };
