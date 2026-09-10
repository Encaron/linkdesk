/**
 * 首次配置——状态栏条目（E6#73p）。
 *
 * ═══ 为什么是状态栏，不是「安装钩子」 ═══
 *
 * 插件 JS 只有两条**惰性**激活轨（`docs/03-插件制造/02-插件生命周期.md` §五）：表面挂载 /
 * on-command 激活。**不存在「安装时执行代码」**——所以「装完立刻在本机配一次」这件事，
 * 只能挂在一个**一装上就会自己出现的表面**上。
 *
 * 状态栏自绘组件正是这样一个表面：`appearsIn.statusBar` 声明路径 → 池在状态栏渲染时按 URL import
 * 并挂载（serial-monitor 连接灯同款机制）。插件装好后注册表一变，下一次状态栏渲染就会把它挂起来
 * ——**装完约一秒内**，正好落在壳那条「已安装：X v1.0」通知的 5 秒存活窗口里（R5-17 的实机形态）。
 *
 * ═══ 组件职责边界 ═══
 *
 * 它**不负责配置**。配置全在 `services/setup.ts`：本组件只是「装上后第一个自动出现的触发器」
 * + 「本机就绪状态的一枚指示」。视图打开是第二个触发器——两条路都走 `runFirstRunSetup()`，
 * 由它内部的 `_inflight` 合并成一次（同一次配置绝不写两遍盘、发两条通知）。
 */
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FIRST_RUN_SETUP_PLUGIN_ID } from "../pluginId";
import { runFirstRunSetup } from "../services/setup";
import "../styles/setup.css";

/** 本机就绪状态——`checking` 只在读盘那几十毫秒里存在 */
type SetupState = "checking" | "configured" | "failed";

/** 各状态的图标 / 文案 / 颜色——**图标与文字同时出现**，颜色只做加强，不单独承载信息（色觉障碍下仍可读） */
const STATE_VIEW: Record<SetupState, { icon: string; labelKey: string; color: string }> = {
  checking: { icon: "codicon-loading codicon-modifier-spin", labelKey: "检查中", color: "var(--text-muted)" },
  configured: { icon: "codicon-check", labelKey: "已配置", color: "var(--success)" },
  failed: { icon: "codicon-warning", labelKey: "配置失败", color: "var(--error)" },
};

export default function FirstRunSetupStatusBar() {
  const { t } = useTranslation();
  const [state, setState] = useState<SetupState>("checking");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    let cancelled = false;
    // StrictMode 双跑 / 视图与状态栏同时触发都不怕：去重在 setup 服务内部（`_inflight`）。
    void runFirstRunSetup().then((r) => {
      if (cancelled) return;
      if (r.ok) {
        setState("configured");
        // 已配置过 = 安静通过（不出声，见 setup.ts）——状态栏照常显示「已配置」，不漏报也不重播。
      } else {
        setState("failed");
        setDetail(r.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const view = STATE_VIEW[state];
  const title =
    state === "failed"
      ? t("首次配置失败：{{detail}} —— 点击查看", { detail })
      : state === "checking"
        ? t("首次配置：正在检查本机…")
        : t("首次配置：已在本机写好配置档案 —— 点击查看");

  return (
    <button
      className="frs-status"
      style={{ color: view.color }}
      title={title}
      onClick={() => void window.linkdesk?.tabs?.openOrFocus(FIRST_RUN_SETUP_PLUGIN_ID)}
    >
      <span className={`codicon ${view.icon}`} />
      {/* 文字**恒在**——不靠「一个绿点」表达含义；状态栏本身窄，用最短的两个字。 */}
      <span className="status-text">{t(view.labelKey)}</span>
    </button>
  );
}
