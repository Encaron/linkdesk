/**
 * update-install 安装腿 + 启动复位单测——E6#57.7。
 *
 * mock electron（`update-install.ts` 顶部 `import { app }`）——桩**不真退出**，只记账：
 * 本腿全部编排面（拉起 / 退出 / 兜底）都可注入，测试里给记录调用序的替身。
 *
 * 逐条对判据（清单 5.4 轮 `#57.7` 的「验证」行）：
 *   1. 🔴 **落盘先于拉起安装器**（③）：断言「拉起那一刻盘上已有记录」（不是「两个都发生了」）。
 *   2. 🔴 **成功路径不返回**（④）：`quit()` 之后 promise 永不 settle——返回就会被状态机判成契约违反，
 *      用户看到一次并不存在的失败。
 *   3. 🔴 **`/S` 而不是 `--updated`**（②）：安装器参数与 execPath 逐字符钉住。
 *   4. 🔴 **三支复位判据**（#57.7a 判据 1/3）：装成功（版本相等）销账 / 还能装 → `ready` /
 *      没了 → `idle + interrupted`。**主判据是「我现在跑在哪个版本」**——只看「安装器在不在」
 *      会把成功报成中断（装成功后它正是同版残留，会被清理腿删掉）。
 *   5. 🔴 **白名单**（#57.7a 判据 2）：盘上记录的 `type` 只可能是 `'updating'`；
 *      `checking`/`downloading` 一律当脏数据（读侧强制）。
 *   6. 写读往返一致 + 脏记录（坏 JSON / 越界路径）不抛、不卡启动。
 * 全部 fixture 为虚构值（版本 `1.2.3`/`9.9.9`，硬约束 21）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// 🔴 共享桩必须先于 SUT import（见 electron-mock.ts 头注「纪律」）
import { electronMock } from "./electron-mock.js";

import {
  clearPendingInstall,
  createUpdateInstaller,
  pendingInstallPath,
  readPendingInstall,
  resolveStartupInstall,
  writePendingInstall,
} from "./update-install.js";
import { installerFileName } from "./update-download.js";
import { UpdateLegError } from "./update-service.js";
import type { PendingInstallRecord } from "./update-install.js";
import type { UpdateInfo } from "../../src/core/types/ipc/update";

const CURRENT = "1.2.3";
const NEXT = "9.9.9";

function makeInfo(over: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    version: NEXT,
    currentVersion: CURRENT,
    publishedAt: "2026-09-12T00:00:00Z",
    releaseNotesUrl: "https://example.invalid/releases/tag/v9.9.9",
    downloadUrl: "https://example.invalid/linkdesk-setup-9.9.9.exe",
    checksum: "a".repeat(64),
    size: 1000,
    ...over,
  };
}

let root: string;
let dir: string;
let installer: string;

/** 盘上放一份「可用的」安装器（内容非空即可——本腿只查存在性，完整性归下载腿的 sha256） */
function placeInstaller(version: string = NEXT): string {
  const p = path.join(dir, installerFileName(version));
  fs.writeFileSync(p, "fake-installer");
  return p;
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "lk-update-install-"));
  dir = path.join(root, "update");
  fs.mkdirSync(dir, { recursive: true });
  installer = placeInstaller();
  electronMock.relaunchCalls.length = 0;
  electronMock.lifecycleCalls.length = 0;
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.useRealTimers();
});

describe("安装腿：落盘 → 拉起安装器 → 退出", () => {
  it("🔴 落盘先于拉起安装器（拉起那一刻盘上已有记录），且 quit 在拉起之后", async () => {
    const order: string[] = [];
    const onDiskAtLaunch: boolean[] = [];
    const leg = createUpdateInstaller({
      getUpdateDir: () => dir,
      launchInstaller: () => {
        order.push("launch");
        onDiskAtLaunch.push(fs.existsSync(pendingInstallPath(dir)));
      },
      quit: () => order.push("quit"),
    });

    void leg(makeInfo(), installer);
    await vi.waitFor(() => expect(order).toContain("quit"));

    expect(onDiskAtLaunch).toEqual([true]); // ③ 不是「两个都发生了」，是「先落盘」
    expect(order).toEqual(["launch", "quit"]);
  });

  it("🔴 成功路径不返回——quit 之后 promise 永不 settle（返回即契约违反）", async () => {
    const leg = createUpdateInstaller({
      getUpdateDir: () => dir,
      launchInstaller: () => {},
      quit: () => {},
    });

    const settled = await Promise.race([
      leg(makeInfo(), installer).then(() => "resolved", () => "rejected"),
      new Promise((r) => setTimeout(() => r("pending"), 20)),
    ]);
    expect(settled).toBe("pending");
  });

  it("🔴 记录内容：`type` 白名单为 updating，带 update/installerPath/startedAt/warning", async () => {
    const leg = createUpdateInstaller({
      getUpdateDir: () => dir,
      launchInstaller: () => {},
      quit: () => {},
      now: () => "2026-09-12T01:02:03.000Z",
    });

    void leg(makeInfo(), installer, { code: "checksum-unavailable", message: "未附校验值" });
    await vi.waitFor(async () => expect(await readPendingInstall({ getUpdateDir: () => dir })).not.toBeNull());

    const raw = JSON.parse(fs.readFileSync(pendingInstallPath(dir), "utf8")) as PendingInstallRecord;
    expect(raw).toEqual({
      type: "updating",
      update: makeInfo(),
      installerPath: installer,
      startedAt: "2026-09-12T01:02:03.000Z",
      warning: { code: "checksum-unavailable", message: "未附校验值" },
    });
  });

  it("安装器不在盘上 → 抛 canceled，且不落盘、不拉起、不退出（不许拉起一个不存在的文件）", async () => {
    const launch = vi.fn();
    const quit = vi.fn();
    const leg = createUpdateInstaller({ getUpdateDir: () => dir, launchInstaller: launch, quit });

    await expect(leg(makeInfo(), path.join(dir, "gone.exe"))).rejects.toBeInstanceOf(UpdateLegError);
    await expect(leg(makeInfo(), path.join(dir, "gone.exe"))).rejects.toMatchObject({
      detail: { code: "canceled" },
    });
    expect(launch).not.toHaveBeenCalled();
    expect(quit).not.toHaveBeenCalled();
    expect(fs.existsSync(pendingInstallPath(dir))).toBe(false);
  });

  it("落盘失败（写不进去）→ 抛 write-error 且**不装**（fail-closed：宁可不装，也不装得不明不白）", async () => {
    fs.mkdirSync(`${pendingInstallPath(dir)}.tmp`); // 占住临时名 ⇒ 原子写的写入步骤必然失败
    const launch = vi.fn();
    const leg = createUpdateInstaller({ getUpdateDir: () => dir, launchInstaller: launch, quit: () => {} });

    await expect(leg(makeInfo(), installer)).rejects.toMatchObject({ detail: { code: "write-error" } });
    expect(launch).not.toHaveBeenCalled();
  });

  it("拉起安装器失败 → 抛 canceled 且**当场销账**（别让下次启动误报「上次更新中断」）", async () => {
    const leg = createUpdateInstaller({
      getUpdateDir: () => dir,
      launchInstaller: () => {
        throw new Error("relaunch 被策略拦住");
      },
      quit: () => {},
    });

    await expect(leg(makeInfo(), installer)).rejects.toMatchObject({ detail: { code: "canceled" } });
    expect(fs.existsSync(pendingInstallPath(dir))).toBe(false);
  });

  it("🔴 quit 被拦（有窗口拦住关闭）→ 兜底强制退出，不许永久停在「正在安装」", async () => {
    // ⚠️ 用真时钟 + 注入小预算：本腿内部要读盘（`fs.stat`），而假时钟不驱动真实 I/O 回调。
    const forceExit = vi.fn();
    const leg = createUpdateInstaller({
      getUpdateDir: () => dir,
      launchInstaller: () => {},
      quit: () => {}, // 模拟「有窗口拦住了关闭」：quit 调用无效，进程还活着
      forceExit,
      quitFallbackMs: 150,
    });

    void leg(makeInfo(), installer);
    await new Promise((r) => setTimeout(r, 60));
    expect(forceExit).not.toHaveBeenCalled(); // 预算内不抢跑
    await vi.waitFor(() => expect(forceExit).toHaveBeenCalledTimes(1), { timeout: 2000 });
  });

  // 逐字断言两条开关（#57.8f 判据 ①）：assisted 安装器的重启分支要 `${isForceRun}` **且** `${Silent}`
  // 同时成立（installSection.nsh:104-110），少任何一条都不会把 App 拉回来 / 都会弹窗等人点。
  // ⚠️ `--updated` **必须不在**这条命令里——那是安装器→App 的方向，由安装器自己加。
  it("缺省拉起方式 = app.relaunch({ execPath: 安装器, args: ['/S', '--force-run'] })——静默 + 装完拉回 App", async () => {
    const leg = createUpdateInstaller({ getUpdateDir: () => dir, quit: () => electronMock.app.quit() });

    void leg(makeInfo(), installer);
    await vi.waitFor(() => expect(electronMock.lifecycleCalls).toContain("quit"));

    expect(electronMock.relaunchCalls).toEqual([{ execPath: installer, args: ["/S", "--force-run"] }]);
  });
});

describe("🔴 启动复位：三支判据（盘上的事实说了算）", () => {
  /** 造一份「上次正在装」的现场 */
  async function givenPending(over: Partial<PendingInstallRecord> = {}): Promise<void> {
    await writePendingInstall({
      type: "updating",
      update: makeInfo(),
      installerPath: installer,
      startedAt: "2026-09-12T01:02:03.000Z",
      ...over,
    }, { getUpdateDir: () => dir });
  }

  const deps = (current: string) => ({ getUpdateDir: () => dir, getCurrentVersion: () => current });

  it("当前版本 == 记录目标 → 装成功了：销账（清记录 + 清那份同版残留安装器），正常初始化", async () => {
    await givenPending();
    const r = await resolveStartupInstall(deps(NEXT));

    expect(r).toEqual({ outcome: "installed", resume: null });
    expect(fs.existsSync(pendingInstallPath(dir))).toBe(false);
    expect(fs.existsSync(installer)).toBe(false);
  });

  it("版本不等 + 安装器在且正是记录里那个版本 → ready（带路径，用户可再点），记录保留", async () => {
    await givenPending();
    const r = await resolveStartupInstall(deps(CURRENT));

    expect(r.outcome).toBe("ready");
    expect(r.resume?.state).toEqual({ type: "ready", update: makeInfo() });
    expect(r.resume?.installerPath).toBe(installer);
    expect(fs.existsSync(pendingInstallPath(dir))).toBe(true); // 还要用它装，别销账
  });

  it("降级放行的账跨重启传递：记录里的 warning 跟着落到 ready", async () => {
    await givenPending({ warning: { code: "checksum-unavailable", message: "未附校验值" } });
    const r = await resolveStartupInstall(deps(CURRENT));

    expect(r.resume?.state).toEqual({
      type: "ready",
      update: makeInfo(),
      warning: { code: "checksum-unavailable", message: "未附校验值" },
    });
  });

  it("版本不等 + 安装器已不在 → idle + install-interrupted（销账），**不许**落 ready/downloaded", async () => {
    await givenPending();
    fs.rmSync(installer);
    const r = await resolveStartupInstall(deps(CURRENT));

    expect(r.outcome).toBe("interrupted");
    // 🔴 错误码是 `install-interrupted`（**不是**下载腿那个 `interrupted`）——本支没有发起方，
    // 壳只能靠码认出它来出声；复用下载腿的码 = 用户下次启动零通知（2026-09-12 拆码）。
    expect(r.resume).toMatchObject({ state: { type: "idle", lastError: { code: "install-interrupted" } } });
    expect(fs.existsSync(pendingInstallPath(dir))).toBe(false);
  });

  it("🔴 清单判据 3 的字面场景：盘上是**别的（更旧）版本**的安装器 → 仍然 idle + install-interrupted", async () => {
    await givenPending();
    fs.rmSync(installer);
    placeInstaller("0.0.1"); // 名字解析得出、但**不等于记录目标** —— 快照不许当结论
    const r = await resolveStartupInstall(deps(CURRENT));

    expect(r.outcome).toBe("interrupted");
    expect(r.resume?.state.type).toBe("idle");
  });

  it("安装器在但内容是空的（0 字节）→ 不可用，同样归 install-interrupted", async () => {
    await givenPending();
    fs.rmSync(installer);
    fs.writeFileSync(installer, "");
    const r = await resolveStartupInstall(deps(CURRENT));

    expect(r.outcome).toBe("interrupted");
  });

  it("没有记录 → none（从未装过/已结清），交回正常初始化", async () => {
    const r = await resolveStartupInstall(deps(CURRENT));
    expect(r).toEqual({ outcome: "none", resume: null });
  });

  it("🔴 白名单：`checking`/`downloading` 一律当脏数据（瞬时态不许进盘、更不许复活）", async () => {
    for (const type of ["checking", "downloading"]) {
      fs.writeFileSync(pendingInstallPath(dir), JSON.stringify({
        type,
        update: makeInfo(),
        installerPath: installer,
        startedAt: "2026-09-12T01:02:03.000Z",
      }));
      expect(await readPendingInstall({ getUpdateDir: () => dir })).toBeNull();
      expect(await resolveStartupInstall(deps(CURRENT))).toEqual({ outcome: "none", resume: null });
    }
  });

  it.each([
    ["坏 JSON", "{ 这不是 json"],
    ["类型不对（数组）", '["updating"]'],
    ["缺 installerPath", '{"type":"updating","update":{"version":"9.9.9","currentVersion":"1.2.3"}}'],
    ["路径越界（不在更新目录内）", '{"type":"updating","installerPath":"C:/windows/system32/x.exe","startedAt":"t","update":{"version":"9.9.9","currentVersion":"1.2.3"}}'],
  ])("脏记录（%s）→ 当「没有待续安装」，不抛、不卡启动", async (_label, content) => {
    fs.writeFileSync(pendingInstallPath(dir), content);
    expect(await readPendingInstall({ getUpdateDir: () => dir })).toBeNull();
    expect(await resolveStartupInstall(deps(CURRENT))).toEqual({ outcome: "none", resume: null });
  });

  it("写读往返一致：腿写下的记录，复位侧按同一形状读回（两半不脱钩）", async () => {
    const leg = createUpdateInstaller({ getUpdateDir: () => dir, launchInstaller: () => {}, quit: () => {} });
    void leg(makeInfo(), installer);
    await vi.waitFor(async () => expect(await readPendingInstall({ getUpdateDir: () => dir })).not.toBeNull());

    // 重启后「已经跑在新版本上」——同一条链的两半合得上
    expect((await resolveStartupInstall(deps(NEXT))).outcome).toBe("installed");
    expect(await readPendingInstall({ getUpdateDir: () => dir })).toBeNull();
    await clearPendingInstall({ getUpdateDir: () => dir }); // 幂等（销账后再销一次不抛）
  });
});
