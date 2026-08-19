/**
 * E4V#48——跨容器视图拖放协议。E5.7#10。
 *
 * PoolSectionStack（拖拽源）写 dataTransfer，IconBarZone（drop 目标）读。
 * dataTransfer 自带同步语义——drop 判定不需要壳侧共享拖拽状态
 * （E5.6 壳 SectionStack setDraggingView / IconBar getDraggingView 的池等价替代——
 * 壳侧原实现已随 E5.7#31 整删：载荷随 dataTransfer 走，壳侧消费方只在
 * drop commit 时经 events 往返收到一次）。
 */

/** 自定义 MIME 标记——HTML5 拖放跨元素传递结构化载荷（与 reorder 的 text/plain 并存） */
export const VIEW_DRAG_MIME = "application/x-linkdesk-view";

// E5.8#2：ViewDragPayload 已删——零消费（载荷按 dataTransfer 协议在读写方各自解析）
