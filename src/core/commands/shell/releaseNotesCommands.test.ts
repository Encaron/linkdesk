/**
 * 壳「发行说明」命令单测——E6#57.13e/g。
 *
 * 钉住三件**写反了也不报错**的事：
 * ① **顺序**：`openReleaseNotesTab` 里「设态」必须先于「开标签页」——且中间**不许有 await**
 *    （`primeReleaseNotes` 的同步段就是这个保证；写成 `async` 就破了）。判据写在 `openTab`
 *    替身自己身上：它被调用的**那一刻**读一次态，必须是 `loading`。
 * ② **跨进程入参的类型守卫**：`update.releaseNotesSelect` 的版本号是从池经主进程送回来的**纯数据**，
 *    非字符串/空串必须丢弃——放行会让 `loadReleaseNotes(42)` 悄悄退回「取最新一版」，
 *    变成「点了 A 版却显示最新版」这种查不出的 bug。
 * ③ 三条程序化命令的 `when` 恒为 `"false"`（不进命令面板）——**这条是那三条英文标题的理由**：
 *    标题字段只是调试标签，不归硬约束 2 管；哪天有人把 `when` 改成可见，这条必须红着提醒他补翻译。
 *
 * 🔴 `CommandRegistry` 是模块级单例 ⇒ 每个用例 `clearCommands()`；`useReleaseNotes` 用替身
 * （本文件测的是**命令层的接线**，取数三态在 `useReleaseNotes.test.ts` 里逐条钉过）。
 *
 * fixture 全虚构（硬约束 21）：版本号 9.9.9。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  /** 替身态——`primeReleaseNotes` 同步把它置 loading（**同步**是这条链的全部要点） */
  phase: "empty" as "loading" | "empty",
  /** 最近一次取数的 resolver——用例自己决定什么时候放行 */
  resolveLoad: null as null | (() => void),
  /** `openTab` 被调用**那一刻**读到的态 */
  stateAtOpen: null as string | null,
  /** `openTab` 收到的 tab type——壳视图身份就是 type，不该是别的 */
  tabTypeAtOpen: null as unknown,
}));

vi.mock("../../../hooks/useReleaseNotes", () => ({
  primeReleaseNotes: vi.fn(() => {
    h.phase = "loading";
    return new Promise<void>((resolve) => { h.resolveLoad = resolve; });
  }),
  getReleaseNotesState: vi.fn(() => ({ state: h.phase })),
  selectReleaseNotesVersion: vi.fn(),
  retryReleaseNotes: vi.fn(),
  dismissReleaseNotesBanner: vi.fn(),
}));

import { clearCommands, executeCommand, getCommand } from "../../registry/commands/CommandRegistry";
import { updateCoreCallbacks, type CoreCallbacks } from "../infra/CoreCallbacks";
import { selectReleaseNotesVersion } from "../../../hooks/useReleaseNotes";
import { RELEASE_NOTES_TAB_TYPE } from "../../utils/tabIdentity";
import { registerReleaseNotesCommands } from "./releaseNotesCommands";

const mockSelect = vi.mocked(selectReleaseNotesVersion);

/**
 * 等到「同步段已经跑过」——判据 = 替身 `primeReleaseNotes` 已经挂了 resolver。
 *
 * 🔴 **不能用 `await Promise.resolve()` 凑**：`openReleaseNotesTab` 第一句是**动态 `import`**
 * （`await import(...)`），它到底要几个微任务才落地是实现细节。而本用例要看的性质
 * （`openTab` 紧跟设态同步发出）**与它无关**——等到 resolver 出现即可：那一句和 `openTab`
 * 在**同一个同步块**里，观察到前者就等于观察到后者已经发生（没发生则 `stateAtOpen` 恒 null）。
 */
async function untilPrimed(): Promise<void> {
  for (let i = 0; i < 20 && !h.resolveLoad; i += 1) {
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  }
}

beforeEach(() => {
  clearCommands();
  h.phase = "empty";
  h.resolveLoad = null;
  h.stateAtOpen = null;
  h.tabTypeAtOpen = null;
  updateCoreCallbacks({
    openTab: (type: unknown) => {
      // 🔴 判据落在**替身内部**：这就是「池第一帧会读到什么」的等价观察点
      h.stateAtOpen = h.phase;
      h.tabTypeAtOpen = type;
      return "demo-tab-id";
    },
  } as unknown as CoreCallbacks);
});

afterEach(() => {
  updateCoreCallbacks(null as unknown as CoreCallbacks);
  vi.clearAllMocks();
});

describe("releaseNotesCommands（① 设态先于开标签页）", () => {
  it("🔴 `openTab` 发出的那一刻，态已经是 loading（中间一个 await 都不许有）", async () => {
    registerReleaseNotesCommands();
    // 不 await：命令 handler 要等取数落地才返回，而「开标签页」必须在那之前就发生
    const pending = executeCommand("update.openReleaseNotes");
    await untilPrimed();

    expect(h.stateAtOpen).toBe("loading");
    // 同一个 observation 顺手钉住「开的是发行说明那一型」——壳视图身份就是 type
    expect(h.tabTypeAtOpen).toBe(RELEASE_NOTES_TAB_TYPE);

    h.resolveLoad?.();
    await pending;
  });
});

describe("releaseNotesCommands（② 跨进程入参守卫）", () => {
  it("非字符串 / 空串的版本号一律丢弃（放行 = 「点了 A 版却显示最新版」）", async () => {
    registerReleaseNotesCommands();
    await executeCommand("update.releaseNotesSelect", undefined, 42);
    await executeCommand("update.releaseNotesSelect", undefined, "");
    await executeCommand("update.releaseNotesSelect", undefined, null);
    await executeCommand("update.releaseNotesSelect", undefined); // 池漏传实参的情形

    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("正控：真给了版本号就换那一版（`args[0]`，token 槽已由壳侧剥掉）", async () => {
    registerReleaseNotesCommands();
    await executeCommand("update.releaseNotesSelect", undefined, "9.9.9");

    expect(mockSelect).toHaveBeenCalledWith("9.9.9");
  });
});

describe("releaseNotesCommands（③ 命令面形状）", () => {
  it("三条池侧动作用 `when: \"false\"`（不进命令面板）——所以标题是英文调试标签", () => {
    registerReleaseNotesCommands();
    for (const id of ["update.releaseNotesSelect", "update.releaseNotesRetry", "update.releaseNotesDismissBanner"]) {
      expect(getCommand(id)?.when).toBe("false");
    }
  });

  it("人用的那条恒显（无 `when`）——「入口存在」不是「有更新才给你看」", () => {
    registerReleaseNotesCommands();
    expect(getCommand("update.openReleaseNotes")?.when).toBeUndefined();
  });
});
