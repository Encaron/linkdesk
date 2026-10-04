/**
 * useOpenPathIntake 单测（E6#46b）。
 *
 * 钉住壳侧 intake 消费的三条判据（都是"写反了也照样能跑"的那种）：
 * ① 路由：有插件关联 → tab:create 带该插件 id；无关联 → 走 `resolveFallbackTabType()` 挂牌兜底
 *   （T7 起壳**不再写死** "editor"——fixture 挂牌者 id 故意不叫 editor，自证去硬编码）；
 * ② 判重语义交给 reduceCreateTab 的身份去重：emit 的是 tab:create（同文件聚焦/新文件新建）
 *   ——**不许改成 tab:openOrFocus**（它只按 type 去重，会聚焦掉别的 editor 标签，真机实证）；
 * ③ 防御：文件已不存在 → 不 emit（静默跳过，launch-args 同口径）。
 * 外加非壳环境退化（无 window.linkdesk.intake ⇒ 不挂订阅，不抛）。
 *
 * fixture 全虚构（硬约束 21）：路径用 tmp 段、扩展名用虚构关联返回值。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

type HookModule = typeof import("./useOpenPathIntake");

interface Stub {
  /** 模拟主进程投递一批文件路径 */
  emit: (paths: string[]) => void;
  /** 当前活着的订阅数（0 = 已退订） */
  subscriberCount: () => number;
}

function installStub(opts: { exists: (p: string) => boolean; pluginFor: (ext: string) => Promise<string> }): Stub {
  let listener: ((paths: string[]) => void) | null = null;
  const shell = {
    onOpenPath: (cb: (paths: string[]) => void) => {
      listener = cb;
      return () => { listener = null; };
    },
  };
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    shell,
    filesystem: { exists: (p: string) => Promise.resolve(opts.exists(p)) },
    fileAssociation: { getPluginFor: (ext: string) => opts.pluginFor(ext) },
  };
  return {
    emit: (paths) => { listener?.(paths); },
    subscriberCount: () => (listener ? 1 : 0),
  };
}

/** T7：兜底 = 「当前激活的 text-fallback 挂牌者」——fixture id 故意不叫 editor（自证壳不写死该 id） */
const FALLBACK_HOLDER = "demo-editor-a";

/** 干净的模块实例 + shellEvents.emit 侦听（壳内事件总线是模块单例，须逐用例重置） */
let mod: HookModule;
let emitted: { type: string; opts: Record<string, unknown> }[];
let fallbackMod: typeof import("../core/services/files/FileAssociationService");

beforeEach(async () => {
  vi.resetModules();
  mod = await import("./useOpenPathIntake");
  fallbackMod = await import("../core/services/files/FileAssociationService");
  const { shellEvents } = await import("../core/react/events/ShellEvents");
  // 挂一个挂牌者（= 装了带 role:"text-fallback" 的编辑器插件）
  fallbackMod.clearFileAssociations();
  fallbackMod.registerFileAssociation({ extension: "zzz", pluginId: FALLBACK_HOLDER, role: "text-fallback" });
  emitted = [];
  vi.spyOn(shellEvents, "emit").mockImplementation(((event: string, payload: never) => {
    if (event === "tab:create") emitted.push(payload);
  }) as typeof shellEvents.emit);
});

afterEach(() => {
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

describe("useOpenPathIntake（E6#46b 壳侧 intake 消费）", () => {
  /** 装壳 + 挂 hook + 投一条路径（`pluginFor` 返回空 ⇒ 走挂牌兜底），返回该次落点 */
  async function emitOneUnassociated(path: string) {
    const stub = installStub({ exists: () => true, pluginFor: async () => "" });
    const { unmount } = renderHook(() => mod.useOpenPathIntake(true));
    await act(async () => { stub.emit([path]); });
    unmount();
    return emitted[0];
  }

  it("有插件关联 → tab:create 带该插件 id + filePath/sourceId/label", async () => {
    const stub = installStub({ exists: () => true, pluginFor: async () => "demo-plugin" });
    const { unmount } = renderHook(() => mod.useOpenPathIntake(true));

    await act(async () => { stub.emit(["/tmp/demo/file.xyz"]); });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe("demo-plugin");
    expect(emitted[0].opts).toMatchObject({
      filePath: "/tmp/demo/file.xyz",
      sourceId: "/tmp/demo/file.xyz",
      label: "file.xyz",
      pinned: true,
    });
    unmount();
  });

  it("无插件关联 → 走挂牌兜底 resolveFallbackTabType()（T7：不写字面量插件 id）", async () => {
    const one = await emitOneUnassociated("/tmp/demo/unknown.zzz");

    expect(emitted).toHaveLength(1);
    expect(one.type).toBe(FALLBACK_HOLDER);
  });

  it("🔴 E22：无任何挂牌者 → welcome 提示页语义（不塞一个不存在的插件）", async () => {
    fallbackMod.clearFileAssociations(); // 编辑器被卸且无别家挂牌
    const one = await emitOneUnassociated("/tmp/demo/unknown.zzz");

    expect(emitted).toHaveLength(1);
    expect(one.type).toBe("welcome");
  });

  it("同批多路径逐条处理；无扩展名 → 直接兜底", async () => {
    const stub = installStub({ exists: () => true, pluginFor: async () => "demo-plugin" });
    const { unmount } = renderHook(() => mod.useOpenPathIntake(true));

    await act(async () => { stub.emit(["/tmp/demo/a.xyz", "/tmp/demo/Makefile"]); });

    expect(emitted).toHaveLength(2);
    expect(emitted[0].type).toBe("demo-plugin");
    expect(emitted[1].type).toBe(FALLBACK_HOLDER);
    unmount();
  });

  it("文件已不存在 → 不 emit（静默跳过）", async () => {
    const stub = installStub({ exists: () => false, pluginFor: async () => "demo-plugin" });
    const { unmount } = renderHook(() => mod.useOpenPathIntake(true));

    await act(async () => { stub.emit(["/tmp/demo/gone.xyz"]); });

    expect(emitted).toHaveLength(0);
    unmount();
  });

  it("🔴 ready 门：未 ready 时不订阅（标签恢复会抹掉提前开的标签）", async () => {
    const stub = installStub({ exists: () => true, pluginFor: async () => "demo-plugin" });
    const { rerender, unmount } = renderHook(({ ready }: { ready: boolean }) => mod.useOpenPathIntake(ready), {
      initialProps: { ready: false },
    });
    expect(stub.subscriberCount()).toBe(0); // 未 ready ⇒ 不订阅（IpcRelay 在 preload 端着缓冲，不丢）
    rerender({ ready: true });
    expect(stub.subscriberCount()).toBe(1);
    unmount();
  });

  it("退订后不再接收；无 shell 面（非壳环境）→ 不挂不抛", async () => {
    const stub = installStub({ exists: () => true, pluginFor: async () => "" });
    const { unmount } = renderHook(() => mod.useOpenPathIntake(true));
    expect(stub.subscriberCount()).toBe(1);
    unmount();
    expect(stub.subscriberCount()).toBe(0);

    delete (window as unknown as { linkdesk?: unknown }).linkdesk;
    expect(() => renderHook(() => mod.useOpenPathIntake(true)).unmount()).not.toThrow();
  });
});
