/**
 * `check-config-titles` 判据单测——D6 插件侧黄灯腿（配置项短名案，2026-10-04）。
 *
 * 自测口径（⛔ 空转判据 ≠ 零存量）：**真缺 title 的 fixture 必须出黄、齐全 fixture 必须安静**。
 * 纯函数判据——夹具全部内存形态，不落盘。
 */
import { describe, expect, it } from "vitest";
import {
  CONFIG_TITLES_CALIBER,
  collectConfigTitleGaps,
  formatTitleGap,
  titleGapHint,
} from "@linkdesk/plugin-sdk/check-config-titles";

/** 全齐 fixture：title 有、译名在字典、enum 带 enumDescriptions */
const COMPLETE = {
  contributes: {
    configuration: {
      title: "演示",
      properties: {
        "demo.autoSave": {
          type: "string",
          default: "off",
          title: "自动保存",
          enum: ["off", "afterDelay"],
          enumDescriptions: { off: "关闭", afterDelay: "延迟自动" },
        },
        "demo.fontSize": { type: "number", default: 14, title: "字号" },
      },
    },
  },
};

/** 三族全缺 fixture：无 title ＋ enum 裸值（缺译族由 dictKeys 缺失体现） */
const GAPPY = {
  contributes: {
    configuration: {
      title: "演示",
      properties: {
        "demo.autoSave": { type: "string", default: "off", enum: ["off", "on"] },
        "demo.fontSize": { type: "number", default: 14 },
      },
    },
  },
};

describe("collectConfigTitleGaps（三族判据）", () => {
  it("齐全 fixture 必须安静——三族全空、计数对", () => {
    const r = collectConfigTitleGaps(COMPLETE, { dictKeys: new Set(["自动保存", "字号"]) });
    expect(r.hasConfiguration).toBe(true);
    expect(r.scanned.properties).toBe(2);
    expect(r.scanned.enums).toBe(1);
    expect(r.noTitle).toEqual([]);
    expect(r.missingEn).toEqual([]);
    expect(r.missingEnumDescriptions).toEqual([]);
  });

  it("真缺 title 的 fixture 必须出黄（⛔ 空转判据 ≠ 零存量）", () => {
    const r = collectConfigTitleGaps(GAPPY);
    expect(r.noTitle.map((g) => g.key)).toEqual(["demo.autoSave", "demo.fontSize"]);
    expect(r.noTitle.every((g) => typeof g.key === "string")).toBe(true);
  });

  it("② 族：title 不在 dictKeys ⇒ 缺译；dictKeys 不传 ⇒ 族跳过（缺译归 ⑧ 段红管辖）", () => {
    const withDict = collectConfigTitleGaps(COMPLETE, { dictKeys: new Set(["自动保存"]) });
    expect(withDict.missingEn.map((g) => ({ key: g.key, title: g.title }))).toEqual([
      { key: "demo.fontSize", title: "字号" },
    ]);
    expect(collectConfigTitleGaps(COMPLETE).missingEn).toEqual([]);
  });

  it("③ 族：有 enum 缺 enumDescriptions 出黄；空对象/空数组占位同样算缺", () => {
    const r = collectConfigTitleGaps(GAPPY);
    expect(r.missingEnumDescriptions).toEqual([
      { key: "demo.autoSave", group: "", enumCount: 2 },
    ]);
    const placeholder = collectConfigTitleGaps({
      contributes: { configuration: { properties: { "demo.x": { type: "string", default: "a", enum: ["a"], enumDescriptions: {} } } } },
    });
    expect(placeholder.missingEnumDescriptions.map((g) => g.key)).toEqual(["demo.x"]);
  });

  it("无 configuration / 空 properties ⇒ hasConfiguration=false 且三族全空（调用方据此说『无判据对象』）", () => {
    for (const m of [{}, { contributes: {} }, { contributes: { configuration: { properties: {} } } }]) {
      const r = collectConfigTitleGaps(m);
      expect(r.hasConfiguration).toBe(false);
      expect(r.noTitle).toEqual([]);
      expect(r.missingEnumDescriptions).toEqual([]);
      expect(r.scanned.properties).toBe(0);
    }
  });

  it("形状不可信条目（null/数组/标量）剔出判域——E6#151 同口径，不炸不误报", () => {
    const r = collectConfigTitleGaps({
      contributes: { configuration: { properties: { a: null, b: [1, 2], c: "x", "demo.ok": { type: "boolean", default: true, title: "开关" } } } },
    });
    expect(r.scanned.properties).toBe(1);
    expect(r.noTitle).toEqual([]);
  });

  it("空串/纯空白 title = 无 title（占位也算缺）", () => {
    const r = collectConfigTitleGaps({
      contributes: { configuration: { properties: { "demo.x": { type: "string", default: "a", title: "  " } } } },
    });
    expect(r.noTitle.map((g) => g.key)).toEqual(["demo.x"]);
  });
});

describe("文案（两轴同款）", () => {
  it("formatTitleGap 三族各说各话、key 必在行内；titleGapHint 指到落点", () => {
    const noTitle = formatTitleGap("noTitle", { key: "demo.autoSave", group: "" });
    expect(noTitle).toContain("demo.autoSave");
    expect(noTitle).toContain("无 title");
    const missingEn = formatTitleGap("missingEn", { key: "demo.fontSize", group: "字体", title: "字号" });
    expect(missingEn).toContain("字号");
    expect(missingEn).toContain("demo.fontSize");
    const missingEnum = formatTitleGap("missingEnumDescriptions", { key: "demo.autoSave", group: "文件", enumCount: 3 });
    expect(missingEnum).toContain("enumDescriptions");
    expect(missingEnum).toContain("demo.autoSave");
    expect(titleGapHint("noTitle")).toMatch(/i18n\/en\.json/);
    expect(titleGapHint("missingEn")).toMatch(/谁声明谁供译/);
    expect(titleGapHint("missingEnumDescriptions")).toMatch(/enumDescriptions/);
    expect(CONFIG_TITLES_CALIBER).toMatch(/谁的声明谁补名/);
  });
});
