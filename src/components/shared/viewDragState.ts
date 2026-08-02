/**
 * E4V#48——跨容器拖放共享状态。
 * SectionStack（拖拽源）写，IconBar（drop target）读。非 React 状态——无需重渲染。
 */

export interface ViewDragInfo {
  viewId: string;
  fromContainerId: string;
}

let _current: ViewDragInfo | null = null;

export function setDraggingView(info: ViewDragInfo | null): void {
  _current = info;
}

export function getDraggingView(): ViewDragInfo | null {
  return _current;
}
