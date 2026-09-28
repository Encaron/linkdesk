/**
 * @vitest-environment jsdom
 *
 * M2 `AI#22`：壳侧 **hover-only 面**（SidebarSection 的 actions / `…` 溢出钮）可发现性 ＋ aria。
 * 覆盖：`…` 钮有 role/可聚焦/`aria-label`＋`aria-expanded`（开合跟随）/ 键盘 Enter·Space 开关、Escape 关 /
 * header 只接管**自身**按键（actions 里控件的 Enter 不被折叠键抢走——旧码会 preventDefault 掉还顺手折叠）/
 * hover-only 揭示规则含 `:focus-within`（键盘腿）。
 *
 * ⚠️ 揭示规则的**机器判据 = 读 CSS 文本**（`:focus-within` 在不在）——jsdom 不做层叠计算；
 *    真机验收走 CDP `CSS.forcePseudoState` 强制 `:hover`（⛔ 不用真实坐标悬停，人手一动就抢走 hover；
 *    见 `docs/07-AI操作手册/04-手势隐藏规则.md`、`06-CDP坑表.md`）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, fireEvent, cleanup, act } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ROOT } from "../../../../scripts/lib/contract-parse.mjs"; // 仓根单一真相源（同 aiManualIndex.test）
import "../../../i18n"; // 模块级 i18n init（与 PoolSectionStack.test 同款——t(key) 缺表回退 key 原文）
import SidebarSection from "./SidebarSection";
import { HINT_ATTR } from "../hint-tip/hintAttrs"; // ⛔ 别写字面量 "data-hint"——单一真相源

/* jsdom 无 ResizeObserver——本组件用它检测 actions 溢出（回调要能手动触发：溢出是 … 钮的前置） */
type ROCallback = () => void;
let roCallbacks: ROCallback[] = [];
class ResizeObserverStub {
  constructor(cb: ROCallback) { roCallbacks.push(cb); }
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

/** 把 actions 容器伪装成「已溢出」（jsdom 的 scrollWidth/clientWidth 恒 0） */
function makeOverflow(container: HTMLElement): void {
  const actions = container.querySelector(".ldk-sidebar-section-actions") as HTMLElement;
  Object.defineProperty(actions, "scrollWidth", { value: 120, configurable: true });
  Object.defineProperty(actions, "clientWidth", { value: 40, configurable: true });
  act(() => { roCallbacks.forEach((cb) => cb()); });
}

function renderSection(actions?: ReactNode) {
  return render(
    <SidebarSection title="Demo Section" actions={actions}>
      <div data-testid="body">body</div>
    </SidebarSection>,
  );
}

function moreButton(container: HTMLElement): HTMLElement {
  return container.querySelector(".ldk-sidebar-section-more") as HTMLElement;
}
function headerEl(container: HTMLElement): HTMLElement {
  return container.querySelector(".ldk-sidebar-section-header") as HTMLElement;
}
function bodyVisible(container: HTMLElement): boolean {
  return container.querySelector('[data-testid="body"]') !== null;
}

beforeEach(() => { roCallbacks = []; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AI#22 · `…` 溢出钮的可发现性（aria）", () => {
  it("溢出才出现：未溢出零 `…` 钮（既有行为保护），溢出后出现", () => {
    const { container } = renderSection(<button>x</button>);
    expect(moreButton(container)).toBeNull();

    makeOverflow(container);
    expect(moreButton(container)).not.toBeNull();
  });

  it("`…` 是可读的钮：role=button ＋ 可聚焦 ＋ aria-label 与悬停提示同源", () => {
    const { container } = renderSection(<button>x</button>);
    makeOverflow(container);

    const more = moreButton(container);
    expect(more.getAttribute("role")).toBe("button");
    expect(more.getAttribute("tabindex")).toBe("0");
    expect(more.getAttribute("aria-haspopup")).toBe("true");
    // 🔴 悬停提示与读屏名**同一份文案**（⛔ 不许两处各写一份——两把尺子必然漂移）
    expect(more.getAttribute("aria-label")).toBeTruthy();
    expect(more.getAttribute("aria-label")).toBe(more.getAttribute(HINT_ATTR));
  });

  it("开合跟随：鼠标点开 → aria-expanded=true ＋ 下拉出现；再点关回 false", () => {
    const { container } = renderSection(<button>x</button>);
    makeOverflow(container);

    const more = moreButton(container);
    expect(more.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(container.querySelector(".ldk-sidebar-section-more-dropdown")).not.toBeNull();

    fireEvent.click(more);
    expect(more.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector(".ldk-sidebar-section-more-dropdown")).toBeNull();
  });
});

describe("AI#22 · `…` 的键盘路径（非鼠标）", () => {
  it("Enter / Space 开合，Escape 关（三条键都通）", () => {
    const { container } = renderSection(<button>x</button>);
    makeOverflow(container);
    const more = moreButton(container);

    fireEvent.keyDown(more, { key: "Enter" });
    expect(more.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(more, { key: "Escape" });
    expect(more.getAttribute("aria-expanded")).toBe("false");

    fireEvent.keyDown(more, { key: " " });
    expect(more.getAttribute("aria-expanded")).toBe("true");
  });

  it("🔴 键盘开合**不折叠**本节（`…` 上的键不冒到 header 的折叠键）", () => {
    const { container } = renderSection(<button>x</button>);
    makeOverflow(container);

    fireEvent.keyDown(moreButton(container), { key: "Enter" });

    expect(bodyVisible(container)).toBe(true);
    expect(headerEl(container).getAttribute("aria-expanded")).toBe("true");
  });

  it("🔴 actions 里控件拿到焦点时按 Enter → 折叠键不抢（旧码 preventDefault 掉还顺手折叠）", () => {
    const { container } = renderSection(<button>Act</button>);

    const actionBtn = container.querySelector(".ldk-sidebar-section-actions button") as HTMLElement;
    fireEvent.keyDown(actionBtn, { key: "Enter" });

    expect(bodyVisible(container)).toBe(true);
    expect(headerEl(container).getAttribute("aria-expanded")).toBe("true");
  });

  it("header 自身仍有键盘折叠（对照组——AI#22 没把既有键盘门拆掉）", () => {
    const { container } = renderSection(<button>x</button>);
    const header = headerEl(container);

    fireEvent.keyDown(header, { key: "Enter" });
    expect(header.getAttribute("aria-expanded")).toBe("false");
    expect(bodyVisible(container)).toBe(false);
  });
});

describe("AI#22 · 揭示规则的键盘腿（读 CSS 文本）", () => {
  const css = readFileSync(
    resolve(ROOT, "src/components/shared/sidebar-section/SidebarSection.css"),
    "utf8",
  );

  it("hover-only 的 actions 与 `…` 两条规则都含 `:focus-within`（hover 不是唯一门）", () => {
    expect(css).toContain(".ldk-sidebar-section-header:focus-within .ldk-sidebar-section-actions.show-on-hover");
    expect(css).toContain(".ldk-sidebar-section-header:focus-within .ldk-sidebar-section-more.show-on-hover");
  });
});
