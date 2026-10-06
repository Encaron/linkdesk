/**
 * deriveModel 单测——「默认打开方式」管理器的**纯模型**。
 *
 * 搬件说明（2026-10-06）：原住设置插件仓 `__tests__/views/file-associations-manager/model.test.ts`，
 * 随「默认打开方式管理器共享化」转正迁入壳；**断言逐条照抄**（⛔ 一字不松——它们是搬件前的验收口径，
 * 松一条就等于搬件时悄悄改了行为）。对账读数：原 29 例 / 102 条 `expect` ⇒ 本件 30 例 / 103 条
 * （＋1 例＝C5「声明序透传」真源，⛔ 未删未改任何既有断言）；两处**用例名**去掉了指向案卷图的坐标
 * （「09 图 summaryOf」→「卡头摘要」、「08 图 renderNav 口径」→ 去尾），仅标题改动、断言未动。
 *
 * 落位依据＝判据 A / 硬约束 28：本件与 `deriveModel` 同住共享层 ⇒ 官方设置插件薄壳与第三方渲染器
 * 共用**同一份**聚合口径，六态/聚格/失效判定没有第二份实现可漂移（R4）。
 *
 * ## 为什么这几条判据值得测
 *
 * 全是**错了不报错、只在界面上给错答案**的窄事实：
 *   ① 归一（声明 `MX` → 存储键 `.mx`，E10/E34）：归一错 ⇒ 覆盖表**读写不是同一个键**，
 *      用户设了默认、重启后却没生效（静默）；
 *   ② 聚合法则（E32「候选集合签名 × 当前生效值」）：并错 ⇒ 下拉「整格生效」波及不该动的类型；
 *      拆错 ⇒ 用户刚设的那一类被并回整组；
 *   ③ 六态徽标（C5 定案）：`lock`（用户锁定）与 `sole`（唯一处理者）**外观与含义都不同**——
 *      混了就是「我没锁过，界面说我锁了」；
 *   ④ 失效覆盖（E6）：键指向已卸载插件时**必须**回「自动」且挂红点；漏判 ⇒ 下拉显示一个
 *      根本不在候选里的值，用户以为还生效着；
 *   ⑤ 搜索/计数：`navCount` 错 ⇒ 左侧导航徽标报的数字与点进去看到的不一致。
 *
 * ## 测试面
 *
 * 纯逻辑——零 React、零宿主桥、零 i18n、零核心别名，不碰任何桩。本件同时是
 * **R6（共享件零壳依赖）的人读证据**：本目录对宿主桥与壳内别名**零引用**——人工读数与机械腿
 * （`check-shared-components-zero-shell-deps`）的对账刻度都写在 05 交接表的 AI-1 行里。
 * 夹具一律假名（`plug-a`…），⛔ 不用真插件名、不用真文案。
 *
 * ⚠️ 唯一例外：C5 那节的行序/过滤样本**必须是真样本**（编辑器 45 类真实声明序 ＋ 真实类型名）
 * ——E27/E5 的判据本身就是「与真数据一致」，假名夹具在这里证明不了任何东西。数据抄自
 * 插件仓 `official/editor/plugin.json` 的 `contributes.fileAssociations`（45 项，逐项 `displayName`）。
 */

import { describe, expect, it } from "vitest";
import {
  EXT_LABEL_MAX,
  buildManagerModel,
  extLabelHead,
  extractDeclaredExtensions,
  filterRows,
  hitKindOf,
  normalizeExt,
  normalizeExtList,
  orderRows,
  overrideKeyOf,
  readOverride,
} from "./deriveModel";
import type { BuildInput, DeclaredExtension, DeclaredPlugin, ExtRowModel, HandlerSnapshot } from "./types";

/* ── 夹具 ── */

const decl = (ext: string, raw: string = ext): DeclaredExtension => ({ ext, raw });

const plugin = (
  pluginId: string,
  exts: DeclaredExtension[],
  name = pluginId.toUpperCase(),
): DeclaredPlugin => ({ pluginId, name, exts });

/* 夹具 id 的**比较**处走大写常量通道（`linkdesk/no-plugin-id-hardcode` 批准的用法，先例
 * `src/pluginLoader/contributions/viewRegistry.test.ts`）——串值仍是小写假名，⛔ 不是真插件 id。 */
const PLUG_A = "plug-a";
const PLUG_B = "plug-b";

/** 候选快照——第 0 家为宿主认定的当前生效（`isCurrent`），其余候选。
 *  `title`（插件名，前端标签用它）与 `typeLabel`（类型名）**故意取不同串**——若模型读错字段，
 *  下面断言 `label === "PLUG-B"` 的用例会当场变红（防串位）。 */
const handlers = (...ids: string[]): HandlerSnapshot[] =>
  ids.map((id, i) => ({
    pluginId: id,
    title: id.toUpperCase(),
    typeLabel: `TYPE:${id}`,
    isCurrent: i === 0,
  }));

/** 指定生效者（模拟「覆盖表已生效」后的宿主回答） */
const handlersCurrent = (current: string, ...others: string[]): HandlerSnapshot[] =>
  [current, ...others].map((id) => ({
    pluginId: id,
    title: id.toUpperCase(),
    typeLabel: `TYPE:${id}`,
    isCurrent: id === current,
  }));

const build = (over: Partial<BuildInput> = {}) =>
  buildManagerModel({ plugins: [], handlersByExt: {}, overrideTable: {}, ...over });

/* ── 归一 ── */

describe("归一：声明串 / 存储键 / 覆盖值", () => {
  it("大小写与前导点一律归一（声明 MX 与 .Mx 是同一个类）", () => {
    expect(normalizeExt("MX")).toBe("mx");
    expect(normalizeExt(".Mx")).toBe("mx");
    expect(normalizeExt("  .PDF  ")).toBe("pdf");
  });

  it("非法串一律空串（调用方据此跳过，⛔ 不把垃圾当类型）", () => {
    expect(normalizeExt("")).toBe("");
    expect(normalizeExt("   ")).toBe("");
    expect(normalizeExt(".tar.gz")).toBe("tar.gz"); // 中间的点是合法字符
    expect(normalizeExt("a/b")).toBe("");
    expect(normalizeExt("a\\b")).toBe("");
    expect(normalizeExt("a b")).toBe("");
    expect(normalizeExt(42)).toBe("");
    expect(normalizeExt(null)).toBe("");
  });

  it("存储键 = `.ext`（与宿主 normalizeAssociationOverrideKey 同形）", () => {
    expect(overrideKeyOf("MX")).toBe(".mx");
    expect(overrideKeyOf("")).toBe("");
  });

  it("读覆盖值：非字符串 / 空串 / 无键 ⇒ undefined（一律当「自动」）", () => {
    const table = { ".mx": "plug-a", ".bad": "", ".num": 7 };
    expect(readOverride(table, "mx")).toBe("plug-a");
    expect(readOverride(table, "bad")).toBeUndefined();
    expect(readOverride(table, "num")).toBeUndefined();
    expect(readOverride(table, "nope")).toBeUndefined();
    expect(readOverride(undefined, "mx")).toBeUndefined();
  });

  it("清单归一：去重保序、坏项丢弃（命令入参的守卫）", () => {
    expect(normalizeExtList([".MX", "mx", " pdf ", "", null, 3])).toEqual(["mx", "pdf"]);
    expect(normalizeExtList("mx")).toEqual([]);
  });
});

describe("声明面解析", () => {
  it("非法项静默跳过；同插件重复声明只留首次（与宿主注册序同向）", () => {
    const exts = extractDeclaredExtensions({
      fileAssociations: [
        { extension: "DOCX" },
        { extension: "docx" }, // 重复（大小写不同、归一后相同）
        { extension: "." }, // 归一后为空
        { extension: "  " },
        { nope: 1 },
        null,
        { extension: "uvprojx" }, // 怪串——机器不认识，照抄（E34）
      ],
    });
    expect(exts).toEqual([decl("docx", "DOCX"), decl("uvprojx")]);
  });

  it("contributes 缺 fileAssociations / 形状不对 ⇒ 空数组（不抛）", () => {
    expect(extractDeclaredExtensions(undefined)).toEqual([]);
    expect(extractDeclaredExtensions({})).toEqual([]);
    expect(extractDeclaredExtensions({ fileAssociations: "docx" })).toEqual([]);
    expect(extractDeclaredExtensions(null)).toEqual([]);
  });

  it("行标签最多三类，超出只给头（`等 N 类` 由视图拼 i18n）", () => {
    expect(EXT_LABEL_MAX).toBe(3);
    expect(extLabelHead(["a", "b"])).toBe(".a / .b");
    expect(extLabelHead(["a", "b", "c", "d", "e"])).toBe(".a / .b / .c");
  });
});

/* ── 竞争区聚合（E32） ── */

describe("竞争区：聚合与拆格", () => {
  const two = () => [plugin("plug-a", [decl("docx"), decl("xlsx")]), plugin("plug-b", [decl("docx"), decl("xlsx")])];
  const bothFacets: Record<string, HandlerSnapshot[]> = {
    docx: handlers("plug-a", "plug-b"),
    xlsx: handlers("plug-a", "plug-b"),
  };

  it("单 handler 不进此区（E29：没有选择可言）", () => {
    const m = build({
      plugins: [plugin("plug-a", [decl("docx")])],
      handlersByExt: { docx: handlers("plug-a") },
    });
    expect(m.contested).toEqual([]);
    expect(m.contestedExtCount).toBe(0);
  });

  it("无声明者（宿主不认识这类）也不进此区", () => {
    const m = build({ handlersByExt: { weird: [] } });
    expect(m.contested).toEqual([]);
  });

  it("同一批候选 + 同一生效值 ⇒ 并成一格，下拉整格生效（value 给统一值）", () => {
    const m = build({
      plugins: two(),
      handlersByExt: bothFacets,
      overrideTable: { ".docx": "plug-b", ".xlsx": "plug-b" },
    });
    expect(m.contested).toHaveLength(1);
    const row = m.contested[0]!;
    expect(row.exts).toEqual(["docx", "xlsx"]);
    expect(row.groupExtsCount).toBe(2);
    expect(row.handlerCount).toBe(2);
    expect(row.value).toBe("plug-b");
    expect(row.overrideCount).toBe(2);
    expect(row.source).toBe("user");
    expect(row.effectiveName).toBe("PLUG-B");
    expect(row.handlers).toEqual([
      { value: "plug-a", label: "PLUG-A" },
      { value: "plug-b", label: "PLUG-B" },
    ]);
  });

  it("一类被单独设置 ⇒ 按生效值拆成两个独立格；`groupExtsCount` 仍记整组（视图据此说「整组 N 类中 M 类单独设置」）", () => {
    const m = build({
      plugins: two(),
      handlersByExt: bothFacets, // docx/xlsx 同签名（同两家、同激活序）
      overrideTable: { ".docx": "plug-b" }, // 只把 docx 设成第二家
    });
    expect(m.contested).toHaveLength(2); // 拆开
    const user = m.contested.find((r) => r.value === "plug-b")!;
    const auto = m.contested.find((r) => r.value === "")!;
    expect(user.exts).toEqual(["docx"]);
    expect(user.source).toBe("user");
    expect(user.groupExtsCount).toBe(2); // 拆出来的格仍知道整组有多大
    expect(auto.exts).toEqual(["xlsx"]);
    expect(auto.source).toBe("auto");
    expect(auto.groupExtsCount).toBe(2);
    expect(auto.overrideCount).toBe(0); // 这一格没人设过 ⇒ 齿轮不出「恢复自动」
  });

  it("格内只有一部分人有覆盖键 ⇒ source = partial，且 value 退空（⛔ 不谎称「整格统一覆盖」）", () => {
    const m = build({
      plugins: two(),
      handlersByExt: {
        // 宿主说两类的生效者都是 plug-b：docx 是**用户设的**，xlsx 只是声明序轮到了它
        docx: handlersCurrent("plug-b", "plug-a"),
        xlsx: handlersCurrent("plug-b", "plug-a"),
      },
      overrideTable: { ".docx": "plug-b" },
    });
    expect(m.contested).toHaveLength(1); // 生效值相同 ⇒ 仍并成一格
    const row = m.contested[0]!;
    expect(row.exts).toEqual(["docx", "xlsx"]);
    expect(row.source).toBe("partial");
    expect(row.value).toBe(""); // 不是全员强覆盖 ⇒ 下拉不预选（改选即整格写，语义才自洽）
    expect(row.overrideCount).toBe(1); // 「恢复自动」项仍要出（真有一个键要清）
  });

  it("签名不同（候选集合不同）⇒ 不并格（`.docx` 两家、`.png` 另两家各成一格）", () => {
    const m = build({
      plugins: [
        plugin("plug-a", [decl("docx"), decl("png")]),
        plugin("plug-b", [decl("docx")]),
        plugin("plug-c", [decl("png")]),
      ],
      handlersByExt: { docx: handlers("plug-a", "plug-b"), png: handlers("plug-a", "plug-c") },
    });
    expect(m.contested).toHaveLength(2);
    expect(m.contested.map((r) => r.exts)).toEqual([["docx"], ["png"]]);
    expect(m.contestedExtCount).toBe(2);
  });

  it("失效覆盖：键指向不在册的插件 ⇒ 该格回「自动」，但 `overrideCount` 仍计入（齿轮得能清）", () => {
    const m = build({
      plugins: two(),
      handlersByExt: bothFacets,
      overrideTable: { ".docx": "gone", ".xlsx": "gone" },
    });
    const row = m.contested[0]!;
    expect(row.value).toBe(""); // ⛔ 下拉不显示幽灵值
    expect(row.overrideCount).toBe(2); // 但键确实在（清除项得出）
    expect(row.source).toBe("auto"); // 生效者已回声明序 ⇒ 说「用户指定」是撒谎
  });

  it("格内成员按字典序（与宿主声明序无关——一格的成员是「碰巧同签名」，没有先后可言）", () => {
    const m = build({
      plugins: [plugin("plug-a", [decl("zzz"), decl("aaa")]), plugin("plug-b", [decl("zzz"), decl("aaa")])],
      handlersByExt: { zzz: handlers("plug-a", "plug-b"), aaa: handlers("plug-a", "plug-b") },
    });
    expect(m.contested[0]!.exts).toEqual(["aaa", "zzz"]);
  });
});

/* ── 卡内六态（C5 定案） ── */

describe("卡内行六态", () => {
  const one = { docx: handlers("plug-a") };

  it("唯一处理者 + 用户在覆盖表里点了它 ⇒ lock（用户锁定，防后续漂移）", () => {
    const m = build({
      plugins: [plugin("plug-a", [decl("docx")])],
      handlersByExt: one,
      overrideTable: { ".docx": "plug-a" },
    });
    expect(m.cards[0]!.rows[0]!.state).toBe("lock");
    expect(m.cards[0]!.rows[0]!.value).toBe("plug-a");
  });

  it("唯一处理者但没覆盖键 ⇒ sole（自动）——⛔ 不谎称锁定", () => {
    const m = build({ plugins: [plugin("plug-a", [decl("docx")])], handlersByExt: one });
    expect(m.cards[0]!.rows[0]!.state).toBe("sole");
    expect(m.cards[0]!.rows[0]!.value).toBe("");
  });

  it("多家竞争 + 生效者是本卡：有覆盖键 ⇒ override，无 ⇒ auto", () => {
    const withKey = build({
      plugins: [plugin("plug-a", [decl("docx")])],
      handlersByExt: { docx: handlersCurrent("plug-a", "plug-b") },
      overrideTable: { ".docx": "plug-a" },
    });
    expect(withKey.cards[0]!.rows[0]!.state).toBe("override");
    const noKey = build({
      plugins: [plugin("plug-a", [decl("docx")])],
      handlersByExt: { docx: handlersCurrent("plug-a", "plug-b") },
    });
    expect(noKey.cards[0]!.rows[0]!.state).toBe("auto");
  });

  it("多家竞争 + 生效者不是本卡 ⇒ lost，并给出「默认：X」的 X", () => {
    const m = build({
      plugins: [plugin("plug-a", [decl("docx")])],
      handlersByExt: { docx: handlersCurrent("plug-b", "plug-a") },
    });
    const row = m.cards[0]!.rows[0]!;
    expect(row.state).toBe("lost");
    expect(row.currentName).toBe("PLUG-B");
    expect(row.options).toEqual([
      { value: "plug-b", label: "PLUG-B" },
      { value: "plug-a", label: "PLUG-A" },
    ]);
  });

  it("无人处理（宿主没有候选）⇒ orphan（角色兜底），且不炸", () => {
    const m = build({ plugins: [plugin("plug-a", [decl("docx")])], handlersByExt: {} });
    const row = m.cards[0]!.rows[0]!;
    expect(row.state).toBe("orphan");
    expect(row.currentName).toBeUndefined();
    expect(row.options).toEqual([]);
  });

  it("失效覆盖挂在**该类的每一行**上（不是只挂生效行——用户扫哪行都该看见键是死的）", () => {
    const m = build({
      plugins: [plugin("plug-a", [decl("docx")]), plugin("plug-b", [decl("docx")])],
      handlersByExt: { docx: handlers("plug-a", "plug-b") },
      overrideTable: { ".docx": "gone" },
    });
    for (const card of m.cards) {
      const row = card.rows[0]!;
      expect(row.dangling).toBe(true);
      expect(row.value).toBe("");
    }
  });

  it("声明串与归一键不同才带 `rawDeclaration`（悬停提示「声明串 X → 归一键 Y」）", () => {
    const m = build({ plugins: [plugin("plug-a", [decl("mx", "MX"), decl("pdf")])], handlersByExt: {} });
    expect(m.cards[0]!.rows[0]!.rawDeclaration).toBe("MX");
    expect(m.cards[0]!.rows[1]!.rawDeclaration).toBeUndefined();
  });

  it("🔴 声明序透传：卡内行序 === 插件声明数组的原始次序（「按默认排序」的唯一真源，C5）", () => {
    // 样本形态照编辑器真实声明（45 类、分区排列，⛔ 非字典序）——聚合内部一旦排序，「按默认排序」永久失真
    const declared = ["ts", "tsx", "js", "jsx", "json", "md", "css", "html", "py", "go"];
    const m = build({
      plugins: [plugin("plug-a", declared.map((e) => decl(e)))],
      handlersByExt: {},
    });
    expect(m.cards[0]!.rows.map((r) => r.ext)).toEqual(declared);
  });
});

/* ── 摘要三数与搜索/计数 ── */

describe("卡摘要、搜索与导航计数", () => {
  const world: Partial<BuildInput> = {
    plugins: [
      plugin("plug-a", [decl("docx"), decl("pdf")], "Alpha"),
      plugin("plug-b", [decl("docx")], "Beta"),
    ],
    handlersByExt: {
      docx: handlersCurrent("plug-a", "plug-b"),
      pdf: handlers("plug-a"),
    },
  };

  it("声明 / 竞争 / 默认持有 三数（卡头摘要）", () => {
    const m = build(world);
    const a = m.cards.find((c) => c.pluginId === PLUG_A)!;
    expect(a.declaredCount).toBe(2);
    expect(a.contestedCount).toBe(1); // docx 两家
    expect(a.holdCount).toBe(2); // docx（宿主说它在生效）＋ pdf（唯一处理者）
    const b = m.cards.find((c) => c.pluginId === PLUG_B)!;
    expect(b.declaredCount).toBe(1);
    expect(b.contestedCount).toBe(1);
    expect(b.holdCount).toBe(0);
  });

  it("`overrideExts` 只数**真有键**的类（卡齿轮的「清除 N 类」）", () => {
    const m = build({ ...world, overrideTable: { ".pdf": "plug-a", ".gone": "plug-b" } });
    expect(m.cards.find((c) => c.pluginId === PLUG_A)!.overrideExts).toEqual(["pdf"]);
    expect(m.cards.find((c) => c.pluginId === PLUG_B)!.overrideExts).toEqual([]);
  });

  it("没有任何声明的插件不出卡（空壳插件不占位）", () => {
    const m = build({ plugins: [plugin("plug-a", []), plugin("plug-b", [decl("docx")])] });
    expect(m.cards.map((c) => c.pluginId)).toEqual(["plug-b"]);
  });

  it("搜索：卡按 显示名 / id / `.ext` 命中（整卡留、⛔ 不切碎卡内行）", () => {
    const byName = build({ ...world, search: "beta" });
    expect(byName.cards.map((c) => c.pluginId)).toEqual(["plug-b"]);
    expect(byName.cards[0]!.rows).toHaveLength(1); // 行没有被搜索切碎

    const byId = build({ ...world, search: "plug-a" });
    expect(byId.cards.map((c) => c.pluginId)).toEqual(["plug-a"]);

    const byExt = build({ ...world, search: ".pdf" });
    expect(byExt.cards.map((c) => c.pluginId)).toEqual(["plug-a"]);
    expect(byExt.contested).toEqual([]); // pdf 单家 ⇒ 本来就不在竞争区
  });

  it("搜索：竞争区按 `.ext` 或任一候选显示名/id 命中", () => {
    const byExt = build({ ...world, search: ".docx" });
    expect(byExt.contestedExtCount).toBe(1);
    const byHandler = build({ ...world, search: "plug-b" });
    expect(byHandler.contestedExtCount).toBe(1); // docx 的候选里有 plug-b（显示名 PLUG-B）
    const miss = build({ ...world, search: "zzz" });
    expect(miss.contested).toEqual([]);
    expect(miss.cards).toEqual([]);
    expect(miss.navCount).toBe(0);
  });

  it("导航计数 = 竞争类型数 ＋ 卡片数（⛔ 不是聚合行数）", () => {
    const m = build(world);
    expect(m.contestedExtCount).toBe(1);
    expect(m.cards).toHaveLength(2);
    expect(m.navCount).toBe(3);
    // 拆格会多出一行但**类型数不变** ⇒ 徽标数字不动（用户关心的是「多少类要我看」）。
    // 换一对「两类同签名」的世界：`world` 里 docx 是唯一竞争类，重叠覆盖只会给它换值、拆不出格。
    const pair: Partial<BuildInput> = {
      plugins: [plugin("plug-a", [decl("docx"), decl("xlsx")]), plugin("plug-b", [decl("docx"), decl("xlsx")])],
      handlersByExt: {
        docx: handlersCurrent("plug-a", "plug-b"),
        xlsx: handlers("plug-a", "plug-b"),
      },
    };
    const before = build(pair);
    expect(before.contested).toHaveLength(1); // 两类同签名 ⇒ 并成一格
    expect(before.navCount).toBe(4); // 2 类 ＋ 2 卡
    const split = build({ ...pair, overrideTable: { ".docx": "plug-b" } });
    expect(split.contested).toHaveLength(2); // 一类被单独设置 ⇒ 一行拆成两行
    expect(split.navCount).toBe(4); // 类型数不变 ⇒ 徽标不动
  });
});

/* ══ C5 卡内行序与过滤（工具条两件控件的口径） ══
 *
 * 判据来源＝硬约束口径 04 §1.7 ＋ 02 边缘情况 E2–E7/E15/E27 ＋ 拟真度门 K2 段（那张图就是实机效果）。
 * 样本＝**编辑器真声明**（45 类真实序 ＋ 真实类型名）——这几条判据本身就是「与真数据一致」，
 * 假名夹具证明不了任何东西（本文件其余各节仍一律假名）。
 */

/** 编辑器 45 类**真实声明序**（`official/editor/plugin.json` → `contributes.fileAssociations`） */
const EDITOR_ORDER = [
  "ts", "tsx", "js", "jsx", "mjs", "cjs", "json", "jsonc", "html", "htm",
  "css", "scss", "less", "md", "mdx", "py", "rs", "c", "h", "cpp",
  "hpp", "go", "java", "xml", "svg", "yaml", "yml", "toml", "sh", "bash",
  "sql", "lua", "php", "rb", "swift", "kt", "dart", "diff", "patch", "bat",
  "cmd", "ini", "cfg", "txt", "log",
];

/** 同清单的 `displayName`（**类型**显示名，不是插件名）——仅显示名命中就靠它 */
const EDITOR_TYPE_LABEL: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript React", js: "JavaScript", jsx: "JavaScript React",
  mjs: "JavaScript ES Module", cjs: "JavaScript CommonJS", json: "JSON", jsonc: "JSON with Comments",
  html: "HTML", htm: "HTML", css: "CSS", scss: "SCSS", less: "Less", md: "Markdown", mdx: "MDX",
  py: "Python", rs: "Rust", c: "C", h: "C Header", cpp: "C++", hpp: "C++ Header", go: "Go",
  java: "Java", xml: "XML", svg: "SVG", yaml: "YAML", yml: "YAML", toml: "TOML", sh: "Shell",
  bash: "Bash", sql: "SQL", lua: "Lua", php: "PHP", rb: "Ruby", swift: "Swift", kt: "Kotlin",
  dart: "Dart", diff: "Diff", patch: "Patch", bat: "Batch", cmd: "Batch", ini: "INI",
  cfg: "Config", txt: "Text", log: "Log",
};

const editorDeclared = (): DeclaredExtension[] =>
  EDITOR_ORDER.map((e) => ({ ext: e, raw: e, typeLabel: EDITOR_TYPE_LABEL[e]! }));

/** 编辑器那张卡的 45 行（无宿主候选 ⇒ 全 orphan；行序/过滤不看状态，正合适） */
const editorRows = (): ExtRowModel[] =>
  build({ plugins: [plugin("editor", editorDeclared())] }).cards[0]!.rows;

const extsOf = (rows: readonly ExtRowModel[]): string[] => rows.map((r) => r.ext);
/** 视图组装口径（两件控件的唯一正确用法） */
const shownRows = (mode: "alpha" | "declared", q: string): ExtRowModel[] =>
  filterRows(orderRows(editorRows(), mode), q);

describe("卡内行序（C5）：alpha 默认 ／ declared 保序透传", () => {
  it("🔴 E27 保序透传：declared 输出 === 模型输入序（45 类真实序，⛔ 不是字典序）", () => {
    const input = editorRows();
    const declared = orderRows(input, "declared");
    expect(extsOf(declared)).toEqual(EDITOR_ORDER); // 与真清单逐项一致
    expect(extsOf(declared)).toEqual(extsOf(input)); // 且 === 模型给的行序（聚合层没重排过）
    // 反向防线：万一有人把 EDITOR_ORDER 抄成了排好序的样子，这条会红
    expect(extsOf(declared)).not.toEqual([...EDITOR_ORDER].sort());
  });

  it("alpha（默认）＝按扩展名字母序——与 declared 是两个不同的序（样本没走运重合）", () => {
    const sorted = extsOf(orderRows(editorRows(), "alpha"));
    expect(sorted).toEqual([...EDITOR_ORDER].sort());
    expect(sorted).not.toEqual(EDITOR_ORDER);
  });

  it("不改传入数组（纯函数：出参是新数组，入参序不动）", () => {
    const input = editorRows();
    const before = extsOf(input);
    const out = orderRows(input, "alpha");
    expect(out).not.toBe(input);
    expect(extsOf(input)).toEqual(before); // sort 落在副本上
  });
});

describe("命中分类（C5）：两源 ＋ 归一 ＋ ⛔ 无通配", () => {
  it("E3 `.py` ／ `py` ／ `PY` 同一个词、同一结果（忽略大小写与前导点）", () => {
    for (const q of [".py", "py", "PY", "  .Py  "]) {
      expect(hitKindOf("py", "Python", q)).toBe("ext");
    }
  });

  it("E4 仅显示名命中：`python` 靠类型名命中 `py`（显示名匹配删不得）", () => {
    expect(hitKindOf("py", "Python", "python")).toBe("name");
    expect(hitKindOf("py", undefined, "python")).toBe(""); // 没有类型名 ⇒ 不命中（⛔ 不编造）
  });

  it("E2 空词／纯空白／只有一个点 ⇒ `\"\"`（空词下「命中」无从谈起）", () => {
    for (const q of ["", "   ", ".", "\t.\n"]) expect(hitKindOf("py", "Python", q)).toBe("");
  });

  it("E15 ⛔ 不做正则/通配：`t.tsx` 这类串按**子串**处理（不命中就是不命中）", () => {
    expect(hitKindOf("tsx", "TypeScript React", "t.tsx")).toBe(""); // 通配读法才会命中
    expect(hitKindOf("jsonc", "JSON with Comments", "jsonc")).toBe("ext"); // 含点的串照子串匹配
    expect(hitKindOf("t", "Text", "t")).toBe("ext");
  });
});

describe("卡内过滤（C5）：分档 ＋ 空词回全量 ＋ 分档不改排序语义", () => {
  it("E2 空词／纯空白 ⇒ 回全量（45 行、序同输入）", () => {
    for (const q of ["", "   "]) {
      const out = filterRows(editorRows(), q);
      expect(out).toHaveLength(45);
      expect(extsOf(out)).toEqual(EDITOR_ORDER);
    }
  });

  it("🔴 E5 输 `c` ⇒ 17 行分档：前 9 行扩展名命中（字母序）、沉底 8 行仅显示名命中", () => {
    const rows = shownRows("alpha", "c");
    expect(rows).toHaveLength(17);
    // 前 9：扩展名命中，且**没有任何理由标注**（真扩展名命中不需要解释）
    expect(extsOf(rows.slice(0, 9))).toEqual(
      ["c", "cfg", "cjs", "cmd", "cpp", "css", "jsonc", "patch", "scss"],
    );
    expect(rows.slice(0, 9).every((r) => hitKindOf(r.ext, r.typeLabel, "c") === "ext")).toBe(true);
    // 沉底 8：全是仅显示名命中（`c` 在类型名里，不在扩展名里）——「类型名 …」标注的数据面
    expect(extsOf(rows.slice(9))).toEqual(["bat", "h", "hpp", "js", "jsx", "mjs", "ts", "tsx"]);
    expect(rows.slice(9).every((r) => hitKindOf(r.ext, r.typeLabel, "c") === "name")).toBe(true);
    // 首／末两行正是图上 K2 断言的那两条（图说：.bat 排头、TypeScript 收尾）
    expect(rows[9]!.typeLabel).toBe("Batch");
    expect(rows[16]!.typeLabel).toBe("TypeScript React");
  });

  it("E6 分档不改排序语义：换 declared 只换序不换集，17 行与两档边界都不动", () => {
    const alpha = shownRows("alpha", "c");
    const declared = shownRows("declared", "c");
    expect(declared).toHaveLength(17);
    expect(new Set(extsOf(declared))).toEqual(new Set(extsOf(alpha))); // 集不变
    expect(extsOf(declared)).not.toEqual(extsOf(alpha)); // 序变了
    // 档内继续服选定排序：declared 档首行＝声明序里第一个扩展名命中（cjs）
    expect(extsOf(declared).slice(0, 9)[0]).toBe("cjs");
    expect(extsOf(declared).slice(0, 9)).toEqual(["cjs", "jsonc", "css", "scss", "c", "cpp", "patch", "cmd", "cfg"]);
    // 分档边界不动：前 9 全是 ext 命中、沉底 8 全是仅显示名命中
    expect(declared.slice(0, 9).every((r) => hitKindOf(r.ext, r.typeLabel, "c") === "ext")).toBe(true);
    expect(declared.slice(9).every((r) => hitKindOf(r.ext, r.typeLabel, "c") === "name")).toBe(true);
  });

  it("E4 输 `python` ⇒ 只出 1 行 `.py`（纯显示名命中——扩展名里没有 python）", () => {
    for (const mode of ["alpha", "declared"] as const) {
      const rows = shownRows(mode, "python");
      expect(extsOf(rows)).toEqual(["py"]);
      expect(hitKindOf(rows[0]!.ext, rows[0]!.typeLabel, "python")).toBe("name");
    }
  });

  it("E3 `.py` ／ `py` ／ `PY` 过滤同一结果", () => {
    const baseline = extsOf(shownRows("alpha", "py"));
    expect(baseline).toEqual(["py"]);
    for (const q of [".py", "PY", "  .Py  "]) expect(extsOf(shownRows("alpha", q))).toEqual(baseline);
  });

  it("命中数：随词收窄、随清空复原（视图「命中 N / 45」的分子）", () => {
    expect(shownRows("alpha", "py")).toHaveLength(1);
    expect(shownRows("alpha", "c")).toHaveLength(17);
    expect(shownRows("alpha", "zzz")).toHaveLength(0);
    expect(shownRows("alpha", "")).toHaveLength(45);
  });

  it("E15 无通配：`t.tsx` 不命中任何一行（子串口径，⛔ 不是正则）", () => {
    expect(shownRows("alpha", "t.tsx")).toHaveLength(0);
  });

  it("不改行内容、不改传入数组长度（纯函数：只滤不写）", () => {
    const input = editorRows();
    const snapshot = input.map((r) => ({ ...r }));
    const out = filterRows(input, "c");
    expect(input).toHaveLength(45);
    expect(input).toEqual(snapshot); // 行对象一个字段都没被改
    expect(out[0]!.state).toBe("orphan"); // 出参就是原行对象（不是重造的残件）
    expect(out[0]).toBe(input.find((r) => r.ext === out[0]!.ext));
  });
});
