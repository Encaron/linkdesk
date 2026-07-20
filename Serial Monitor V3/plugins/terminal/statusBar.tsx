/**
 * 终端插件的状态栏贡献。
 * 对标 VS Code：插件自己渲染自己的 StatusBarItem，
 * 核心 StatusBar 只渲染组件，不知道终端是什么。
 */
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { useSerialContext } from "../../src/core/SerialContext";

function TerminalStatusBar() {
  const { t } = useTranslation();
  const { state } = useSerialContext();
  const { isOpen, txBytes, rxBytes } = state;

  return (
    <Fragment>
      <span className="status-divider">│</span>
      <span className={`status-dot${isOpen ? " connected" : ""}`} />
      <span className="status-text">
        {isOpen ? t("已连接") : t("未连接")}
      </span>
      <span className="status-divider">│</span>
      <span className="status-traffic">TX:{formatBytes(txBytes)} ↑</span>
      <span className="status-divider">│</span>
      <span className="status-traffic">RX:{formatBytes(rxBytes)} ↓</span>
    </Fragment>
  );
}

function formatBytes(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return String(n);
}

export default TerminalStatusBar;
