/**
 * gridLayout 推导——E5.8#37.5 纯函数测试。
 * 断言全部按「线号」（1-based grid 线）——grid-row/column 简写直接对号。
 */

import { describe, it, expect } from "vitest";
import { computePoolGrid, isPanelCoveringSlot } from "./gridLayout";
import type { PoolGridInput } from "./gridLayout";

function base(overrides: Partial<PoolGridInput> = {}): PoolGridInput {
  return {
    sidebarEdge: "left",
    panelVisible: false,
    panelEdge: "bottom",
    panelAlign: "center",
    ...overrides,
  };
}

/** 便捷断言——某 cell 的 grid 放置字符串 */
function areaOf(input: PoolGridInput, zone: keyof ReturnType<typeof computePoolGrid>["cells"]) {
  const { cells } = computePoolGrid(input);
  const c = cells[zone];
  if (!c) return null;
  return `${c.rowStart} / ${c.rowEnd} / ${c.colStart} / ${c.colEnd}`;
}

describe("isPanelCoveringSlot——覆盖推导单一来源（S10）", () => {
  it("center 不覆盖任何槽", () => {
    expect(isPanelCoveringSlot("center", "left")).toBe(false);
    expect(isPanelCoveringSlot("center", "right")).toBe(false);
  });
  it("left 覆盖左槽、不覆盖右槽", () => {
    expect(isPanelCoveringSlot("left", "left")).toBe(true);
    expect(isPanelCoveringSlot("left", "right")).toBe(false);
  });
  it("right 覆盖右槽、不覆盖左槽", () => {
    expect(isPanelCoveringSlot("right", "left")).toBe(false);
    expect(isPanelCoveringSlot("right", "right")).toBe(true);
  });
  it("justify 覆盖双槽", () => {
    expect(isPanelCoveringSlot("justify", "left")).toBe(true);
    expect(isPanelCoveringSlot("justify", "right")).toBe(true);
  });
});

describe("computePoolGrid——无面板", () => {
  it("单内容行 1fr；iconbar/侧栏/主区/右栏全高（跨 1 行）", () => {
    const spec = computePoolGrid(base());
    expect(spec.gridTemplateRows).toBe("1fr");
    expect(spec.gridTemplateColumns).toBe("auto auto 1fr auto");
    expect(spec.cells.iconbar).toEqual({ rowStart: 1, colStart: 1, rowEnd: 2, colEnd: 2 });
    expect(spec.cells.sidebar).toEqual({ rowStart: 1, colStart: 2, rowEnd: 2, colEnd: 3 });
    expect(spec.cells.main).toEqual({ rowStart: 1, colStart: 3, rowEnd: 2, colEnd: 4 });
    expect(spec.cells.rightSidebar).toEqual({ rowStart: 1, colStart: 4, rowEnd: 2, colEnd: 5 });
    expect(spec.cells.panel).toBeNull();
  });
});

describe("computePoolGrid——底面板（center 对齐）", () => {
  const input = base({ panelVisible: true, panelEdge: "bottom", panelAlign: "center" });

  it("行 = 内容 1fr + 面板 auto；面板跨主列（center）", () => {
    const spec = computePoolGrid(input);
    expect(spec.gridTemplateRows).toBe("1fr auto");
    expect(spec.cells.panel).toEqual({ rowStart: 2, colStart: 3, rowEnd: 3, colEnd: 4 }); // 行2 主列
  });
  it("center → 两侧栏全高（跨内容+面板行）", () => {
    expect(areaOf(input, "sidebar")).toBe("1 / 3 / 2 / 3"); // row 1/3（行1+2），列 2
    expect(areaOf(input, "rightSidebar")).toBe("1 / 3 / 4 / 5"); // row 1/3，列 4
  });
  it("main 恒只跨内容行", () => {
    expect(areaOf(input, "main")).toBe("1 / 2 / 3 / 4"); // row 1/2，列 3
  });
});

describe("computePoolGrid——底面板（left / right / justify 对齐）", () => {
  it("left → 左槽缩短（只内容行）、右槽全高", () => {
    const input = base({ panelVisible: true, panelEdge: "bottom", panelAlign: "left" });
    expect(areaOf(input, "sidebar")).toBe("1 / 2 / 2 / 3"); // 左槽只跨行1（内容行）
    expect(areaOf(input, "rightSidebar")).toBe("1 / 3 / 4 / 5"); // 右槽全高
    expect(areaOf(input, "panel")).toBe("2 / 3 / 2 / 4"); // 面板跨 左槽+主（列2-4，行2）
  });
  it("right → 右槽缩短、左槽全高", () => {
    const input = base({ panelVisible: true, panelEdge: "bottom", panelAlign: "right" });
    expect(areaOf(input, "sidebar")).toBe("1 / 3 / 2 / 3"); // 左槽全高
    expect(areaOf(input, "rightSidebar")).toBe("1 / 2 / 4 / 5"); // 右槽只跨行1
    expect(areaOf(input, "panel")).toBe("2 / 3 / 3 / 5"); // 面板跨 主+右槽（列3-5，行2）
  });
  it("justify → 双侧缩短 + 面板全槽", () => {
    const input = base({ panelVisible: true, panelEdge: "bottom", panelAlign: "justify" });
    expect(areaOf(input, "sidebar")).toBe("1 / 2 / 2 / 3");
    expect(areaOf(input, "rightSidebar")).toBe("1 / 2 / 4 / 5");
    expect(areaOf(input, "panel")).toBe("2 / 3 / 2 / 5"); // 跨 左槽+主+右槽（列2-5，行2）
  });
});

describe("computePoolGrid——顶面板", () => {
  it("行 = 面板 auto + 内容 1fr；面板在行1；center 两侧栏全高", () => {
    const input = base({ panelVisible: true, panelEdge: "top", panelAlign: "center" });
    const spec = computePoolGrid(input);
    expect(spec.gridTemplateRows).toBe("auto 1fr");
    expect(spec.cells.panel).toEqual({ rowStart: 1, colStart: 3, rowEnd: 2, colEnd: 4 });
    expect(areaOf(input, "sidebar")).toBe("1 / 3 / 2 / 3"); // 全高
    expect(areaOf(input, "main")).toBe("2 / 3 / 3 / 4"); // 内容行 2
  });
  it("面板 top 时 rightSidebar（对边槽）也全高（center 不覆盖任何槽）", () => {
    const input = base({ panelVisible: true, panelEdge: "top", panelAlign: "center" });
    expect(areaOf(input, "rightSidebar")).toBe("1 / 3 / 4 / 5");
  });
});

describe("computePoolGrid——竖条面板（5 带排布）", () => {
  it("面板左 → 列 [iconbar][left][panel][main][right]；竖条全高；侧栏恒全高", () => {
    const input = base({ panelVisible: true, panelEdge: "left", panelAlign: "center" });
    const spec = computePoolGrid(input);
    expect(spec.gridTemplateColumns).toBe("auto auto auto 1fr auto");
    expect(spec.cells.panel).toEqual({ rowStart: 1, colStart: 3, rowEnd: 2, colEnd: 4 }); // 全高单行
    expect(areaOf(input, "main")).toBe("1 / 2 / 4 / 5"); // 主列 4
    expect(areaOf(input, "sidebar")).toBe("1 / 2 / 2 / 3"); // 列 2 全高
  });
  it("面板右 → 列 [iconbar][left][main][panel][right]", () => {
    const input = base({ panelVisible: true, panelEdge: "right", panelAlign: "center" });
    const spec = computePoolGrid(input);
    expect(spec.gridTemplateColumns).toBe("auto auto 1fr auto auto");
    expect(spec.cells.panel).toEqual({ rowStart: 1, colStart: 4, rowEnd: 2, colEnd: 5 });
    expect(areaOf(input, "main")).toBe("1 / 2 / 3 / 4"); // 主列 3
    expect(areaOf(input, "rightSidebar")).toBe("1 / 2 / 5 / 6"); // 列 5 全高
  });
  it("竖条面板不触发覆盖推导（无横带行 → 侧栏恒全高）", () => {
    const input = base({ panelVisible: true, panelEdge: "right", panelAlign: "left" });
    expect(areaOf(input, "sidebar")).toBe("1 / 2 / 2 / 3"); // align=left 也不缩短（竖条全高语义）
  });
});

describe("computePoolGrid——侧栏换右（swap 规则 + iconbar 跟随 E5.8#37.6.5）", () => {
  it("sidebar.edge=right → sidebar 落右槽（列 3）、rightSidebar 落左槽（列 1）、iconbar 最右（列 4）", () => {
    const input = base({ sidebarEdge: "right", panelVisible: true, panelEdge: "bottom", panelAlign: "center" });
    const spec = computePoolGrid(input);
    expect(spec.gridTemplateColumns).toBe("auto 1fr auto auto"); // [左槽][main][右槽][iconbar]
    expect(spec.cells.sidebar).toEqual({ rowStart: 1, colStart: 3, rowEnd: 3, colEnd: 4 }); // 右槽全高
    expect(spec.cells.rightSidebar).toEqual({ rowStart: 1, colStart: 1, rowEnd: 3, colEnd: 2 }); // 左槽全高
    expect(spec.cells.iconbar).toEqual({ rowStart: 1, colStart: 4, rowEnd: 3, colEnd: 5 }); // 最右（比主侧栏更靠外）
  });
  it("sidebar.edge=left（缺省）→ iconbar 最左（列 1），列模板同 #37.5", () => {
    const spec = computePoolGrid(base());
    expect(spec.gridTemplateColumns).toBe("auto auto 1fr auto");
    expect(spec.cells.iconbar).toEqual({ rowStart: 1, colStart: 1, rowEnd: 2, colEnd: 2 });
  });
  it("sidebar.edge=right + 面板左竖条 → [左槽][面板][main][右槽][iconbar]，iconbar 最右", () => {
    const input = base({ sidebarEdge: "right", panelVisible: true, panelEdge: "left", panelAlign: "center" });
    const spec = computePoolGrid(input);
    expect(spec.gridTemplateColumns).toBe("auto auto 1fr auto auto");
    expect(spec.cells.iconbar).toEqual({ rowStart: 1, colStart: 5, rowEnd: 2, colEnd: 6 });
    expect(spec.cells.sidebar).toEqual({ rowStart: 1, colStart: 4, rowEnd: 2, colEnd: 5 }); // 右槽
    expect(spec.cells.panel).toEqual({ rowStart: 1, colStart: 2, rowEnd: 2, colEnd: 3 }); // 面板左竖条
  });
});

describe("computePoolGrid——无主区内容（E5.8#46.17 drift 面板专用窗）", () => {
  it("hasMain=false → 无内容行，面板独占整窗（底面板单 auto 行）", () => {
    const input = base({ panelVisible: true, panelEdge: "bottom", panelAlign: "center", hasMain: false });
    const spec = computePoolGrid(input);
    expect(spec.gridTemplateRows).toBe("auto"); // 无 1fr 内容行——面板独占，无主区空白
    expect(areaOf(input, "main")).toBe("1 / 1 / 3 / 4"); // main 0 行高（rowStart=rowEnd=1）
    expect(spec.cells.panel).toEqual({ rowStart: 1, colStart: 3, rowEnd: 2, colEnd: 4 }); // 面板占第 1 行（主列）
  });
  it("hasMain 缺省（main/detached）→ 内容行照常 1fr", () => {
    const input = base();
    expect(computePoolGrid(input).gridTemplateRows).toBe("1fr");
    expect(areaOf(input, "main")).toBe("1 / 2 / 3 / 4");
  });
  it("hasMain=false + 竖条面板 → 兜底 1 行承载全高竖条（防空 rows→空模板）", () => {
    const input = base({ panelVisible: true, panelEdge: "left", panelAlign: "center", hasMain: false });
    const spec = computePoolGrid(input);
    expect(spec.gridTemplateRows).toBe("1fr"); // 兜底行
    expect(spec.cells.panel).toEqual({ rowStart: 1, colStart: 3, rowEnd: 2, colEnd: 4 }); // 竖条全高
    expect(areaOf(input, "main")).toBe("1 / 1 / 4 / 5"); // main 0 行高
  });
});
