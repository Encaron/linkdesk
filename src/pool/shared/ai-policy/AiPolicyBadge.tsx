/**
 * AiPolicyBadge——状态栏 AI 权限徽标（池 · 2026-11-24 · AI 安全 · 权限档位与提权）。
 *
 * 规格：`01-设计/03-UI与交互规格.md` §五（四档文案 / 点击开设置 / 通道关着就隐藏 / aria-live）
 *
 * 🔴 数据来源 = `window.linkdesk.aiPolicy.getState()` / `onChange`（**插件可见读面**，契约见
 *   `src/core/api/linkdesk-api/aiPolicy.ts`）——⛔ 不读 settings.json、不自己判风险（规格 P8）。
 *   写档位不在这个面上（`aiPolicy.setMode` 是 `userOnly` 壳命令）。
 *
 * 显示文本：池内 i18n 已初始化（`pool-main.tsx` 模块级 `import "../i18n"`），走 `t()`；
 * 徽标短名是状态栏专用短句，与设置页整句说明**不是同一份**（同轴不同粒度）。
 */

import { useEffect, useState } from "react";
import i18n from "../../../i18n";
import { executePoolCommand } from "../../commands/executePoolCommand";
import type { AiPolicyStateDto } from "../../../core/types/ipc/aiPolicy";
import "./ai-policy.css";

interface ModeView {
  /** 状态栏短名（i18n key） */
  label: string;
  tone: "muted" | "accent";
  /** hover 说明（i18n key，完整句） */
  hint: string;
}

/** 四档的徽标形态（键是档位数据；⛔ 不在这里写业务判定） */
const MODE_VIEW: Record<string, ModeView> = {
  read: { label: "AI 只读", tone: "muted", hint: "AI 只能查看，不能修改" },
  ask: { label: "AI 询问", tone: "muted", hint: "AI 每次要修改，都会先问你" },
  auto: { label: "AI 自主", tone: "accent", hint: "日常修改直接执行；装更新、删数据会先问你" },
  full: { label: "AI 全权", tone: "accent", hint: "完全访问：所有操作不再询问，直到你在设置里改回来" },
};

const DEFAULT_VIEW = MODE_VIEW.auto;

export default function AiPolicyBadge() {
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
      data-hint={i18n.t(view.hint)}
      aria-live="polite"
      onClick={() => executePoolCommand("aiPolicy.openSettings")}
    >
      <span className="ldk-ai-badge-dot" aria-hidden="true" />
      {i18n.t(view.label)}
    </button>
  );
}
