/**
 * HintTip 落点——**纯函数**（04「悬停提示系统」件 1；设计详案 §四·4.3）。
 *
 * 与 `HintCard.computeCardPosition` **同族但独立**：卡是「固定 300px 宽 + 只分上下」，
 * 提示条是「宽度随内容 + 四向」——参数与几何都不同，硬并成一个函数会两头迁就（且卡的 300px
 * 定宽会渗进条的计算）。独立成函数 ⇒ 单测可直接钉四向/翻面/夹紧（照 `HintCard.test.tsx` 先例）。
 *
 * ── 三条几何约定（改动前先读，都是拍板结论不是默认值）──
 * ① **`GAP_PX = 6` 不许再放大**——用户 2026-09-27 拍板「不要小箭头，就是一个框型」，
 *    归属感从此改由「**贴紧锚**」承担；一放大，条与锚脱开，就看不出它属于谁了。
 * ② **边对齐不居中**——条与锚对齐同一条起始边（上下贴左缘、左右贴上缘），同 HintCard。
 *    居中要靠量锚宽再算，且没有箭头时视觉上并不更"指向"。
 * ③ **夹紧不裁字**——两面都贴不下时往视口里夹，⛔ 绝不靠截断文字换取贴合（照 HintCard 保底②）。
 *    故本函数只吐 `top/left`，尺寸由调用方原样使用。
 */

/** 锚与条的间距（见上 ①——不许放大） */
export const GAP_PX = 6;
/** 视口边缘夹紧余量（同 HintCard） */
export const EDGE_PX = 8;

/** 四向首选方位——`top` 为缺省（贴锚上方），贴不下自动翻反面 */
export type TipPlacement = "top" | "bottom" | "left" | "right";

/** 锚矩形（只取本件用得到的四元组——`getBoundingClientRect()` 可直接喂） */
export interface TipAnchorRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** 条的实测尺寸（先渲染再量——`max-content` 宽度不预知） */
export interface TipSize {
  width: number;
  height: number;
}

export interface TipPosition {
  top: number;
  left: number;
  /** 实际落点方位（可能与传入的 `placement` 不同——翻过面） */
  placement: TipPlacement;
}

/** 主/反方位配对——翻面只在自己那条轴上翻（上下互翻、左右互翻），⛔ 不跨轴跳 */
const OPPOSITE: Record<TipPlacement, TipPlacement> = {
  top: "bottom",
  bottom: "top",
  left: "right",
  right: "left",
};

/** 按方位算出该方位的原始落点（不做夹紧——夹紧在最后统一做） */
function rawPlacement(anchor: TipAnchorRect, tip: TipSize, placement: TipPlacement): { top: number; left: number } {
  switch (placement) {
    case "top":
      return { top: anchor.top - tip.height - GAP_PX, left: anchor.left };
    case "bottom":
      return { top: anchor.bottom + GAP_PX, left: anchor.left };
    case "left":
      return { top: anchor.top, left: anchor.left - tip.width - GAP_PX };
    case "right":
      return { top: anchor.top, left: anchor.right + GAP_PX };
  }
}

/** 该方位是否完整落在视口内（含夹紧余量）——判据单一处，翻面与不翻都读它 */
function fits(pos: { top: number; left: number }, tip: TipSize, viewport: TipSize): boolean {
  return pos.top >= EDGE_PX && pos.left >= EDGE_PX && pos.top + tip.height <= viewport.height - EDGE_PX && pos.left + tip.width <= viewport.width - EDGE_PX;
}

/**
 * 条的落点：首选 `placement` ⇒ 贴不下翻反面 ⇒ 两面都贴不下夹紧到视口边缘（⛔ 不裁字）。
 *
 * @param anchor  锚矩形（视口坐标——本件用 `position: fixed`，与 `getBoundingClientRect()` 同系）
 * @param tip     条的**实测**尺寸（先渲染后量；本函数不估计）
 * @param viewport 视口尺寸（`innerWidth/innerHeight`）
 * @param placement 首选方位
 */
export function computeTipPosition(anchor: TipAnchorRect, tip: TipSize, viewport: TipSize, placement: TipPlacement): TipPosition {
  const primary = rawPlacement(anchor, tip, placement);
  const opposite = OPPOSITE[placement];

  let resolved = placement;
  let pos = primary;
  if (!fits(primary, tip, viewport) && fits(rawPlacement(anchor, tip, opposite), tip, viewport)) {
    resolved = opposite;
    pos = rawPlacement(anchor, tip, opposite);
  }

  // 夹紧（⛔ 不裁字）：max 兜底 —— 条自身比视口还大时保证落点仍在边内（宁可溢出尾端也不切头）
  const maxTop = Math.max(EDGE_PX, viewport.height - tip.height - EDGE_PX);
  const maxLeft = Math.max(EDGE_PX, viewport.width - tip.width - EDGE_PX);
  return {
    top: Math.min(Math.max(pos.top, EDGE_PX), maxTop),
    left: Math.min(Math.max(pos.left, EDGE_PX), maxLeft),
    placement: resolved,
  };
}
