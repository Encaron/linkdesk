/**
 * install-queue 单测——E6#73q 壳侧安装队列（18 档 §五 I）。
 *
 * 病根回归钉子：此前唯一的闸是 marketplace 的模块级单例 `_installSession`，命中即静默 `return false`
 * ——连点 7 个插件 = **装 1 丢 6**。本档逐条验证替换后的语义：
 *   1. N 槽限流 + 严格 FIFO（第 4 个真停在「等待安装中」，不是被丢掉）
 *   2. 槽位**直接交接**给队首（不先减再加——防双计）
 *   3. 同 pluginId 去重（不建第二行）+ 第二调用方等到同一结果
 *   4. identifyInstallJob 回填真 id 后即可去重（包安装流解压前不知 id）
 *   5. 槽级看门狗：running 态零进度 → 判失败并**归还槽位**；touch 重置预算
 *   6. settle 幂等 / 排队态被结算从 FIFO 摘除（不留僵尸）
 *   7. 广播载荷 = 登记形状（队列私有字段不外泄）+ 落盘快照只写未出结果的
 * fixture 全虚构 id（硬约束 21）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type QueueMod = typeof import("./install-queue");

/** 全局 window.linkdesk 备份（本文件替换成只留 events 的窄 stub——不落盘、不碰 filesystem） */
const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

/** 每次拿**全新**模块实例（job 表是模块级状态，测试间必须隔离）+ 捕获本实例的广播 */
async function bootQueue(): Promise<{ mod: QueueMod; events: Array<{ name: string; payload: unknown }> }> {
  vi.resetModules();
  const events: Array<{ name: string; payload: unknown }> = [];
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    events: { emit: (name: string, payload: unknown) => events.push({ name, payload }), on: () => () => {} },
  };
  const mod = await import("./install-queue");
  return { mod, events };
}

/** 最新一次广播里的 job 快照 */
function lastJobs(events: Array<{ name: string; payload: unknown }>): Array<Record<string, unknown>> {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].name === "plugin:installJobs") {
      return (events[i].payload as { jobs: Array<Record<string, unknown>> }).jobs;
    }
  }
  return [];
}

function stateOf(events: Array<{ name: string; payload: unknown }>, jobId: string): string | undefined {
  return lastJobs(events).find((j) => j.jobId === jobId)?.state as string | undefined;
}

/** 起队列 + 建 n 个 job + **同步**发起 n 次抢槽——前 3 个的开跑在同步序里发生，其余进 FIFO 挂起。
 *  返回的 `waiting` 逐个 await 即代表「该 job 拿到槽了」（替换测试里反复出现的同一段起手式）。 */
async function bootWithJobs(n: number): Promise<{
  mod: QueueMod;
  events: Array<{ name: string; payload: unknown }>;
  ids: string[];
  waiting: Array<Promise<void>>;
}> {
  const { mod, events } = await bootQueue();
  const ids = Array.from({ length: n }, (_, i) => mod.beginInstallJob({ pluginId: `demo-${i + 1}` }).jobId);
  const waiting = ids.map((id) => mod.acquireInstallSlot(id));
  return { mod, events, ids, waiting };
}

beforeEach(() => {
  (window as unknown as { linkdesk: unknown }).linkdesk = { events: { emit: () => {}, on: () => () => {} } };
});
afterEach(() => {
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
  vi.useRealTimers();
});

describe("install-queue——N 槽限流与严格 FIFO（E6#73q）", () => {
  it("开跑 3 个占满槽，第 4/5 个真停在 queued；还槽时队首直接接手", async () => {
    const { mod, events, ids, waiting } = await bootWithJobs(5);

    expect(ids.map((id) => stateOf(events, id))).toEqual(["running", "running", "running", "queued", "queued"]);

    // 还一槽 → 队首（第 4 个）接手，第 5 个仍等
    mod.settleInstallJob(ids[0], "success", { success: true });
    await waiting[3];
    expect(stateOf(events, ids[3])).toBe("running");
    expect(stateOf(events, ids[4])).toBe("queued");

    // 再还一槽 → 第 5 个接手；全部收尾后不再有等待者
    mod.settleInstallJob(ids[1], "success", { success: true });
    await waiting[4];
    expect(stateOf(events, ids[4])).toBe("running");
    mod.settleInstallJob(ids[2], "success", { success: true });
    mod.settleInstallJob(ids[3], "success", { success: true });
    mod.settleInstallJob(ids[4], "success", { success: true });
    expect(lastJobs(events).every((j) => j.state === "settled")).toBe(true);
  });

  it("槽位直接交接——连开 6 个后逐个还槽，同一时刻在跑的不超过 3 个", async () => {
    const { mod, events, ids, waiting } = await bootWithJobs(6);
    expect(lastJobs(events).filter((j) => j.state === "running")).toHaveLength(3);

    for (let i = 0; i < 6; i += 1) {
      mod.settleInstallJob(ids[i], "success", { success: true });
      // 任一时刻在跑的都不许超过上限（「先减后加」双计的回归钉子）
      expect(lastJobs(events).filter((j) => j.state === "running").length).toBeLessThanOrEqual(3);
    }
    await Promise.all(waiting);
    expect(lastJobs(events).every((j) => j.state === "settled")).toBe(true);
  });

  it("同 pluginId 去重：不建第二行，第二调用方等到同一结果（连点两次 = 一次安装）", async () => {
    const { mod, events } = await bootQueue();
    const first = mod.beginInstallJob({ pluginId: "demo-dup", displayName: "Demo Dup" });
    const second = mod.beginInstallJob({ pluginId: "demo-dup" });

    expect(second.duplicate).toBe(true);
    expect(second.jobId).toBe(first.jobId);
    expect(lastJobs(events)).toHaveLength(1);

    await mod.acquireInstallSlot(first.jobId);
    const waiting = mod.waitInstallJob(second.jobId);
    mod.settleInstallJob(first.jobId, "success", { success: true, pluginId: "demo-dup" });
    await expect(waiting).resolves.toEqual({ success: true, pluginId: "demo-dup" });
  });

  it("identifyInstallJob 回填真 id 后即可去重（包安装流解压前不知 id）", async () => {
    const { mod } = await bootQueue();
    const job = mod.beginInstallJob({});
    expect(mod.beginInstallJob({ pluginId: "demo-late" }).duplicate).toBe(false); // 回填前不参与去重

    mod.identifyInstallJob(job.jobId, { pluginId: "demo-late", displayName: "Demo Late" });
    expect(mod.beginInstallJob({ pluginId: "demo-late" })).toEqual({ jobId: job.jobId, duplicate: true });
  });

  it("已 settle 的 job 不参与去重——重装同一插件能建新行", async () => {
    const { mod } = await bootQueue();
    const first = mod.beginInstallJob({ pluginId: "demo-again" });
    mod.settleInstallJob(first.jobId, "success", { success: true });
    const second = mod.beginInstallJob({ pluginId: "demo-again" });
    expect(second.duplicate).toBe(false);
    expect(second.jobId).not.toBe(first.jobId);
  });

  it("settle 幂等：重复结算不改终态、不重复还槽", async () => {
    const { mod, events, ids, waiting } = await bootWithJobs(4);

    mod.settleInstallJob(ids[0], "success", { success: true });
    mod.settleInstallJob(ids[0], "failed", { success: false, error: "不该覆盖" });
    expect(lastJobs(events).find((j) => j.jobId === ids[0])?.terminal).toBe("success");

    // 幂等还槽——第 4 个只被唤醒一次，不会被「多还的一槽」误放行第 5 个
    mod.settleInstallJob(ids[1], "success", { success: true });
    mod.settleInstallJob(ids[2], "success", { success: true });
    await waiting[3];
    expect(stateOf(events, ids[3])).toBe("running");
  });

  it("排队态被结算 → 从 FIFO 摘除（还槽时跳过它，不留僵尸）", async () => {
    const { mod, events, ids, waiting } = await bootWithJobs(5);

    // 先结算排在最后的第 5 个（仍在排队）——它必须从等待队列里消失
    mod.settleInstallJob(ids[4], "failed", { success: false, error: "用户取消" });
    expect(stateOf(events, ids[4])).toBe("settled");

    mod.settleInstallJob(ids[0], "success", { success: true });
    await waiting[3]; // 还槽给的是第 4 个，不是已死的第 5 个
    expect(stateOf(events, ids[3])).toBe("running");
    expect(stateOf(events, ids[4])).toBe("settled");
  });

  it("广播载荷 = 登记形状（grant/settledWaiters/watchdog/outcome 四个私有字段不外泄）", async () => {
    const { mod, events } = await bootQueue();
    const { jobId } = mod.beginInstallJob({ pluginId: "demo-shape", displayName: "Demo Shape", origin: "dependency" });
    await mod.acquireInstallSlot(jobId);
    const job = lastJobs(events).find((j) => j.jobId === jobId)!;
    expect(Object.keys(job).sort()).toEqual(["displayName", "error", "jobId", "origin", "pluginId", "state", "terminal"]);
    expect(job.origin).toBe("dependency");
    expect(job.displayName).toBe("Demo Shape");
  });

  it("落盘快照只写未出结果的 job（73l 的 N 生产者）", async () => {
    const { mod } = await bootQueue();
    const a = mod.beginInstallJob({ pluginId: "demo-snap-a" });
    const b = mod.beginInstallJob({ pluginId: "demo-snap-b" });
    mod.settleInstallJob(a.jobId, "success", { success: true });

    const raw = localStorage.getItem("install-jobs");
    const snap = JSON.parse(raw!) as { jobs: Array<{ jobId: string; state: string }> };
    expect(snap.jobs.map((j) => j.jobId)).toEqual([b.jobId]);
    expect(snap.jobs[0].state).toBe("queued");
  });

  it("已完成 job 内存保留上限 50——超出按入队序淘汰最老的（不泄漏）", async () => {
    const { mod, events } = await bootQueue();
    const ids = Array.from({ length: 55 }, (_, i) => `demo-cap-${i}`);
    for (const id of ids) {
      const { jobId } = mod.beginInstallJob({ pluginId: id });
      mod.settleInstallJob(jobId, "success", { success: true });
    }
    // 保留最近 50 条——最老 5 条（ids[0..4]）按入队序淘汰
    expect(lastJobs(events).map((j) => j.pluginId)).toEqual(ids.slice(5));
  });
});

describe("install-queue——槽级看门狗（E6#73q）", () => {
  // 看门狗是定时器——用假时钟把 10 分钟预算压成同步推进（文件级 afterEach 负责还原真实时钟）
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("running 零进度超预算 → 判失败 + 归还槽位（挂死的 job 不永久占 1/3 槽）", async () => {
    const { mod, events, ids, waiting } = await bootWithJobs(4);
    expect(stateOf(events, ids[3])).toBe("queued");

    // 只有第 1 个挂死（10 分钟无进度）；第 2/3 个持续有进展 → 各自的看门狗被重置
    vi.advanceTimersByTime(9 * 60_000);
    mod.touchInstallJob(ids[1]);
    mod.touchInstallJob(ids[2]);
    vi.advanceTimersByTime(9 * 60_000); // 累计 18 分钟——第 1 个越界判死，2/3 因心跳仍活

    const dead = lastJobs(events).find((j) => j.jobId === ids[0])!;
    expect(dead.state).toBe("settled");
    expect(dead.terminal).toBe("failed");
    expect(String(dead.error)).toMatch(/安装超时/);
    // 槽位归还 → 排队的第 4 个接手
    await waiting[3];
    expect(stateOf(events, ids[3])).toBe("running");
    // 未挂死的两个仍在跑（各看门狗独立计时）
    expect(stateOf(events, ids[1])).toBe("running");
    expect(stateOf(events, ids[2])).toBe("running");
  });

  it("进度心跳重置预算——持续有进展的健康长装不判死（判据是「还在动吗」）", async () => {
    const { mod, events } = await bootQueue();
    const { jobId } = mod.beginInstallJob({ pluginId: "demo-alive" });
    await mod.acquireInstallSlot(jobId);

    for (let i = 0; i < 5; i += 1) {
      vi.advanceTimersByTime(9 * 60_000); // 每次都在预算内打一次心跳
      mod.touchInstallJob(jobId);
    }
    expect(stateOf(events, jobId)).toBe("running"); // 累计 45 分钟仍活着

    vi.advanceTimersByTime(10 * 60_000 + 1); // 心跳断供 → 判死
    expect(stateOf(events, jobId)).toBe("settled");
  });

  it("排队态没有看门狗——等待不是挂死，不许被超时判死", async () => {
    const { mod, events, ids, waiting } = await bootWithJobs(4);

    // 在跑的 3 个持续有进展（活着）——累计 36 分钟，排队的第 4 个仍未被判死
    for (let i = 0; i < 4; i += 1) {
      vi.advanceTimersByTime(9 * 60_000);
      ids.slice(0, 3).forEach((id) => mod.touchInstallJob(id));
    }
    expect(stateOf(events, ids[3])).toBe("queued");

    mod.settleInstallJob(ids[0], "success", { success: true });
    await waiting[3];
    expect(stateOf(events, ids[3])).toBe("running");
  });
});
