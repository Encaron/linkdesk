/**
 * UpdateService 状态机单测——E6#57.4。
 *
 * 本模块零 electron 依赖（三条腿 + 版本/源判定全部构造注入）⇒ 不需要 electron 替身，纯状态机断言。
 * 逐条对判据（清单 5.4 轮「验证」行）：
 *   1. 状态机迁移 Idle→Checking→Available / Idle→Checking→Idle / 失败→Idle+lastError
 *   2. 🔴 **两条路（手动 context:true / 后台 context:false）记账一致**——都写 lastError（#57.4b 判据子项）
 *   3. 每次迁移一条 stateChanged（#57.4c）——数广播条数，不数「有没有广播」
 *   4. 忙态重入不重复发起 / 检查腿契约违反（抛出）不把状态机卡在 checking
 *   5. 下载腿：进度节流（≤500ms）＋ 失败回 idle+lastError；安装腿：失败不在 updating 停住
 * 全部 fixture 为虚构值（硬约束 21）。
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { UpdateService, UpdateLegError } from "./update-service";
import type { DownloadLeg, InstallLeg, StartupResume, UpdateProbeResult, UpdateServiceDeps } from "./update-service";
import type { DownloadProgress, UpdateInfo, UpdateState } from "../../src/core/types/ipc/update";

const CURRENT = "0.1.49";
const NEXT = "0.1.50";

function makeInfo(over: Partial<UpdateInfo> = {}): UpdateInfo {
  return {
    version: NEXT,
    currentVersion: CURRENT,
    publishedAt: "2026-09-12T00:00:00Z",
    releaseNotesUrl: "https://example.invalid/releases/tag/v0.1.50",
    downloadUrl: "https://example.invalid/linkdesk-setup-0.1.50.exe",
    checksum: "a".repeat(64),
    size: 1000,
    ...over,
  };
}

/** 默认腿：可用更新 / 下载成功 / 安装抛错（安装腿正常路径不返回，测试里必须给一个能返回的替身） */
function makeService(over: Partial<UpdateServiceDeps> = {}) {
  const probe = vi.fn<(_context: boolean) => Promise<UpdateProbeResult>>(
    async () => ({ kind: "available", update: makeInfo() }),
  );
  const download = vi.fn<DownloadLeg>(async () => ({ installerPath: "E:/fake/linkdesk-update-0.1.50.exe" }));
  const install = vi.fn<InstallLeg>(async () => {
    throw new Error("测试替身：安装腿不该返回");
  });
  /** 缺省「没有待续安装」——跨重启复位的用例各自覆盖 */
  const resume = vi.fn<() => StartupResume | null>(() => null);
  const deps: UpdateServiceDeps = {
    isSourceConfigured: () => true,
    probe,
    download,
    install,
    resume,
    ...over,
  };
  const service = new UpdateService(deps);
  const states: UpdateState[] = [];
  const progresses: DownloadProgress[] = [];
  service.setCallbacks({
    onStateChanged: (s) => states.push(s),
    onProgress: (p) => progresses.push(p),
  });
  return { service, probe, download, install, resume, states, progresses };
}

afterEach(() => vi.restoreAllMocks());

describe("init 与 getState", () => {
  it("源已配置 → idle；源未配置 → disabled（带 reason）", () => {
    const a = makeService();
    expect(a.service.getState()).toEqual({ type: "uninitialized" });
    expect(a.service.init()).toEqual({ type: "idle" });

    const b = makeService({ isSourceConfigured: () => false });
    expect(b.service.init()).toEqual({ type: "disabled", reason: "update-source-unconfigured" });
  });

  it("幂等——已离开 uninitialized 不再改（二次 init 不覆盖运行中的态）", () => {
    const { service, states } = makeService();
    service.init();
    states.length = 0;
    expect(service.init()).toEqual({ type: "idle" });
    expect(states).toHaveLength(0);
  });
});

describe("🔴 启动复位（#57.7a）：跨重启的待续安装还原进内存态", () => {
  /** 跨重启的 `ready`——装到一半重启，盘上安装器还在（生产者 = update-install.resolveStartupInstall） */
  function pendingReady(over: Partial<UpdateInfo> = {}): StartupResume {
    return {
      state: { type: "ready", update: makeInfo(over), warning: { code: "checksum-unavailable", message: "未附校验值" } },
      installerPath: "E:/fake/linkdesk-update-0.1.50.exe",
    };
  }

  it("有复位结果 → 落该态 + 广播一条；安装器路径一并还原（否则再点「重启并更新」会说没有可装的）", async () => {
    const { service, resume, states, install } = makeService({ resume: () => pendingReady() });
    expect(service.init()).toEqual(pendingReady().state);
    expect(states.map((s) => s.type)).toEqual(["ready"]);

    // 还原出来的路径真的被 `quitAndInstall` 用上（不是「落了个态、按钮却点不动」）
    await expect(service.quitAndInstall()).rejects.toThrow("测试替身：安装腿不该返回");
    expect(install).toHaveBeenCalledWith(makeInfo(), "E:/fake/linkdesk-update-0.1.50.exe", {
      code: "checksum-unavailable",
      message: "未附校验值",
    });
  });

  it("复位**先于** disabled：更新源没配也得认盘上那份安装器（它不需要网络）", () => {
    const { service } = makeService({ isSourceConfigured: () => false, resume: () => pendingReady() });
    expect(service.init().type).toBe("ready");
  });

  it("无复位结果 → 照旧走 disabled/idle（复位不改变原有初始化语义）", () => {
    const a = makeService({ resume: () => null });
    expect(a.service.init()).toEqual({ type: "idle" });
    const b = makeService({ isSourceConfigured: () => false, resume: () => null });
    expect(b.service.init()).toEqual({ type: "disabled", reason: "update-source-unconfigured" });
  });
});

describe("检查：Idle → Checking → Available / Idle（#57.4c 每次迁移一条广播）", () => {
  it("有更新 → available，且 checking / available 各广播一条", async () => {
    const { service, states } = makeService();
    service.init();
    states.length = 0;

    const next = await service.checkForUpdates(true);

    expect(next.type).toBe("available");
    expect(states.map((s) => s.type)).toEqual(["checking", "available"]);
    expect(states[1]).toEqual({ type: "available", update: makeInfo() });
  });

  it("无更新 → idle（无 lastError——「已是最新」不是错误）", async () => {
    const { service, states } = makeService({ probe: async () => ({ kind: "up-to-date" }) });
    service.init();
    states.length = 0;

    expect(await service.checkForUpdates(true)).toEqual({ type: "idle" });
    expect(states.map((s) => s.type)).toEqual(["checking", "idle"]);
  });
});

describe("🔴 失败归因与记账（#57.4b 判据子项：手动/后台都必须记账）", () => {
  const failed: UpdateProbeResult = {
    kind: "error",
    error: { code: "asset-missing", message: "找到新版本但安装包缺失" },
  };

  it.each([
    ["手动 context:true", true],
    ["后台 context:false", false],
  ])("%s → idle + lastError（出不出声不在这层，但账一定在）", async (_label, context) => {
    const { service } = makeService({ probe: async () => failed });
    service.init();

    const next = await service.checkForUpdates(context);

    expect(next).toEqual({ type: "idle", lastError: failed.error });
  });

  it("错误码原样保留，不被塌成 network / 未知错误", async () => {
    const { service } = makeService({
      probe: async () => ({ kind: "error", error: { code: "version-unparsable", message: "tag 不是 SemVer" } }),
    });
    service.init();
    const next = await service.checkForUpdates(false);
    expect(next.type === "idle" && next.lastError?.code).toBe("version-unparsable");
  });

  it("context 原样透传给检查腿（服务不据此做状态决策）", async () => {
    const { service, probe } = makeService();
    service.init();
    await service.checkForUpdates(true);
    await service.checkForUpdates(false);
    expect(probe.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });
});

describe("忙态与契约违反", () => {
  it("checking 期间重入不重复发起检查", async () => {
    let release: (r: UpdateProbeResult) => void = () => {};
    const probe = vi.fn<(_c: boolean) => Promise<UpdateProbeResult>>(
      () => new Promise<UpdateProbeResult>((res) => { release = res; }),
    );
    const { service } = makeService({ probe });
    service.init();

    const first = service.checkForUpdates(true);
    await Promise.resolve();
    const second = await service.checkForUpdates(true); // 重入：直接返回当前态

    expect(second).toEqual({ type: "checking" });
    expect(probe).toHaveBeenCalledTimes(1);

    release({ kind: "up-to-date" });
    await first;
  });

  it("uninitialized / disabled 态不发检查", async () => {
    const a = makeService();
    expect(await a.service.checkForUpdates(true)).toEqual({ type: "uninitialized" });

    const b = makeService({ isSourceConfigured: () => false });
    b.service.init();
    expect(await b.service.checkForUpdates(true)).toEqual({
      type: "disabled",
      reason: "update-source-unconfigured",
    });
    expect(b.probe).not.toHaveBeenCalled();
  });

  it("🔴 检查腿抛出（契约违反）→ 态回 idle 再重抛——不许卡在 checking 转圈", async () => {
    const boom = new Error("检查腿自己崩了");
    const { service, states } = makeService({
      probe: async () => { throw boom; },
    });
    service.init();
    states.length = 0;

    await expect(service.checkForUpdates(true)).rejects.toBe(boom);
    expect(service.getState()).toEqual({ type: "idle" });
    expect(states.map((s) => s.type)).toEqual(["checking", "idle"]);
  });
});

describe("下载腿（#57.6 接线点）", () => {
  it("available → downloading（0%）→ 进度 → downloaded", async () => {
    const { service, states, progresses } = makeService({
      download: async (_u, onProgress) => {
        onProgress({ transferred: 250, total: 1000, percent: 25 });
        onProgress({ transferred: 1000, total: 1000, percent: 100 });
        return { installerPath: "E:/fake/linkdesk-update-0.1.50.exe" };
      },
    });
    service.init();
    await service.checkForUpdates(true);
    states.length = 0;

    const next = await service.downloadUpdate();

    expect(states.map((s) => s.type)).toEqual(["downloading", "downloaded"]);
    expect(next).toEqual({ type: "downloaded", update: makeInfo() });
    expect(progresses.map((p) => p.percent)).toEqual([25, 100]);
  });

  it("进度节流 ≤500ms——窗口内只发一条，末帧（100%）必发", async () => {
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000_000);

    const { service, progresses } = makeService({
      download: async (_u, onProgress) => {
        onProgress({ transferred: 100, total: 1000, percent: 10 }); // 首发（lastEmit 初值 0）
        for (let i = 0; i < 5; i++) onProgress({ transferred: 200 + i, total: 1000, percent: 20 + i }); // 同一毫秒，全落在窗口内
        now.mockReturnValue(1_000_100);
        onProgress({ transferred: 900, total: 1000, percent: 90 }); // 仍在窗口内
        onProgress({ transferred: 1000, total: 1000, percent: 100 }); // 末帧必发
        return { installerPath: "x" };
      },
    });
    service.init();
    await service.checkForUpdates(true);
    await service.downloadUpdate();

    expect(progresses.map((p) => p.percent)).toEqual([10, 100]);
  });

  it("下载腿报结构化失败 → idle + lastError（不抛）", async () => {
    const detail = { code: "checksum-mismatch" as const, message: "校验不符" };
    const { service } = makeService({
      download: async () => { throw new UpdateLegError(detail); },
    });
    service.init();
    await service.checkForUpdates(true);

    expect(await service.downloadUpdate()).toEqual({ type: "idle", lastError: detail });
  });

  it("下载腿抛非结构化错误（契约违反）→ 态回 idle 再重抛", async () => {
    const boom = new Error("下载腿自己崩了");
    const { service } = makeService({ download: async () => { throw boom; } });
    service.init();
    await service.checkForUpdates(true);

    await expect(service.downloadUpdate()).rejects.toBe(boom);
    expect(service.getState()).toEqual({ type: "idle" });
  });

  it("非 available 态调下载 → idle + lastError（不静默吞：点了「立即更新」什么都没有发生最难查）", async () => {
    const { service, download } = makeService();
    service.init();

    const next = await service.downloadUpdate();

    expect(next.type === "idle" && next.lastError?.code).toBe("canceled");
    expect(download).not.toHaveBeenCalled();
  });
});

describe("安装腿（#57.7 接线点）", () => {
  async function toDownloaded(install: InstallLeg) {
    const ctx = makeService({ install });
    ctx.service.init();
    await ctx.service.checkForUpdates(true);
    await ctx.service.downloadUpdate();
    ctx.states.length = 0;
    return ctx;
  }

  it("downloaded → updating（先广播再动手）→ 安装腿抛结构化错误 → idle+lastError 且保留 update（可重试）→ 重抛", async () => {
    const detail = { code: "write-error" as const, message: "装不上" };
    const { service, states } = await toDownloaded(async () => { throw new UpdateLegError(detail); });

    await expect(service.quitAndInstall()).rejects.toBeInstanceOf(UpdateLegError);

    expect(states.map((s) => s.type)).toEqual(["updating", "idle"]);
    expect(service.getState()).toEqual({ type: "idle", update: makeInfo(), lastError: detail });
  });

  it("🔴 安装腿返回却没让进程退出（契约违反）→ 不在 updating 停住，且不编错误码", async () => {
    const { service } = await toDownloaded(async () => { /* 正常应永不返回 */ });

    await expect(service.quitAndInstall()).rejects.toThrow(/未退出/);

    const s = service.getState();
    expect(s.type).toBe("idle");
    expect(s.type === "idle" && s.lastError).toBeUndefined(); // 不拿不相干的码搪塞
  });

  it("非 downloaded / ready 态调安装 → 抛（本命令错误语义 = 抛错）", async () => {
    const { service, install } = makeService();
    service.init();
    await expect(service.quitAndInstall()).rejects.toBeInstanceOf(UpdateLegError);
    expect(install).not.toHaveBeenCalled();
  });
});

// ─────────────────── 降级放行的记账（#57.6b / 2026-09-12 拍板选 (a)） ───────────────────

describe("降级放行的记账（#57.6b）", () => {
  it("🔴 下载腿报 warning → 落在 downloaded.warning（**不是** lastError——那会把「成了」说成「没成」）", async () => {
    const warning = { code: "checksum-unavailable" as const, message: "本次更新未附校验值" };
    const { service } = makeService({
      download: async () => ({ installerPath: "E:/fake/linkdesk-update-0.1.50.exe", warning }),
    });
    service.init();
    await service.checkForUpdates(true);

    const s = await service.downloadUpdate();

    expect(s).toEqual({ type: "downloaded", update: makeInfo(), warning });
    expect(service.getState()).toEqual({ type: "downloaded", update: makeInfo(), warning });
  });

  it("负控：没有 warning 时 `warning` 键**不出现**——否则壳分不清「有话说」和「没话说」", async () => {
    const { service } = makeService();
    service.init();
    await service.checkForUpdates(true);
    expect(await service.downloadUpdate()).toEqual({ type: "downloaded", update: makeInfo() });
  });
});

// ─────────────────── 启动态（#57.6f：不许复活 downloading） ───────────────────

describe("启动态（#57.6f）", () => {
  it("🔴 新建实例恒从 uninitialized 起 ⇒ **没有**「读盘恢复上次态」的入口，`downloading` 无从复活", () => {
    // 本格的实现口径：**不引入状态持久化**（见 electron/services/update-download.ts 文件头 ⚠️）。
    // 磁盘侧的另一半（残留 `.part` 删、旧安装器按方向守卫删）由 update-download.test.ts 钉住——
    // 两边合起来才是 #57.6f 的完整判据：既没有假态可复活，盘上也不留会变成假态的东西。
    const fresh = makeService();
    expect(fresh.service.getState()).toEqual({ type: "uninitialized" });
    for (const configured of [true, false]) {
      const { service } = makeService({ isSourceConfigured: () => configured });
      service.init();
      expect(["idle", "disabled"]).toContain(service.getState().type);
    }
  });
});
