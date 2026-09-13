/**
 * 壳「关于」命令单测——E6#57.14e/g。
 *
 * 钉住四件**写反了也不报错**的事：
 *
 * ① **顺序**：`openAboutTab` 里「设态」必须先于「开标签页」——且中间**不许有 await**
 *    （`primeAbout` 的同步段就是这个保证；写成 `async` 就破了）。判据写在 `openTab`
 *    替身自己身上：它被调用的**那一刻**读一次态，必须是 `loading`。
 * ② **「复制」不许把空串写进剪贴板**——取数没落地时 `getAboutCopyText` 返回 `null`，
 *    此时既不许写剪贴板、也不许推「已复制」（推了就是在说「复制好了」而其实什么都没复制）。
 * ③ **「检查更新…」不在本文件**——它是**既有**的 `update.checkForUpdates`，关于页只是它的
 *    第四个入口（命令源唯一）。所以这里**不该**存在任何 update.* 命令——多此一条就是
 *    给同一件事造了第二个真相源。这条断言故意写成「本文件注册的命令集合恰为这两条」。
 * ④ `app.aboutCopy` 的 `when` 恒为 `"false"`（不进命令面板）——**这条是它英文调试标题的理由**：
 *    标题字段只是调试标签，不归硬约束 2 管；哪天有人把 `when` 改成可见，这条必须红着提醒他补翻译。
 *    `app.about` 反之**恒显**（人用的入口）。
 *
 * 🔴 `CommandRegistry` 是模块级单例 ⇒ 每个用例 `clearCommands()`；`useAbout` 用替身
 * （取数与组装在 `useAbout.test.ts` 里逐条钉过，本文件测的是**命令层的接线**）。
 *
 * fixture 全虚构（硬约束 21）：复制文本用 `演示标签甲: 9.9.9`。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  /**
   * 替身态——`primeAbout` 同步把它置 `loading`（**同步**是这条链的全部要点）。
   *
   * 🔴 初值**必须不是 `loading`**（这里用 `content`）：①那条顺序判据的全部信息量就在
   * 「`openTab` 的那一刻态**变过了没有**」。若初值本身是 `loading`，顺序写反了也照样读到 `loading`
   * ——守卫恒定绿（本文件实测过：初值 `loading` 时把顺序调反，7 个用例全绿，假门禁一枚）。
   * `content` 也不是刻意刁难：它正是**第二次开关于页**时的真实前态（上一次已取到数、快照还留着），
   * 也就是顺序写反唯一会造成伤害的那个场景。
   */
  phase: "loading" as "loading" | "content",
  /** 最近一次取数的 resolver——用例自己决定什么时候放行 */
  resolveLoad: null as null | (() => void),
  /** `openTab` 被调用**那一刻**读到的态 */
  stateAtOpen: null as string | null,
  /** `openTab` 收到的 tab type——壳视图身份就是 type，不该是别的 */
  tabTypeAtOpen: null as unknown,
}));

vi.mock("../../../hooks/useAbout", () => ({
  primeAbout: vi.fn(() => {
    h.phase = "loading";
    return new Promise<void>((resolve) => { h.resolveLoad = resolve; });
  }),
  getAboutState: vi.fn(() => ({ state: h.phase })),
  getAboutCopyText: vi.fn(() => (h.phase === "content" ? "演示标签甲: 9.9.9" : null)),
}));

vi.mock("../../services/ui/ClipboardService", () => ({ writeClipboardText: vi.fn() }));

const toast = vi.hoisted(() => ({ pushToast: vi.fn() }));
vi.mock("../../services/ui/toast", () => ({
  pushToast: toast.pushToast,
  TOAST_TTL_INFO: 6000,
  TOAST_TTL_SUCCESS: 5000,
  TOAST_TTL_ERROR: 8000,
}));

import { clearCommands, executeCommand, getCommand, getPluginCommands } from "../../registry/commands/CommandRegistry";
import { updateCoreCallbacks, type CoreCallbacks } from "../infra/CoreCallbacks";
import { writeClipboardText } from "../../services/ui/ClipboardService";
import { pushToast } from "../../services/ui/toast";
import { ABOUT_TAB_TYPE } from "../../utils/tabIdentity";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { registerAboutCommands } from "./aboutCommands";

const mockClipboard = vi.mocked(writeClipboardText);
const mockToast = vi.mocked(pushToast);

/* E6#57.14 EXEMPT：本块与 `releaseNotesCommands.test.ts` 的结构性重复是**壳视图命令测试的样板**
   （h.hoisted 态 + 动态 import 落地等待 + 替身内部埋观察点 + CoreCallbacks 装卸）——两个文件测的是
   同一条链的两个实例（发行说明 / 关于），样板必须同形，抽公共 helper 反而会把「各自埋什么观察点」
   这件最该被读清的事藏进参数里。同款先例：`ThemeRegistry.test.ts` / `PoolSectionStack.test.tsx`。
   注：`h.phase` 初值不许是 loading 那条判据**不在豁免内**（它在 h 的声明处，逐字留着）。 */
/* jscpd:ignore-start */
/**
 * 等到「同步段已经跑过」——判据 = 替身 `primeAbout` 已经挂了 resolver。
 *
 * 🔴 **不能用 `await Promise.resolve()` 凑**：`openAboutTab` 第一句是**动态 `import`**
 * （`await import(...)`），它到底要几个微任务才落地是实现细节。而本用例要看的性质
 * （`openTab` 紧跟设态同步发出）**与它无关**——等 resolver 出现即可（同 `releaseNotesCommands.test.ts`）。
 */
async function untilPrimed(): Promise<void> {
  for (let i = 0; i < 20 && !h.resolveLoad; i += 1) {
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  }
}

beforeEach(() => {
  clearCommands();
  // 🔴 见 `h.phase` 的注释：初值**不许**是 loading，否则①那条顺序守卫成了假门禁
  h.phase = "content";
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
/* jscpd:ignore-end */

describe("aboutCommands（① 设态先于开标签页）", () => {
  it("🔴 `openTab` 发出的那一刻，态已经是 loading（中间一个 await 都不许有）", async () => {
    registerAboutCommands();
    // 不 await：命令 handler 要等取数落地才返回，而「开标签页」必须在那之前就发生
    const pending = executeCommand("app.about");
    await untilPrimed();

    expect(h.stateAtOpen).toBe("loading");
    // 同一个 observation 顺手钉住「开的是关于那一型」——壳视图身份就是 type
    expect(h.tabTypeAtOpen).toBe(ABOUT_TAB_TYPE);

    h.resolveLoad?.();
    await pending;
  });
});

describe("aboutCommands（② 「复制」不许把空串写进剪贴板）", () => {
  it("🔴 取数没落地 ⇒ 不写剪贴板、不推「已复制」（推了就是在说复制好了）", async () => {
    h.phase = "loading";
    registerAboutCommands();
    await executeCommand("app.aboutCopy");

    expect(mockClipboard).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it("正控：取到数 ⇒ 写剪贴板 + 推一条信息级 toast", async () => {
    h.phase = "content";
    registerAboutCommands();
    await executeCommand("app.aboutCopy");

    expect(mockClipboard).toHaveBeenCalledWith("演示标签甲: 9.9.9");
    expect(mockToast).toHaveBeenCalledTimes(1);
    expect(mockToast.mock.calls[0][0].ttl).toBe(6000);
  });

  it("🔴 复制 toast **不设 `wake`**（跟随既有复制动作先例：不把铃铛弹开）", async () => {
    h.phase = "content";
    registerAboutCommands();
    await executeCommand("app.aboutCopy");

    expect(mockToast.mock.calls[0][0].wake).toBeUndefined();
  });
});

describe("aboutCommands（③④ 命令面形状）", () => {
  it("🔴 本文件只注册这三条——「检查更新…」复用既有命令，不在这里造第二条", async () => {
    registerAboutCommands();
    // 本文件注册的全部命令（`clearCommands()` 清过场，所以这一份就是它注册的）
    expect(getPluginCommands(APP_PLUGIN_ID).slice().sort()).toEqual(["app.about", "app.aboutCopy", "app.viewLicense"]);
    // 既有的那条**没被**顺手复制过来（同一条命令只该有一个注册点）
    expect(getCommand("update.checkForUpdates")).toBeUndefined();
  });

  it("`app.aboutCopy` 用 `when: \"false\"`（不进命令面板）——所以标题是英文调试标签", () => {
    registerAboutCommands();

    expect(getCommand("app.aboutCopy")?.when).toBe("false");
  });

  it("`app.about` 恒显（无 `when`）——「入口存在」不是「有更新才给你看」", () => {
    registerAboutCommands();
    const cmd = getCommand("app.about");

    expect(cmd?.when).toBeUndefined();
    // 归「帮助」类——帮助菜单与齿轮菜单两处入口共用这一条命令（入口可多处，命令源唯一）
    expect(cmd?.category).toBe("帮助");
  });
});
