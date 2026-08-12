/**
 * SplitHandles——壳 DOM 分隔线组件。E5.6#22l。
 *
 * 遍历所有 `resizable: true` 的 zone，在相邻边界渲染 drag handle。
 * Pool WebContentsView 留缝（#22k）→ 缝里露出壳底色 → 此组件在缝位置渲染可拖拽竖线。
 *
 * 通用化：不硬编码 sidebar——加 resizable zone 即自动渲染 handle。
 * 未来底部面板：边缘 dock.edge === "bottom" → orientation 自动 horizontal。
 */

import { layoutEngine } from "../core/services/LayoutEngine";
import type { ZoneBounds } from "../core/services/LayoutEngine";
import { useDragHandle } from "../hooks/useDragHandle";

const HANDLE_WIDTH = 4;
const TITLE_BAR_HEIGHT = 30;

interface SplitHandlesProps {
  zoneBounds: Record<string, ZoneBounds>;
}

export function SplitHandles({ zoneBounds }: SplitHandlesProps) {
  return (
    <>
      {layoutEngine.getAllZones().map((zoneCfg) => {
        if (!zoneCfg.dock?.resizable) return null;
        const bounds = zoneBounds[zoneCfg.zone];
        if (!bounds || bounds.width <= 0) return null;

        const edge = zoneCfg.dock.edge;

        let left: number;
        let top: number;
        let width: number;
        let height: number;
        let cursor: string;

        if (edge === "bottom") {
          // 水平分隔线——底部面板上方（未来）
          left = bounds.x;
          top = bounds.y - HANDLE_WIDTH / 2;
          width = bounds.width;
          height = HANDLE_WIDTH;
          cursor = "row-resize";
        } else if (edge === "right") {
          // 右侧栏——handle 在 zone 左侧
          left = bounds.x - HANDLE_WIDTH / 2;
          top = bounds.y;
          width = HANDLE_WIDTH;
          height = bounds.height;
          cursor = "col-resize";
        } else {
          // 左侧栏（默认）——handle 在 zone 右侧
          left = bounds.x + bounds.width - HANDLE_WIDTH / 2;
          top = bounds.y;
          width = HANDLE_WIDTH;
          height = bounds.height;
          cursor = "col-resize";
        }

        return (
          <HandleLine
            key={`handle-${zoneCfg.zone}`}
            zone={zoneCfg.zone}
            left={left}
            top={top + TITLE_BAR_HEIGHT}
            width={width}
            height={height}
            cursor={cursor}
          />
        );
      })}
    </>
  );
}

/** 单条分隔线——position:fixed，z-index 高于 Pool WebContentsView */
function HandleLine({
  zone,
  left,
  top,
  width,
  height,
  cursor,
}: {
  zone: string;
  left: number;
  top: number;
  width: number;
  height: number;
  cursor: string;
}) {
  const { onMouseDown } = useDragHandle(zone);

  return (
    <div
      onMouseDown={onMouseDown}
      style={{
        position: "fixed",
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        zIndex: 100, // 高于 Pool WebContentsView 层级
        cursor,
        background: "var(--separator, rgba(255,255,255,0.08))",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "var(--separator-hover, rgba(255,255,255,0.15))";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background =
          "var(--separator, rgba(255,255,255,0.08))";
      }}
    />
  );
}
