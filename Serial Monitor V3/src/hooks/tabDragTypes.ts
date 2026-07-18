/**
 * 标签页拖拽分屏——类型 + drop zone 检测算法。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §9]
 */

export type DropZone = "left" | "right" | "up" | "down" | "center" | null;

export interface DragSplitState {
  tabId: string;
  phase: "idle" | "reorder" | "split";
  previewX: number;
  previewY: number;
  dropZone: DropZone;
  /** 拖拽开始时的鼠标位置 */
  startX: number;
  startY: number;
  /** 拖拽开始时的标签页索引 */
  fromIndex: number;
}

/**
 * 5-zone 检测算法。
 * 将目标矩形分为上/下/左/右/中五个区域。
 */
export function detectDropZone(
  mouseX: number,
  mouseY: number,
  rect: DOMRect
): DropZone {
  const relX = (mouseX - rect.left) / rect.width;
  const relY = (mouseY - rect.top) / rect.height;

  // 鼠标在区域外 → null
  if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;

  if (relY < 0.25) return "up";
  if (relY > 0.75) return "down";
  if (relX < 0.25) return "left";
  if (relX > 0.75) return "right";
  return "center";
}

/** drop zone → 分屏方向映射 */
export function zoneToDirection(
  zone: Exclude<DropZone, null | "center">
): "horizontal" | "vertical" {
  return zone === "left" || zone === "right" ? "horizontal" : "vertical";
}

/** drop zone → 标签页放左边/上边还是右边/下边 */
export function zoneToSide(zone: Exclude<DropZone, null | "center">): 0 | 1 {
  return zone === "left" || zone === "up" ? 0 : 1;
}
