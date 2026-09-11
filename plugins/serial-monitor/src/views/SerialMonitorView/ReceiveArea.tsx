/**
 * 接收区（CM6 宿主容器 + 系统日志条 + 回到底部 + 右键菜单）——E6#87b 从 src/index.tsx 搬出（只搬不改）。
 *
 * ⚠️ 本组件只提供 DOM 容器（`cmContainer` / `hexContainer` 两个 ref 由门面持有）；
 *    EditorView 的创建/销毁在 useReceiveEditor 内，不在本组件——CM6 生命周期与视图组件一致。
 */

import { useTranslation } from "react-i18next";
import { ContextMenu } from "@linkdesk/ui";

export interface ReceiveAreaProps {
  separateSystemLog: boolean;
  systemLog: string[];
  hexAsciiDualPane: boolean;
  cmContainer: React.MutableRefObject<HTMLDivElement | null>;
  hexContainer: React.MutableRefObject<HTMLDivElement | null>;
  paused: boolean;
  pausedCount: number;
  showBackToBottom: boolean;
  onBackToBottom: () => void;
  ctxMenu: { x: number; y: number } | null;
  onCloseCtxMenu: () => void;
}

export default function ReceiveArea(p: ReceiveAreaProps) {
  const { t } = useTranslation();

  return (
    <>
      {/* 系统消息区 */}
      {p.separateSystemLog && p.systemLog.length > 0 && (
        <div className="system-log-area">
          {p.systemLog.slice(-2).map((msg, i) => (
            <div key={i} className="system-log-line">{msg}</div>
          ))}
        </div>
      )}

      {/* CM6 接收区——E5.8#30.19a：双栏开关 → 并排 HEX/ASCII 两栏（.cm-pane 常驻挂载，CSS 显隐） */}
      <div className={`cm-wrapper${p.hexAsciiDualPane ? " dual" : ""}`}>
        <div className="cm-pane">
          <div ref={p.cmContainer} className="cm-container" />
        </div>
        <div className="cm-pane cm-hex-pane">
          <div ref={p.hexContainer} className="cm-container" />
        </div>
        {p.paused && (
          <div className="paused-banner">
            {t("⏸ 已暂停 · {{count}} 条缓冲", { count: p.pausedCount })}
          </div>
        )}
        {p.showBackToBottom && (
          <button className="back-to-bottom" onClick={p.onBackToBottom}>
            ↓
          </button>
        )}
      </div>

      {/* Phase 5b：接收区右键菜单——共享 ContextMenu */}
      {p.ctxMenu && (
        <ContextMenu
          menuId={"editorContext"}
          anchor={{ x: p.ctxMenu.x, y: p.ctxMenu.y }}
          context={{}}
          onClose={p.onCloseCtxMenu}
        />
      )}
    </>
  );
}
