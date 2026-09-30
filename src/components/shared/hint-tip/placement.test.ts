/**
 * HintTip 落点/尖角纯函数单测——04「悬停提示系统」件 1（设计详案 §四·4.3 ＋ 2026-09-27 返工）。
 *
 * 为什么纯函数直接钉：jsdom 没有真布局，**主轴判据/翻面/副轴居中/夹紧/绝不压锚**这五件事
 * 在集成层量不出来（`getBoundingClientRect()` 恒 0）——而它们正是"提示条跑到屏幕外/压住锚/
 * 盖掉半个屏幕"的全部原因（返工件 §二 那三处实机毛病，量出来的都是这几个数）。
 *
 * 用例分组对着现行五条几何约定：① GAP 贴紧 ② 主轴判可贴＋副轴居中 ③ 绝不压锚
 * ④ 夹紧不裁字 ⑤ 尖角落位（含"方向由 CSS 那边配套"的边界）。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EDGE_PX,
  GAP_PX,
  TAIL_EDGE_INSET_PX,
  TAIL_SIZE_PX,
  computeTailOffset,
  computeTipPosition,
  isPointerOnAnchor,
  type TipAnchorRect,
  type TipPlacement,
} from "./placement";

const VIEWPORT = { width: 1000, height: 800 };
const TIP = { width: 120, height: 28 };
/** 屏幕正中偏下的锚——四向都放得下，用来验「首选方位被尊重」 */
const MID = (): TipAnchorRect => ({ top: 400, bottom: 430, left: 500, right: 560 });

describe("computeTipPosition 四向落点（首选方位够放时——主轴贴边保 GAP ＋ 副轴与锚中心对齐）", () => {
  it("top：贴锚上缘留 GAP；**横向与锚中心对齐**（锚中心 x=530 ⇒ 条左缘 470，不是锚左缘 500）", () => {
    const p = computeTipPosition(MID(), TIP, VIEWPORT, "top");
    expect(p.placement).toBe("top");
    expect(p.top).toBe(400 - 28 - GAP_PX);
    expect(p.left).toBe(470);
  });

  it("bottom：贴锚下缘留 GAP；横向仍居中", () => {
    const p = computeTipPosition(MID(), TIP, VIEWPORT, "bottom");
    expect(p.placement).toBe("bottom");
    expect(p.top).toBe(430 + GAP_PX);
    expect(p.left).toBe(470);
  });

  it("left：贴锚左缘留 GAP；**纵向与锚中心对齐**（锚中心 y=415 ⇒ 条上缘 401）", () => {
    const p = computeTipPosition(MID(), TIP, VIEWPORT, "left");
    expect(p.placement).toBe("left");
    expect(p.left).toBe(500 - 120 - GAP_PX);
    expect(p.top).toBe(401);
  });

  it("right：贴锚右缘留 GAP；纵向仍居中", () => {
    const p = computeTipPosition(MID(), TIP, VIEWPORT, "right");
    expect(p.placement).toBe("right");
    expect(p.left).toBe(560 + GAP_PX);
    expect(p.top).toBe(401);
  });
});

describe("computeTipPosition 翻面（主轴不够才翻，只在自己那条轴上翻）", () => {
  it("top 贴顶不够 ⇒ 翻到 bottom（上下互翻，⛔ 不跨轴跳到 left/right）", () => {
    const p = computeTipPosition({ top: 4, bottom: 34, left: 500, right: 560 }, TIP, VIEWPORT, "top");
    expect(p.placement).toBe("bottom");
    expect(p.top).toBe(34 + GAP_PX);
  });

  it("bottom 贴底不够 ⇒ 翻到 top", () => {
    const p = computeTipPosition({ top: 760, bottom: 795, left: 500, right: 560 }, TIP, VIEWPORT, "bottom");
    expect(p.placement).toBe("top");
    expect(p.top).toBe(760 - 28 - GAP_PX);
  });

  it("left 贴左不够 ⇒ 翻到 right", () => {
    const p = computeTipPosition({ top: 400, bottom: 430, left: 4, right: 60 }, TIP, VIEWPORT, "left");
    expect(p.placement).toBe("right");
    expect(p.left).toBe(60 + GAP_PX);
  });

  it("right 贴右不够 ⇒ 翻到 left", () => {
    const p = computeTipPosition({ top: 400, bottom: 430, left: 960, right: 996 }, TIP, VIEWPORT, "right");
    expect(p.placement).toBe("left");
    expect(p.left).toBe(960 - 120 - GAP_PX);
  });
});

describe("computeTipPosition 绝不压锚（🔴 用户实机挑出的 ✕ 现场——初版的病灶就在这里）", () => {
  it("✕ 在窗口右上角：横向越界**不再**否决翻面 ⇒ 翻到下方且**不压锚**（初版会夹紧拉回来铺在 ✕ 身上）", () => {
    // 锚 = 窗口最右缘的 ✕：纵向只剩 4px（贴视口顶）、横向也贴到只剩 6px
    const anchor = { top: 4, bottom: 26, left: 970, right: 994 };
    const p = computeTipPosition(anchor, TIP, VIEWPORT, "top");
    expect(p.placement).toBe("bottom"); // 副轴越界也不否决翻面（初版：两面都不 fits ⇒ 不翻）
    expect(p.top).toBe(26 + GAP_PX); // 贴锚下缘
    expect(p.top).toBeGreaterThanOrEqual(anchor.bottom + GAP_PX); // 🔴 回归断言：没被夹紧拉回锚上
    expect(p.left + TIP.width).toBeLessThanOrEqual(VIEWPORT.width - EDGE_PX); // 右缘夹紧进视口
    expect(p.left).toBe(872);
  });

  it("锚贴视口左上角：翻面方向照旧成立，横向夹紧后仍不与锚相交", () => {
    const anchor = { top: 4, bottom: 26, left: 6, right: 30 };
    const p = computeTipPosition(anchor, TIP, VIEWPORT, "top");
    expect(p.placement).toBe("bottom");
    expect(p.top).toBe(26 + GAP_PX);
    expect(p.left).toBe(EDGE_PX); // 居中会被夹到左边缘
  });

  it("夹紧会**吃掉 GAP**（把条拉到蹭着锚）⇒ 换空间最大的一侧重落", () => {
    // 锚上缘 36：够放（36 ≥ 28+GAP），但贴边夹紧会把 top 从 2 抬到 EDGE_PX=8 ⇒ 条下缘正好压到锚
    const anchor = { top: 36, bottom: 58, left: 500, right: 560 };
    const p = computeTipPosition(anchor, TIP, VIEWPORT, "top");
    expect(p.placement).toBe("bottom"); // 空间最大的一侧（下方 742px）
    expect(p.top).toBe(58 + GAP_PX);
    expect(p.top).toBeGreaterThanOrEqual(anchor.bottom + GAP_PX); // GAP 保住了
  });
});

describe("computeTipPosition 保底（四面都不够 / 条比视口还大——⛔ 仍不裁字）", () => {
  it("四面都不够 ⇒ 取**空间最大**的一侧（宁可换个方位，也不把条塞回锚上）", () => {
    // 视口只剩 44px 高：上下都塞不下 28px+GAP 的条 ⇒ 左右里挑（left 500 > right 440）
    const p = computeTipPosition({ top: 10, bottom: 40, left: 500, right: 560 }, TIP, { width: 1000, height: 44 }, "top");
    expect(p.placement).toBe("left");
    expect(p.top).toBe(EDGE_PX); // 纵向夹到上边内
  });

  it("条比视口还大 ⇒ 落点退回左/上边缘（宁可溢出尾端也不切头）", () => {
    const p = computeTipPosition(MID(), { width: 1200, height: 900 }, VIEWPORT, "top");
    expect(p.top).toBe(EDGE_PX);
    expect(p.left).toBe(EDGE_PX);
  });
});

describe("computeTailOffset 尖角落位（沿条边指向锚的副轴中心）", () => {
  it("条与锚居中时 ⇒ 尖角落在条中线（元素 left = 60-4 = 56）", () => {
    expect(computeTailOffset(MID(), TIP, { top: 366, left: 470 }, "top")).toBe(56);
  });

  it("✕ 现场（条被右缘夹紧）⇒ 尖角贴住条右端内侧，仍指向 ✕ 中心（元素 left 106 ⇒ 中心 110 ⇒ 视口 982）", () => {
    const anchor = { top: 4, bottom: 26, left: 970, right: 994 };
    const pos = { top: 32, left: 872 };
    expect(computeTailOffset(anchor, TIP, pos, "bottom")).toBe(106);
    expect(pos.left + 106 + TAIL_SIZE_PX / 2).toBe((anchor.left + anchor.right) / 2);
  });

  it("横向方位（left/right）：尖角走纵轴，纵向被夹紧时**夹进条内**（不许跑到条外）", () => {
    expect(computeTailOffset(MID(), TIP, { top: 401, left: 374 }, "left")).toBe(10);
    // 纵向夹到 8 后锚中心只差 3px ⇒ 夹到"距端 8px"的下限
    expect(computeTailOffset({ top: 2, bottom: 20, left: 500, right: 560 }, TIP, { top: 8, left: 374 }, "left")).toBe(TAIL_EDGE_INSET_PX);
  });

  it("条太窄以致可用区间反向 ⇒ 取正中（⛔ 不出界、不出 NaN）", () => {
    const narrow = { width: TAIL_SIZE_PX + 4, height: 28 }; // 12px 宽 < 2×(half+inset)=16
    expect(computeTailOffset(MID(), narrow, { top: 366, left: 470 }, "top")).toBe((TAIL_SIZE_PX + 4) / 2 - TAIL_SIZE_PX / 2);
  });

  it("不变量：尖角始终整只落在条内（四个方位 × 若干锚）", () => {
    const anchors: TipAnchorRect[] = [
      MID(),
      { top: 4, bottom: 26, left: 970, right: 994 },
      { top: 0, bottom: 20, left: 0, right: 40 },
      { top: 770, bottom: 795, left: 4, right: 60 },
    ];
    for (const placement of ["top", "bottom", "left", "right"] as TipPlacement[]) {
      for (const anchor of anchors) {
        const pos = computeTipPosition(anchor, TIP, VIEWPORT, placement);
        const offset = computeTailOffset(anchor, TIP, pos, placement);
        const extent = placement === "top" || placement === "bottom" ? TIP.width : TIP.height;
        expect(offset).toBeGreaterThanOrEqual(TAIL_EDGE_INSET_PX);
        expect(offset + TAIL_SIZE_PX).toBeLessThanOrEqual(extent - TAIL_EDGE_INSET_PX);
      }
    }
  });
});

/**
 * `isPointerOnAnchor`——「几何变了之后指针还在锚上吗」（2026-09-30 用户实机立案）。
 * 命中测试是**注入的**，所以这一组不依赖 `document.elementFromPoint`（jsdom 根本没有它）——
 * 钉的正是那三态：在锚上 / 不在锚上 / **无从判断**（⛔ 最后一态不许被当成"不在"）。
 * 与上面几组不同，本组要真 DOM 元素（`contains`/影子树那两步），故用完清 body。
 */
describe("isPointerOnAnchor 指针归属（三态：true / false / undefined＝不判）", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  /** 小树：锚（带子元素）＋ 树外的一个元素（"指针底下已经换了别人"） */
  function tree(): { anchor: HTMLButtonElement; child: HTMLElement; outsider: HTMLElement } {
    const anchor = document.createElement("button");
    const child = document.createElement("span");
    anchor.appendChild(child);
    const outsider = document.createElement("div");
    document.body.append(anchor, outsider);
    return { anchor, child, outsider };
  }

  it("命中锚自身 ⇒ true", () => {
    const { anchor } = tree();
    expect(isPointerOnAnchor(anchor, { x: 10, y: 10 }, () => anchor)).toBe(true);
  });

  it("命中锚的**后代** ⇒ true（指针落在按钮里的小图标上也算还在按钮上）", () => {
    const { anchor, child } = tree();
    expect(isPointerOnAnchor(anchor, { x: 10, y: 10 }, () => child)).toBe(true);
  });

  it("命中树外元素 ⇒ **false**（滚动把内容挪走了——这就是该收条的现场）", () => {
    const { anchor, outsider } = tree();
    expect(isPointerOnAnchor(anchor, { x: 10, y: 10 }, () => outsider)).toBe(false);
  });

  it("影子树里的节点也算在锚上（`Element.contains` 不跨影子树 ⇒ 必须走 host 那一步）", () => {
    const { anchor } = tree();
    const host = document.createElement("div");
    const inner = document.createElement("i");
    anchor.appendChild(host);
    host.attachShadow({ mode: "open" }).appendChild(inner);
    expect(anchor.contains(inner)).toBe(false); // 前提：光 DOM 的 contains 确实看不见它
    expect(isPointerOnAnchor(anchor, { x: 10, y: 10 }, () => inner)).toBe(true);
  });

  it("**没记到坐标** ⇒ undefined，且**一次命中测试都不问**（省一次 elementFromPoint）", () => {
    const { anchor } = tree();
    const hitTest = vi.fn(() => anchor);
    expect(isPointerOnAnchor(anchor, null, hitTest)).toBeUndefined();
    expect(hitTest).not.toHaveBeenCalled();
  });

  it("命中测试返 null（点不在窗口内／环境没有 elementFromPoint）⇒ undefined（⛔ 不是 false ⇒ 不收条）", () => {
    const { anchor } = tree();
    expect(isPointerOnAnchor(anchor, { x: 10, y: 10 }, () => null)).toBeUndefined();
  });

  it("坐标原样透传给命中测试（不换算、不取整——视口坐标与 `getBoundingClientRect()` 同系）", () => {
    const { anchor } = tree();
    const hitTest = vi.fn(() => anchor);
    isPointerOnAnchor(anchor, { x: 123.5, y: -4 }, hitTest);
    expect(hitTest).toHaveBeenCalledWith(123.5, -4);
  });
});
