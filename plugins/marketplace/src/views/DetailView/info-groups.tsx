/**
 * info-groups——元数据侧栏里内容较多的两个组的**行数组**构造器 + 两种「一组值」渲染
 * （#63c B3，mockup 04 定稿）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 的 `depValues` / `dependentValues` /
 * infoGroups IIFE 的「资源」「依赖 · 环境」两段原样搬出，零行为变更。
 *
 * 两个构造器返回**行数组**而非渲染好的组壳——组壳统一由 `info-bits.InfoGroup` 出，
 * 「空组不渲染」的判据因此只有一处（归一化；`resourcesGroupOf` 返回空数组即整组消失）。
 * 行内判据照抄 VS Code `renderExtensionResources`：每行「有才显」，一行都没有 = 整组不画。
 */

import type { ReactNode } from "react";
import { Dash, ExternalLink, InfoItem } from "./info-bits";

/** i18n 取值签名（同 `installJobs.installJobLabel` 的写法——不引 i18next 类型，结构即契约） */
type T = (key: string, opts?: Record<string, unknown>) => string;

/** 依赖值——缺失依赖标黄 ✕ + 点击跳其详情页（30.5e/30.6c3） */
export function DepValues({
  deps,
  missing,
  labelOf,
  onJump,
}: {
  deps: string[];
  missing: string[];
  labelOf: (dep: string) => string;
  onJump: (dep: string) => void;
}) {
  if (deps.length === 0) return <Dash />;
  return (
    <span className="mpd-info-deps">
      {deps.map((dep) => {
        const miss = missing.includes(dep);
        return (
          <button
            key={dep}
            className={miss ? "mpd-info-dep warn" : "mpd-info-dep"}
            onClick={() => onJump(dep)}
            title={dep}
          >
            {miss && <span className="codicon codicon-close" />}
            {labelOf(dep)}
          </button>
        );
      })}
    </span>
  );
}

/** 被依赖值——谁 require 了本插件（点击跳其详情页） */
export function DependentValues({
  dependents,
  onJump,
}: {
  dependents: Array<{ pluginId: string; name: string }>;
  onJump: (pluginId: string) => void;
}) {
  if (dependents.length === 0) return <Dash />;
  return (
    <span className="mpd-info-deps">
      {dependents.map((d) => (
        <button
          key={d.pluginId}
          className="mpd-info-dep"
          onClick={() => onJump(d.pluginId)}
          title={d.pluginId}
        >
          {d.name}
        </button>
      ))}
    </span>
  );
}

/** 组：资源——逐行条件「有才显」（VS Code renderExtensionResources if 同款；仓库/问题/许可证）。
 *  返回**行数组**（不是渲染好的组壳）——组壳由调用方 `InfoGroup` 统一出，空组不渲染的判据只此一处。 */
export function resourcesGroupOf({
  t,
  repoUrl,
  issuesUrl,
  license,
}: {
  t: T;
  repoUrl?: string;
  issuesUrl?: string;
  license?: string;
}): ReactNode[] {
  const rows: ReactNode[] = [];
  if (repoUrl)
    rows.push(
      <InfoItem
        key="repo"
        label={t("仓库")}
        value={
          <ExternalLink href={repoUrl}>
            {t("打开仓库")}
          </ExternalLink>
        }
      />,
    );
  if (issuesUrl)
    rows.push(
      <InfoItem
        key="issues"
        label={t("问题")}
        value={
          <ExternalLink href={issuesUrl}>
            {t("报告问题")}
          </ExternalLink>
        }
      />,
    );
  if (license) rows.push(<InfoItem key="lic" label={t("许可证")} value={license} />);
  return rows;
}

/** 组：依赖 · 环境（mockup 04 末组定名）——需 LinkDesk(minApp) / 依赖 / 被依赖。
 *  依赖行判据（30.6c3）：未装 → Dash 诚实空（#64e A4 缺依赖门禁前不猜目录 requires）。 */
export function depEnvGroupOf({
  t,
  minAppVersion,
  appBelowMin,
  installed,
  hasEntry,
  depsValue,
  dependentsValue,
}: {
  t: T;
  minAppVersion?: string;
  appBelowMin: boolean;
  installed: boolean;
  hasEntry: boolean;
  depsValue: ReactNode;
  dependentsValue: ReactNode;
}): ReactNode[] {
  const rows: ReactNode[] = [];
  if (minAppVersion)
    rows.push(
      <InfoItem key="minapp" label={t("需 LinkDesk")} mono warn={appBelowMin} value={`v${minAppVersion}`} />,
    );
  if (installed || hasEntry) rows.push(<InfoItem key="deps" label={t("依赖")} value={depsValue} />);
  if (installed) rows.push(<InfoItem key="dependents" label={t("被依赖")} value={dependentsValue} />);
  return rows;
}
