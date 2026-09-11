/**
 * CatalogRowAction——目录行的行态动作槽（安装钮 / 安装中进度 / 等待安装中 / 失败·归因 + [重试] /
 * 已禁用 / 已安装 / 可更新）。
 * E6#86b（第 3.6.3 轮）feature-folder 拆分：自 `views/ExploreView.tsx` 的 `renderRow` 内动作分支原样搬出，
 * 零行为变更（分支顺序、文案 key、className、title 全保留）。
 *
 * 行态（#30.9）：本行 = 全局单活跃会话 pluginId →「安装中 62%」进度徽标（30.9a M4 二）/「安装失败·归因」
 *   + [重试]（30.9b M4 三）；离线（G3）≠ 失败——钮置灰 + title「联网后重试」，无 [重试]。
 */

import { useTranslation } from "react-i18next";
import {
  classifyInstallError,
  installFailLabelKey,
  retryMarketInstall,
} from "../../services/marketplaceShared";
import { installJobLabel, pickInstallJob } from "../../services/installJobs";
import type { CatalogEntry } from "../../services/marketCatalog";
import type { RowStatus } from "./useCatalogStatus";

export default function CatalogRowAction({
  entry,
  status,
  online,
  onInstall,
}: {
  entry: CatalogEntry;
  status: RowStatus;
  online: boolean;
  onInstall: (entry: CatalogEntry) => void;
}) {
  const { t } = useTranslation();
  /* #30.9 行态：本行 job（进度/失败由壳侧 job 表按 pluginId 匹配而来——详情页起装的 job 也同步到目录行）。
   *  E6#73c 第 2 步：并发上限在壳（N=3），另一插件安装中不再影响本行——点得动、进得去、画得出来。 */
  const jobHere = pickInstallJob(entry.id);
  const installingHere = jobHere?.state === "running";
  const errHere = jobHere?.state === "settled" && jobHere.terminal === "failed" ? jobHere : null;
  const queuedHere = jobHere?.state === "queued";

  if (status === "install") {
    if (installingHere) {
      /* 30.9a M4 二：安装中——阶段/进度标签（校验中/下载中 x%/解压中/加载中，i18n 全量已有 key） */
      return (
        <span className="ms-catalog-status installing" title={t("安装插件")}>
          <span className="codicon codicon-cloud-download" />
          {installJobLabel(t, jobHere)}
        </span>
      );
    }
    if (queuedHere) {
      /* E6#73c 第 1 步：等待安装中——回执（此前这里是一条静默 return false：点了等于没点）。
       *  复用 installing 徽标样式（零新 CSS）；文案与 §五 I.4 排队行同词。 */
      return (
        <span className="ms-catalog-status installing" title={t("等待安装中")}>
          <span className="codicon codicon-clock" />
          {t("等待安装中")}
        </span>
      );
    }
    if (errHere) {
      /* 30.9b M4 三：安装失败——归因文案截断 + [重试]（手动无自动风暴；✕ 关闭归详情行，目录行不重复，
       *  另起安装会覆盖失败会话自清） */
      return (
        <span className="ms-item-fail" title={errHere.error}>
          <span className="codicon codicon-error" />
          <span className="ms-item-fail-text">
            {t(installFailLabelKey(classifyInstallError(errHere.error)))}
          </span>
          <button
            className="ms-item-fail-act"
            onClick={(e) => {
              e.stopPropagation();
              void retryMarketInstall(entry.id, entry.downloadUrl ?? "", entry.name);
            }}
            title={t("重试")}
          >
            <span className="codicon codicon-refresh" />
          </button>
        </span>
      );
    }
    return (
      <button
        className="ms-item-install-btn"
        onClick={(e) => {
          // 行点击开详情（30.5b）——安装钮自身动作需隔离，别误触开标签
          e.stopPropagation();
          onInstall(entry);
        }}
        disabled={!online} // #30.9b 离线态（G3）：置灰不发请求，联网自动回可用
        title={!online ? t("联网后重试") : t("安装插件")}
      >
        <span className="codicon codicon-cloud-download" /> {t("安装")}
      </button>
    );
  }

  if (status === "disabled") {
    /* 已装但禁用（list() 排除禁用插件）——静置徽标，无动作（#30.9d 冲突由此防） */
    return (
      <span className="ms-catalog-status disabled" title={t("已禁用")}>
        <span className="codicon codicon-circle-slash" />
        {t("已禁用")}
      </span>
    );
  }

  const isUpdate = status === "update";
  return (
    <span className={`ms-catalog-status${isUpdate ? " update" : ""}`} title={t(isUpdate ? "可更新" : "已安装")}>
      <span className={`codicon ${isUpdate ? "codicon-arrow-up" : "codicon-check"}`} />
      {t(isUpdate ? "可更新" : "已安装")}
    </span>
  );
}
