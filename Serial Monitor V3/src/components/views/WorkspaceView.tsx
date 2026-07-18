import { useTranslation } from "react-i18next";

function WorkspaceView() {
  const { t } = useTranslation();

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
        {t("暂无卡片，请先连接串口")}
      </span>
    </div>
  );
}

export default WorkspaceView;
