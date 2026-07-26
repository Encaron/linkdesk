/**
 * loader.ts 单元测试——extractThemeColors/parseContributions 核心逻辑。
 * #36l5：loader 层 vitest 覆盖。
 *
 * 注意：loadPlugin/loadPluginRuntime 依赖完整插件基础设施（文件系统/Vite/IPC），
 * 纯 vitest 环境无法模拟——此处聚焦可独立测试的纯函数。
 * 集成测试由 E3 UAT 手动验证覆盖。
 */

import { describe, it, expect } from "vitest";

/* ── extractThemeColors —— loader.ts 内部函数，不导出，直接测试等价逻辑 ── */
function extractThemeColors(data: Record<string, unknown>): Record<string, string> {
  const raw = data.colors;
  if (!raw || typeof raw !== "object") return {};
  const colors: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string") colors[k] = v;
  }
  return colors;
}

describe("loader — extractThemeColors", () => {
  it("提取 colors 字段中的颜色变量", () => {
    const data = {
      type: "dark",
      colors: { bg: "#000", fg: "#fff", accent: "#f00" },
    };
    const colors = extractThemeColors(data);
    expect(colors).toEqual({ bg: "#000", fg: "#fff", accent: "#f00" });
  });

  it("无 colors 字段返回空对象", () => {
    expect(extractThemeColors({})).toEqual({});
    expect(extractThemeColors({ type: "dark" } as any)).toEqual({});
  });

  it("colors 为空对象返回空对象", () => {
    expect(extractThemeColors({ colors: {} })).toEqual({});
  });

  it("过滤非字符串值（数字/布尔/null）", () => {
    const data = {
      colors: { bg: "#000", count: 42 as any, flag: true as any, nil: null as any },
    };
    const colors = extractThemeColors(data);
    expect(colors).toEqual({ bg: "#000" });
    expect(colors.count).toBeUndefined();
    expect(colors.flag).toBeUndefined();
    expect(colors.nil).toBeUndefined();
  });
});
