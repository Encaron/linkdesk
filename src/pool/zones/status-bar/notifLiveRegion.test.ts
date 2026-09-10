/**
 * `scanNotifLive` —— E6#73k（J2）「变了才播、播哪一条」的判据。
 *
 * 纯函数：时间与节流在调用方（`StatusBarZone`），本文件不需要伪造时钟，
 * 只喂「上一次台账 + 这一次布局」两样东西，断言「该不该播、播哪句」。
 * 文本一律虚构串（硬约束 21）。
 */
import { describe, it, expect } from "vitest";
import type { NotifLayout } from "../../../core/types/pool/poolLayout";
import { scanNotifLive, type NotifLiveSeen } from "./notifLiveRegion";

/** 段内行形状——`NotifJobRow` 未导出，从容器类型里取（改了结构这里跟着报错，比手抄一份稳） */
type JobRow = NonNullable<NotifLayout["sections"]>[number]["items"][number];

const EMPTY: NotifLayout = {
  unread: 0,
  bellTitle: "Demo Bell",
  panelTitle: "Demo Panel",
  clearLabel: "Demo Clear",
  minimizeLabel: "Demo Minimize",
  emptyLabel: "Demo Empty",
  dismissTitle: "Demo Dismiss",
  groups: [],
};

function withJob(row: Partial<JobRow> & { id: string; statusLabel: string }): NotifLayout {
  return {
    ...EMPTY,
    sections: [{ key: "running", label: "Demo Running", items: [{ pluginId: "demo-plugin", name: "Demo Plugin", iconClass: "demo-icon", ...row }] }],
  };
}

function withToast(id: string, message: string): NotifLayout {
  return {
    ...EMPTY,
    groups: [{ key: "demo", label: "demo", unread: 0, items: [{ id, iconClass: "demo-icon", message, timeLabel: "Demo Time", actions: [] }] }],
  };
}

/** 首次扫描——只建基线（返回的 `seen` 供后续用例当「上一轮」用） */
function baseline(notif: NotifLayout): NotifLiveSeen {
  const first = scanNotifLive(null, notif);
  expect(first.announce).toBeNull(); // 基线不出声——开一次软件不该把存量通知从头念一遍
  return first.seen;
}

describe("E6#73k（J2）：通知面可听状态行——变了才播", () => {
  it("首次扫描只建基线，不出声（池每次挂载都是一次全新扫描，不能把存量通知念一遍）", () => {
    const seen = scanNotifLive(null, withToast("toast-1", "Demo Message"));
    expect(seen.announce).toBeNull();
    expect(seen.seen.size).toBe(1);
  });

  it("新通知落下 → 播它的文案", () => {
    const seen = baseline(EMPTY);
    const next = scanNotifLive(seen, withToast("toast-1", "Demo Message"));
    expect(next.announce).toBe("Demo Message");
  });

  it("同 id 改写文案也算话（壳侧 updateToast 改写的进度行靠这条）", () => {
    const seen = baseline(withToast("toast-1", "Demo 10%"));
    expect(scanNotifLive(seen, withToast("toast-1", "Demo 20%")).announce).toBe("Demo 20%");
  });

  it("什么都没变 → 闭嘴（不播 = 不念经）", () => {
    const layout = withToast("toast-1", "Demo Message");
    const seen = baseline(layout);
    // 每次布局都是新对象（壳侧重建），但签名没变——判据是签名不是对象同一性
    expect(scanNotifLive(seen, { ...layout }).announce).toBeNull();
  });

  it("在途安装行播「插件名 + 状态短语」（阶段与百分数都在里面，比单念一个数字有用）", () => {
    const seen = baseline(EMPTY);
    const next = scanNotifLive(seen, withJob({ id: "job-a", statusLabel: "Demo 62%" }));
    expect(next.announce).toBe("Demo Plugin Demo 62%");
  });

  it("同批里结果类压过进度类——失败消息不许被同一次扫描的进度跳动盖掉", () => {
    const seen = baseline(EMPTY);
    const next = scanNotifLive(seen, {
      ...withJob({ id: "job-a", statusLabel: "Demo 62%" }),
      groups: [{ key: "demo", label: "demo", unread: 1, items: [{ id: "toast-1", iconClass: "demo-icon", message: "Demo Failed", timeLabel: "Demo Time", actions: [] }] }],
    });
    expect(next.announce).toBe("Demo Failed");
  });

  it("全是结果类时取列表最靠后的那条（面板序由壳排，末位即最近落下的）", () => {
    const seen = baseline(EMPTY);
    const next = scanNotifLive(seen, {
      ...EMPTY,
      groups: [
        { key: "a", label: "a", unread: 0, items: [{ id: "toast-1", iconClass: "demo-icon", message: "Demo First", timeLabel: "Demo Time", actions: [] }] },
        { key: "b", label: "b", unread: 0, items: [{ id: "toast-2", iconClass: "demo-icon", message: "Demo Second", timeLabel: "Demo Time", actions: [] }] },
      ],
    });
    expect(next.announce).toBe("Demo Second");
  });

  it("全是进度类时取末位（没有结果类可让，总得播一条）", () => {
    const seen = baseline(EMPTY);
    const next = scanNotifLive(seen, {
      ...EMPTY,
      sections: [
        { key: "running", label: "Demo A", items: [{ id: "job-a", pluginId: "demo-plugin", name: "Demo A", iconClass: "demo-icon", statusLabel: "Demo 10%" }] },
        { key: "running", label: "Demo B", items: [{ id: "job-b", pluginId: "demo-plugin", name: "Demo B", iconClass: "demo-icon", statusLabel: "Demo 20%" }] },
      ],
    });
    expect(next.announce).toBe("Demo B Demo 20%");
  });

  it("台账只留当前在场的条目——消失的条目下次再出现算「新」，会被播（正是想要的）", () => {
    const seen = baseline(withToast("toast-1", "Demo Message"));
    // 通知被关掉 → 台账清空该条
    const cleared = scanNotifLive(seen, EMPTY);
    expect(cleared.announce).toBeNull();
    expect(cleared.seen.size).toBe(0);
    // 同 id 再次出现（重新发一条）→ 相对空台账是新条目，播
    expect(scanNotifLive(cleared.seen, withToast("toast-1", "Demo Message")).announce).toBe("Demo Message");
  });
});
