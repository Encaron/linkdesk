/**
 * LayoutEngine.test.ts —— E5#27b 壳布局引擎测试。
 *
 * 📌 锁定到 E5#9：LayoutEngine.ts 实现完后立刻写，写完后才接入 App.tsx。
 *
 * 覆盖：
 *   1. 默认布局——5 个 zone 坐标正确（E5.7#63.7 加 panel 底部 zone）
 *   2. getZone——单个 zone 配置（钳制界来源）
 *   3. resizeZone——clamp min/max
 *   3b. resizeZoneHeight——panel 高度 clamp min/max + 多 bottom zone 堆叠不错位
 *   4. 像素对齐——所有坐标 Math.round()
 *   5. onDidChangeLayout——resizeZone 时触发
 *   6. 容器尺寸为 0 / 负值 → 不计算
 *   7. center width 为负时 clamp 到 0——不产生 NaN
 *   8. getBounds 对不存在 zone 返回 undefined
 *
 * E5.7#31.5（2026-08-15）测试瘦身：setLayout/addZone/removeZone/dockTo/getAllZones/
 * floating 分支的测试段随死 API 一并删除；NaN 防护测试改用 setZoneWidth（无钳制直设）
 * 构造超宽侧栏——测试语义保留（center clamp 不产生 NaN）。
 *
 * E5.8#36.7（2026-08-21）复活：5 方法测试段从 E5 原版（c010bf1e^）取回，适配当前
 * 5 zone ZoneConfig（无 mode/float 字段）——getAllZones / setLayout / addZone /
 * removeZone / dockTo（侧栏换右）/ onDidChangeLayout(setLayout 触发)。另加新测试：
 * top 堆叠 / setAlign / dockTo swap 规则 / 负 contentHeight 钳制。
 */

import { describe, it, expect, vi } from "vitest";

/* ── LayoutEngine 直接构造——不依赖单例状态 ── */
import { LayoutEngine } from "./LayoutEngine";

/** 辅助：设置 800×600 容器 */
function with800x600(engine: LayoutEngine): void {
  engine.setContainerSize(800, 600);
}

describe("LayoutEngine", () => {
  /* ── 1. 默认布局 ── */

  it("默认布局——5 个 zone 坐标正确", () => {
    const engine = new LayoutEngine();
    with800x600(engine);

    const iconbar = engine.getBounds("iconbar");
    const sidebar = engine.getBounds("sidebar");
    const main = engine.getBounds("main");
    const panel = engine.getBounds("panel");
    const statusbar = engine.getBounds("statusbar");

    // E5.7#63.7：panel 底部 zone 220px + statusbar 24px → contentHeight = 600 - 244 = 356
    // iconbar: 左 42px，内容区全高
    expect(iconbar).toEqual({ x: 0, y: 0, width: 42, height: 356 });
    // sidebar: iconbar 右边，280px 宽
    expect(sidebar).toEqual({ x: 42, y: 0, width: 280, height: 356 });
    // main: 填满剩余（800 - 42 - 280 = 478）
    expect(main).toEqual({ x: 322, y: 0, width: 478, height: 356 });
    // panel: 内容区之下全宽 220px（order 1，statusbar 之上）
    expect(panel).toEqual({ x: 0, y: 356, width: 800, height: 220 });
    // statusbar: 最底全宽 24px（order 0，贴窗口底边）
    expect(statusbar).toEqual({ x: 0, y: 576, width: 800, height: 24 });
  });

  it("getZone 返回单个 zone 配置", () => {
    const engine = new LayoutEngine();
    const sidebar = engine.getZone("sidebar");
    expect(sidebar?.zone).toBe("sidebar");
    expect(sidebar?.dock?.width).toBe(280);
  });

  it("getBounds 对不存在 zone 返回 undefined", () => {
    const engine = new LayoutEngine();
    with800x600(engine);
    expect(engine.getBounds("nonexistent")).toBeUndefined();
  });

  /* ── 2b. E5.8#36.7 复活 API（E5 原版 c010bf1e^ 测试段——适配当前 5 zone ZoneConfig）── */

  it("getAllZones 返回只读数组——5 个默认 zone", () => {
    const engine = new LayoutEngine();
    expect(engine.getAllZones()).toHaveLength(5);
    expect(engine.getAllZones().map((z) => z.zone)).toEqual([
      "iconbar",
      "sidebar",
      "main",
      "panel",
      "statusbar",
    ]);
  });

  it("setLayout——替换全量配置后坐标正确", () => {
    const engine = new LayoutEngine();
    engine.setLayout([
      { zone: "left", dock: { edge: "left", width: 200 } },
      { zone: "center", dock: { edge: "center", flex: 1 } },
      { zone: "right", dock: { edge: "right", width: 150 } },
    ]);
    with800x600(engine);

    expect(engine.getBounds("left")).toEqual({ x: 0, y: 0, width: 200, height: 600 });
    expect(engine.getBounds("center")).toEqual({ x: 200, y: 0, width: 450, height: 600 });
    expect(engine.getBounds("right")).toEqual({ x: 650, y: 0, width: 150, height: 600 });
  });

  it("addZone——新 zone 出现在 bounds 中（底部堆叠逐层上移）", () => {
    const engine = new LayoutEngine();
    with800x600(engine);

    engine.addZone({ zone: "bottom-panel", dock: { edge: "bottom", height: 100 } });

    expect(engine.getAllZones()).toHaveLength(6);
    // bottomZones（order 升序，stable）=[statusbar(0), bottom-panel(0), panel(1)]
    // bottomHeight = 24 + 100 + 220 = 344 → contentHeight = 256；从底向上堆叠
    expect(engine.getBounds("bottom-panel")).toEqual({ x: 0, y: 476, width: 800, height: 100 });
    // 原 panel 被顶到 256（其上移），statusbar 仍贴底
    expect(engine.getBounds("panel")?.y).toBe(256);
    expect(engine.getBounds("statusbar")).toEqual({ x: 0, y: 576, width: 800, height: 24 });
  });

  it("removeZone——移除后 getBounds 返回 undefined", () => {
    const engine = new LayoutEngine();
    with800x600(engine);

    engine.removeZone("sidebar");
    expect(engine.getBounds("sidebar")).toBeUndefined();
    expect(engine.getAllZones()).toHaveLength(4);
  });

  it("dockTo——侧栏从左换到右后坐标正确（右缘堆叠）", () => {
    const engine = new LayoutEngine();
    with800x600(engine);

    engine.dockTo("sidebar", "right");

    // sidebar 现在在右边：x = 800 - 280 = 520
    expect(engine.getBounds("sidebar")).toEqual({ x: 520, y: 0, width: 280, height: 356 });
    // E5.8#37.6.5：iconbar 恒贴主侧栏外缘——换右后也到最右（order0 最外缘），main 填满左边全宽
    expect(engine.getBounds("iconbar")).toEqual({ x: 478, y: 0, width: 42, height: 356 });
    expect(engine.getBounds("main")).toEqual({ x: 0, y: 0, width: 478, height: 356 });
  });

  it("onDidChangeLayout——setLayout 时触发", () => {
    const engine = new LayoutEngine();
    with800x600(engine); // setContainerSize → 1 次
    const fired = vi.fn();
    engine.onDidChangeLayout(fired);

    engine.setLayout([
      { zone: "a", dock: { edge: "left", width: 100 } },
      { zone: "b", dock: { edge: "center" } },
    ]);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  /* ── 2c. E5.8#36.7 新增：top edge / align / swap 规则 / 负高钳制 ── */

  it("dockTo 面板到 top——面板成为顶横带，主区下移", () => {
    const engine = new LayoutEngine();
    with800x600(engine);

    engine.dockTo("panel", "top");

    // topHeight = 220 → contentHeight = 600 - 220 - 24 = 356
    expect(engine.getBounds("panel")).toEqual({ x: 0, y: 0, width: 800, height: 220 });
    // 主区从 topHeight 起（池 grid 同为 row2）
    expect(engine.getBounds("main")?.y).toBe(220);
    expect(engine.getBounds("main")?.height).toBe(356);
    // statusbar 仍在最底
    expect(engine.getBounds("statusbar")).toEqual({ x: 0, y: 576, width: 800, height: 24 });
  });

  it("setAlign——存储 align 配置 + 触发 onDidChangeLayout", () => {
    const engine = new LayoutEngine();
    with800x600(engine);
    const fired = vi.fn();
    engine.onDidChangeLayout(fired);

    // 默认 center（构造器显式声明）
    expect(engine.getZone("panel")?.dock?.align).toBe("center");
    engine.setAlign("panel", "left");
    expect(engine.getZone("panel")?.dock?.align).toBe("left");
    expect(fired).toHaveBeenCalledTimes(1);
  });

  it("dockTo swap 规则——主侧栏换右 → 右侧栏自动跳左 + iconbar 同边跟随（E5.8#37.6.5）", () => {
    const engine = new LayoutEngine();
    engine.addZone({ zone: "rightSidebar", dock: { edge: "right", width: 300 } });

    engine.dockTo("sidebar", "right");
    expect(engine.getZone("sidebar")?.dock?.edge).toBe("right");
    expect(engine.getZone("rightSidebar")?.dock?.edge).toBe("left");
    expect(engine.getZone("iconbar")?.dock?.edge).toBe("right"); // iconbar 恒贴主侧栏同侧

    engine.dockTo("sidebar", "left");
    expect(engine.getZone("sidebar")?.dock?.edge).toBe("left");
    expect(engine.getZone("rightSidebar")?.dock?.edge).toBe("right");
    expect(engine.getZone("iconbar")?.dock?.edge).toBe("left"); // 换回左 → iconbar 回左
  });

  it("dockTo 换右后 iconbar 外缘——order 最小贴窗口最右（比主侧栏更靠外）", () => {
    const engine = new LayoutEngine();
    engine.addZone({ zone: "rightSidebar", dock: { edge: "right", width: 300 } });
    with800x600(engine);

    engine.dockTo("sidebar", "right");
    // right 侧堆叠（从右向左）：iconbar(42) order0 最外缘 → [478,520]；sidebar 280 在其内 → [520,800]。
    // 高度 = contentHeight = 600 - 244（statusbar 24 + panel 220）= 356（引擎 bounds 不含底栏横带）
    expect(engine.getBounds("iconbar")).toEqual({ x: 478, y: 0, width: 42, height: 356 });
    expect(engine.getBounds("sidebar")).toEqual({ x: 520, y: 0, width: 280, height: 356 });
  });

  it("负 contentHeight 钳制——面板超高 → 主区高度 0 不产生 NaN", () => {
    const engine = new LayoutEngine();
    with800x600(engine);

    // panel clamp 到 maxHeight 600 → bottomHeight = 624 > 600 → contentHeight 钳到 0
    engine.resizeZoneHeight("panel", 999);
    expect(engine.getBounds("panel")?.height).toBe(600);
    expect(engine.getBounds("main")?.height).toBe(0);
    expect(engine.getBounds("main")?.y).not.toBeNaN();
    expect(engine.getBounds("main")?.width).not.toBeNaN();
  });

  /* ── 3. resizeZone ── */

  it("resizeZone——调整宽度 + clamp 到 min/max", () => {
    const engine = new LayoutEngine();
    with800x600(engine);

    // sidebar 默认 minWidth=170, maxWidth=600
    engine.resizeZone("sidebar", 400);
    expect(engine.getBounds("sidebar")?.width).toBe(400);

    // 低于 min → clamp 到 170
    engine.resizeZone("sidebar", 100);
    expect(engine.getBounds("sidebar")?.width).toBe(170);

    // 高于 max → clamp 到 600
    engine.resizeZone("sidebar", 999);
    expect(engine.getBounds("sidebar")?.width).toBe(600);
  });

  it("resizeZoneHeight——panel 高度 clamp + 多 bottom zone 堆叠不错位", () => {
    const engine = new LayoutEngine();
    with800x600(engine);

    // panel 默认 minHeight=120, maxHeight=600
    engine.resizeZoneHeight("panel", 300);
    expect(engine.getBounds("panel")?.height).toBe(300);
    // panel 变高后 statusbar 仍贴窗口底边，panel 紧贴其上——堆叠从底边向上逐层
    expect(engine.getBounds("panel")).toEqual({ x: 0, y: 276, width: 800, height: 300 });
    expect(engine.getBounds("statusbar")).toEqual({ x: 0, y: 576, width: 800, height: 24 });
    // 内容区高度随 panel 收缩（600 - 300 - 24 = 276）
    expect(engine.getBounds("main")?.height).toBe(276);

    // 低于 min → clamp 到 120
    engine.resizeZoneHeight("panel", 50);
    expect(engine.getBounds("panel")?.height).toBe(120);

    // 高于 max → clamp 到 600
    engine.resizeZoneHeight("panel", 999);
    expect(engine.getBounds("panel")?.height).toBe(600);
  });

  /* ── 4. 像素对齐 ── */

  it("所有坐标是整数——Math.round() 消除 sub-pixel", () => {
    const engine = new LayoutEngine();
    // 使用非整数容器尺寸测整数化
    engine.setContainerSize(1024.7, 768.3);

    for (const zoneId of ["iconbar", "sidebar", "main", "panel", "statusbar"]) {
      const bounds = engine.getBounds(zoneId);
      if (!bounds) continue;
      expect(Number.isInteger(bounds.x), `${zoneId} x 应为整数`).toBe(true);
      expect(Number.isInteger(bounds.y), `${zoneId} y 应为整数`).toBe(true);
      expect(Number.isInteger(bounds.width), `${zoneId} width 应为整数`).toBe(true);
      expect(Number.isInteger(bounds.height), `${zoneId} height 应为整数`).toBe(true);
    }
  });

  /* ── 5. onDidChangeLayout ── */

  it("onDidChangeLayout——resizeZone 时触发", () => {
    const engine = new LayoutEngine();
    with800x600(engine);
    const fired = vi.fn();
    engine.onDidChangeLayout(fired);

    engine.resizeZone("sidebar", 300);
    expect(fired).toHaveBeenCalledTimes(1);
  });

  /* ── 6. 容器尺寸为 0 / 负值 → 不计算 ── */

  it("setContainerSize(0, 0)——不计算，bounds 保持空", () => {
    const engine = new LayoutEngine();
    engine.setContainerSize(0, 0);

    // 没有 bounds 被计算
    expect(engine.getBounds("iconbar")).toBeUndefined();
  });

  it("setContainerSize 负值——不计算", () => {
    const engine = new LayoutEngine();
    engine.setContainerSize(-100, -50);

    expect(engine.getBounds("iconbar")).toBeUndefined();
  });

  /* ── 7. getBounds NaN protection ── */

  it("center width 为负时 clamp 到 0——不产生 NaN", () => {
    const engine = new LayoutEngine();
    // 侧栏无钳制直设 800（setZoneWidth 专用于 collapse/expand——不 clamp）
    // → left 总宽 842 超容器 800 → center 应 clamp 到 0
    engine.setZoneWidth("sidebar", 800);
    with800x600(engine);

    const center = engine.getBounds("main");
    expect(center?.width).toBe(0);
    // 不应产生 NaN
    expect(center?.x).not.toBeNaN();
    expect(center?.y).not.toBeNaN();
  });
});
