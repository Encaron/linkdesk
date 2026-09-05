/**
 * IpcBridgeHandler UI 域单测——E6#13.5 toast 主动作按钮（缝隙 K1 补齐）。
 * 覆盖：notifications.show 带 actions → 壳 toast 存按钮，点击 runToastAction → executeCommand
 * 真执行（含 args 透传——token 槽位显式 undefined，args 从第三位进 handler）/ 不带 actions →
 * 现状无按钮；error 类 TTL 对齐 TOAST_TTL_ERROR（8000，mockup 帧 3）。
 * fixture 用虚构值（硬约束 21：demo-plugin / demo-plugin.retryInstall / Demo plugin）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleUiMethod } from "./ui";
import { registerCommand, clearCommands } from "../../../registry/commands/CommandRegistry";
import { getToasts, runToastAction, dismissToast, TOAST_TTL_ERROR } from "../../ui/toast";

const PLUGIN = "demo-plugin";

/** 当前推送的 toast 快照（清场后断言用） */
function activeToasts() {
  return getToasts();
}

beforeEach(() => {
  vi.useFakeTimers(); // pushToast 的自动消失 setTimeout 不拖慢/挂住 suite
  clearCommands();
});

afterEach(() => {
  for (const t of getToasts()) dismissToast(t.id);
  vi.clearAllTimers();
  vi.useRealTimers();
  clearCommands();
});

describe("showNotification 主动作按钮（E6#13.5）", () => {
  it("带 actions → toast 存按钮，error 对齐 8000 TTL；点击执行 command（args 透传）", async () => {
    const received: unknown[][] = [];
    let ran = 0;
    registerCommand(PLUGIN, {
      id: "demo-plugin.retryInstall",
      title: "Demo Retry",
      handler: (...args: unknown[]) => {
        ran++;
        received.push(args);
        return Promise.resolve();
      },
    });

    const handle = await handleUiMethod("showNotification", [
      "Demo install failed",
      {
        type: "error",
        actions: [
          { id: "retry", label: "Retry", isPrimary: true, command: "demo-plugin.retryInstall", args: ["http://demo.test/pkg"] },
          { id: "deps", label: "Deps", command: "demo-plugin.retryInstall", args: [] },
        ],
      },
    ]);

    // 非 progress → 无 handle
    expect(handle).toBeUndefined();
    const toasts = activeToasts();
    expect(toasts).toHaveLength(1);
    const t = toasts[0]!;
    // 13.5d：error 类对齐 8000（mockup 帧 3）
    expect(t.severity).toBe("error");
    expect(t.ttl).toBe(TOAST_TTL_ERROR);
    // 13.5c：actions 存为壳 closure（label/isPrimary 透传 + onClick 真函数）
    expect(t.actions).toHaveLength(2);
    expect(t.actions?.[0]).toMatchObject({ label: "Retry", isPrimary: true });
    expect(typeof t.actions?.[0]?.onClick).toBe("function");

    // 点击 [Retry]（主按钮）→ 壳 runToastAction 按位置序号重解析 → 执行命令
    runToastAction(t.id, "0");
    expect(ran).toBe(1);
    // args 从 token 槽位之后进 handler（token 显式 undefined 占位）——漏占位 args[0] 会被剥掉
    expect(received[0]).toEqual(["http://demo.test/pkg"]);
    // 点击后 toast 关闭（对标壳 NotificationItem：onClick 后 dismiss）
    expect(activeToasts().some((x) => x.id === t.id)).toBe(false);
  });

  it("无 actions → 现状无按钮；info 类落默认 TTL", async () => {
    await handleUiMethod("showNotification", ["Demo connected", { type: "info" }]);

    const toasts = activeToasts();
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.severity).toBe("info");
    expect(toasts[0]?.actions).toBeUndefined();
    expect(toasts[0]?.ttl).toBe(6000); // 默认 DEFAULT_TTL，非 error 不对齐 8000
  });

  it("type 非 error/warning → info 兜底", async () => {
    await handleUiMethod("showNotification", ["Demo", { type: "unknown-type" }]);
    expect(activeToasts()[0]?.severity).toBe("info");
  });
});
