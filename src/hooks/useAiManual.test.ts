/**
 * useAiManual——AI 操作手册壳侧数据源单测（M3 `AI#16`）。
 *
 * 逐条钉住 `useAiManual.ts` 文件头那几条**写反了也照样能跑**的约束：
 * ① 取数**一次就够**——成功后 `primeAiManual` 再调不许再发 IPC；
 * ② 并发第二次调用**复用同一条 in-flight Promise**（硬约束 13 精神：返回 undefined 另起一条 = 双取）；
 * ③ 🔴 **失败不固化**——态转 `empty`（不是永远 `loading`），且下一次 `primeAiManual` 会**再试一次**。
 *    这条是本文件的核心负控：把失败记成「已就绪且永远为空」或把态留在 `loading`，
 *    用户就会「本次会话永远看不到手册 / 永远停在骨架」；
 * ④ **三态判定全在 `toAiManualData` 一处**：`chapters: []` 与「取不到」都落 `empty`
 *    （对读者是同一件事），零章不是错误态；
 * ⑤ **DTO 引用稳态恒等**——态未变时 `getAiManualState()` 返回**同一个对象**
 *    （🔴 它进 `usePoolSync` 主推送 effect 的 deps，现算新对象 = 无限重渲染）。
 *
 * 🔴 被测模块持有**模块级单例**（`_data`/`_raw`/`_inflight`）⇒ 每个用例 `vi.resetModules()` +
 * 动态 import 拿一份干净模块（对标 `useAbout.test.ts` 的单例手法）。
 *
 * fixture 全虚构（硬约束 21）：版本 `9.9.9`、章 id `0N-demo-x`、正文 `演示正文…`、
 * 目录 `C:\\demo\\resources\\ai-manual`。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

interface Payload {
  version: string;
  chapters: Array<{ id: string; title: string; markdown: string }>;
  dir: string;
}

/** 全量手册回包（fixture） */
const MANUAL: Payload = {
  version: "9.9.9",
  chapters: [
    { id: "00-demo-home", title: "演示章首", markdown: "# 演示章首\n\n演示正文甲" },
    { id: "01-demo-path", title: "演示章乙", markdown: "# 演示章乙\n\n演示正文乙" },
  ],
  dir: "C:\\demo\\resources\\ai-manual",
};

type Mod = typeof import("./useAiManual");

let mod: Mod;
/** `getAiManual` 被调了几次——①②的核心判据 */
let calls: number;
/** 挂起的 resolver 队列（手控「谁先回」）；`null` = 那一次已被放行（位置保留防下标漂移） */
let pending: Array<{ resolve: (v: Payload) => void } | null>;
/** 下一次取数怎么回 */
let nextMode: "resolve" | "reject";
/** 下一次取数成功时给哪份数据 */
let nextValue: Payload;

/** 装一次壳侧取数替身；`withManual` 控制 `app.getAiManual` 在不在（非壳环境的兜底路） */
function installStub(withManual = true): void {
  calls = 0;
  pending = [];
  nextMode = "resolve";
  nextValue = MANUAL;

  const stub: Record<string, unknown> = {};
  if (withManual) {
    stub.app = {
      getAiManual: () => {
        calls += 1;
        if (nextMode === "reject") return Promise.reject(new Error("演示取数失败"));
        return new Promise<Payload>((resolve) => { pending.push({ resolve }); });
      },
    };
  }
  (window as unknown as { linkdesk: unknown }).linkdesk = stub;
}

/** 放掉一串微任务——`_load` 在取数回来之后还有置态 + 通知两跳 */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

/** 放行最后一个挂起的请求（已被放过 ⇒ 只 flush，不报错） */
async function settle(): Promise<void> {
  let at = -1;
  for (let i = pending.length - 1; i >= 0; i -= 1) if (pending[i]) { at = i; break; }
  const slot = at >= 0 ? pending[at] : null;
  if (slot) {
    pending[at] = null;
    slot.resolve(nextValue);
  }
  await flush();
}

/** 取数 → 放行 → 等到落地（顺序不能反：先 `await prime` 会永久挂住） */
async function primeAndSettle(): Promise<void> {
  const p = mod.primeAiManual();
  await settle();
  await p;
}

beforeEach(async () => {
  vi.resetModules();
  installStub();
  mod = await import("./useAiManual");
});

describe("useAiManual（①② 只拉一次 / 并发复用）", () => {
  it("成功后 `primeAiManual` 再调**不再发 IPC**，态保持 content", async () => {
    await primeAndSettle();
    expect(calls).toBe(1);
    expect(mod.getAiManualState().state).toBe("content");

    await mod.primeAiManual();
    expect(calls).toBe(1);
  });

  it("并发两次 `primeAiManual` 只发一条 IPC（复用 in-flight，不另起一条）", async () => {
    const a = mod.primeAiManual();
    const b = mod.primeAiManual();
    expect(calls).toBe(1);

    await settle();
    await Promise.all([a, b]);
    expect(mod.getAiManualState().state).toBe("content");
  });
});

describe("useAiManual（③ 失败不固化——核心负控）", () => {
  it("取数失败 ⇒ 态转 `empty`（不是永远 loading），且下一次会**再试一次**", async () => {
    nextMode = "reject";
    await primeAndSettle();

    const failed = mod.getAiManualState();
    expect(failed.state).toBe("empty"); // ⚠️ 不是 loading：不许把池永远摁在骨架上
    expect(calls).toBe(1);

    nextMode = "resolve";
    await primeAndSettle();
    expect(calls).toBe(2); // 失败没被缓存成「本会话不再试」
    expect(mod.getAiManualState().state).toBe("content");
  });

  it("非壳环境（`window.linkdesk` 没有 app 面）⇒ `empty` 且 `dir` 为空串，不抛", async () => {
    installStub(false);
    await primeAndSettle();

    const data = mod.getAiManualState();
    expect(data.state).toBe("empty");
    expect(data.state === "empty" && data.dir).toBe("");
  });
});

describe("useAiManual（④ 三态判定集中一处）", () => {
  it("`ready` 之前恒 `loading`（池画骨架的唯一判据）", () => {
    expect(mod.getAiManualState()).toEqual({ state: "loading" });
  });

  it("零章回包（这个构建没带手册）⇒ `empty` 且**带目录**（空态要能指路）", async () => {
    nextValue = { version: "9.9.9", chapters: [], dir: "C:\\demo\\resources\\ai-manual" };
    await primeAndSettle();

    const data = mod.getAiManualState();
    expect(data.state).toBe("empty");
    expect(data.state === "empty" && data.dir).toBe("C:\\demo\\resources\\ai-manual");
  });

  it("有章 ⇒ `content`：版本号与章清单**原样**搬运（不排序、不 `t()`、不改写标题）", async () => {
    await primeAndSettle();

    const data = mod.getAiManualState();
    if (data.state !== "content") throw new Error(`应为 content，实为 ${data.state}`);
    expect(data.version).toBe("9.9.9");
    expect(data.chapters.map((c) => c.id)).toEqual(["00-demo-home", "01-demo-path"]);
    expect(data.chapters[0].title).toBe("演示章首");
    expect(data.chapters[0].markdown).toContain("演示正文甲");
  });
});

describe("useAiManual（⑤ DTO 引用稳态恒等——进推送 deps 的前提）", () => {
  it("态未变时 `getAiManualState()` 返回**同一个对象**（现算新对象 = 主推送 effect 无限重跑）", async () => {
    await primeAndSettle();

    expect(mod.getAiManualState()).toBe(mod.getAiManualState());
  });

  it("态真变时换新对象（引用变化 = 推送重算的信号，不能反成恒等）", async () => {
    const before = mod.getAiManualState(); // loading
    await primeAndSettle();
    expect(mod.getAiManualState()).not.toBe(before);
  });

  it("`resetAiManualForTest` 回 loading 且清掉成功缓存（下一次会重新取数）", async () => {
    await primeAndSettle();
    mod.resetAiManualForTest();

    expect(mod.getAiManualState()).toEqual({ state: "loading" });
    const again = mod.primeAiManual();
    expect(calls).toBe(2);
    await settle();
    await again;
  });
});
