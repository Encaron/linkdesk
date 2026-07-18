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
 * 4-zone 检测算法（v4: 50% 半区阈值，对标 VS Code）。
 * 左半=左右分屏放左，右半=左右分屏放右，上半=上下分屏放上，下半=上下分屏放下。
 * 角落在两个区域重叠时，选 mouse 离边界更近的那个方向。
 */
export function detectDropZone(
  mouseX: number,
  mouseY: number,
  rect: DOMRect
): DropZone {
  const relX = (mouseX - rect.left) / rect.width;
  const relY = (mouseY - rect.top) / rect.height;

  if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;

  // 到各边距离
  const distLeft = relX;
  const distRight = 1 - relX;
  const distUp = relY;
  const distDown = 1 - relY;
  const minEdge = Math.min(distLeft, distRight, distUp, distDown);

  if (minEdge === distUp && relY < 0.5) return "up";
  if (minEdge === distDown && relY > 0.5) return "down";
  if (minEdge === distLeft && relX < 0.5) return "left";
  if (minEdge === distRight && relX > 0.5) return "right";
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
