/**
 * HintCard——通用**悬停说明卡**（E6#120 · 2026-09-19）。贴在锚元素旁边、出卡看一眼就走。
 *
 * ── 它是什么、不是什么（口径唯一真相源 = 05-任务-市场显示状态.md §四；格 5 那张卡抽成共享件）──
 * **非交互浮层**：⛔ 无遮罩、⛔ 不抢焦点（OverlayPortal 不传 `trapFocus`）、⛔ 卡内不放链接与按钮
 * （卡体 `pointer-events:none`）；`closeOnOutsideClick={false}`——只靠「移开」消失的卡不该被鼠标按下关掉。
 * 触发：鼠标悬停（`openDelayMs` 意图延时，默认 400ms——防划过闪一下）/ <kbd>Tab</kbd> 聚焦 / 触屏点按出；
 * 移开 / 失焦 / <kbd>Esc</kbd> / 点外收。⛔ 不挂原生 `title`（会与卡同屏打架）。
 * ⛔ 不做点击弹层 / toast / 暗屏大面板 / 模态框——那是别的件。
 *
 * ── 保底四条（判据⑥，`HintCard.test.tsx` 有对应断言）──
 * ① 锚元素卸载 ⇒ 卡随本组件一起卸载（portal 条件渲染，结构上不可能留在屏幕上）；
 * ② 空间不足 ⇒ 自动翻面（bottom ↔ top），两面都不够 ⇒ 夹紧到视口边缘、⛔ 不裁字（`computeCardPosition`）；
 * ③ 无 hover 的设备 ⇒ 点按出卡、点外收（⛔ 不许「没反应」）；
 * ④ 调用方传空文案 ⇒ 不出卡也不出空壳（children 原样返回）。
 *
 * ── 玻璃（结构铁律，E5.8#107/#109/#111）──
 * 卡体表面是 `OverlayPortal` 的 `[data-overlay-wrapper]` **直接子** ⇒ 吃到 `src/index.css` 深度 3 那条
 * `backdrop-filter: blur(max(var(--glass-blur), var(--float-blur-floor)))`；⛔ 多包一层就没有玻璃。
 * 样式只走 token（`HintCard.css`）——深浅主题 / 三档模糊 / 全局字号缩放零代码。
 *
 * ── 分工（8 维度 ⑦）──
 * **壳给**：何时出（触发状态机）、出在哪（定位/翻面/夹紧）、长什么样（玻璃/主题/token）、何时收；
 * **调用方给**：`lines` 文案、锚元素、可选 `title` / `note` / `placement` / `openDelayMs`。
 * ⛔ 壳不下发任何用户可见句子——文案永远由调用方传（三套词表的边界不被共享件污染）；
 * ⛔ 业务判断（兼容状态怎么算等）不进本件——调用方算好把句子给过来。
 *
 * 消费方先例：`marketplace` 的 CompatStatus（格 5 卡体由本件替换——容器/触发/文案不动）。
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import OverlayPortal from "../overlay-portal/OverlayPortal";
import "./HintCard.css";

/** 锚与卡的间距（格 5 mockup：标下缘 +6px） */
const GAP_PX = 6;
/** 视口边缘夹紧余量（格 5：`Math.max(8, …)`） */
const EDGE_PX = 8;

export interface HintCardProps {
  /** 卡正文（1–3 句——调用方给的**用户可见句子**；⛔ 空数组 ⇒ 不出卡） */
  lines: string[];
  /** 卡标题（可选；如状态词本身） */
  title?: string;
  /** 卡页脚小字（可选；如「在你本机自动核对」这类注脚） */
  note?: string;
  /** 首选贴边：默认 `bottom`（标下缘）；空间不足自动翻面 */
  placement?: "top" | "bottom";
  /** 悬停意图延时 ms（默认 400——防鼠标划过闪一下） */
  openDelayMs?: number;
  /** 锚元素（唯一子代；触发事件由本件挂在这个包装上，靠 React onFocus 冒泡语义） */
  children: React.ReactNode;
}

/** 矩形（只取本件用得到的四元组——jsdom/真机同形） */
export interface RectLike {
  top: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
}

/**
 * 卡的落点（**纯函数**——翻面与夹紧判据的单一实现，单测直接钉）：
 * 首选 `placement` 贴不下 ⇒ 翻另一面；两面都贴不下 ⇒ 夹紧到视口边缘（⛔ 不裁字）。
 */
export function computeCardPosition(
  anchor: Pick<RectLike, "top" | "bottom" | "left">,
  card: Pick<RectLike, "width" | "height">,
  viewport: { width: number; height: number },
  placement: "top" | "bottom",
): { top: number; left: number; placement: "top" | "bottom" } {
  const left = Math.max(EDGE_PX, Math.min(anchor.left, viewport.width - card.width - EDGE_PX));
  const below = anchor.bottom + GAP_PX;
  const above = anchor.top - card.height - GAP_PX;
  const fitsBelow = below + card.height <= viewport.height - EDGE_PX;
  const fitsAbove = above >= EDGE_PX;
  let resolved = placement;
  if (placement === "bottom" && !fitsBelow && fitsAbove) resolved = "top";
  else if (placement === "top" && !fitsAbove && fitsBelow) resolved = "bottom";
  else if (placement === "bottom" && !fitsBelow && !fitsAbove) resolved = "top"; // 两面都不够 ⇒ 翻面后靠夹紧贴边
  const raw = resolved === "bottom" ? below : above;
  const maxTop = Math.max(EDGE_PX, viewport.height - card.height - EDGE_PX);
  return { top: Math.min(Math.max(raw, EDGE_PX), maxTop), left: Math.max(EDGE_PX, left), placement: resolved };
}

function HintCard({ lines, title, note, placement = "bottom", openDelayMs = 400, children }: HintCardProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const cardId = useId();

  const hasHint = lines.length > 0;

  const close = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    setOpen(false);
  }, []);

  /** 出卡（先按锚矩形估一个落点，useLayoutEffect 里量卡实高再校正/翻面——paint 前完成，不闪帧） */
  const placeAndOpen = useCallback(() => {
    const r = hostRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + GAP_PX, left: r.left });
    setOpen(true);
  }, []);

  const enter = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(placeAndOpen, openDelayMs);
  }, [placeAndOpen, openDelayMs]);

  const leave = useCallback(() => {
    window.clearTimeout(hoverTimer.current);
    setOpen(false);
  }, []);

  /** 卡渲染后量实高校正（翻面 ＋ 视口夹紧——保底②，⛔ 不裁字） */
  useLayoutEffect(() => {
    if (!open) return;
    const a = hostRef.current?.getBoundingClientRect();
    const c = cardRef.current?.getBoundingClientRect();
    if (!a || !c) return;
    const fixed = computeCardPosition(a, c, { width: window.innerWidth, height: window.innerHeight }, placement);
    setPos({ top: fixed.top, left: fixed.left });
  }, [open, placement]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []); // 卸载清计时器（硬约束 14）

  /** 触屏「点外收」——只服务无 hover 的路径（鼠标移开时卡已关）；活跃守卫照硬约束 14 */
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      if (!hostRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", h, true);
    return () => window.removeEventListener("pointerdown", h, true);
  }, [open]);

  if (!hasHint) return <>{children}</>; // 保底④：空文案 ⇒ 不出卡、不出空壳

  return (
    <span
      ref={hostRef}
      className="ldk-hint-card-host"
      aria-describedby={open ? cardId : undefined}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={placeAndOpen}
      onBlur={leave}
      onClick={placeAndOpen}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      {children}
      {open && (
        <OverlayPortal onClose={close} triggerRef={hostRef} closeOnOutsideClick={false}>
          <div ref={cardRef} id={cardId} className="ldk-hint-card" role="tooltip" style={pos}>
            {title != null && <div className="ldk-hint-card-title">{title}</div>}
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {note != null && <div className="ldk-hint-card-note">{note}</div>}
          </div>
        </OverlayPortal>
      )}
    </span>
  );
}

export default HintCard;
