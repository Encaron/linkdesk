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
 * Drop zone 检测——照抄 VS Code editorGroupView.ts onDragOver。
 *
 * const SPLIT_THRESHOLD = 0.25;
 * if (x < width * SPLIT_THRESHOLD)       → LEFT
 * else if (x > width * (1 - SPLIT_THRESHOLD)) → RIGHT
 * else if (y < height * SPLIT_THRESHOLD)      → TOP
 * else if (y > height * (1 - SPLIT_THRESHOLD)) → BOTTOM
 * else → CENTER（合并）
 *
 * 左右优先于上下——对标 VS Code 的偏好设置。
 */
export function detectDropZone(
  mouseX: number,
  mouseY: number,
  rect: DOMRect
): DropZone {
  const x = mouseX - rect.left;
  const y = mouseY - rect.top;
  const SPLIT_THRESHOLD = 0.25;

  if (x < 0 || x > rect.width || y < 0 || y > rect.height) return null;

  if (x < rect.width * SPLIT_THRESHOLD) return "left";
  if (x > rect.width * (1 - SPLIT_THRESHOLD)) return "right";
  if (y < rect.height * SPLIT_THRESHOLD) return "up";
  if (y > rect.height * (1 - SPLIT_THRESHOLD)) return "down";
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
