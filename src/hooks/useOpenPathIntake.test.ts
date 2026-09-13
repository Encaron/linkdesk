/**
 * useOpenPathIntake 单测（E6#46b）。
 *
 * 钉住壳侧 intake 消费的三条判据（都是"写反了也照样能跑"的那种）：
 * ① 路由：有插件关联 → tab:openOrFocus 带该插件 id；无关联 → 走 DEFAULT_TAB_TYPE
 *   （E5#99 编辑器兜底同源，不许出现字面量插件 id——硬约束 10）；
 * ② 判重语义交给 openOrFocus：emit 的是 tab:openOrFocus 而非 tab:create（双开同一文件
 *   = 聚焦既有标签，#46b 判据）；
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

/** 干净的模块实例 + shellEvents.emit 侦听（壳内事件总线是模块单例，须逐用例重置） */
let mod: HookModule;
let emitted: { type: string; opts: Record<string, unknown> }[];

beforeEach(async () => {
  vi.resetModules();
  mod = await import("./useOpenPathIntake");
  const { shellEvents } = await import("../core/react/events/ShellEvents");
  emitted = [];
  vi.spyOn(shellEvents, "emit").mockImplementation(((event: string, payload: never) => {
    if (event === "tab:openOrFocus") emitted.push(payload);
  }) as typeof shellEvents.emit);
});

afterEach(() => {
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

const DEFAULT_TYPE = "editor"; // DEFAULT_TAB_TYPE 政策常量的现行值——用例断言它兜底生效

describe("useOpenPathIntake（E6#46b 壳侧 intake 消费）", () => {
  it("有插件关联 → tab:openOrFocus 带该插件 id + filePath/sourceId/label", async () => {
    const stub = installStub({ exists: () => true, pluginFor: async () => "demo-plugin" });
    const { unmount } = renderHook(() => mod.useOpenPathIntake());

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

  it("无插件关联 → 走 DEFAULT_TAB_TYPE 编辑器兜底（不写字面量插件 id 的开关在壳政策常量）", async () => {
    const stub = installStub({ exists: () => true, pluginFor: async () => "" });
    const { unmount } = renderHook(() => mod.useOpenPathIntake());

    await act(async () => { stub.emit(["/tmp/demo/unknown.zzz"]); });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].type).toBe(DEFAULT_TYPE);
    unmount();
  });

  it("同批多路径逐条处理；无扩展名 → 直接兜底", async () => {
    const stub = installStub({ exists: () => true, pluginFor: async () => "demo-plugin" });
    const { unmount } = renderHook(() => mod.useOpenPathIntake());

    await act(async () => { stub.emit(["/tmp/demo/a.xyz", "/tmp/demo/Makefile"]); });

    expect(emitted).toHaveLength(2);
    expect(emitted[0].type).toBe("demo-plugin");
    expect(emitted[1].type).toBe(DEFAULT_TYPE);
    unmount();
  });

  it("文件已不存在 → 不 emit（静默跳过）", async () => {
    const stub = installStub({ exists: () => false, pluginFor: async () => "demo-plugin" });
    const { unmount } = renderHook(() => mod.useOpenPathIntake());

    await act(async () => { stub.emit(["/tmp/demo/gone.xyz"]); });

    expect(emitted).toHaveLength(0);
    unmount();
  });

  it("退订后不再接收；无 shell 面（非壳环境）→ 不挂不抛", async () => {
    const stub = installStub({ exists: () => true, pluginFor: async () => "" });
    const { unmount } = renderHook(() => mod.useOpenPathIntake());
    expect(stub.subscriberCount()).toBe(1);
    unmount();
    expect(stub.subscriberCount()).toBe(0);

    delete (window as unknown as { linkdesk?: unknown }).linkdesk;
    expect(() => renderHook(() => mod.useOpenPathIntake()).unmount()).not.toThrow();
  });
});
