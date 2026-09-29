/**
 * debug-switches 单测——M5 `AI#17`（更新重启保留调试开关）/ `AI#18`（二次启动路由）。
 *
 * mock electron（`debug-switches.ts` 顶部 `import { app }`，只在「缺省 appendSwitch」那一支上用）——
 * 桩**不真 append**（那会改测试进程自己的开关表），只记进 `switchCalls`，见 `electron-mock.ts`。
 *
 * 逐条对判据（[M5-安装版.md](../docs/04-软件更新/已落地/AI友好化-全自动操作/03-任务档案/M5-安装版.md)）：
 *   1. 🔴 **白名单**（`AI#17` 风险条原文「⛔ 不要整串 `argv` 无脑继承」）：只认 CDP 家族那两个；
 *      `--user-data-dir` / 无值开关 / 绝对路径 / 别的 `--xxx` 一律不进记录。
 *   2. 🔴 **值校验**：端口非数字 / `0`（随机端口）/ 越界一律丢——写进记录再跨重启 = 脏值变成持久状态。
 *   3. 🔴 **只增不减**（`AI#18` 判据的 fail-safe 面）：请求里**没有**调试开关（双击图标）⇒ **不重启**，
 *      否则一次误双击就掐掉 AI 正在用的端口。
 *   4. 🔴 **幂等**：请求已生效 ⇒ 不重启（否则新实例收到同一请求会自激成重启环）。
 *   5. 🔴 **同名只留一个值**：换端口时旧值必须先摘掉（Chromium 取首取尾属实现定义，⛔ 不赌）。
 *   6. **一份真相**：`applyDebugSwitches` 把 appendSwitch 生效的开关推回 argv——安装腿写记录、
 *      并集裁决、两处缺省 `app.relaunch()` 都只读 argv。
 *   7. 🔴 **换端口这一跳不能立刻重启**（`freePorts` / `waitRestartWindow`）：二次启动那个进程自己绑着
 *      请求的端口，relaunch 出来的并集进程抢不过它、而 CDP 端口**绑不上不重试** ⇒ 打包态实测 5/5
 *      得到「App 跑着但没有调试口」。等的是**请求里的**端口（等本进程自己那个 = 死等）。
 * 全部 fixture 为虚构值（端口 9222 / 9333，硬约束 21）。
 */

import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeEach } from "vitest";

// 🔴 共享桩必须先于 SUT import（见 electron-mock.ts 头注「纪律」）
import { electronMock } from "./electron-mock.js";

import {
  applyDebugSwitches,
  extractDebugSwitches,
  planDebugAdoption,
  probePortFree,
  sanitizeDebugSwitches,
  waitRestartWindow,
} from "./debug-switches.js";
import type { ApplyDebugSwitchesDeps, DebugAdoptionPlan, RestartWindowDeps } from "./debug-switches.js";

/** 裁决替身——顺带给导出类型一个消费方 */
function plan(requested: string[], base: string[] = []): DebugAdoptionPlan {
  return planDebugAdoption(requested, base);
}

/** appendSwitch 观测替身（argv 可注入 ⇒ 不污染测试进程） */
function spy(argv: string[] = []): { deps: ApplyDebugSwitchesDeps; calls: string[] } {
  const calls: string[] = [];
  return { deps: { argv, appendSwitch: (name, value) => calls.push(`--${name}=${value}`) }, calls };
}

beforeEach(() => {
  electronMock.switchCalls.length = 0;
});

describe("extractDebugSwitches：白名单 + 值校验（AI#17 的「别整串继承」）", () => {
  it("只认白名单内的 `--name=value`：去重保序、名字大小写不敏感且落回小写", () => {
    expect(
      extractDebugSwitches([
        "--remote-debugging-port=9222",
        "--Remote-Debugging-Port=9222", // 同一个开关的另一种写法 ⇒ 归一后去重
        "--remote-allow-origins=*",
        "--remote-debugging-port=9333",
      ]),
    ).toEqual(["--remote-debugging-port=9222", "--remote-allow-origins=*", "--remote-debugging-port=9333"]);
  });

  it("⛔ 面很窄：`--user-data-dir` / 无值开关 / 空格分隔形 / 绝对路径 / 安装器开关一律不收", () => {
    expect(
      extractDebugSwitches([
        "--user-data-dir=D:/tmp/ldk-lab",
        "--force-run",
        "--updated",
        "--remote-debugging-port", // 无值：白名单里两个开关都必须带值
        "--remote-debugging-port 9222", // 空格分隔形不是 Chromium 的写法
        "D:/proj/main.ts",
        "/S",
      ]),
    ).toEqual([]);
  });

  it("⛔ 对外监听那一个（`remote-debugging-address`）**不在**白名单：不跨重启保留", () => {
    expect(extractDebugSwitches(["--remote-debugging-address=0.0.0.0", "--remote-debugging-port=9222"])).toEqual([
      "--remote-debugging-port=9222",
    ]);
  });

  it("端口值校验：非数字 / 0（随机端口）/ 越界丢；allow-origins 带空白丢", () => {
    expect(extractDebugSwitches(["--remote-debugging-port=abc"])).toEqual([]);
    expect(extractDebugSwitches(["--remote-debugging-port=0"])).toEqual([]);
    expect(extractDebugSwitches(["--remote-debugging-port=99999"])).toEqual([]);
    expect(extractDebugSwitches(["--remote-debugging-port=65535"])).toEqual(["--remote-debugging-port=65535"]);
    expect(extractDebugSwitches(["--remote-allow-origins=a b"])).toEqual([]);
  });
});

describe("sanitizeDebugSwitches：落盘形状（记录是盘上的文件 ⇒ 白名单两道都强制）", () => {
  it("非数组 → 空数组；元素不是字符串 / 白名单外 / 值不合法一律静默丢", () => {
    expect(sanitizeDebugSwitches(undefined)).toEqual([]);
    expect(sanitizeDebugSwitches("--remote-debugging-port=9222")).toEqual([]);
    expect(
      sanitizeDebugSwitches([
        "--remote-debugging-port=9222",
        42,
        null,
        "--user-data-dir=D:/tmp/x",
        "--remote-debugging-port=nope",
      ]),
    ).toEqual(["--remote-debugging-port=9222"]);
  });
});

describe("applyDebugSwitches：生效 + 推回 argv（一份真相）", () => {
  it("逐条 appendSwitch，并把规范化后的开关**推回 argv**（安装腿/并集裁决都只读 argv）", () => {
    const { deps, calls } = spy([]);
    const applied = applyDebugSwitches(["--remote-debugging-port=9222"], deps);

    expect(applied).toEqual(["--remote-debugging-port=9222"]);
    expect(calls).toEqual(["--remote-debugging-port=9222"]);
    expect(deps.argv).toEqual(["--remote-debugging-port=9222"]);
  });

  it("argv 里已有的开关不再 append、也不重复堆（新起的进程本来就带着它，Chromium 自己已取走）", () => {
    const { deps, calls } = spy(["--remote-debugging-port=9222"]);
    expect(applyDebugSwitches(["--remote-debugging-port=9222"], deps)).toEqual(["--remote-debugging-port=9222"]);
    expect(calls).toEqual([]);
    expect(deps.argv).toEqual(["--remote-debugging-port=9222"]);
  });

  it("🔴 没有开关 → 一条 append 都不发：默认不监听不许被这条路径破坏", () => {
    const { deps, calls } = spy([]);
    expect(applyDebugSwitches(undefined, deps)).toEqual([]);
    expect(applyDebugSwitches([], deps)).toEqual([]);
    expect(applyDebugSwitches(["--user-data-dir=D:/tmp/x"], deps)).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("缺省 appendSwitch 落到 `app.commandLine`（共享桩记账）", () => {
    applyDebugSwitches(["--remote-debugging-port=9222"], { argv: [] });
    expect(electronMock.switchCalls).toEqual([{ name: "remote-debugging-port", value: "9222" }]);
  });
});

describe("planDebugAdoption：只增不减 + 幂等 + 同名只留一个值（AI#18 的裁决核）", () => {
  const BASE = ["--user-data-dir=D:/tmp/ldk-lab", "--remote-debugging-port=9222"];

  it("🔴 请求里没有调试开关（双击图标）⇒ 不重启、不丢参数（误双击不许掐掉 AI 的连接）", () => {
    const p = plan([], BASE);
    expect(p.restart).toBe(false);
    expect(p.adopted).toEqual([]);
    expect(p.args).toEqual(BASE); // 现状原样（唯一的还原路径 = 退出重开 / M4 的设置开关）
  });

  it("🔴 请求已生效 ⇒ 不重启（幂等：否则新实例收到同一请求会自激成重启环）", () => {
    const p = plan(["--remote-debugging-port=9222"], BASE);
    expect(p.restart).toBe(false);
    expect(p.adopted).toEqual([]);
  });

  it("🔴 换端口 ⇒ 重启，且 args 里**只有新值**（旧的 9222 必须先摘掉）", () => {
    const p = plan(["--remote-debugging-port=9333"], BASE);
    expect(p.restart).toBe(true);
    expect(p.adopted).toEqual(["--remote-debugging-port=9333"]);
    expect(p.args).toEqual(["--user-data-dir=D:/tmp/ldk-lab", "--remote-debugging-port=9333"]);
    expect(p.args).not.toContain("--remote-debugging-port=9222");
  });

  it("本进程没开端口 + 请求带端口 ⇒ 重启（AI 最常见的用法：软件已在跑，带参再来一次）", () => {
    const p = plan(["--remote-debugging-port=9222"], ["--user-data-dir=D:/tmp/ldk-lab"]);
    expect(p.restart).toBe(true);
    expect(p.args).toEqual(["--user-data-dir=D:/tmp/ldk-lab", "--remote-debugging-port=9222"]);
  });

  it("请求里的非开关参数（文件路径）一并交给新进程——「带开关 + 顺带开文件」不丢文件", () => {
    const p = plan(["D:/proj/main.ts", "--remote-debugging-port=9333"], BASE);
    expect(p.args).toEqual([
      "--user-data-dir=D:/tmp/ldk-lab",
      "D:/proj/main.ts",
      "--remote-debugging-port=9333",
    ]);
  });

  it("重复参数按整串去重（同一份快捷方式再来一次 = 参数一模一样，args 不许堆两遍）", () => {
    const p = plan(BASE, BASE);
    expect(p.args).toEqual(BASE);
  });

  it("🔴 `freePorts` = **请求里的**端口（要等的是它）：换端口那一跳的等待对象", () => {
    // 等「合并结果里的 9333」也对，但等「本进程自己绑着的 9222」= 死等（本进程退出前不释放）
    expect(plan(["--remote-debugging-port=9333"], BASE).freePorts).toEqual([9333]);
    expect(plan(["--remote-debugging-port=9222"], BASE).freePorts).toEqual([9222]);
  });

  it("🔴 请求里没带端口 ⇒ `freePorts` 为空（只剩 settle 那一半，见 `waitRestartWindow`）", () => {
    expect(plan([], BASE).freePorts).toEqual([]);
    // 只换别的开关：端口无从等起，但 settle 仍要过（避开二次启动进程没退场的那一跳）
    expect(plan(["--remote-allow-origins=*"], BASE).freePorts).toEqual([]);
  });
});

describe("waitRestartWindow：重启窗口 = 请求的端口都空闲 且 过了 settle（AI#18 竞态的修）", () => {
  /** 假时钟：`sleep` 推进 `now`，全程不碰真端口、真等待 */
  function clock(): { deps: RestartWindowDeps; elapsed: () => number } {
    let t = 0;
    const deps: RestartWindowDeps = {
      now: () => t,
      sleep: async (ms: number) => {
        t += ms;
      },
    };
    return { deps, elapsed: () => t };
  }

  it("🔴 请求里没有端口 ⇒ 一问不探（`isPortFree` 零调用），只把 settle 走满", async () => {
    const c = clock();
    let calls = 0;
    const r = await waitRestartWindow([], {
      ...c.deps,
      isPortFree: async () => {
        calls += 1;
        return true;
      },
    });
    expect(calls).toBe(0); // 没端口就没什么可探的（探测自带 400ms 超时，白等）
    expect(r).toEqual({ freed: [], waitedMs: 900, timedOut: false }); // 900 = 实测寿命上界
    expect(c.elapsed()).toBe(900);
  });

  it("端口一直空闲但 settle 未到 ⇒ **不许提前返回**（这正是打包态 5/5 失败的那一跳）", async () => {
    const c = clock();
    const r = await waitRestartWindow([9333], { ...c.deps, isPortFree: async () => true });
    expect(r.timedOut).toBe(false);
    expect(r.waitedMs).toBe(900); // 端口第一问就空，仍等满 settle
    expect(c.elapsed()).toBe(900);
  });

  it("端口先被占、后放开 ⇒ 等到放开、并把 settle 走满才返回", async () => {
    const c = clock();
    const r = await waitRestartWindow([9333], {
      ...c.deps,
      settleMs: 300,
      isPortFree: async () => c.elapsed() >= 500, // 500ms 时那个进程才退场
    });
    expect(r.freed).toEqual([true]);
    expect(r.timedOut).toBe(false);
    // 两个条件**各自满足**即返回：settle 从起始算（= 二次启动进程被拒那一刻，它的寿命也从那时起算），
    // 不是从「端口放开」再叠一份——端口放开本身就意味着它已退场，再叠就是白等。
    expect(r.waitedMs).toBe(500);
  });

  it("🔴 到超时仍被占 ⇒ `timedOut`（调用方照旧重启：不许把用户晾在这儿）", async () => {
    const c = clock();
    const r = await waitRestartWindow([9333], { ...c.deps, isPortFree: async () => false });
    expect(r.freed).toEqual([false]);
    expect(r.timedOut).toBe(true);
    expect(r.waitedMs).toBeGreaterThanOrEqual(8000); // 超时上限（默认 8s）
  });

  it("多个端口：**都得空**才返回（有一个还被占就继续等）", async () => {
    const c = clock();
    const up = new Set([9333]); // 9333 一直占着，9222 立刻空
    const r = await waitRestartWindow([9222, 9333], {
      ...c.deps,
      timeoutMs: 1000,
      settleMs: 0,
      isPortFree: async (p) => !up.has(p),
    });
    expect(r.timedOut).toBe(true);
    expect(r.freed).toEqual([true, false]);
  });
});

describe("probePortFree：有人听 = 占用（真回环连接，非查表）", () => {
  it("有服务在听 ⇒ false；关掉 ⇒ true", async () => {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    try {
      await expect(probePortFree(port)).resolves.toBe(false);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    // 没人听 ⇒ 连接被拒（ECONNREFUSED）⇒ 判空闲
    await expect(probePortFree(port)).resolves.toBe(true);
  });
});
