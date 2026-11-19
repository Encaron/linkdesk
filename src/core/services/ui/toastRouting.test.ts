/**
 * toastRouting 纯函数单测——02-边界清单.md A/B/C 表 B1–B15 全行 + clampTtl 夹取。
 * 正典：底部Toast轻提示/01-API与组件契约.md §三（降级规则）；fixture 全虚构值（硬约束 21）。
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  visualLen,
  decidePresentation,
  clampTtl,
  TOAST_MAX_VISUAL_LEN,
  TOAST_TTL_DEFAULT,
  TOAST_TTL_MIN,
  TOAST_TTL_MAX,
} from "./toastRouting";

afterEach(() => {
  vi.restoreAllMocks();
});

/** 造一条 48/96 视觉宽度的边界文本——中文每字记 2 单位 */
const cn = (units: number) => "测".repeat(units / 2);

describe("visualLen 视觉宽度（B5 中英混排 / B6 emoji）", () => {
  it("ASCII 记 1、CJK 记 2（B5）", () => {
    expect(visualLen("abc")).toBe(3);
    expect(visualLen("测测")).toBe(4);
    expect(visualLen("a测b")).toBe(4);
  });

  it("emoji 记 2（B6——设计稿正则漏了 emoji 区段，按边界正典补齐）", () => {
    expect(visualLen("✓")).toBe(2);
    expect(visualLen("📌装好")).toBe(6);
  });

  it("全角标点记 2（全角形区段 FF00-FFEF）", () => {
    expect(visualLen("（）")).toBe(4);
    // em dash（U+2014，General Punctuation 区）不在宽字符区段 → 记 1（照设计稿 05 正则口径）
    expect(visualLen("——")).toBe(2);
  });
});

describe("decidePresentation 降级路由（01 契约 §三 ①–⑥）", () => {
  it("①severity=error → 一律面板（B12）", () => {
    expect(decidePresentation({ message: "装失败", severity: "error" })).toBe("panel");
  });

  it("②actionCount>1 → 面板（B9：Toast 最多 1 个动作）", () => {
    expect(decidePresentation({ message: cn(20), actionCount: 2 })).toBe("panel");
    expect(decidePresentation({ message: cn(20), actionCount: 1 })).toBe("toast");
    expect(decidePresentation({ message: cn(20), actionCount: 0 })).toBe("toast");
  });

  it("③视觉宽度 >96 → 面板；≤96 可 toast（B1/B2/B3 三道坎）", () => {
    expect(decidePresentation({ message: cn(48) })).toBe("toast"); // 48 = 单行上限
    expect(decidePresentation({ message: cn(96) })).toBe("toast"); // 96 = 两行上限（边界不降）
    expect(decidePresentation({ message: cn(98) })).toBe("panel"); // 98 = 超限整条降级
    expect(visualLen(cn(98))).toBeGreaterThan(TOAST_MAX_VISUAL_LEN);
  });

  it("④显式换行 >2 行 → 面板（B4）；两行换行合法", () => {
    expect(decidePresentation({ message: "一\n二\n三" })).toBe("panel");
    expect(decidePresentation({ message: "一\n二" })).toBe("toast");
  });

  it("⑤ttl ≥8000 → 面板（B14）；7999 不降", () => {
    expect(decidePresentation({ message: cn(20), ttl: 8000 })).toBe("panel");
    expect(decidePresentation({ message: cn(20), ttl: 7999 })).toBe("toast");
  });

  it("⑥其余 → toast（缺省 severity=info、无动作、短文本）", () => {
    expect(decidePresentation({ message: "已复制链接" })).toBe("toast");
    expect(decidePresentation({ message: "检查完成", severity: "success" })).toBe("toast");
    expect(decidePresentation({ message: "来源已停用", severity: "warning" })).toBe("toast");
  });

  it("B13：未知 severity 按 info 处理并 console.warn（不静默吞）", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(decidePresentation({ message: cn(20), severity: "fatal" as string })).toBe("toast");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain("fatal");
  });

  it("error 恒压过一切——即便文本短、无动作（B12 判据在先）", () => {
    expect(decidePresentation({ message: "短", severity: "error", actionCount: 0, ttl: 1500 })).toBe("panel");
  });
});

describe("clampTtl 夹取（B15）", () => {
  it("undefined/NaN → 缺省 3000", () => {
    expect(clampTtl(undefined)).toBe(TOAST_TTL_DEFAULT);
    expect(clampTtl(Number.NaN)).toBe(TOAST_TTL_DEFAULT);
  });

  it("区间内原样通过", () => {
    expect(clampTtl(3000)).toBe(3000);
    expect(clampTtl(TOAST_TTL_MIN)).toBe(TOAST_TTL_MIN);
    expect(clampTtl(TOAST_TTL_MAX)).toBe(TOAST_TTL_MAX);
  });

  it("越界夹取：负数/过小 → 1500；过大 → 10000", () => {
    expect(clampTtl(-1)).toBe(TOAST_TTL_MIN);
    expect(clampTtl(500)).toBe(TOAST_TTL_MIN);
    expect(clampTtl(99999)).toBe(TOAST_TTL_MAX);
  });
});
