/**
 * LayoutEngine.test.ts —— E5#27b 壳布局引擎测试。
 *
 * 📌 锁定到 E5#9：LayoutEngine.ts 实现完后立刻写，写完后才接入 App.tsx。
 *
 * 覆盖：
 *   1. 默认布局——4 个 zone 坐标正确
 *   2. getZone——单个 zone 配置（钳制界来源）
 *   3. resizeZone——clamp min/max
 *   4. 像素对齐——所有坐标 Math.round()
 *   5. onDidChangeLayout——resizeZone 时触发
 *   6. 容器尺寸为 0 / 负值 → 不计算
 *   7. center width 为负时 clamp 到 0——不产生 NaN
 *   8. getBounds 对不存在 zone 返回 undefined
 *
 * E5.7#31.5（2026-08-15）测试瘦身：setLayout/addZone/removeZone/dockTo/getAllZones/
 * floating 分支的测试段随死 API 一并删除；NaN 防护测试改用 setZoneWidth（无钳制直设）
 * 构造超宽侧栏——测试语义保留（center clamp 不产生 NaN）。
 */

import { describe, it, expect, vi } from "vitest";

/* ── LayoutEngine 直接构造——不依赖单例状态 ── */
import { LayoutEngine } from "../../core/services/LayoutEngine";

/** 辅助：设置 800×600 容器 */
function with800x600(engine: LayoutEngine): void {
  engine.setContainerSize(800, 600);
}

describe("LayoutEngine", () => {
  /* ── 1. 默认布局 ── */

  it("默认布局——4 个 zone 坐标正确", () => {
    const engine = new LayoutEngine();
    with800x600(engine);

    const iconbar = engine.getBounds("iconbar");
    const sidebar = engine.getBounds("sidebar");
    const main = engine.getBounds("main");
    const statusbar = engine.getBounds("statusbar");

    // iconbar: 左 42px，全高（600 - statusbar 24）
    expect(iconbar).toEqual({ x: 0, y: 0, width: 42, height: 576 });
    // sidebar: iconbar 右边，280px 宽
    expect(sidebar).toEqual({ x: 42, y: 0, width: 280, height: 576 });
    // main: 填满剩余（800 - 42 - 280 = 478）
    expect(main).toEqual({ x: 322, y: 0, width: 478, height: 576 });
    // statusbar: 底部全宽 24px
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

  /* ── 4. 像素对齐 ── */

  it("所有坐标是整数——Math.round() 消除 sub-pixel", () => {
    const engine = new LayoutEngine();
    // 使用非整数容器尺寸测整数化
    engine.setContainerSize(1024.7, 768.3);

    for (const zoneId of ["iconbar", "sidebar", "main", "statusbar"]) {
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
