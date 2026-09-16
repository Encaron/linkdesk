/**
 * AboutView——关于标签页渲染单测（E6#57.14a）。
 *
 * 只测**池哑渲染**该负责的四件事（取数与组装归 `useAbout.test.ts`，命令接线归
 * `aboutCommands.test.ts`）：
 *
 * ① **两态直接分支**——`loading` 画骨架 / `content` 画正文，没有第三种（05 §2.4）；
 * ② **壳没推载荷时的兜底是 `loading` 不是「全 `—` 的内容态」**（🔴 本文件唯一的负控：
 *    画成 `content` + 八个 `—` 会让用户读到「这台机器读不出身份」——数据只是还没到，那是撒谎）；
 * ③ **字段行是壳推什么就画什么**——顺序/条数/标签/值**零加工**（🔴 这条是「壳想池画」在池侧的
 *    落地判据：池一旦自己排顺序或自己 `t()` 标签，「加字段 = 壳侧加一项、池侧零改」就假了）；
 * ④ **两个按钮各发哪条命令**——都走 `executePoolCommand`，且**都不带业务入参**。
 *
 * fixture 全虚构（硬约束 21）：值用 `9.9.9` / `abc1234` 这种明显不存在的串，标签用 `演示标签甲`
 * ——**不写真 i18n 文案**（真文案归壳侧断言，此处池只是 `data.fields.map`，写真的反而会让
 * 「池有没有自己 t()」这件事测不出来：真文案与 `t()` 产出相同 ⇒ 绿得没有信息量）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, type RenderResult } from "@testing-library/react";
import type { PoolAboutData, PoolTab } from "../../../core/types/pool/poolLayout";
import { ABOUT_TAB_TYPE } from "../../../core/utils/tabIdentity";
import AboutView from "./AboutView";

/** 内容态：2 行就够（八行是壳侧 fixture 的事——池只 `map`，条数由壳给） */
const CONTENT: Extract<PoolAboutData, { state: "content" }> = {
  state: "content",
  name: "演示软件名",
  logoUrl: "/demo/logo.svg",
  fields: [
    { label: "演示标签甲", value: "9.9.9" },
    { label: "演示标签乙", value: "abc1234" },
  ],
};

/* E6#57.14 EXEMPT：本块与 `ReleaseNotesPoolView.test.tsx` 同形——**池壳视图测试的标准脚手架**
   （window.linkdesk.commands 桩 + `renderView(data?)` 造 tab + 装/拆 lifecycle）。两个视图都是
   「壳推 DTO、池只画、动作发命令」，脚手架必然同形；抽公共 helper 得把 tab 字段名与 DTO 类型
   一并参数化，反而把「这个文件测的是哪一格」读没了。内联 mock 是本仓库常态（同款先例：
   `PoolSectionStack.test.tsx` / `ViewTitleActions.test.ts`）。 */
/* jscpd:ignore-start */
/** `executePoolCommand` 发出去的命令逐次记录——第二个实参是 token 占位槽（恒 `undefined`） */
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
function renderView(data?: PoolAboutData): RenderResult {
  const tab = { type: ABOUT_TAB_TYPE, ...(data ? { about: data } : {}) } as unknown as PoolTab;
  return render(<AboutView tab={tab} isActive />);
}

beforeEach(() => { installStub(); });
afterEach(() => {
  cleanup();
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});
/* jscpd:ignore-end */

/* ── ①② 两态 ── */

describe("AboutView（①② 两态直接分支）", () => {
  it("`loading` → 骨架（aria-busy + 八行占位），且**不画**正文的任何一件", () => {
    const { container } = renderView({ state: "loading" });

    expect(container.querySelector(".ldk-about")?.getAttribute("aria-busy")).toBe("true");
    // 八行字段的骨架条 —— 与 Frame 6 的八行一一对应（不跳位）
    expect(container.querySelectorAll(".ldk-about-skel .ldk-about-row")).toHaveLength(8);
    expect(container.querySelector(".ldk-about-name")).toBeNull();
    expect(container.querySelector(".ldk-about-actions")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    // 骨架条自身 aria-hidden——它们没有语义内容，读屏不该念出一串空 div
    expect(container.querySelector(".ldk-about-skel")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("🔴 负控：壳没推载荷时兜底画**骨架**，不是「全 `—` 的内容态」（把 `PENDING` 改成 content 这条必须红）", () => {
    const { container } = renderView();

    expect(container.querySelector(".ldk-about")?.getAttribute("aria-busy")).toBe("true");
    // 画成 content 会把「还没开始取数」说成「这台机器读不出身份」——那是撒谎
    expect(container.querySelector(".ldk-about-name")).toBeNull();
    expect(container.querySelectorAll(".ldk-about-row .v")).toHaveLength(0);
  });

  it("`content` → 品牌区（名字 + 壳给的 logoUrl 原样进 img src）", () => {
    const { container } = renderView(CONTENT);

    expect(container.querySelector(".ldk-about-name")?.textContent).toBe(CONTENT.name);
    const img = container.querySelector(".ldk-about-logo")!;
    expect(img.getAttribute("src")).toBe(CONTENT.logoUrl);
    // 名字就在正下方 ⇒ 读屏不重复念（装饰性图片）
    expect(img.getAttribute("aria-hidden")).toBe("true");
  });

  it("`content` ⇒ `aria-busy` 撤掉（骨架的标记不许留在正文上）", () => {
    const { container } = renderView(CONTENT);

    expect(container.querySelector(".ldk-about")?.getAttribute("aria-busy")).toBeNull();
  });
});

/* ── ③ 字段表零加工 ── */

describe("AboutView（③ 字段行 = 壳推什么画什么）", () => {
  it("🔴 行序、条数、标签、值**逐字照传**——池不排序、不 `t()`、不补位", () => {
    const { container } = renderView(CONTENT);

    const rows = [...container.querySelectorAll(".ldk-about-row")];
    expect(rows).toHaveLength(CONTENT.fields.length);
    rows.forEach((row, i) => {
      expect(row.querySelector(".k")?.textContent).toBe(CONTENT.fields[i].label);
      expect(row.querySelector(".v")?.textContent).toBe(CONTENT.fields[i].value);
    });
  });

  it("壳推 3 行就画 3 行（**条数由壳定**——加字段不改本组件）", () => {
    const { container } = renderView({
      ...CONTENT,
      fields: [...CONTENT.fields, { label: "演示标签丙", value: "—" }],
    });

    expect(container.querySelectorAll(".ldk-about-row")).toHaveLength(3);
    // `—` 是壳给的**值**，池照画（池不知道它是不是占位符——那是壳的账）
    expect(container.querySelectorAll(".ldk-about-row")[2].querySelector(".v")?.textContent).toBe("—");
  });

  it("壳推 0 行就不画字段区（不画一个空框）", () => {
    const { container } = renderView({ ...CONTENT, fields: [] });

    expect(container.querySelector(".ldk-about-fields")).toBeTruthy();
    expect(container.querySelectorAll(".ldk-about-row")).toHaveLength(0);
  });
});

/* ── ④ 交互 → 命令 ── */

describe("AboutView（④ 两个按钮各发哪条命令）", () => {
  it("「检查更新…」= **既有** `update.checkForUpdates`（零入参，第二个实参是 token 占位槽）", () => {
    const { container } = renderView(CONTENT);
    fireEvent.click(container.querySelectorAll(".ldk-about-btn")[0]);

    expect(emitted).toEqual([["update.checkForUpdates", [undefined]]]);
  });

  it("「复制」= `app.aboutCopy`（壳侧命令——剪贴板写入口在 core，池够不着）", () => {
    const { container } = renderView(CONTENT);
    fireEvent.click(container.querySelectorAll(".ldk-about-btn")[1]);

    expect(emitted).toEqual([["app.aboutCopy", [undefined]]]);
  });

  it("「复制」是**主按钮**（Frame 6 的 `.about-btn.primary` 在右）——别把两者画反", () => {
    const { container } = renderView(CONTENT);
    const btns = container.querySelectorAll(".ldk-about-btn");

    expect(btns[1].classList.contains("ldk-about-btn--primary")).toBe(true);
    expect(btns[0].classList.contains("ldk-about-btn--primary")).toBe(false);
  });
});
