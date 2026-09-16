/**
 * @vitest-environment jsdom
 *
 * E6#71c：DialogHost 富内容槽（content 模式）回归——content present 时面板改渲染
 * PluginComponent（壳不持渲染器），title/message/默认双钮被内容槽替代；弹窗机制（居中/
 * 遮罩/Esc/trap）不变。文字模式零回归——Enter→confirm 只在无 content 时注册（有 content 时
 * 早退，避免内容按钮/链接 Enter 双触发）。jsdom 下 PluginComponent mock 成确定性桩——
 * 本测试只验 DialogHost chrome 与槽接线，不碰动态 import。
 *
 * mock window.linkdesk.dialogHost（preload-pool 同款形状：onShow/confirm/cancel）。
 * fixture 全虚构（硬约束 21）：插件名/文案用 demo、Demo 等明显虚构字样，不指向真实插件/真实 UI 文案。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act, screen } from "@testing-library/react";
import DialogHost from "./DialogHost";
import type { PoolDialogData } from "../../../core/types/pool/poolDialog";

// PluginComponent 确定性桩——只验 DialogHost 把 content.pluginId/renderPath 接线给它
vi.mock("../../shared/plugin-component/PluginComponent", () => ({
  default: ({ pluginId, renderPath }: { pluginId: string; renderPath: string }) => (
    <div data-testid="dialog-content-plugin">
      {pluginId} :: {renderPath}
    </div>
  ),
}));

/* ── mock window.linkdesk.dialogHost —— preload-pool 同款形状 ── */

type ShowCb = (data: PoolDialogData) => void;

const { mockConfirm, mockCancel } = vi.hoisted(() => ({
  mockConfirm: vi.fn(),
  mockCancel: vi.fn(),
}));

let onShowCb: ShowCb | null = null;

function installDialogApi(): void {
  onShowCb = null;
  Object.defineProperty(window, "linkdesk", {
    value: {
      dialogHost: {
        onShow: (cb: ShowCb) => {
          onShowCb = cb;
          return () => { onShowCb = null; };
        },
        confirm: (...args: unknown[]) => mockConfirm(...args),
        cancel: (...args: unknown[]) => mockCancel(...args),
      },
    },
    writable: true,
    configurable: true,
  });
}

/** 文字模式样例——title/message/双钮（虚构文案）。 */
function textData(): PoolDialogData {
  return {
    open: true,
    title: "Demo Confirm",
    message: "Proceed with demo-gizmo install?",
    confirmLabel: "Proceed",
    cancelLabel: "Abort",
    isAlert: false,
  };
}

/** 富内容样例——content 槽（虚构插件/视图/renderPath）。 */
function contentData(): PoolDialogData {
  return {
    open: true,
    title: "Demo Confirm",
    message: "Proceed with demo-gizmo install?",
    confirmLabel: "Proceed",
    cancelLabel: "Abort",
    isAlert: false,
    content: {
      pluginId: "demo-plugin-a",
      renderPath: "/@fs/plugins/demo-plugin-a/src/views/ConfirmDemo.tsx",
      payload: { demo: true },
    },
  };
}

function pushShell(data: PoolDialogData): void {
  act(() => {
    onShowCb!(data);
  });
}

function getPanel(container: HTMLElement): HTMLElement {
  return container.querySelector(".ldk-dialog-host-panel") as HTMLElement;
}

function getBackdrop(): HTMLElement {
  // E5.8#107 浮层权威：遮罩 portal 出 container（createPortal → scrim-plane/body 兜底）——查 document
  return document.querySelector(".ldk-dialog-host-backdrop") as HTMLElement;
}

beforeEach(() => {
  installDialogApi();
  mockConfirm.mockClear();
  mockCancel.mockClear();
});

afterEach(() => {
  cleanup();
});

/* ── 富内容槽（E6#71c）── */

describe("富内容槽（content 模式，E6#71c）", () => {
  it("content present → 面板带 --content 修饰类，槽接线 PluginComponent（pluginId/renderPath 透传）", () => {
    const { container } = render(<DialogHost />);
    pushShell(contentData());

    const panel = getPanel(container);
    expect(panel.className).toContain("ldk-dialog-host-panel--content");
    expect(screen.getByTestId("dialog-content-plugin").textContent).toBe(
      "demo-plugin-a :: /@fs/plugins/demo-plugin-a/src/views/ConfirmDemo.tsx"
    );
  });

  it("content 模式替代文字 chrome——title/message/默认双钮不渲染", () => {
    render(<DialogHost />);
    pushShell(contentData());

    expect(screen.queryByText("Demo Confirm")).toBeNull();
    expect(screen.queryByText("Proceed with demo-gizmo install?")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull(); // 内容自带按钮——壳不画默认双钮
  });

  it("content 模式遮罩仍在——backdrop 点击 → cancel", () => {
    render(<DialogHost />);
    pushShell(contentData());

    fireEvent.click(getBackdrop());
    expect(mockCancel).toHaveBeenCalledTimes(1);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("content 模式 Esc 仍关（非 alert）——cancel", () => {
    render(<DialogHost />);
    pushShell(contentData());

    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it("content 模式 Enter 不 auto-confirm（内容自带按钮/链接——防双触发）", () => {
    const { container } = render(<DialogHost />);
    pushShell(contentData());

    fireEvent.keyDown(getPanel(container), { key: "Enter" });
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(mockCancel).not.toHaveBeenCalled();
  });
});

/* ── 文字模式零回归 ── */

describe("文字模式零回归（无 content）", () => {
  it("title/message/取消+确认双钮渲染（非 alert）", () => {
    render(<DialogHost />);
    pushShell(textData());

    expect(screen.getByText("Demo Confirm")).toBeTruthy();
    expect(screen.getByText("Proceed with demo-gizmo install?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Proceed" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Abort" })).toBeTruthy();
  });

  it("确认按钮 → confirm；取消按钮 → cancel", () => {
    render(<DialogHost />);
    pushShell(textData());

    fireEvent.click(screen.getByRole("button", { name: "Proceed" }));
    expect(mockConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Abort" }));
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it("Enter → confirm（文字模式唯一 auto-confirm 面）；Esc → cancel", () => {
    const { container } = render(<DialogHost />);
    pushShell(textData());

    fireEvent.keyDown(getPanel(container), { key: "Enter" });
    expect(mockConfirm).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it("backdrop 点击 → cancel（非 alert）", () => {
    render(<DialogHost />);
    pushShell(textData());

    fireEvent.click(getBackdrop());
    expect(mockCancel).toHaveBeenCalledTimes(1);
  });

  it("open:false 关闭——返回 null 零 DOM", () => {
    const { container } = render(<DialogHost />);
    pushShell(textData());
    expect(getPanel(container)).toBeTruthy();

    pushShell({ open: false });
    expect(container.querySelector(".ldk-dialog-host-panel")).toBeNull();
    expect(document.querySelector(".ldk-dialog-host-backdrop")).toBeNull();
  });
});
