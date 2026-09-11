/**
 * DetailHeader——详情页头部（#63a B1：三段一行——icon ｜ id/副题/简述列 ｜ 右上动作列）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 的 `<header className="mpd-header">`
 * 段原样搬出，零行为变更。
 *
 * 动作列（`.mpd-acts`）是头部的第三个 flex 子元素——由调用方以 `actions` 传入（`DetailActionBar`），
 * 本件只管 icon + 标题三行。窄容器允许换行兜底见 CSS。
 */

import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Badge, PluginIcon } from "@linkdesk/ui";

export default function DetailHeader({
  pluginId,
  iconManifest,
  nameText,
  versionText,
  authorText,
  showDesc,
  descText,
  isCore,
  official,
  actions,
}: {
  pluginId?: string;
  iconManifest: ComponentProps<typeof PluginIcon>["manifest"];
  nameText: string;
  versionText?: string;
  authorText?: string;
  showDesc: boolean;
  descText: string;
  isCore: boolean;
  official?: boolean;
  actions: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <header className="mpd-header">
      <div className="mpd-icon">
        {/* E6#69c/#69f：iconManifest 恒有值（pickIdentityArt 默认彩色块兜底）——无条件渲染 PluginIcon，
         *  codicon-symbol-misc 占位分支已删；96px 展示框内 img 型显 Type-2 身份图、codicon/lucide 型显图标 */}
        <PluginIcon pluginId={pluginId ?? ""} manifest={iconManifest} alt={nameText} />
        {isCore && <span className="mpd-icon-badge codicon codicon-star-full" />}
      </div>
      <div className="mpd-header-details">
        <div className="mpd-title-row">
          <h1 className="mpd-name">{nameText}</h1>
          {versionText && <span className="mpd-version">v{versionText}</span>}
          {isCore && <Badge>{t("内置")}</Badge>}
          {/* E6#30.8f：官方发布徽标——胜出条目来自官方默认源（entry.official 合并注入），第三方源不伪造 */}
          {official && (
            <Badge title={t("官方发布")}>
              <span className="codicon codicon-verified" /> {t("官方发布")}
            </Badge>
          )}
        </div>
        {authorText && <p className="mpd-subtitle">{authorText}</p>}
        {showDesc && <p className="mpd-short-desc">{descText}</p>}
      </div>

      {/* ── 右上动作列 .mpd-acts（#63a：原 header 下方 action-bar 整行收编此列——30.5b 三态 + 30.5e 挂起态；
       *  版本偏好 autoUpdate 副控制落 row2（mockup 01 .pdva-acts）。#64 A2/A3 后本列**零行内红字**：
       *  事件型失败全走右下角 error toast（定案 5 禁 reflow），持久态只剩「安装失败 → 安装钮原位变红重试」 ── */}
      {actions}
    </header>
  );
}
