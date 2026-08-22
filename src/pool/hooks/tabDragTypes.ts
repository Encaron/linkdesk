/**
 * 标签页拖拽分屏——类型 + drop zone 检测算法。
 * 设计依据：[V3-Phase3-标签页分屏设计.md §9]
 */

export type DropZone = "left" | "right" | "up" | "down" | "center" | null;

// E5.8#2：DragSplitState 已删——零消费（useDragReorder 自含 DragState 同款内部结构）

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

// E5.8#2：zoneToDirection/zoneToSide 已删——零消费（分屏方向由消费方内联判定）
