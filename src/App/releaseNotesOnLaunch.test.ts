/**
 * releaseNotesOnLaunch——发行说明启动接线单测（E6#57.13d）。
 *
 * 本文件的**全部价值在那张决策表**——启动期这一小节代码，四条分支里三条是「什么都不做」，
 * 而「什么都不做」的那几条恰恰是最容易写错的（写错了也不报错、下次启动才发现行为不对）：
 *
 * | 情形 | 开标签页 | 记 `lastSeenVersion` | 预热 |
 * |:--|:--:|:--:|:--:|
 * | `showReleaseNotes=false` | ✗ | ✗ | **✓**（关的是「弹」，不是「有没有」） |
 * | 版本号与上次相同 | ✗ | —（本来就在） | **✓** |
 * | 版本不同 + 取数**拿到内容** | ✓（带横幅 **＋ 点名当前版本号**） | **✓** | —（已经取过了） |
 * | 版本不同 + 取数**失败** | ✓（池画空态） | 🔴 **✗**（「下次启动再试」的全部实现） |
 * | 取不到版本号 | ✗ | ✗ | ✗（账上写一个假版本 = 下一次白弹） |
 *
 * 🔴 **最后一行「失败不记账」是负控**：把 `getReleaseNotesState().state === "content"` 这道判据
 * 删掉（改成无条件记账），该用例必须变红——否则「一次离线 = 这一版永久跳过」这个 bug 无人拦。
 *
 * 这里 mock 掉三个协作者（配置 / 取数态 / 开标签页）——本函数的职责**只有决策**：
 * 「开一个标签页要做什么」归 `releaseNotesCommands`，「取数三态」归 `useReleaseNotes`，
 * 各自在自己的单测里被钉住（见那两份文件）。替身给的是**契约形状**（硬约束 21 的延伸）。
 *
 * fixture 全虚构：版本号 9.9.9 / 0.0.1。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { PoolReleaseNotesData } from "../core/types/pool/poolLayout";

vi.mock("../core/services/configuration/ConfigurationService", () => ({
  getConfigurationValue: vi.fn(() => true),
}));
vi.mock("../hooks/useReleaseNotes", () => ({
  prewarmReleaseNotes: vi.fn(),
  readLastSeenVersion: vi.fn(async () => null as string | null),
  writeLastSeenVersion: vi.fn(async () => { /* 替身不落盘 */ }),
  getReleaseNotesState: vi.fn(() => ({ state: "empty" }) as PoolReleaseNotesData),
}));
vi.mock("../core/commands/shell/releaseNotesCommands", () => ({
  openReleaseNotesTab: vi.fn(async () => { /* 替身不开标签页 */ }),
}));

import { getConfigurationValue } from "../core/services/configuration/ConfigurationService";
import { getReleaseNotesState, prewarmReleaseNotes, readLastSeenVersion, writeLastSeenVersion } from "../hooks/useReleaseNotes";
import { openReleaseNotesTab } from "../core/commands/shell/releaseNotesCommands";
import { __resetReleaseNotesLaunchForTest, initReleaseNotesOnLaunch } from "./releaseNotesOnLaunch";

/** 应用当前版本（= `app.getVersion()`，也就是**记账该写的那个值**） */
const VERSION = "9.9.9";
/** 有内容的态——只有 `state` 参与判定，其余字段按契约给全（池画什么不归本文件管） */
const CONTENT: PoolReleaseNotesData = {
  state: "content",
  version: VERSION,
  subtitle: "演示副标题",
  channelLabel: "演示通道",
  body: "演示正文",
  historical: [],
};

const mockConfig = vi.mocked(getConfigurationValue);
const mockPrewarm = vi.mocked(prewarmReleaseNotes);
const mockReadSeen = vi.mocked(readLastSeenVersion);
const mockWriteSeen = vi.mocked(writeLastSeenVersion);
const mockState = vi.mocked(getReleaseNotesState);
const mockOpen = vi.mocked(openReleaseNotesTab);

/** 装 shell 面替身——`app` 缺席 = 「取不到版本号」那一格 */
function installShell(app: { getVersion: () => Promise<string> } | null = { getVersion: async () => VERSION }): void {
  (window as unknown as { linkdesk: unknown }).linkdesk = { app };
}

beforeEach(() => {
  vi.clearAllMocks();
  __resetReleaseNotesLaunchForTest();
  mockConfig.mockReturnValue(true as never);
  mockReadSeen.mockResolvedValue(null);
  mockState.mockReturnValue({ state: "empty" } as PoolReleaseNotesData);
  installShell();
});

afterEach(() => {
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

describe("releaseNotesOnLaunch（决策表）", () => {
  it("版本不同 + 取到内容 → 开标签页（带横幅）+ 记下这一版", async () => {
    mockState.mockReturnValue(CONTENT as never);
    await initReleaseNotesOnLaunch();

    expect(mockOpen).toHaveBeenCalledTimes(1);
    // 🔴 **`version` 是本次订正的主角**（`#57.13h` 收尾，2026-09-13）：原断言写的是
    //    `{ banner: true }`——那一格空着 ⇒ 主进程「所请求的那一版不在缓存里 ⇒ 视为失效」那条判据
    //    短路 ⇒ 升级前拉的缓存照旧命中 ⇒ 首启看到的是**上一版**的说明、横幅还把它当新版宣告。
    //    **这条断言当时钉住的正是那个 bug**，所以它必须跟着改。
    expect(mockOpen).toHaveBeenCalledWith({ banner: true, version: VERSION });
    // 🔴 记的是**应用版本号**（不是取回来的那份说明的版本号）——账的语义是「这一版启动弹过了」
    expect(mockWriteSeen).toHaveBeenCalledWith(VERSION);
  });

  it("🔴 负控：版本不同但取数失败（空态）→ 开了标签页，但**不记账**（下次启动再试）", async () => {
    mockState.mockReturnValue({ state: "empty" } as never);
    await initReleaseNotesOnLaunch();

    expect(mockOpen).toHaveBeenCalledTimes(1);
    // 记了这笔账 ⇒ 下次启动版本号相同 ⇒ 直接 return ⇒ 用户再也不会被弹（与 05 §2.5 相反）
    expect(mockWriteSeen).not.toHaveBeenCalled();
  });

  it("版本相同 → 不开、不记账，但**照常预热**（用户随时可能自己点菜单打开）", async () => {
    mockReadSeen.mockResolvedValue(VERSION);
    await initReleaseNotesOnLaunch();

    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockWriteSeen).not.toHaveBeenCalled();
    expect(mockPrewarm).toHaveBeenCalledTimes(1);
  });

  it("开关关掉 → 不弹、不记账，但**仍然预热**（开关管的是「弹」不是「有没有」）", async () => {
    mockConfig.mockReturnValue(false as never);
    await initReleaseNotesOnLaunch();

    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockWriteSeen).not.toHaveBeenCalled();
    expect(mockPrewarm).toHaveBeenCalledTimes(1);
  });

  it("开关读不到值（配置服务尚未就绪）→ 按**默认 true** 走，不是按 false", async () => {
    mockConfig.mockReturnValue(undefined as never);
    mockState.mockReturnValue(CONTENT as never);
    await initReleaseNotesOnLaunch();

    expect(mockOpen).toHaveBeenCalledTimes(1);
  });

  it("取不到版本号 → 什么都不做（不开、不记账、不预热）", async () => {
    installShell(null);
    await initReleaseNotesOnLaunch();

    expect(mockOpen).not.toHaveBeenCalled();
    expect(mockWriteSeen).not.toHaveBeenCalled();
    expect(mockPrewarm).not.toHaveBeenCalled();
  });

  it("一次启动只跑一遍（StrictMode/HMR 双跑不许开出第二次）", async () => {
    mockState.mockReturnValue(CONTENT as never);
    await Promise.all([initReleaseNotesOnLaunch(), initReleaseNotesOnLaunch()]);
    await initReleaseNotesOnLaunch();

    expect(mockOpen).toHaveBeenCalledTimes(1);
    expect(mockWriteSeen).toHaveBeenCalledTimes(1);
  });

  it("🔴 内部异常不外抛（调用方是浮动 Promise）——本次不弹，下次启动再试", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => { /* 静音 */ });
    mockOpen.mockRejectedValueOnce(new Error("演示：开标签页失败"));

    await expect(initReleaseNotesOnLaunch()).resolves.toBeUndefined();
    expect(mockWriteSeen).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalled();
  });
});
