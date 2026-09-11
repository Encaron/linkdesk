/**
 * info-bits——元数据侧栏的原子件（行 / 空值占位 / 分组壳 / 两种链接值）。
 * E6#86a（第 3.6.3 轮）feature-folder 拆分：自 `DetailView.tsx` 原样搬出，零行为变更。
 *   （链接值两枚 `DirLink` / `ExternalLink` 同期自 `DetailInfoSidebar` 区段提炼——同一件事的原子件，
 *   不单开文件；判据见文件整理层/03 §二。）
 */

import type { ReactNode } from "react";

/** 下载数 → 千分位（作者数据 number 直显零 i18n） */
export function fmtCount(n: number): string {
  return n.toLocaleString();
}

/** 元数据侧栏行——warn = 值需强调（E6#30.8c minApp 不足时标红提醒升级） */
export function InfoItem({
  label,
  value,
  mono,
  warn,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  warn?: boolean;
}) {
  const cls = mono ? "mpd-info-value mono" : "mpd-info-value";
  return (
    <div className="mpd-info-item">
      <span className="mpd-info-label">{label}</span>
      {typeof value === "string" || typeof value === "number" ? (
        <span className={warn ? `${cls} warn` : cls}>{value}</span>
      ) : (
        <span className={cls}>{value}</span>
      )}
    </div>
  );
}

/** 元数据侧栏「—」空值占位（依赖/被依赖等无数据的诚实显示） */
export function Dash() {
  return <span className="mpd-info-value mpd-info-dash">—</span>;
}

/** 元数据侧栏分组（#63c B3——mockup 04 定稿：无「信息」总词；节标题 + 组内字段/内容；空组不渲染不占位） */
export function InfoGroup({ title, items }: { title?: string; items: ReactNode[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mpd-info-group">
      {title && <h3 className="mpd-info-group-title">{title}</h3>}
      {items}
    </div>
  );
}

/** 本地路径链接（#63c B3「大小」行 + E6#78「数据位置」行）——值可点，点开安装/数据目录。
 *  纯加字色与光标、文字一字不变 ⇒ 装/未装切换零布局跳动。 */
export function DirLink({
  title,
  onClick,
  withIcon,
  children,
}: {
  title: string;
  onClick: () => void;
  withIcon?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" className="mpd-info-link mpd-info-link-btn" title={title} onClick={onClick}>
      {children}
      {withIcon && <span className="codicon codicon-link-external mpd-info-link-icon" />}
    </button>
  );
}

/** 外链值（「资源」组：仓库 / 问题）——新窗口打开，rel 防 window.opener */
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="mpd-info-link" href={href} target="_blank" rel="noopener noreferrer">
      {children} <span className="codicon codicon-link-external mpd-info-link-icon" />
    </a>
  );
}
