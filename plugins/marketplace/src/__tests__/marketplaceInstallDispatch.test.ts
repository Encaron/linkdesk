/**
 * 市场安装发起单测——E6#73c 第 2 步（18 档 §五 I.7）。
 *
 * 病根回归钉子：第 1 步前「另一插件安装中」→ `startMarketInstall` **静默 `return false`**，
 * 连点 7 个 = 装 1 丢 6；第 1 步把它换成**串行等待队列**（仍是 N=1）。本步**闸整段拆除**——
 * 并发上限（N=3）、FIFO、同插件去重、槽级看门狗全部归壳侧 `install-queue.ts`。
 * 本档钉住池侧剩下的语义：
 *   1. **没有闸了**——三个不同插件同时点下 = 三次真发起（不再排队，也不再被丢）
 *   2. 同 pluginId 在途去重——只发起一次，两个调用方等同一结果
 *   3. 请求侧身份随行（pluginId / displayName / origin）——壳侧 job 表去重与 job 行取名靠它
 *   4. 用户取消（`cancelled`）**不是失败**——不推 [重试] toast
 *   5. 失败**恰好一条**带 [重试] 的 error toast（壳侧去重命中第二方也不重复推）
 * fixture 全虚构 id（硬约束 21）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

type InstResult = { success: boolean; error?: string; cancelled?: boolean };

type Shown = { message: string; opts?: Record<string, unknown> };

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

/** 每个用例拿**全新**模块实例（在途表 + 调度 guard 都是模块级状态）——stub 只给安装面 / 通知面 / 事件面 */
async function boot(installer: ReturnType<typeof makeInstaller>, shown: Shown[]) {
  vi.resetModules();
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    pluginManager: {
      installWithProgress: installer.installWithProgress,
      list: async () => [],
      getDisabled: async () => [],
    },
    events: { on: () => () => {}, emit: () => {} },
    notifications: {
      show: (message: string, opts?: Record<string, unknown>) => {
        shown.push({ message, opts });
        return { id: "demo-notif", dismiss: () => {} };
      },
    },
  };
  return import("../services/marketplaceShared");
}

beforeEach(() => {
  vi.useFakeTimers(); // 模块顶的启动发现会挂一个 ~10s 定时器（有 notifications.show 即入池门控）——测试里掐掉
  (window as unknown as { linkdesk: unknown }).linkdesk = {};
});
afterEach(() => {
  vi.useRealTimers();
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
});

describe("市场安装发起——闸拆除后（E6#73c 第 2 步）", () => {
  it("没有闸了：三个不同插件同时点下 = 三次真发起（旧行为是第 2、3 个进串行等待）", async () => {
    const installer = makeInstaller();
    const { startMarketInstall } = await boot(installer, []);

    void startMarketInstall("demo-alpha", "https://example.invalid/a.linkdesk-plugin", "Alpha");
    void startMarketInstall("demo-beta", "https://example.invalid/b.linkdesk-plugin", "Beta");
    void startMarketInstall("demo-gamma", "https://example.invalid/c.linkdesk-plugin", "Gamma");

    expect(installer.calls.map((c) => c.url)).toEqual([
      "https://example.invalid/a.linkdesk-plugin",
      "https://example.invalid/b.linkdesk-plugin",
      "https://example.invalid/c.linkdesk-plugin",
    ]);
  });

  it("同 pluginId 在途去重——只发起一次，两个调用方等同一结果", async () => {
    const installer = makeInstaller();
    const { startMarketInstall } = await boot(installer, []);

    const a = startMarketInstall("demo-dup", "https://example.invalid/d.linkdesk-plugin");
    const b = startMarketInstall("demo-dup", "https://example.invalid/d.linkdesk-plugin");
    expect(installer.calls).toHaveLength(1);

    installer.settle[0]({ success: true });
    await expect(a).resolves.toBe(true);
    await expect(b).resolves.toBe(true);

    // 终局后登记出表——再点一次是真发起（不是被旧 promise 永久吞掉）
    void startMarketInstall("demo-dup", "https://example.invalid/d.linkdesk-plugin");
    expect(installer.calls).toHaveLength(2);
  });

  it("请求侧身份随行——pluginId / displayName / origin 一路带到壳（job 表去重 + job 行取名）", async () => {
    const installer = makeInstaller();
    const { startMarketInstall } = await boot(installer, []);

    void startMarketInstall("demo-alpha", "https://example.invalid/a.linkdesk-plugin", "Alpha");
    expect(installer.calls[0].opts).toEqual({ pluginId: "demo-alpha", displayName: "Alpha", origin: "user" });

    // 不传显示名 → 目录未命中时退化为 pluginId（诚实兜底，不留空标题）
    installer.settle[0]({ success: true });
    await Promise.resolve();
    void startMarketInstall("demo-anon", "https://example.invalid/n.linkdesk-plugin");
    expect(installer.calls[1].opts).toEqual({ pluginId: "demo-anon", displayName: "demo-anon", origin: "user" });
  });

  it("用户取消不是失败——返回 false，且**不推** [重试] toast（用户刚亲口说不要）", async () => {
    const installer = makeInstaller();
    const shown: Shown[] = [];
    const { startMarketInstall } = await boot(installer, shown);

    const p = startMarketInstall("demo-alpha", "https://example.invalid/a.linkdesk-plugin", "Alpha");
    installer.settle[0]({ success: false, cancelled: true, error: "已取消安装" });

    await expect(p).resolves.toBe(false);
    expect(shown).toHaveLength(0);
  });

  it("失败恰好一条带 [重试] 的 error toast——同插件两个调用方也只推一条", async () => {
    const installer = makeInstaller();
    const shown: Shown[] = [];
    const { startMarketInstall } = await boot(installer, shown);

    const a = startMarketInstall("demo-alpha", "https://example.invalid/a.linkdesk-plugin", "Alpha");
    const b = startMarketInstall("demo-alpha", "https://example.invalid/a.linkdesk-plugin", "Alpha");
    installer.settle[0]({ success: false, error: "HTTP 404" });

    await expect(a).resolves.toBe(false);
    await expect(b).resolves.toBe(false);
    expect(shown).toHaveLength(1);
    expect(shown[0].opts?.type).toBe("error");
    expect(shown[0].opts?.persistent).toBe(true);
    const actions = shown[0].opts?.actions as Array<{ command?: string }> | undefined;
    expect(actions?.[0]?.command).toBe("marketplace.retryInstall");
  });

  it("一个失败不牵连另一个——并发两单各自收自己的结果", async () => {
    const installer = makeInstaller();
    const { startMarketInstall } = await boot(installer, []);

    const first = startMarketInstall("demo-alpha", "https://example.invalid/a.linkdesk-plugin");
    const second = startMarketInstall("demo-beta", "https://example.invalid/b.linkdesk-plugin");

    installer.settle[0]({ success: false, error: "HTTP 404" });
    installer.settle[1]({ success: true });

    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(true);
  });
});
