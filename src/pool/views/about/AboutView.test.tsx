/**
 * AboutView——关于标签页渲染单测（E6#57.14a；04「关于页重设计」四区改版）。
 *
 * 只测**池哑渲染**该负责的四件事（取数与组装归 `useAbout.test.ts`，命令接线归
 * `aboutCommands.test.ts`）：
 *
 * ① **两态直接分支**——`loading` 画骨架 / `content` 画四区正文，没有第三种；
 * ② **壳没推载荷时的兜底是 `loading` 不是「全 `—` 的内容态」**（🔴 本文件唯一的负控：
 *    画成 `content` + 全 `—` 会让用户读到「这台机器读不出身份」——数据只是还没到，那是撒谎）；
 * ③ **卡片行是壳推什么就画什么**——顺序/条数/标签/值**零加工**（🔴「壳想池画」在池侧的落地判据）；
 *    链接行（`href`）画 `<a>` 且带 `target="_blank"`（mailto/https 都由全局外链路由接管），
 *    `secondary` 行降档类——池只认壳给的旗子，不自己判主备；
 * ④ **按钮/页脚链接各发哪条命令**——全是既有命令，零入参。
 *
 * fixture 全虚构（硬约束 21）：值用 `9.9.9` / `abc1234`、标签用 `演示标签甲`、URL 用
 * `https://demo.invalid/...`——**不写真 i18n 文案**（真文案归壳侧断言，此处池只是 `map`，
 * 写真的反而会让「池有没有自己 t()」这件事测不出来）。
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, type RenderResult } from "@testing-library/react";
import type { PoolAboutData, PoolTab } from "../../../core/types/pool/poolLayout";
import { ABOUT_TAB_TYPE } from "../../../core/utils/tabIdentity";
import AboutView from "./AboutView";

/** 内容态：三卡带链接行/降档行各一（四区渲染的关键分支都摸到），其余全虚构 */
const CONTENT: Extract<PoolAboutData, { state: "content" }> = {
  state: "content",
  name: "演示软件名",
  logoUrl: "/demo/logo.svg",
  version: "9.9.9",
  tagline: "演示定位句",
  cards: [
    {
      title: "演示卡甲",
      rows: [
        { label: "演示标签甲", value: "abc1234" },
        { label: "演示标签乙", value: "demo-primary@demo.invalid", href: "mailto:demo-primary@demo.invalid" },
        { label: "", value: "demo-secondary@demo.invalid", href: "mailto:demo-secondary@demo.invalid", secondary: true },
      ],
    },
    { title: "演示卡乙", rows: [{ label: "演示标签丙", value: "演示值丙" }] },
  ],
  footerCopyright: "© 2026 演示张三（Demo Zhang） · MIT License",
  repoUrl: "https://github.com/demo-owner/demo-repo",
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
  it("`loading` → 骨架（aria-busy + 三卡各两行占位），且**不画**正文的任何一件", () => {
    const { container } = renderView({ state: "loading" });

    expect(container.querySelector(".ldk-about")?.getAttribute("aria-busy")).toBe("true");
    // 骨架与四区正文同形：HERO（logo/名/定位句条）+ 卡×3——真数据落地不跳位
    expect(container.querySelectorAll(".ldk-about-skel-logo")).toHaveLength(1);
    expect(container.querySelectorAll(".ldk-about-card")).toHaveLength(3);
    expect(container.querySelector(".ldk-about-name")).toBeNull();
    expect(container.querySelector(".ldk-about-actions")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("🔴 负控：壳没推载荷时兜底画**骨架**，不是「全 `—` 的内容态」（把 `PENDING` 改成 content 这条必须红）", () => {
    const { container } = renderView();

    expect(container.querySelector(".ldk-about")?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelector(".ldk-about-name")).toBeNull();
    expect(container.querySelectorAll(".ldk-about-row .v")).toHaveLength(0);
  });

  it("`content` → HERO（名字 + 版本药丸 v 前缀 + 定位句）＋ logoUrl 原样进 img src", () => {
    const { container } = renderView(CONTENT);

    expect(container.querySelector(".ldk-about-name")?.textContent).toBe(CONTENT.name);
    expect(container.querySelector(".ldk-about-ver")?.textContent).toBe("v9.9.9");
    expect(container.querySelector(".ldk-about-tagline")?.textContent).toBe(CONTENT.tagline);
    const img = container.querySelector(".ldk-about-logo")!;
    expect(img.getAttribute("src")).toBe(CONTENT.logoUrl);
    expect(img.getAttribute("aria-hidden")).toBe("true");
  });

  it("`content` ⇒ `aria-busy` 撤掉（骨架的标记不许留在正文上）", () => {
    const { container } = renderView(CONTENT);

    expect(container.querySelector(".ldk-about")?.getAttribute("aria-busy")).toBeNull();
  });
});

/* ── ③ 卡片行零加工 ── */

describe("AboutView（③ 卡片行 = 壳推什么画什么）", () => {
  it("🔴 卡序、行序、标签、值**逐字照传**——池不排序、不 `t()`、不补位", () => {
    const { container } = renderView(CONTENT);

    const cards = [...container.querySelectorAll(".ldk-about-card")];
    expect(cards).toHaveLength(CONTENT.cards.length);
    expect(cards[0].querySelector(".ldk-about-card-title")?.textContent).toBe("演示卡甲");
    const rows = [...cards[0].querySelectorAll(".ldk-about-row")];
    expect(rows).toHaveLength(3);
    expect(rows[0].querySelector(".k")?.textContent).toBe("演示标签甲");
    expect(rows[0].querySelector(".v")?.textContent).toBe("abc1234");
  });

  it("链接行画 `<a>` 且 `target=_blank`；纯文本行画 `.v`——壳给的 `href` 是唯一判据", () => {
    const { container } = renderView(CONTENT);

    const rows = [...container.querySelectorAll(".ldk-about-card")[0].querySelectorAll(".ldk-about-row")];
    // 纯文本行
    expect(rows[0].querySelector("a")).toBeNull();
    expect(rows[0].querySelector(".v")?.textContent).toBe("abc1234");
    // mailto 行——同样 _blank（全局外链路由 EXTERNAL_PROTOCOLS 含 mailto → openExternal）
    const a = rows[1].querySelector("a")!;
    expect(a.getAttribute("href")).toBe("mailto:demo-primary@demo.invalid");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.textContent).toBe("demo-primary@demo.invalid");
  });

  it("`secondary` 行带降档类（主备靠顺序 + 颜色双表达——池只认旗子，不自己判）", () => {
    const { container } = renderView(CONTENT);

    const rows = [...container.querySelectorAll(".ldk-about-card")[0].querySelectorAll(".ldk-about-row")];
    expect(rows[2].querySelector("a")?.classList.contains("ldk-about-link--secondary")).toBe(true);
    expect(rows[1].querySelector("a")?.classList.contains("ldk-about-link--secondary")).toBe(false);
  });

  it("author 缺席 = 壳只推 2 张卡 ⇒ 池画 2 张（整块不出现，不是画一屏 `—`）", () => {
    const { container } = renderView({ ...CONTENT, cards: CONTENT.cards.slice(0, 1) });

    expect(container.querySelectorAll(".ldk-about-card")).toHaveLength(1);
  });
});

/* ── ④ 页脚 ── */

describe("AboutView（④ 页脚：版权行与两条外链）", () => {
  it("版权行给了就画；「MIT 全文」= 既有命令 `app.viewLicense`", () => {
    const { container } = renderView(CONTENT);
    const links = [...container.querySelectorAll(".ldk-about-foot-link")];
    fireEvent.click(links[0]);

    expect(container.querySelector(".ldk-about-foot-copy")?.textContent).toBe(CONTENT.footerCopyright);
    expect(emitted).toEqual([["app.viewLicense", [undefined]]]);
  });

  it("「在 GitHub 查看源码」= 外链（壳推的 repoUrl 原样进 href + target=_blank）", () => {
    const { container } = renderView(CONTENT);
    const a = container.querySelector('.ldk-about-foot-link[href]')!;

    expect(a.getAttribute("href")).toBe(CONTENT.repoUrl);
    expect(a.getAttribute("target")).toBe("_blank");
  });

  it("footerCopyright / repoUrl 缺席 ⇒ 对应件不画（author 缺席时页脚只剩 MIT）", () => {
    const { container } = renderView({ ...CONTENT, footerCopyright: undefined, repoUrl: undefined });

    expect(container.querySelector(".ldk-about-foot-copy")).toBeNull();
    expect(container.querySelectorAll(".ldk-about-foot-link")).toHaveLength(1);
  });
});

/* ── ⑤ 动作行 → 命令 ── */

describe("AboutView（⑤ 三个按钮各发哪条命令）", () => {
  it("「复制」= `app.aboutCopy` 且是**主按钮**（动作行第一位，04 设计 §四.1 ②）", () => {
    const { container } = renderView(CONTENT);
    const btns = container.querySelectorAll(".ldk-about-btn");
    fireEvent.click(btns[0]);

    expect(emitted).toEqual([["app.aboutCopy", [undefined]]]);
    expect(btns[0].classList.contains("ldk-about-btn--primary")).toBe(true);
    expect(btns[1].classList.contains("ldk-about-btn--primary")).toBe(false);
  });

  it("「检查更新…」= **既有** `update.checkForUpdates`（结果落通知面，本视图不画结果）", () => {
    const { container } = renderView(CONTENT);
    fireEvent.click(container.querySelectorAll(".ldk-about-btn")[1]);

    expect(emitted).toEqual([["update.checkForUpdates", [undefined]]]);
  });

  it("「发行说明」= **既有** `update.openReleaseNotes`（兄弟标签页入口，零新建）", () => {
    const { container } = renderView(CONTENT);
    fireEvent.click(container.querySelectorAll(".ldk-about-btn")[2]);

    expect(emitted).toEqual([["update.openReleaseNotes", [undefined]]]);
  });
});
