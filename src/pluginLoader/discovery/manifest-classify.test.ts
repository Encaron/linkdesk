/**
 * classifyInstallManifest 纯分类器单测——R4-1.2（I16·正典 09 §三·补2）五类回执的 manifest 层判定。
 * validateInstallManifest 是它的抛错皮（既有 loader.test 覆盖文案契约）——本档钉 reason 分类。
 */

import { describe, it, expect } from "vitest";
import { classifyInstallManifest, validateInstallManifest } from "./manifest";

/** 联合窄化助手——断言「拒绝」并取 reason（ok=true 的意外即测红） */
function reasonOf(r: ReturnType<typeof classifyInstallManifest>): string {
  if (r.ok) throw new Error(`期望拒绝，实际 ok（pluginId=${r.pluginId}）`);
  return r.reason;
}

describe("classifyInstallManifest（R4-1.2 五类回执 manifest 层）", () => {
  it("合法最小 manifest ＝ ok（目录名兜底 pluginId）", () => {
    const r = classifyInstallManifest({ version: "1.0.0" }, "demo-plugin");
    expect(r).toEqual({ ok: true, pluginId: "demo-plugin", version: "1.0.0", name: "demo-plugin" });
  });

  it("缺 plugin.json / 非对象 / pluginId 非字符串 / 缺 version ＝ bad-manifest", () => {
    expect(reasonOf(classifyInstallManifest(null, "x"))).toBe("bad-manifest");
    expect(reasonOf(classifyInstallManifest("str", "x"))).toBe("bad-manifest");
    expect(reasonOf(classifyInstallManifest({ pluginId: 42, version: "1.0.0" }, "x"))).toBe("bad-manifest");
    expect(reasonOf(classifyInstallManifest({ pluginId: "x" }, "x"))).toBe("bad-manifest");
    expect(reasonOf(classifyInstallManifest({ pluginId: "x", version: "  " }, "x"))).toBe("bad-manifest");
  });

  it("路径穿越 id / 宿主伪身份 ＝ unsafe-id", () => {
    // SAFE_PLUGIN_ID 形状（路径字符/空白/中文/点开头）
    expect(reasonOf(classifyInstallManifest({ pluginId: "../evil", version: "1.0.0" }, "x"))).toBe("unsafe-id");
    expect(reasonOf(classifyInstallManifest({ pluginId: "a b", version: "1.0.0" }, "x"))).toBe("unsafe-id");
    expect(reasonOf(classifyInstallManifest({ pluginId: ".hidden", version: "1.0.0" }, "x"))).toBe("unsafe-id");
    // 宿主伪身份（形状完全合法——E6#111d 判据 4）
    expect(reasonOf(classifyInstallManifest({ pluginId: "app", version: "1.0.0" }, "x"))).toBe("unsafe-id");
  });

  it("core:true 且 rejectCore ＝ core-forbidden（本地不得自封内置）；缺省不拒（dev 树消毒旧语义）", () => {
    const m = { pluginId: "demo", version: "1.0.0", core: true };
    expect(reasonOf(classifyInstallManifest(m, "demo", { rejectCore: true }))).toBe("core-forbidden");
    expect(classifyInstallManifest(m, "demo")).toEqual({
      ok: true, pluginId: "demo", version: "1.0.0", name: "demo",
    });
  });

  it("validateInstallManifest（抛错皮）与分类器同判——合法/非法两向零漂移", () => {
    expect(validateInstallManifest({ pluginId: "demo", version: "1.0.0", name: "Demo" }, "demo")).toEqual({
      pluginId: "demo", version: "1.0.0", name: "Demo",
    });
    expect(() => validateInstallManifest({ pluginId: "app", version: "1.0.0" }, "demo")).toThrow(/宿主自己的身份/);
    expect(() => validateInstallManifest({ pluginId: "a b", version: "1.0.0" }, "demo")).toThrow(/不合法/);
    expect(() => validateInstallManifest({ pluginId: "demo" }, "demo")).toThrow(/version/);
  });
});
