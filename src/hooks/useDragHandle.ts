/**
 * useDragHandle——壳内分隔线拖拽 hook。E5.6#22m。
 *
 * 零 IPC——拖拽全在壳进程闭环。layoutEngine.resizeZone → onDidChangeLayout
 * → Pool setBounds + React 重渲染。通用化：不硬编码 sidebar，传 zone 即可。
 *
 * 未来 BottomPanel：`useDragHandle("bottom")` → orientation 自动 horizontal。
 */

import { useCallback, useRef } from "react";
import { layoutEngine } from "../core/services/LayoutEngine";

export function useDragHandle(zone: string) {
  const dragging = useRef(false);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;

    const zoneCfg = layoutEngine.getZone(zone);
    if (!zoneCfg?.dock) return;
    const edge = zoneCfg.dock.edge;

    // 拖拽期间锁光标 + 禁文字选择——快速拖拽时鼠标脱离 handle 元素也不会跳回箭头
    const dragCursor = edge === "bottom" ? "row-resize" : "col-resize";
    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = dragCursor;
    document.body.style.userSelect = "none";

    const onMouseMove = (me: MouseEvent) => {
      if (!dragging.current) return;
      // 鼠标在窗口外释放 → mouseup 不到达此 window
      if (me.buttons === 0) {
        onMouseUp();
        return;
      }

      let newSize: number;
      if (edge === "bottom") {
        // 水平 handle——resize 高度
        newSize = me.clientY;
      } else if (edge === "right") {
        // 右侧栏——handle 在 zone 左侧，向右拖 = 加宽
        newSize = window.innerWidth - me.clientX;
      } else {
        // 左侧栏——handle 在 zone 右侧，clientX 减掉左侧固定 zones
        const leftFixed = getLeftFixedWidth(zone);
        newSize = me.clientX - leftFixed;
      }
      layoutEngine.resizeZone(zone, newSize);
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [zone]);

  return { onMouseDown };
}

/** 计算 zone 左侧所有非 resizable 固定 zone 的宽度之和。 */
function getLeftFixedWidth(zone: string): number {
  let total = 0;
  for (const z of layoutEngine.getAllZones()) {
    if (z.zone === zone) break;
    if (z.dock?.edge === "left" && z.dock.width) {
      total += z.dock.width;
    }
  }
  return total;
}
