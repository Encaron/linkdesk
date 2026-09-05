/**
 * SearchView — 搜索框 + 安装按钮（独立 view，不折叠）。
 * E3.6 E36#7.3 修正：从 InstalledListView 提取——不再绑在"已安装"里。
 * E3.6 E36#7.3c：useDebouncedInput——本地 state 即时响应 + 模块级搜索防抖 150ms。
 * SidePanel 对 title 为空串的 view 不包 SidebarSection，直接渲染。
 */

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { setMarketplaceSearch } from "../services/marketplaceShared";
import { useDebouncedInput } from "@linkdesk/ui"; // E6#15h：useDebouncedInput 收 @linkdesk/ui 零件（08-共享hook归位.md）
import "../styles/MarketplaceSidebar.css";

const lk = () => window.linkdesk;

// E5.7#81：安装阶段 → 按钮文案（stage 经 plugin:installProgress 从壳 loader 广播而来）
const STAGE_LABELS: Record<string, string> = {
  validating: "校验中...",
  copying: "复制中...",
  loading: "加载中...",
};

export default function SearchView() {
  const { t } = useTranslation();
  const [installing, setInstalling] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const { value, onChange, onClear } = useDebouncedInput(setMarketplaceSearch);

  // E5.7#81：订阅安装进度——壳 loader 事件经主进程广播到池（marketplaceShared 同款模式）
  useEffect(() => {
    const sub = lk()?.events?.on<{ stage?: string }>("plugin:installProgress", (p) => {
      setStage(p?.stage ?? null);
    });
    return () => sub?.();
  }, []);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    try {
      const selected = await lk().dialog.open({ directory: true, title: t("选择插件目录") }); // E5.8#37.9：原生对话框标题壳侧 t() 解析后走 IPC
      if (selected) {
        // E5.7#81：校验/版本冲突失败要可见——不再静默吞错
        const r = await lk().pluginManager.install(selected as string);
        if (r && !r.success) {
          await lk().dialog.alert(r.error || t("安装失败"));
        }
      }
    } catch (e) {
      await lk().dialog.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
      setStage(null);
    }
  }, [t]);

  const stageText = installing && stage ? STAGE_LABELS[stage] : null;

  return (
    <div className="ms-header">
      <div className="ms-header-actions">
        <button
          className="ms-install-btn"
          onClick={handleInstall}
          disabled={installing}
          title={t("从本地安装插件")}
        >
          <span className="codicon codicon-add" />
          {installing ? (stageText ? t(stageText) : t("安装中...")) : t("安装")}
        </button>
      </div>
      <div className="ms-search-container">
        <input
          className="ms-search-box"
          type="text"
          placeholder={t("搜索插件...")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && (
          <button className="ms-search-clear" onClick={onClear}>
            <span className="codicon codicon-close" />
          </button>
        )}
      </div>
    </div>
  );
}
