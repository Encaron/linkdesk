/**
 * resolvePluginViewLoader 的边界守卫（#37f / E6#162）——非字符串 pluginId ＋「不在盘上」的回归测试。
 *
 * 背景一（#37f）：2026-09-11~12 的累计日志里出现 `[object Object]` 被当插件 id（六次）——对象从持久化布局
 * DTO 一路流进动态 import。写入者未定位（现场被探针覆盖），但边界守卫保证两件事并可测：
 * ① 坏 id 不再发起 resolvePath / import；② 诊断打出完整 JSON（不是吃成 `[object Object]`）。
 *
 * 背景二（E6#162）：`resolvePath` 是「入口解析」语义，未命中会**回退首根拼一条未必存在的路径**
 * ⇒ 宿主伪身份（app）／壳侧注册 id（workbench、ai-bridge）／退役身份（update）／未安装插件
 * 拼出来的 URL 必然 404，且每次挂载都出声（2026-09-30 实测占 protocol-debug.log 25.6%／33,550 行）。
 * 故 loader 须先过存在性闸（resolveEntry.root）；本文件钉住「不在盘上 ⇒ 不拼 URL、不出声」。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePluginViewLoader } from "./PluginComponent";

function stubLinkdeskPlugins(plugins: Record<string, unknown>): void {
  Object.defineProperty(window, "linkdesk", {
    value: { plugins },
    configurable: true,
    writable: true,
  });
}

describe("resolvePluginViewLoader 边界守卫（#37f）", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
    delete (window as unknown as Record<string, unknown>).linkdesk;
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

  it("不在盘上（resolveEntry.root = null）⇒ 仍返回 loader，但调用得 null module、**不拼**必然 404 的 URL、不出声", async () => {
    const resolvePath = vi.fn(async () => "E:/plugins/ghost");
    stubLinkdeskPlugins({
      resolveEntry: async () => ({ root: null, entry: null, bundle: false }),
      resolvePath,
    });
    const loader = resolvePluginViewLoader("ghost");
    expect(typeof loader).toBe("function");
    // null module（非 throw）——「没有这只插件」是状态不是错误，由 PluginComponent 画「不可用」
    await expect(loader!()).resolves.toBeNull();
    // 🔴 闸的存在理由：没落进「resolvePath 未命中回退首根拼路径」——那正是必然 404 ＋ 每次挂载出声的来源
    expect(resolvePath).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("在盘上 ⇒ 放行（loader 非空）且 root 取 resolveEntry 读数，**不再多问** resolvePath", async () => {
    const resolvePath = vi.fn(async () => "E:/fallback/never");
    const resolveEntry = vi.fn(async () => ({ root: "E:/plugins/demo", entry: "index.bundle.js", bundle: true }));
    stubLinkdeskPlugins({ resolveEntry, resolvePath });
    const loader = resolvePluginViewLoader("demo");
    expect(typeof loader).toBe("function");
    // 触发已放行的异步体：真 import 在 vitest 环境不成立（`/@fs/...` 无此文件），
    // 故此处只钉「正路不被挡」＋「root 来自 resolveEntry」两条读数；import 成败属环境、不在断言范围。
    await loader!().catch(() => undefined);
    expect(resolveEntry).toHaveBeenCalledWith("demo");
    expect(resolvePath).not.toHaveBeenCalled();
  });
});
