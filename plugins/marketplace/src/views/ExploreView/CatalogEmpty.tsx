/**
 * CatalogEmpty——探索视图的四种「无行可画」占位（加载中 / 目录为空 / 目录故障 / 搜索零命中）。
 * E6#86b（第 3.6.3 轮）feature-folder 拆分：自 `views/ExploreView.tsx` 的各 early return 原样搬出，
 * 零行为变更（文案 key、className、[重试] 回调全保留）。
 *
 * 目录防御（E6#30f）：空态三分支——ok 空（源连上但目录空）「暂无插件」（非故障，无重试）；offline 空态
 *   「无法加载市场」+ [重试]；corrupt 空态「目录损坏」+ [重试]。
 */

import { useTranslation } from "react-i18next";

/** 目录 + 本地列表任一未到——双门占位（防本地列表未到前整屏误显「安装」） */
export function CatalogLoading() {
  const { t } = useTranslation();
  return <div className="ms-empty">{t("加载中...")}</div>;
}

/** 源连上但目录空（官方仓库建好未上架）——非故障，不给无意义重试 */
export function CatalogNone() {
  const { t } = useTranslation();
  return <div className="ms-empty">{t("市场暂无插件")}</div>;
}

/** corrupt / offline 才示故障 + [重试]（修实证 bug：entries 空一律当故障显示「无法加载」） */
export function CatalogErrorState({ corrupt, onRetry }: { corrupt: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="ms-empty">
      <span className="ms-empty-icon codicon codicon-error" />
      <p>{corrupt ? t("市场目录数据已损坏，请稍后重试") : t("无法加载市场，请检查网络后重试")}</p>
      <button className="ms-empty-action" onClick={onRetry}>
        {t("重试")}
      </button>
    </div>
  );
}

/** 有搜索词且零命中（无搜索词 + entries>0 → 全量非空；entries 空在门面已由上面两个空态承担） */
export function CatalogNoMatch() {
  const { t } = useTranslation();
  return <div className="ms-empty">{t("未找到匹配的插件")}</div>;
}
