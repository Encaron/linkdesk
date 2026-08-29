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

/**
 * 计算光标 X 在标签栏内的插入缝隙（0..tabs.length）——E5.8#46.10 归一化：
 * 本地拖拽排序（useTabDrag.computeInsertIndex）与跨窗吸附竖线（onAdsorbHint）共用同一算法，一处写。
 * el = 目标 GroupTabBar 元素；clientX = 光标在窗口 viewport 的 X（与 getBoundingClientRect 同坐标系——
 * 壳推的 viewportX = 屏坐标 − 窗口 bounds 原点，同 DIP 直接可比）。
 * scrollLeft 补偿：标签栏内部横向滚动时 getBoundingClientRect 是视口坐标，+ scrollLeft 映射到内容坐标，
 * 溢出折叠的 tab 也按内容坐标命中（VS Code 同款——照抄 computeInsertIndex 原实现）。
 */
export function computeTabInsertIndex(el: HTMLElement, clientX: number): number {
  const rect = el.getBoundingClientRect();
  const tabEls = el.querySelectorAll<HTMLElement>(".group-tab-item");
  if (clientX < rect.left) return 0;
  if (clientX > rect.right) return tabEls.length;
  const scrollLeft = el.scrollLeft;
  const mouseX = clientX - rect.left + scrollLeft;
  let idx = 0;
  for (let i = 0; i < tabEls.length; i++) {
    const tr = tabEls[i].getBoundingClientRect();
    const midX = tr.left - rect.left + tr.width / 2 + scrollLeft;
    if (mouseX < midX) break;
    idx = i + 1;
  }
  return idx;
}

// E5.8#2：zoneToDirection/zoneToSide 已删——零消费（分屏方向由消费方内联判定）
