/**
 * 浮层层级权威单测——E6#73b ④「Esc 只关最上层浮层」的判据。
 *
 * jsdom 下 `getComputedStyle().zIndex` 对内联 z 返回其值、未设时返回 `auto`/空串——
 * 两种都被 `effectiveZ` 跳过（继续沿祖先找）。真实层级的实机验收仍走 CDP（Esc 分层是交互行为）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { isTopmostOverlay, isTopmostOverlayFrom, OVERLAY_LAYER_ATTR } from "./overlayLayer";

/** 造一个浮层表面——`z` 省略 = 不写内联 z（走祖先 z） */
function layer(z?: string, parent?: HTMLElement): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute(OVERLAY_LAYER_ATTR, "");
  if (z !== undefined) el.style.zIndex = z;
  (parent ?? document.body).appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isTopmostOverlay——按有效 z-index 排序", () => {
  it("只有一个表面 → 它是顶层", () => {
    const a = layer("2000");
    expect(isTopmostOverlay(a)).toBe(true);
  });

  it("没有任何表面（组件未挂载 / ref 为空）→ true（闭自己的行为最保守）", () => {
    expect(isTopmostOverlay(null)).toBe(true);
    expect(isTopmostOverlay(undefined)).toBe(true);
  });

  it("z 高者顶层、低者不是——通知面板（2000）压不住右键菜单（3000）", () => {
    const panel = layer("2000");
    const menu = layer("3000");
    expect(isTopmostOverlay(menu)).toBe(true);
    expect(isTopmostOverlay(panel)).toBe(false);
  });

  it("同 z 按文档序——后挂载者在上（同一 portal root 内文档序即挂载序）", () => {
    const first = layer("2000");
    const second = layer("2000");
    expect(isTopmostOverlay(second)).toBe(true);
    expect(isTopmostOverlay(first)).toBe(false);
  });

  it("档内顺序反转（后挂载者 z 更低）→ 仍按 z，不按文档序", () => {
    const low = layer("1500");
    const high = layer("5000");
    expect(isTopmostOverlay(high)).toBe(true);
    expect(isTopmostOverlay(low)).toBe(false);
  });

  it("表面自身无 z → 取祖先的 z（OverlayPortal 不传 zIndex 时落 #overlay-root 的 2000）", () => {
    const root = document.createElement("div");
    root.style.zIndex = "2000";
    document.body.appendChild(root);
    const panel = layer(undefined, root);
    const dialog = layer("5000");
    expect(isTopmostOverlay(dialog)).toBe(true);
    expect(isTopmostOverlay(panel)).toBe(false);
  });

  it("已从文档移除的表面（ref 未及时置空）→ true，不误判成活层", () => {
    const gone = layer("9000");
    gone.remove();
    expect(isTopmostOverlay(gone)).toBe(true);
  });
});

describe("isTopmostOverlayFrom——从表面内部的元素反查", () => {
  it("沿祖先找到最近的标记表面再比（ContextMenu 只持 menuRef，包装盒归 OverlayPortal）", () => {
    const panel = layer("2000");
    const wrapper = layer("3000");
    const inner = document.createElement("div");
    wrapper.appendChild(inner);
    expect(isTopmostOverlayFrom(inner)).toBe(true);
    expect(isTopmostOverlayFrom(panel)).toBe(false);
  });

  it("没有标记祖先 → true（无表面可比）", () => {
    const orphan = document.createElement("div");
    document.body.appendChild(orphan);
    expect(isTopmostOverlayFrom(orphan)).toBe(true);
  });
});
