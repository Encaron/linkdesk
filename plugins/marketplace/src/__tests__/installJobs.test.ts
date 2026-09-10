/**
 * 池侧 job 镜像单测——E6#73c 第 2 步（18 档 §五 I.6⑤ / I.7）。
 *
 * 壳侧 `install-queue` 把 job 表经公开事件面 `plugin:installJobs` 全量快照广播给池；市场视图据此
 * 画行徽标（⟳ 在跑 / ○ 等待 / ✗ 失败 + [重试]）。本档钉住池侧的四件事：
 *   1. 一张表多单并行——每行只认自己那个插件
 *   2. 同一插件多条 job 时按「在跑 > 排队 > 最新一条已出结果」挑（去重只对未结算生效，失败一条 + 重试一条
 *      必然同时在表里）
 *   3. 整表替换（事件即快照）——不做增量合并，上一帧不在表里的 job 立刻消失
 *   4. 行内文案：`message`（壳/主进程解析过的整句）优先，否则由 `stage` + `percent` 派生
 * 另钉订阅纪律（铁律 19）：`events.on` 随 hook 挂载注册、全部卸载即撤。
 * fixture 全虚构 id（硬约束 21）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { InstallJob } from "../services/installJobs";

const ORIG = (window as unknown as { linkdesk?: unknown }).linkdesk;

let emitJobs: ((payload: { jobs: InstallJob[] }) => void) | null = null;
let onCalls = 0;
let unsubCalls = 0;

/** 每个用例拿全新模块实例（快照 + 订阅引用计数都是模块级状态） */
async function boot() {
  vi.resetModules();
  emitJobs = null;
  onCalls = 0;
  unsubCalls = 0;
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    events: {
      on: (_channel: string, cb: (payload: { jobs: InstallJob[] }) => void) => {
        onCalls += 1;
        emitJobs = cb;
        return () => {
          unsubCalls += 1;
          emitJobs = null;
        };
      },
      emit: () => {},
    },
  };
  return import("../services/installJobs");
}

function job(partial: Partial<InstallJob> & { jobId: string; pluginId: string }): InstallJob {
  return { origin: "user", displayName: partial.pluginId, state: "queued", ...partial };
}

/** 推一帧快照——等壳侧广播。`act` 包住：状态更新要落进 React 才算数 */
function push(jobs: InstallJob[]): void {
  act(() => {
    emitJobs?.({ jobs });
  });
}

beforeEach(() => {
  (window as unknown as { linkdesk: unknown }).linkdesk = {};
});
afterEach(() => {
  (window as unknown as { linkdesk?: unknown }).linkdesk = ORIG;
});

describe("池侧 job 镜像——订阅与选取（E6#73c 第 2 步）", () => {
  it("多单并行各认各的——三个插件同时有 job，hook 只挑自己那个", async () => {
    const { useInstallJob } = await boot();
    const { result } = renderHook(() => useInstallJob("demo-alpha"));
    expect(result.current).toBeNull(); // 还没收到任何快照

    push([
      job({ jobId: "j1", pluginId: "demo-alpha", state: "running" }),
      job({ jobId: "j2", pluginId: "demo-beta" }),
      job({ jobId: "j3", pluginId: "demo-gamma", state: "settled", terminal: "failed", error: "HTTP 404" }),
    ]);
    expect(result.current?.jobId).toBe("j1");
  });

  it("同一插件多条 job——优先级 在跑 > 排队 > 最新一条已出结果", async () => {
    const { useInstallJob } = await boot();
    const { result } = renderHook(() => useInstallJob("demo-alpha"));

    // 失败一条已 settle，重试又排上队——行内要显示「等待安装中」，不是上一次的红字
    push([
      job({ jobId: "old-fail", pluginId: "demo-alpha", state: "settled", terminal: "failed", error: "HTTP 404" }),
      job({ jobId: "retry-queued", pluginId: "demo-alpha" }),
    ]);
    expect(result.current?.jobId).toBe("retry-queued");

    push([
      job({ jobId: "old-fail", pluginId: "demo-alpha", state: "settled", terminal: "failed" }),
      job({ jobId: "retry-queued", pluginId: "demo-alpha" }),
      job({ jobId: "retry-running", pluginId: "demo-alpha", state: "running" }),
    ]);
    expect(result.current?.jobId).toBe("retry-running");
  });

  it("最新一条已出结果——两条都 settle 时取表里靠后那条（快照保壳侧插入序）", async () => {
    const { useInstallJob } = await boot();
    const { result } = renderHook(() => useInstallJob("demo-alpha"));
    push([
      job({ jobId: "older", pluginId: "demo-alpha", state: "settled", terminal: "failed", error: "HTTP 404" }),
      job({ jobId: "newer", pluginId: "demo-alpha", state: "settled", terminal: "success" }),
    ]);
    expect(result.current?.jobId).toBe("newer");
  });

  it("事件即快照——整表替换，上一帧不在表里的 job 立刻消失（取消安装 = 壳侧把行整条撤掉）", async () => {
    const { useInstallJob } = await boot();
    const { result } = renderHook(() => useInstallJob("demo-alpha"));
    push([job({ jobId: "j1", pluginId: "demo-alpha", state: "running" })]);
    expect(result.current?.jobId).toBe("j1");
    push([]);
    expect(result.current).toBeNull();
  });

  it("订阅纪律（铁律 19）——挂载注册一次、多消费方共用一条、全部卸载才撤", async () => {
    const { useInstallJob } = await boot();
    const a = renderHook(() => useInstallJob("demo-alpha"));
    const b = renderHook(() => useInstallJob("demo-beta"));
    expect(onCalls).toBe(1); // 两个消费方共用一条订阅

    push([job({ jobId: "j1", pluginId: "demo-alpha", state: "running" })]);
    expect(a.result.current?.jobId).toBe("j1");
    expect(b.result.current).toBeNull();

    a.unmount();
    expect(unsubCalls).toBe(0); // 还有一个消费方——不许撤
    b.unmount();
    expect(unsubCalls).toBe(1);
  });

  it("行内文案——message（已解析整句）优先，否则由 stage + percent 派生", async () => {
    const { installJobLabel } = await boot();
    const t = (k: string, o?: Record<string, unknown>) => (o ? `${k}:${JSON.stringify(o)}` : k);
    expect(
      installJobLabel(t, job({ jobId: "j", pluginId: "p", state: "running", stage: "downloading", percent: 62 })),
    ).toBe('下载中 {{percent}}%:{"percent":62}');
    expect(installJobLabel(t, job({ jobId: "j", pluginId: "p", state: "running", stage: "extracting" }))).toBe("解压中...");
    expect(
      installJobLabel(
        t,
        job({ jobId: "j", pluginId: "p", state: "running", stage: "downloading", message: "下载失败，正在重试（1/2）" }),
      ),
    ).toBe("下载失败，正在重试（1/2）");
    expect(installJobLabel(t, null)).toBe("安装中...");
  });
});
