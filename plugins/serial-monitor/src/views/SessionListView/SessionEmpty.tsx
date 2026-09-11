/**
 * 会话列表空态——E6#87b 从 views/SessionListView.tsx 搬出（只搬不改）。
 */

import { useTranslation } from "react-i18next";

export interface SessionEmptyProps {
  onCreate: () => void;
}

export function SessionEmpty({ onCreate }: SessionEmptyProps) {
  const { t } = useTranslation();
  return (
    <div className="session-empty">
      {t("暂无串口监视器会话。")}
      <button className="session-empty-link" onClick={onCreate}>
        [+ {t("新建")}]
      </button>
    </div>
  );
}
