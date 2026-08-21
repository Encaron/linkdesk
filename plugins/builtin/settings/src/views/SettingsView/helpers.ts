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

/**
 * 本设置插件自己的 factoryRole（#41.14 ⑤）。
 * 角色分组渲染排除自身——自身角色的切换 = 顶部通用区（#41.13，切换入口本身就是设置），不进导航组；
 * 其余 factoryRole ≥2 候选才建角色分组。复制为第三方设置插件时与 plugin.json 的 factoryRole 同步改。
 */
const OWN_FACTORY_ROLE = "settings";

export { lk, OWN_FACTORY_ROLE };
