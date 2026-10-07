/**
 * @vitest-environment jsdom
 *
 * TitleBarZone pin 按钮——**读-改-写**加固的尺子（2026-10-08 实机 bug「置顶点了变置底、之后取消不了」）。
 *
 * 实机现场：置顶偶发「报成功没生效」——主进程发出了 always-on-top-changed(true)（按钮亮成
 * `wc-pin-active`），但窗口并未真置顶。旧实现把 `pinned` 当闩锁，只吃推送 ⇒ 闩锁自此卡在 true，
 * 之后**每次点击都在发 setAlwaysOnTop(false)**：对非置顶窗那是 no-op 且连事件都不发
 * （实测连点 5 次 0 条推送、类名一直 wc-pin-active，重载池页面才复位）⇒ 按钮永久取消不了。
 *
 * 判据（本文件守的就是第一条）：点击发出的目标值必须由 `isAlwaysOnTop()` 的**当前真实态**推导，
 * ⛔ 不看本地闩锁——闩锁说「已置顶」而真实态未置顶时，必须发 **true**，而不是 false。
 *
 * mock `window.linkdesk.window`（preload-pool 同款形状）；i18n 走模块级 init（壳 t() 不参与——
 * 本组件是哑渲染器，tooltip 文本由 layout 传成品）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, screen, waitFor, act } from "@testing-library/react";
import "../../../i18n";
import TitleBarZone from "./TitleBarZone";
import type { TitleBarLayout } from "../../../core/types/pool/poolLayout";

const h = vi.hoisted(() => ({
  setAlwaysOnTop: vi.fn(),
  isAlwaysOnTop: vi.fn(),
  /** 主进程推送的落点——测试冒充壳侧推 alwaysOnTopChange 用 */
  emitAlwaysOnTopChange: null as null | ((p: boolean) => void),
}));

/** 布局快照——只用到 windowControls，其余按最小面填 */
function makeLayout(): TitleBarLayout {
  return {
    title: "LinkDesk",
    logoUrl: "linkdesk://logo.png",
    menuBarVisible: false,
    menuGroups: [],
    slots: { left: [], right: [] },
    windowControls: { minimize: "最小化", maximize: "最大化", restore: "还原", close: "关闭", pin: "置顶", unpin: "取消置顶" },
  };
}

/** 安装 window.linkdesk.window mock——preload-pool 同款形状 */
function installWindowApi(): void {
  Object.defineProperty(window, "linkdesk", {
    value: {
      window: {
        minimize: vi.fn(),
        maximize: vi.fn(),
        unmaximize: vi.fn(),
        close: vi.fn(),
        setAlwaysOnTop: h.setAlwaysOnTop,
        isAlwaysOnTop: h.isAlwaysOnTop,
        onAlwaysOnTopChange: (cb: (p: boolean) => void) => {
          h.emitAlwaysOnTopChange = cb;
          return () => { h.emitAlwaysOnTopChange = null; };
        },
        isMaximized: vi.fn().mockResolvedValue(false),
        onMaximizeChange: () => () => {},
      },
    },
    writable: true,
    configurable: true,
  });
}

describe("TitleBarZone（E5.8#46.18 pin 按钮·读-改-写加固）", () => {
  beforeEach(() => {
    h.setAlwaysOnTop.mockReset();
    h.isAlwaysOnTop.mockReset();
    h.emitAlwaysOnTopChange = null;
    installWindowApi();
  });

  afterEach(() => {
    cleanup();
  });

  it("闩锁说已置顶、真实态未置顶（不同步现场）→ 点击发 true（置顶），⛔ 不发 false", async () => {
    h.isAlwaysOnTop.mockResolvedValue(false); // 窗口真实态：没置顶
    const { container } = render(<TitleBarZone titleBar={makeLayout()} />);
    const btn = container.querySelector<HTMLButtonElement>(".ldk-wc-pin")!;
    await waitFor(() => expect(btn.className).not.toContain("wc-pin-active"));

    // 冒充壳侧那个「假成功」推送——实机 bug 的起点：按钮亮成已置顶，窗口其实没有
    act(() => h.emitAlwaysOnTopChange?.(true));
    await waitFor(() => expect(btn.className).toContain("wc-pin-active"));
    expect(screen.getByLabelText("取消置顶")).toBeTruthy();

    h.setAlwaysOnTop.mockClear();
    fireEvent.click(btn);

    // 🔴 尺子：目标值来自 isAlwaysOnTop()，不是闩锁 —— 必须是 true
    await waitFor(() => expect(h.setAlwaysOnTop).toHaveBeenCalledWith(true));
    expect(h.setAlwaysOnTop).not.toHaveBeenCalledWith(false);
  });

  it("点击后回读落地态 → 按钮不再谎报（不同步只存活到下一次点击）", async () => {
    h.isAlwaysOnTop.mockResolvedValue(false); // 主进程那一下始终没落地
    const { container } = render(<TitleBarZone titleBar={makeLayout()} />);
    const btn = container.querySelector<HTMLButtonElement>(".ldk-wc-pin")!;
    act(() => h.emitAlwaysOnTopChange?.(true));
    await waitFor(() => expect(btn.className).toContain("wc-pin-active"));

    fireEvent.click(btn);
    // 乐观亮起后，与 set 同序的第二次读返回 false（没落地）⇒ 按钮收回「已置顶」
    await waitFor(() => expect(btn.className).not.toContain("wc-pin-active"));
    expect(h.isAlwaysOnTop).toHaveBeenCalledTimes(3); // 挂载 1 + 点击 2（改前读、改后核实）
  });

  it("正常置顶态 → 点击发 false（能取消）", async () => {
    h.isAlwaysOnTop.mockResolvedValue(true); // 窗口真已置顶
    const { container } = render(<TitleBarZone titleBar={makeLayout()} />);
    const btn = container.querySelector<HTMLButtonElement>(".ldk-wc-pin")!;
    await waitFor(() => expect(btn.className).toContain("wc-pin-active"));

    h.setAlwaysOnTop.mockClear();
    fireEvent.click(btn);

    await waitFor(() => expect(h.setAlwaysOnTop).toHaveBeenCalledWith(false));
    expect(h.setAlwaysOnTop).not.toHaveBeenCalledWith(true);
  });

  it("连点两次永不自锁——发 true 再发 false（主进程正常落地时）", async () => {
    let truth = false;
    h.isAlwaysOnTop.mockImplementation(async () => truth);
    h.setAlwaysOnTop.mockImplementation((v: boolean) => { truth = v; });

    const { container } = render(<TitleBarZone titleBar={makeLayout()} />);
    const btn = container.querySelector<HTMLButtonElement>(".ldk-wc-pin")!;
    await waitFor(() => expect(btn.className).not.toContain("wc-pin-active"));

    fireEvent.click(btn);
    await waitFor(() => expect(btn.className).toContain("wc-pin-active"));
    fireEvent.click(btn);
    await waitFor(() => expect(btn.className).not.toContain("wc-pin-active"));

    expect(h.setAlwaysOnTop.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });
});
