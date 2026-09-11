/**
 * ChangelogTab——详情「更改日志」tab 渲染面（E6#30.6e，mockup 帧 10）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `views/DetailChangelogTab.tsx` 迁入改名（私有子件归位宿主
 * 同名字夹），零行为变更；仅相对 import 随层级 +1 调整。
 *
 *   数据源分装态（04-详情页设计 §三）：
 *   - 已装 = 包内 CHANGELOG.md（readInstalledPackageFile——本地权威：装的是哪个版本看哪个版本的说明）；
 *   - 未装 = 目录 versions[].changelog（marketplace.json 扩展字段——SDK publish 暂不写，真数据多为空 →
 *     诚实显示「此版本未提供变更说明」）。
 *   版本倒序最新在前 + 「最新/已安装」徽标。有更新时远程「最新」+ 本地「已安装」两版并排 = E6#33b
 *   （主软件更新域，本行不重复实现——无更新态只画本地/目录单源）。
 */

import { useTranslation } from "react-i18next";
import { MarkdownView } from "@linkdesk/ui";
import type { CatalogEntry } from "../../services/marketCatalog";

type Props = {
  /** 已装（读包 CHANGELOG.md）还是未装（目录 versions[].changelog） */
  installed: boolean;
  /** 已装包内 CHANGELOG.md——undefined=读取中 / null=包内无 / string=原文 */
  localChangelog?: string | null;
  /** 已装版本号（「已安装」徽标旁 vtag） */
  localVersion?: string;
  /** 目录版本史（最新在前）——未装展示源 */
  versions?: CatalogEntry["versions"];
  /** 目录当前最新版本号（versions 缺失时的单卡数据源） */
  latestVersion?: string;
  /** E6#33b：更新 overlay——可更新的远端稳定版信息（04 §二·五 mockup 帧 10 两版并排：
   *  present 时已装分支先渲染远端「最新」块，再接本地「已安装」块；absent = 无更新，现单源行为） */
  remote?: { version: string; date?: string; body?: string };
};

/** 日期展示辅助——ISO/UTC 串只留 YYYY-MM-DD（作者多写 2026-09-08T…），非日期原样显示 */
function fmtDate(iso?: string): string {
  if (!iso) return "";
  const s = iso.trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

export default function ChangelogTab({
  installed,
  localChangelog,
  localVersion,
  versions,
  latestVersion,
  remote,
}: Props) {
  const { t } = useTranslation();

  /* 版本块（渲染纯函数——t 来自本组件 hook，非子组件无 hook 规则问题） */
  const versionBlock = (version: string, opts: { date?: string; isLatest?: boolean; body?: string }) => (
    <div className="mpd-chg-ver" key={version + (opts.date ?? "")}>
      <div className="mpd-chg-ver-head">
        <span className="mpd-chg-ver-tag">v{version}</span>
        {opts.isLatest && <span className="mpd-chg-tag mpd-chg-tag-latest">{t("最新")}</span>}
        {opts.date && <span className="mpd-chg-date">{fmtDate(opts.date)}</span>}
      </div>
      {opts.body && opts.body.trim() ? (
        <MarkdownView markdown={opts.body} />
      ) : (
        <p className="mpd-chg-none">{t("此版本未提供变更说明")}</p>
      )}
    </div>
  );

  /* 已装：包内 CHANGELOG.md 本地权威源；有更新（remote）→ 远端「最新」块置顶 + 本地「已安装」块（04 §二·五 mockup 帧 10 两版并排）。
   *  remote 块内容 = 目录 versions[].changelog（远端新包未下载无法读包内文件——诚实以目录注记为准，缺即显示未提供）。 */
  if (installed) {
    if (localChangelog === undefined) {
      return <p className="mpd-chg-empty">{t("加载中...")}</p>;
    }
    const hasLocal = !!localChangelog && !!localChangelog.trim();
    if (!remote && !hasLocal) {
      return <p className="mpd-chg-empty">{t("该插件未附带更改日志")}</p>;
    }
    return (
      <div className="mpd-chg">
        {remote && versionBlock(remote.version, { date: remote.date, isLatest: true, body: remote.body })}
        {hasLocal ? (
          <div className="mpd-chg-ver">
            <div className="mpd-chg-ver-head">
              {localVersion && <span className="mpd-chg-ver-tag">v{localVersion}</span>}
              <span className="mpd-chg-tag mpd-chg-tag-installed">{t("已安装")}</span>
            </div>
            <MarkdownView markdown={localChangelog} />
          </div>
        ) : (
          <p className="mpd-chg-empty">{t("该插件未附带更改日志")}</p>
        )}
      </div>
    );
  }

  /* 未装：目录版本史（最新在前）——versions 缺失用 entry.version 单卡兜底 */
  const rows =
    versions && versions.length > 0
      ? versions.map((v, i) => ({ version: v.version, date: v.publishedAt, isLatest: i === 0, body: v.changelog }))
      : latestVersion
        ? [{ version: latestVersion, date: undefined, isLatest: true, body: undefined }]
        : [];
  if (rows.length === 0) {
    return <p className="mpd-chg-empty">{t("该插件未附带更改日志")}</p>;
  }
  return <div className="mpd-chg">{rows.map((r) => versionBlock(r.version, r))}</div>;
}
