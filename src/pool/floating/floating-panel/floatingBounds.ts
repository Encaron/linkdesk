/**
 * 壳内悬浮面板几何钳制——I8-5 / I8-7 隐藏边界的**单一真相源**（M2 `AI#20` 立）。
 *
 * 为什么单拎一个纯模块：`AI#20` 给面板补了非鼠标路径（`panel.setFloatingBounds`）。若 API 路径
 * 另写一套钳制，面板就能被设成一个**拖不出来**的状态（新的不一致）——本模块让三条路径共用同一组常量
 * 与同一套边界：
 *   · I8-5 拖拽（整条标题栏）→ `clampDragTo`
 *   · I8-7 调高（底部手柄）→ `clampResizeTo`
 *   · API 精确设定（任意字段）→ `clampApi`
 * 纯函数零 React / 零 DOM 依赖（视口尺寸由调用方传入）⇒ 直接单测，三个路径的边界可逐条对账。
 *
 * ⚠️ 宽度**只做上限**（壳体钳制 innerWidth - 2×inset），没有下限常量——拖拽路径从不变宽（I8-7 只调高），
 *    「下限」此前从未存在；API 路径不新造一个常量（概念键分离：高度下限 MIN_HEIGHT 是 I8-7 的既定边界，
 *    宽度没有对应物）。≤0 / 非有限值的宽度按「未指定」处理。
 */

import type { FloatingPanelBounds } from "../../../core/types/pool/poolFloatingPanel";

export const CLAMP_INSET = 6; // I8-5 壳内钳制：拖不出壳窗口边界（mockup clamp-zone inset:6px）
export const MIN_HEIGHT = 300; // I8-7 resize 最小高
export const RESIZE_MAX_OFFSET = 80; // I8-7 resize 最大 = 窗口高 - 80

/** 视口尺寸（壳窗口内容区）——池内取 window.innerWidth/innerHeight 传入 */
export interface FloatingPanelViewport {
  width: number;
  height: number;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi));

/** 有限数才认（API 载荷来自外部/DTO——坏值一律当「未指定」，⛔ 不把 NaN 写进几何） */
export const finiteOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** 高度上界（I8-7 原式）——窗口极小时不反转（max 兜底，与原 clamp 同结果） */
const maxHeight = (vp: FloatingPanelViewport): number => Math.max(MIN_HEIGHT, vp.height - RESIZE_MAX_OFFSET);

/** I8-5 拖拽钳制：只动 top/left（宽高保持起始快照），top/left 不出壳窗口 6px inset */
export function clampDragTo(
  origin: FloatingPanelBounds,
  dx: number,
  dy: number,
  vp: FloatingPanelViewport,
): FloatingPanelBounds {
  return {
    top: clamp(origin.top + dy, CLAMP_INSET, vp.height - origin.height - CLAMP_INSET),
    left: clamp(origin.left + dx, CLAMP_INSET, vp.width - origin.width - CLAMP_INSET),
    width: origin.width,
    height: origin.height,
  };
}

/** I8-7 调高钳制：只动 height（top 固定——从底部伸展），高度 ∈ [MIN_HEIGHT, 窗口高 - 80] */
export function clampResizeTo(
  origin: FloatingPanelBounds,
  dy: number,
  vp: FloatingPanelViewport,
): FloatingPanelBounds {
  return {
    top: origin.top,
    left: origin.left,
    width: origin.width,
    height: clamp(origin.height + dy, MIN_HEIGHT, vp.height - RESIZE_MAX_OFFSET),
  };
}

/**
 * M2 `AI#20` API 路径：按字段精确设定 + **同一套** I8-5/I8-7 边界。
 * `requested` 只带想改的字段（未带 = 保持 `current` 实测值——API 支持「只挪位置」/「只调高」）。
 * 宽度：正数→上限钳制；≤0/非有限→视为未指定（无下限常量，见文件头）。
 */
export function clampApi(
  current: FloatingPanelBounds,
  requested: Partial<FloatingPanelBounds>,
  vp: FloatingPanelViewport,
): FloatingPanelBounds {
  const reqWidth = finiteOrNull(requested.width);
  const width =
    reqWidth !== null && reqWidth > 0
      ? Math.min(reqWidth, Math.max(1, vp.width - CLAMP_INSET * 2))
      : current.width;
  const height = clamp(finiteOrNull(requested.height) ?? current.height, MIN_HEIGHT, maxHeight(vp));
  const top = clamp(
    finiteOrNull(requested.top) ?? current.top,
    CLAMP_INSET,
    Math.max(CLAMP_INSET, vp.height - height - CLAMP_INSET),
  );
  const left = clamp(
    finiteOrNull(requested.left) ?? current.left,
    CLAMP_INSET,
    Math.max(CLAMP_INSET, vp.width - width - CLAMP_INSET),
  );
  return { top, left, width, height };
}

/** 当前渲染盒（DOM 实测）→ FloatingPanelBounds——API 路径「未指定字段保持现值」的 current 来源 */
export function boundsOfRect(rect: { top: number; left: number; width: number; height: number }): FloatingPanelBounds {
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}
