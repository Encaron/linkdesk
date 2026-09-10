/**
 * IpcBridgeHandler UI 域单测——E6#13.5 toast 主动作按钮（缝隙 K1 补齐）。
 * 覆盖：notifications.show 带 actions → 壳 toast 存按钮，点击 runToastAction → executeCommand
 * 真执行（含 args 透传——token 槽位显式 undefined，args 从第三位进 handler）/ 不带 actions →
 * 现状无按钮；error 类 TTL 对齐 TOAST_TTL_ERROR（8000，mockup 帧 3）。
 * E6#71i：#71j 延伸——progress handle 经 updateNotification 第三参 percent 写入进度；
 * persistent:true → ttl:0 长驻 + persistent 旗标 + 常驻上限淘汰（TOAST_PERSISTENT_CAP）。
 * fixture 用虚构值（硬约束 21：demo-plugin / demo-plugin.retryInstall / Demo plugin）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { handleUiMethod } from "./ui";
import { registerCommand, clearCommands } from "../../../registry/commands/CommandRegistry";
import { getToasts, runToastAction, dismissToast, TOAST_TTL_ERROR, TOAST_PERSISTENT_CAP } from "../../ui/toast";

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

describe("showNotification E6#71i 进度 + E6#71j 长驻（updateNotification percent / persistent）", () => {
  it("71i：progress → 返回 handle id + toast.progress 置位；updateNotification 第三参 percent 写入", async () => {
    const handle = await handleUiMethod("showNotification", [
      "正在安装 Demo…",
      { type: "info", progress: true },
    ]);
    expect(typeof handle).toBe("string"); // progress → 返回 handle id（非 undefined）
    const t0 = activeToasts().find((x) => x.id === handle);
    expect(t0?.progress).toBe(true);
    expect(t0?.ttl).toBe(0); // 进度条不自动消失

    // 下载段 update(message, 62)——percent 落 toast，消息同步
    await handleUiMethod("updateNotification", [handle, "正在安装 Demo… 62%", 62]);
    const t = activeToasts().find((x) => x.id === handle);
    expect(t?.message).toBe("正在安装 Demo… 62%");
    expect(t?.percent).toBe(62);

    // 阶段离开下载段（如解压中）update 不带 percent → 清确定态（回不定态，防旧百分比冻结成停滞条）
    await handleUiMethod("updateNotification", [handle, "正在安装 Demo…"]);
    const t2 = activeToasts().find((x) => x.id === handle);
    expect(t2?.message).toBe("正在安装 Demo…");
    expect(t2?.percent).toBeUndefined();
  });

  it("71j：persistent:true error → ttl 0 长驻 + persistent 旗标；不带 persistent 的 error 仍 8000", async () => {
    await handleUiMethod("showNotification", ["Demo persistent", { type: "error", persistent: true }]);
    const t = activeToasts()[0]!;
    expect(t.persistent).toBe(true);
    expect(t.ttl).toBe(0); // 长驻 = 不自动消失，等手动点 ×

    // 对照——非 persistent error 维持 8000（13.5d 现状不回归）
    await handleUiMethod("showNotification", ["Demo error", { type: "error" }]);
    const t2 = activeToasts()[1]!;
    expect(t2.persistent).toBe(false);
    expect(t2.ttl).toBe(TOAST_TTL_ERROR);
  });

  it("71j ④：长驻上限淘汰——超 TOAST_PERSISTENT_CAP 条后顶掉最老的 persistent，不碰自动消失 toast", async () => {
    // 先埋一条自动消失（error 8000，非 persistent）——上限淘汰不该动它
    await handleUiMethod("showNotification", ["Auto error", { type: "error" }]);
    // 连续推 CAP+1 条长驻
    for (let i = 0; i <= TOAST_PERSISTENT_CAP; i++) {
      await handleUiMethod("showNotification", [`Persistent ${i}`, { type: "error", persistent: true }]);
    }
    const all = activeToasts();
    const persistent = all.filter((x) => x.persistent);
    expect(persistent).toHaveLength(TOAST_PERSISTENT_CAP);
    // 最老一条被顶掉（Persistent 0 不在），最新的还在
    expect(all.some((x) => x.message === "Persistent 0")).toBe(false);
    expect(all.some((x) => x.message === `Persistent ${TOAST_PERSISTENT_CAP}`)).toBe(true);
    // 自动消失 toast 未被动
    expect(all.some((x) => x.message === "Auto error")).toBe(true);
  });
});
