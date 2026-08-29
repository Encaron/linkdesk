/**
 * focus-router 聚焦池窗解析单测——E5.8#46.12 Step2 推流默认目标窗决策钉住。
 * 纯函数零 Electron mock——聚焦窗存在 → 该窗；未聚焦/聚焦窗已销毁 → 主池（迟到推流不落空窗）。
 * 测试夹具全用虚构值（硬约束 21：det-1/det-2 非真实窗口 id）。
 */
import { describe, it, expect } from "vitest";
import { resolveFocusedWindowId } from "./focus-router";

describe("resolveFocusedWindowId —— E5.8#46.12 Step2 推流默认目标窗", () => {
  it("聚焦窗存注册表 → 返回该窗（脱出窗 UI 归位）", () => {
    expect(resolveFocusedWindowId("det-1", new Set(["main", "det-1", "det-2"]))).toBe("det-1");
  });

  it("未聚焦（null）→ 主池", () => {
    expect(resolveFocusedWindowId(null, new Set(["main"]))).toBe("main");
  });

  it("聚焦窗已销毁（注册表无此窗）→ 回退主池（迟到推流不落空窗）", () => {
    expect(resolveFocusedWindowId("gone-1", new Set(["main", "det-1"]))).toBe("main");
  });

  it("聚焦窗为空串 → 主池", () => {
    expect(resolveFocusedWindowId("", new Set(["main"]))).toBe("main");
  });
});
