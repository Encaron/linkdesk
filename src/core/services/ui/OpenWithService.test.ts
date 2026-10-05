/**
 * OpenWithService 动作回执单测——壳侧对面板四个动作的**唯一**执行端。
 *
 * 钉两条 2026-10-05 的口径（都是「坏了不报错」那类）：
 *   ① `searchMarket` 动作**必须收起面板**——原实现只切市场、漏了 hide ⇒ 面板与遮罩压在刚打开的
 *      市场之上，切回来还停在过期空态（用户实测：点了不消失）。除 `setDefault`（有意留开）外，
 *      动作一律收面板——本文件把这条律钉在 searchMarket 与 close 上。
 *   ② 入参归一**丢弃 `anchor`**——面板一律居中（案 03 §3.0′），锚定态废止；字段保留只为兼容
 *      已发布契约面（`OpenWithRequest.anchor` 的 `@deprecated`）。
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  /** 壳 → 池 DTO 通道（`openWith:show`）的 emit 记录 */
  emitSpy: vi.fn(),
  /** 壳内事件总线（`icon:selected` 切市场） */
  shellEmit: vi.fn(),
  getActive: vi.fn<() => string | null>(() => null),
  getDefault: vi.fn<() => string | null>(() => null),
}));

vi.mock("../../react/events/ShellEvents", () => ({ shellEvents: { emit: h.shellEmit } }));
vi.mock("../bootstrap/FactorySlots", () => ({
  factorySlots: { getActive: h.getActive, getDefaultPluginId: h.getDefault },
}));
// 壳暴露面一律取不到 ⇒ assembleHandlers 早退（本文件只测归一化与动作回执，不测装配）
vi.mock("../../api/linkdesk-api/surfaces", () => ({ getShellExposed: () => null }));

import { handleOpenWithAction, showOpenWith } from "./OpenWithService";

/** 面板 DTO 通道名的唯一消费断言点（与壳侧 `OPEN_WITH_SHOW_CHANNEL` 同一字面量） */
const SHOW_CHANNEL = "openWith:show";

beforeEach(() => {
  h.emitSpy.mockClear();
  h.shellEmit.mockClear();
  h.getActive.mockReturnValue(null);
  h.getDefault.mockReturnValue(null);
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    events: { emit: h.emitSpy, on: vi.fn() },
  };
});

describe("handleOpenWithAction——动作一律收面板（除 setDefault）", () => {
  it("searchMarket：切市场 ＋ **收起面板**（修：原漏了 hide，遮罩压在市场上）", async () => {
    h.getActive.mockReturnValue("marketplace");

    await handleOpenWithAction({ type: "searchMarket" });

    expect(h.shellEmit).toHaveBeenCalledWith("icon:selected", "marketplace");
    expect(h.emitSpy).toHaveBeenCalledWith(SHOW_CHANNEL, { open: false });
  });

  it("searchMarket 无市场可用：仍收起面板（动作已交付 ⇒ ⛔ 不留悬空遮罩与过期空态）", async () => {
    await handleOpenWithAction({ type: "searchMarket" });

    expect(h.shellEmit).not.toHaveBeenCalled();
    expect(h.emitSpy).toHaveBeenCalledWith(SHOW_CHANNEL, { open: false });
  });

  it("close：收起面板（回归）", async () => {
    await handleOpenWithAction({ type: "close" });
    expect(h.emitSpy).toHaveBeenCalledWith(SHOW_CHANNEL, { open: false });
  });

  it("非法回执（缺 type / 未知 type）：静默，不改动任何态", async () => {
    await handleOpenWithAction(undefined);
    await handleOpenWithAction({ type: "nope" });
    expect(h.emitSpy).not.toHaveBeenCalled();
    expect(h.shellEmit).not.toHaveBeenCalled();
  });
});

describe("showOpenWith——入参归一（`anchor` 被丢弃）", () => {
  it("带 `anchor` 的请求下发到池时不再含该字段（面板一律居中，案 03 §3.0′）", async () => {
    await showOpenWith({ uri: "C:/demo/样例.txt", anchor: { x: 10, y: 20 } });

    expect(h.emitSpy).toHaveBeenCalledTimes(1);
    const [channel, dto] = h.emitSpy.mock.calls[0] as [
      string,
      { open: boolean; request: Record<string, unknown> },
    ];
    expect(channel).toBe(SHOW_CHANNEL);
    expect(dto.open).toBe(true);
    expect(dto.request).not.toHaveProperty("anchor"); // 🔴 旧实现会原样带上
    expect(dto.request.uri).toBe("C:/demo/样例.txt");
    expect(dto.request.ext).toBe("txt"); // 壳侧统一算扩展名
  });

  it("`uri` 与 `ext` 全缺 ⇒ console.error 出声，不弹空面板", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await showOpenWith({ name: "只有名字" });
      expect(h.emitSpy).not.toHaveBeenCalled();
      expect(err).toHaveBeenCalled();
    } finally {
      err.mockRestore();
    }
  });
});
