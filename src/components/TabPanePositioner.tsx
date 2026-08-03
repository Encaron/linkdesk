/**
 * TabPanePositioner — 将子组件绝对定位到指定 group 的 tab-content-pool 内。
 * B33 修复：tab pane 不嵌套在 per-group pool 中，React 树位置永不变。
 * 移动标签页 → groupId 变 → ResizeObserver 自动更新绝对定位 → 零 unmount。
 */

import { useRef, useLayoutEffect, type ReactNode } from "react";

interface Props {
  groupId: string;
  isVisible: boolean;
  children: ReactNode;
}

export default function TabPanePositioner({ groupId, isVisible, children }: Props) {
  const paneRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = paneRef.current;
    if (!el) return;

    const updatePosition = () => {
      const target = el.parentElement?.querySelector(
        `.tab-content-pool[data-group-id="${CSS.escape(groupId)}"]`
      ) as HTMLElement | null;
      if (!target || !el.parentElement) return;

      const tRect = target.getBoundingClientRect();
      const pRect = el.parentElement.getBoundingClientRect();

      el.style.left   = `${tRect.left - pRect.left}px`;
      el.style.top    = `${tRect.top  - pRect.top}px`;
      el.style.width  = `${tRect.width}px`;
      el.style.height = `${tRect.height}px`;
    };

    updatePosition();

    // Observer: 主内容区尺寸变化（分屏拖拽 / 窗口 resize）
    const ro = new ResizeObserver(updatePosition);
    if (el.parentElement) ro.observe(el.parentElement);

    // 目标 pool 可能还未挂载——用 MutationObserver 候补
    const target = el.parentElement?.querySelector(
      `.tab-content-pool[data-group-id="${CSS.escape(groupId)}"]`
    );
    if (target) {
      ro.observe(target);
    } else {
      // pool 尚未挂载（首次渲染时序），等 DOM 插入后再绑定
      const mo = new MutationObserver(() => {
        const t = el.parentElement?.querySelector(
          `.tab-content-pool[data-group-id="${CSS.escape(groupId)}"]`
        );
        if (t) {
          ro.observe(t);
          mo.disconnect();
          updatePosition();
        }
      });
      if (el.parentElement) {
        mo.observe(el.parentElement, { childList: true, subtree: true });
      }
      return () => { ro.disconnect(); mo.disconnect(); };
    }

    return () => ro.disconnect();
  }, [groupId]);

  return (
    <div
      ref={paneRef}
      className="tab-content-pane"
      style={{
        position: "absolute",
        opacity: isVisible ? 1 : 0,
        pointerEvents: isVisible ? "auto" : "none",
        zIndex: isVisible ? 1 : 0,
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
