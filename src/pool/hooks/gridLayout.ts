/**
 * 池布局 grid 推导——E5.8#37.5。覆盖推导单一来源（S10）纯函数。
 *
 * 目录落位（壳目录规范）：pool/ 根目录只放 pool-main.tsx + PoolZoneShell.tsx（第三样不许进）。
 * gridLayout 是池级布局几何推导（根组件消费）+ useResizeDrag（同族交互支撑）→ 按 hooks/ 先例
 * （tabDragTypes.ts——拖拽纯类型/常量）落 hooks/。
 *
 * 决策 2/3（布局树数据化 01-布局树数据化设计.md）：壳推「树结构」不推「绝对坐标」——
 * 面板对齐的几何（列跨度/行位置/侧栏行跨度）由池从 DTO 尺寸推导 grid-template + grid-area，
 * 引擎只存配置。本模块 = 池侧唯一推导点（防两处字面量，S10）。
 *
 * 结构（决策 3）：
 *   pool-body 改 CSS grid。列 = [iconbar][left][main][right]（宽度全 auto——iconbar/侧栏/面板
 *   尺寸由 zone 组件自身根尺寸决定，内容驱动零硬编码。#37.6.5：iconbar 恒贴主侧栏同侧外缘——
 *   sidebar 在左 → [iconbar][left][main][right]；sidebar 在右 → [left][main][right][iconbar]）。
 *   面板竖条（edge∈{left,right}）插入 main 与对应侧栏之间成 5 带。顶/底面板占独立行
 *   （auto 高，PanelZone 根高度决定）。
 *
 * 行跨度（覆盖推导）：
 *   面板横带（顶/底）行存在时，侧栏默认只跨「内容行」（面板行处为空 = 侧栏缩短）。
 *   当 align 不延伸到某槽（center 不覆盖任何槽 / left 不覆盖右槽 / right 不覆盖左槽）时，
 *   该槽跨全部行（全高）。main 恒只跨内容行。iconbar 恒跨全部行。
 *
 * 纯 CSS 几何 → 换边/换位/对齐切换零 React 重挂（S1 换位丢视图状态消灭）；
 * 隐藏面板 = 调用方不渲染 PanelZone + 本推导输出 panel cell null + 模板去面板行/列。
 */

/** 面板 dock 边——池侧消费（PanelLayout.edge 归一化后） */
type GridPanelEdge = "bottom" | "top" | "left" | "right";

/** 面板横向对齐——池侧消费（PanelLayout.align 归一化后） */
export type GridPanelAlign = "left" | "center" | "right" | "justify";

export interface PoolGridInput {
  /** 主侧栏所在边——swap 规则保证 sidebar ↔ rightSidebar 恒占对边 */
  sidebarEdge: "left" | "right";
  /** 面板可见 + 有 edge/align——隐藏时不推导面板行/列 */
  panelVisible: boolean;
  panelEdge: GridPanelEdge;
  panelAlign: GridPanelAlign;
}

/** 单 zone 的 grid 放置——grid-row: rowStart/rowEnd + grid-column: colStart/colEnd（1-based 线号） */
interface GridCellArea {
  rowStart: number;
  colStart: number;
  rowEnd: number;
  colEnd: number;
}

export interface PoolGridSpec {
  gridTemplateColumns: string;
  gridTemplateRows: string;
  cells: {
    iconbar: GridCellArea;
    sidebar: GridCellArea;
    /** 面板隐藏 → null（调用方不渲染 PanelZone + 模板无面板行/列） */
    panel: GridCellArea | null;
    main: GridCellArea;
    rightSidebar: GridCellArea;
  };
}

/**
 * 覆盖推导单一来源（S10）——面板横带 align 是否延伸到某槽位（顶/底面板行上该槽被面板占据 →
 * 该槽缩短不跨面板行）。center 不覆盖任何槽（两侧栏全高）；left/justify 覆盖左槽；right/justify 覆盖右槽。
 * 竖条面板（edge∈{left,right}）全高，不触发覆盖推导（调用方不为竖条建横带行）。
 */
export function isPanelCoveringSlot(align: GridPanelAlign, slot: "left" | "right"): boolean {
  if (slot === "left") return align === "left" || align === "justify";
  return align === "right" || align === "justify";
}

/** 池 grid 唯一推导点——调用方（PoolZoneShell）把 DTO 尺寸归一化后传入 */
export function computePoolGrid(input: PoolGridInput): PoolGridSpec {
  const panel = input.panelVisible
    ? { edge: input.panelEdge, align: input.panelAlign }
    : null;
  const panelVertical = panel !== null && (panel.edge === "left" || panel.edge === "right");
  const hasTop = panel?.edge === "top";
  const hasBottom = panel?.edge === "bottom";

  // ── 列模板：宽度全 auto（内容驱动——iconbar 42px/侧栏宽/面板宽由 zone 组件根尺寸决定，
  //   零硬编码 + 隐藏 zone 内容空 → auto 列自然 0 宽） + main 1fr 吸剩余 ──
  // E5.8#37.6.5：iconbar 恒贴主侧栏同侧外缘——sidebar 在左 → 最左列；sidebar 在右 → 最右列
  // （[左槽][主][右槽][iconbar]）。列位由 sidebarEdge 反推（不单独存 iconbar.edge——用户拍板先落基本行为）。
  const cols: string[] = [];
  const iconbarAtLeft = input.sidebarEdge === "left";
  if (iconbarAtLeft) cols.push("auto"); // iconbar 列（最左）
  const leftCol = cols.length + 1;
  cols.push("auto"); // left 槽（sidebar 或 rightSidebar 按 sidebarEdge 归属）
  const panelLeftCol = cols.length + 1;
  if (panel?.edge === "left") cols.push("auto"); // 面板竖条（左）——主区与左侧栏之间
  const mainCol = cols.length + 1;
  cols.push("1fr"); // main
  const panelRightCol = mainCol + 1;
  if (panel?.edge === "right") cols.push("auto"); // 面板竖条（右）——主区与右侧栏之间
  const rightCol = cols.length + 1;
  cols.push("auto"); // right 槽
  const iconbarCol = iconbarAtLeft ? 1 : cols.length + 1;
  if (!iconbarAtLeft) cols.push("auto"); // iconbar 列（最右——比主侧栏更靠外）

  // ── 行模板：内容行 1fr + 顶/底面板行 auto（高由 PanelZone 根决定） ──
  const rows: string[] = [];
  if (hasTop) rows.push("auto"); // 行 1 = 顶面板行
  rows.push("1fr"); // 内容行（hasTop ? 2 : 1）
  if (hasBottom) rows.push("auto"); // 末行 = 底面板行
  const totalRows = rows.length;

  // ── 行跨度推导 ──
  const contentRowStart = hasTop ? 2 : 1;
  const contentRowEnd = totalRows + 1 - (hasBottom ? 1 : 0); // 内容行最后一行 + 1（线号）
  const align = panel?.align ?? "center";
  // 槽位归属：sidebar 落槽 = sidebarEdge；rightSidebar 恒占对边（swap 规则）——按「各自所在槽」判覆盖
  const sidebarSlot = input.sidebarEdge;
  const rightSidebarSlot = sidebarSlot === "left" ? "right" : "left";

  /** 侧栏/右栏行跨度——默认内容行；未被面板覆盖的槽 → 跨全部行（全高） */
  const rowSpanFor = (covered: boolean): [number, number] => {
    if (!covered) return [1, totalRows + 1];
    return [contentRowStart, contentRowEnd];
  };

  const [sidebarRowStart, sidebarRowEnd] = rowSpanFor(isPanelCoveringSlot(align, sidebarSlot));
  const [rightRowStart, rightRowEnd] = rowSpanFor(isPanelCoveringSlot(align, rightSidebarSlot));

  // ── 面板自身 cell ──
  let panelCell: GridCellArea | null = null;
  if (panel) {
    if (panelVertical) {
      // 竖条——全高竖列（5 带排布）
      const col = panel.edge === "left" ? panelLeftCol : panelRightCol;
      panelCell = { rowStart: 1, colStart: col, rowEnd: totalRows + 1, colEnd: col + 1 };
    } else {
      // 横带——独立行 + 列跨度按 align
      const row = panel.edge === "top" ? 1 : totalRows;
      let colStart: number;
      let colEnd: number;
      if (align === "center") {
        colStart = mainCol; colEnd = mainCol + 1;
      } else if (align === "left") {
        colStart = leftCol; colEnd = mainCol + 1;   // 跨左槽+主（列 2..3 → 线 2/4）
      } else if (align === "right") {
        colStart = mainCol; colEnd = rightCol + 1;  // 跨主+右槽（列 3..4 → 线 3/5）
      } else {
        colStart = leftCol; colEnd = rightCol + 1;  // justify——跨左槽+主+右槽（列 2..4 → 线 2/5）
      }
      panelCell = { rowStart: row, colStart, rowEnd: row + 1, colEnd };
    }
  }

  const sidebarCol = sidebarSlot === "left" ? leftCol : rightCol;
  const rightSidebarCol = rightSidebarSlot === "left" ? leftCol : rightCol;

  return {
    gridTemplateColumns: cols.join(" "),
    gridTemplateRows: rows.join(" "),
    cells: {
      // E5.8#37.6.5：iconbar 列位随 sidebar.edge（最左/最右）——恒全高（行跨全）
      iconbar: { rowStart: 1, colStart: iconbarCol, rowEnd: totalRows + 1, colEnd: iconbarCol + 1 },
      sidebar: { rowStart: sidebarRowStart, colStart: sidebarCol, rowEnd: sidebarRowEnd, colEnd: sidebarCol + 1 },
      panel: panelCell,
      main: { rowStart: contentRowStart, colStart: mainCol, rowEnd: contentRowEnd, colEnd: mainCol + 1 },
      rightSidebar: { rowStart: rightRowStart, colStart: rightSidebarCol, rowEnd: rightRowEnd, colEnd: rightSidebarCol + 1 },
    },
  };
}
