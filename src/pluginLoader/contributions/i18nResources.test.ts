import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import i18n from "../../i18n";
import { registerPluginLanguageBundle, resetKeyOverlapWarnings } from "./i18nResources";
import { rollback } from "../../core/registry/registrationTracker";

/**
 * 重装契约——卸载时 translation 命名空间按剩余插件整份重建。
 * 核心断言：碰撞正确（同顶层键不误删他插件子键）+ 注册序保持 + 重装干净重入。
 * E5.8#12：unregisterPluginLanguageBundles 已删——rollback(pid) 经 tracker 逆序回滚同语义。
 *
 * E6#111j（1.40）：补「键覆盖出声」契约（判据①②③）。
 * 🔴 判据②③ 是本组的**硬负控**——误报会让真信号失效，所以「不许出声」和「必须出声」同等重要。
 */
const TEST_PLUGINS = ["plugin-a", "plugin-b", "plugin-c"];

/** 取本轮用例捕获的 console.warn 文本（已按 [i18nResources] 过滤） */
function warnText(): string {
  return warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
}
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  // 「已出声」记账是模块级单例，跨用例不隔离 —— 前一用例报过的键会让后一用例静默（假绿温床）
  resetKeyOverlapWarnings();
});

afterEach(() => {
  warnSpy.mockRestore();
  // 还原单例——每个用例从干净的资源表出发
  for (const pid of TEST_PLUGINS) {
    rollback(pid);
  }
});

describe("i18nResources——重装契约：卸载时 translation 命名空间按剩余插件重建", () => {
  it("注册写两份命名空间——translation（壳 t() 查键）+ pluginId（整份追踪）", () => {
    registerPluginLanguageBundle("zh", { "a.b": "甲" }, "plugin-a");
    expect(i18n.getResourceBundle("zh", "translation")).toMatchObject({ "a.b": "甲" });
    expect(i18n.getResourceBundle("zh", "plugin-a")).toMatchObject({ "a.b": "甲" });
  });

  it("卸载重建——被卸插件键消失，其余插件同顶层键的子键幸存（碰撞正确）", () => {
    registerPluginLanguageBundle("zh", { menu: { file: "文件" } }, "plugin-a");
    registerPluginLanguageBundle("zh", { menu: { edit: "编辑" } }, "plugin-b");
    rollback("plugin-a");
    const bundle = i18n.getResourceBundle("zh", "translation") as Record<string, unknown>;
    expect(bundle).toMatchObject({ menu: { edit: "编辑" } });
    expect(bundle.menu).not.toHaveProperty("file");
    expect(i18n.getResourceBundle("zh", "plugin-a")).toBeUndefined();
    expect(i18n.getResourceBundle("zh", "plugin-b")).toBeDefined();
  });

  it("注册序保持——重建后剩余插件仍按注册序合并且各自键完整", () => {
    registerPluginLanguageBundle("zh", { k: { v1: 1 } }, "plugin-a");
    registerPluginLanguageBundle("zh", { k: { v2: 2 } }, "plugin-b");
    rollback("plugin-b");
    const bundle = i18n.getResourceBundle("zh", "translation") as Record<string, unknown>;
    expect(bundle).toMatchObject({ k: { v1: 1 } });
    expect(bundle.k).not.toHaveProperty("v2");
  });

  it("未知插件卸载不崩 + 重装同 pluginId 干净重入", () => {
    expect(() => rollback("ghost")).not.toThrow();
    registerPluginLanguageBundle("zh", { "x.y": 1 }, "plugin-c");
    rollback("plugin-c");
    expect(i18n.getResourceBundle("zh", "translation")).toBeUndefined();
    registerPluginLanguageBundle("zh", { "x.y": 2 }, "plugin-c");
    expect(i18n.getResourceBundle("zh", "translation")).toMatchObject({ "x.y": 2 });
  });
});

describe("i18nResources——键覆盖出声（E6#111j 判据①②③）", () => {
  it("① 异插件同键 ⇒ 出声，点名双方 + 键名，且值仍以后注册者为准（只出声不拦）", () => {
    registerPluginLanguageBundle("zh", { 搜索: "Search-A" }, "plugin-a");
    expect(warnText()).toBe(""); // 首个注册者无覆盖，不出声
    registerPluginLanguageBundle("zh", { 搜索: "Search-B" }, "plugin-b");
    expect(warnText()).toContain("搜索");
    expect(warnText()).toContain("plugin-b");
    expect(warnText()).toContain("zh");
    // 🔴 只出声不拦——值照写，后注册者胜（操作体验零变化）
    expect(i18n.getResourceBundle("zh", "translation")).toMatchObject({ 搜索: "Search-B" });
  });

  it("② 🔴 硬负控：同插件重复注册同键 ⇒ 零输出（误报会让真信号失效）", () => {
    registerPluginLanguageBundle("zh", { 同一个键: "甲" }, "plugin-a");
    registerPluginLanguageBundle("zh", { 同一个键: "乙" }, "plugin-a");
    expect(warnText()).toBe("");
    expect(i18n.getResourceBundle("zh", "translation")).toMatchObject({ 同一个键: "乙" });
  });

  it("③ 同插件 en / zh 两份同键 ⇒ 零输出（中英两份是一个来源，不是共写）", () => {
    // 构造：他方（plugin-b）先在 **en 与 zh 两个语言**占住同一个键。
    // 然后本插件（plugin-a）以自己的 en / zh 两份写同一个键。
    //   zh：existing 有该键、own(plugin-a,zh) 为空 ⇒ 真共写 ⇒ 应出声
    //   en：同上 ⇒ 也应出声
    // 断言重点在**后半段**：plugin-a 的 en 那份**不该因为 plugin-a 的 zh 那份已写过**而免出声
    //   —— 若 own 归并被误写成「跨语言也算自己人」，第二行就会静默（这正是 M2 打坏点）。
    registerPluginLanguageBundle("zh", { 打开端口: "他方中文" }, "plugin-b");
    registerPluginLanguageBundle("en", { 打开端口: "Peer English" }, "plugin-b");
    warnSpy.mockClear();
    registerPluginLanguageBundle("zh", { 打开端口: "打开端口" }, "plugin-a");
    expect(warnText()).toContain("plugin-a");
    expect(warnText()).toContain("zh");
    warnSpy.mockClear();
    registerPluginLanguageBundle("en", { 打开端口: "Open Port" }, "plugin-a");
    expect(warnText()).toContain("plugin-a");
    expect(warnText()).toContain("en");
  });

  it("③″ 同插件同语言重复注册同一键 ⇒ 零输出（自己人不算共写）", () => {
    registerPluginLanguageBundle("zh", { 打开端口: "他方中文" }, "plugin-b");
    registerPluginLanguageBundle("zh", { 打开端口: "打开端口" }, "plugin-a");
    expect(warnText()).toContain("plugin-a"); // 首次 = 真共写，出声
    warnSpy.mockClear();
    registerPluginLanguageBundle("zh", { 打开端口: "打开端口-B" }, "plugin-a");
    expect(warnText()).toBe(""); // 本插件已写过该键 ⇒ 自己覆盖自己，静默
  });

  it("③′ 同一插件跨语言不互扰——异插件在同语言上撞键仍出声", () => {
    registerPluginLanguageBundle("en", { seed: "seed" }, "plugin-b");
    registerPluginLanguageBundle("zh", { seed: "种子" }, "plugin-b");
    registerPluginLanguageBundle("zh", { 打开端口: "打开端口" }, "plugin-a");
    registerPluginLanguageBundle("en", { 打开端口: "Open Port" }, "plugin-a");
    expect(warnText()).toBe("");
    registerPluginLanguageBundle("zh", { 打开端口: "打开端口-B" }, "plugin-b");
    expect(warnText()).toContain("plugin-b");
  });

  it("④ 本插件独有的键不误报——与他插件无交集的键零输出", () => {
    registerPluginLanguageBundle("zh", { 甲的键: 1 }, "plugin-a");
    registerPluginLanguageBundle("zh", { 乙的键: 2 }, "plugin-b");
    expect(warnText()).toBe("");
  });

  it("⑤ 同一键反复注册（重装/热重载）不刷屏——同一写入者只出一条", () => {
    // 🔴 必须用**异插件反复注册**才能打到去重集：同插件重复会被 own 判断先挡住（那是判据②）
    registerPluginLanguageBundle("zh", { 重复键: "甲" }, "plugin-a");
    for (let i = 0; i < 3; i++) {
      rollback("plugin-b");
      registerPluginLanguageBundle("zh", { 重复键: `乙${i}` }, "plugin-b");
    }
    expect(warnText().match(/重复键/g) ?? []).toHaveLength(1);
  });

  it("⑤′ 去重按「写入者」分账——三方撞同一键时后两方各出一条（不吞第三方）", () => {
    // 🔴 官方真实情形：`搜索` 由 file-tree / marketplace / serial-monitor 三方共写。
    //   若去重只按「语言＋键」，第三个写者会被静默吞掉——那正是本轴要消灭的静默。
    registerPluginLanguageBundle("zh", { 搜索: "搜索" }, "plugin-a");
    registerPluginLanguageBundle("zh", { 搜索: "Search" }, "plugin-b");
    registerPluginLanguageBundle("zh", { 搜索: "Search" }, "plugin-c");
    expect(warnText().match(/搜索/g) ?? []).toHaveLength(2);
  });

  it("⑥ 卸载后该语言字典清空 ⇒ 再注册不算覆盖（重建不产生假报）", () => {
    registerPluginLanguageBundle("zh", { 独有: "甲" }, "plugin-a");
    rollback("plugin-a");
    registerPluginLanguageBundle("zh", { 独有: "乙" }, "plugin-b");
    expect(warnText()).toBe("");
  });

  it("⑦ 嵌套子键不误报——只有一个插件占该顶层键时零输出", () => {
    registerPluginLanguageBundle("zh", { menu: { file: "文件" } }, "plugin-a");
    registerPluginLanguageBundle("zh", { menu: { file: "文件-B" } }, "plugin-a");
    expect(warnText()).toBe("");
  });
});
