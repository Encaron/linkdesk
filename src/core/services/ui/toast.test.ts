/**
 * toast 存储单测——E6#73f（18 档 §五 E 的 S3/S4/S6 + 两项新增能力）。
 * 覆盖：按来源分桶淘汰 + 折叠汇总计数 / 进行中豁免淘汰 / 用户移除跳过尚无结果 /
 * TTL 自动消失**不**记「别再显示」（isCloseAffordance 机制保留）/ replaceToast 原子替换 /
 * Toast.wake 旗标透传 / 死代码簇确已删除。
 * fixture 用虚构值（硬约束 21：demo-* 插件名、明显虚构的文案）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as toast from "./toast";
import {
  pushToast, dismissToast, replaceToast, updateToast,
  getToasts, getFoldedCount, isPending, sourceKeyOf, clearDismissedState,
  TOAST_SOURCE_CAP, OTHER_SOURCE_KEY,
} from "./toast";

const DISMISSED_LS_KEY = "toast-dismissed";

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  for (const t of getToasts()) dismissToast(t.id);
  vi.useRealTimers();
});

describe("E6#73f 死代码簇已删（零调用方；留着是陷阱）", () => {
  it("runToastAction / getUnreadCount 不再导出", () => {
    // getUnreadCount 的实现是 `return _toasts.length`（名字说是未读、实为总数）——留着迟早被误用。
    // runToastAction 的真派发路径在 useSubscriptions `notif:action` 内联。
    // ⚠️ `subscribeNotifPanelOpen` 曾是本簇第三条，E6#73d 已**带真载体回归**（壳侧「相对时间定时重算」
    // 的定时器），故不再断言其缺席——见本文件尾部的订阅用例。删了它面板开着时时间标签会停在打开瞬间。
    expect("runToastAction" in toast).toBe(false);
    expect("getUnreadCount" in toast).toBe(false);
  });

  it("Toast.icon 字段不再存在（契约无 icon 形参 ⇒ 生产者恒零）", () => {
    pushToast({ message: "演示消息", source: "demo-plugin", ttl: 0 });
    expect("icon" in getToasts()[0]!).toBe(false);
  });
});

describe("E6#73f S3：常驻上限按来源分桶 + 折叠计数（A6 不再无声消失）", () => {
  /** 推 n 条同来源长驻 */
  const pushN = (source: string, n: number) => {
    for (let i = 0; i < n; i++) {
      pushToast({ message: `演示消息 ${source} ${i}`, source, persistent: true, ttl: 0 });
    }
  };

  it("同来源超上限 → 顶掉该来源最老的，折叠计数累加", () => {
    pushN("demo-plugin", TOAST_SOURCE_CAP + 2);
    const live = getToasts().filter((t) => t.persistent);
    expect(live).toHaveLength(TOAST_SOURCE_CAP);
    expect(live.some((t) => t.message === "演示消息 demo-plugin 0")).toBe(false);
    expect(getFoldedCount("demo-plugin")).toBe(2);
  });

  it("一个来源刷屏**顶不掉别的来源**（这正是全局上限的缺陷）", () => {
    pushToast({ message: "演示消息 alpha 独苗", source: "alpha", persistent: true, ttl: 0 });
    pushN("demo-plugin", TOAST_SOURCE_CAP + 3);
    expect(getToasts().some((t) => t.message === "演示消息 alpha 独苗")).toBe(true);
    expect(getFoldedCount("alpha")).toBe(0);
  });

  it("来源键取首段——demo-plugin.subA 与 demo-plugin.subB 同桶", () => {
    pushN("demo-plugin.subA", TOAST_SOURCE_CAP);
    pushN("demo-plugin.subB", 2);
    expect(getFoldedCount("demo-plugin")).toBe(2);
    expect(sourceKeyOf("demo-plugin.subA")).toBe("demo-plugin");
    expect(sourceKeyOf(undefined)).toBe(OTHER_SOURCE_KEY);
  });

  it("自动消失 toast 不参与淘汰（现状不回归）", () => {
    pushToast({ message: "演示消息 auto", source: "demo-plugin", severity: "error" });
    pushN("demo-plugin", TOAST_SOURCE_CAP + 2);
    expect(getToasts().some((t) => t.message === "演示消息 auto")).toBe(true);
  });

  it("该来源被清空 → 折叠计数归零（重新起算，不挂一行凭空多出的汇总）", () => {
    pushN("demo-plugin", TOAST_SOURCE_CAP + 1);
    expect(getFoldedCount("demo-plugin")).toBe(1);
    for (const t of getToasts()) dismissToast(t.id);
    expect(getFoldedCount("demo-plugin")).toBe(0);
  });
});

describe("E6#73f S4：进行中条目豁免淘汰（被顶掉 = 安装期屏幕零反馈）", () => {
  it("isPending 只认 progress === true", () => {
    expect(isPending({ id: "x", message: "m", progress: true })).toBe(true);
    expect(isPending({ id: "x", message: "m", persistent: true })).toBe(false);
    expect(isPending({ id: "x", message: "m" })).toBe(false);
  });

  it("进行中条目不参与常驻淘汰", () => {
    pushToast({ message: "演示消息 装到一半", source: "demo-plugin", progress: true, persistent: true, ttl: 0 });
    for (let i = 0; i < TOAST_SOURCE_CAP + 2; i++) {
      pushToast({ message: `演示消息 长驻 ${i}`, source: "demo-plugin", persistent: true, ttl: 0 });
    }
    expect(getToasts().some((t) => t.message === "演示消息 装到一半")).toBe(true);
    expect(getToasts().filter((t) => t.persistent)).toHaveLength(TOAST_SOURCE_CAP + 1); // 5 长驻 + 1 进行中
  });
});

describe("E6#73f isCloseAffordance：机制保留，但 TTL 自动消失**不算**用户不要了", () => {
  it("用户点 × 关闭 → 记台账；同款再推 → 静默不弹", () => {
    const id = pushToast({ message: "演示消息 一次就好", source: "demo-plugin", isCloseAffordance: true, ttl: 0 });
    dismissToast(id);
    expect(JSON.parse(localStorage.getItem(DISMISSED_LS_KEY) ?? "[]")).toEqual(["demo-plugin::演示消息 一次就好"]);

    expect(pushToast({ message: "演示消息 一次就好", source: "demo-plugin", isCloseAffordance: true, ttl: 0 })).toBe("");
    expect(getToasts()).toHaveLength(0);
  });

  it("放够 ttl 自动消失 → **不**记台账，同款下次照弹（修的就是这个 bug）", () => {
    pushToast({ message: "演示消息 会自消", source: "demo-plugin", isCloseAffordance: true, ttl: 1000 });
    vi.advanceTimersByTime(1000);
    expect(getToasts()).toHaveLength(0);
    expect(localStorage.getItem(DISMISSED_LS_KEY)).toBeNull();

    expect(pushToast({ message: "演示消息 会自消", source: "demo-plugin", isCloseAffordance: true, ttl: 0 })).not.toBe("");
  });

  it("clearDismissedState 清空台账——键名归一到 StoreService 那个（此前 startup 后门写错键名空转）", () => {
    const id = pushToast({ message: "演示消息 清账", source: "demo-plugin", isCloseAffordance: true, ttl: 0 });
    dismissToast(id);
    clearDismissedState();
    expect(JSON.parse(localStorage.getItem(DISMISSED_LS_KEY) ?? "null")).toEqual([]);
  });
});

describe("E6#73f 新增能力②：replaceToast 原子替换（单次 notify、保持原位）", () => {
  it("原地改写 + 保留 id/createdAt + 只 notify 一次", () => {
    const a = pushToast({ message: "演示消息 A", source: "demo-plugin", ttl: 0 });
    pushToast({ message: "演示消息 B", source: "demo-plugin", ttl: 0 });
    const before = getToasts();
    const bCreatedAt = before[1]!.createdAt;

    const seen: number[] = [];
    const off = toast.subscribeToasts(() => seen.push(1));
    expect(replaceToast(a, { message: "演示消息 A′" })).toBe(true);
    off();

    const after = getToasts();
    expect(seen).toHaveLength(1);                        // 单次 notify——不是 dismiss + push 的两次
    expect(after[0]!.id).toBe(a);                        // 位置与身份都不变（不闪、不换位）
    expect(after[0]!.message).toBe("演示消息 A′");
    expect(after[1]!.createdAt).toBe(bCreatedAt);
  });

  it("updateToast 是其薄封装——percent 显式 undefined 清确定进度条", () => {
    const id = pushToast({ message: "演示消息 下载", source: "demo-plugin", progress: true, percent: 42, ttl: 0 });
    updateToast(id, "演示消息 解压", undefined);
    const t = getToasts()[0]!;
    expect(t.message).toBe("演示消息 解压");
    expect(t.percent).toBeUndefined();
  });

  it("id 不存在 → 静默 no-op（返回 false，不抛）", () => {
    expect(replaceToast("toast-not-exist", { message: "演示消息" })).toBe(false);
  });
});

describe("E6#73f/#73b：Toast.wake 唤醒旗标——显式优先，缺省由 defaultWake 定", () => {
  it("显式 wake 原样存下（true / false 都能覆盖缺省）", () => {
    pushToast({ message: "演示消息 装了", source: "demo-plugin", wake: true, ttl: 0 });
    // 显式 false 必须压过缺省——error 级缺省本是 true，生产者说「这条别弹」就得别弹
    pushToast({ message: "演示消息 别弹", source: "demo-plugin", severity: "error", wake: false, ttl: 0 });
    expect(getToasts()[0]!.wake).toBe(true);
    expect(getToasts()[1]!.wake).toBe(false);
  });

  it("缺省①：error 级 ∨ 带动作按钮 → true（18 档 §五 B ④「该弹」级的两条静态特征）", () => {
    pushToast({ message: "演示消息 失败", source: "demo-plugin", severity: "error", ttl: 0 });
    pushToast({ message: "演示消息 等你动手", source: "demo-plugin", actions: [{ label: "演示动作", onClick: () => {} }], ttl: 0 });
    expect(getToasts()[0]!.wake).toBe(true);
    expect(getToasts()[1]!.wake).toBe(true);
  });

  it("缺省②：progress 与 warning 恒不唤醒（R5-6「10%→50% 不叫新状态」+「内存墙不弹」的机械保证）", () => {
    pushToast({ message: "演示消息 进度", source: "demo-plugin", progress: true, ttl: 0 });
    pushToast({ message: "演示消息 内存压力", source: "demo-plugin", severity: "warning", ttl: 0 });
    pushToast({ message: "演示消息 长驻", source: "demo-plugin", persistent: true, ttl: 0 });
    expect(getToasts().map((x) => x.wake)).toEqual([false, false, false]);
  });
});

/**
 * E6#73d（18 档 §八⑲）：失败行**豁免按来源配额淘汰**——失败行本身就是待办，[重试] 必须始终可达。
 * 豁免不等于无界：另有 TOAST_ERROR_BACKSTOP 兜内存。成功/信息行照常折叠。
 */
describe("E6#73d：失败行豁免常驻配额淘汰（§八⑲）", () => {
  it(`同来源 ${TOAST_SOURCE_CAP} 条以上失败 → 一条不淘汰、折叠计数为 0（7 条红字并列是裁决原话场景）`, () => {
    for (let i = 0; i < 7; i++) {
      pushToast({ message: `演示消息 失败 ${i}`, source: "demo-plugin", severity: "error", persistent: true, ttl: 0 });
    }
    expect(getToasts()).toHaveLength(7);
    expect(getFoldedCount("demo-plugin")).toBe(0);
  });

  it("失败行不占配额名额——同来源「5 条成功 + 2 条失败」→ 成功折叠 2 条，失败两条都在", () => {
    for (let i = 0; i < 5 + 2; i++) {
      pushToast({ message: `演示消息 成功 ${i}`, source: "demo-plugin", persistent: true, ttl: 0 });
    }
    pushToast({ message: "演示消息 失败 甲", source: "demo-plugin", severity: "error", persistent: true, ttl: 0 });
    pushToast({ message: "演示消息 失败 乙", source: "demo-plugin", severity: "error", persistent: true, ttl: 0 });
    const msgs = getToasts().map((t) => t.message);
    expect(getFoldedCount("demo-plugin")).toBe(2);
    expect(msgs).toContain("演示消息 失败 甲");
    expect(msgs).toContain("演示消息 失败 乙");
    // 成功行仍受 5 条上限——最老的先被折叠掉
    expect(msgs).not.toContain("演示消息 成功 0");
    expect(msgs).not.toContain("演示消息 成功 1");
  });

  it("进行中的失败行同样豁免（isPending 判据不变——只能由创建它的句柄收掉）", () => {
    for (let i = 0; i < TOAST_SOURCE_CAP + 3; i++) {
      pushToast({ message: `演示消息 失败 ${i}`, source: "demo-plugin", severity: "error", progress: true, ttl: 0 });
    }
    expect(getToasts()).toHaveLength(TOAST_SOURCE_CAP + 3);
    expect(getFoldedCount("demo-plugin")).toBe(0);
  });

  it("内存兜底：失败条目超 TOAST_ERROR_BACKSTOP → 最老的先淘汰，折叠计数按各自来源记账", () => {
    const cap = toast.TOAST_ERROR_BACKSTOP;
    for (let i = 0; i < cap + 1; i++) {
      pushToast({ message: `演示消息 失败 ${i}`, source: "demo-plugin", severity: "error", persistent: true, ttl: 0 });
    }
    // 另一来源补一条，验证折叠计数不会算到它头上
    pushToast({ message: "演示消息 别的来源", source: "demo-other", persistent: true, ttl: 0 });
    expect(getToasts()).toHaveLength(cap + 1); // 上限 + 那条别的来源
    expect(getFoldedCount("demo-plugin")).toBe(1);
    expect(getFoldedCount("demo-other")).toBe(0);
    expect(getToasts().some((t) => t.message === "演示消息 失败 0")).toBe(false);
  });
});

/**
 * E6#73d：面板开合订阅——唯一消费者是壳侧「相对时间定时重算」的定时器。
 * ⚠️ 与 73f 删掉的那个同名函数不是一回事：那个无消费者，这个带真载体。
 */
describe("E6#73d：subscribeNotifPanelOpen", () => {
  it("订阅时立即回放当前值（面板已开着时才挂载也要起得来）", () => {
    toast.setNotifPanelOpen(true);
    const seen: boolean[] = [];
    const off = toast.subscribeNotifPanelOpen((o) => seen.push(o));
    expect(seen).toEqual([true]);
    off();
  });

  it("开合变化逐个通知；同值不重复通知（幂等——定时器不会被反复重建）", () => {
    toast.setNotifPanelOpen(false);
    const seen: boolean[] = [];
    const off = toast.subscribeNotifPanelOpen((o) => seen.push(o));
    toast.setNotifPanelOpen(true);
    toast.setNotifPanelOpen(true);   // 同值
    toast.setNotifPanelOpen(false);
    expect(seen).toEqual([false, true, false]);
    off();
  });

  it("退订后不再收到通知", () => {
    toast.setNotifPanelOpen(false);
    const seen: boolean[] = [];
    const off = toast.subscribeNotifPanelOpen((o) => seen.push(o));
    off();
    toast.setNotifPanelOpen(true);
    expect(seen).toEqual([false]);
  });
});
