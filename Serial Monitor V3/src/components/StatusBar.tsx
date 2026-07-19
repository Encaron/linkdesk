/**
 * StatusBar — 底部状态栏。
 * Phase 4 Step 3：新增语言/主题切换按钮（对标 VS Code 状态栏右下角）。
 * Phase 4 Step 4：状态栏贡献点框架——插件声明 statusBar 条目，核心渲染。
 */

import { useTranslation } from "react-i18next";
import "./StatusBar.css";

interface StatusBarProps {
  isOpen: boolean;
  txBytes: number;
  rxBytes: number;
  error?: string | null;
  theme?: "Dark" | "Light";
  lang?: "zh" | "en";
  onToggleTheme?: () => void;
  onToggleLang?: () => void;
}

function StatusBar({ isOpen, txBytes, rxBytes, error, theme, lang, onToggleTheme, onToggleLang }: StatusBarProps) {
  const { t } = useTranslation();

  return (
    <div className="status-bar">
      {/* 左侧：串口状态 + 流量 */}
      <div className="status-bar-left">
        <span className={`status-dot${isOpen ? " connected" : ""}`} />
        <span className="status-text">
          {isOpen ? t("已连接") : t("未连接")}
        </span>
        {error && (
          <>
            <span className="status-divider">│</span>
            <span className="status-error" title={error}>{error}</span>
          </>
        )}
        <span className="status-divider">│</span>
        <span className="status-traffic">TX:{formatBytes(txBytes)} ↑</span>
        <span className="status-divider">│</span>
        <span className="status-traffic">RX:{formatBytes(rxBytes)} ↓</span>
      </div>

      {/* 右侧：语言 + 主题（Phase 4：对标 VS Code 状态栏右下角） */}
      <div className="status-bar-right">
        {onToggleLang && (
          <button className="status-bar-btn" onClick={onToggleLang} title={t("切换语言（Phase 7）")}>
            {lang === "zh" ? "中" : "EN"}
          </button>
        )}
        {onToggleTheme && (
          <button className="status-bar-btn" onClick={onToggleTheme} title={t("切换主题（Phase 7）")}>
            {theme === "Dark" ? "☀" : "☾"}
          </button>
        )}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

export default StatusBar;
