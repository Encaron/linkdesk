/**
 * PluginUpdateBatchSummary——批量更新汇总卡（`@linkdesk/ui` 共享件）。
 *
 * 哑渲染：只吃 `PluginConfirmVM`（视图模型由 `buildViewModel.ts` 算好）。与原型 `batchTitle` 同构：
 * 头部盾牌＋标题＋副题，三格统计，按来源分组的需确认列表（滚动区），免问摘要行＋「改为逐个确认」，
 * 底部取消 / 确认。
 *
 * 🔴 三条口径写死在结构里（spec §五）：
 *   ① 只列 **ask** 项；silent 只出摘要行（⛔ 展开成表——那正是老实现只画 4 行掩盖的问题）；
 *   ② 滚动区独立、头尾按钮不随滚动（20+ 不撑破弹窗）；
 *   ③ 行内无 checkbox——取消 = 整批取消，⛔ 不做「只跑一半」的二义。
 */

import { useId } from "react";
import { PluginIcon } from "../plugin-icon/PluginIcon";
import type { PluginConfirmVM } from "./types";
import "./plugin-install-confirm.css";
import { RememberCheck } from "./pieces/RememberCheck";

export interface PluginUpdateBatchSummaryProps {
  vm: PluginConfirmVM;
  onConfirm(): void;
  onCancel(): void;
  /** 「以后官方源更新不再询问」勾选变化（写策略后由调用方重新出计划） */
  onRememberChange?(checked: boolean): void;
  /** 「改为逐个确认」——把免问项也展开成需确认（本批临时，不改设置） */
  onForceAsk?(): void;
}

export default function PluginUpdateBatchSummary({
  vm,
  onConfirm,
  onCancel,
  onRememberChange,
  onForceAsk,
}: PluginUpdateBatchSummaryProps) {
  const titleId = useId();
  const stats = vm.stats;

  return (
    <div className="ldk-pic ldk-pic--batch" role="group" aria-labelledby={titleId}>
      {/* jscpd:ignore-start */}
      <header className="ldk-pic-head">
        <span className="ldk-pic-shield">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M12 3 3 7v5c0 4.5 3.6 8.2 9 9 5.4-.8 9-4.5 9-9V7l-9-4Z" />
            <path d="M8.6 12.2 11 14.6l4.5-4.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="ldk-pic-headtext">
          <h2 id={titleId} className="ldk-pic-title">
            {vm.title}
          </h2>
          <span className="ldk-pic-sub">{vm.sub}</span>
        </span>
      </header>
      {/* jscpd:ignore-end */}

      <div className="ldk-pic-body">
        {stats && (
          <div className="ldk-pic-stats">
            <div className="ldk-pic-stat">
              <span className="ldk-pic-stat-n">{stats.total}</span>
              <span className="ldk-pic-stat-l">{stats.labels.total}</span>
            </div>
            <div className="ldk-pic-stat is-ask">
              <span className="ldk-pic-stat-n">{stats.ask}</span>
              <span className="ldk-pic-stat-l">{stats.labels.ask}</span>
            </div>
            <div className="ldk-pic-stat is-silent">
              <span className="ldk-pic-stat-n">{stats.silent}</span>
              <span className="ldk-pic-stat-l">{stats.labels.silent}</span>
            </div>
          </div>
        )}

        {/* 滚动区：20+ 条只在这里滚，头尾固定（spec §5.2） */}
        <div className="ldk-pic-scroll" tabIndex={0}>
          {vm.emptyText && <div className="ldk-pic-empty">{vm.emptyText}</div>}
          {vm.groups?.map((group) => (
            <section className="ldk-pic-group" key={group.label + group.countLabel}>
              <div className="ldk-pic-group-head">
                <span className="ldk-pic-group-name">{group.label}</span>
                <span className={`ldk-pic-badge ${group.badgeTone === "free" ? "is-free" : "is-third"}`}>
                  {group.badge}
                </span>
                <span className="ldk-pic-group-count">{group.countLabel}</span>
              </div>
              {group.rows.map((row) => (
                <div className="ldk-pic-row" key={row.pluginId}>
                  <span className="ldk-pic-row-icon">
                    <PluginIcon
                      pluginId={row.pluginId}
                      manifest={row.icon ? { icon: row.icon } : undefined}
                      className="ldk-pic-row-icon-inner"
                    />
                  </span>
                  <span className="ldk-pic-row-text">
                    <span className="ldk-pic-row-name">
                      {row.name}
                      {row.ai && <span className="ldk-pic-row-ai">{row.ai}</span>}
                    </span>
                    <span className="ldk-pic-row-sub">{row.sub}</span>
                  </span>
                  <span className="ldk-pic-row-ver">
                    {row.from ? `${row.from} → ` : null}
                    <b>{row.to}</b>
                  </span>
                </div>
              ))}
            </section>
          ))}
        </div>

        {vm.silentLine && (
          <div className="ldk-pic-silent">
            <span className="ldk-pic-silent-text">{vm.silentLine.text}</span>
            {onForceAsk && (
              <button type="button" className="ldk-pic-link" onClick={onForceAsk}>
                {vm.silentLine.action}
              </button>
            )}
          </div>
        )}

        {vm.remember && (
          <RememberCheck remember={vm.remember} onRememberChange={onRememberChange} />
        )}

        {vm.note && <p className="ldk-pic-note is-foot">{vm.note}</p>}
      </div>

      <footer className="ldk-pic-foot">
        <button type="button" className="ldk-pic-btn" onClick={onCancel}>
          {vm.footer.cancel}
        </button>
        <button type="button" className="ldk-pic-btn is-primary" onClick={onConfirm}>
          {vm.footer.confirm}
        </button>
      </footer>
    </div>
  );
}
