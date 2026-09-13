/**
 * resolvePluginViewLoader 的边界守卫（#37f）——非字符串 pluginId 的回归测试。
 *
 * 背景：2026-09-11~12 的累计日志里出现 `[object Object]` 被当插件 id（六次）——对象从持久化布局
 * DTO 一路流进动态 import。写入者未定位（现场被探针覆盖），但边界守卫保证两件事并可测：
 * ① 坏 id 不再发起 resolvePath / import；② 诊断打出完整 JSON（不是吃成 `[object Object]`）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePluginViewLoader } from "./PluginComponent";

describe("resolvePluginViewLoader 边界守卫（#37f）", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("对象 pluginId ⇒ 返回 null、不发起加载，诊断含非法标记与完整 JSON（不是 [object Object]）", () => {
    const loader = resolvePluginViewLoader({ evil: true } as unknown as string);
    expect(loader).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const [msg, detail] = errorSpy.mock.calls[0];
    expect(String(msg)).toContain("pluginId 非法");
    // 🔴 这条是本守卫的存在理由：诊断里必须能看见对象内容，而不是被模板串吃成 [object Object]
    expect(JSON.stringify(detail)).toContain("evil");
  });

  it("空串 pluginId ⇒ 同样拒绝", () => {
    expect(resolvePluginViewLoader("")).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("合法 id + URL renderPath ⇒ 正常返回 loader，不出声", () => {
    const loader = resolvePluginViewLoader("demo-plugin", "/@fs/E:/x/demo/src/view.tsx");
    expect(typeof loader).toBe("function");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
