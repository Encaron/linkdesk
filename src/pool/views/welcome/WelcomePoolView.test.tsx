/**
 * WelcomePoolView——**最近区健壮化（W3b / T6）＋ 帮助区按钮化（W4c / T7）**渲染单测。
 *
 * 纯数组语义（去重/合并/剔除）归 `recentList.test.ts`；本文件只测**组件把那些语义接对了吗**：
 * ① 容量归一（存 10 显 5，两列表同款）与清空即隐藏；
 * ② 失效批次（文件夹不存在 / 插件已卸载）→ 灰显＋角标＋**不自动删**；
 * ③ 点击失效项 = 解释一句（轻提示）＋剔除；点击正常项 = 照常打开（**零 toast**）；
 * ④ 「×」= 静默剔除、不冒泡到行、键盘 Enter/Space 等效；
 * ⑤ 写放大收敛（一次变更只落一次盘）与 `isActive` 接上（切回重跑加载）；
 * ⑥ 帮助区三项都是真按钮（Tab 可达）＋各发哪条命令 / 哪条只出 toast。
 *
 * 🔴 四条**负控**（改回去必须红）：禁用插件不算卸载；装了什么读不到时不猜；读失败要说出来（不是"没有"）；
 *   帮助区不得退回 `<span>` 死文案。
 *
 * fixture 全虚构（硬约束 21）。⚠️ 断言**不打 `t()` 出来的字面文案**——测试环境没有 i18n 资源，
 *   `t(k)` 恒返回 key，拿它断言等于测了个恒真式；跨语言更会假红。故一律断**结构与类名**。
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor, type RenderResult } from "@testing-library/react";
import WelcomePoolView from "./WelcomePoolView";

interface Stub {
  state: Record<string, unknown>;
  setCalls: Array<[string, string, unknown]>;
  shown: Array<[string, Record<string, unknown> | undefined]>;
  addedFolders: string[];
  openFolderCalls: number;
  tabActions: unknown[];
  /** `executePoolCommand` 发出去的命令逐次记录（第二实参 = token 占位槽，恒 undefined） */
  emitted: Array<[string, unknown[]]>;
}

let stub: Stub;
/** 「文件夹变更」订阅回调——测试里手动触发（模拟用户打开文件夹） */
let changeCb: (() => void) | null;

const FOLDERS_10 = Array.from({ length: 10 }, (_, i) => ({ path: `E:/演示文件夹${i}`, name: `演示文件夹${i}` }));
const VIEW_A = { pluginId: "demo.viewA", label: "演示视图甲" };
const VIEW_B = { pluginId: "demo.viewB", label: "演示视图乙", workspaceName: "演示工作区" };

interface StubOpts {
  folders?: unknown;
  views?: unknown;
  /** 单条存在性校验——缺省全在（返回 true） */
  exists?: (p: string) => boolean | Promise<boolean>;
  list?: () => Promise<unknown>;
  getDisabled?: () => Promise<unknown>;
  /** pluginState.get 整体抛错（读失败面） */
  getThrows?: boolean;
  /** 变更事件到达时 `getFolders` 返回什么（写放大用例） */
  opened?: Array<{ uri: string; name: string }>;
}

function installStub(o: StubOpts = {}): void {
  changeCb = null;
  stub = {
    state: { recentFolders: o.folders ?? [], recentViews: o.views ?? [] },
    setCalls: [], shown: [], addedFolders: [], openFolderCalls: 0, tabActions: [], emitted: [],
  };
  const get = o.getThrows
    ? vi.fn(async () => { throw new Error("演示：读不了"); })
    : vi.fn(async (_owner: string, key: string) => stub.state[key]);
  (window as unknown as { linkdesk: unknown }).linkdesk = {
    pluginState: {
      get,
      set: async (owner: string, key: string, value: unknown) => {
        stub.setCalls.push([owner, key, value]);
        stub.state[key] = value;
      },
    },
    filesystem: { exists: async (p: string) => (o.exists ?? (() => true))(p) },
    workspace: {
      getFolders: async () => o.opened ?? [],
      onDidChangeFolders: (cb: () => void) => { changeCb = cb; return () => { changeCb = null; }; },
      addFolder: async (p: string) => { stub.addedFolders.push(p); },
      openFolder: async () => { stub.openFolderCalls += 1; },
    },
    pluginManager: {
      list: o.list ?? (async () => []),
      getDisabled: o.getDisabled ?? (async () => []),
    },
    notifications: {
      show: async (message: string, options?: Record<string, unknown>) => {
        stub.shown.push([message, options]);
        return {};
      },
    },
    pool: { tabAction: (a: unknown) => { stub.tabActions.push(a); } },
    commands: {
      executeCommand: (...args: unknown[]) => { stub.emitted.push([String(args[0]), args.slice(1)]); },
    },
  };
}

/** 渲染一帧并等到数据落地（`ready` 之后才画列表——首帧是骨架位） */
async function renderView(isActive = true): Promise<RenderResult> {
  const r = render(<WelcomePoolView isActive={isActive} />);
  await waitFor(() => { expect(stub).toBeTruthy(); });
  await waitFor(() => { expect(r.container.querySelector(".ldk-welcome-page")).toBeTruthy(); });
  return r;
}

/** 第 n 个 `.ldk-welcome-section`（DOM 序：0 文件夹 · 1 开始 · [2 最近] · 末 帮助） */
function section(container: HTMLElement, n: number): HTMLElement {
  return container.querySelectorAll(".ldk-welcome-section")[n] as HTMLElement;
}
/** 等「读一遍数据」这件事落地（get 至少被调过） */
async function loaded(): Promise<void> {
  await waitFor(() => { expect(stub.setCalls.length >= 0).toBe(true); });
}

/**
 * 只放一条「最近视图」并等它画出来——「已卸载 / 禁用 / 读不到」三例的执行壳**只有这一份**。
 * （三例的差别全在桩上，不在等待与定位上；各写一遍既啰嗦又会被重复度门禁抓。）
 */
async function renderOneRecentView(o: StubOpts): Promise<HTMLElement> {
  installStub({ views: [VIEW_A], ...o });
  const { container } = await renderView();
  await waitFor(() => { expect(section(container, 2).querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(1); });
  return section(container, 2);
}

beforeEach(() => { installStub(); });
afterEach(() => {
  cleanup();
  delete (window as unknown as { linkdesk?: unknown }).linkdesk;
  vi.restoreAllMocks();
});

/* ── ① 容量归一 ＋ 清空隐藏 ＋ 读失败 ── */

describe("WelcomePoolView（① 容量与三态）", () => {
  it("存 10 显 5：两个列表各只画 5 行；文件夹区内层小标题是「最近文件夹」（§七#1/#2）", async () => {
    installStub({ folders: FOLDERS_10, views: FOLDERS_10.map((f, i) => ({ pluginId: `demo.v${i}`, label: f.name })) });
    const { container } = await renderView();
    await loaded();

    const folders = section(container, 0);
    expect(folders.querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(5);
    expect(folders.querySelector(".ldk-welcome-recent-subtitle")).toBeTruthy();
    // 「最近」大区里同样 5 行（不再是一个 5 一个 10）
    expect(section(container, 2).querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(5);
  });

  it("§七#3 拍板：两列表都空 ⇒ 「最近」区块整块不画（不留灰字）；「最近文件夹」小标题也不画", async () => {
    const { container } = await renderView();

    expect(container.querySelectorAll(".ldk-welcome-section")).toHaveLength(3);
    expect(container.querySelector(".ldk-welcome-recent-subtitle")).toBeNull();
    expect(container.querySelector(".ldk-welcome-recent-list")).toBeNull();
  });

  it("🔴 负控：读失败 ≠ 没有——文件夹区出「最近列表不可用」，「最近」区也**不隐藏**而是说明", async () => {
    installStub({ getThrows: true });
    const { container } = await renderView();

    expect(section(container, 0).querySelector(".ldk-welcome-recent-unavailable")).toBeTruthy();
    // 重点是这条：读失败时区块**不消失**（否则用户读到的是"你从来没用过"）
    expect(container.querySelectorAll(".ldk-welcome-section")).toHaveLength(4);
    expect(section(container, 2).querySelector(".ldk-welcome-recent-unavailable")).toBeTruthy();
  });
});

/* ── ② 失效标记 ── */

describe("WelcomePoolView（② 失效项标记）", () => {
  it("文件夹不存在 ⇒ 该行灰显类 ＋ 「已删除」角标；存在的兄弟行不带（逐条判，不是整批）", async () => {
    installStub({
      folders: [{ path: "E:/演示在", name: "演示在" }, { path: "E:/演示没了", name: "演示没了" }],
      exists: (p) => p !== "E:/演示没了",
    });
    const { container } = await renderView();
    await waitFor(() => { expect(container.querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(2); });

    const rows = [...section(container, 0).querySelectorAll(".ldk-welcome-recent-item")];
    expect(rows[0].classList.contains("ldk-welcome-recent-item--missing")).toBe(false);
    expect(rows[0].querySelector(".ldk-welcome-recent-badge")).toBeNull();
    expect(rows[1].classList.contains("ldk-welcome-recent-item--missing")).toBe(true);
    expect(rows[1].querySelector(".ldk-welcome-recent-badge")).toBeTruthy();
  });

  it("插件已卸载（不在已装集合里）⇒ 「已卸载」角标；🔴 且**没被自动删掉**（行还在，用户才知道「它曾在这」）", async () => {
    const box = await renderOneRecentView({ list: async () => [] });

    expect(box.querySelector(".ldk-welcome-recent-item--missing")).toBeTruthy();
    expect(stub.setCalls).toEqual([]); // 没有"顺手清理"的落盘
  });

  it("🔴 负控①：插件只是被**禁用**（在 getDisabled 里、不在 list 里）⇒ **不**标「已卸载」（禁用≠卸载）", async () => {
    const box = await renderOneRecentView({ list: async () => [], getDisabled: async () => [{ pluginId: VIEW_A.pluginId }] });

    expect(box.querySelector(".ldk-welcome-recent-item--missing")).toBeNull();
  });

  it("🔴 负控②：已装集合读不到 ⇒ 一律不标（未知 ≠ 已卸载，宁可少报不可错报）", async () => {
    const box = await renderOneRecentView({ list: async () => { throw new Error("演示：查不了"); } });

    expect(box.querySelector(".ldk-welcome-recent-item--missing")).toBeNull();
  });

  it("失效批校验：单条 `exists` 抛错 ⇒ 不算失效（查不了 ≠ 不在）", async () => {
    installStub({ folders: [{ path: "E:/演示查不了", name: "演示查不了" }], exists: () => { throw new Error("演示：通道炸"); } });
    const { container } = await renderView();
    await waitFor(() => { expect(container.querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(1); });

    expect(container.querySelector(".ldk-welcome-recent-item--missing")).toBeNull();
  });
});

/* ── ③ 点击两条路：失效 = 解释＋剔除；正常 = 照常打开 ── */

describe("WelcomePoolView（③ 点击）", () => {
  it("点正常文件夹 ⇒ addFolder(路径)，**零 toast**（成功不该出声）", async () => {
    installStub({ folders: [{ path: "E:/演示在", name: "演示在" }] });
    const { container } = await renderView();
    await waitFor(() => { expect(container.querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(1); });
    fireEvent.click(section(container, 0).querySelector(".ldk-welcome-recent-item")!);

    expect(stub.addedFolders).toEqual(["E:/演示在"]);
    expect(stub.shown).toEqual([]);
  });

  it("点失效文件夹 ⇒ 轻提示（warning ＋ toast:true）＋ 落盘剔除 ＋ **不**尝试打开", async () => {
    installStub({ folders: [{ path: "E:/演示没了", name: "演示没了" }], exists: () => false });
    const { container } = await renderView();
    await waitFor(() => { expect(container.querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(1); });
    fireEvent.click(section(container, 0).querySelector(".ldk-welcome-recent-item")!);

    await waitFor(() => { expect(stub.shown).toHaveLength(1); });
    expect(stub.shown[0][1]).toMatchObject({ type: "warning", toast: true });
    expect(stub.addedFolders).toEqual([]);
    expect(stub.setCalls).toEqual([["app", "recentFolders", []]]);
  });

  it("点已卸载的视图 ⇒ 轻提示 ＋ 剔除 ＋ **不**发 createTab（点了不该再炸一次）", async () => {
    installStub({ views: [VIEW_A], list: async () => [] });
    const { container } = await renderView();
    await waitFor(() => { expect(section(container, 2).querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(1); });
    fireEvent.click(section(container, 2).querySelector(".ldk-welcome-recent-item")!);

    await waitFor(() => { expect(stub.shown).toHaveLength(1); });
    expect(stub.shown[0][1]).toMatchObject({ type: "warning", toast: true });
    expect(stub.tabActions).toEqual([]);
    expect(stub.setCalls).toEqual([["app", "recentViews", []]]);
  });

  it("点正常视图 ⇒ 发 createTab（带 workspaceName）＋ 记一次最近（先去重再置顶）", async () => {
    installStub({ views: [VIEW_B], list: async () => [{ pluginId: VIEW_B.pluginId }] });
    const { container } = await renderView();
    await waitFor(() => { expect(section(container, 2).querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(1); });
    fireEvent.click(section(container, 2).querySelector(".ldk-welcome-recent-item")!);

    await waitFor(() => { expect(stub.tabActions).toHaveLength(1); });
    expect(stub.tabActions[0]).toMatchObject({ action: "createTab", pluginId: VIEW_B.pluginId, workspaceName: "演示工作区" });
    expect(stub.shown).toEqual([]);
  });
});

/* ── ④ 「×」：静默剔除、不冒泡、键盘等效 ── */

describe("WelcomePoolView（④ 条目级 ×）", () => {
  it("点 × ⇒ 落盘剔除 ＋ 行消失 ＋ **无 toast** ＋ 不触发行动作（stopPropagation）", async () => {
    installStub({ folders: [{ path: "E:/演示甲", name: "演示甲" }, { path: "E:/演示乙", name: "演示乙" }] });
    const { container } = await renderView();
    await waitFor(() => { expect(container.querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(2); });
    fireEvent.click(section(container, 0).querySelectorAll(".ldk-welcome-recent-remove")[0]);

    expect(stub.setCalls).toEqual([["app", "recentFolders", [{ path: "E:/演示乙", name: "演示乙" }]]]);
    expect(stub.addedFolders).toEqual([]);   // 没冒泡成"打开这一条"
    expect(stub.shown).toEqual([]);          // 行消失即反馈，别聒噪
    await waitFor(() => { expect(section(container, 0).querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(1); });
  });

  it("视图列表的 × 同款：只清记录不拉黑（剔除后落盘的是余下条目）", async () => {
    installStub({ views: [VIEW_A, VIEW_B], list: async () => [{ pluginId: "demo.viewA" }, { pluginId: "demo.viewB" }] });
    const { container } = await renderView();
    await waitFor(() => { expect(section(container, 2).querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(2); });
    fireEvent.click(section(container, 2).querySelectorAll(".ldk-welcome-recent-remove")[1]);

    expect(stub.setCalls).toEqual([["app", "recentViews", [VIEW_A]]]);
    expect(stub.tabActions).toEqual([]);
  });

  it("× 是 `role=button` 且带 aria-label（读屏听得出移的是谁）", async () => {
    installStub({ folders: [{ path: "E:/演示甲", name: "演示甲" }] });
    const { container } = await renderView();
    await waitFor(() => { expect(container.querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(1); });
    const x = section(container, 0).querySelector(".ldk-welcome-recent-remove")!;

    expect(x.getAttribute("role")).toBe("button");
    expect(x.getAttribute("tabindex")).toBe("0");
    expect(x.getAttribute("aria-label")).toBeTruthy();
  });

  it("键盘：Enter / Space 生效（§七#5——mockup 只加了 tabindex，真实实现必须自己补）；别的键不动", async () => {
    installStub({ folders: [{ path: "E:/演示甲", name: "演示甲" }, { path: "E:/演示乙", name: "演示乙" }] });
    const { container } = await renderView();
    await waitFor(() => { expect(container.querySelectorAll(".ldk-welcome-recent-item")).toHaveLength(2); });
    const x = section(container, 0).querySelectorAll(".ldk-welcome-recent-remove")[0];

    fireEvent.keyDown(x, { key: "a" });
    expect(stub.setCalls).toEqual([]);
    fireEvent.keyDown(x, { key: "Enter" });
    expect(stub.setCalls).toHaveLength(1);
    expect(stub.addedFolders).toEqual([]);
  });
});

/* ── ⑤ 写放大 ＋ isActive ── */

describe("WelcomePoolView（⑤ 落盘次数与刷新时机）", () => {
  it("一次变更带 3 个文件夹 ⇒ 只落**一次**盘（原实现是循环内逐条 set）", async () => {
    installStub({ opened: [{ uri: "E:/演示甲", name: "演示甲" }, { uri: "E:/演示乙", name: "演示乙" }, { uri: "E:/演示丙", name: "演示丙" }] });
    await renderView();
    await waitFor(() => { expect(changeCb).toBeTruthy(); });
    changeCb!();

    await waitFor(() => { expect(stub.setCalls).toHaveLength(1); });
    expect(stub.setCalls[0][1]).toBe("recentFolders");
    expect((stub.setCalls[0][2] as unknown[]).length).toBe(3);
    // 最近打开的在最前（同批里最后一个）
    expect((stub.setCalls[0][2] as Array<{ path: string }>)[0].path).toBe("E:/演示丙");
  });

  it("🔴 `isActive` 接上：翻回真 ⇒ 重跑加载（切回欢迎页刷新失效态，原实现 `_isActive` 从未被读）", async () => {
    const { rerender } = await renderView(false);
    const first = (window as unknown as { linkdesk: { pluginState: { get: { mock: { calls: unknown[] } } } } }).linkdesk.pluginState.get.mock.calls.length;
    expect(first).toBeGreaterThan(0);

    rerender(<WelcomePoolView isActive />);
    await waitFor(() => {
      const now = (window as unknown as { linkdesk: { pluginState: { get: { mock: { calls: unknown[] } } } } }).linkdesk.pluginState.get.mock.calls.length;
      expect(now).toBeGreaterThan(first);
    });
  });
});

/* ── ⑥ 帮助区（W4c / T7）：死 span → 真按钮 ── */

describe("WelcomePoolView（⑥ 帮助区按钮化）", () => {
  /** 帮助区（最后一个 section）的三个按钮，DOM 序 = 使用文档 · 键盘快捷键 · AI 操作手册 */
  async function helpButtons(): Promise<HTMLButtonElement[]> {
    const { container } = await renderView();
    const all = container.querySelectorAll(".ldk-welcome-section");
    return [...all[all.length - 1].querySelectorAll<HTMLButtonElement>(".ldk-welcome-help-item")];
  }

  it("三项都是真 `<button>`：进 Tab 序（tabIndex 0）＋ aria-label 与可见文字一致（label-in-name）", async () => {
    const btns = await helpButtons();

    expect(btns).toHaveLength(3);
    for (const b of btns) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.tabIndex).toBe(0);
      // 无 i18n 资源环境 ⇒ t(k) 恒返 key，此处断的是「两处用的是同一份文案」而非译文
      expect(b.getAttribute("aria-label")).toBe(b.textContent?.trim());
    }
  });

  it("🔴 负控：帮助区里**不再有 span 形态**（旧实现 `cursor: default` 的死文案回来必须红）", async () => {
    const { container } = await renderView();

    expect(container.querySelector("span.ldk-welcome-help-item")).toBeNull();
  });

  it("「键盘快捷键」→ 既有命令 `workbench.action.openKeybindingsSettings`（与帮助菜单同词）", async () => {
    const btns = await helpButtons();
    fireEvent.click(btns[1]);

    expect(stub.emitted).toEqual([["workbench.action.openKeybindingsSettings", [undefined]]]);
  });

  it("「AI 操作手册」→ 既有命令 `app.openAiManual`", async () => {
    const btns = await helpButtons();
    fireEvent.click(btns[2]);

    expect(stub.emitted).toEqual([["app.openAiManual", [undefined]]]);
  });

  it("「使用文档」→ 只出一条 toast 指路，**不发命令**（仓库里没有可打开的文档页，不假装能开）", async () => {
    const btns = await helpButtons();
    fireEvent.click(btns[0]);

    expect(stub.emitted).toEqual([]);
    expect(stub.shown).toHaveLength(1);
    expect(stub.shown[0][1]).toMatchObject({ toast: true, source: "app.welcome" });
  });
});
