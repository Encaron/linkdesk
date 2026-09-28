/**
 * AiManualPoolView——AI 操作手册标签页渲染单测（M3 `AI#16`）。
 *
 * 只测**池哑渲染**该负责的四件事（取数与组装归 `useAiManual.test.ts`，命令接线归
 * `manualCommands.test.ts`）：
 *
 * ① **三态直接分支**——`loading` 画骨架 / `empty` 画空态 / `content` 画正文，没有第四种；
 * ② **壳没推载荷时的兜底是 `loading` 不是 `empty`**（🔴 本文件唯一负控：画成 `empty` 会让用户
 *    读到「本构建未随包发货手册」——手册好端端在包里，那是撒谎）；
 * ③ **章序 / 章标题 / 正文零加工**，且**默认落第一章**（手册的 `00-` 就是阅读起点）；
 * ④ **章导航是 `<button>`**（可 Tab / 可 Enter——键盘唯一的路径），切章只换正文、不改载荷，
 *    **不发任何命令**（本视图零命令接线，与发行说明的「换一版」根本不同——那边要重新取数）。
 *
 * fixture 全虚构（硬约束 21）：版本号 `9.9.9`、章 id 用 `0N-demo-x`、正文用 `演示正文…`。
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, type RenderResult } from "@testing-library/react";
import type { PoolAiManualData, PoolTab } from "../../../core/types/pool/poolLayout";
import { AI_MANUAL_TAB_TYPE } from "../../../core/utils/tabIdentity";
import AiManualPoolView from "./AiManualPoolView";

/** 内容态：三章（首章名带一个「标题≠id」的形态，验证渲染用的是 `title` 而不是 `id`） */
const CONTENT: Extract<PoolAiManualData, { state: "content" }> = {
  state: "content",
  version: "9.9.9",
  chapters: [
    { id: "00-demo-home", title: "演示章首", markdown: "# 演示章首\n\n演示正文甲" },
    { id: "01-demo-path", title: "演示章乙", markdown: "# 演示章乙\n\n演示正文乙" },
    { id: "02-demo-index", title: "演示章丙", markdown: "# 演示章丙\n\n演示正文丙" },
  ],
};

/* M3 `AI#16` EXEMPT：`installStub` / `renderView` / `beforeEach`+`afterEach` 三件与
   `ReleaseNotesPoolView.test.tsx` 同形——这就是**池壳视图渲染测试的样板**（壳推载荷 ⇒ 池只画）。
   两个文件测的是同一条模具的两个实例，⛔ 不抽公共 helper：样板同形才能一眼看出「这一格
   埋的观察点是什么」（各文件的 fixture 与断言才是主体）。同款先例：`aboutCommands.test.ts`。 */
/* jscpd:ignore-start */
/** 发出去的命令逐次记录——**本视图应当一条都不发**（零命令接线），留着是负控的尺子 */
let emitted: Array<[string, unknown[]]>;

function installStub(): void {
  emitted = [];
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    commands: {
      executeCommand: (...args: unknown[]) => { emitted.push([String(args[0]), args.slice(1)]); },
    },
  };
}

/** 渲染一帧——`data` 给 `undefined` = **壳还没推载荷**（兜底那一格） */
function renderView(data?: PoolAiManualData): RenderResult {
  const tab = { type: AI_MANUAL_TAB_TYPE, ...(data ? { aiManual: data } : {}) } as unknown as PoolTab;
  return render(<AiManualPoolView tab={tab} isActive />);
}

beforeEach(() => { installStub(); });
afterEach(() => {
  cleanup();
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});
/* jscpd:ignore-end */

/* ── ①② 三态 ── */

describe("AiManualPoolView（①② 三态直接分支）", () => {
  it("`loading` → 骨架（aria-busy），且**不画**正文任何一件", () => {
    const { container } = renderView({ state: "loading" });

    expect(container.querySelector(".ldk-manual")?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll(".ldk-manual-ch")).toHaveLength(0);
    // 骨架里也有 `.ldk-manual-content`（它是右主区的容器名）——所以判据是**没有 md 正文**
    expect(container.querySelector(".ldk-mdv")).toBeNull();
    expect(container.querySelector(".ldk-manual-empty")).toBeNull();
  });

  it("🔴 负控：壳没推载荷时兜底画**骨架**，不是空态（把 `PENDING` 改成 empty 这条必须红）", () => {
    const { container } = renderView();

    expect(container.querySelector(".ldk-manual")?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector(".ldk-manual-empty")).toBeNull();
    expect(container.querySelector(".ldk-manual-empty-path")).toBeNull();
  });

  it("`content` ⇒ `aria-busy` 撤掉（骨架的标记不许留在正文上）", () => {
    const { container } = renderView(CONTENT);

    expect(container.querySelector(".ldk-manual")?.getAttribute("aria-busy")).toBeNull();
  });

  it("`empty` → 空态：一句「没有可读内容」＋ 手册目录原样印出（路径是值，不被改写）", () => {
    const { container } = renderView({ state: "empty", dir: "C:\\demo\\resources\\ai-manual" });

    expect(container.querySelector(".ldk-manual-empty")).not.toBeNull();
    const code = container.querySelector(".ldk-manual-empty-path code");
    expect(code?.textContent).toBe("C:\\demo\\resources\\ai-manual");
  });

  it("`empty` 且 `dir` 为空串（非壳环境）⇒ **不画**路径那一行（不是画一个空路径）", () => {
    const { container } = renderView({ state: "empty", dir: "" });

    expect(container.querySelector(".ldk-manual-empty")).not.toBeNull();
    expect(container.querySelector(".ldk-manual-empty-path")).toBeNull();
  });
});

/* ── ③ 章序 / 标题 / 默认选中 ── */

describe("AiManualPoolView（③ 章节零加工 + 默认第一章）", () => {
  it("章导航按壳给的顺序逐条画，label 用 `title`（不是 `id`）——池不排序、不 `t()`", () => {
    const { container } = renderView(CONTENT);

    const items = [...container.querySelectorAll(".ldk-manual-ch")];
    expect(items).toHaveLength(3);
    expect(items.map((el) => el.querySelector(".ldk-manual-ch-label")?.textContent)).toEqual([
      "演示章首",
      "演示章乙",
      "演示章丙",
    ]);
  });

  it("默认落**第一章**（`00-` 是阅读起点）：首项 `aria-current=true`，正文是首章", () => {
    const { container } = renderView(CONTENT);

    const items = [...container.querySelectorAll(".ldk-manual-ch")];
    expect(items[0].getAttribute("aria-current")).toBe("true");
    expect(items[1].getAttribute("aria-current")).toBeNull();
    expect(container.querySelector(".ldk-manual-content")?.textContent).toContain("演示正文甲");
  });

  it("版本对账行带着壳推的版本号（「内容是当前版本」的显式凭据）", () => {
    const { container } = renderView(CONTENT);

    expect(container.querySelector(".ldk-manual-sub")?.textContent).toContain("9.9.9");
  });
});

/* ── ④ 章导航是按钮；切章只换正文、不发命令 ── */

describe("AiManualPoolView（④ 章切换 = 纯视图态）", () => {
  it("章导航是 `<button>`（可 Tab / 可 Enter）——键盘不是靠鼠标的替代品而是原生路径", () => {
    const { container } = renderView(CONTENT);

    for (const el of container.querySelectorAll(".ldk-manual-ch")) {
      expect(el.tagName).toBe("BUTTON");
      expect(el.getAttribute("type")).toBe("button");
    }
  });

  it("点第二章 → 正文换成乙、选中态跟着走，且**一条命令都不发**", () => {
    const { container } = renderView(CONTENT);

    fireEvent.click([...container.querySelectorAll(".ldk-manual-ch")][1]);

    const items = [...container.querySelectorAll(".ldk-manual-ch")];
    expect(items[1].getAttribute("aria-current")).toBe("true");
    expect(items[0].getAttribute("aria-current")).toBeNull();
    expect(container.querySelector(".ldk-manual-content")?.textContent).toContain("演示正文乙");
    expect(container.querySelector(".ldk-manual-content")?.textContent).not.toContain("演示正文甲");
    expect(emitted).toEqual([]);
  });

  it("载荷换了（选中的章不再存在）→ 回落第一章，不空白（纯展示兜底，不是第二处态裁决）", () => {
    const { container, rerender } = renderView(CONTENT);

    fireEvent.click([...container.querySelectorAll(".ldk-manual-ch")][2]);
    expect(container.querySelector(".ldk-manual-content")?.textContent).toContain("演示正文丙");

    // 换一本只有另一批章的手册（比如切到另一个版本的手册）——原选中 id 已不存在
    const other: Extract<PoolAiManualData, { state: "content" }> = {
      state: "content",
      version: "9.9.8",
      chapters: [{ id: "00-other", title: "另一册首章", markdown: "# 另一册首章\n\n另一册正文" }],
    };
    rerender(<AiManualPoolView tab={{ type: AI_MANUAL_TAB_TYPE, aiManual: other } as unknown as PoolTab} isActive />);

    expect(container.querySelectorAll(".ldk-manual-ch")).toHaveLength(1);
    expect(container.querySelector(".ldk-manual-content")?.textContent).toContain("另一册正文");
  });
});
