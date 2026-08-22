/**
 * CommandRegistry 多窗口命令路由测试（E5.8#43-4）。
 *
 * 验收核心（§8.6 方案 B 四件套）：
 *   ③ 归属表路由——origin 亲和优先 → 归属表唯一注册者 → 兜底广播（targetWindowId 定向下发）；
 *   ④ executeResult 回执校验——定向发只收目标窗口回执（杜绝模式 B 双执行静默丢）；
 *   归属表维护——unregister 窗口维度摘除（他窗保留）+ purge 窗口关闭清理。
 *
 * 经 executeCommand 触发 executeInPool（私有）——mock window.linkdesk.events.emit 捕获
 * "commands:executeRequest" 载荷校验 targetWindowId；resolvePoolExecution 手动结算防 10s 定时器泄漏。
 * fixture 用明显虚构值（demo-plugin 约定，硬约束 21）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  registerPoolCommandMetadata, resolvePoolExecution, unregisterPoolCommands,
  purgePoolCommandWindows, executeCommand, registerCommand, getCommand, clearCommands,
} from "./CommandRegistry";

/** executeInPool 的 emit 载荷快照——校验路由 targetWindowId */
interface ExecuteRequestPayload {
  requestId: string;
  commandId: string;
  args: unknown[];
  targetWindowId?: string;
}

let emitted: ExecuteRequestPayload[] = [];
const emitMock = vi.fn((channel: string, payload: unknown) => {
  if (channel === "commands:executeRequest") emitted.push(payload as ExecuteRequestPayload);
});

/** 让 executeCommand 的 pre-activate await 让出微任务后 emit 落定 */
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  clearCommands();
  emitted = [];
  emitMock.mockClear();
  // 壳侧执行环境 mock——executeInPool 走 events.emit → 主进程定向广播（本测试只验载荷 targetWindowId）
  (globalThis as { window?: unknown }).window = { linkdesk: { events: { emit: emitMock } } };
});

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("CommandRegistry 归属表路由（E5.8#43-4 ③）", () => {
  it("origin 亲和优先——命令双窗注册 → 路由 origin 窗口（主窗执行主窗那份，确定不随时序）", async () => {
    registerPoolCommandMetadata("demo.cmd", {}, "main");
    registerPoolCommandMetadata("demo.cmd", {}, "detached-w1");
    const p = executeCommand("demo.cmd"); // origin 缺省 main
    await flush();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].targetWindowId).toBe("main");
    resolvePoolExecution(emitted[0].requestId, { result: "main-exec" }, "main");
    await expect(p).resolves.toBe("main-exec");
  });

  it("归属表唯一注册者兜底——origin 不在集 → 定向发唯一注册窗（主窗面板指挥脱出窗命令，#46 回归点）", async () => {
    registerPoolCommandMetadata("demo.cmd", {}, "detached-w1");
    const p = executeCommand("demo.cmd"); // origin 缺省 main
    await flush();
    expect(emitted[0].targetWindowId).toBe("detached-w1");
    resolvePoolExecution(emitted[0].requestId, { result: "detach-exec" }, "detached-w1");
    await expect(p).resolves.toBe("detach-exec");
  });

  it("无注册窗口 → 兜底全池广播（targetWindowId 缺省——主进程按原全池广播）", async () => {
    registerPoolCommandMetadata("demo.cmd", {}); // 仅元数据无窗口归属（loader 声明/旧路径）
    const p = executeCommand("demo.cmd");
    await flush();
    expect(emitted).toHaveLength(1);
    expect(emitted[0].targetWindowId).toBeUndefined();
    resolvePoolExecution(emitted[0].requestId, { result: undefined });
    await p;
  });
});

describe("CommandRegistry executeResult 回执校验（E5.8#43-4 ④）", () => {
  it("定向发只收目标窗口回执——他窗回执静默丢弃，目标窗口回执才 resolve", async () => {
    registerPoolCommandMetadata("demo.cmd", {}, "detached-w1");
    const p = executeCommand("demo.cmd");
    await flush();
    const reqId = emitted[0].requestId;

    resolvePoolExecution(reqId, { result: "wrong-window" }, "main"); // 他窗伪造回执 → 校验不过
    await flush();
    // promise 未结算（pending 仍在）——再发目标窗口回执才 resolve
    resolvePoolExecution(reqId, { result: "ok" }, "detached-w1");
    await expect(p).resolves.toBe("ok");
  });
});

describe("CommandRegistry 归属表维护（E5.8#43-4 ③）", () => {
  it("unregister 窗口维度——摘本窗归属保留他窗注册；末窗摘空整条删除", () => {
    registerPoolCommandMetadata("demo.cmd", {}, "main");
    registerPoolCommandMetadata("demo.cmd", {}, "detached-w1");

    unregisterPoolCommands("demo", "main");
    expect(getCommand("demo.cmd")).toBeDefined(); // 他窗仍注册 → 命令保留（路由仍可达）

    unregisterPoolCommands("demo", "detached-w1");
    expect(getCommand("demo.cmd")).toBeUndefined(); // 末窗摘空 → 整条删除
  });

  it("unregister 旧路径（无 windowId）→ 整条删除（兼容单窗口原语义）", () => {
    registerPoolCommandMetadata("demo.cmd", {}, "main");
    unregisterPoolCommands("demo");
    expect(getCommand("demo.cmd")).toBeUndefined();
  });

  it("purge 窗口关闭——摘除该窗命令归属；他窗命令不受影响", () => {
    registerPoolCommandMetadata("demo.cmd", {}, "detached-w1");
    registerPoolCommandMetadata("demo.other", {}, "detached-w2");

    purgePoolCommandWindows("detached-w1");
    expect(getCommand("demo.cmd")).toBeUndefined();
    expect(getCommand("demo.other")).toBeDefined();
  });

  it("registerCommand 直注册（壳侧）不受归属表影响——execute 走壳侧 handler 不进 executeInPool", async () => {
    let called = 0;
    registerCommand("demo", { id: "demo.local", title: "Demo", handler: async () => { called++; return "shell"; } });
    const result = await executeCommand("demo.local");
    expect(result).toBe("shell");
    expect(called).toBe(1);
    expect(emitted).toHaveLength(0); // 非占位命令 → 壳侧直执行，不转发池
  });
});
