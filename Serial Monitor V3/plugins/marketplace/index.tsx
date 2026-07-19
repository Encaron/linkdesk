/**
 * 插件市场视图。
 * Phase 4：核心控制面（core: true），不可卸载。
 *
 * TODO P0-1：替换为完整的插件市场 UI（列表/搜索/安装/卸载/拖.v3p）。
 * 设计依据：[V3-插件系统与UI重构设计.md §5]
 */
import { useTranslation } from "react-i18next";

function MarketplaceView({ isActive: _isActive }: { isActive: boolean }) {
  const { t } = useTranslation();

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
      }}
    >
      <span style={{ fontSize: 40 }}>🧩</span>
      <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
        {t("插件管理")}
      </span>
      <span
        style={{ color: "var(--text-muted)", fontSize: 11, opacity: 0.7 }}
      >
        {t("即将推出")}
      </span>
    </div>
  );
}

export default MarketplaceView;
