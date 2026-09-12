/**
 * versionDowngradeNotice——应用层降级提示的判据单测（E6#42d 判据子项）。
 *
 * 本文件的**全部价值在那张判定表**，以及两条**变异负对照**——它们把文件头写的两条陷阱变成红灯：
 *
 * | 情形 | 写账 | 提示 |
 * |:--|:--|:--:|
 * | 无记录（`!exists`） | 写 `current`（播种） | ✗ |
 * | 有记录但**读不出来** | 🔴 **不写、不动** | ✗ |
 * | `current` > 账上 | 写 `current`（抬高） | ✗ |
 * | `current` == 账上 | — | ✗ |
 * | `current` < 账上 | — | **✓** |
 *
 * 🔴 **负控一（本格最大的单点风险）**：「读取失败 ⇒ 当作没有记录」这条**必须**在朴素实现下翻车。
 * `StorageService.read` 分不出「文件不存在」与「读出错」（两者都 `return null`），而同仓
 * `releaseNotesOnLaunch` 的账**正着用**（读失败 ⇒ 从没见过 ⇒ 弹一次）——照抄那个写法，就会拿
 * **当前这个低版本**覆盖掉账上的高版本 ⇒ 降级信号被永久抹掉，且恰好发生在最该报警的那次启动上。
 *
 * 🔴 **负控二**：把本账与 `#57.13d` 的 `lastSeenVersion` 合成一个变量（每次无条件写当前版本）⇒
 * **第二次启动起降级信号自己抹掉自己**，界面上一片「正常」。见下面那个跨三次启动的用例。
 *
 * fixture：版本号走 9.9.x（明显虚构）、账本键与消息串不指向任何真实资产。
 * 这里 mock 掉三个协作者（存储 / 版本号来源 / 通知出口）——本模块的职责**只有判定与落账**，
 * 「怎么把话说出去」归 `useUpdateNotifications`（那一条在它自己的单测里钉住）。
 * 替身给的是**契约形状**（硬约束 21 的延伸）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("../core/services/configuration/StorageService", () => ({
  exists: vi.fn(),
  read: vi.fn(),
  write: vi.fn(),
}));
vi.mock("../hooks/useUpdateNotifications", () => ({
  notifyVersionDowngrade: vi.fn(),
}));

import { exists, read, write } from "../core/services/configuration/StorageService";
import { notifyVersionDowngrade } from "../hooks/useUpdateNotifications";
import { updateTargetDirection } from "../core/utils/plugin/semverUtils";
import {
  __resetVersionDowngradeNoticeForTest,
  decideVersionLedger,
  initVersionDowngradeNotice,
  runVersionDowngradeCheck,
} from "./versionDowngradeNotice";

/** 应用当前版本（= `app.getVersion()`） */
const VERSION = "9.9.9";
/** 账上那个「曾经跑过」的更高版本 */
const HIGH = "9.9.10";
/** 账上那个更低版本（模拟「用户从旧版升上来」的历史） */
const LOW = "9.9.8";

const mockExists = vi.mocked(exists);
const mockRead = vi.mocked(read);
const mockWrite = vi.mocked(write);
const mockNotify = vi.mocked(notifyVersionDowngrade);

/** 装 shell 面替身——`app` 缺席 = 「取不到版本号」那一格 */
function installShell(app: { getVersion: () => Promise<string> } | null = { getVersion: async () => VERSION }): void {
  (window as unknown as { linkdesk: unknown }).linkdesk = { app };
}

/** 账上有记录、且读得出 `stored` */
function ledgerHas(stored: unknown): void {
  mockExists.mockResolvedValue(true);
  mockRead.mockResolvedValue(stored as never);
}

/** 账上空白 */
function ledgerEmpty(): void {
  mockExists.mockResolvedValue(false);
  mockRead.mockResolvedValue(null);
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetVersionDowngradeNoticeForTest();
  ledgerEmpty();
  installShell();
});

afterEach(() => {
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

describe("decideVersionLedger（纯判定表）", () => {
  it("无记录 → 播种当前版本（不是提示）", () => {
    expect(decideVersionLedger(VERSION, false, null)).toEqual({ kind: "seed", write: VERSION });
  });

  it("跑得比账上高 → 抬高（判据③「不得误报」的全部实现：普通升级路径走这一支）", () => {
    expect(decideVersionLedger(VERSION, true, LOW)).toEqual({ kind: "raise", write: VERSION });
  });

  it("与账上持平 → 什么都不做", () => {
    expect(decideVersionLedger(VERSION, true, VERSION)).toEqual({ kind: "same" });
  });

  it("跑得比账上低 → 提示（唯一会说话的出口，且带上账上那个高版本）", () => {
    expect(decideVersionLedger(VERSION, true, HIGH)).toEqual({ kind: "downgrade", highest: HIGH });
  });

  it("🔴 有记录却读不出来（null）→ skip —— **绝不回落成播种**（那正是「抹账」）", () => {
    expect(decideVersionLedger(VERSION, true, null)).toEqual({ kind: "skip" });
  });

  it("🔴 有记录却是空串 → 同样 skip（空串当版本号算出来的方向不可信）", () => {
    expect(decideVersionLedger(VERSION, true, "")).toEqual({ kind: "skip" });
  });
});

describe("runVersionDowngradeCheck（读账 → 判定 → 落账 / 提示）", () => {
  it("账上空白 ⇒ 播种，且**不提示**", async () => {
    ledgerEmpty();

    expect(await runVersionDowngradeCheck(VERSION)).toEqual({ kind: "seed", write: VERSION });
    expect(mockWrite).toHaveBeenCalledWith("update-highest-version", VERSION);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("🔴 先问「有没有」再问「是多少」——账上空白时**一次读都不发**（顺序反了就会拿 null 当『没有』）", async () => {
    ledgerEmpty();

    await runVersionDowngradeCheck(VERSION);

    expect(mockExists).toHaveBeenCalledWith("update-highest-version");
    expect(mockRead).not.toHaveBeenCalled();
  });

  it("🔴 判据③：升级路径（current > 账上）⇒ 抬高，**通知器零调用**（不得误报）", async () => {
    ledgerHas(LOW);

    expect(await runVersionDowngradeCheck(VERSION)).toEqual({ kind: "raise", write: VERSION });
    expect(mockWrite).toHaveBeenCalledWith("update-highest-version", VERSION);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("持平 ⇒ 不写、不提示（绝大多数启动都走这一格）", async () => {
    ledgerHas(VERSION);

    expect(await runVersionDowngradeCheck(VERSION)).toEqual({ kind: "same" });
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("🔴 降级 ⇒ 提示用（当前版本, 账上最高版本）**两个**版本号，且**不写账**", async () => {
    ledgerHas(HIGH);

    expect(await runVersionDowngradeCheck(VERSION)).toEqual({ kind: "downgrade", highest: HIGH });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(VERSION, HIGH);
    // 账上那个高版本必须原样留着——写下去就等于把信号自己擦了（下一个用例是它的长期后果）
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("🔴 有记录却读不出来 ⇒ 什么都不做（**不写、不提示**）——不许覆盖，也不许凭空报警", async () => {
    mockExists.mockResolvedValue(true);
    mockRead.mockResolvedValue(null as never);

    expect(await runVersionDowngradeCheck(VERSION)).toEqual({ kind: "skip" });
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("🔴 变异负对照（把实现改坏，这两条必须变红）", () => {
  /** 账本的真实样子——替身背后的一张表，好让「朴素实现」的破坏行为看得见 */
  const store = new Map<string, string>();
  /** 模拟一次读：账上有记录但读不出来时返回 null（`StorageService.read` 的真实行为） */
  let readable = true;

  beforeEach(() => {
    store.clear();
    readable = true;
    mockExists.mockImplementation(async () => store.has("update-highest-version"));
    mockRead.mockImplementation(async () => (readable ? ((store.get("update-highest-version") ?? null) as never) : (null as never)));
    mockWrite.mockImplementation(async (_k: string, v: unknown) => { store.set("update-highest-version", v as string); });
  });

  /**
   * **朴素实现 A** = `releaseNotesOnLaunch` 那个账的正着用法（读失败 ⇒ 当作从未见过 ⇒ 写一遍）。
   * 这是最容易照抄过来的写法——`StorageService.read` 的签名（`T | null`）**看起来**就支持这么写。
   */
  async function naiveApply(current: string): Promise<void> {
    const stored = await read<string>("update-highest-version");
    if (stored !== null && updateTargetDirection(current, stored) === "downgrade") {
      notifyVersionDowngrade(current, stored);
    }
    await write("update-highest-version", current);
  }

  it("负控一：读取失败时朴素实现**抹掉账上的高版本** ⇒ 降级信号永久丢失（正确实现必须留着）", async () => {
    // 机器上确实到过 9.9.10，但这一次读不出来（文件损坏 / 瞬时不可读）
    store.set("update-highest-version", HIGH);
    readable = false;
    mockNotify.mockClear();

    await naiveApply(VERSION);

    // 朴素实现的下场：账被当前这个低版本盖掉，此后**任何一次启动都再也判不出降级**
    expect(store.get("update-highest-version")).toBe(VERSION);
    expect(mockNotify).not.toHaveBeenCalled();

    // 正确实现（同一起点）：账原样不动，且这一轮什么都不做——宁可这一轮不报，也不许抹账
    store.set("update-highest-version", HIGH);
    mockNotify.mockClear();
    expect(await runVersionDowngradeCheck(VERSION)).toEqual({ kind: "skip" });
    expect(store.get("update-highest-version")).toBe(HIGH);
  });

  /**
   * **朴素实现 B** = 把本账与 `#57.13d` 的 `lastSeenVersion` 合成一个变量（每次无条件写当前版本）。
   * 这一次的参照物是**跨启动的序列**——单看一次启动它是「对」的，所以只有连起来才照得出病。
   */
  async function naiveAcrossLaunches(version: string): Promise<boolean> {
    const stored = store.get("update-highest-version") ?? null;
    const notified = stored !== null && updateTargetDirection(version, stored) === "downgrade";
    store.set("update-highest-version", version); // 🔴 这就是合并：账跟着当前版本走
    return notified;
  }

  it("负控二：合并成一个变量 ⇒ 第 2 次启动起**自己抹掉自己**；正确实现第 3 次仍在报", async () => {
    // ── 朴素（合并写法）的跨启动序列 ──
    store.clear();
    expect(await naiveAcrossLaunches("9.9.11")).toBe(false); // ① 首次：播种
    expect(await naiveAcrossLaunches(HIGH)).toBe(true); // ② 被降级 ⇒ 报 ✓
    expect(await naiveAcrossLaunches(HIGH)).toBe(false); // ③ 仍被降级 —— 🔴 哑了

    // ── 正确实现的同一序列（真·读账 → 判定 → 落账）──
    store.clear();
    readable = true;
    mockNotify.mockClear();
    await runVersionDowngradeCheck("9.9.11"); // ① 首次：播种 9.9.11
    await runVersionDowngradeCheck(HIGH); // ② 被降级 ⇒ 报 ✓
    await runVersionDowngradeCheck(HIGH); // ③ 仍被降级 ⇒ **照样报**（「每次启动都提示」的全部实现）
    await runVersionDowngradeCheck(HIGH); // ④ 第四次也报——直到点 × 或升回去

    expect(mockNotify).toHaveBeenCalledTimes(3);
    expect(mockWrite).toHaveBeenCalledTimes(1); // 只播种那一次；降级期间账一动不动
    expect(store.get("update-highest-version")).toBe("9.9.11");
  });
});

describe("initVersionDowngradeNotice（启动接线）", () => {
  it("取到版本号 ⇒ 走一遍判定", async () => {
    ledgerHas(HIGH);

    await initVersionDowngradeNotice();

    expect(mockNotify).toHaveBeenCalledWith(VERSION, HIGH);
  });

  it("取不到版本号 ⇒ 什么都不做（**尤其不许拿占位值落账**——那会凭空报一次或丢一次信号）", async () => {
    installShell(null);

    await expect(initVersionDowngradeNotice()).resolves.toBeUndefined();

    expect(mockExists).not.toHaveBeenCalled();
    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("一次启动只跑一遍（StrictMode/HMR 双跑不许出两条提示）", async () => {
    ledgerHas(HIGH);

    await Promise.all([initVersionDowngradeNotice(), initVersionDowngradeNotice()]);
    await initVersionDowngradeNotice();

    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("🔴 内部异常不外抛（调用方是浮动 Promise）——本次不判，下次启动再来", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => { /* 静音 */ });
    mockExists.mockRejectedValueOnce(new Error("演示：存储读失败"));

    await expect(initVersionDowngradeNotice()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
  });
});
