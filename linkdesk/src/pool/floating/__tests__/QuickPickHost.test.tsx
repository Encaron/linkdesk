/**
 * @vitest-environment jsdom
 *
 * E5.7#63：QuickPickHost 插件 quickPick 本地桥 + 壳推送回归。
 * 覆盖：pluginItemToDto 映射 / 插件请求渲染 + Enter resolve 原对象（身份保持）/
 * Escape resolve(undefined) / last-wins 顶替 / 壳推送顶掉插件 / 壳模式动作回传回归。
 *
 * mock window.linkdesk.quickPickHost（preload 同款形状）——组件只消费此命名空间。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, act, screen } from "@testing-library/react";
import QuickPickHost, { pluginItemToDto } from "../QuickPickHost";
import type { PluginQuickPickRequest } from "../../../core/types/poolQuickPick";

/* ── mock window.linkdesk.quickPickHost —— preload-pool 同款形状 ── */

type HostFn = (req: PluginQuickPickRequest, resolve: (item: unknown) => void) => void;
type ShowCb = (data: { open: boolean; placeholder?: string; prefix?: string; items: Array<{ key: string; searchText: string; label: string }> }) => void;

const { mockSelect, mockClose } = vi.hoisted(() => ({
  mockSelect: vi.fn(),
  mockClose: vi.fn(),
}));

let hostFn: HostFn | null = null;
let onShowCb: ShowCb | null = null;

function installQuickPickHostApi(): void {
  hostFn = null;
  onShowCb = null;
  Object.defineProperty(window, "linkdesk", {
    value: {
      quickPickHost: {
        registerHost: (fn: HostFn) => {
          hostFn = fn;
          return () => { hostFn = null; };
        },
        onShow: (cb: ShowCb) => {
          onShowCb = cb;
          return () => { onShowCb = null; };
        },
        select: (...args: unknown[]) => mockSelect(...args),
        highlight: () => {},
        close: (...args: unknown[]) => mockClose(...args),
        itemAction: () => {},
      },
    },
    writable: true,
    configurable: true,
  });
}

function showPlugin(opts: PluginQuickPickRequest["opts"]): Promise<unknown> {
  let resolveFn!: (item: unknown) => void;
  const result = new Promise<unknown>((res) => { resolveFn = res; });
  act(() => {
    hostFn!({ opts }, resolveFn);
  });
  return result;
}

function pushShell(data: Parameters<ShowCb>[0]): void {
  act(() => {
    onShowCb!(data);
  });
}

function getInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector(".quick-pick-input") as HTMLInputElement;
}

/* ── 模拟 rAF —— 入场动画 effect 依赖（InlineInput.test 同款） ── */

const rafCallbacks: Array<(t: number) => void> = [];
const origRAF = globalThis.requestAnimationFrame;
const origCAF = globalThis.cancelAnimationFrame;

beforeEach(() => {
  installQuickPickHostApi();
  mockSelect.mockClear();
  mockClose.mockClear();
  rafCallbacks.length = 0;
  globalThis.requestAnimationFrame = (cb: (t: number) => void) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length - 1;
  };
  globalThis.cancelAnimationFrame = (id: number) => { rafCallbacks[id] = () => {}; };
});

afterEach(() => {
  cleanup();
  globalThis.requestAnimationFrame = origRAF;
  globalThis.cancelAnimationFrame = origCAF;
});

/* ── pluginItemToDto 纯函数 ── */

describe("pluginItemToDto", () => {
  it("label/description/detail 三字段映射 + searchText 合并 + key = 原数组 index", () => {
    const dto = pluginItemToDto({ label: "选项A", description: "描述", detail: "细节" }, 3);
    expect(dto).toEqual({
      key: "3",
      searchText: "选项A 描述 细节",
      label: "选项A",
      category: "描述",
      detail: "细节",
    });
  });

  it("缺省字段——searchText 只含 label，category/detail undefined", () => {
    const dto = pluginItemToDto({ label: "只有标签" }, 0);
    expect(dto.searchText).toBe("只有标签");
    expect(dto.category).toBeUndefined();
    expect(dto.detail).toBeUndefined();
  });
});

/* ── 插件请求本地桥 ── */

describe("插件 quickPick 本地桥", () => {
  it("show → 渲染条目 + placeholder，Enter resolve 原对象（身份保持，非序列化副本）", async () => {
    const items = [
      { label: "选项A", description: "描述A" },
      { label: "选项B" },
    ];
    const { container } = render(<QuickPickHost />);
    const result = showPlugin({ items, placeholder: "选一个" });

    expect(screen.getByText("选项A")).toBeTruthy();
    expect(screen.getByText("选项B")).toBeTruthy();
    expect(getInput(container).placeholder).toBe("选一个");

    fireEvent.keyDown(getInput(container), { key: "Enter" });
    expect(await result).toBe(items[0]); // 原对象身份
    // 插件选择器关闭——面板消失
    expect(container.querySelector(".quick-pick-panel")).toBeNull();
  });

  it("Escape → resolve(undefined)，面板消失", async () => {
    const { container } = render(<QuickPickHost />);
    const result = showPlugin({ items: [{ label: "选项A" }] });
    fireEvent.keyDown(getInput(container), { key: "Escape" });
    expect(await result).toBeUndefined();
    expect(container.querySelector(".quick-pick-panel")).toBeNull();
  });

  it("last-wins——新 show() 顶掉旧请求：旧 resolve(undefined)，新请求照常解析", async () => {
    render(<QuickPickHost />);
    const itemsA = [{ label: "旧请求" }];
    const itemsB = [{ label: "新请求" }];
    const resultA = showPlugin({ items: itemsA });
    const resultB = showPlugin({ items: itemsB });

    expect(await resultA).toBeUndefined();
    expect(screen.getByText("新请求")).toBeTruthy();
    expect(screen.queryByText("旧请求")).toBeNull();

    const input = document.querySelector(".quick-pick-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await resultB).toBe(itemsB[0]);
  });

  it("壳推送 open:true 顶掉插件请求（resolve undefined + 渲染壳数据）", async () => {
    render(<QuickPickHost />);
    const result = showPlugin({ items: [{ label: "插件项" }] });
    expect(screen.getByText("插件项")).toBeTruthy();

    pushShell({
      open: true,
      placeholder: "壳占位",
      items: [{ key: "shell-1", searchText: "壳命令", label: "壳命令" }],
    });

    expect(await result).toBeUndefined();
    expect(screen.getByText("壳命令")).toBeTruthy();
    expect(screen.queryByText("插件项")).toBeNull();
  });

  it("插件展示期间壳推 open:false——只清壳数据，不打断插件渲染", async () => {
    render(<QuickPickHost />);
    const result = showPlugin({ items: [{ label: "插件项" }] });
    pushShell({ open: false, items: [] });

    // 插件面板仍渲染（不被壳退场动画波及）
    expect(screen.getByText("插件项")).toBeTruthy();

    const input = document.querySelector(".quick-pick-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });
    expect(await result).toBeUndefined();
    // 插件关闭后回落到壳数据——壳已是关闭态，面板消失
    expect(document.querySelector(".quick-pick-panel")).toBeNull();
  });

  it("插件选择后回落到壳数据——壳仍在展示则复现壳条目", async () => {
    render(<QuickPickHost />);
    pushShell({
      open: true,
      placeholder: "",
      items: [{ key: "shell-1", searchText: "壳命令", label: "壳命令" }],
    });
    expect(screen.getByText("壳命令")).toBeTruthy();

    const items = [{ label: "插件项" }];
    const result = showPlugin({ items });
    expect(screen.getByText("插件项")).toBeTruthy();

    const input = document.querySelector(".quick-pick-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Enter" });
    expect(await result).toBe(items[0]);
    // 回落壳数据
    expect(screen.getByText("壳命令")).toBeTruthy();
  });
});

/* ── 壳推送模式回归（E5.7#15 行为不变） ── */

describe("壳推送模式回归", () => {
  it("push 渲染 + Enter → select(key) 回传壳", () => {
    render(<QuickPickHost />);
    pushShell({
      open: true,
      placeholder: "壳占位",
      items: [{ key: "shell-1", searchText: "壳命令", label: "壳命令" }],
    });

    const input = document.querySelector(".quick-pick-input") as HTMLInputElement;
    expect(input.placeholder).toBe("壳占位");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockSelect).toHaveBeenCalledWith("shell-1");
  });

  it("Escape → close() 回传壳", () => {
    render(<QuickPickHost />);
    pushShell({
      open: true,
      placeholder: "",
      items: [{ key: "shell-1", searchText: "壳命令", label: "壳命令" }],
    });

    const input = document.querySelector(".quick-pick-input") as HTMLInputElement;
    fireEvent.keyDown(input, { key: "Escape" });
    expect(mockClose).toHaveBeenCalled();
  });
});
