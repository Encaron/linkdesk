import i18n from "i18next";
import { initReactI18next } from "react-i18next";

i18n.use(initReactI18next).init({
  lng: "zh",
  fallbackLng: "zh",
  interpolation: {
    escapeValue: false, // React already escapes
  },
  // 第 2 层退路：t(key) → key 不在翻译表 → 返回 key 本身（key = 中文原文）
  // 第 1 层翻译资源由插件系统提供（lang-defaults 工厂插件 → LanguageRegistry）
  // 🔴 i18next 文档：parseMissingKeyHandler 返回值不经过插值器——{{count}} 等占位符原样输出。
  // 修复：手动调用 interpolator.interpolate()，让 key 中的 {{var}} 被 t() options 替换。
  parseMissingKeyHandler: (key, _defaultValue, options) => {
    if (options && typeof key === "string" && key.includes("{{")) {
      try {
        return i18n.services.interpolator.interpolate(key, options, i18n.language, {});
      } catch { /* interpolator 异常 → 返回原始 key */ }
    }
    return key;
  },
});

// E3c #40：插件 WebView 语言同步——接收壳广播的翻译资源
if (typeof window !== "undefined") {
  const linkdesk = window.linkdesk;
  // E5.5#7 fix: API 名统一为 language（零兼容——不存在 lang 别名）
  const langApi = linkdesk?.language;
  if (langApi) {
    const applyLang = (data: { lang: string; resources: Record<string, unknown> }) => {
      if (!data?.resources) return;
      for (const [lng, bundle] of Object.entries(data.resources)) {
        if (bundle && typeof bundle === "object") {
          i18n.addResourceBundle(lng, "translation", bundle, true, true);
        }
      }
      if (data.lang) {
        // E5.6#10f：池 WebView 初始 lng="zh" 无资源，首渲用 key fallback。
        // addResourceBundle 不触发 react-i18next 重渲染，changeLanguage 同语言 no-op。
        // 强制切到临时语言再切回来——两次真正的 languageChanged 事件 → useTranslation 拿到译文。
        if (i18n.language === data.lang) {
          const temp = data.lang === "zh" ? "en" : "zh";
          i18n.changeLanguage(temp);
        }
        i18n.changeLanguage(data.lang);
      }
    };

    const initial = langApi.getInitial();
    if (initial) applyLang(initial);

    // 订阅后续语言变更
    langApi.onChange(applyLang);
  }
}

export default i18n;
