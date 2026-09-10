/**
 * IpcBridge 请求超时策略测试——E6#74。
 *
 * 缺陷背景（E6#71k 实机 CDP 验证抓到）：确认卡停留 > 10s 再点「确认安装」= **静默不装**——
 * 统一 10s 请求超时打在 `dialog:confirmContent` 上，而该通道的语义就是「等用户回答」。
 * 修法 = 立「用户阻塞通道」名单，名单内不设超时；未决请求兜底靠既有 dispose()。
 *
 * 纯桥测：vi.mock("electron") 捕 ipcMain.handle/on（不透真 Electron）；mainWindow/windowManager
 * 用最小桩。fixture 全虚构值（硬约束 21）。
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

vi.mock("electron", () => ({
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
  },
}));

import { ipcMain } from "electron";
import { IpcBridge } from "./ipc-bridge";
import { IPC } from "./channels";

const handleMock = ipcMain.handle as unknown as ReturnType<typeof vi.fn>;
const onMock = ipcMain.on as unknown as ReturnType<typeof vi.fn>;

/** 壳响应通道监听器（构造函数注册）——测试直接调它模拟壳回答 */
let responseListener: ((_e: unknown, payload: { requestId: string; result?: unknown; error?: string }) => void) | null = null;
/** 桥发给壳的请求载荷（取 requestId 用） */
let sentRequests: Array<{ requestId: string; channel: string }> = [];

const mainWindow = {
  isDestroyed: () => false,
  webContents: {
    send: vi.fn((channel: string, payload: { requestId?: string; channel?: string }) => {
      if (channel === IPC.bridge.request && payload?.requestId) {
        sentRequests.push({ requestId: payload.requestId, channel: payload.channel ?? "" });
      }
    }),
  },
};

const windowManager = {
  getWindowIdByWebContents: () => "main",
  getPoolViewByWindowId: () => null,
  getPoolView: () => null,
  getAllPoolViews: () => [],
};

/** 建桥 + 取某个代理通道的 ipcMain.handle 回调 */
function makeBridge(): { bridge: IpcBridge; handlerFor: (channel: string) => (...args: unknown[]) => Promise<unknown> } {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
  handleMock.mockImplementation((channel: string, fn: (...args: unknown[]) => Promise<unknown>) => {
    handlers.set(channel, fn);
  });
  const bridge = new IpcBridge(mainWindow as never, windowManager as never);
  return {
    bridge,
    handlerFor: (channel: string) => {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`未登记代理通道: ${channel}`);
      return fn;
    },
  };
}

/** 跟踪 Promise 的结算状态（不 await——超时断言要求「仍未结算」） */
function track<T>(p: Promise<T>): { state: () => string } {
  let state = "pending";
  void p.then(
    () => { state = "resolved"; },
    () => { state = "rejected"; },
  );
  return { state: () => state };
}

describe("IpcBridge 请求超时策略（E6#74）", () => {
  beforeAll(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    onMock.mockImplementation((channel: string, fn: unknown) => {
      if (channel === IPC.bridge.response) responseListener = fn as typeof responseListener;
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    sentRequests = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("用户阻塞通道（confirmContent）60s 不结算——等用户回答无期", async () => {
    const { handlerFor } = makeBridge();
    const p = handlerFor(IPC.dialog.confirmContent)({}, { content: { pluginId: "demo-plugin", renderPath: "views/demo.js" } });
    const t = track(p);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.state()).toBe("pending");

    // 壳回答后才结算（迟到的回答不是死请求）
    responseListener?.({}, { requestId: sentRequests[0]!.requestId, result: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(t.state()).toBe("resolved");
    await expect(p).resolves.toBe(true);
  });

  it("用户阻塞通道三成员全覆盖（confirm / alert / confirmContent）", async () => {
    const { handlerFor } = makeBridge();
    for (const channel of [IPC.dialog.confirm, IPC.dialog.alert, IPC.dialog.confirmContent]) {
      const p = handlerFor(channel)({}, "示例文案");
      const t = track(p);
      await vi.advanceTimersByTimeAsync(30 * 60_000); // 半小时
      expect(t.state(), `${channel} 不应超时`).toBe("pending");
      responseListener?.({}, { requestId: sentRequests.at(-1)!.requestId, result: true });
      await vi.advanceTimersByTimeAsync(0);
      expect(t.state(), `${channel} 应被迟到回答结算`).toBe("resolved");
    }
  });

  it("普通通道仍 10s 超时（防壳无应答的兜底不丢）", async () => {
    const { handlerFor } = makeBridge();
    const p = handlerFor(IPC.config.get)({}, "app.uiFontScale");
    const t = track(p);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(t.state()).toBe("pending");

    await vi.advanceTimersByTimeAsync(1);
    expect(t.state()).toBe("rejected");
    await expect(p).rejects.toThrow(/请求超时: config:get/);
  });

  it("dispose() 仍拒绝未决请求——用户阻塞通道的兜底路径", async () => {
    const { bridge, handlerFor } = makeBridge();
    const p = handlerFor(IPC.dialog.confirmContent)({}, { content: { pluginId: "demo-plugin" } });
    const t = track(p);

    await vi.advanceTimersByTimeAsync(120_000);
    expect(t.state()).toBe("pending");

    bridge.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.state()).toBe("rejected");
    await expect(p).rejects.toThrow(/应用退出/);
  });

  it("迟到回答不发二次结算——先 dispose 后到的壳响应被安全忽略", async () => {
    const { bridge, handlerFor } = makeBridge();
    const p = handlerFor(IPC.dialog.confirm)({}, "示例文案");
    const t = track(p);
    const requestId = sentRequests[0]!.requestId;

    bridge.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.state()).toBe("rejected");

    expect(() => responseListener?.({}, { requestId, result: true })).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.state()).toBe("rejected"); // 不翻案
  });
});
