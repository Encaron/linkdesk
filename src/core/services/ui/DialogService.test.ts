/**
 * DialogService 在途读取面单测——M1 `AI#5`（`getPendingDialogs` / `resolveDialogButtons`）。
 *
 * 被测面：**登记什么**（kind / 标题 / 正文 / 按钮文案 / 富内容身份），不是弹窗长什么样。
 * 判据一句话：读取面报出来的内容，必须与 `pushOpen`（src/App/bridges.ts）推给池的那一份**同源**——
 * 所以按钮文案走 `resolveDialogButtons`（唯一落点），本文件顺带守它别再长出第二把尺。
 * 桩数据一律虚构（硬约束 21：演示标题 / 演示正文 / demo-plugin）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  confirm,
  alert,
  confirmContent,
  resolveDialogButtons,
  getPendingDialogs,
  registerDialogRenderers,
} from "./DialogService";
import i18n from "../../../i18n";

/** 注册一对「永不自动结算」的渲染器——由用例自己 release，好在「在途」那一刻读状态 */
function registerHolders() {
  let releaseConfirm!: (v: boolean) => void;
  let releaseAlert!: () => void;
  const off = registerDialogRenderers(
    () => new Promise<boolean>((r) => { releaseConfirm = r; }),
    () => new Promise<void>((r) => { releaseAlert = r; }),
  );
  return { off, releaseConfirm: (v: boolean) => releaseConfirm(v), releaseAlert: () => releaseAlert() };
}

const registered: Array<() => void> = [];
afterEach(() => {
  while (registered.length > 0) registered.pop()!();
});

describe("resolveDialogButtons——按钮文案的唯一落点（M1 AI#5 抽出）", () => {
  it("显式传入优先；未传 → i18n 缺省确定/取消", () => {
    expect(resolveDialogButtons({ title: "演示标题", message: "演示正文", confirmLabel: "确认演示", cancelLabel: "取消演示" }))
      .toEqual(["确认演示", "取消演示"]);
    expect(resolveDialogButtons({ title: "演示标题", message: "演示正文" }))
      .toEqual([i18n.t("确定"), i18n.t("取消")]);
  });

  it("alert 形态 → 只一条（DialogHost 不渲染取消——读取面不虚报第二条）", () => {
    expect(resolveDialogButtons({ title: "演示标题", message: "演示正文" }, true)).toHaveLength(1);
  });

  it("富内容模式 → 空数组（按钮由插件视图自画，壳不知道有几条——不猜）", () => {
    const opts = { title: "演示标题", message: "演示正文", content: { pluginId: "demo-plugin", viewId: "demo-view" } };
    expect(resolveDialogButtons(opts)).toEqual([]);
  });
});

describe("getPendingDialogs——在途弹窗读取面（M1 AI#5）", () => {
  it("空闲 → 空数组（不是 null、不是抛错）", () => {
    expect(getPendingDialogs()).toEqual([]);
  });

  it("confirm 在途 → kind/title/message/buttons；结算即撤", async () => {
    const h = registerHolders();
    registered.push(h.off);

    const answer = confirm({ title: "演示标题", message: "演示正文", confirmLabel: "确认演示", cancelLabel: "取消演示" });
    expect(getPendingDialogs()).toEqual([
      { kind: "confirm", title: "演示标题", message: "演示正文", buttons: ["确认演示", "取消演示"] },
    ]);

    h.releaseConfirm(false); // 用户点取消
    await expect(answer).resolves.toBe(false);
    expect(getPendingDialogs()).toEqual([]);
  });

  it("alert 在途 → kind=alert ＋ 单按钮（kind 靠显式传参判，不看 options.type）", async () => {
    const h = registerHolders();
    registered.push(h.off);

    // type 是视觉严重度（info/warning/error），与「确认框还是提示框」无关——给了 type 也不许少算按钮
    const done = alert({ title: "演示标题", message: "演示正文", type: "error" });
    const pending = getPendingDialogs();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.kind).toBe("alert");
    expect(pending[0]!.buttons).toHaveLength(1);

    h.releaseAlert();
    await done;
    expect(getPendingDialogs()).toEqual([]);
  });

  it("富内容确认 → buttons 空 ＋ 带内容身份（pluginId/viewId，供 AI 去读视图）", async () => {
    const h = registerHolders();
    registered.push(h.off);

    const answer = confirmContent({
      title: "演示标题",
      message: "演示正文",
      content: { pluginId: "demo-plugin", viewId: "demo-view", payload: { secret: 1 } },
    });
    expect(getPendingDialogs()).toEqual([
      {
        kind: "confirm",
        title: "演示标题",
        message: "演示正文",
        buttons: [],
        content: { pluginId: "demo-plugin", viewId: "demo-view" }, // payload 不登记（不透明载荷，壳不解释）
      },
    ]);

    h.releaseConfirm(true);
    await answer;
    expect(getPendingDialogs()).toEqual([]);
  });

  it("无 content 的 confirmContent → 退化为普通 confirm（照常登记）", async () => {
    const h = registerHolders();
    registered.push(h.off);

    const answer = confirmContent({ title: "演示标题", message: "演示正文", confirmLabel: "确认演示" });
    expect(getPendingDialogs()).toHaveLength(1);
    expect(getPendingDialogs()[0]!.buttons).toHaveLength(2);

    h.releaseConfirm(true);
    await answer;
  });

  it("渲染器未注册（走 window.confirm 兜底）⇒ **不登记悬空条目**", async () => {
    // 兜底路径同步返回、没有「在途」可言——登记了就是永久谎言（前面那条已经读完了，后面还挂着）
    const spy = vi.spyOn(window, "confirm").mockReturnValue(true);
    try {
      await expect(confirm({ title: "演示标题", message: "演示正文" })).resolves.toBe(true);
      expect(spy).toHaveBeenCalled();
      expect(getPendingDialogs()).toEqual([]);
    } finally {
      spy.mockRestore();
    }
  });
});
