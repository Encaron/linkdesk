/**
 * ManagerView 契约单测——**数据入 / 事件出**（判据 A 的落位承诺，机械腿 R6 之外的人读证据）。
 *
 * 钉的是四条**坏了不报错**的形状：
 *   ① 🔴 命令 id 归**消费方**：三个 `*GearItems` 工厂缺省 ⇒ 全页零齿轮。共享层一旦自己认命令，
 *      第三方渲染方（换壳/换插件）就跟着官方命令表漂移；
 *   ② 写入面唯一：行内下拉是唯一出口，选中 ⇒ `onPick(exts, pluginId, label)`；⛔ 共享件不写配置、
 *      不调命令（「自动」回 `null`，不是空串——字面量与宿主写入面约定一致）；
 *   ③ C3 文案（「多候选类型」/「按插件浏览」）与**四处空态**逐字在：区级两句 ＋ 搜索无匹配一句
 *      ＋ 未就绪两句（加载中 / 失败）；
 *   ④ D2 定案：卡体 0 行 ⇒ 一行 muted「没有匹配的类型」，**零按钮**（⛔ 不带清空入口）。
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { MenuItemDescriptor } from "@linkdesk/contracts";
import "../../../i18n";
import ManagerView from "./ManagerView";
import { buildManagerModel } from "./deriveModel";
import type {
  BuildInput,
  DeclaredExtension,
  DeclaredPlugin,
  ExtRowModel,
  HandlerSnapshot,
  ManagerModel,
} from "./types";

afterEach(() => cleanup());

beforeEach(() => {
  // OverlayPortal 用 window/document——清 body 残留 portal
  document.body.innerHTML = "";
  // jsdom 没有布局也没有 scrollIntoView——SelectBox 面板的「滚动到高亮项」effect 会炸
  // （同 FontFamilySelect.test 的既有处置）
  Element.prototype.scrollIntoView = vi.fn();
});

/* ── 夹具（假名，⛔ 不用真插件名/真文案） ── */

const decl = (ext: string): DeclaredExtension => ({ ext, raw: ext });
const plugin = (pluginId: string, exts: DeclaredExtension[]): DeclaredPlugin => ({
  pluginId,
  name: pluginId.toUpperCase(),
  exts,
});
const handlers = (...ids: string[]): HandlerSnapshot[] =>
  ids.map((id, i) => ({ pluginId: id, title: id.toUpperCase(), typeLabel: `TYPE:${id}`, isCurrent: i === 0 }));

/** 两卡同签名世界：竞争区一格（docx/xlsx）＋ 两张卡（各 2 行） */
const WORLD: BuildInput = {
  plugins: [
    plugin("plug-a", [decl("docx"), decl("xlsx")]),
    plugin("plug-b", [decl("docx"), decl("xlsx")]),
  ],
  handlersByExt: { docx: handlers("plug-a", "plug-b"), xlsx: handlers("plug-a", "plug-b") },
  overrideTable: {},
};

const items: MenuItemDescriptor[] = [{ command: "demo.openWith", label: "打开方式…" }];

const mkWsModel = (over: Partial<BuildInput> = {}) => buildManagerModel({ ...WORLD, ...over });

/** 手搭模型：一张卡、零行（＝卡内过滤 0 命中后的形态，D2 定案） */
const zeroRowModel = (): ManagerModel => ({
  contested: [],
  cards: [
    {
      pluginId: "plug-a",
      name: "ALPHA",
      rows: [] as ExtRowModel[],
      declaredCount: 3,
      contestedCount: 0,
      holdCount: 0,
      overrideExts: [],
      matchedSearch: true,
    },
  ],
  navCount: 1,
  contestedExtCount: 0,
});

const gears = () => document.querySelectorAll(".ldk-famgr-gear");
const cardToggle = (i = 0) => document.querySelectorAll<HTMLElement>(".ldk-plugin-card-toggle")[i]!;
const contestedSelect = () =>
  document.querySelector<HTMLElement>(".ldk-famgr-contested .ldk-selectbox-trigger")!;
const emptyLines = () => [...document.querySelectorAll<HTMLElement>(".ldk-famgr-empty")].map((e) => e.textContent);

function pickOption(text: string) {
  const li = [...document.querySelectorAll<HTMLElement>(".ldk-selectbox-item")].find(
    (el) => el.textContent?.trim() === text,
  );
  if (!li) throw new Error(`下拉里没有「${text}」项`);
  fireEvent.click(li);
}

/* ── ① 命令 id 归消费方 ── */

describe("ManagerView——命令 id 归消费方（数据入 / 事件出）", () => {
  it("三个 `*GearItems` 工厂缺省 ⇒ 全页零齿轮（共享件不认识任何命令 id）", () => {
    render(<ManagerView model={mkWsModel()} onPick={vi.fn()} />);
    expect(gears()).toHaveLength(0);
    fireEvent.click(cardToggle()); // 展开也不该长出齿轮
    expect(gears()).toHaveLength(0);
  });

  it("工厂给了 ⇒ 竞争行一枚；展开的那张卡按**行**各一枚（工厂逐行收件）", () => {
    const rowFactory = vi.fn((_row: ExtRowModel) => items);
    render(
      <ManagerView
        model={mkWsModel()}
        onPick={vi.fn()}
        contestedGearItems={() => items}
        cardRowGearItems={rowFactory}
      />,
    );
    expect(gears()).toHaveLength(1); // 竞争区一格
    fireEvent.click(cardToggle());
    expect(gears()).toHaveLength(3); // ＋展开卡的 2 行（另 1 张卡仍折叠）
    // 逐行收件：工厂收到的是**行模型**，且收件集合恰是这张卡的声明序两行（渲染次数无关）
    expect(new Set(rowFactory.mock.calls.map((c) => c[0].ext))).toEqual(new Set(["docx", "xlsx"]));
    expect(rowFactory.mock.calls[0]![0]!.ext).toBe("docx"); // 声明序透传（C5「按默认排序」真源）
  });

  it("工厂回空数组 ⇒ 该行不出齿轮（无动作可给时菜单项没有置灰态）", () => {
    render(<ManagerView model={mkWsModel()} onPick={vi.fn()} contestedGearItems={() => []} />);
    expect(gears()).toHaveLength(0);
  });
});

/* ── ② 写入面唯一 ── */

describe("ManagerView——写入面唯一（`onPick`）", () => {
  it("竞争行下拉选中候选 ⇒ 整格 `exts` ＋ pluginId ＋ 标签", () => {
    const onPick = vi.fn();
    render(<ManagerView model={mkWsModel()} onPick={onPick} />);
    fireEvent.click(contestedSelect());
    pickOption("PLUG-B");
    expect(onPick).toHaveBeenCalledWith(["docx", "xlsx"], "plug-b", "PLUG-B");
  });

  it("选「自动」⇒ pluginId = null（⛔ 不是空串——与宿主写入面约定同形）", () => {
    const onPick = vi.fn();
    render(<ManagerView model={mkWsModel({ overrideTable: { ".docx": "plug-b", ".xlsx": "plug-b" } })} onPick={onPick} />);
    fireEvent.click(contestedSelect());
    pickOption("自动");
    expect(onPick).toHaveBeenCalledWith(["docx", "xlsx"], null, undefined);
  });

  it("卡体行下拉只报**本行**一个类（粒度不放大）", () => {
    const onPick = vi.fn();
    render(<ManagerView model={mkWsModel()} onPick={onPick} />);
    fireEvent.click(cardToggle());
    const rowSelect = document.querySelectorAll<HTMLElement>(".ldk-famgr-row .ldk-selectbox-trigger")[0]!;
    fireEvent.click(rowSelect);
    pickOption("自动");
    expect(onPick).toHaveBeenCalledWith(["docx"], null, undefined);
  });
});

/* ── ③ C3 文案与空态 ── */

describe("ManagerView——C3 文案与空态", () => {
  it("两区标题＝C3 定案词（多候选类型 / 按插件浏览）", () => {
    render(<ManagerView model={mkWsModel()} onPick={vi.fn()} />);
    const titles = [...document.querySelectorAll(".ldk-famgr-subsection-title")].map((e) => e.textContent);
    expect(titles).toEqual(["多候选类型", "按插件浏览"]);
  });

  it("区级空态各一句（无竞争类 / 无声明插件）", () => {
    render(<ManagerView model={buildManagerModel({ plugins: [], handlersByExt: {} })} onPick={vi.fn()} />);
    expect(emptyLines()).toEqual(["（当前没有多候选的类型）", "（没有声明了文件类型的插件）"]);
  });

  it("搜索无匹配 ⇒ 独立一句「没有匹配的类型或插件」（⛔ 不说「没有竞争类型」——那是误导：明明有）", () => {
    render(<ManagerView model={mkWsModel({ search: "zzz" })} search="zzz" onPick={vi.fn()} />);
    expect(emptyLines()).toEqual(["没有匹配的类型或插件"]);
  });

  it("搜索命中 ⇒ 命中卡自动展开（清空不收回：展开态归视图）", () => {
    render(<ManagerView model={mkWsModel({ search: "plug-a" })} search="plug-a" onPick={vi.fn()} />);
    expect(document.querySelector(".ldk-plugin-card-body")).toBeTruthy();
  });

  it("未就绪：加载中只出一行；失败带错误原文（页面本就残缺，⛔ 不画半张空壳）", () => {
    const { unmount } = render(<ManagerView model={zeroRowModel()} onPick={vi.fn()} loading ready={false} />);
    expect(emptyLines()).toEqual(["加载中…"]);
    unmount();
    render(<ManagerView model={zeroRowModel()} onPick={vi.fn()} ready={false} error="boom" />);
    expect(emptyLines()).toEqual(["加载默认打开方式失败：boom"]);
  });
});

/* ── ④ D2 定案 ── */

describe("ManagerView——卡体 0 命中（D2 定案）", () => {
  it("0 行 ⇒ 一行 muted「没有匹配的类型」，**零按钮**（⛔ 不带清空入口）", () => {
    render(<ManagerView model={zeroRowModel()} onPick={vi.fn()} />);
    fireEvent.click(cardToggle());
    const body = document.querySelector<HTMLElement>(".ldk-plugin-card-body")!;
    expect(body.querySelectorAll(".ldk-famgr-empty")).toHaveLength(1);
    expect(body.textContent?.trim()).toBe("没有匹配的类型");
    expect(body.querySelectorAll("button")).toHaveLength(0); // ⛔ 无清空入口
    expect(body.querySelectorAll(".ldk-famgr-row")).toHaveLength(0);
  });
});
