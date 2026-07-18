import { useTranslation } from "react-i18next";

interface Props {
  open: boolean;
  filterMode: "all" | "protocol" | "plain";
  filterKeyword: string;
  onClose: () => void;
  onModeChange: (mode: "all" | "protocol" | "plain") => void;
  onKeywordChange: (kw: string) => void;
}

function FilterMenu({ open, filterMode, filterKeyword, onClose, onModeChange, onKeywordChange }: Props) {
  const { t } = useTranslation();
  if (!open) return null;

  return (
    <>
      <div className="ctx-overlay" onClick={onClose} />
      <div className="ctx-menu filter-popup" style={{ top: 32, right: 0 }}>
        <div
          className={`ctx-item${filterMode === "all" && filterKeyword === "" ? " ctx-item-checked" : ""}`}
          onClick={() => { onModeChange("all"); onKeywordChange(""); onClose(); }}
        >
          {t("全部")}
        </div>
        <div
          className={`ctx-item${filterMode === "protocol" ? " ctx-item-checked" : ""}`}
          onClick={() => { onModeChange("protocol"); onClose(); }}
        >
          📡 {t("仅协议消息")}
        </div>
        <div
          className={`ctx-item${filterMode === "plain" ? " ctx-item-checked" : ""}`}
          onClick={() => { onModeChange("plain"); onClose(); }}
        >
          {t("仅普通文本")}
        </div>
        <div className="ctx-divider" />
        <div className="ctx-item-label">{t("关键字过滤")}</div>
        <div className="ctx-item-input">
          <input
            className="input"
            style={{ width: "100%", height: 24, fontSize: 11 }}
            placeholder={t("输入关键字…")}
            value={filterKeyword}
            onChange={(e) => onKeywordChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </div>
    </>
  );
}

export default FilterMenu;
