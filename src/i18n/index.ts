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
  parseMissingKeyHandler: (key) => key,
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
