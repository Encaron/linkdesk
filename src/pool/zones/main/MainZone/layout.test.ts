/**
 * computeLayout 几何回归测试——**主区标签栏-聚焦环与分屏圆角**（T3 · D5-甲 · 2026-10-07）。
 *
 * 为什么单独立这份测试：D5-甲 动的是**全部分屏共用的几何真源**（拖拽比例、双击复位、嵌套、
 * 标签拖拽命中测试都读 panels[].x/w），而它的判据（04 §三「50/50 ⇒ 两栏各 49.8%、第二栏右缘
 * 100.0%」）此前只能靠实机目测。这份把读数变成 `npm run check` 里的一条断言。
 *
 * 三条禁区（改这里之前先读 01 §5.5）：⛔ 不改 HANDLE_PCT 的**值**（0.4%）／⛔ 不动递归与
 * HandleRect 形状／⛔ 不动 sizes 语义（仍记**用户拖拽比例**，不是扣缝后的值）。
 */

import { describe, it, expect } from "vitest";
import type { SplitNode } from "../../../../core/utils/splitTree";
import { computeLayout, buildBranchMaps } from "./layout";

/** 缝宽（百分比）——与 layout.ts 的 HANDLE_PCT 同值；断言写死它才叫「值没动」 */
const HANDLE_PCT = 0.4;

const leaf = (groupId: string): SplitNode => ({ type: "leaf", groupId });

function layoutOf(root: SplitNode, sizes?: Map<number, [number, number]>) {
  const { branchIndices } = buildBranchMaps(root);
  return computeLayout(root, 0, 0, 100, 100, branchIndices, sizes ?? new Map());
}

describe("computeLayout — 缝的几何归属（S5 · D5-甲）", () => {
  it("单面板（叶子）零影响：整块 0,0,100,100、零把手——不进扣缝分支", () => {
    const { panels, handles } = layoutOf(leaf("g1"));
    expect(handles).toEqual([]);
    expect(panels).toEqual([{ groupId: "g1", x: 0, y: 0, w: 100, h: 100 }]);
  });

  it("横分 50/50：两栏各 49.8、第二栏右缘恰 100.0（⛔ 不是 100.4）", () => {
    const { panels, handles } = layoutOf({
      type: "branch",
      direction: "horizontal",
      sizes: [50, 50],
      children: [leaf("a"), leaf("b")],
    });
    expect(panels[0].w).toBeCloseTo(49.8, 6);
    expect(panels[0].x).toBe(0);
    // 第二栏落位算式未动：x + w0 + HANDLE_PCT
    expect(panels[1].x).toBeCloseTo(49.8 + HANDLE_PCT, 6);
    expect(panels[1].w).toBeCloseTo(49.8, 6);
    expect(panels[1].x + panels[1].w).toBeCloseTo(100, 6);
    // 两栏仍**等宽**（乙案只缩第二栏 ⇒ 50 ／ 49.6 才是错的）
    expect(panels[0].w).toBeCloseTo(panels[1].w, 6);
    // 缝的位置与宽度**一个字不变**：把手仍居中填满 HANDLE_PCT
    expect(handles[0].x).toBeCloseTo(49.8, 6);
    expect(handles[0].w).toBe(HANDLE_PCT);
    expect(panels[0].w + handles[0].w + panels[1].w).toBeCloseTo(100, 6);
  });

  it("竖分 50/50 同构：两栏各 49.8 高、下栏下缘恰 100.0", () => {
    const { panels, handles } = layoutOf({
      type: "branch",
      direction: "vertical",
      sizes: [50, 50],
      children: [leaf("a"), leaf("b")],
    });
    expect(panels[1].y).toBeCloseTo(49.8 + HANDLE_PCT, 6);
    expect(panels[1].h).toBeCloseTo(49.8, 6);
    expect(panels[1].y + panels[1].h).toBeCloseTo(100, 6);
    expect(handles[0].h).toBe(HANDLE_PCT);
  });

  it("非等分（20/80）：外缘仍 100.0、缝宽仍 0.4", () => {
    const { panels, handles } = layoutOf({
      type: "branch",
      direction: "horizontal",
      sizes: [20, 80],
      children: [leaf("a"), leaf("b")],
    });
    expect(panels[0].w).toBeCloseTo(19.92, 6);
    expect(panels[1].w).toBeCloseTo(79.68, 6);
    expect(panels[1].x + panels[1].w).toBeCloseTo(100, 6);
    expect(handles[0].w).toBe(HANDLE_PCT);
  });

  it("嵌套（先左右、右栏再上下）：四栏四边全在容器内", () => {
    const { panels } = layoutOf({
      type: "branch",
      direction: "horizontal",
      sizes: [50, 50],
      children: [
        leaf("a"),
        {
          type: "branch",
          direction: "vertical",
          sizes: [50, 50],
          children: [leaf("b"), leaf("c")],
        },
      ],
    });
    expect(panels).toHaveLength(3);
    for (const p of panels) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(100 + 1e-6);
      expect(p.y + p.h).toBeLessThanOrEqual(100 + 1e-6);
    }
    // 右栏两格：x 相同、下格下缘贴底
    expect(panels[1].x).toBeCloseTo(panels[2].x, 6);
    expect(panels[2].y + panels[2].h).toBeCloseTo(100, 6);
  });

  it("sizes 语义不变：HandleRect.sizes 仍记用户拖拽比例（⛔ 不是扣缝后的像素）", () => {
    const { handles } = layoutOf({
      type: "branch",
      direction: "horizontal",
      sizes: [30, 70],
      children: [leaf("a"), leaf("b")],
    });
    expect(handles[0].sizes).toEqual([30, 70]);
  });

  it("拖拽覆盖（localSizes）仍按比例生效，且外缘不越界", () => {
    const root: SplitNode = {
      type: "branch",
      direction: "horizontal",
      sizes: [50, 50],
      children: [leaf("a"), leaf("b")],
    };
    const { branchIndices } = buildBranchMaps(root);
    const { panels } = computeLayout(root, 0, 0, 100, 100, branchIndices, new Map([[1, [70, 30]]]));
    expect(panels[0].w).toBeCloseTo(99.6 * 0.7, 6);
    expect(panels[1].x + panels[1].w).toBeCloseTo(100, 6);
  });
});
