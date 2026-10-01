/**
 * 「最近」列表纯逻辑单测——W3b（T6）三修各有用例。
 *
 * 三条判据对着三条存量缺陷（01-设计 §一 第 10 条 ③④ 与 §七#1）：
 *   ① 去重口径——带 workspaceName 的条目必须能被去重（原写法去重不掉 ⇒ 同一视图攒成多行）；
 *   ② 写放大——合并是**纯函数一次出结果**（N 个文件夹不再产生 N 次落盘 / N 次渲染）；
 *   ③ 容量——存 10 显 5，两列表同值（原视图列表显 10）。
 *
 * fixture 全虚构（硬约束 21）：`demo-plugin` / `演示文件夹` 这种明显不存在的串。
 */

import { describe, it, expect } from "vitest";
import {
  RECENT_DISPLAY_CAP,
  RECENT_STORE_CAP,
  dropRecentFolder,
  dropRecentView,
  mergeRecentFolders,
  mergeRecentViews,
  sameRecentView,
  type RecentEntry,
} from "./recentList";

const folder = (path: string) => ({ path, name: `演示文件夹 ${path}` });
const view = (pluginId: string, workspaceName?: string): RecentEntry => ({
  pluginId,
  label: `演示视图 ${pluginId}`,
  ...(workspaceName ? { workspaceName } : {}),
});

describe("sameRecentView——行身份两列都参与（①去重口径）", () => {
  it("🔴 带 workspaceName 的两条同身份视图算同一行（原写法只比 pluginId 且看反了列 ⇒ 此处必红）", () => {
    expect(sameRecentView(view("demo-plugin", "ws-demo"), view("demo-plugin", "ws-demo"))).toBe(true);
  });

  it("同插件不同 workspace ⇒ 是两行（各打开过就各留一条）", () => {
    expect(sameRecentView(view("demo-plugin", "ws-a"), view("demo-plugin", "ws-b"))).toBe(false);
  });

  it("缺省与空串同一件事——`undefined` 与 `\"\"` 不许算两行（否则老数据永远去不掉）", () => {
    expect(sameRecentView(view("demo-plugin"), view("demo-plugin", ""))).toBe(true);
  });

  it("不同插件同名 workspace ⇒ 不是同一行", () => {
    expect(sameRecentView(view("demo-plugin", "ws-a"), view("demo-plugin-b", "ws-a"))).toBe(false);
  });
});

describe("mergeRecentFolders——一次算好最终数组（②写放大收敛）", () => {
  it("批量新增：**一次调用出一个数组**（不需要在循环里反复 set）", () => {
    const next = mergeRecentFolders([folder("E:/演示旧")], [folder("E:/演示A"), folder("E:/演示B")]);
    // 后传入的排在前（同一批里最后一个 = 最近打开的那个），旧的「演示旧」留在末尾
    expect(next.map((f) => f.path)).toEqual(["E:/演示B", "E:/演示A", "E:/演示旧"]);
  });

  it("已在列表里的文件夹再打开一次 ⇒ 只前置、不重复（不产生第二行）", () => {
    const next = mergeRecentFolders([folder("E:/演示A"), folder("E:/演示B")], [folder("E:/演示B")]);
    expect(next.map((f) => f.path)).toEqual(["E:/演示B", "E:/演示A"]);
  });

  it("超出存量上限就截断——存 10 显 5，两个数不是一个（③容量归一）", () => {
    const stored = Array.from({ length: RECENT_STORE_CAP }, (_, i) => folder(`E:/演示${i}`));
    expect(mergeRecentFolders(stored, [folder("E:/演示新")])).toHaveLength(RECENT_STORE_CAP);
    expect(RECENT_STORE_CAP).toBeGreaterThan(RECENT_DISPLAY_CAP);
    expect(RECENT_DISPLAY_CAP).toBe(5);
  });
});

describe("mergeRecentViews——同上去重 ＋ 置顶", () => {
  it("同身份再打开 ⇒ 前置且不重复（去重这一半靠 sameRecentView）", () => {
    const next = mergeRecentViews([view("demo-plugin"), view("demo-plugin-b")], view("demo-plugin"));
    expect(next.map((v) => v.pluginId)).toEqual(["demo-plugin", "demo-plugin-b"]);
  });

  it("🔴 带 workspaceName 的同插件条目被正确去重（原实现会留下两行）", () => {
    const next = mergeRecentViews([view("demo-plugin", "ws-demo")], view("demo-plugin", "ws-demo"));
    expect(next).toHaveLength(1);
    expect(next[0]!.workspaceName).toBe("ws-demo");
  });

  it("不同 workspace 的两条同插件条目并存（不是同一行）", () => {
    const next = mergeRecentViews([view("demo-plugin", "ws-a")], view("demo-plugin", "ws-b"));
    expect(next.map((v) => v.workspaceName)).toEqual(["ws-b", "ws-a"]);
  });

  it("存量上限截断", () => {
    const stored = Array.from({ length: RECENT_STORE_CAP }, (_, i) => view(`demo-plugin-${i}`));
    expect(mergeRecentViews(stored, view("demo-plugin-new"))).toHaveLength(RECENT_STORE_CAP);
  });
});

describe("drop*——剔除只清记录，不拉黑（§七#9）", () => {
  it("按路径剔除文件夹；其余逐条不动", () => {
    const next = dropRecentFolder([folder("E:/演示A"), folder("E:/演示B")], "E:/演示A");
    expect(next.map((f) => f.path)).toEqual(["E:/演示B"]);
  });

  it("按身份剔除视图——只掉命中的那一行", () => {
    const next = dropRecentView([view("demo-plugin", "ws-a"), view("demo-plugin", "ws-b")], view("demo-plugin", "ws-b"));
    expect(next.map((v) => v.workspaceName)).toEqual(["ws-a"]);
  });
});
