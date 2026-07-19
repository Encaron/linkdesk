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
 * Drop zone 检测——对标 VS Code EditorGroupView DropOverlay。
 *
 * 阈值：
 * - 面板中心区（relX 25-75% 且 relY 25-75%）= 合并（center）
 * - 面板边缘区 = 分屏——选距离最近的边
 *
 * 四个角落在两个边缘重叠时，选鼠标距离更近的边。
 */
export function detectDropZone(
  mouseX: number,
  mouseY: number,
  rect: DOMRect
): DropZone {
  const relX = (mouseX - rect.left) / rect.width;
  const relY = (mouseY - rect.top) / rect.height;

  if (relX < 0 || relX > 1 || relY < 0 || relY > 1) return null;

  // 面板中央 = 合并（对标 VS Code 20% 死区——25% 更宽松）
  if (relX >= 0.25 && relX <= 0.75 && relY >= 0.25 && relY <= 0.75) {
    return "center";
  }

  // 面板边缘 = 分屏——选最近边
  const distLeft = relX;
  const distRight = 1 - relX;
  const distUp = relY;
  const distDown = 1 - relY;
  const minEdge = Math.min(distLeft, distRight, distUp, distDown);

  if (minEdge === distUp) return "up";
  if (minEdge === distDown) return "down";
  if (minEdge === distLeft) return "left";
  if (minEdge === distRight) return "right";
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
