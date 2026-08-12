/**
 * OutputPoolView——E5.6#16.7k-1。
 *
 * Pool 侧输出面板。当前占位——输出面板待后续实现。
 */

import { useTranslation } from "react-i18next";

export default function OutputPoolView() {
  const { t } = useTranslation();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--text-muted)",
        fontSize: 13,
        userSelect: "none",
        background: "var(--bg-window)",
      }}
    >
      {t("输出面板")}
    </div>
  );
}
