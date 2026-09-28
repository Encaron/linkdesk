/**
 * @vitest-environment jsdom
 *
 * E5.8#37：FloatingPanelHost 壳推送回归（Phase 8 类型 B 壳内悬浮面板）。
 * 覆盖：open:true 渲染标题/三动作 + 默认居中大卡几何（85vw×80vh，#41.6）/
 * open:false 关闭零 DOM + 重开重置最大化态 / maximize 本地视觉 toggle（两态文案，零 action 回传）/
 * 非 toggle 动作回传 action(id)（open-in/close）/ 遮罩点击关闭 / Esc 关闭 / 面板本体点击不关 /
 * I8-5 拖拽（delta 几何 + 壳内 6px 钳制）/ I8-6 拖拽松手同拍遮罩点击不关闭 /
 * I8-7 resize 调高 + 最小高 300 钳制 /
 * **M2 `AI#20` 非鼠标路径**：DTO `bounds` 精确设定 + null 回默认 + API 路径同样受
 * MIN_HEIGHT/RESIZE_MAX_OFFSET 钳制 / `floatingPanelHost.getBounds()` 读数与落点一致 /
 * 几何上报壳（`events.emit("floating-panel:geometry")`——落定才发、拖拽中不发）。
 *
 * mock window.linkdesk.floatingPanelHost（preload 同款形状）——组件只消费此命名空间。
 * 内容 PluginComponent 走缺省回退（preview mock 无 plugins 面——"插件不可用"，面板 chrome 完整）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act, screen } from "@testing-library/react";
import FloatingPanelHost from "./FloatingPanelHost";
import type {
  FloatingPanelBounds,
  FloatingPanelBoundsHostRequest,
  PoolFloatingPanelData,
  PoolFloatingPanelGeometry,
} from "../../../core/types/pool/poolFloatingPanel";
import { MIN_HEIGHT } from "./floatingBounds";

/* ── mock window.linkdesk.floatingPanelHost —— preload-pool 同款形状 ── */

type ShowCb = (data: PoolFloatingPanelData) => void;
type BoundsHostFn = (
  req: FloatingPanelBoundsHostRequest,
) => boolean | PoolFloatingPanelGeometry | null;

const { mockAction, mockEmit } = vi.hoisted(() => ({
  mockAction: vi.fn(),
  mockEmit: vi.fn(),
}));

let onShowCb: ShowCb | null = null;
/** 池注册的几何宿主——preload 侧注册槽的测试替身（registerBoundsHost 存进来，getBounds 调它） */
let boundsHostFn: BoundsHostFn | null = null;

function installFloatingPanelApi(): void {
  onShowCb = null;
  boundsHostFn = null;
  Object.defineProperty(window, "linkdesk", {
    value: {
      floatingPanelHost: {
        onShow: (cb: ShowCb) => {
          onShowCb = cb;
          return () => { onShowCb = null; };
        },
        action: (...args: unknown[]) => mockAction(...args),
        registerBoundsHost: (fn: BoundsHostFn) => {
          boundsHostFn = fn;
          return () => { boundsHostFn = null; };
        },
      },
      // M2 `AI#20`：几何上报出口（pool → 壳镜像）
      events: { emit: (...args: unknown[]) => mockEmit(...args), on: () => () => {} },
    },
    writable: true,
    configurable: true,
  });
}

/** 池内读数替身——preload `floatingPanelHost.getBounds()` 同语义（宿主未注册/无面板 → null） */
function getBounds(): PoolFloatingPanelGeometry | null {
  return (boundsHostFn?.({ op: "get" }) as PoolFloatingPanelGeometry | null | undefined) ?? null;
}

/** 最近一次几何上报载荷（`events.emit("floating-panel:geometry", payload)`） */
function lastGeometryReport(): Record<string, unknown> | null {
  const calls = mockEmit.mock.calls.filter((c) => c[0] === "floating-panel:geometry");
  return calls.length ? (calls[calls.length - 1][1] as Record<string, unknown>) : null;
}

/** 默认样例——mockup 帧 1 三动作（open-in hover 展开 / maximize 两态 toggle / close）。
 *  插件身份 + 显示文本全用明显虚构值（demo-plugin/demo-view + Demo View/Open in Main Window…）——
 *  测试 fixture 惰性字符串，组件不加载；真实插件名/真实 UI 文案（settings/设置/最大化…）一律不用，
 *  避免误导（2026-08-22 用户「没有硬编码」标准）。refresh 用例用 Démo Vue（法文）演「换语言后的文案」。 */
function sampleData(): PoolFloatingPanelData {
  return {
    open: true,
    viewId: "demo-view",
    title: "Demo View",
    pluginId: "demo-plugin",
    renderPath: "/@fs/plugins/demo-plugin/src/views/DemoView.tsx",
    actions: [
      { id: "open-in", label: "Open in Main Window", icon: "open-in", expandOnHover: true },
      { id: "maximize", label: "Maximize", icon: "maximize", toggledIcon: "restore", toggledLabel: "Restore" },
      { id: "close", label: "Close", icon: "close" },
    ],
  };
}

function pushShell(data: PoolFloatingPanelData): void {
  act(() => {
    onShowCb!(data);
  });
}

function getPanel(container: HTMLElement): HTMLElement {
  return container.querySelector(".ldk-floating-panel") as HTMLElement;
}

/** 默认居中大卡几何（#41.6）——CSS vw/vh 接管；首屏渲染与 `AI#20`「回默认」路径共用此断言 */
function expectDefaultCenteredCard(panel: HTMLElement): void {
  expect(panel.style.top).toBe("10vh");
  expect(panel.style.left).toBe("7.5vw");
  expect(panel.style.width).toBe("85vw");
  expect(panel.style.height).toBe("80vh");
}

/** 手势测试前置——渲染 + 推样例 + 面板几何桩（jsdom getBoundingClientRect 全 0） */
function setupPanel(rect = { top: 100, left: 200, width: 640, height: 400 }) {
  const { container } = render(<FloatingPanelHost />);
  pushShell(sampleData());
  const panel = getPanel(container);
  mockPanelRect(panel, rect);
  return { container, panel };
}

/** 面板几何桩——jsdom getBoundingClientRect 全 0，手势测试需真实几何 */
function mockPanelRect(panel: HTMLElement, rect: { top: number; left: number; width: number; height: number }): void {
  panel.getBoundingClientRect = () => ({
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  }) as DOMRect;
}

/* ── 手势桩（拖拽/resize 共用）——pointer 事件序列 ── */

function startGesture(el: HTMLElement, from: { x: number; y: number }): void {
  fireEvent.pointerDown(el, { pointerId: 1, pointerType: "mouse", button: 0, clientX: from.x, clientY: from.y });
}
function moveGesture(el: HTMLElement, to: { x: number; y: number }): void {
  fireEvent.pointerMove(el, { pointerId: 1, pointerType: "mouse", clientX: to.x, clientY: to.y });
}
function endGesture(el: HTMLElement): void {
  fireEvent.pointerUp(el, { pointerId: 1, pointerType: "mouse" });
}

beforeEach(() => {
  installFloatingPanelApi();
  mockAction.mockClear();
  mockEmit.mockClear();
  // jsdom 手势桩——setPointerCapture 未实现（no-op，指针捕获语义测试不需要）
  Element.prototype.setPointerCapture = () => {};
});

afterEach(() => {
  cleanup();
});

/* ── 壳推送渲染 ── */

describe("壳推送渲染", () => {
  it("open:true 渲染标题 + 三动作 + 默认居中大卡几何（#41.6）", () => {
    const { container } = render(<FloatingPanelHost />);
    pushShell(sampleData());

    expect(screen.getByText("Demo View")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open in Main Window" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Maximize" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close" })).toBeTruthy();

    expectDefaultCenteredCard(getPanel(container));
  });

  it("open:false 关闭面板——返回 null 零 DOM", () => {
    const { container } = render(<FloatingPanelHost />);
    pushShell(sampleData());
    expect(getPanel(container)).toBeTruthy();

    pushShell({ open: false });
    expect(container.querySelector(".ldk-floating-panel")).toBeNull();
  });
});

/* ── I8-9 最大化——池本地纯视觉 toggle，零壳 roundtrip ── */

describe("最大化本地视觉 toggle（I8-9）", () => {
  it("点击 maximize → 还原态（类名 + 两态文案），零 action 回传；再点还原复原", () => {
    const { container } = render(<FloatingPanelHost />);
    pushShell(sampleData());

    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    expect(getPanel(container).className).toContain("maximized");
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Maximize" })).toBeNull();
    expect(mockAction).not.toHaveBeenCalled(); // 纯视觉态——不触发 action 回传

    fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(getPanel(container).className).not.toContain("maximized");
    expect(screen.getByRole("button", { name: "Maximize" })).toBeTruthy();
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("重开回默认——最大化 → 关闭 → 重开不保留最大化态", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();

    pushShell({ open: false });
    pushShell(sampleData());
    expect(screen.getByRole("button", { name: "Maximize" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });
});

/* ── 动作回传壳（非 toggle——open-in/close） ── */

describe("动作回传壳（非 toggle）", () => {
  it("close 按钮 → action('close')", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mockAction).toHaveBeenCalledWith("close");
  });

  it("open-in 按钮 → action('open-in')", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());
    fireEvent.click(screen.getByRole("button", { name: "Open in Main Window" }));
    expect(mockAction).toHaveBeenCalledWith("open-in");
  });
});

/* ── I8-8 遮罩 / Esc 关闭 ── */

describe("遮罩 / Esc 关闭（I8-8）", () => {
  it("遮罩点击 → action('close')", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());
    // E5.8#107 浮层权威：遮罩 portal 出 container（createPortal → scrim-plane/body 兜底）——查 document 而非 container
    const backdrop = document.querySelector(".ldk-floating-panel-backdrop") as HTMLElement;
    fireEvent.click(backdrop);
    expect(mockAction).toHaveBeenCalledWith("close");
  });

  it("面板本体点击不触发关闭（stopPropagation 防御）", () => {
    const { container } = render(<FloatingPanelHost />);
    pushShell(sampleData());
    fireEvent.click(getPanel(container));
    expect(mockAction).not.toHaveBeenCalled();
  });

  it("Esc → action('close')", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockAction).toHaveBeenCalledWith("close");
  });
});

/* ── I8-5 拖拽（整条标题栏 + 壳内 6px 钳制，#41.6） ── */

describe("I8-5 拖拽（整条标题栏 + 壳内钳制）", () => {
  it("拖拽移动面板——几何按 delta 更新", () => {
    const { panel } = setupPanel();
    const title = panel.querySelector(".ldk-floating-panel-title") as HTMLElement;
    startGesture(title, { x: 200, y: 100 });
    moveGesture(title, { x: 300, y: 200 });

    expect(panel.style.top).toBe("200px");
    expect(panel.style.left).toBe("300px");
    expect(panel.style.width).toBe("640px");
    expect(panel.style.height).toBe("400px");
  });

  it("拖出壳窗口边界被钳制到 6px inset", () => {
    const { panel } = setupPanel();
    const maxTop = window.innerHeight - 400 - 6;
    const maxLeft = window.innerWidth - 640 - 6;

    const title = panel.querySelector(".ldk-floating-panel-title") as HTMLElement;
    startGesture(title, { x: 200, y: 100 });
    moveGesture(title, { x: 3000, y: 3000 });

    expect(panel.style.top).toBe(`${maxTop}px`);
    expect(panel.style.left).toBe(`${maxLeft}px`);
  });

  it("标题栏动作按钮按下不触发拖拽（actions 排除，#41.6）", () => {
    const { panel } = setupPanel();
    const maximize = screen.getByRole("button", { name: "Maximize" });
    startGesture(maximize, { x: 200, y: 100 });
    moveGesture(maximize, { x: 300, y: 200 });
    endGesture(maximize);

    expect(panel.className).not.toContain("dragging");
    expect(panel.style.top).toBe("10vh"); // 未转显式几何——仍默认居中大卡
  });
});

/* ── I8-6 拖拽松手同拍遮罩点击不关闭 ── */

describe("I8-6 拖拽/调整后遮罩点击抑制", () => {
  it("松手同拍内 backdrop 点击被忽略（suppress 标志延迟一拍）", () => {
    const { panel } = setupPanel();
    const title = panel.querySelector(".ldk-floating-panel-title") as HTMLElement;
    startGesture(title, { x: 200, y: 100 });
    moveGesture(title, { x: 220, y: 120 });
    endGesture(title);

    // E5.8#107 浮层权威：遮罩 portal 出 container（createPortal → scrim-plane/body 兜底）——查 document 而非 container
    const backdrop = document.querySelector(".ldk-floating-panel-backdrop") as HTMLElement;
    fireEvent.click(backdrop);
    expect(mockAction).not.toHaveBeenCalled();
  });
});

/* ── I8-7 resize（底部手柄调高 + 最小高钳制） ── */

describe("I8-7 resize（底部手柄调高）", () => {
  it("向下拖增高——height 按 delta，top 固定（只从底部伸展）", () => {
    const { panel } = setupPanel();
    const resize = panel.querySelector(".ldk-floating-panel-resize") as HTMLElement;
    startGesture(resize, { x: 300, y: 500 });
    moveGesture(resize, { x: 300, y: 600 });

    expect(panel.style.height).toBe("500px"); // 400 + 100
    expect(panel.style.top).toBe("100px"); // top 固定
  });

  it("向上拖超过最小高被钳制到 300px", () => {
    const { panel } = setupPanel();
    const resize = panel.querySelector(".ldk-floating-panel-resize") as HTMLElement;
    startGesture(resize, { x: 300, y: 500 });
    moveGesture(resize, { x: 300, y: -1000 });

    expect(panel.style.height).toBe("300px");
  });
});

/* ── M2 `AI#20` 非鼠标路径：API 设定几何 + 读数 + 上报 ── */

/** 带 API 几何的推送——壳 FloatingPanelService.setBounds → DTO 带 bounds（refresh:true，不抢焦点） */
function pushWithBounds(bounds: Partial<FloatingPanelBounds> | null): void {
  pushShell({ ...(sampleData() as Extract<PoolFloatingPanelData, { open: true }>), bounds, refresh: true });
}

describe("AI#20 API 路径设定几何（非鼠标路径）", () => {
  it("DTO 带 bounds → 面板几何 = 该 px（不靠鼠标）", () => {
    const { container } = render(<FloatingPanelHost />);
    pushShell(sampleData());
    pushWithBounds({ top: 120, left: 90, width: 500, height: 450 });

    const panel = getPanel(container);
    expect(panel.style.top).toBe("120px");
    expect(panel.style.left).toBe("90px");
    expect(panel.style.width).toBe("500px");
    expect(panel.style.height).toBe("450px");
  });

  it("只给位置 → 宽高保持现值（部分字段精确设定）", () => {
    const { container } = render(<FloatingPanelHost />);
    pushShell(sampleData());
    pushWithBounds({ top: 300, left: 400, width: 500, height: 450 });
    pushWithBounds({ top: 40, left: 60 });

    const panel = getPanel(container);
    expect(panel.style.top).toBe("40px");
    expect(panel.style.left).toBe("60px");
    expect(panel.style.width).toBe("500px"); // 未被牵连
    expect(panel.style.height).toBe("450px");
  });

  it("bounds:null → 回默认居中大卡（CSS vw/vh 重新接管）", () => {
    const { container } = render(<FloatingPanelHost />);
    pushShell(sampleData());
    pushWithBounds({ top: 120, left: 90, width: 500, height: 450 });
    pushWithBounds(null);

    expectDefaultCenteredCard(getPanel(container));
  });

  it("bounds 缺省（拖拽后语言切换重推）→ 不动几何（本地显式几何原样保留）", () => {
    const { container } = render(<FloatingPanelHost />);
    pushShell(sampleData());
    pushWithBounds({ top: 120, left: 90, width: 500, height: 450 });
    pushShell({ ...(sampleData() as Extract<PoolFloatingPanelData, { open: true }>), refresh: true }); // 无 bounds 字段

    const panel = getPanel(container);
    expect(panel.style.top).toBe("120px"); // ⛔ 没被弹回默认
    expect(panel.style.height).toBe("450px");
  });

  it("API 路径同样受隐藏边界钳制——height < MIN_HEIGHT → 250（视口高 800）", () => {
    const { container } = render(<FloatingPanelHost />);
    pushShell(sampleData());
    pushWithBounds({ height: 250 }); // 低于 I8-7 最小高

    expect(getPanel(container).style.height).toBe("300px");
  });

  it("API 路径同样受隐藏边界钳制——height > 窗口高 - 80 → 钳到上限", () => {
    const { container } = render(<FloatingPanelHost />);
    pushShell(sampleData());
    pushWithBounds({ height: 99999 });

    expect(getPanel(container).style.height).toBe(`${window.innerHeight - 80}px`);
  });

  it("API 路径同样受隐藏边界钳制——top/left 出壳窗口 → 钳进 6px inset", () => {
    const { container } = render(<FloatingPanelHost />);
    pushShell(sampleData());
    pushWithBounds({ top: -500, left: -500 });

    const panel = getPanel(container);
    expect(panel.style.top).toBe("6px");
    expect(panel.style.left).toBe("6px");
  });

  it("最大化态下设定几何 → 先退最大化（几何与满窗态互斥，设定必生效）", () => {
    const { container } = render(<FloatingPanelHost />);
    pushShell(sampleData());
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));
    expect(getPanel(container).className).toContain("maximized");

    pushWithBounds({ top: 100, left: 80 });
    const panel = getPanel(container);
    expect(panel.className).not.toContain("maximized");
    expect(panel.style.top).toBe("100px");
  });
});

describe("AI#20 读数（floatingPanelHost.getBounds）", () => {
  it("无面板 → null（宿主虽注册，面板没开就没几何）", () => {
    render(<FloatingPanelHost />);
    expect(getBounds()).toBeNull();
  });

  it("未设定几何 → 报默认居中大卡（#41.6 折算 px）", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());

    const g = getBounds()!;
    expect(g.viewId).toBe("demo-view");
    expect(g.pluginId).toBe("demo-plugin");
    expect(g.maximized).toBe(false);
    expect(g.width).toBeCloseTo(window.innerWidth * 0.85, 5);
    expect(g.height).toBeCloseTo(window.innerHeight * 0.8, 5);
  });

  it("**读数与落点一致**——setFloatingBounds 设一次 → 读到的就是那一组 px", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());
    pushWithBounds({ top: 120, left: 90, width: 500, height: 450 });

    expect(getBounds()).toMatchObject({ top: 120, left: 90, width: 500, height: 450, maximized: false });
  });

  it("读数是**生效**值不是意图值——越界输入 → 读到钳后的值", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());
    pushWithBounds({ height: 10 });

    expect(getBounds()!.height).toBe(MIN_HEIGHT);
  });

  it("最大化态如实报满窗盒（不是最大化前的旧几何）", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());
    pushWithBounds({ top: 120, left: 90, width: 500, height: 450 });
    fireEvent.click(screen.getByRole("button", { name: "Maximize" }));

    const g = getBounds()!;
    expect(g.maximized).toBe(true);
    expect(g.top).toBe(6);
    expect(g.left).toBe(6);
    expect(g.width).toBe(window.innerWidth - 12);
    expect(g.height).toBe(window.innerHeight - 12);
  });

  it("关闭后 null（重开不残留上一轮几何）", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());
    expect(getBounds()).not.toBeNull();
    pushShell({ open: false });
    expect(getBounds()).toBeNull();
  });
});

describe("AI#20 几何上报壳（可读面）", () => {
  it("面板打开即上报一次几何（含身份）", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());

    const r = lastGeometryReport()!;
    expect(r.viewId).toBe("demo-view");
    expect(r.pluginId).toBe("demo-plugin");
    expect(r.maximized).toBe(false);
    expect(r.width).toBeCloseTo(window.innerWidth * 0.85, 5);
  });

  it("API 设定后上报新几何", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());
    pushWithBounds({ top: 120, left: 90, width: 500, height: 450 });

    expect(lastGeometryReport()).toMatchObject({ top: 120, left: 90, width: 500, height: 450 });
  });

  it("拖拽**进行中**不上报，松手那一拍补发最终几何（落定才发，防 IPC 洪水）", () => {
    const { panel } = setupPanel(); // 渲染 + 推样例（默认居中大卡）
    mockEmit.mockClear();

    const title = panel.querySelector(".ldk-floating-panel-title") as HTMLElement;
    startGesture(title, { x: 200, y: 100 });
    moveGesture(title, { x: 300, y: 200 });
    expect(lastGeometryReport()).toBeNull(); // 拖拽中零上报

    endGesture(title);
    expect(lastGeometryReport()).toMatchObject({ top: 200, left: 300, width: 640, height: 400 });
  });

  it("关闭不上报（壳侧 closePanel/handleFloatingPanelAction 自清镜像）", () => {
    render(<FloatingPanelHost />);
    pushShell(sampleData());
    mockEmit.mockClear();

    pushShell({ open: false });
    expect(lastGeometryReport()).toBeNull();
  });
});

/* ── 语言切换文案重推（refresh——2026-08-22 用户点修③） ── */
describe("语言切换文案重推（refresh）", () => {
  it("refresh:true 重推——更新标题/动作渲染，不抢焦点（首次打开已入焦点）", () => {
    vi.useFakeTimers();
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(() => {});
    try {
      render(<FloatingPanelHost />);
      pushShell(sampleData());
      act(() => { vi.advanceTimersByTime(50); });
      expect(focusSpy).toHaveBeenCalledTimes(1); // I8-8 首次打开入焦点

      // 语言切换 → 壳重推 refresh:true（标题/动作换新语言文案——法文虚构值演「另一种语言」）
      pushShell({
        open: true,
        viewId: "demo-view",
        title: "Démo Vue",
        pluginId: "demo-plugin",
        renderPath: "/@fs/plugins/demo-plugin/src/views/DemoView.tsx",
        actions: [{ id: "close", label: "Fermer", icon: "close" }],
        refresh: true,
      });
      act(() => { vi.advanceTimersByTime(50); });

      expect(screen.getByText("Démo Vue")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Fermer" })).toBeTruthy();
      expect(screen.queryByText("Demo View")).toBeNull();
      expect(screen.queryByRole("button", { name: "Open in Main Window" })).toBeNull();
      expect(focusSpy).toHaveBeenCalledTimes(1); // refresh 重推不抢焦点
    } finally {
      focusSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
