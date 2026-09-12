/**
 * update-handlers 装配 + 通道接线单测——E6#57.8。
 *
 * 被测的是**装配本身**（#57.4 状态机 + 三条腿 + 启动复位接成一个可用服务），不是状态机/腿的算法
 * ——那些各自有单测（`update-service.test.ts` / `update-source.test.ts` / `update-download.test.ts` /
 * `update-install.test.ts`）。这里逐条钉住 `update-handlers.ts` 文件头那四条防线：
 *   ① **装配序**：`initUpdateService()` 排在清理腿之后（由 main 的启动序保证，本文件钉「装配做了什么」）
 *   ② **异步读盘 → 同步 `resume` 闭包**：盘上写一份真记录，装配后状态机必须真落在该落的态
 *   ③ 🔴 **漏接线要炸在启动时**：未装配就注册 → 抛，且不留下半注册的通道（不许静默降级成「没有更新」）
 *   ④ **回调重绑在 once-guard 之前** + 广播频道的 `storeForReplay` 取舍（`progress` 必须 false）
 * 另钉一条**曾经的「没做」**：`update.getReleaseNotes` 本格不注册（#57.8e 之前）——通道常量在、
 * 但不注册空壳，于是「注册的恰好是四条」是一条**有意**的断言。✅ 2026-09-13 `#57.8e` 落地时
 * **它如约变红**，改成五条（这条断言存在的全部意义就在这一次红——它挡住的是「有个通道但没人实现」
 * 的静默死代码）。
 *
 * 测试手法（对标 `filesystem-guard.test.ts` / `serial-service.test.ts`）：`vi.resetModules()` + 动态
 * `import` ——**模块级单例**（`service` / `_registered`）用例间互不污染；electron 桩用文件内
 * `vi.hoisted`（`electron-mock.ts` 那份是两条网络腿专用面，这里要的是 `ipcMain.handle` 捕获）。
 * 全部 fixture 为虚构值（版本 `1.2.3`/`9.9.9`，URL `example.invalid`；硬约束 21）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// 🔴 桩必须先于 SUT：`vi.hoisted` + `vi.mock` 由 vitest 提升到模块顶，动态 import 时才拿得到它。
// `broadcastCalls` 记 `IpcBridge.active.broadcast` 的实参（本文件把 ipc-bridge 整个换成假实例——
// 被测的是 handler 传了什么，投递本身是 IpcBridge 自己的事）。
const stub = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const broadcastCalls: unknown[][] = [];
  /** 发行说明取数腿收到的实参——**本文件不出真网**，只钉 handler 传了什么（见下方那条收窄用例） */
  const releaseNotesCalls: unknown[][] = [];
  const app = {
    version: "1.2.3", // = loadProduct().version（唯一运行时版本源）——复位判据「我现在跑在哪个版本」
    userData: "",
    getVersion: () => app.version,
    getPath: (name: string) => {
      if (name !== "userData") throw new Error(`用例未预期的 app.getPath(${name})`);
      return app.userData;
    },
    relaunch: () => {},
    quit: () => {},
    exit: () => {},
  };
  return {
    app,
    handlers,
    broadcastCalls,
    releaseNotesCalls,
    ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => handlers.set(channel, fn) },
    // 本文件的用例一律不出网——真调用了要立刻炸，不能靠「恰好没调到」
    net: { fetch: () => { throw new Error("本用例不该出网"); } },
  };
});
vi.mock("electron", () => stub);
vi.mock("../ipc-bridge.js", () => ({
  IpcBridge: { active: { broadcast: (...args: unknown[]) => stub.broadcastCalls.push(args) } },
}));
// 发行说明取数腿换成记账替身——本文件测的是**接线**（通道注册 + 参数收窄），取数算法在
// `update-release-notes.test.ts` 里对着真本地 HTTP 服务测（两件事分开，失败时才知道坏在哪）。
vi.mock("../../services/update-release-notes.js", () => ({
  fetchReleaseNotes: (...args: unknown[]) => {
    stub.releaseNotesCalls.push(args);
    return Promise.resolve({
      source: "network",
      version: NEXT,
      publishedAt: "2026-09-12T00:00:00Z",
      body: "# fixture",
      htmlUrl: "https://example.invalid/releases/tag/v9.9.9",
      historical: [],
    });
  },
}));

import { IPC } from "../channels.js";
import type { UpdateInfo, UpdateState } from "../../../src/core/types/ipc/update";

const CURRENT = "1.2.3";
const NEXT = "9.9.9";

let dir: string;
let svcMod: typeof import("../../services/update-service.js");
let dlMod: typeof import("../../services/update-download.js");
let installMod: typeof import("../../services/update-install.js");
let mod: typeof import("./update-handlers.js");

/** 取通道 handler 并调用——走的就是渲染进程 `ipcRenderer.invoke` 那条路（`loggedHandle` 包过一层） */
function invoke(channel: string, ...args: unknown[]): unknown {
  const fn = stub.handlers.get(channel);
  if (!fn) throw new Error(`通道未注册: ${channel}`);
  return fn({ sender: null }, ...args);
}

function makeInfo(): UpdateInfo {
  return {
    version: NEXT,
    currentVersion: CURRENT,
    publishedAt: "2026-09-12T00:00:00Z",
    releaseNotesUrl: "https://example.invalid/releases/tag/v9.9.9",
    downloadUrl: "https://example.invalid/linkdesk-update-9.9.9.exe",
    checksum: "a".repeat(64),
    size: 1000,
  };
}

/** 盘上摆一份「上次正在装」的现场（真走生产写盘路径——装配读到的就是它写的） */
async function givenPendingRecord(): Promise<void> {
  await installMod.writePendingInstall({
    type: "updating",
    update: makeInfo(),
    installerPath: dlMod.installerPathFor(NEXT),
    startedAt: "2026-09-12T01:02:03.000Z",
  });
}

/** 盘上再摆一份安装器本体（`ready` 支要求「安装器还在，且文件名版本 == 记录目标」） */
function givenInstallerFile(): void {
  const p = dlMod.installerPathFor(NEXT);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "fixture");
}

beforeEach(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "ld-update-handlers-"));
  stub.app.userData = dir;
  stub.app.version = CURRENT;
  stub.handlers.clear();
  stub.broadcastCalls.length = 0;

  vi.resetModules(); // 模块级单例（service / _registered）重置——每个用例一份干净装配
  svcMod = await import("../../services/update-service.js");
  dlMod = await import("../../services/update-download.js");
  installMod = await import("../../services/update-install.js");
  mod = await import("./update-handlers.js");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("③ 漏接线要炸在启动时——不许静默降级成「没有可安装的更新」", () => {
  it("未装配就注册 → 抛，且不留下半注册的通道", () => {
    expect(() => mod.registerUpdateHandlers()).toThrow(/更新服务未装配/);
    expect([...stub.handlers.keys()]).toEqual([]);
  });
});

describe("② 异步读盘 → 同步 resume 闭包：盘上的事实决定启动态", () => {
  it("记录在 + 安装器在 → 落 ready（update 全量还原，等用户再点）", async () => {
    await givenPendingRecord();
    givenInstallerFile();

    await mod.initUpdateService();
    mod.registerUpdateHandlers();

    const state = (await invoke(IPC.update.getState)) as UpdateState;
    expect(state.type).toBe("ready");
    expect(state.type === "ready" && state.update).toEqual(makeInfo());
  });

  it("记录在 + 安装器不在 → 落 idle + install-interrupted（不是 ready——盘上没有可装的东西）", async () => {
    await givenPendingRecord();

    await mod.initUpdateService();
    mod.registerUpdateHandlers();

    const state = (await invoke(IPC.update.getState)) as UpdateState;
    expect(state.type).toBe("idle");
    // 🔴 是 `install-interrupted`（不是腿里的 `interrupted`）——本用例正是**装配层**的哨兵：
    //    壳侧只取 `resolution.resume`、`outcome` 被丢弃，所以「启动未完成」这件事**只能靠码**
    //    从主进程走到渲染进程；码一旦退回 `interrupted`，壳的迁移驱动那条路就不再出声，
    //    用户下次启动零通知（2026-09-12 拆码，见 useUpdateNotifications.test.ts ③ 组）。
    expect(state.type === "idle" && state.lastError?.code).toBe("install-interrupted");
    // `update` 保留：知道有哪个版本，只是这次没装成（同 quitAndInstall 失败路径）
    expect(state.type === "idle" && state.update?.version).toBe(NEXT);
  });

  it("没有记录 → 不碰状态机（交回正常初始化，resume 返回 null）", async () => {
    await mod.initUpdateService();
    mod.registerUpdateHandlers();

    const state = (await invoke(IPC.update.getState)) as UpdateState;
    expect(["idle", "disabled"]).toContain(state.type);
  });

  it("装配幂等——第二次 init 不重读盘、不重造服务（内存态不被盘上后来的变化覆盖）", async () => {
    await givenPendingRecord();
    givenInstallerFile();
    await mod.initUpdateService();

    // 盘上现场清空（等价于「用户手动把安装器删了」）——第二次装配若重读，ready 会被打回 idle
    fs.rmSync(installMod.pendingInstallPath());
    fs.rmSync(dlMod.installerPathFor(NEXT));

    await mod.initUpdateService();
    mod.registerUpdateHandlers();

    const state = (await invoke(IPC.update.getState)) as UpdateState;
    expect(state.type).toBe("ready");
  });
});

describe("通道面——注册的恰好是五条（#57.8e 落地后 getReleaseNotes 入列）", () => {
  it("注册五条命令通道；再来一次不重复注册", async () => {
    await mod.initUpdateService();
    mod.registerUpdateHandlers();

    expect([...stub.handlers.keys()].sort()).toEqual(
      [
        IPC.update.getState,
        IPC.update.checkForUpdates,
        IPC.update.downloadUpdate,
        IPC.update.quitAndInstall,
        IPC.update.getReleaseNotes,
      ].sort(),
    );
    // 🔴 五条与 `channels.ts` 里 `update` 命名空间的**命令**常量一一对应——多一条（注册了没有
    // 实现 = 死代码 + 到不了的通道）或少一条（有常量没人实现）都在这里当场红。

    mod.registerUpdateHandlers(); // once-guard
    expect(stub.handlers.size).toBe(5);
  });

  // `version` 的收窄与 `context === true` 同款：**透给取数腿的只可能是字符串或 undefined**。
  // 为什么这条值得钉：取数腿里 `normalizeTag(version)` 直接 `.trim()`——收窄漏了的话，
  // 渲染侧传个数字进来就是一条 `TypeError` 穿透到 invoke reject（而不是一条能看懂的失败）。
  it("`version` 收窄：非字符串/空串/缺省 ⇒ 一律按「不传 = 最近一版」，不把垃圾透给取数腿", async () => {
    await mod.initUpdateService();
    mod.registerUpdateHandlers();

    await invoke(IPC.update.getReleaseNotes, "9.9.9");
    await invoke(IPC.update.getReleaseNotes, 42);
    await invoke(IPC.update.getReleaseNotes, "");
    await invoke(IPC.update.getReleaseNotes);

    expect(stub.releaseNotesCalls).toEqual([["9.9.9"], [undefined], [undefined], [undefined]]);
  });

  it("`context` 严格收窄到 `=== true`——非布尔真值按「后台检查」处理", async () => {
    await mod.initUpdateService();
    const spy = vi.spyOn(svcMod.UpdateService.prototype, "checkForUpdates").mockResolvedValue({ type: "idle" });
    mod.registerUpdateHandlers();

    await invoke(IPC.update.checkForUpdates, "yes"); // 真值但非布尔 → 保守那一侧
    expect(spy).toHaveBeenLastCalledWith(false);

    await invoke(IPC.update.checkForUpdates, true);
    expect(spy).toHaveBeenLastCalledWith(true);

    await invoke(IPC.update.checkForUpdates); // 缺省（旧壳/漏传）→ 后台
    expect(spy).toHaveBeenLastCalledWith(false);
  });
});

describe("④ 回调接线——每次注册重绑最新 IpcBridge，广播取舍逐条钉住", () => {
  it("stateChanged 全量态进重放缓冲；progress 明确不进（重放一个过期的 50% = 假进度）", async () => {
    await mod.initUpdateService();
    const spy = vi.spyOn(svcMod.UpdateService.prototype, "setCallbacks");
    mod.registerUpdateHandlers();

    const cbs = spy.mock.calls.at(-1)?.[0];
    expect(cbs).toBeDefined();

    const state: UpdateState = { type: "available", update: makeInfo() };
    cbs?.onStateChanged?.(state);
    expect(stub.broadcastCalls.at(-1)).toEqual([IPC.update.stateChanged, state, "shell"]);

    const progress = { transferred: 1, total: 2, percent: 50 };
    cbs?.onProgress?.(progress);
    expect(stub.broadcastCalls.at(-1)).toEqual([IPC.update.progress, progress, "shell", false]);
  });

  it("重绑在 once-guard 之前——通道已注册后再调一次，回调仍换新（壳崩重建路径）", async () => {
    await mod.initUpdateService();
    const spy = vi.spyOn(svcMod.UpdateService.prototype, "setCallbacks");
    mod.registerUpdateHandlers();
    mod.registerUpdateHandlers(); // 第二次：通道不重注册，但回调必须重绑

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
