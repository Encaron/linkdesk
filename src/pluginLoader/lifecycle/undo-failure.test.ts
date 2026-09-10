/**
 * 撤销动作失败必须出声——E6#73f（K7 / 18 档 441-450）。
 *
 * 修前：两条 撤销 onClick 只 `console.error`。而点击动作时 useSubscriptions 已经**先无条件
 * dismissToast**（先删提示再执行动作）⇒ 撤销失败 = 提示消失 + 插件没恢复 ⇒ 用户以为撤销成功了。
 * 修后：失败走 error toast（结论句带插件名），落回该插件所在的面板分组。
 *
 * 被测面：initLifecycleConsumers 的 onDidUninstall 消费端 3 —— 建 toast → 取 撤销 动作 → 触发
 * → 断言失败提示真推出来了。fixture 全虚构（硬约束 21：demo-plugin / Demo Plugin）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeAll, vi } from "vitest";

/** i18n 桩——key + 参数原样带出（只看「走了哪条键、带了哪个插件名」，真实译文归 i18n 审计） */
const { tMock } = vi.hoisted(() => ({
  tMock: vi.fn((key: string, opts?: Record<string, unknown>) => `${key}|${JSON.stringify(opts ?? {})}`),
}));
vi.mock("../../i18n", () => ({ default: { t: tMock, on: vi.fn(), off: vi.fn(), language: "zh" } }));

/** loader 桩——动态 import 的落点，撤销恢复必然失败（被测的就是失败分支） */
const UNDO_ERROR = "demo restore exploded";
vi.mock("../loader", () => ({
  reinstallPlugin: vi.fn(() => Promise.reject(new Error(UNDO_ERROR))),
  enablePlugin: vi.fn(() => Promise.reject(new Error(UNDO_ERROR))),
}));

import { initLifecycleConsumers, PluginLifecycle } from "./lifecycle";
import { getToasts, dismissToast } from "../../core/services/ui/toast";

const PLUGIN_ID = "demo-plugin";
const DISPLAY_NAME = "Demo Plugin";

describe("E6#73f K7：撤销失败要出声", () => {
  beforeAll(() => {
    initLifecycleConsumers(); // 模块级 guard——本文件只初始化一次
  });

  it("禁用后点 [撤销] → enablePlugin 失败 → 推 error toast（带插件名 + 原因）", async () => {
    PluginLifecycle.onDidUninstall.fire({
      pluginId: PLUGIN_ID,
      reason: "disable",
      displayName: DISPLAY_NAME,
      restorable: false,
    });

    const notice = getToasts()[getToasts().length - 1]!;
    expect(notice.message).toContain("已禁用");
    expect(notice.actions?.[0]?.label).toMatch(/撤销/);

    // 面板回传点击动作的真实语义：先跑 onClick、再关掉这条（useSubscriptions `notif:action`）
    notice.actions![0]!.onClick();

    // 失败提示是异步推出来的（onClick 内动态 import → reject → catch）
    await vi.waitFor(() => {
      expect(getToasts().some((t) => t.message.includes("未能恢复"))).toBe(true);
    });

    const failure = getToasts().find((t) => t.message.includes("未能恢复"))!;
    expect(failure.severity).toBe("error");
    // 结论句带插件名——用户得知道是哪个插件没恢复
    expect(failure.message).toContain(DISPLAY_NAME);
    // 原因也带出来（否则「未能恢复」等于没说）
    expect(failure.message).toContain(UNDO_ERROR);
    // 落回该插件所在的面板分组（与那条「已禁用」同组，用户正看着的地方）
    expect(failure.source).toBe(PLUGIN_ID);

    for (const t of getToasts()) dismissToast(t.id);
  });
});
