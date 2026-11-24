/**
 * AiPolicyBadge——状态栏 AI 权限徽标（池 · 2026-11-24 · 返工 v4）。
 *
 * 规格：`01-设计/03-UI与交互规格.md` §五（四档文案 / 点击开设置 / 通道关着就隐藏 / aria-live）
 *
 * 数据来源 = `window.linkdesk.aiPolicy.getState()` / `onChange`（插件可见读面）；
 * 文案走 `useTranslation()`——**语言切换即时重绘**（v4 修：不再用 `i18n.t()` 的静态调用）。
 * ⛔ 不读 settings.json、不自己判风险；写档位不在这个面上。
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { executePoolCommand } from "../../commands/executePoolCommand";
import type { AiPolicyStateDto } from "../../../core/types/ipc/aiPolicy";
import "./ai-policy.css";

interface ModeView {
  /** 状态栏短名（i18n key） */
  label: string;
  tone: "muted" | "accent" | "full";
  /** hover 说明（i18n key，完整句） */
  hint: string;
}

/** 四档的徽标形态（键是档位数据；⛔ 不在这里写业务判定） */
const MODE_VIEW: Record<string, ModeView> = {
  read: { label: "AI 只读", tone: "muted", hint: "AI 只能查看，不能修改" },
  ask: { label: "AI 询问", tone: "muted", hint: "AI 每次修改前都会询问你" },
  auto: { label: "AI 自主", tone: "accent", hint: "日常修改由 AI 完成；安装、更新仍会询问" },
  full: { label: "AI 全权", tone: "full", hint: "完全访问：所有操作不再询问，直到你在设置里改回" },
};

const DEFAULT_VIEW = MODE_VIEW.auto;

export default function AiPolicyBadge() {
  const { t } = useTranslation();
  const [state, setState] = useState<AiPolicyStateDto | null>(null);

  useEffect(() => {
    const api = window.linkdesk?.aiPolicy;
    if (!api) return;
    // 硬约束 14：异步回填 + 订阅都带活跃守卫（StrictMode 双跑 / unmount 后不写状态）
    let alive = true;
    void api
      .getState()
      .then((next) => {
        if (alive) setState(next);
      })
      .catch(() => {
        if (alive) setState(null); // 读不到 = 不显示（显示一个可能错的档位更坏）
      });
    const off = api.onChange((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  if (!state || !state.channelsEnabled) return null;
  const view = MODE_VIEW[state.mode] ?? DEFAULT_VIEW;
  const full = state.mode === "full";

  return (
    <button
      type="button"
      className={`ldk-ai-badge ldk-ai-badge-${view.tone}${full ? " ldk-ai-badge-live" : ""}`}
      data-hint={t(view.hint)}
      aria-live="polite"
      onClick={() => executePoolCommand("aiPolicy.openSettings")}
    >
      <span className="ldk-ai-badge-dot" aria-hidden="true" />
      {t(view.label)}
    </button>
  );
}
