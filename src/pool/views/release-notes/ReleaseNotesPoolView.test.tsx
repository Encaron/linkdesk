/**
 * ReleaseNotesPoolView——发行说明标签页渲染单测（E6#57.13a）。
 *
 * 只测**池哑渲染**该负责的三件事（文字归壳侧 `useReleaseNotes.test.ts`，命令接线归
 * `releaseNotesCommands.test.ts`）：
 *
 * ① **三态判别联合直接分支**——`loading` 画骨架 / `empty` 画空态 / `content` 画正文，
 *    没有第四种、也没有「合并中间态」（05 §2.4：态由拉取结果唯一决定）；
 * ② **壳没推载荷时的兜底是 `loading` 不是 `empty`**（🔴 本文件里唯一一条负控：画成 `empty`
 *    会让用户读到「无法连接 GitHub」——网络可能好得很，那是撒谎）；
 * ③ **三种交互各发哪条命令、带什么入参**——尤其「点左窄栏要带上版本号」，漏了会静默失效。
 *
 * fixture 全虚构（硬约束 21）：版本号 9.9.9 / 9.9.8、文案用 `演示…` 这种明显不存在的串。
 * 日期 `09-01` 是**格式**不是文案，照壳侧 `_shortDate` 的产出形态给。
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, type RenderResult } from "@testing-library/react";
import type { PoolReleaseNotesData, PoolTab } from "../../../core/types/pool/poolLayout";
import { RELEASE_NOTES_TAB_TYPE } from "../../../core/utils/tabIdentity";
import ReleaseNotesPoolView from "./ReleaseNotesPoolView";

/** 内容态：字段值全虚构；`subtitle` / `channelLabel` 是**壳侧成品**（池逐字画，不自己拼） */
const CONTENT: Extract<PoolReleaseNotesData, { state: "content" }> = {
  state: "content",
  version: "9.9.9",
  subtitle: "演示副标题 · 演示通道",
  channelLabel: "演示通道",
  body: "演示正文",
  historical: [
    { version: "9.9.9", dateLabel: "09-01" },
    { version: "9.9.8", dateLabel: "08-01" },
  ],
  listUrl: "https://demo.invalid/releases",
};

/** `update.releaseNotesSelect` 等命令收到的实参逐次记录——第二个是 token 占位槽 */
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
function renderView(data?: PoolReleaseNotesData): RenderResult {
  const tab = { type: RELEASE_NOTES_TAB_TYPE, ...(data ? { releaseNotes: data } : {}) } as unknown as PoolTab;
  return render(<ReleaseNotesPoolView tab={tab} isActive />);
}

beforeEach(() => { installStub(); });
afterEach(() => {
  cleanup();
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

/* ── ① 三态 ── */

describe("ReleaseNotesPoolView（① 三态直接分支）", () => {
  it("`loading` → 骨架（aria-busy，且**不画**任何一版的正文/空态文案）", () => {
    const { container } = renderView({ state: "loading" });

    expect(container.querySelector(".ldk-rn")?.getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll(".rn-skel-item")).toHaveLength(3);
    expect(container.querySelector(".rn-empty")).toBeNull();
    expect(container.querySelector(".rn-ver-title")).toBeNull();
    // 骨架条自身 aria-hidden——它们没有语义内容，读屏不该念出一串空 div
    expect(container.querySelector(".rn-skel")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("`empty` → 空态：一句通用文案 + [重试]，正文与历史行都不画", () => {
    const { container } = renderView({ state: "empty", listUrl: CONTENT.listUrl });

    expect(container.querySelector(".rn-empty-title")).toBeTruthy();
    expect(container.querySelector(".rn-content--center")).toBeTruthy();
    expect(container.querySelectorAll(".rn-ver")).toHaveLength(0);
    expect(container.querySelector(".rn-hist-note")).toBeTruthy();
  });

  it("`empty` **拿不到** listUrl ⇒ 一个链接都不画（空链接比没有链接更糟）", () => {
    const { container } = renderView({ state: "empty" });

    expect(container.querySelector(".rn-empty-title")).toBeTruthy();
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("🔴 负控：壳没推载荷时兜底画**骨架**，不是空态（把 `PENDING` 改成 empty 这条必须红）", () => {
    const { container } = renderView();

    expect(container.querySelector(".ldk-rn")?.getAttribute("aria-busy")).toBe("true");
    // 画成 empty 会把「还没开始」说成「连不上 GitHub」——那是撒谎
    expect(container.querySelector(".rn-empty")).toBeNull();
  });

  it("`content` → 版本号（「v」是格式不是文案）+ 壳给的副标题与通道 + 历史行齐备", () => {
    const { container } = renderView(CONTENT);

    expect(container.querySelector(".rn-ver-title")?.textContent).toContain("v9.9.9");
    expect(container.querySelector(".rn-ver-title")?.textContent).toContain(CONTENT.subtitle);
    expect(container.querySelector(".rn-chip")?.textContent).toBe(CONTENT.channelLabel);
    expect(container.querySelectorAll(".rn-ver")).toHaveLength(2);
  });

  it("左窄栏只给**当前那一版**画 aria-current（读屏要听得出「你看的就是这版」）", () => {
    const { container } = renderView(CONTENT);

    const rows = [...container.querySelectorAll(".rn-ver")];
    expect(rows.filter((r) => r.getAttribute("aria-current") === "true")).toHaveLength(1);
    expect(rows[0].getAttribute("aria-current")).toBe("true");
    expect(rows[0].querySelector(".rn-ver-num")?.textContent).toBe("v9.9.9");
    expect(rows[0].querySelector(".rn-ver-date")?.textContent).toBe("09-01");
  });

  it("横幅**给了才画**（池不判该不该有——那是壳的账）", () => {
    const without = renderView(CONTENT);
    expect(without.container.querySelector(".rn-banner")).toBeNull();
    cleanup();

    const withBanner = renderView({ ...CONTENT, banner: "演示横幅句子" });
    expect(withBanner.container.querySelector(".rn-banner-text")?.textContent).toBe("演示横幅句子");
  });
});

/* ── ③ 交互 → 命令 ── */

describe("ReleaseNotesPoolView（③ 三种交互各发哪条命令）", () => {
  it("🔴 点左窄栏 = `releaseNotesSelect` **带版本号**（漏了它就静默失效——点哪版都取最新）", () => {
    const { container } = renderView(CONTENT);
    fireEvent.click(container.querySelectorAll(".rn-ver")[1]);

    expect(emitted).toHaveLength(1);
    expect(emitted[0][0]).toBe("update.releaseNotesSelect");
    // 第二个实参是 token 占位槽（`executePoolCommand` 恒补），第三个才是版本号
    expect(emitted[0][1]).toEqual([undefined, "9.9.8"]);
  });

  it("空态 [重试] = `releaseNotesRetry`（不带版本号——壳自己知道在重试哪一版）", () => {
    const { container } = renderView({ state: "empty" });
    fireEvent.click(container.querySelector(".rn-btn")!);

    expect(emitted).toEqual([["update.releaseNotesRetry", [undefined]]]);
  });

  it("横幅 [知道了] = `releaseNotesDismissBanner`", () => {
    const { container } = renderView({ ...CONTENT, banner: "演示横幅句子" });
    fireEvent.click(container.querySelector(".rn-banner-btn")!);

    expect(emitted).toEqual([["update.releaseNotesDismissBanner", [undefined]]]);
  });

  it("三处外链全带 `target=\"_blank\"`——裸 `<a href>` 会把整个软件导航走", () => {
    const { container } = renderView({ ...CONTENT, banner: "演示横幅句子" });
    const links = [...container.querySelectorAll("a")];

    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noreferrer");
    }

    cleanup();
    const empty = renderView({ state: "empty", listUrl: CONTENT.listUrl });
    for (const a of [...empty.container.querySelectorAll("a")]) {
      expect(a.getAttribute("target")).toBe("_blank");
    }
  });
});
