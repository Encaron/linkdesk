/**
 * 市场安装队列单测——E6#73c 第 1 步（18 档 §五 I.7）。
 *
 * 病根回归钉子：此前「另一插件安装中」→ `startMarketInstall` **静默 `return false`**（不打日志、不弹 toast、
 * 不改 UI），而两个调用方都把返回值丢了 ⇒ 连点 7 个 = 装 1 丢 6，用户以为没点中。本档钉住替换后的语义：
 *   1. 第 2 单不再被丢——进等待队列，第 1 单装完按序接手（**仍是 N=1 串行**，不是并发）
 *   2. 同 pluginId 去重——点两下 = 一次安装，两个调用方等同一结果
 *   3. 等待快照 = 队首之外的条目（队首正在跑，由会话表达）
 *   4. 请求侧身份随行（pluginId / displayName / origin）——壳侧 job 表去重与 job 行取名靠它
 *   5. 单次失败不淤死死队列（后续照常接手）
 * fixture 全虚构 id（硬约束 21）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

type InstResult = { success: boolean; error?: string };

/** 可控安装桩——每次调用挂起，由测试自己决定何时 resolve（模拟「装到一半」） */
function makeInstaller() {
  const calls: Array<{ url: string; opts?: Record<string, unknown> }> = [];
  const settle: Array<(r: InstResult) => void> = [];
  const installWithProgress = vi.fn((url: string, opts?: Record<string, unknown>) => {
    calls.push({ url, opts });
    return new Promise<InstResult>((resolve) => settle.push(resolve));
  });
  return { calls, settle, installWithProgress };
}

/** 每个用例拿**全新**模块实例（队列是模块级状态）——stub 只给安装面与列表面 */
async function bootQueue(installer: ReturnType<typeof makeInstaller>) {
  vi.resetModules();
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    pluginManager: { installWithProgress: installer.installWithProgress, list: async () => [], getDisabled: async () => [] },
    events: { on: () => () => {}, emit: () => {} },
  };
  return import("../services/marketplaceShared");
}

/** 让泵的 await 链跑完（队列接手发生在 microtask 里） */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

beforeEach(() => {
  (window as unknown as { linkdesk: unknown }).linkdesk = {};
});
afterEach(() => {
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
});

describe("市场安装队列——等待不再等于丢弃（E6#73c 第 1 步）", () => {
  it("第 2 单不再被静默丢掉：进等待队列，第 1 单装完按序接手（仍是 N=1）", async () => {
    const installer = makeInstaller();
    const { startMarketInstall, getPendingInstalls } = await bootQueue(installer);

    const first = startMarketInstall("demo-alpha", "https://example.invalid/a.linkdesk-plugin", "Alpha");
    const second = startMarketInstall("demo-beta", "https://example.invalid/b.linkdesk-plugin", "Beta");
    expect(installer.calls.map((c) => c.url)).toEqual(["https://example.invalid/a.linkdesk-plugin"]);
    expect(getPendingInstalls()).toEqual(["demo-beta"]);

    installer.settle[0]({ success: true });
    await flush();
    expect(installer.calls.map((c) => c.url)).toEqual([
      "https://example.invalid/a.linkdesk-plugin",
      "https://example.invalid/b.linkdesk-plugin",
    ]);
    expect(getPendingInstalls()).toEqual([]);

    installer.settle[1]({ success: true });
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(true);
  });

  it("同 pluginId 去重——点两下 = 一次安装，两个调用方等同一结果", async () => {
    const installer = makeInstaller();
    const { startMarketInstall } = await bootQueue(installer);

    const a = startMarketInstall("demo-dup", "https://example.invalid/d.linkdesk-plugin");
    const b = startMarketInstall("demo-dup", "https://example.invalid/d.linkdesk-plugin");
    expect(installer.calls).toHaveLength(1);

    installer.settle[0]({ success: true });
    await expect(a).resolves.toBe(true);
    await expect(b).resolves.toBe(true);
  });

  it("请求侧身份随行——pluginId / displayName / origin 一路带到壳（job 表去重 + job 行取名）", async () => {
    const installer = makeInstaller();
    const { startMarketInstall } = await bootQueue(installer);

    void startMarketInstall("demo-alpha", "https://example.invalid/a.linkdesk-plugin", "Alpha");
    expect(installer.calls[0].opts).toEqual({ pluginId: "demo-alpha", displayName: "Alpha", origin: "user" });

    // 不传显示名 → 目录未命中时退化为 pluginId（诚实兜底，不留空标题）
    installer.settle[0]({ success: true });
    await flush();
    void startMarketInstall("demo-anon", "https://example.invalid/n.linkdesk-plugin");
    expect(installer.calls[1].opts).toEqual({ pluginId: "demo-anon", displayName: "demo-anon", origin: "user" });
  });

  it("单次失败不淤死队列——后续条目照常接手", async () => {
    const installer = makeInstaller();
    const { startMarketInstall } = await bootQueue(installer);

    const first = startMarketInstall("demo-alpha", "https://example.invalid/a.linkdesk-plugin");
    const second = startMarketInstall("demo-beta", "https://example.invalid/b.linkdesk-plugin");

    installer.settle[0]({ success: false, error: "HTTP 404" });
    await flush();
    expect(installer.calls).toHaveLength(2); // 第 1 个失败不阻塞第 2 个

    installer.settle[1]({ success: true });
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
  });

  it("装完回归空闲——队列清空后新单立刻开跑，不残留等待态", async () => {
    const installer = makeInstaller();
    const { startMarketInstall, getPendingInstalls } = await bootQueue(installer);

    const first = startMarketInstall("demo-alpha", "https://example.invalid/a.linkdesk-plugin");
    installer.settle[0]({ success: true });
    await expect(first).resolves.toBe(true);
    expect(getPendingInstalls()).toEqual([]);

    void startMarketInstall("demo-gamma", "https://example.invalid/c.linkdesk-plugin");
    expect(installer.calls).toHaveLength(2);
    expect(installer.calls[1].url).toBe("https://example.invalid/c.linkdesk-plugin");
    expect(getPendingInstalls()).toEqual([]);
  });
});
