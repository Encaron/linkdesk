import { useTranslation } from "react-i18next";
import type { ViewId } from "../App";
import "./IconBar.css";

interface IconBarProps {
  activeView: ViewId;
  onViewChange: (view: ViewId) => void;
}

const iconIds: ViewId[] = ["terminal", "workspace", "settings"];

function IconBar({ activeView, onViewChange }: IconBarProps) {
  const { t } = useTranslation();

  return (
    <div className="icon-bar">
      {iconIds.map((id) => (
        <button
          key={id}
          className={`icon-btn${activeView === id ? " active" : ""}`}
          onClick={() => onViewChange(id)}
          title={t(id)}
        >
          <img
            src={`/assets/icons/${id}.png`}
            alt={t(id)}
            className="icon-img"
          />
        </button>
      ))}
    </div>
  );
}

export default IconBar;
