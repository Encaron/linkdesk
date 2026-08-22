/**
 * @vitest-environment jsdom
 *
 * ViewTitleActions 测试——E5.8#36.5 视图动作区统一渲染器。
 * 覆盖：无声明渲染 null（右侧空白）/ icon 按钮点击执行 command（含 args 单位置参数）/
 * dropdown chevron 展开 + 条目执行 + 点后关闭 / split 主按钮执行默认 + chevron 展开备选 /
 * split 无 icon 回退文本按钮 / Escape 关闭下拉。
 * mock window.linkdesk.commands（preload-pool 同款形状——池侧注册表优先、壳 IPC fallback）。
 * i18n：import ../../../i18n 模块级 init（lng zh——t(key) 缺表返回 key 原文，显示文本铁律走 key）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup, screen } from "@testing-library/react";
import "../../../i18n";
import ViewTitleActions from "./ViewTitleActions";
import type { TitleActionWidget } from "../../../core/api/types";

const { mockExecuteCommand } = vi.hoisted(() => ({
  mockExecuteCommand: vi.fn(),
}));

/** 安装 window.linkdesk.commands mock——preload-pool 同款形状（executeCommand 先查池侧、壳 IPC fallback） */
function installCommandsApi(): void {
  Object.defineProperty(window, "linkdesk", {
    value: {
      commands: {
        executeCommand: mockExecuteCommand,
      },
    },
    writable: true,
    configurable: true,
  });
}

describe("ViewTitleActions（E5.8#36.5 视图动作区统一渲染器）", () => {
  beforeEach(() => {
    mockExecuteCommand.mockReset();
    installCommandsApi();
  });

  afterEach(() => {
    cleanup();
  });

  it("无声明（actions 空数组）→ 渲染 null（右侧空白——现状保持）", () => {
    const { container } = render(<ViewTitleActions actions={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("icon 按钮——点击执行 command（无 args 裸执行）", () => {
    const actions: TitleActionWidget[] = [
      { type: "icon", id: "clear", command: "demo.clear", icon: "codicon-clear-all", title: "清空输出" },
    ];
    render(<ViewTitleActions actions={actions} />);
    fireEvent.click(screen.getByTitle("清空输出"));
    expect(mockExecuteCommand).toHaveBeenCalledWith("demo.clear");
  });

  it("icon 按钮带 args——单个位置参数透传", () => {
    const actions: TitleActionWidget[] = [
      { type: "icon", id: "add", command: "demo.add", icon: "codicon-add", title: "添加", args: { level: "info" } },
    ];
    render(<ViewTitleActions actions={actions} />);
    fireEvent.click(screen.getByTitle("添加"));
    expect(mockExecuteCommand).toHaveBeenCalledWith("demo.add", { level: "info" });
  });

  it("dropdown——chevron 展开菜单，条目点击执行条目 command + args + 关闭", () => {
    const actions: TitleActionWidget[] = [
      {
        type: "dropdown",
        id: "samples",
        items: [
          { label: "添加信息", command: "demo.add", args: { level: "info" } },
          { label: "添加错误", command: "demo.add", args: { level: "error" } },
        ],
      },
    ];
    render(<ViewTitleActions actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    const item = screen.getByRole("menuitem", { name: "添加信息" });
    fireEvent.click(item);
    expect(mockExecuteCommand).toHaveBeenCalledWith("demo.add", { level: "info" });
    // 点击后关闭——菜单消失
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("split——主按钮执行默认 command，chevron 展开备选 items", () => {
    const actions: TitleActionWidget[] = [
      {
        type: "split",
        id: "new",
        command: "demo.new",
        icon: "codicon-add",
        title: "新建",
        items: [
          { label: "新建输出", command: "demo.newOutput" },
          { label: "新建终端", command: "demo.newTerminal" },
        ],
      },
    ];
    render(<ViewTitleActions actions={actions} />);
    // 主按钮执行默认
    fireEvent.click(screen.getByTitle("新建"));
    expect(mockExecuteCommand).toHaveBeenCalledWith("demo.new");
    // chevron 展开备选
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "新建终端" }));
    expect(mockExecuteCommand).toHaveBeenCalledWith("demo.newTerminal");
  });

  it("split 无 icon——主按钮回退 title 文本按钮", () => {
    const actions: TitleActionWidget[] = [
      {
        type: "split",
        id: "cfg",
        command: "demo.cfg",
        title: "配置",
        items: [{ label: "重载", command: "demo.reload" }],
      },
    ];
    render(<ViewTitleActions actions={actions} />);
    fireEvent.click(screen.getByTitle("配置"));
    expect(mockExecuteCommand).toHaveBeenCalledWith("demo.cfg");
  });

  it("Escape 关闭下拉", () => {
    const actions: TitleActionWidget[] = [
      { type: "dropdown", id: "samples", items: [{ label: "添加信息", command: "demo.add" }] },
    ];
    render(<ViewTitleActions actions={actions} />);
    fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
