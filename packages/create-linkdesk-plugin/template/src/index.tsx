/**
 * {{displayName}}——LinkDesk 插件主视图（由 create-linkdesk-plugin 生成）。
 *
 * 视图插件契约（E5.8，见 docs/03-插件制造/01-API契约.md）：壳以 { isActive, tabId?, sourceId? }
 * 渲染本文件 default 导出的组件：
 *   - isActive  本标签当前是否聚焦。keep-alive 下非聚焦标签仍在渲染，isActive 只用于
 *               gate「聚焦才跑」的副作用（如自动保存），切勿用它整块 blank 掉内容。
 *   - tabId     本标签页 id。
 *   - sourceId  上下文数据（文件路径 / 数据源等），编辑器类插件用它定位内容。
 *
 * 样式：LinkDesk 主题色一律走 CSS 变量 var(--xxx)（见 index.css 示例），禁硬编码 hex。
 * 文案：用 t() 读——key 就是中文原文，英文译文放 i18n/en.json（见 05-UI写法规约.md）。
 * 壳已 external react/react-dom/react-i18next/i18next——构建不会打进包，插件工程无需 npm i 它们。
 */

import { useTranslation } from "react-i18next";
import "./index.css";

export default function HelloPlugin(_props: { isActive?: boolean; tabId?: string; sourceId?: string }) {
  const { t } = useTranslation();

  return (
    <div className="starter">
      <h2 className="starter__title">{t("插件跑起来了 ✨")}</h2>
      <p className="starter__text">{t("这是你的第一个 LinkDesk 插件。")}</p>
      <p className="starter__hint">
        <code>src/index.tsx</code> {t("是插件本体——改它，浏览器预览即时刷新。")}
      </p>
      <p className="starter__hint">
        <code>npm run build</code> {t("打包出分发文件，可装进 LinkDesk 或发布到市场。")}
      </p>
      <p className="starter__hint">{t("目录该放哪、发布怎么做，都写在 README.md 里。")}</p>
    </div>
  );
}
