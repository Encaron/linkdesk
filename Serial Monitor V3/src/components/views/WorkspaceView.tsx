/**
 * WorkspaceView — 工作台视图。
 * Phase 3: 占位 UI；Phase 4: 卡片网格。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §13.1]
 */

import { useTranslation } from "react-i18next";

interface WorkspaceViewProps {
  isActive: boolean;
  workspaceName?: string;
}

function WorkspaceView({ isActive: _isActive, workspaceName }: WorkspaceViewProps) {
  const { t } = useTranslation();

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
        {workspaceName ? `📊 ${workspaceName}` : t("暂无卡片，请先连接串口")}
      </span>
      <span style={{ color: "var(--text-muted)", fontSize: 11, opacity: 0.7 }}>
        {t("卡片架构将在 Phase 4 实现")}
      </span>
    </div>
  );
}

export default WorkspaceView;
