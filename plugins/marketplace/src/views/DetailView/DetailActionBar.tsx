/**
 * DetailActionBar——详情页头部右上动作列（`.mpd-acts`）：row1 主钮（三态分支）+ row2 版本偏好副控制。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 的 `<div className="mpd-acts">` 段
 * 原样搬出，零行为变更。
 *
 * 三分支判据由调用方算好传入（`disabledRow` / `pending` / `hasInfo`，顺序即优先级）；五个「小件」
 * （版本下拉 / 安装下拉 / 版本动作钮 / 自动更新勾 / 「已停在 vX」说明件）由 `actionBits` 构造后传入。
 * 本件零业务判断，只有版式。
 */

import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@linkdesk/ui";

export default function DetailActionBar({
  disabledRow,
  pending,
  pendingReason,
  hasInfo,
  isCore,
  online,
  busy,
  updating,
  installingHere,
  queuedHere,
  uninstallingHere,
  installFailed,
  installLabel,
  versionPicker,
  installPicker,
  actButton,
  autoUpdateToggle,
  pinnedNote,
  onEnable,
  onDisable,
  onUninstall,
  onInstallClick,
  onRetryInstall,
}: {
  /** 禁用态分支（已装但被禁用） */
  disabledRow: boolean;
  /** 挂起态分支（已装但依赖未就绪） */
  pending: boolean;
  pendingReason?: string;
  /** 已装且非挂起分支（= 调用方的 `info` 为真） */
  hasInfo: boolean;
  isCore: boolean;
  online: boolean;
  busy: boolean;
  updating: boolean;
  installingHere: boolean;
  queuedHere: boolean;
  uninstallingHere: boolean;
  /** 本插件有失败 job——安装钮原位变红「重试安装」 */
  installFailed: boolean;
  installLabel: string;
  versionPicker: ReactNode;
  installPicker: ReactNode;
  actButton: ReactNode;
  autoUpdateToggle: ReactNode;
  pinnedNote: ReactNode;
  onEnable: () => void;
  onDisable: () => void;
  onUninstall: () => void;
  onInstallClick: () => void;
  onRetryInstall: () => void;
}) {
  const { t } = useTranslation();
  /* 生命周期动作（启/禁/卸）的冻结栅：替换期间不可再点（busy 与更新进行中同效） */
  const frozen = busy || updating;
  return (
    <div className="mpd-acts">
      <div className="mpd-acts-row">
        {disabledRow ? (
          <>
            {/* E6#33c/#33b 版本动作首槽：版本下拉（versions>1 有历史）+ 升/降钮（降走 requestDowngrade F2 确认 → allowOlder 放行）。
             *  禁用态也照常——F1（引擎 wasActive=false 换文件不 reload 保持禁用）；accent 语义族零新壳组件 */}
            {versionPicker}
            {actButton}
            <Button variant="success" onClick={onEnable} disabled={frozen}>
              <span className="codicon codicon-play" /> {t("启用")}
            </Button>
            {/* E6#18a：core:true 藏卸载钮——含禁用态（core 经 getDisabled 透传） */}
            {!isCore && (
              <Button variant="danger" onClick={onUninstall} disabled={frozen}>
                <span className="codicon codicon-trash" /> {uninstallingHere ? t("卸载中...") : t("卸载")}
              </Button>
            )}
          </>
        ) : pending ? (
          <span className="mpd-blocked-chip" title={pendingReason} role="status">
            <span className="codicon codicon-circle-slash" />
            {t("安装不可用（缺依赖）")}
          </span>
        ) : hasInfo ? (
          <>
            {/* E6#33c/#33b：版本下拉（有历史）+ 升/降钮首槽（「禁用/卸载」旁——点4 第一段） */}
            {versionPicker}
            {actButton}
            <Button variant="ghost" onClick={onDisable} disabled={frozen}>
              <span className="codicon codicon-circle-slash" /> {t("禁用")}
            </Button>
            {!isCore && (
              <Button variant="danger" onClick={onUninstall} disabled={frozen}>
                <span className="codicon codicon-trash" /> {uninstallingHere ? t("卸载中...") : t("卸载")}
              </Button>
            )}
          </>
        ) : (
          <>
            {/* E6#33c：未装版本下拉（versions>1 选装哪个版本——05 §四场景①，选中即目标，默认最新/升级提示则 target） */}
            {installPicker}
            {installFailed ? (
              /* #64 A3（mockup 02 帧 3）：同一失败只留一处重试口——安装钮原位变红「↻ 重试安装」 */
              <Button
                variant="danger"
                onClick={onRetryInstall}
                disabled={busy || !online}
                title={!online ? t("联网后重试") : undefined}
              >
                <span className="codicon codicon-refresh" /> {t("重试安装")}
              </Button>
            ) : (
              <Button
                variant="success"
                onClick={onInstallClick}
                disabled={busy || installingHere || queuedHere || !online}
                title={!online ? t("联网后重试") : queuedHere ? t("等待安装中") : undefined}
              >
                <span className="codicon codicon-cloud-download" />
                {installingHere ? installLabel : queuedHere ? t("等待安装中") : t("安装")}
              </Button>
            )}
          </>
        )}
      </div>

      {/* #33d 自动更新勾选（row2 副控制——mockup 01 .pdva-acts row2 L849-851；G2：已装且非挂起才渲染）
       *  E6#83：同 row 尾随「已停在 vX」说明件——两条会打架的意愿并排（`.mpd-acts-row` 自带 wrap 兜底，
       *  窄栏换行不掉版式）。两者皆空则整行不渲染，不留空行。 */}
      {autoUpdateToggle || pinnedNote ? (
        <div className="mpd-acts-row">
          {autoUpdateToggle}
          {pinnedNote}
        </div>
      ) : null}
    </div>
  );
}
