/**
 * 发送区——E6#87b 从 src/index.tsx 的 SerialMonitorView 搬出（只搬不改）。
 *
 * ⚠️ 本组件只提供 DOM 容器（`sendEditorContainer` ref 由门面持有）；发送区 EditorView 的
 *    创建/销毁在 useSendEditorCm 内——CM6 生命周期与视图组件一致。
 */

import { useTranslation } from "react-i18next";

export interface SenderAreaProps {
  hexWarning: string;
  sendEditorContainer: React.MutableRefObject<HTMLDivElement | null>;
  showHistory: boolean;
  setShowHistory: (v: boolean) => void;
  sendHistory: string[];
  onHistorySelect: (text: string) => void;
  onClearSend: () => void;
  onSend: () => void;
}

export default function SenderArea(p: SenderAreaProps) {
  const { t } = useTranslation();

  return (
    <div className="sender-area">
      {p.hexWarning && (
        <div className="hex-warning">{p.hexWarning}</div>
      )}
      <div className="send-editor-wrapper">
        <span className="send-editor-prefix">→</span>
        <div ref={p.sendEditorContainer} className="send-editor-cm" />
      </div>
      <div className="sender-actions">
        <div className="history-wrapper">
          <button
            className={`toolbar-btn${p.showHistory ? " active" : ""}`}
            onClick={() => p.setShowHistory(!p.showHistory)}
            title={t("发送历史")}
            disabled={p.sendHistory.length === 0}
          >
            ▼
          </button>
          {p.showHistory && p.sendHistory.length > 0 && (
            <div className="history-dropdown">
              {p.sendHistory.map((h, i) => (
                <div
                  key={i}
                  className="history-item"
                  onClick={() => p.onHistorySelect(h)}
                >
                  {h}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="toolbar-btn" onClick={p.onClearSend}>
          {t("清空发送区")}
        </button>
        <button className="send-btn" onClick={p.onSend}>
          {t("发送")}
        </button>
      </div>
    </div>
  );
}
