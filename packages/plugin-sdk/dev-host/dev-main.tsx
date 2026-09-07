/**
 * dev 宿主入口（E6#23.5/#24b）——纯浏览器最小壳：顶部 dev 条 + React root 渲染正在开发的插件。
 *
 * 接线（均由 `linkdesk-plugin-sdk dev` 的 vite 配置注入，见 src/dev-server.ts）：
 *   - `__linkdesk_dev_entry__`：resolve.alias 虚拟 id → 插件根 plugin.json 的 entry 绝对路径。
 *     静态 import → 入口是模块图常规成员 → vite 标准 HMR 全链（改码即热更）。
 *   - `__LINKDESK_DEV_I18N__`：define 字面量 = { 语言码: { translation: {…} } }（现读插件
 *     contributes.i18n 声明的各语言 JSON）。
 *   - `__LINKDESK_DEV_PLUGIN_ID__`：define 字面量 = pluginId（顶部 dev 条展示）。
 *
 * 契约：宿主把插件当「激活标签」渲染（{ isActive: true }）——对标壳渲染视图插件的语义；
 * keep-alive / tabId / sourceId 在纯浏览器 dev 无对应物（那是壳标签页系统的概念）。
 * i18n：lng = 插件第一个声明的语言（通常 en）；key 缺失时 i18next 返回 key 本身——中文 key 即中文兜底。
 */
import { createRoot } from "react-dom/client";
import i18n from "i18next";
import { initReactI18next, I18nextProvider } from "react-i18next";
import { injectDevMockApi } from "./mock.js";
import PluginView from "__linkdesk_dev_entry__";

declare const __LINKDESK_DEV_I18N__: Record<string, { translation: Record<string, unknown> }>;
declare const __LINKDESK_DEV_PLUGIN_ID__: string;

const resources = __LINKDESK_DEV_I18N__;
const lng = Object.keys(resources)[0] ?? "en";

void i18n.use(initReactI18next).init({
  resources,
  lng,
  fallbackLng: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

injectDevMockApi();

const pluginIdEl = document.getElementById("ld-plugin-id");
if (pluginIdEl) pluginIdEl.textContent = __LINKDESK_DEV_PLUGIN_ID__;

const rootEl = document.getElementById("ld-root");
if (rootEl) {
  createRoot(rootEl).render(
    <I18nextProvider i18n={i18n}>
      <PluginView isActive />
    </I18nextProvider>,
  );
}
