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
 *   ⑤ C5 卡内工具条：阈值边界（声明 8 类出 / 7 类不出）、过滤分档与理由标注、折叠复位、
 *      防抖窗口内折叠不写回过期词、以及「改怎么看」绝不触发写入面（E1/E2/E7/E9/E10/E11/E17）。
 *   ⑥ 英文态显示名收口：模型给的显示名（插件声明原文）在**英文环境**下五处都＝译名——这是唯一
 *      能覆盖「值是运行时变量、本该翻却没人翻」这一格的红灯（两道字面量门＋键覆盖门原理上都照不到）。
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { MenuItemDescriptor } from "@linkdesk/contracts";
import i18n from "../../../i18n";
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

/* ── ⑤ C5 卡内工具条（阈值 / 过滤分档 / 折叠复位 / 防抖弃值） ──
 * 钉的是**坏了不报错**的几条：阈值边界（8 出 7 不出）、不过滤不报数、分档与理由标注、
 * 折叠复位、防抖窗口内折叠不得把过期词写回、以及「改怎么看」绝不触发写入面。 */

/** 八类声明——**声明序刻意 ≠ 字典序**（否则「按默认排序」换序这条测不出来） */
const EIGHT: DeclaredExtension[] = [
  { ext: "py", raw: "py", typeLabel: "Python" },
  { ext: "ts", raw: "ts", typeLabel: "TypeScript" },
  { ext: "tsx", raw: "tsx", typeLabel: "TypeScript React" },
  { ext: "js", raw: "js", typeLabel: "JavaScript" },
  { ext: "jsx", raw: "jsx", typeLabel: "JavaScript React" },
  { ext: "md", raw: "md", typeLabel: "Markdown" },
  { ext: "json", raw: "json", typeLabel: "JSON" },
  { ext: "css", raw: "css", typeLabel: "CSS" },
];
const DECLARED_ORDER = ["py", "ts", "tsx", "js", "jsx", "md", "json", "css"];
const ALPHA_ORDER = ["css", "js", "json", "jsx", "md", "py", "ts", "tsx"];

/** 一张卡：声明前 n 类（n=8 出工具条 / n=7 不出——E1 的边界夹具） */
const cardModel = (n: number) =>
  buildManagerModel({ plugins: [plugin("plug-a", EIGHT.slice(0, n))], handlersByExt: {} });

const toolbarEl = () => document.querySelector<HTMLElement>(".ldk-plugin-card-toolbar");
const filterBox = () =>
  document.querySelector<HTMLInputElement>(".ldk-plugin-card-toolbar input.ldk-inline-input");
const hitLine = () => document.querySelector<HTMLElement>(".ldk-famgr-hit")?.textContent ?? "";
const sortTrigger = () =>
  document.querySelector<HTMLElement>(".ldk-plugin-card-toolbar .ldk-selectbox-trigger")!;
/** 卡体内行的扩展名（去掉前导点）＋「仅显示名命中」那些行的理由标注 */
const bodyExts = () =>
  [...document.querySelectorAll<HTMLElement>(".ldk-plugin-card-body .ldk-famgr-ext")].map((e) =>
    e.textContent!.replace(/^\./, ""),
  );
const whyTexts = () =>
  [...document.querySelectorAll<HTMLElement>(".ldk-plugin-card-body .ldk-famgr-why")].map((e) => e.textContent);

/** 打字 → 过防抖窗口（hook 150ms）；`act` 包住定时器触发那一下，免 React 的 act 噪声告警 */
async function typeFilter(text: string) {
  fireEvent.change(filterBox()!, { target: { value: text } });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 220));
  });
}

describe("ManagerView——C5 卡内工具条", () => {
  it("E1 阈值：声明 8 类出工具条；7 类不出（阈值＝组装方常量，⛔ 不进 PluginCard）", () => {
    const { unmount } = render(<ManagerView model={cardModel(8)} onPick={vi.fn()} />);
    fireEvent.click(cardToggle());
    expect(toolbarEl()).toBeTruthy();
    expect(filterBox()!.placeholder).toBe("过滤 8 类…");
    unmount();

    render(<ManagerView model={cardModel(7)} onPick={vi.fn()} />);
    fireEvent.click(cardToggle());
    expect(document.querySelector(".ldk-plugin-card-body")).toBeTruthy(); // 展开了
    expect(toolbarEl()).toBeNull(); // 就是不出工具条
  });

  it("E17 折叠 ⇒ 槽不渲染（不占位）；再展开 ⇒ 槽回来", () => {
    render(<ManagerView model={cardModel(8)} onPick={vi.fn()} />);
    fireEvent.click(cardToggle()); // 展开
    expect(toolbarEl()).toBeTruthy();
    fireEvent.click(cardToggle()); // 折叠
    expect(toolbarEl()).toBeNull();
    fireEvent.click(cardToggle()); // 再展开
    expect(toolbarEl()).toBeTruthy();
  });

  it("E2 不过滤不报命中数；过滤后报「命中 N / 总数」（数字与行数同源）", async () => {
    render(<ManagerView model={cardModel(8)} onPick={vi.fn()} />);
    fireEvent.click(cardToggle());
    expect(hitLine()).toBe(""); // ⛔ 不过滤不报数

    await typeFilter("py");
    expect(hitLine()).toBe("命中 1 / 8");
    expect(bodyExts()).toEqual(["py"]);
  });

  it("E7 分档：扩展名命中在上、仅显示名命中的沉底并标「类型名 X」——两档各自守选定行序", async () => {
    render(<ManagerView model={cardModel(8)} onPick={vi.fn()} />);
    fireEvent.click(cardToggle());

    // 输 n：扩展名命中只有 .json；仅**显示名**命中的是 .md(Markdown) 与 .py(Python)
    await typeFilter("n");
    expect(bodyExts()).toEqual(["json", "md", "py"]); // 默认 alpha：两档各自字母序
    expect(whyTexts()).toEqual(["类型名 Markdown", "类型名 Python"]); // 只有沉底两行带理由
    expect(hitLine()).toBe("命中 3 / 8");

    // 切「按默认排序」⇒ 换序不换集，分档保持（档内改用声明序：py 在 md 之前）
    fireEvent.click(sortTrigger());
    pickOption("按默认排序");
    expect(bodyExts()).toEqual(["json", "py", "md"]);
    expect(hitLine()).toBe("命中 3 / 8");
  });

  it("E9 排序切换：按默认排序＝插件声明原始次序（声明序是唯一真源，聚合层不重排）", () => {
    render(<ManagerView model={cardModel(8)} onPick={vi.fn()} />);
    fireEvent.click(cardToggle());
    expect(bodyExts()).toEqual(ALPHA_ORDER); // 默认按字母序

    fireEvent.click(sortTrigger());
    pickOption("按默认排序");
    expect(bodyExts()).toEqual(DECLARED_ORDER); // 原样透传声明序
  });

  it("E9 `Esc` ⇒ 清空过滤：输入框真空、行回全量、命中数消失", async () => {
    render(<ManagerView model={cardModel(8)} onPick={vi.fn()} />);
    fireEvent.click(cardToggle());
    await typeFilter("py");
    expect(bodyExts()).toEqual(["py"]);

    fireEvent.keyDown(filterBox()!, { key: "Escape" });
    expect(filterBox()!.value).toBe(""); // 输入框真清空（受控回灌）
    expect(bodyExts()).toEqual(ALPHA_ORDER);
    expect(hitLine()).toBe("");
  });

  it("E9 折叠＝卡内视图态整条复位：过滤清空 ＋ 行序回落默认（再展开为全量）", async () => {
    render(<ManagerView model={cardModel(8)} onPick={vi.fn()} />);
    fireEvent.click(cardToggle());
    await typeFilter("py");
    fireEvent.click(sortTrigger());
    pickOption("按默认排序");

    fireEvent.click(cardToggle()); // 折叠
    fireEvent.click(cardToggle()); // 再展开
    expect(filterBox()!.value).toBe("");
    expect(bodyExts()).toEqual(ALPHA_ORDER); // 排序也回落 alpha（E9：不止清过滤）
    expect(hitLine()).toBe("");
  });

  it("E11 防抖窗口内折叠 ⇒ 过期词不得写回（再展开仍是全量、无命中数）", async () => {
    render(<ManagerView model={cardModel(8)} onPick={vi.fn()} />);
    fireEvent.click(cardToggle());

    fireEvent.change(filterBox()!, { target: { value: "py" } }); // 150ms 窗口内…
    fireEvent.click(cardToggle()); // …立刻折叠（槽卸载，定时器随之清掉）
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250)); // 等过原定防抖点
    });
    fireEvent.click(cardToggle()); // 再展开

    expect(bodyExts()).toEqual(ALPHA_ORDER);
    expect(hitLine()).toBe("");
  });

  it("E10 视图本地：改怎么看（过滤/排序）⛔ 一个字节也不写回宿主（onPick 不被触发）", async () => {
    const onPick = vi.fn();
    render(<ManagerView model={cardModel(8)} onPick={onPick} />);
    fireEvent.click(cardToggle());
    await typeFilter("py");
    fireEvent.click(sortTrigger());
    pickOption("按默认排序");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("过滤框挂无障碍名（无可见 label 的输入必须有 aria-label）", () => {
    render(<ManagerView model={cardModel(8)} onPick={vi.fn()} />);
    fireEvent.click(cardToggle());
    expect(filterBox()!.getAttribute("aria-label")).toBe(
      "过滤文件类型（先扩展名、后类型名；仅类型名命中的行有标注）",
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════════
 * ⑥ 英文态显示名收口（轴二的主验收）
 *
 * 轴二的风险形状是「**值是运行时变量、本该翻却没人翻**」——两道字面量门（只收 `t()` 里的
 * 中文）与 `audit-i18n --strict`（只看 `t()` 用到的键）**原理上都照不到**它。唯一能红的
 * 断言＝**灌一份中英词典、切英文环境、看那几处文字到底出什么**。
 *
 * 夹具的显示名一律**虚构**（`演示甲`/`锈语言` 一类），词典也是本测试自己 `addResourceBundle`
 * 塞进去的（插件自带词典并入 `translation` 命名空间的等价物）——⛔ 不依赖壳里任何真实词条，
 * 于是「把 `t()` 从任一处删掉」必然让本块变红。
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

/** 虚构的插件自带词典（键＝插件作者写的中文原文，值＝译名） */
const EN_DICT = { 演示甲: "Demo A", 演示乙: "Demo B", 锈语言: "Rust" };

/** 两插件争同一类：`demo-a` 当前生效 ⇒ `demo-a` 那行 `auto`、`demo-b` 那行 `lost`（带「默认：X」） */
const EN_WORLD: BuildInput = {
  plugins: [
    { pluginId: "demo-a", name: "演示甲", exts: [{ ext: "rs", raw: "rs", typeLabel: "锈语言" }] },
    { pluginId: "demo-b", name: "演示乙", exts: [{ ext: "rs", raw: "rs" }] },
  ],
  handlersByExt: {
    rs: [
      { pluginId: "demo-a", title: "演示甲", typeLabel: "锈语言", isCurrent: true },
      { pluginId: "demo-b", title: "演示乙", typeLabel: "锈语言", isCurrent: false },
    ],
  },
  overrideTable: {},
};

/** 八类声明（够出卡内工具条）——首类挂**中文**类型名，其余沿用 EIGHT 的英文类型名 */
const EN_EIGHT: BuildInput = {
  plugins: [
    {
      pluginId: "demo-a",
      name: "演示甲",
      exts: [{ ext: "rs", raw: "rs", typeLabel: "锈语言" }, ...EIGHT.slice(1)],
    },
  ],
  handlersByExt: {},
};

const enRender = (input: BuildInput) => render(<ManagerView model={buildManagerModel(input)} onPick={vi.fn()} />);

const cardTitles = () =>
  [...document.querySelectorAll<HTMLElement>(".ldk-plugin-card-title")].map((e) => e.textContent);

const optionTexts = () =>
  [...document.querySelectorAll<HTMLElement>(".ldk-selectbox-item")].map((e) => e.textContent!.trim());

describe("ManagerView——英文态显示名收口（i18n 调用点）", () => {
  beforeEach(async () => {
    i18n.addResourceBundle("en", "translation", EN_DICT, true, true);
    await i18n.changeLanguage("en");
  });
  afterEach(async () => {
    cleanup(); // 先卸载再切语言——免得已卸载的组件被 languageChanged 唤起重渲（act 噪声）
    await i18n.changeLanguage("zh");
  });

  it("卡头 ＋ 竞争区「当前单击打开：X」＝ 译名（不是插件声明的中文原文）", () => {
    enRender(EN_WORLD);
    expect(cardTitles()).toEqual(["Demo A", "Demo B"]);
    expect(document.querySelector<HTMLElement>(".ldk-famgr-desc b")!.textContent).toBe("Demo A");
  });

  it("竞争区下拉项 ＝ 译名（整格那处：显示名与写入面 label 同源）", () => {
    enRender(EN_WORLD);
    fireEvent.click(contestedSelect());
    const texts = optionTexts();
    expect(texts).toContain("Demo A");
    expect(texts).toContain("Demo B");
    expect(texts.join("|")).not.toContain("演示"); // ⛔ 一个中文原文都不许漏进下拉
  });

  it("卡体行下拉项 ＋ 「候选 · 默认：X」胶囊内插值 ＝ 译名", () => {
    enRender(EN_WORLD);
    fireEvent.click(cardToggle(1)); // 第二张卡（demo-b）——它的 rs 行是 lost 态
    const pill = document.querySelector<HTMLElement>(".ldk-plugin-card-body .ldk-famgr-pill")!;
    expect(pill.textContent).toContain("Demo A"); // 插值里那个 X 也过了 t()
    expect(pill.textContent).not.toContain("演示甲");

    fireEvent.click(document.querySelector<HTMLElement>(".ldk-plugin-card-body .ldk-selectbox-trigger")!);
    const texts = optionTexts();
    expect(texts).toContain("Demo A");
    expect(texts).toContain("Demo B");
    expect(texts.join("|").split("演示")[0]).toBe(texts.join("|")); // 同位断言：下拉里没有「演示」
  });

  it("「仅类型名命中」的理由标注 ＝ 译名（类型名也是插件声明的原文）", async () => {
    enRender(EN_EIGHT);
    fireEvent.click(cardToggle()); // 声明 8 类 ⇒ 得先展开才摆工具条（E1 阈值）
    await typeFilter("锈");
    expect(bodyExts()).toEqual(["rs"]);
    expect(document.querySelector<HTMLElement>(".ldk-famgr-why b")!.textContent).toBe("Rust");
    expect(whyTexts()[0]).not.toContain("锈语言");
  });

  it("兜底值是 pluginId（机器名）⇒ 原样显示（词典没有该键，⛔ 不是漏译）", () => {
    enRender({
      plugins: [{ pluginId: "demo-c", name: "demo-c", exts: [decl("rs")] }],
      handlersByExt: {
        rs: [{ pluginId: "demo-c", title: "demo-c", typeLabel: "demo-c", isCurrent: true }],
      },
      overrideTable: {},
    });
    expect(cardTitles()).toEqual(["demo-c"]);
  });

  it("词典里没有这条显示名 ⇒ 原样中文（`t()` 无键回落原文——预期行为，⛔ 不是 bug）", () => {
    enRender({
      plugins: [{ pluginId: "demo-d", name: "未收录名", exts: [decl("rs")] }],
      handlersByExt: {
        rs: [{ pluginId: "demo-d", title: "未收录名", typeLabel: "误语言", isCurrent: true }],
      },
      overrideTable: {},
    });
    expect(cardTitles()).toEqual(["未收录名"]);
  });
});
