/**
 * PluginInstallConfirm——单项安装/更新确认卡（`@linkdesk/ui` 共享件）。
 *
 * 哑渲染：只吃 `PluginConfirmVM`（视图模型由 `buildViewModel.ts` 算好、文案由壳 t() 解析）。
 * 弹窗机制（居中/遮罩/Esc/焦点锁）归 DialogHost——本件只画内容与两颗按钮。
 *
 * 与原型 `01-原型.html` 的 install/source 两张卡同构：头部盾牌＋标题＋副题、kv 行、
 * 完整性行、警告框、「以后此来源不再询问」勾选、底部取消/确认。
 * 差异（已登记）：完整性行写「下载后校验」而不是原型里的「已校验」——此刻还没下载，
 * 写「已校验」是假话（校验发生在下载分段，失败即拒并清暂存）。
 */

import { useId, useState } from "react";
import type { PluginConfirmVM } from "./types";
import "./plugin-install-confirm.css";
import { RememberCheck } from "./pieces/RememberCheck";

export interface PluginInstallConfirmProps {
  vm: PluginConfirmVM;
  onConfirm(): void;
  onCancel(): void;
  /** 「以后此来源的更新不再询问」勾选变化（首装仍会确认——文案已写明） */
  onRememberChange?(checked: boolean): void;
}

/** 盾牌（确认）/ 警告（来源变更）图标——内联 SVG，⛔ 不用 emoji 当图标 */
function ShieldIcon({ warn }: { warn: boolean }) {
  return warn ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3 3 7v5c0 4.5 3.6 8.2 9 9 5.4-.8 9-4.5 9-9V7l-9-4Z" />
      <path d="M12 8v5" strokeLinecap="round" />
      <circle cx="12" cy="16.4" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 3 3 7v5c0 4.5 3.6 8.2 9 9 5.4-.8 9-4.5 9-9V7l-9-4Z" />
      <path d="M8.6 12.2 11 14.6l4.5-4.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function PluginInstallConfirm({ vm, onConfirm, onCancel, onRememberChange }: PluginInstallConfirmProps) {
  const titleId = useId();
  // AI 说明默认 3 行折叠（长理由不该把按钮顶出视野）；点「展开」看全文
  const [aiExpanded, setAiExpanded] = useState(false);
  const danger = vm.footer.tone === "danger";
  const warnIcon = vm.kind === "install" && vm.warn !== undefined;

  return (
    <div className="ldk-pic" role="group" aria-labelledby={titleId}>
      {/* jscpd:ignore-start */}
      <header className="ldk-pic-head">
        <span className={warnIcon ? "ldk-pic-shield is-warn" : "ldk-pic-shield"}>
          <ShieldIcon warn={warnIcon} />
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
        {vm.note && <p className="ldk-pic-note">{vm.note}</p>}

        {vm.rows.length > 0 && (
          <dl className="ldk-pic-kv">
            {vm.rows.map((row) => (
              <div className="ldk-pic-kv-row" key={row.k}>
                <dt className="ldk-pic-kv-k">{row.k}</dt>
                <dd className={row.tone ? `ldk-pic-kv-v is-${row.tone}` : "ldk-pic-kv-v"}>{row.v}</dd>
              </div>
            ))}
            {vm.integrity && (
              <div className="ldk-pic-kv-row">
                <dt className="ldk-pic-kv-k">{vm.integrity.k}</dt>
                <dd className={vm.integrity.ok ? "ldk-pic-kv-v is-hash" : "ldk-pic-kv-v is-muted"}>
                  {vm.integrity.text}
                </dd>
              </div>
            )}
          </dl>
        )}

        {vm.warn && (
          <div className="ldk-pic-warn" role="note">
            {vm.warn}
          </div>
        )}

        {vm.aiNote && (
          <section className="ldk-pic-ainote" aria-label={vm.aiNote.title}>
            <div className="ldk-pic-ainote-head">
              <span className="ldk-pic-ainote-title">{vm.aiNote.title}</span>
              <span className="ldk-pic-ainote-hint">{vm.aiNote.hint}</span>
            </div>
            <p className={aiExpanded ? "ldk-pic-ainote-body" : "ldk-pic-ainote-body is-clamped"}>{vm.aiNote.body}</p>
            <button type="button" className="ldk-pic-ainote-more" onClick={() => setAiExpanded((v) => !v)}>
              {aiExpanded ? vm.aiNote.less : vm.aiNote.more}
            </button>
          </section>
        )}

        {vm.remember && (
          <RememberCheck remember={vm.remember} onRememberChange={onRememberChange} />
        )}
      </div>

      <footer className="ldk-pic-foot">
        {/* 两颗按钮**文案相同时只画一颗**（2026-11-24 实机：计划与卡片不匹配时出现过「取消 / 取消」
            两个按钮，用户完全不知道该点哪个）。这是兜底护栏，不是正常形态。 */}
        {vm.footer.confirm === vm.footer.cancel ? (
          <button type="button" className="ldk-pic-btn" onClick={onCancel}>
            {vm.footer.cancel}
          </button>
        ) : (
          <>
            <button type="button" className="ldk-pic-btn" onClick={onCancel}>
              {vm.footer.cancel}
            </button>
            <button
              type="button"
              className={danger ? "ldk-pic-btn is-primary is-danger" : "ldk-pic-btn is-primary"}
              onClick={onConfirm}
            >
              {vm.footer.confirm}
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
