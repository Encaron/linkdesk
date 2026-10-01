/**
 * @vitest-environment jsdom
 *
 * GroupPane 零 tabs 分支测试——W7b（欢迎页重设计 T12，设计 §三 W7）。
 *
 * 锁的不变量：**零标签的组 ⇒ 空场层（EmptyStage）补位，标签栏不渲染**；有标签 ⇒ 照旧只有标签栏
 * （零标签分支不误吃正常态）。T11 拆掉「main 恒非空」后，「关掉最后一个标签页」即落入本分支。
 *
 * GroupTabBar 被 mock 掉（本测只验 GroupPane 的分支选择，不测标签栏本身）——两点理由：
 *   ① PoolSectionStack.test.tsx 同款做法（不测的下游组件 mock 成 data-testid 桩）；
 *   ② 真 GroupTabBar 在 jsdom 里另需 `CSS.escape` ＋ `window.matchMedia` 两个桩（它量溢出/滚入视野），
 *      本测不需要为别人的可测性付账。
 *
 * i18n：import i18n 模块级 init（t(key) 缺表返回 key 原文，ViewTitleActions.test.tsx 同款）。
 * 🔴 只断言**结构与类名**，不断言任何可见文案——测试环境无 i18n 资源（交接 §四 坑②）。
 * 夹具全虚构（硬约束 21）。
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "../../../../i18n";

vi.mock("../../../shared/group-tab-bar/GroupTabBar", () => ({
  default: () => <div data-testid="mock-tab-bar" />,
}));

import GroupPane from "./GroupPane";
import type { PoolGroup, PoolTab } from "../../../../core/types/pool/poolLayout";

/** 虚构夹具——虚构插件 id / 虚构标签名，不引任何真实工程 */
const ONE_TAB: PoolTab = { id: "tab-fict-1", pluginId: "demo-fict", title: "虚构标签" };

function makeGroup(tabs: PoolTab[]): PoolGroup {
  return { id: "main", flex: 1, activeTabId: tabs[0]?.id ?? "", tabs };
}

function renderPane(group: PoolGroup) {
  return render(
    <GroupPane
      group={group}
      tabs={group.tabs}
      dragInsertIndex={null}
      onTabDragStart={() => {}}
      onTabBarMount={() => {}}
    />,
  );
}

describe("GroupPane 零 tabs 分支（T12：空场层补位）", () => {
  afterEach(cleanup);

  it("零标签 → 空场层在场、标签栏不在场", () => {
    const { container, queryByTestId } = renderPane(makeGroup([]));
    expect(container.querySelector(".ldk-empty-stage")).not.toBeNull();
    expect(container.querySelector(".ldk-empty-stage-wordmark")).not.toBeNull();
    expect(queryByTestId("mock-tab-bar")).toBeNull();
  });

  it("有标签 → 标签栏照旧、空场层不出现（零标签分支不误吃正常态）", () => {
    const { container, queryByTestId } = renderPane(makeGroup([ONE_TAB]));
    expect(queryByTestId("mock-tab-bar")).not.toBeNull();
    expect(container.querySelector(".ldk-empty-stage")).toBeNull();
  });

  it("空场层结构：logo 是装饰件（aria-hidden）＋斜体强调落点 = Desk", () => {
    const { container } = renderPane(makeGroup([]));
    expect(container.querySelector(".ldk-empty-stage-mark")?.getAttribute("aria-hidden")).toBe("true");
    // 斜体强调「斜 Desk」——em 包住的是 Desk、不是 Link（2026-10-02 拍板）
    expect(container.querySelector(".ldk-empty-stage-wordmark em")?.textContent).toBe("Desk");
  });
});
