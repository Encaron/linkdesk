/**
 * 壳「AI 操作手册」命令单测——M3 `AI#16`。
 *
 * 钉住三件**写反了也不报错**的事：
 *
 * ① **顺序**：`openAiManualTab` 里「设态」必须先于「开标签页」——且中间**不许有 await**
 *    （`primeAiManual` 的同步段就是这个保证；写成 `async` 就破了）。判据写在 `openTab`
 *    替身自己身上：它被调用的**那一刻**读一次态，必须是 `loading`。
 * ② **开的是手册那一型**——壳视图身份就是 type（`ai-manual`），不是 pluginId。
 * ③ **命令面形状**：只有一条 `app.openAiManual`（本视图的章切换是纯视图态 ⇒ 没有池侧动作
 *    要落成命令，⛔ 不为凑对称加一条无人调用的命令 = 死代码），且**恒显**（无 `when`，
 *    归「帮助」类）——离线恒可读是硬要求，「有没有内容才给你看手册」这回事不存在。
 *
 * 🔴 `CommandRegistry` 是模块级单例 ⇒ 每个用例 `clearCommands()`；`useAiManual` 用替身
 * （取数与三态判定在 `useAiManual.test.ts` 里逐条钉过，本文件测的是**命令层的接线**）。
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const h = vi.hoisted(() => ({
  /**
   * 替身态——`primeAiManual` 同步把它置 `loading`（**同步**是这条链的全部要点）。
   *
   * 🔴 初值**必须不是 `loading`**（这里用 `content`）：①那条顺序判据的全部信息量就在
   * 「`openTab` 的那一刻态**变过了没有**」。若初值本身是 `loading`，顺序写反了也照样读到 `loading`
   * ——守卫恒定绿（`aboutCommands.test.ts` 实测过这个假门禁：初值 `loading` 时把顺序调反，用例全绿）。
   * `content` 也不是刻意刁难：它正是**第二次开手册页**时的真实前态（上一次已取到数、快照还留着），
   * 也就是顺序写反唯一会造成伤害的那个场景。
   */
  state: "loading" as "loading" | "content",
  /** 最近一次取数的 resolver——用例自己决定什么时候放行 */
  resolveLoad: null as null | (() => void),
  /** `openTab` 被调用**那一刻**读到的态 */
  stateAtOpen: null as string | null,
  /** `openTab` 收到的 tab type——壳视图身份就是 type，不该是别的 */
  tabTypeAtOpen: null as unknown,
}));

vi.mock("../../../hooks/useAiManual", () => ({
  primeAiManual: vi.fn(() => {
    h.state = "loading";
    return new Promise<void>((resolve) => { h.resolveLoad = resolve; });
  }),
  getAiManualState: vi.fn(() => ({ state: h.state })),
}));

import { clearCommands, executeCommand, getCommand, getPluginCommands } from "../../registry/commands/CommandRegistry";
import { updateCoreCallbacks, type CoreCallbacks } from "../infra/CoreCallbacks";
import { AI_MANUAL_TAB_TYPE } from "../../utils/tabIdentity";
import { APP_PLUGIN_ID } from "../../services/plugins/PluginStateService";
import { registerManualCommands } from "./manualCommands";

/* M3 `AI#16` EXEMPT：本块与 `aboutCommands.test.ts` / `releaseNotesCommands.test.ts` 的结构性
   重复是**壳视图命令测试的样板**（h.hoisted 态 + 动态 import 落地等待 + 替身内部埋观察点 +
   CoreCallbacks 装卸）——三个文件测的是同一条链的三个实例（关于 / 发行说明 / 手册），样板必须同形，
   抽公共 helper 反而会把「各自埋什么观察点」这件最该被读清的事藏进参数里。
   同款先例见 `aboutCommands.test.ts`（E6#57.14 EXEMPT）。⚠️ `h.state` 初值不许是 loading 那条判据
   **不在豁免内**（它在 h 的声明处，逐字留着）。 */
/* jscpd:ignore-start */
/**
 * 等到「同步段已经跑过」——判据 = 替身 `primeAiManual` 已经挂了 resolver。
 * 🔴 **不能用 `await Promise.resolve()` 凑**：第一句是动态 `import`，几个微任务落地是实现细节；
 * 而本用例要看的性质（`openTab` 紧跟设态同步发出）与它无关（同 `aboutCommands.test.ts`）。
 */
async function untilPrimed(): Promise<void> {
  for (let i = 0; i < 20 && !h.resolveLoad; i += 1) {
    await new Promise<void>((resolve) => { setTimeout(resolve, 0); });
  }
}

beforeEach(() => {
  clearCommands();
  // 🔴 见 `h.state` 的注释：初值**不许**是 loading，否则顺序守卫成了假门禁
  h.state = "content";
  h.resolveLoad = null;
  h.stateAtOpen = null;
  h.tabTypeAtOpen = null;
  updateCoreCallbacks({
    openTab: (type: unknown) => {
      // 🔴 判据落在**替身内部**：这就是「池第一帧会读到什么」的等价观察点
      h.stateAtOpen = h.state;
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

describe("manualCommands（①② 设态先于开标签页 + 开的是手册那一型）", () => {
  it("🔴 `openTab` 发出的那一刻，态已经是 loading（中间一个 await 都不许有）", async () => {
    registerManualCommands();
    // 不 await：命令 handler 要等取数落地才返回，而「开标签页」必须在那之前就发生
    const pending = executeCommand("app.openAiManual");
    await untilPrimed();

    expect(h.stateAtOpen).toBe("loading");
    expect(h.tabTypeAtOpen).toBe(AI_MANUAL_TAB_TYPE);

    h.resolveLoad?.();
    await pending;
  });
});

describe("manualCommands（③ 命令面形状）", () => {
  it("只有一条命令——章切换是纯视图态，不为「凑对称」造无人调用的第二条", () => {
    registerManualCommands();

    expect(getPluginCommands(APP_PLUGIN_ID).slice().sort()).toEqual(["app.openAiManual"]);
  });

  it("`app.openAiManual` 恒显（无 `when`）、归「帮助」类——离线恒可读", () => {
    registerManualCommands();
    const cmd = getCommand("app.openAiManual");

    expect(cmd?.when).toBeUndefined();
    expect(cmd?.category).toBe("帮助");
    // 命令自带参数清单一栏为空（零入参）——命令面板/自述面据此渲染
    expect(cmd?.params).toBeUndefined();
  });
});
