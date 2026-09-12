/**
 * useReleaseNotes——发行说明壳侧数据源单测（E6#57.13b/c/d）。
 *
 * 逐条钉住 `useReleaseNotes.ts` 文件头那几条**写反了也照样能跑**的约束：
 * ① 三态由**取数结果**唯一决定（成功 content / 失败无缓存 empty / 失败有内存缓存 **原地保持**）；
 * ② **缓存命中不经过加载态**——第二次取数时态不许闪回 `loading`（「闪骨架」那个 bug 的判据）；
 * ③ 竞态**只认最后一次**（先发后回的那次必须被丢弃）；
 * ④ 横幅只在「取最新一版」这条路上挂，且**记的是宣告的那一版**——点历史版本不许冒出「检测到新版本」；
 * ⑤ `primeReleaseNotes` 的**同步段**必须真的同步（返回时态已设）——这是 `openTab` 前不许有 await 的判据；
 * ⑥ 启动账（`lastSeenVersion`）跨 `readSync`/`read` 两源。
 *
 * 🔴 被测模块持有**模块级单例**（`_phase`/`_seq`/`_listUrl`）⇒ 每个用例 `vi.resetModules()` +
 * 动态 import 拿一份干净模块（对标 `useUpdateNotifications.test.ts` 的单例手法）；静态 import
 * 会让上一个用例的态漏进下一个。
 *
 * fixture 全虚构（硬约束 21）：版本号 9.9.9/9.9.8、仓库 `demo/demo-repo` 走 `.invalid` 保留域语义
 * （`api.github.com` 前缀是**被测代码的判据**，不能改）、正文用 `演示正文`。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReleaseNotes } from "../core/types/ipc/update";
import type { PoolReleaseNotesData } from "../core/types/pool/poolLayout";

/** 最新一版（fixture） */
const NOTES: ReleaseNotes = {
  source: "network",
  version: "9.9.9",
  publishedAt: "2026-01-01T00:00:00Z",
  body: "# 演示标题\n\n演示正文",
  htmlUrl: "https://demo.invalid/releases/v9.9.9",
  historical: [
    { version: "9.9.9", publishedAt: "2026-01-01T00:00:00Z" },
    { version: "9.9.8", publishedAt: "2025-12-01T00:00:00Z" },
  ],
};
/** 历史一版——正文不同，用来验「切换版本真的换了正文」 */
const OLD: ReleaseNotes = {
  ...NOTES,
  version: "9.9.8",
  publishedAt: "2025-12-01T00:00:00Z",
  body: "# 旧版标题\n\n旧版正文",
};
/** 🔴 `listPageUrl` 的**唯一**合法基址形态：`updateUrl` 去掉 `/latest` 后仍是 API 仓库端点 */
const UPDATE_URL = "https://api.github.com/repos/demo/demo-repo/releases/latest";
const LIST_URL = "https://github.com/demo/demo-repo/releases";

type Mod = typeof import("./useReleaseNotes");

let mod: Mod;
/** 每次 `getReleaseNotes` 的入参逐次记录——「显式要某一版」与「要最新」在实现里是同一入口 */
let calls: Array<string | undefined>;
/**
 * 挂起的 resolver 队列——竞态用例要手控「谁先回」。
 * `null` = 那一次已经被放行过（**位置保留**，否则下标会随时间漂移，`settle(1)` 就不是原来那一次了）。
 */
let pending: Array<{ resolve: (n: ReleaseNotes) => void } | null>;
/** 下一次取数怎么回：`resolve` = 成功，`reject` = 失败（模拟断网/404） */
let nextMode: "resolve" | "reject";
/** 下一次取数成功时给哪份数据 */
let nextValue: ReleaseNotes;

/** 装一次壳侧取数替身；`withProduct` 控制 `app.getProductInfo` 在不在（验「拿不到链接就不画」） */
function installStub(withProduct = true): void {
  calls = [];
  pending = [];
  nextMode = "resolve";
  nextValue = NOTES;

  const stub: Record<string, unknown> = {
    update: {
      getReleaseNotes: (version?: string) => {
        calls.push(version);
        if (nextMode === "reject") return Promise.reject(new Error("演示取数失败"));
        return new Promise<ReleaseNotes>((resolve) => { pending.push({ resolve }); });
      },
    },
  };
  if (withProduct) {
    stub.app = {
      getProductInfo: async () => ({ product: { updateUrl: UPDATE_URL }, runtime: {} }),
    };
  }
  (window as unknown as { linkdesk: unknown }).linkdesk = stub;
}

/**
 * 读当前态并**断言它是某一态**——返回值的类型随之收窄，好让后面几行直接读该态的字段。
 *
 * 为什么需要它：`PoolReleaseNotesData` 是三态判别联合，`expect(data.state).toBe("empty")`
 * **不收窄类型**（`expect` 不是类型守卫）⇒ 紧跟其后的 `data.listUrl` 过不了 tsc。
 * 手写 `if (data.state !== "empty") throw` 散在各处也行，但「观察点 + 断言」成对出现时
 * 漏写一处的代价是 tsc 报错，不如收成一个函数。
 */
function expectState<S extends PoolReleaseNotesData["state"]>(
  state: S,
): Extract<PoolReleaseNotesData, { state: S }> {
  const data = mod.getReleaseNotesState();
  if (data.state !== state) throw new Error(`应为 ${state}，实为 ${data.state}`);
  return data as Extract<PoolReleaseNotesData, { state: S }>;
}

/** 放掉一串微任务——`loadReleaseNotes` 在取数回来之后还有 `_ensureListUrl` 那一跳 */
async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
}

/**
 * 放行挂起的请求。`index < 0`（默认）= 放**最后**一个还挂着的那个（常用的「就这一次」）；
 * 给下标 = 精确放某一次（竞态用例要按相反顺序放）；那一次不存在（失败路径没挂过 resolver）
 * 或已被放过 ⇒ 只 flush 微任务，不报错。
 */
async function settle(index = -1, value: ReleaseNotes = nextValue): Promise<void> {
  let at = index;
  if (at < 0) {
    // 手写倒扫（不用 `findLastIndex`）——运行时版本不当回事的地方不值得埋一颗
    for (let i = pending.length - 1; i >= 0; i -= 1) if (pending[i]) { at = i; break; }
  }
  const slot = at >= 0 ? pending[at] : null;
  if (slot) {
    pending[at] = null;
    slot.resolve(value);
  }
  await flush();
}

/** 放行全部挂起的请求（按发起顺序）——「两个请求都发了，都要放掉」的用例 */
async function settleAll(value: ReleaseNotes = nextValue): Promise<void> {
  for (let i = 0; i < pending.length; i += 1) {
    const slot = pending[i];
    if (!slot) continue;
    pending[i] = null;
    slot.resolve(value);
  }
  await flush();
}

beforeEach(async () => {
  vi.resetModules();
  localStorage.clear(); // `lastSeenVersion` 走 StorageService→localStorage，逐用例清
  installStub();
  mod = await import("./useReleaseNotes");
});

afterEach(() => {
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

/* ── ① 三态 ── */

describe("useReleaseNotes（① 三态由取数结果唯一决定）", () => {
  it("成功 → content：版本 / 副标题 / 通道 / 正文 / 历史行 / 列表链接齐备", async () => {
    const p = mod.loadReleaseNotes();
    await settle();
    await p;

    const data = mod.getReleaseNotesState();
    expect(data.state).toBe("content");
    if (data.state !== "content") return;
    expect(data.version).toBe("9.9.9");
    expect(data.body).toBe(NOTES.body);
    expect(data.historical).toHaveLength(2);
    expect(data.historical[1]).toEqual({ version: "9.9.8", dateLabel: "12-01" });
    // 副标题 = 「{{日期}} · 稳定通道」的壳侧成品（池零自产文本）
    expect(data.subtitle).toMatch(/2026/);
    // 「所有版本」链接由 `product.updateUrl` 推出（api.…/repos/O/R → github.com/O/R）
    expect(data.listUrl).toBe(LIST_URL);
    expect(data.banner).toBeUndefined();
  });

  it("失败 + 无缓存 → empty（带 GitHub 链接，一个字的失败原因都不传）", async () => {
    nextMode = "reject";
    const p = mod.loadReleaseNotes();
    await settle();
    await p;

    const data = expectState("empty");
    expect(data.listUrl).toBe(LIST_URL);
    // 🔴 失败原因**不进载荷**：错误码过不了 IPC（壳读不到 code），标一个具体原因会撒谎
    expect(JSON.stringify(data)).not.toContain("network");
  });

  it("🔴 失败 + **有**内存缓存 → 原地保持 content，不降级（缓存兜底）", async () => {
    const p1 = mod.loadReleaseNotes();
    await settle();
    await p1;
    expect(mod.getReleaseNotesState().state).toBe("content");

    nextMode = "reject";
    const p2 = mod.loadReleaseNotes();
    await settle();
    await p2;

    const data = mod.getReleaseNotesState();
    expect(data.state).toBe("content");
    if (data.state !== "content") return;
    expect(data.body).toBe(NOTES.body); // 还是原来那一版，没被清成空态
  });
});

/* ── ② 缓存命中不经过加载态 ── */

describe("useReleaseNotes（② 缓存命中不经过加载态）", () => {
  it("🔴 已有内容时第二次取数**同步**不回 loading（不闪骨架）", async () => {
    const p1 = mod.loadReleaseNotes();
    await settle();
    await p1;

    // 🔴 判据是**同步那一帧**：`loadReleaseNotes` 的 `_emit(loading)` 段在首个 await 之前跑完，
    //    所以「调用返回时态还是不是 content」正好等价于「这一帧会不会画出骨架」。
    const p2 = mod.loadReleaseNotes("9.9.8");
    expect(mod.getReleaseNotesState().state).toBe("content");
    await settle();
    await p2;
  });

  it("负控（正控的证伪面）：**空态/首帧**下同一处调用**确实**同步落了 loading", async () => {
    // 同一个观察点、同一个手法——只是启动态是 empty ⇒ 实现若把「已有内容」这道判断删掉，
    // 上面那条会红；反过来这条证明「上面那条绿」不是因为这段代码根本不发 loading。
    nextMode = "reject";
    const p1 = mod.loadReleaseNotes();
    await settle();
    await p1;
    expect(mod.getReleaseNotesState().state).toBe("empty");

    nextMode = "resolve";
    const p2 = mod.loadReleaseNotes();
    expect(mod.getReleaseNotesState().state).toBe("loading");
    await settle();
    await p2;
  });
});

/* ── ③ 竞态 ── */

describe("useReleaseNotes（③ 竞态只认最后一次）", () => {
  it("先发的后回 ⇒ 丢弃它（否则「选中的是 A 版、正文是 B 版」）", async () => {
    const slow = mod.loadReleaseNotes("9.9.8"); // 第一次
    const fast = mod.loadReleaseNotes("9.9.9"); // 第二次（更晚发）
    expect(calls).toEqual(["9.9.8", "9.9.9"]);

    await settle(1); // 后发的先回
    await fast;
    expect(expectState("content").version).toBe("9.9.9");

    nextValue = OLD;
    await settle(0); // 先发的后回——必须被序号守卫丢掉
    await slow;
    expect(expectState("content").version).toBe("9.9.9");
  });
});

/* ── ④ 横幅 ── */

describe("useReleaseNotes（④ 首启横幅）", () => {
  it("`primeReleaseNotes({banner:true})` → 取最新版时挂上横幅（句子在壳侧成完）", async () => {
    const p = mod.primeReleaseNotes({ banner: true });
    await settle();
    await p;

    const data = mod.getReleaseNotesState();
    expect(data.state).toBe("content");
    if (data.state !== "content") return;
    expect(data.banner).toContain("9.9.9");
  });

  it("🔴 负控：显式要**某一版**时**不**挂横幅（否则点历史版本会冒出「检测到新版本」）", async () => {
    // 先制造「要挂横幅但版本还不知道」的账
    const p1 = mod.primeReleaseNotes({ banner: true });
    await settle();
    await p1;

    // 再按「用户点了历史版本」取一次——`version` 显式给出 ⇒ 这次不该是「新版本」
    // （两个请求都要放行：`primeReleaseNotes` 那次会被序号守卫丢掉，但它的 Promise 也得落定）
    nextValue = OLD;
    const p2 = mod.primeReleaseNotes({ banner: true });
    mod.selectReleaseNotesVersion("9.9.8");
    await settleAll();
    await p2;

    const data = mod.getReleaseNotesState();
    if (data.state !== "content") throw new Error("应停在 content");
    expect(data.version).toBe("9.9.8");
    expect(data.banner).toBeUndefined();
  });

  it("「知道了」删掉 banner 键，正文与版本原地不动", async () => {
    const p = mod.primeReleaseNotes({ banner: true });
    await settle();
    await p;

    mod.dismissReleaseNotesBanner();
    const data = mod.getReleaseNotesState();
    if (data.state !== "content") throw new Error("应停在 content");
    expect("banner" in data).toBe(false);
    expect(data.version).toBe("9.9.9");
    expect(data.body).toBe(NOTES.body);
  });
});

/* ── ⑤ primeReleaseNotes 的同步段 ── */

describe("useReleaseNotes（⑤ 开标签页前的顺序保证）", () => {
  it("🔴 `primeReleaseNotes` 返回时态**已经**设好（返回的是只含取数尾巴的 Promise）", () => {
    const p = mod.primeReleaseNotes({ banner: true });
    // 同步一帧都不等：态已落 loading ⇒ `openTab` 紧接着同步发出时，池第一帧读到的就是它
    expect(mod.getReleaseNotesState().state).toBe("loading");
    void p;
  });

  it("非壳环境（无 `linkdesk.update`）⇒ 静默不抛，态就地不动", async () => {
    delete (window as unknown as { linkdesk?: unknown }).linkdesk;
    await expect(mod.loadReleaseNotes()).resolves.toBeUndefined();
    expect(mod.getReleaseNotesState().state).toBe("loading");
  });
});

/* ── ⑥ 启动账 ── */

describe("useReleaseNotes（⑥ lastSeenVersion 的两源读写）", () => {
  it("写进去读得回来；没写过 = null", async () => {
    expect(await mod.readLastSeenVersion()).toBeNull();
    await mod.writeLastSeenVersion("9.9.9");
    expect(await mod.readLastSeenVersion()).toBe("9.9.9");
  });
});

/* ── ⑦ prewarm ── */

describe("useReleaseNotes（⑦ 启动预热）", () => {
  it("预热 = 取一次最新版，但**不开**标签页（本模块不知道标签页的存在）", async () => {
    mod.prewarmReleaseNotes();
    expect(mod.getReleaseNotesState().state).toBe("loading");
    await settle();
    expect(mod.getReleaseNotesState().state).toBe("content");
    expect(calls).toEqual([undefined]);
  });

  it("已经有数据 ⇒ 预热不重复出网", async () => {
    const p = mod.loadReleaseNotes();
    await settle();
    await p;

    mod.prewarmReleaseNotes();
    expect(calls).toHaveLength(1);
  });
});
