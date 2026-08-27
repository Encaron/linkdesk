/**
 * OverlayPortal——通用悬浮层容器。
 * E5#96：所有 overlay（ContextMenu/Toast/Dialog/ColorPicker/SelectBox）统一 portal 到 body，
 *        脱离 App.tsx zone wrapper 的层叠上下文，永远不会被分割线/图标栏/状态栏遮挡。
 * E5#96+：行为归一化——外部点击检测 / ESC 关闭 / 焦点陷阱 统一进组件。
 *         对标 VS Code IContextViewService——组件只声明意图，壳处理机制。
 * E5.8#107（主题系统最终最优根治 Phase 2）：单一门——默认目标改 #overlay-root（FloatingLayerHost
 *        浮层权威的通用 surface 根），壳 DOM 无此 root 自动回退 body（SettingsView 等现状行为不变）。
 *        遮罩归 scrim-plane 的 getScrimTarget() 同模块导出（单一平面常量唯一权威）。
 *
 * 对标 E5#18 InlineInput 归一化——一个组件替代所有 overlay 的 portal + 行为模式。
 * 未来 FloatingPanel / Tooltip / 底部终端面板等新悬浮 UI 默认使用此组件。
 */
import { useRef, useEffect } from "react";
import { createPortal } from "react-dom";

/** E5.8#107：通用 surface 根 id——FloatingLayerHost 浮层权威（OverlayPortal 默认 portal 目标）。
 *  模块私有常量（单一权威 id——不导出；需 root id 的消费方用 getScrimTarget/getRootTarget 语义访问）。 */
const OVERLAY_ROOT_ID = "overlay-root";

/** E5.8#107：遮罩平面 root id——FloatingLayerHost 双平面架构（遮罩归 scrim-plane，无磨砂） */
const SCRIM_ROOT_ID = "ld-scrim-plane";

/** E5.8#107：遮罩 portal 目标——scrim-plane 存在（池内浮层权威）用层平面；壳侧无此平面回退 body。
 *  遮罩满屏无磨砂，与 surface 平面分离后结构隔离地板（:not(#ld-scrim-plane)）天然不碰它。 */
export function getScrimTarget(): HTMLElement {
  return document.getElementById(SCRIM_ROOT_ID) ?? document.body;
}

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
  /** 叠层 token——透传到 wrapper 的 z-index。
   *  🔥 契约（E5.8#111）：z-index/filter/backdrop-filter/transform 会给包装盒建 stacking context，
   *  内部 fixed 内容的自身 z-index 被困其中、对外只算包装盒层级。scrim 遮罩（--z-overlay-backdrop 500）
   *  在同一层上下文竞争 → 包装盒 z-index 必须 > 500（ContextMenu→Z_INDEX.contextMenu 即此契约），
   *  否则面板内容被遮罩盖住 = 点一下自己退。 */
  zIndex?: string;
  /** E5.7#14：portal 目标 root id——归一化到 FloatingLayerHost 的 portal root。
   *  E5.8#107 默认改 #overlay-root（浮层权威通用 surface 根）；root 不存在（壳 DOM 场景）
   *  自动回退 body。显式传 rootId（ContextMenu→context-menu-root）不受影响。 */
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
    // E5.8#109：data-overlay-wrapper 结构标记——浮层权威的「隔离地板」（index.css）用它排除本包装盒。
    //   包装盒是结构容器（ref/zIndex 载体）不是表面：若地板规则的深度 2 选择器给它的 backdrop-filter，
    //   它就成了 backdrop root，把内部真实表面的 backdrop 采样掐断（E5.8#103 地板因此从未对
    //   右键/toast/命令面板生效——#109 实证：关掉包装盒 blur 后表面 blur 立即渲染，60% 像素变化）。
    //   🔥 E5.8#111 更深陷阱：backdrop-filter 同时给包装盒建 stacking context——面板 z600 被困其中、
    //   对外只算包装盒 z-auto(0)，被 scrim 遮罩 z500 盖住 → 点在预期位置实中遮罩 onClose =「点一下自己退」。
    //   故包装盒必须保持零 stacking-context 属性（backdrop-filter/filter/transform/z-index 均禁；
    //   zIndex 例外见 prop 契约——需 z-index 时必须 > scrim 遮罩 500）。
    <div ref={contentRef} data-overlay-wrapper style={Object.keys(style).length > 1 ? style : {}}>
      {children}
    </div>,
    // E5.8#107 单一门：默认 → #overlay-root（浮层权威 surface 根）；显式 rootId 优先；根缺失回退 body
    (rootId ? document.getElementById(rootId) : document.getElementById(OVERLAY_ROOT_ID)) ?? document.body
  );
}
