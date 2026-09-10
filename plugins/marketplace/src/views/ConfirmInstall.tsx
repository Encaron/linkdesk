/**
 * ConfirmInstall——E6#71c 安装确认卡视图（contributes.views.main["marketplace-install-confirm"] inert）。
 *
 * 角色：壳 DialogHost content 槽的内容（PluginComponent 挂载本视图渲染插件自绘确认卡）。
 * 原 DetailView 自画 mpd-confirm（OverlayPortal 绕开壳 Dialog）迁入——正文版式/按钮归本视图
 * （§四·三「排版、按钮市场自由画」），弹窗机制（居中/遮罩/Esc/焦点锁/点遮罩取消）由壳 DialogHost 提供。
 *
 * 数据 = dialogHost.current()?.content?.payload（installConfirmPayload 产物——不透明载荷随打开参数
 * 过壳→回池结构克隆，无跨 bundle 会话 store）。空 → 返回 null 防御（不白屏）。
 * 结算 = dialogHost.cancel()/confirm() → 池 dialog-action → 壳 settle（先推 open:false 再 settle）
 * → DetailView 接 true 执行 runInstall（安装执行单一入口仍留在 DetailView，本视图只表态）。
 *
 * E6#71k：本卡不再「每插件一张」而是「每来源一张」——只有信任门（installTrust）判定要问时才弹。
 * 卡片语义随之从「确认安装此插件」变为「安装来自 <来源> 的插件，并信任此来源？」——由 payload.trustGrant
 * 驱动告知句；卡不删、机制不变（只改触发频率与那一句话）。
 */

import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button, Badge } from "@linkdesk/ui";
import { fmtSize, type InstallConfirmPayload } from "../services/installConfirmPayload";
import "../styles/MarketplaceConfirm.css";

/** 行——label 上 / value 下竖叠（对齐原 InfoItem 在确认卡的版式） */
function Row({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="mpd-confirm-row">
      <span className="mpd-confirm-row-label">{label}</span>
      <span className="mpd-confirm-row-value">
        {children ?? <span className="mpd-confirm-dash">—</span>}
      </span>
    </div>
  );
}

/** 挂载读数——当前打开 Dialog 的内容 payload（挂载即打开，懒初始化读一次足够；每次开新弹窗全新挂载重读） */
function readPayload(): InstallConfirmPayload | null {
  const data = window.linkdesk?.dialogHost?.current?.();
  if (!data || data.open !== true) return null; // 窄化 open:true 变体——仅它有 content 槽
  const p = data.content?.payload;
  if (!p || typeof p !== "object") return null;
  return p as InstallConfirmPayload;
}

export default function ConfirmInstall() {
  const { t } = useTranslation();
  // 挂载 = 弹窗打开（DialogHost content 模式）；payload 取不到 → 防御空态（不白屏）
  const [payload] = useState<InstallConfirmPayload | null>(readPayload);
  const [submitting, setSubmitting] = useState(false);

  if (!payload) return null;

  const host = window.linkdesk?.dialogHost;
  const confirmApi = () => host?.confirm?.();
  const cancelApi = () => host?.cancel?.();

  const handleConfirm = () => {
    if (submitting) return;
    setSubmitting(true); // 防双击双 settle——壳第二次动作已无 pending，no-op；本地锁防 UX 双触发
    confirmApi();
  };

  /* E6#71k：卡片语义 = 「安装来自 <来源> 的插件，并信任此来源？」——trustGrant 决定告知句。
   * 无 trustGrant（老调用方/异常路径）落回 71c 原句，不空着（诚实兜底不撒谎）。 */
  const sourceLabel = payload.sourceName ?? "";
  const note =
    payload.trustGrant === "remember" && sourceLabel
      ? t("安装来自「{{source}}」的插件，并信任此来源——确认后此来源不再询问。", { source: sourceLabel })
      : payload.trustGrant === "never" && sourceLabel
        ? t("安装来自「{{source}}」的插件——此来源使用 http 连接，无法安全记住，每次都会询问。", { source: sourceLabel })
        : t("安装即信任——确认前请查看来源与发布者。");

  return (
    <div className="mpd-confirm" role="dialog" aria-modal="true" aria-label={t("确认安装")}>
      <div className="mpd-confirm-head">
        <span className="codicon codicon-shield mpd-confirm-shield" />
        <span className="mpd-confirm-title">{t("确认安装")}</span>
      </div>
      <p className="mpd-confirm-plugin">{payload.name}</p>
      <p className="mpd-confirm-note">{note}</p>
      <div className="mpd-confirm-rows">
        <Row label={t("发布者")}>
          <span className="mpd-confirm-publisher">
            {payload.publisher ?? <span className="mpd-confirm-dash">—</span>}
            {payload.official && (
              <Badge title={t("官方发布")}>
                <span className="codicon codicon-verified" /> {t("官方发布")}
              </Badge>
            )}
          </span>
        </Row>
        <Row label={t("来源仓库")}>
          {payload.repoUrl ? (
            <a
              className="mpd-confirm-link"
              href={payload.repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()} /* 链接点击不冒泡给卡——无面板 Enter/click 联动，纯防御 */
            >
              {payload.sourceName ?? ""}
              <span className="codicon codicon-link-external mpd-confirm-link-icon" />
            </a>
          ) : (
            (payload.sourceName ?? <span className="mpd-confirm-dash">—</span>)
          )}
        </Row>
        {payload.description && <Row label={t("描述")}>{payload.description}</Row>}
        <Row label={t("版本")}>{payload.version ? `v${payload.version}` : ""}</Row>
        {payload.size != null && <Row label={t("大小")}>{fmtSize(payload.size)}</Row>}
        {payload.license && <Row label={t("许可证")}>{payload.license}</Row>}
      </div>
      <div className="mpd-confirm-actions">
        <Button variant="ghost" onClick={() => cancelApi()}>
          {t("取消")}
        </Button>
        <Button variant="success" onClick={handleConfirm} disabled={submitting}>
          <span className="codicon codicon-cloud-download" /> {t("确认安装")}
        </Button>
      </div>
    </div>
  );
}
