/**
 * groupSettingsKeys 单元测试——E5.8#78 组内二级标题归桶逻辑。
 * 纯函数无 DOM——jsdom 环境零依赖，覆盖 5 分节 + 平铺零侵入 + 边界。
 */

import { describe, it, expect } from "vitest";
import { groupSettingsKeys } from "./grouping";

/** 模拟 prop.group 查找——undefined（无 group）归平铺 */
const mkProps = (groups: Record<string, string | undefined>) => (key: string) => groups[key] ?? "";

describe("groupSettingsKeys — E5.8#78 组内二级标题归桶", () => {
  it("有 group 的 key 归到对应桶，无 group 的 key 归平铺桶——顺序保持", () => {
    const buckets = groupSettingsKeys(
      ["app.theme", "app.themeColor", "app.surfaceRadius", "app.mixFont"],
      mkProps({ "app.theme": "整体配方", "app.themeColor": "配色", "app.mixFont": "域混搭" })
    );
    expect(buckets).toEqual([
      { group: "整体配方", keys: ["app.theme"] },
      { group: "配色", keys: ["app.themeColor"] },
      { group: "", keys: ["app.surfaceRadius"] },
      { group: "域混搭", keys: ["app.mixFont"] },
    ]);
  });

  it("同 group 非连续 key 合并进同一桶（保持首次出现顺序）", () => {
    const buckets = groupSettingsKeys(
      ["a", "x", "b", "y"],
      mkProps({ a: "外观", b: "外观", x: "域", y: "域" })
    );
    expect(buckets).toEqual([
      { group: "外观", keys: ["a", "b"] },
      { group: "域", keys: ["x", "y"] },
    ]);
  });

  it("全部无 group → 单平铺桶（渲染端 group===\"\" 不显示标题）", () => {
    const buckets = groupSettingsKeys(["k1", "k2"], () => "");
    expect(buckets).toEqual([{ group: "", keys: ["k1", "k2"] }]);
  });

  it("主题组 6 分节全量归位——每个分节桶 key 正确（E5.8#90：appearanceMode 归整体配方、mixMode/accentMode 已删）", () => {
    const buckets = groupSettingsKeys(
      [
        "app.theme",
        "app.themeColor",
        "app.accentColor",
        "app.appearanceMode",
        "app.surfaceRadius",
        "app.glassBlur",
        "app.glassOpacity",
        "app.glassTint",
        "app.glassSaturate",
        "app.backgroundImage",
        "app.backgroundOpacity",
        "app.backgroundMask",
        "app.fontFamily",
        "app.fontFamilyMono",
        "app.zoneRadius",
        "app.zoneRadiusScale",
        "app.zoneBackgroundImage",
        "app.fontTone",
        "app.mixFont",
        "app.mixRadius",
        "app.mixGlass",
        "app.mixBackground",
        "app.mixSurface",
        "app.mixReset",
      ],
      (k) => {
        if (k === "app.theme" || k === "app.appearanceMode") return "整体配方";
        if (k === "app.themeColor") return "配色";
        if (k === "app.accentColor") return "强调色";
        if (k.startsWith("app.mix")) return "域混搭";
        if (k === "app.fontTone") return "文字";
        return "外观覆盖"; // 其余全归外观覆盖（surfaceRadius → zoneBackgroundImage）
      }
    );
    expect(buckets.map((b) => b.group)).toEqual([
      "整体配方", "配色", "强调色", "外观覆盖", "文字", "域混搭",
    ]);
    expect(buckets[0].keys).toEqual(["app.theme", "app.appearanceMode"]); // 主开关与主题配方同节
    expect(buckets[3].keys).toEqual([
      "app.surfaceRadius", "app.glassBlur", "app.glassOpacity",
      "app.glassTint", "app.glassSaturate",
      "app.backgroundImage", "app.backgroundOpacity", "app.backgroundMask",
      "app.fontFamily", "app.fontFamilyMono",
      "app.zoneRadius", "app.zoneRadiusScale", "app.zoneBackgroundImage",
    ]);
    expect(buckets[4].keys).toEqual(["app.fontTone"]);
    expect(buckets[5].keys).toEqual([
      "app.mixFont", "app.mixRadius", "app.mixGlass",
      "app.mixBackground", "app.mixSurface", "app.mixReset",
    ]);
  });

  it("空输入 → 空数组", () => {
    expect(groupSettingsKeys([], () => "")).toEqual([]);
  });

  it("undefined 组值 → 归平铺桶", () => {
    const buckets = groupSettingsKeys(["k"], () => undefined as unknown as string);
    expect(buckets).toEqual([{ group: "", keys: ["k"] }]);
  });
});
