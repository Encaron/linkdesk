/**
 * useTreeResize——虚拟滚动所需的两项几何量测（E6#87a 从 FileTree.tsx 拆出）。
 *
 *   - ResizeObserver：容器高度 → `containerHeight`（决定渲染条数）
 *   - 滚动容器探测：向上找第一个 overflowY ∈ {auto, scroll} 的祖先
 *     （实际滚动容器是 `.side-panel-content`，不是本组件根节点）
 *
 * `containerRef` 由本 hook 持有并对外暴露——组件根节点绑定它，rename 退出后的
 * defer 聚焦、键盘/拖放的容器查询都从这里取。
 */
import { useEffect, useRef, useState } from "react";

export function useTreeResize() {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const scrollTopRef = useRef(0);
  const [containerHeight, setContainerHeight] = useState(0);

  /* ── ResizeObserver ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => { setContainerHeight(entries[0].contentRect.height); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── 滚动检测——.side-panel-content 是实际滚动容器 ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let scrollEl: HTMLElement | null = el.parentElement;
    while (scrollEl) {
      if (/(auto|scroll)/.test(window.getComputedStyle(scrollEl).overflowY)) break;
      scrollEl = scrollEl.parentElement;
    }
    if (!scrollEl) return;
    scrollElRef.current = scrollEl; // E4V#30: reveal 用它定位滚动
    scrollTopRef.current = scrollEl.scrollTop;
    setScrollTop(scrollEl.scrollTop);
    const handler = () => { scrollTopRef.current = scrollEl.scrollTop; setScrollTop(scrollEl.scrollTop); };
    scrollEl.addEventListener("scroll", handler, { passive: true });
    return () => {
      scrollEl!.removeEventListener("scroll", handler);
      scrollElRef.current = null;
    };
  }, []);

  return { containerRef, scrollElRef, scrollTop, scrollTopRef, containerHeight };
}
