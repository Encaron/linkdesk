/**
 * DetailOverviewTab——详情「详情」tab 渲染面：新版本块 + 缺依赖块 + 截图画廊 + README。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 的 `tab === "overview"` 段原样搬出，
 * 零行为变更。
 *
 * 四段的出现时机全由调用方算好的值决定（`hasUpdate` / `missingDeps.length` / `shots.length` /
 * `readme.mode`）——本件零业务判断，只有版式。
 */

import { useTranslation } from "react-i18next";
import { MarkdownView } from "@linkdesk/ui";

export default function DetailOverviewTab({
  hasUpdate,
  updateTarget,
  localVer,
  missingDeps,
  depLabel,
  shots,
  readme,
  showDesc,
  descText,
  nameText,
  onJumpToDep,
  onGotoChangelog,
}: {
  hasUpdate: boolean;
  updateTarget?: string;
  localVer?: string;
  missingDeps: string[];
  depLabel: (dep: string) => string;
  shots: string[];
  readme: { mode: "loading" | "content" | "none"; content?: string; assetBase?: string };
  showDesc: boolean;
  descText: string;
  nameText: string;
  onJumpToDep: (dep: string) => void;
  onGotoChangelog: () => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {/* E6#33b 第四维「有新版本可用」块（04 §二·五 mockup 帧 6）——主区顶部 accent 信息带：
       *  当前安装/市场最新两版本 + 引导点「更改日志」tab（dot 同语义）。动作在 action bar 首槽。 */}
      {hasUpdate && updateTarget && (
        <div className="mpd-update-block" role="status">
          <span className="codicon codicon-arrow-up mpd-update-block-icon" />
          <div className="mpd-update-block-body">
            <div className="mpd-update-block-title">{t("有新版本可用")}</div>
            <p className="mpd-update-block-lead">
              {t("当前安装 {{localVersion}}，市场最新 {{remoteVersion}}", {
                localVersion: localVer ? `v${localVer}` : "—",
                remoteVersion: `v${updateTarget}`,
              })}
            </p>
            <button className="mpd-update-block-hint" onClick={onGotoChangelog}>
              {t("更新内容见「更改日志」tab")}
              <span className="codicon codicon-arrow-right" />
            </button>
          </div>
        </div>
      )}
      {/* 30.5e：挂起·缺依赖 → 主区「依赖未满足」块——缺失依赖行标黄 ✕ 点击跳其详情页 */}
      {missingDeps.length > 0 && (
        <div className="mpd-deps-block">
          <div className="mpd-deps-title">{t("依赖未满足")}</div>
          <p className="mpd-deps-lead">
            {t("此插件声明了依赖但尚未全部安装——补齐缺失依赖后自动解除挂起。")}
          </p>
          <div className="mpd-deps-list">
            {missingDeps.map((dep) => (
              <button
                key={dep}
                className="mpd-dep-item"
                onClick={() => onJumpToDep(dep)}
                title={t("查看依赖")}
              >
                <span className="codicon codicon-close mpd-dep-x" />
                <span className="mpd-dep-name">{depLabel(dep)}</span>
                <span className="mpd-dep-state">{t("未安装")}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 30.6c1：截图画廊（screenshots[] 横向滚动）——作者自制图以 img 元素直载（同 downloadUrl 信任级） */}
      {shots.length > 0 && (
        <div className="mpd-gallery" role="region" aria-label={t("截图")}>
          {shots.map((s, i) => (
            <img
              key={i}
              className="mpd-gallery-shot"
              src={s}
              alt={nameText}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                // 远端截图加载失败 → 藏起坏图占位（诚实不显示 broken glyph）
                e.currentTarget.style.display = "none";
              }}
            />
          ))}
        </div>
      )}

      {/* 30.6b：README markdown 渲染（已装读包 / 未装 readmeUrl / 降级 description） */}
      {readme.mode === "loading" && <p className="mpd-readme-note">{t("加载中...")}</p>}
      {readme.mode === "content" && readme.content && (
        <MarkdownView markdown={readme.content} className="mpd-readme" assetBase={readme.assetBase} />
      )}
      {readme.mode === "none" && showDesc && <p className="mpd-description">{descText}</p>}
    </>
  );
}
