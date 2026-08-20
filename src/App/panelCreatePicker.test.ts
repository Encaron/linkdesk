/**
 * showPanelCreatePicker 测试——E5.8#32 底部面板 [+] 视图选择器。
 * 覆盖：容器序 × 全量视图（含隐藏）两级展平 / 已激活项勾选标记 / 隐藏视图选中自动恢复可见 /
 * getKey = viewId 全局唯一键。
 * ViewContainerService mock 共享于 viewContainerMocks.ts（#34.5 归一化去重）。
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { setVisibleMock, seedViewContainerMocks } from "./viewContainerMocks";

const { showMock } = vi.hoisted(() => ({ showMock: vi.fn() }));

vi.mock("../core/services/ui/QuickPickService", () => ({
  QuickPickService: { show: showMock },
}));

vi.mock("../i18n", () => ({ default: { t: (s: string) => s } }));

import { showPanelCreatePicker } from "./panelCreatePicker";

/** 捕获 QuickPickService.show 入参——QuickPickState<PanelPickItem> */
function captureShow(): Record<string, unknown> {
  return showMock.mock.calls[0][0] as Record<string, unknown>;
}

describe("showPanelCreatePicker（E5.8#32）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedViewContainerMocks();
  });

  it("数据源两级展平——容器序 × 全量视图（含已隐藏视图），非仅活跃", () => {
    showPanelCreatePicker(vi.fn(), { current: null });
    const st = captureShow();
    const items = st.items as Array<{ viewId: string; visible: boolean }>;
    expect(items).toHaveLength(3);
    expect(items.map((it) => it.viewId)).toEqual(["problems", "output", "terminal"]);
    // 隐藏视图也进列表（选中可恢复可见）
    expect(items.find((it) => it.viewId === "output")?.visible).toBe(false);
    expect(st.placeholder).toBe("选择要在面板显示的视图");
    expect(st.prefix).toBe(">");
  });

  it("serialize——已激活项 checked:true，其余 false；隐藏视图 category 标「已隐藏」", () => {
    showPanelCreatePicker(vi.fn(), { current: "problems" });
    const st = captureShow();
    const items = st.items as Array<Record<string, unknown>>;
    const serialize = st.serialize as (it: Record<string, unknown>) => Record<string, unknown>;

    const probs = serialize(items[0]);
    expect(probs.checked).toBe(true);
    expect(probs.label).toBe("问题");
    expect(probs.category).toBe("linter · 面板");

    const output = serialize(items[1]);
    expect(output.checked).toBe(false);
    expect(output.category).toBe("已隐藏");
  });

  it("onSelect——激活视图切换；隐藏视图选中自动恢复可见", () => {
    const setActive = vi.fn();
    showPanelCreatePicker(setActive, { current: "problems" });
    const st = captureShow();
    const items = st.items as Array<{ viewId: string; containerId: string; visible: boolean }>;
    const onSelect = st.onSelect as (it: (typeof items)[number]) => void;

    // 选中可见视图——不调 setVisible
    onSelect(items[0]);
    expect(setVisibleMock).not.toHaveBeenCalled();
    expect(setActive).toHaveBeenCalledWith("problems");

    // 选中隐藏视图 → 恢复可见 + 切换激活
    onSelect(items[1]);
    expect(setVisibleMock).toHaveBeenCalledWith("panel-main", "output", true);
    expect(setActive).toHaveBeenCalledWith("output");
  });

  it("getKey = viewId——全局唯一键（池动作重解析 key）", () => {
    showPanelCreatePicker(vi.fn(), { current: null });
    const st = captureShow();
    const items = st.items as Array<{ viewId: string }>;
    const getKey = st.getKey as (it: { viewId: string }) => string;
    expect(getKey(items[1])).toBe("output");
  });
});
