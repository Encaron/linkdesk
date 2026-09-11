/**
 * 接收区工具栏——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 * 暂停 / 导出 / 清空 / 过滤（模式 + 关键字）/ 搜索开关 / per-tab TX·RX 计数。
 */

import { useTranslation } from "react-i18next";
import { SelectBox } from "@linkdesk/ui";

export interface ToolbarProps {
  paused: boolean;
  onPause: () => void;
  onExport: () => void;
  onClear: () => void;
  filterMode: "all" | "protocol" | "plain";
  onFilterModeChange: (v: "all" | "protocol" | "plain") => void;
  filterKeyword: string;
  onFilterKeywordChange: (v: string) => void;
  searchVisible: boolean;
  onToggleSearch: () => void;
  portIsOpen: boolean;
  txBytes: number;
  rxBytes: number;
}

export default function Toolbar(p: ToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="serial-monitor-toolbar">
      <button className={`toolbar-btn${p.paused ? " active" : ""}`} onClick={p.onPause} title={t("暂停接收")}>
        <span className={`codicon ${p.paused ? "codicon-debug-start" : "codicon-debug-pause"}`} />
        {p.paused ? t("继续接收") : t("暂停接收")}
      </button>

      <button className="toolbar-btn" onClick={p.onExport} title={t("导出日志")}>
        <span className="codicon codicon-export" />
        {t("导出日志")}
      </button>
      <button className="toolbar-btn" onClick={p.onClear} title={t("清空接收区")}>
        <span className="codicon codicon-clear-all" />
        {t("清空接收区")}
      </button>
      <SelectBox
        value={p.filterMode}
        options={[
          { value: "all", label: t("全部") },
          { value: "protocol", label: t("仅协议消息") },
          { value: "plain", label: t("仅普通文本") },
        ]}
        onChange={(v) => p.onFilterModeChange(v as "all" | "protocol" | "plain")}
      />
      <input
        className="input filter-keyword-input"
        placeholder={t("关键字过滤…")}
        value={p.filterKeyword}
        onChange={(e) => p.onFilterKeywordChange(e.target.value)}
        style={{ width: 110 }}
      />

      <button className={`toolbar-btn${p.searchVisible ? " active" : ""}`} onClick={p.onToggleSearch}>
        <span className="codicon codicon-search" />
        {t("搜索")}
      </button>

      {/* E5.8#30.12（P6）：per-tab TX/RX 计数——归位接收区工具栏（状态栏已删全局计数） */}
      <span className={`receive-stats${p.portIsOpen ? "" : " muted"}`}>
        {p.portIsOpen ? `TX:${p.txBytes}  RX:${p.rxBytes}` : "TX:--  RX:--"}
      </span>
    </div>
  );
}
