/**
 * DragOverlays——MainZone 拖拽视觉浮层（drop zone 毛玻璃 + 拖拽预览 portal）。
 * E5.8#0d.10-6c：自 MainZone.tsx Render 段拆出——纯展示：输入 computeLayout 结果 + 拖拽态，零业务逻辑。
 *   drop zone 毛玻璃对标 VS Code editorDropTarget（E5.6#16.7 Glassmorphism——内发光 box-shadow
 *   定义区域边界 + backdrop-filter 跟主题 blur（E5.8#76 变量化，非 6px 死码），pointer-events: none 不拦截拖拽事件）。
 *   拖拽预览 portal 挂 document.body 避免 B34 裁剪。
 * 依赖方向：DragOverlays → react-dom（createPortal）+ ./layout（type）+ hooks（DropZone）+ core types；无反向。
 */

import { createPortal } from "react-dom";
import type { CSSProperties } from "react";
import type { PoolGroup } from "../../../../core/types/pool/poolLayout";
import type { DropZone } from "../../../hooks/tabDragTypes";
import type { PanelRect, HandleRect } from "./layout";
import { Z_INDEX } from "../../../../constants"; // E5.7#26：浮层层级常量表（替代 9999/99999 裸数字）

interface DragOverlaysProps {
  dropZoneState: { zone: DropZone; targetGroupId: string | null } | null;
  useAbsolute: boolean;
  /** computeLayout 结果（useAbsolute 时为非 null） */
  layout: { panels: PanelRect[]; handles: HandleRect[] } | null;
  draggingId: string | null;
  previewPos: { x: number; y: number } | null;
  groups: PoolGroup[];
}

export default function DragOverlays({
  dropZoneState,
  useAbsolute,
  layout,
  draggingId,
  previewPos,
  groups,
}: DragOverlaysProps) {
  return (
    <>
      {/* ═══ 分屏预览 overlay——Glassmorphism 对标 VS Code editorDropTarget ═══
           🔥 E5.6#16.7：毛玻璃半区叠加层。
           设计决策（ui-ux-pro-max Glassmorphism）：
           - 拒绝 dashed 虚线边框 → 改用内发光 box-shadow 定义区域边界
           - backdrop-filter 毛玻璃散射面跟主题 blur（--surface-glass-blur，零值现状）（不是全屏模糊，只作用于半区）
           - 固态 hairline 边框（1px solid，低透明度）——轻微可见但不抢眼
           - pointer-events: none 不拦截拖拽事件 */}
      {dropZoneState && dropZoneState.zone !== "center" && (() => {
        // 精确到目标 panel 的位置（百分比），单面板/fallback 用 inset:0
        let bounds: CSSProperties = { left: 0, top: 0, width: "100%", height: "100%" };
        if (useAbsolute && layout && dropZoneState.targetGroupId) {
          const p = layout.panels.find((pp) => pp.groupId === dropZoneState.targetGroupId);
          if (p) {
            bounds = { left: `${p.x}%`, top: `${p.y}%`, width: `${p.w}%`, height: `${p.h}%` };
          }
        }

        const zone = dropZoneState.zone;
        const zoneStyle =
          zone === "left"   ? { top: 0, left: 0, width: "50%", height: "100%" }
        : zone === "right"  ? { top: 0, right: 0, width: "50%", height: "100%" }
        : zone === "up"     ? { top: 0, left: 0, width: "100%", height: "50%" }
                             : { bottom: 0, left: 0, width: "100%", height: "50%" };

        return (
          <div style={{
            position: "absolute",
            ...bounds,
            zIndex: Z_INDEX.dropZone,
            pointerEvents: "none",
          }}>
            <div
              className="drop-glass-zone"
              style={zoneStyle}
            />
          </div>
        );
      })()}

      {/* ═══ Drag preview portal（document.body 避免 B34 裁剪）═══ */}
      {draggingId &&
        previewPos &&
        createPortal(
          (() => {
            const gs = groups;
            const tab = gs.flatMap((grp) => grp.tabs).find((tb) => tb.id === draggingId);
            if (!tab) return null;
            return (
              <div
                style={{
                  position: "fixed",
                  left: previewPos.x,
                  top: previewPos.y,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 12px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-normal)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--text-primary)",
                  fontSize: "var(--font-size-md)", /* E5.8 Phase 12 #171：13→md */
                  boxShadow: "var(--shadow-pop)",
                  pointerEvents: "none",
                  zIndex: Z_INDEX.dragPreview,
                }}
              >
                {tab.icon &&
                  (tab.icon.length <= 2 && /[\p{Emoji}]/u.test(tab.icon) ? (
                    <span>{tab.icon}</span>
                  ) : (
                    <img
                      style={{ width: 14, height: 14, flexShrink: 0, opacity: 0.8 }}
                      src={tab.icon}
                      alt=""
                    />
                  ))}
                <span>{tab.title}</span>
              </div>
            );
          })(),
          document.body,
        )}
    </>
  );
}
