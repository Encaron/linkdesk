/**
 * tabDragTypes 纯函数测试——detectDropZone + computeTabInsertIndex（E5.8#46.10 归一化）。
 * computeTabInsertIndex 是本地拖拽排序（useTabDrag）与跨窗吸附竖线（onAdsorbHint）共用算法，
 * 测试夹具纯虚构 DOM（demo tab 无真实插件，硬约束 21）。
 */
import { describe, it, expect } from "vitest";
import { detectDropZone, computeTabInsertIndex } from "./tabDragTypes";

/* ── detectDropZone（VS Code SPLIT_THRESHOLD=0.25）── */

function rect(w: number, h: number): DOMRect {
  return { left: 0, top: 0, right: w, bottom: h, width: w, height: h, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
}

describe("detectDropZone", () => {
  it("左右优先于上下（照抄 VS Code）", () => {
    expect(detectDropZone(10, 10, rect(100, 100))).toBe("left");
    expect(detectDropZone(90, 10, rect(100, 100))).toBe("right");
    expect(detectDropZone(50, 10, rect(100, 100))).toBe("up");
    expect(detectDropZone(50, 90, rect(100, 100))).toBe("down");
    expect(detectDropZone(50, 50, rect(100, 100))).toBe("center");
  });

  it("越界 → null", () => {
    expect(detectDropZone(-1, 50, rect(100, 100))).toBeNull();
    expect(detectDropZone(101, 50, rect(100, 100))).toBeNull();
  });
});

/* ── computeTabInsertIndex（E5.8#46.10：光标 X → 插入缝隙 0..tabs.length）── */

/** 造标签栏 DOM：bar 视口 left=100，tab 宽度数组，scrollLeft 可注入。
 *  🔴 真实滚动语义：scrollLeft 使 tab 视觉位置左移（rect.left = 内容位置 − scrollLeft）——
 *  补偿算法把视觉坐标 + scrollLeft 映射回内容坐标。fixture 必须同构，否则补偿无从验证。 */
function makeTabBar(tabWidths: number[], scrollLeft = 0): HTMLElement {
  const total = tabWidths.reduce((a, b) => a + b, 0);
  const bar = document.createElement("div");
  bar.className = "group-tab-bar";
  bar.getBoundingClientRect = () => ({ left: 100, top: 0, right: 100 + total, bottom: 35, width: total, height: 35 }) as DOMRect;
  Object.defineProperty(bar, "scrollLeft", { value: scrollLeft, writable: true, configurable: true });
  let left = 0;
  for (const w of tabWidths) {
    const tab = document.createElement("div");
    tab.className = "group-tab-item";
    // 每 tab 捕获自己的内容偏移（闭包不捕获循环变量 left 的最终值）
    const offset = left;
    tab.getBoundingClientRect = () => ({ left: 100 + offset - scrollLeft, top: 0, right: 100 + offset - scrollLeft + w, bottom: 35, width: w, height: 35 }) as DOMRect;
    left += w;
    bar.appendChild(tab);
  }
  return bar;
}

describe("computeTabInsertIndex", () => {
  const bar = makeTabBar([100, 100, 100]);

  it("tab 中点二分——缝隙 0..tabs.length", () => {
    expect(computeTabInsertIndex(bar, 100)).toBe(0);   // 起始
    expect(computeTabInsertIndex(bar, 149)).toBe(0);   // 首 tab 中点左
    expect(computeTabInsertIndex(bar, 151)).toBe(1);   // 首 tab 中点右
    expect(computeTabInsertIndex(bar, 249)).toBe(1);   // 二 tab 中点左
    expect(computeTabInsertIndex(bar, 251)).toBe(2);   // 二 tab 中点右
    expect(computeTabInsertIndex(bar, 351)).toBe(3);   // 三 tab 中点右 → 末尾缝
  });

  it("越界钳制——bar 左外 → 0，右外 → tabs.length", () => {
    expect(computeTabInsertIndex(bar, 50)).toBe(0);
    expect(computeTabInsertIndex(bar, 500)).toBe(3);
  });

  it("scrollLeft 补偿——溢出折叠的 tab 仍按内容坐标命中", () => {
    const scrolled = makeTabBar([100, 100, 100], 100);
    // 内容坐标：scrollLeft=100 后首 tab 视觉 left=0（滚出视口左缘）。
    // bar 左缘 clientX=100 → 内容坐标 = 100-100+100 = 100 > 首 tab 内容宽 → 落缝 1（首 tab 之后）
    expect(computeTabInsertIndex(scrolled, 100)).toBe(1);
    expect(computeTabInsertIndex(scrolled, 200)).toBe(2);
  });
});
