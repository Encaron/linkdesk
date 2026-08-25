/**
 * @vitest-environment jsdom
 * E5.8#83 实机专项：ColorPicker 视口边界碰撞（根因 A）+ overlay 点击关闭（根因 B）。
 * 纯函数 resolvePanelPosition 覆盖翻转/clamp 全分支；组件覆盖 overlay 点击关 / OK 确认 / anchor 渲染。
 *
 * 零 @src/core import——纯 UI 行为断言。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

import ColorPicker, { resolvePanelPosition, PANEL_WIDTH } from "./ColorPicker";

const VIEWPORT = { width: 1024, height: 768 };
const PANEL_H = 224;
const MARGIN = 8;

beforeEach(() => {
  document.body.innerHTML = "";
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

function renderPicker(overrides: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  const props = {
    open: true,
    value: "#0078d4",
    onChange,
    onClose,
    ...overrides,
  };
  const result = render(<ColorPicker {...props} />);
  const overlay = () => document.querySelector(".colorpicker-overlay")!;
  const panel = () => document.querySelector(".colorpicker-panel") as HTMLElement | null;
  const ok = () => document.querySelector(".colorpicker-ok")!;
  return { ...result, onChange, onClose, overlay, panel, ok };
}

describe("resolvePanelPosition — 视口边界碰撞（E5.8#83 根因 A）", () => {
  it("锚点在视口中央 → 右下摆放（面板左缘=锚点x、顶=锚点y）", () => {
    const pos = resolvePanelPosition({ x: 300, y: 300 }, PANEL_WIDTH, PANEL_H, VIEWPORT);
    expect(pos).toEqual({ left: 300, top: 300 });
  });

  it("锚点靠下（下方放不下）→ 翻到上方（面板底 = 锚点y - margin）", () => {
    // 300 + 224 + 8 = 532 ≤ 768 放得下；拉到 600 就放不下
    const below = resolvePanelPosition({ x: 300, y: 400 }, PANEL_WIDTH, PANEL_H, VIEWPORT);
    expect(below.top).toBe(400); // 400+224+8=632 ≤ 768 仍下排
    const flip = resolvePanelPosition({ x: 300, y: 560 }, PANEL_WIDTH, PANEL_H, VIEWPORT);
    expect(flip.top).toBe(560 - PANEL_H - MARGIN); // 560+224+8=792 > 768 → 翻上
  });

  it("锚点靠右（右侧放不下）→ 翻到左侧", () => {
    // 900 + 232 + 8 = 1140 > 1024 → 翻左
    const pos = resolvePanelPosition({ x: 900, y: 300 }, PANEL_WIDTH, PANEL_H, VIEWPORT);
    expect(pos.left).toBe(900 - PANEL_WIDTH - MARGIN);
  });

  it("锚点已溢出视口（如 CDP 实锤 面板 y=993 > innerH=900）→ clamp 收拢入视口", () => {
    // 右/下双双放不下 → 翻转后仍溢出 → clamp 到视口内 margin 边
    const pos = resolvePanelPosition({ x: 1010, y: 993 }, PANEL_WIDTH, PANEL_H, VIEWPORT);
    expect(pos.left).toBeGreaterThanOrEqual(MARGIN);
    expect(pos.left + PANEL_WIDTH + MARGIN).toBeLessThanOrEqual(VIEWPORT.width);
    expect(pos.top).toBeGreaterThanOrEqual(MARGIN);
    expect(pos.top + PANEL_H + MARGIN).toBeLessThanOrEqual(VIEWPORT.height);
    // 顶/左都 clamp 住
    const corner = resolvePanelPosition({ x: 0, y: 0 }, PANEL_WIDTH, PANEL_H, VIEWPORT);
    expect(corner).toEqual({ left: MARGIN, top: MARGIN });
  });

  it("极小视口（面板放不下）→ 至少留 margin，不出负坐标", () => {
    const tiny = { width: 100, height: 80 };
    const pos = resolvePanelPosition({ x: 50, y: 40 }, PANEL_WIDTH, PANEL_H, tiny);
    expect(pos.left).toBeGreaterThanOrEqual(MARGIN);
    expect(pos.top).toBeGreaterThanOrEqual(MARGIN);
    expect(pos.left + PANEL_WIDTH + MARGIN).toBeGreaterThan(tiny.width); // 面板比视口宽——接受，只保证不截断锚点侧
  });
});

describe("ColorPicker 组件 — overlay 点击关闭（E5.8#83 根因 B）", () => {
  it("点击遮罩 → onClose（打破「只能 Escape/OK 退」死锁）", () => {
    const { onClose, overlay } = renderPicker();
    fireEvent.click(overlay());
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("点击面板内部（OK 键）→ 提交 onChange + onClose，不触发遮罩关闭", () => {
    const { onChange, onClose, ok } = renderPicker();
    fireEvent.click(ok());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("点击 hex 输入 → 不关闭（面板内交互保持）", () => {
    const { onClose } = renderPicker();
    const hex = document.querySelector(".colorpicker-hex")!;
    fireEvent.click(hex);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("anchor 存在 → 面板带内联 left/top（clamp 后）且整体在视口内", () => {
    renderPicker({ anchor: { x: 900, y: 700 } });
    const panel = document.querySelector(".colorpicker-panel") as HTMLElement;
    // jsdom 下 offsetWidth/offsetHeight=0 → 实测分支量到 0；仍应 clamp 在视口内
    expect(panel.style.left).not.toBe("");
    expect(panel.style.top).not.toBe("");
    const left = parseFloat(panel.style.left);
    const top = parseFloat(panel.style.top);
    expect(Number.isFinite(left)).toBe(true);
    expect(Number.isFinite(top)).toBe(true);
    expect(left).toBeGreaterThanOrEqual(MARGIN);
    expect(top).toBeGreaterThanOrEqual(MARGIN);
  });

  it("无 anchor → 面板无内联定位（走 CSS 居中）", () => {
    const { panel } = renderPicker();
    expect(panel()!.style.left).toBe("");
    expect(panel()!.style.top).toBe("");
  });
});
