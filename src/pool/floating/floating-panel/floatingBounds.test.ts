/**
 * floatingBounds 单测——M2 `AI#20`：I8-5/I8-7 隐藏边界的**单一真相源**。
 *
 * 为什么单拎：`AI#20` 给面板补了 API 路径（`panel.setFloatingBounds`）。若 API 另写一套钳制，
 * 面板就能被设成「拖不出来」的状态（新的不一致）。本文件逐条锁住三条路径共用同一组边界：
 *   · 拖拽 `clampDragTo`（只动 top/left + 6px 壳内钳制）
 *   · 调高 `clampResizeTo`（只动 height + MIN_HEIGHT/RESIZE_MAX_OFFSET）
 *   · API  `clampApi`（按字段精确设定 + **同一套**边界——`AI#20` 验收明写的「顺带断言」）
 * 纯函数零 DOM ⇒ 直接吃视口夹具，边界可逐条对账。
 */

import { describe, it, expect } from "vitest";
import {
  clamp,
  clampApi,
  clampDragTo,
  clampResizeTo,
  boundsOfRect,
  finiteOrNull,
  CLAMP_INSET,
  MIN_HEIGHT,
  RESIZE_MAX_OFFSET,
} from "./floatingBounds";

/** 视口夹具——1000×800（上限 = 800-80 = 720；宽上限 = 1000-12 = 988） */
const VP = { width: 1000, height: 800 };
const ORIGIN = { top: 100, left: 200, width: 640, height: 400 };

describe("常量", () => {
  it("I8-5/I8-7 三个隐藏边界的值锁死", () => {
    expect(CLAMP_INSET).toBe(6);
    expect(MIN_HEIGHT).toBe(300);
    expect(RESIZE_MAX_OFFSET).toBe(80);
  });
});

describe("clampDragTo（I8-5 拖拽——只动 top/left）", () => {
  it("delta 平移 + 宽高保持起始快照", () => {
    expect(clampDragTo(ORIGIN, 50, -20, VP)).toEqual({ top: 80, left: 250, width: 640, height: 400 });
  });

  it("拖出左上越界 → 钳到 6px inset", () => {
    expect(clampDragTo(ORIGIN, -9999, -9999, VP)).toEqual({ top: 6, left: 6, width: 640, height: 400 });
  });

  it("拖出右下越界 → 钳到「视口 - 尺寸 - 6px」", () => {
    expect(clampDragTo(ORIGIN, 9999, 9999, VP)).toEqual({
      top: 800 - 400 - 6,
      left: 1000 - 640 - 6,
      width: 640,
      height: 400,
    });
  });
});

describe("clampResizeTo（I8-7 调高——只动 height，top 固定）", () => {
  it("向下拖增高——top/left/width 不动", () => {
    expect(clampResizeTo(ORIGIN, 120, VP)).toEqual({ top: 100, left: 200, width: 640, height: 520 });
  });

  it("向上拖超过最小高 → 钳到 MIN_HEIGHT", () => {
    expect(clampResizeTo(ORIGIN, -9999, VP).height).toBe(MIN_HEIGHT);
  });

  it("向下拖超过窗口高 - 80 → 钳到上限", () => {
    expect(clampResizeTo(ORIGIN, 9999, VP).height).toBe(800 - RESIZE_MAX_OFFSET);
  });
});

describe("clampApi（AI#20 API 路径——按字段精确设定）", () => {
  /* ── ① 精确设定：给了什么就是什么（不越界时零改动） ── */

  it("四字段全给且合规 → 原样生效", () => {
    expect(clampApi(ORIGIN, { top: 10, left: 20, width: 500, height: 600 }, VP)).toEqual({
      top: 10,
      left: 20,
      width: 500,
      height: 600,
    });
  });

  it("只给位置 → 宽高保持现值（只挪位置，不改大小）", () => {
    expect(clampApi(ORIGIN, { top: 300, left: 50 }, VP)).toEqual({
      top: 300,
      left: 50,
      width: 640,
      height: 400,
    });
  });

  it("只给高度 → 其余保持现值", () => {
    expect(clampApi(ORIGIN, { height: 500 }, VP)).toEqual({ top: 100, left: 200, width: 640, height: 500 });
  });

  /* ── ② 隐藏边界在 API 路径同样生效（AI#20 验收明写的「顺带断言」） ── */

  it("height 低于 MIN_HEIGHT → 钳到 300（API 绕不过 I8-7 下限）", () => {
    expect(clampApi(ORIGIN, { height: 1 }, VP).height).toBe(MIN_HEIGHT);
    expect(clampApi(ORIGIN, { height: -500 }, VP).height).toBe(MIN_HEIGHT);
  });

  it("height 高于「窗口高 - 80」→ 钳到上限（API 绕不过 I8-7 上限）", () => {
    expect(clampApi(ORIGIN, { height: 9999 }, VP).height).toBe(800 - RESIZE_MAX_OFFSET);
  });

  it("top/left 被钳进 6px 壳内边界（API 绕不过 I8-5 钳制）", () => {
    const low = clampApi(ORIGIN, { top: -100, left: -100 }, VP);
    expect(low.top).toBe(CLAMP_INSET);
    expect(low.left).toBe(CLAMP_INSET);

    const high = clampApi(ORIGIN, { top: 9999, left: 9999 }, VP);
    expect(high.top).toBe(800 - 400 - CLAMP_INSET);
    expect(high.left).toBe(1000 - 640 - CLAMP_INSET);
  });

  it("width 只有上限（窗口宽 - 12）——无下限常量，≤0/非有限按「未指定」处理", () => {
    expect(clampApi(ORIGIN, { width: 9999 }, VP).width).toBe(1000 - CLAMP_INSET * 2); // 上限钳制
    expect(clampApi(ORIGIN, { width: 0 }, VP).width).toBe(640); // ≤0 → 保持现值（不是钳到 0/下界）
    expect(clampApi(ORIGIN, { width: -5 }, VP).width).toBe(640);
    expect(clampApi(ORIGIN, { width: Number.NaN }, VP).width).toBe(640);
    expect(clampApi(ORIGIN, { width: Number.POSITIVE_INFINITY }, VP).width).toBe(640); // 非有限 → 未指定
  });

  it("坏值（NaN / Infinity / 字符串）一律当「未指定」——⛔ 不把脏值写进几何", () => {
    const r = clampApi(ORIGIN, { top: Number.NaN, height: Number.POSITIVE_INFINITY } as never, VP);
    expect(r.top).toBe(100); // NaN → 未指定 → 现值（⛔ 不是 NaN 也不是 0）
    expect(r.height).toBe(400); // Infinity → 未指定 → 现值 400（再钳边界仍在 [300, 720] 内）
    expect(Number.isFinite(r.top)).toBe(true);
    expect(Number.isFinite(r.height)).toBe(true);
  });

  it("窗口极小时高度上界不反转（max 兜底 → 至少 MIN_HEIGHT）", () => {
    // 视口高 200 → 自然上界 200-80=120 < MIN_HEIGHT=300 ⇒ 用 MIN_HEIGHT 兜底（与原 clamp 同结果）
    expect(clampApi(ORIGIN, { height: 9999 }, { width: 400, height: 200 }).height).toBe(MIN_HEIGHT);
  });

  it("部分字段 + 钳制组合——只钳被给的字段，未给字段不被牵连", () => {
    const r = clampApi(ORIGIN, { height: 1 }, VP); // 只给 height（越界）
    expect(r.height).toBe(MIN_HEIGHT);
    expect(r.top).toBe(100); // 未给 → 现值
    expect(r.left).toBe(200);
    expect(r.width).toBe(640);
  });
});

describe("基元", () => {
  it("clamp 双向夹紧", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("finiteOrNull 只认有限数", () => {
    expect(finiteOrNull(3)).toBe(3);
    expect(finiteOrNull(0)).toBe(0);
    expect(finiteOrNull(Number.NaN)).toBeNull();
    expect(finiteOrNull(Number.POSITIVE_INFINITY)).toBeNull();
    expect(finiteOrNull("3")).toBeNull();
    expect(finiteOrNull(undefined)).toBeNull();
    expect(finiteOrNull(null)).toBeNull();
  });

  it("boundsOfRect 取四边（手势起始快照用）", () => {
    expect(boundsOfRect({ top: 1, left: 2, width: 3, height: 4 })).toEqual({ top: 1, left: 2, width: 3, height: 4 });
  });
});
