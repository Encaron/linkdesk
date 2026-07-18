import { useTranslation } from "react-i18next";

interface Props {
  x: number;
  y: number;
  paused: boolean;
  onClose: () => void;
  onCopy: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onTogglePause: () => void;
}

function ReceiveContextMenu({ x, y, paused, onClose, onCopy, onSelectAll, onClear, onTogglePause }: Props) {
  const { t } = useTranslation();

  return (
    <>
      <div className="ctx-overlay" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="ctx-menu" style={{ left: x, top: y }}>
        <div className="ctx-item" onClick={onCopy}>{t("复制")}</div>
        <div className="ctx-item" onClick={onSelectAll}>{t("全选")}</div>
        <div className="ctx-divider" />
        <div className="ctx-item" onClick={onClear}>{t("清空接收区")}</div>
        <div className="ctx-item" onClick={onTogglePause}>{paused ? t("继续接收") : t("暂停接收")}</div>
      </div>
    </>
  );
}

export default ReceiveContextMenu;
