import { useTranslation } from "react-i18next";
import type { TabType } from "../hooks/useTabManager";
import "./IconBar.css";

interface IconBarProps {
  activeTabType: TabType;
  onOpenOrFocus: (type: string) => void;
}

/** 图标栏可显示的视图类型（Phase 3: 不含 oled） */
const iconTypes: TabType[] = ["terminal", "workspace", "settings"];

function IconBar({ activeTabType, onOpenOrFocus }: IconBarProps) {
  const { t } = useTranslation();

  return (
    <div className="icon-bar">
      {iconTypes.map((type) => (
        <button
          key={type}
          className={`icon-btn${activeTabType === type ? " active" : ""}`}
          onClick={() => onOpenOrFocus(type)}
          title={t(type)}
        >
          <img
            src={`/assets/icons/${type}.png`}
            alt={t(type)}
            className="icon-img"
          />
        </button>
      ))}
    </div>
  );
}

export default IconBar;
