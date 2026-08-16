/**
 * OverlayPortal——通用悬浮层容器。
 * E5#96：所有 overlay（ContextMenu/Toast/Dialog/ColorPicker/SelectBox）统一 portal 到 body，
 *        脱离 App.tsx zone wrapper 的层叠上下文，永远不会被分割线/图标栏/状态栏遮挡。
 * E5#96+：行为归一化——外部点击检测 / ESC 关闭 / 焦点陷阱 统一进组件。
 *         对标 VS Code IContextViewService——组件只声明意图，壳处理机制。
 *
 * 对标 E5#18 InlineInput 归一化——一个组件替代所有 overlay 的 portal + 行为模式。
 * 未来 FloatingPanel / Tooltip / 底部终端面板等新悬浮 UI 默认使用此组件。
 */
import { useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface OverlayPortalProps {
  children: React.ReactNode;
  /** E5.7#100：活跃守卫——false 时所有窗口级监听器挂起（防"挂载但隐藏"态回调泄漏，
   *  硬约束 14）。条件挂载（{open && <OverlayPortal/>}）的消费方可省略——默认 true */
  open?: boolean;
  /** 外部点击 / Escape → 关闭回调。不传则无外部关闭行为（如 ToastContainer） */
  onClose?: () => void;
  /** 点击此 ref 指向的元素不算"外部"（如触发按钮）。每次事件回调内实时读，不缓存 */
  triggerRef?: React.RefObject<HTMLElement>;
  /** Tab/Shift+Tab 在 overlay 内循环。首次渲染自动 focus 第一个可聚焦元素 */
  trapFocus?: boolean;
  /** 叠层 token——透传到 wrapper 的 z-index */
  zIndex?: string;
  /** E5.7#14：portal 目标 root id——归一化到 FloatingLayerHost 的 portal root。
   *  默认 document.body；root 不存在（壳 DOM 场景）自动回退 body。 */
  rootId?: string;
}

/** 可聚焦元素选择器——对标 VS Code focusable selectors */
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function OverlayPortal({ children, onClose, triggerRef, trapFocus, zIndex, rootId, open = true }: OverlayPortalProps) {
  const contentRef = useRef<HTMLDivElement>(null);

  /* ── E5#96i: mousedown 外部点击检测（捕获阶段——早于 React 合成事件）── */
  useEffect(() => {
    if (!open) return; // 活跃守卫——overlay 关闭态不挂监听（硬约束 14）
    if (!onClose) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideContent = contentRef.current?.contains(target);
      const insideTrigger = triggerRef?.current?.contains(target) ?? false;
      if (!insideContent && !insideTrigger) onClose();
    };
    window.addEventListener("mousedown", handler, true);
    return () => window.removeEventListener("mousedown", handler, true);
  }, [open, onClose, triggerRef]);

  /* ── E5#96j: keydown Escape ── */
  useEffect(() => {
    if (!open) return; // 活跃守卫——overlay 关闭态不挂监听（硬约束 14）
    if (!onClose) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  /* ── E5#96k: trapFocus——焦点循环 ── */
  useEffect(() => {
    if (!open) return; // 活跃守卫——同组件其余 effect（硬约束 14 grep 原则）
    if (!trapFocus) return;
    const el = contentRef.current;
    if (!el) return;

    // 首次渲染——自动 focus 第一个可聚焦元素
    const first = el.querySelector<HTMLElement>(FOCUSABLE);
    if (first) first.focus();
    else el.tabIndex = -1, el.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const focusable = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) { e.preventDefault(); return; }
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, trapFocus]);

  /* ── E5#96l: wrapper inline style ── */
  const style: React.CSSProperties = {
    position: "relative",
    ...(zIndex ? { zIndex } : {}),
  };

  return createPortal(
    <div ref={contentRef} style={Object.keys(style).length > 1 ? style : {}}>
      {children}
    </div>,
    (rootId ? document.getElementById(rootId) : null) ?? document.body
  );
}
