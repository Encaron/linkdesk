import { useTranslation } from "react-i18next";

interface SettingsViewProps {
  isActive: boolean;
}

function SettingsView({ isActive: _isActive }: SettingsViewProps) {
  const { t } = useTranslation();

  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
        {t("即将推出")}
      </span>
    </div>
  );
}

export default SettingsView;
