/**
 * 通知面板三态状态机单测——E6#73a（18 档 §五 A「视觉两态，语义三态」）。
 *
 * 断言面 = 那张**七行迁移表**逐行 + 「明确不存在的行为」逐条反向。
 * 表体是**唯一**权威：这里每多写一条迁移，都是往设计里偷偷加行为。
 */

import { describe, it, expect } from "vitest";
import {
  notifPanelTransition,
  isPanelExpanded,
  type NotifPanelState,
  type NotifPanelEvent,
} from "./notifPanelState";

const ALL_STATES: NotifPanelState[] = ["idle", "open", "minimized"];

describe("E6#73a 三态迁移表——逐行真值", () => {
  // 第 1 行：IDLE → OPEN（点铃铛）→ 认账
  it("① idle + 点铃铛 → open 且认账", () => {
    expect(notifPanelTransition("idle", { type: "bell" })).toEqual({ state: "open", markSeen: true });
  });

  // 第 2 行：IDLE → OPEN（用户点击发起安装 = 唤醒白名单①）→ **不**认账
  it("② idle + 收到唤醒 → open 且**不**认账（用户还没看）", () => {
    expect(notifPanelTransition("idle", { type: "wake" })).toEqual({ state: "open", markSeen: false });
  });

  // 第 3 行：MINIMIZED → OPEN（点铃铛）——用户亲口锚点 R3-5，旧版设计漏掉的那条
  it("③ minimized + 点铃铛 → open 且认账（R3-5 亲口锚点：最小化后点铃铛能看到）", () => {
    expect(notifPanelTransition("minimized", { type: "bell" })).toEqual({ state: "open", markSeen: true });
  });

  // 第 4 行：MINIMIZED → OPEN（收到唤醒）——最小化**不是永久静音**（R5-4）
  it("④ minimized + 收到唤醒 → open 且**不**认账（终态仍会冒出来）", () => {
    expect(notifPanelTransition("minimized", { type: "wake" })).toEqual({ state: "open", markSeen: false });
  });

  // 第 5、6 行：OPEN → MINIMIZED（点「最小化」/ Esc，同一事件）→ 认账
  it("⑤ open + 点最小化 → minimized 且认账（关时就认账）", () => {
    expect(notifPanelTransition("open", { type: "minimize" })).toEqual({ state: "minimized", markSeen: true });
  });
});

describe("E6#73a 反向测试——「明确不存在的行为」防回退", () => {
  it("OPEN 时点铃铛**无迁移**（表里没有 OPEN→铃铛 这条；铃铛只进不出）", () => {
    expect(notifPanelTransition("open", { type: "bell" })).toEqual({ state: "open", markSeen: false });
  });

  it("minimize 已经最小化 / 还没开时是空操作（不认账）", () => {
    expect(notifPanelTransition("minimized", { type: "minimize" })).toEqual({ state: "minimized", markSeen: false });
    expect(notifPanelTransition("idle", { type: "minimize" })).toEqual({ state: "idle", markSeen: false });
  });

  it("wake 在已展开时是**空迁移**——不重排、不认账（新条目只追加）", () => {
    expect(notifPanelTransition("open", { type: "wake" })).toEqual({ state: "open", markSeen: false });
  });

  it("起点只有 idle/open/minimized 三种取值——不存在第四种非法组合", () => {
    // 「两个独立布尔会凑出第四种非法组合」是本设计**不要**布尔的理由；
    // 状态是单值 union ⇒ 任何 (状态, 事件) 组合都落在表内，没有「既非展开也非最小化」的格子。
    for (const state of ALL_STATES) {
      for (const event of [{ type: "bell" }, { type: "wake" }, { type: "minimize" }] as NotifPanelEvent[]) {
        expect(ALL_STATES).toContain(notifPanelTransition(state, event).state);
      }
    }
  });

  it("认账只出现在两条路径：点铃铛开 / 最小化关——唤醒来的一律不认账", () => {
    const seen = ALL_STATES.flatMap((s) =>
      ([{ type: "bell" }, { type: "wake" }, { type: "minimize" }] as NotifPanelEvent[]).map(
        (e) => `${s}+${e.type}=${notifPanelTransition(s, e).markSeen}`,
      ),
    );
    expect(seen.filter((x) => x.endsWith("=true")).sort()).toEqual([
      "idle+bell=true",
      "minimized+bell=true",
      "open+minimize=true",
    ]);
  });
});

describe("E6#73a isPanelExpanded——视觉两态的唯一分叉点", () => {
  it("只有 open 展开；idle 与 minimized **视觉一样**（都收起）", () => {
    expect(isPanelExpanded("open")).toBe(true);
    expect(isPanelExpanded("idle")).toBe(false);
    expect(isPanelExpanded("minimized")).toBe(false);
  });
});
