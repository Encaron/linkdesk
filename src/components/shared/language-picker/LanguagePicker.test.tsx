/**
 * 归一化夹 02 案·D3 机械锁——语言选择器的「当前生效项」标记走 checked（对勾，与主题/面板选择器同形），
 * ⛔ 不再借 category（注释字段）写「当前」二字。该面此前零测试，错位因此活到今天。
 * 锁 3 条：当前语言 checked===true／其余 checked===false／DTO 不含 category。
 * fixture 用虚构值（硬约束 21：zh / en）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { showSpy } = vi.hoisted(() => ({ showSpy: vi.fn() }));

vi.mock("../../../core/services/ui/QuickPickService", () => ({
  QuickPickService: { show: showSpy, hide: vi.fn() },
}));

vi.mock("../../../core/registry/languages/LanguageRegistry", () => ({
  LanguageRegistry: {
    getAll: () => [
      { id: "zh", label: "中文" },
      { id: "en", label: "English" },
    ],
  },
}));

vi.mock("../../../core/services/configuration/ConfigurationService", () => ({
  getConfigurationValue: (key: string) => (key === "app.language" ? "en" : undefined),
  setConfigurationValue: vi.fn(async () => {}),
}));

import { showLanguagePicker } from "./LanguagePicker";

describe("语言选择器当前项标记（归一化夹 02 案·D3）", () => {
  beforeEach(() => {
    showSpy.mockClear();
  });

  it("锁 3 条：当前语言 checked===true／其余 checked===false／DTO 不含 category", () => {
    showLanguagePicker();
    const opts = showSpy.mock.calls[0]![0] as unknown as {
      serialize: (l: { id: string; label: string }) => { checked?: boolean; category?: string };
    };
    const en = opts.serialize({ id: "en", label: "English" }); // en = app.language 当前值
    const zh = opts.serialize({ id: "zh", label: "中文" });
    expect(en.checked).toBe(true);
    expect(zh.checked).toBe(false);
    expect(en.category).toBeUndefined();
    expect(zh.category).toBeUndefined();
  });

  it("placeholder 仍走显示文本铁律（壳侧 t() 解析）——不变侧", () => {
    showLanguagePicker();
    const opts = showSpy.mock.calls[0]![0] as unknown as { placeholder: string };
    expect(typeof opts.placeholder).toBe("string");
  });
});
