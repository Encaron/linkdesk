/**
 * HelloView——demo-en 插件「Greetings」视图。E5.8#37.9.2 纯英文示范插件。
 *
 * 作者假设：只会英文的外国作者，插件主要给本国（英文）用户用。
 * 演示点：
 * 1. i18n key = 英文原文——本插件零 contributes.i18n、零翻译文件。任意应用语言下
 *    缺译文 → parseMissingKeyHandler 静默回退显示 key 本身：en 模式自然显示英文，
 *    zh/ja 模式同样显示英文（key 即原文 = 作者母语，读者就是目标用户，无需翻译）。
 * 2. 视图契约 = { isActive: boolean }，之外标准 React 自由发挥；零 @src import（插件独立铁律）。
 * 3. 数据与 UI 文字分离：计数 clicks 是数据不进 t()，文案全走 t()。
 * 4. 空态指引（ui-ux-pro-max Empty States）：有用消息 + 动作按钮，不空白屏。
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import "../styles/HelloView.css";

export default function HelloView() {
  const { t } = useTranslation();
  const [clicks, setClicks] = useState(0);

  return (
    <div className="hello-view">
      <div className="hello-card">
        <span className="codicon codicon-heart hello-mark" aria-hidden="true" />
        <h3 className="hello-title">{t("Hello from an English-only plugin")}</h3>
        <p className="hello-body">
          {t("This plugin was written by an author who only speaks English. Every UI string is an English i18n key, so it reads naturally in every app language.")}
        </p>
        <p className="hello-body hello-muted">
          {t("No translation file ships with this plugin. The shell falls back to the key itself whenever no translation matches — keys are the original text.")}
        </p>
        <div className="hello-actions">
          <button className="hello-btn" onClick={() => setClicks((c) => c + 1)}>
            <span className="codicon codicon-star-full" aria-hidden="true" />
            {t("Clicks")}: {clicks}
          </button>
        </div>
        <p className="hello-hint">
          {t("Want to translate this plugin? Add a contributes.i18n entry — the keys above are the source language.")}
        </p>
      </div>
    </div>
  );
}
