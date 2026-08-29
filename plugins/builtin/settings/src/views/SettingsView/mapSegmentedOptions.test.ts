/**
 * E5.8#99：mapSegmentedOptions 单元测试——分段单选选项映射（短标签/全句 tooltip/缺省回退）。
 */
import { describe, it, expect } from "vitest";
import { mapSegmentedOptions } from "./mapSegmentedOptions";

const t = (k: string) => `TR:${k}`;

describe("mapSegmentedOptions", () => {
  it("enum + enumDescriptions → 短标签（— 前段）+ 全句 tooltip", () => {
    const result = mapSegmentedOptions(
      { enum: ["a", "b"], enumDescriptions: ["Alpha——A full sentence", "Beta—B full"] },
      t,
    );
    expect(result[0]).toEqual({ value: "a", label: "TR:Alpha", title: "TR:Alpha——A full sentence" });
    expect(result[1]).toEqual({ value: "b", label: "TR:Beta", title: "TR:Beta—B full" });
  });

  it("无 enumDescriptions → 回退 t(值)（值即标签，全句同标签）", () => {
    const result = mapSegmentedOptions({ enum: ["x", "y"] }, t);
    expect(result[0]).toEqual({ value: "x", label: "TR:x", title: "TR:x" });
    expect(result[1]).toEqual({ value: "y", label: "TR:y", title: "TR:y" });
  });

  it("无 enum → 空数组（不崩，第三方未声明 enum 时安全）", () => {
    expect(mapSegmentedOptions({}, t)).toEqual([]);
  });
});
