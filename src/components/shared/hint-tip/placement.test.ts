/**
 * HintTip 落点纯函数单测——04「悬停提示系统」件 1（设计详案 §四·4.3）。
 *
 * 为什么纯函数直接钉：jsdom 没有真布局，**四向/翻面/夹紧这三件事在集成层量不出来**
 * （`getBoundingClientRect()` 恒 0）——而它们正是"提示条跑到屏幕外/压住锚/盖掉半个屏幕"的全部原因。
 * 照 `HintCard.test.tsx` 先例（那里也是同一个理由把 `computeCardPosition` 单独钉住）。
 *
 * 三条约定各有对应用例：① `GAP_PX` 贴紧（用户拍板「不要箭头」后归属感全靠贴紧）；
 * ② 边对齐不居中；③ 夹紧不裁字（只吐 top/left，尺寸原样用）。
 */
import { describe, expect, it } from "vitest";
import { EDGE_PX, GAP_PX, computeTipPosition, type TipAnchorRect } from "./placement";

const VIEWPORT = { width: 1000, height: 800 };
const TIP = { width: 120, height: 28 };
/** 屏幕正中偏下的锚——四向都放得下，用来验「首选方位被尊重」 */
const MID = (): TipAnchorRect => ({ top: 400, bottom: 430, left: 500, right: 560 });

describe("computeTipPosition 四向落点（首选方位被尊重时）", () => {
  it("top：贴锚上缘、左缘对齐，间距 GAP_PX", () => {
    const p = computeTipPosition(MID(), TIP, VIEWPORT, "top");
    expect(p.placement).toBe("top");
    expect(p.top).toBe(400 - 28 - GAP_PX);
    expect(p.left).toBe(500); // 边对齐不居中（锚右缘 560 与左缘 500 都不影响）
  });

  it("bottom：贴锚下缘、左缘对齐", () => {
    const p = computeTipPosition(MID(), TIP, VIEWPORT, "bottom");
    expect(p.placement).toBe("bottom");
    expect(p.top).toBe(430 + GAP_PX);
    expect(p.left).toBe(500);
  });

  it("left：贴锚左缘、上缘对齐", () => {
    const p = computeTipPosition(MID(), TIP, VIEWPORT, "left");
    expect(p.placement).toBe("left");
    expect(p.left).toBe(500 - 120 - GAP_PX);
    expect(p.top).toBe(400); // 边对齐不居中
  });

  it("right：贴锚右缘、上缘对齐", () => {
    const p = computeTipPosition(MID(), TIP, VIEWPORT, "right");
    expect(p.placement).toBe("right");
    expect(p.left).toBe(560 + GAP_PX);
    expect(p.top).toBe(400);
  });
});

describe("computeTipPosition 翻面（只在自己那条轴上翻）", () => {
  it("top 贴顶放不下 ⇒ 翻到 bottom（上下互翻，不跨轴跳到 left/right）", () => {
    const p = computeTipPosition({ top: 4, bottom: 34, left: 500, right: 560 }, TIP, VIEWPORT, "top");
    expect(p.placement).toBe("bottom");
    expect(p.top).toBe(34 + GAP_PX);
  });

  it("bottom 贴底放不下 ⇒ 翻到 top", () => {
    const p = computeTipPosition({ top: 760, bottom: 795, left: 500, right: 560 }, TIP, VIEWPORT, "bottom");
    expect(p.placement).toBe("top");
    expect(p.top).toBe(760 - 28 - GAP_PX);
  });

  it("left 贴左放不下 ⇒ 翻到 right", () => {
    const p = computeTipPosition({ top: 400, bottom: 430, left: 4, right: 60 }, TIP, VIEWPORT, "left");
    expect(p.placement).toBe("right");
    expect(p.left).toBe(60 + GAP_PX);
  });

  it("right 贴右放不下 ⇒ 翻到 left", () => {
    const p = computeTipPosition({ top: 400, bottom: 430, left: 960, right: 996 }, TIP, VIEWPORT, "right");
    expect(p.placement).toBe("left");
    expect(p.left).toBe(960 - 120 - GAP_PX);
  });

  it("主反两面都放不下 ⇒ 保留首选方位名 + 夹紧（⛔ 不跨轴乱翻——left/right 更放不下也不换）", () => {
    // 视口只剩 40px 高：上下都塞不下 28px+GAP 的条
    const p = computeTipPosition({ top: 10, bottom: 40, left: 500, right: 560 }, TIP, { width: 1000, height: 44 }, "top");
    expect(p.placement).toBe("top"); // 没翻（翻了也不 fits）——方位名如实反映"首选被采纳但夹紧了"
    expect(p.top).toBe(EDGE_PX); // 夹到上边内
  });
});

describe("computeTipPosition 夹紧（⛔ 不裁字——只挪位置）", () => {
  it("锚在左上角 ⇒ 落点被夹进视口内缘 EDGE_PX（且**不翻面**——翻过去左右仍然贴边，翻不解决问题）", () => {
    const p = computeTipPosition({ top: 0, bottom: 20, left: 0, right: 40 }, TIP, VIEWPORT, "top");
    // top 原始落点 = -34（越界）→ 想翻 bottom：但 bottom 的 left 仍 = 锚左缘 0（< EDGE_PX）⇒ 两面都不 fits
    // ⇒ 判定保持首选方位，靠夹紧把 x/y 各自推回边内（fits 是"整条完整落在视口内"的双轴判据）
    expect(p.placement).toBe("top");
    expect(p.top).toBe(EDGE_PX);
    expect(p.left).toBe(EDGE_PX);
  });

  it("右缘溢出 ⇒ 左移夹紧（right 方位贴视口右界的锚）", () => {
    const p = computeTipPosition({ top: 400, bottom: 430, left: 940, right: 995 }, TIP, VIEWPORT, "right");
    // right 原始 left = 995+6 = 1001，越界；翻 left = 940-120-6 = 814 ⇒ fits ⇒ 翻面且不溢出
    expect(p.left).toBe(814);
    expect(p.left + TIP.width).toBeLessThanOrEqual(VIEWPORT.width - EDGE_PX);
  });

  it("条比视口还大 ⇒ 落点退回左/上边缘（宁可溢出尾端也不切头）", () => {
    const huge = { width: 1200, height: 900 };
    const p = computeTipPosition(MID(), huge, VIEWPORT, "top");
    expect(p.top).toBe(EDGE_PX);
    expect(p.left).toBe(EDGE_PX);
  });
});
