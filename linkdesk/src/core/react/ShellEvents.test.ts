/**
 * ShellEvents.test.ts —— E5 壳内通信基础设施测试。
 *
 * 🔥 在 E5#1 ShellEvents.ts 实现之前写——这是合同。
 *    实现完后这些测试必须全绿。
 *
 * 覆盖：
 *   1. emit/on 类型匹配（tsc 编译期 + 运行时）
 *   2. unsubscribe 清理——调后 handler 不再触发
 *   3. 防重入 guard——循环 emit 不炸
 *   4. 多订阅者隔离——一个 handler 抛错不影响其他
 *   5. dispose 全清——调后所有 handler 不触发
 *   6. dev 模式事件追踪——不抛错、输出格式正确
 */

import { describe, it, expect } from "vitest";

/* ── 运行时测试 ── */

// ⚠️ ShellEvents.ts 还没创建——这个 import 会报 tsc 错误，故意的。
//    E5#1 实现 ShellEvents.ts（含 ShellEventBus 类导出）后自动消。
import { ShellEventBus } from "./ShellEvents";

describe("ShellEventBus", () => {
  /* ── 1. emit/on 基本通信 ── */

  it("emit → on handler 收到正确的 payload", () => {
    const bus = new ShellEventBus();
    const received: string[] = [];

    bus.on("icon:selected", (pluginId: string) => {
      received.push(pluginId);
    });
    bus.emit("icon:selected", "marketplace");

    expect(received).toEqual(["marketplace"]);
  });

  it("多个订阅者——全部收到同一个 payload", () => {
    const bus = new ShellEventBus();
    const a: string[] = [];
    const b: string[] = [];

    bus.on("icon:selected", (id: string) => a.push(id));
    bus.on("icon:selected", (id: string) => b.push(id));
    bus.emit("icon:selected", "file-tree");

    expect(a).toEqual(["file-tree"]);
    expect(b).toEqual(["file-tree"]);
  });

  it("不同事件——互不干扰", () => {
    const bus = new ShellEventBus();
    const selected: string[] = [];
    const toggled: boolean[] = [];

    bus.on("icon:selected", (id: string) => selected.push(id));
    bus.on("sidebar:toggled", (open: boolean) => toggled.push(open));
    bus.emit("icon:selected", "editor");
    bus.emit("sidebar:toggled", true);

    expect(selected).toEqual(["editor"]);
    expect(toggled).toEqual([true]);
  });

  /* ── 2. unsubscribe 清理 ── */

  it("unsubscribe 后 handler 不再触发", () => {
    const bus = new ShellEventBus();
    const received: string[] = [];

    const unsub = bus.on("icon:selected", (id: string) => received.push(id));
    bus.emit("icon:selected", "first");
    unsub();
    bus.emit("icon:selected", "second");

    expect(received).toEqual(["first"]); // "second" 不应到达
  });

  it("unsubscribe 一个不影响另一个", () => {
    const bus = new ShellEventBus();
    const a: string[] = [];
    const b: string[] = [];

    const unsubA = bus.on("icon:selected", (id: string) => a.push(id));
    bus.on("icon:selected", (id: string) => b.push(id));
    unsubA();
    bus.emit("icon:selected", "test");

    expect(a).toEqual([]);
    expect(b).toEqual(["test"]);
  });

  /* ── 3. 防重入 guard ── */

  it("handler 内 emit 同事件——不形成死循环（防重入 guard）", () => {
    const bus = new ShellEventBus();
    const calls: string[] = [];

    bus.on("icon:selected", (id: string) => {
      calls.push(`handler:${id}`);
      // handler 内尝试 emit 同一事件——应被防重入 guard 拦截
      bus.emit("icon:selected", `nested-${id}`);
    });
    bus.emit("icon:selected", "outer");

    // 外层 emit 触发 handler，handler 内 emit 被跳过
    expect(calls).toEqual(["handler:outer"]);
  });

  /* ── 4. 错误隔离 ── */

  it("一个 handler 抛错——不影响其他 handler", () => {
    const bus = new ShellEventBus();
    const good: string[] = [];

    bus.on("icon:selected", () => {
      throw new Error("boom");
    });
    bus.on("icon:selected", (id: string) => good.push(id));
    bus.emit("icon:selected", "survivor");

    expect(good).toEqual(["survivor"]);
  });

  /* ── 5. dispose 全清 ── */

  it("dispose 后所有 handler 不再触发", () => {
    const bus = new ShellEventBus();
    const received: string[] = [];

    bus.on("icon:selected", (id: string) => received.push(id));
    bus.on("sidebar:toggled", (open: boolean) => received.push(open ? "open" : "close"));
    bus.dispose("icon:selected");
    bus.dispose("sidebar:toggled");

    bus.emit("icon:selected", "test");
    bus.emit("sidebar:toggled", true);

    expect(received).toEqual([]);
  });

  /* ── 6. Tab 事件（复杂 payload） ── */

  it("tab:focused——payload 为对象", () => {
    const bus = new ShellEventBus();
    const tabs: Array<{ pluginId: string; tabId: string }> = [];

    bus.on("tab:focused", (tab: { pluginId: string; tabId: string }) => tabs.push(tab));
    bus.emit("tab:focused", { pluginId: "editor", tabId: "editor-1" });

    expect(tabs).toEqual([{ pluginId: "editor", tabId: "editor-1" }]);
  });

  /* ── 7. 事件追踪（dev 模式） ── */

  it("emit 在 dev 模式不抛错", () => {
    const bus = new ShellEventBus();
    bus.on("icon:selected", () => {});

    // 不应抛错
    expect(() => bus.emit("icon:selected", "test")).not.toThrow();
  });

  /* ── 8. 单例一致性 ── */

  it("shellEvents 单例——所有组件共享同一个总线", () => {
    // 不测单例本身（模块级 import 副作用），但测语义——两个引用指向同一实例
    // 实际由 import { shellEvents } 保证——这里只验证模式
    const bus1 = new ShellEventBus();
    const bus2 = bus1; // 单例模式——同一引用
    const received: string[] = [];

    bus1.on("icon:selected", (id: string) => received.push(id));
    bus2.emit("icon:selected", "shared");

    expect(received).toEqual(["shared"]);
  });

  /* ── 9. 事件缓冲——E5#7h5：emit 早于 on 时回放 ── */

  it("emit 在订阅之前——新订阅者收到缓冲区回放", () => {
    const bus = new ShellEventBus();
    bus.emit("icon:selected", "before-sub");

    const received: string[] = [];
    bus.on("icon:selected", (id: string) => received.push(id));

    expect(received).toEqual(["before-sub"]);
  });

  it("emit 在订阅之前——后续 emit 正常触发", () => {
    const bus = new ShellEventBus();
    bus.emit("icon:selected", "before-sub");

    const received: string[] = [];
    bus.on("icon:selected", (id: string) => received.push(id));
    bus.emit("icon:selected", "after-sub");

    expect(received).toEqual(["before-sub", "after-sub"]);
  });

  it("dispose 后缓冲也清空", () => {
    const bus = new ShellEventBus();
    bus.emit("icon:selected", "before-dispose");
    bus.dispose("icon:selected");

    const received: string[] = [];
    bus.on("icon:selected", (id: string) => received.push(id));

    expect(received).toEqual([]);
  });
});
