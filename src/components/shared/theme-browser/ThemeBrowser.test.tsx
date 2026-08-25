/**
 * @vitest-environment jsdom
 * E5.8#50.24：showThemePicker 两段式 QuickPick 单元测试（theme.pick 命令调起）。
 * 覆盖：阶段 1 配方列表 + 当前配方 checked + detail（单配色类型 / 多配色计数）/ 多配色配方 Enter →
 *       阶段 2 配色列表 + transitioned 防误关 / 阶段 2 提交时序（themeColor→app.theme，E5.8#82 无 themeColorMode）/
 *       单配色直接提交（不经阶段 2）/ Esc 取消回退打开前配方 / pluginId 过滤。
 * 夹具：ThemeRegistry 真注册表（disposer 清理，虚构配方——硬约束 21）；
 *      QuickPickService / i18n mock + ConfigurationService importOriginal 覆盖 setConfigurationValue
 *      （保留 getConfigurationValue 真实现——ThemeEngine.applyRecipe 播种/覆盖读取依赖）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { showThemePicker } from "./ThemeBrowser";
import { applyRecipe, getActiveRecipe } from "../../../core/services/ui/ThemeEngine";
import { ThemeRegistry } from "../../../core/registry/appearance/ThemeRegistry";
import type { ThemeRecipe, ThemeColorway } from "../../../core/types/theme";

const { showMock, hideMock, setConfigMock } = vi.hoisted(() => ({
  showMock: vi.fn(),
  hideMock: vi.fn(),
  setConfigMock: vi.fn(),
}));

vi.mock("../../../core/services/ui/QuickPickService", () => ({
  QuickPickService: { show: showMock, hide: hideMock },
}));

// importOriginal 展开真模块——只覆盖 setConfigurationValue（themeColor/app.theme 写入断言，E5.8#82 无 themeColorMode）
vi.mock("../../../core/services/configuration/ConfigurationService", async (importOriginal) => {
  const mod = await importOriginal<typeof import("../../../core/services/configuration/ConfigurationService")>();
  return { ...mod, setConfigurationValue: setConfigMock };
});

vi.mock("../../../i18n", () => ({ default: { t: (s: string) => s } }));

/* ── 夹具——虚构配方（硬约束 21：demo-* 前缀 + Alpha/Beta/Gamma） ── */

const MINT: ThemeRecipe = {
  id: "demo-mint",
  name: "Demo Mint",
  type: "light",
  colorways: [
    { id: "dew", name: "Alpha" },
    { id: "tea", name: "Beta" },
  ],
};

const FOREST: ThemeRecipe = {
  id: "demo-forest",
  name: "Demo Forest",
  type: "dark",
  colorways: [{ id: "pine", name: "Gamma" }],
};

let disposers: Array<() => void> = [];

function registerFixture(recipe: ThemeRecipe, pluginId?: string): void {
  disposers.push(ThemeRegistry.registerRecipe(recipe, pluginId));
}

beforeEach(() => {
  setConfigMock.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const d of disposers) d();
  disposers = [];
  vi.clearAllMocks();
});

/* ── helper——捕获 QuickPickService.show 入参（同 panelCreatePicker.test 先例） ── */

function stateOf(idx = 0): Record<string, unknown> {
  return showMock.mock.calls[idx][0] as Record<string, unknown>;
}

describe("showThemePicker（E5.8#50.24 两段式）", () => {
  it("阶段 1——配方列表 + 当前配方 checked + detail（单配色类型 / 多配色计数）", () => {
    registerFixture(MINT);
    registerFixture(FOREST);
    applyRecipe(FOREST); // 打开前活动配方 = demo-forest
    showThemePicker();

    const st = stateOf();
    expect(st.placeholder).toBe("选择主题配方…");
    const items = st.items as ThemeRecipe[];
    expect(items.map((r) => r.id)).toEqual(["demo-mint", "demo-forest"]);

    const serialize = st.serialize as (r: ThemeRecipe) => Record<string, unknown>;
    expect(serialize(FOREST).checked).toBe(true);
    expect(serialize(FOREST).detail).toBe("暗色主题");
    expect(serialize(MINT).checked).toBe(false);
    expect(String(serialize(MINT).detail)).toContain("配色"); // "浅色主题 · {{count}} 配色"（mock 不插值）
  });

  it("多配色配方 Enter → 阶段 2 配色列表；阶段 1 onClose 被 transitioned 拦下不误关", () => {
    registerFixture(MINT);
    registerFixture(FOREST);
    showThemePicker();

    const st1 = stateOf();
    const onSelect = st1.onSelect as (r: ThemeRecipe) => void;
    onSelect(MINT);

    // 阶段 2 = 该配方 colorways + 配色归属配方 category
    const st2 = stateOf(1);
    expect(st2.placeholder).toBe("选择配色变体…");
    expect(st2.items).toEqual(MINT.colorways);
    const cwSerialize = st2.serialize as (cw: ThemeColorway) => Record<string, unknown>;
    expect(cwSerialize(MINT.colorways[0]).category).toBe("Demo Mint");

    // 桥 select 动作 onSelect→onClose 同步连发——阶段 1 onClose 必须提前返回，不能 hide 掉阶段 2
    const st1Close = st1.onClose as () => void;
    st1Close();
    expect(hideMock).not.toHaveBeenCalled();
  });

  it("阶段 2 选配色 → 提交时序 themeColor→app.theme（E5.8#82 无 themeColorMode 包装层）", async () => {
    registerFixture(MINT);
    registerFixture(FOREST);
    showThemePicker();

    const st1 = stateOf();
    const onSelect = st1.onSelect as (r: ThemeRecipe) => void;
    onSelect(MINT);

    const st2 = stateOf(1);
    const cwSelect = st2.onSelect as (cw: ThemeColorway) => void;
    cwSelect(MINT.colorways[1]); // Beta/tea

    await vi.waitFor(() => expect(setConfigMock).toHaveBeenCalledTimes(2));
    expect(setConfigMock.mock.calls.map((c) => c[0])).toEqual([
      "app.themeColor",
      "app.theme",
    ]);
    expect(setConfigMock.mock.calls.map((c) => c[1])).toEqual(["tea", "demo-mint"]);

    // 提交后阶段 2 Esc/关闭 → hide
    const st2Close = st2.onClose as () => void;
    st2Close();
    expect(hideMock).toHaveBeenCalledTimes(1);
  });

  it("单配色配方 Enter → 直接提交 app.theme（不经阶段 2）", async () => {
    registerFixture(FOREST);
    showThemePicker();

    const st = stateOf();
    const onSelect = st.onSelect as (r: ThemeRecipe) => void;
    onSelect(FOREST);

    await vi.waitFor(() => expect(setConfigMock).toHaveBeenCalledTimes(1));
    expect(setConfigMock).toHaveBeenCalledWith("app.theme", "demo-forest", "user");
    expect(showMock).toHaveBeenCalledTimes(1); // 无阶段 2
  });

  it("Esc 取消（阶段 1 未提交）→ 回退打开前配方", () => {
    registerFixture(MINT);
    registerFixture(FOREST);
    applyRecipe(FOREST); // 打开前活动配方 = demo-forest
    showThemePicker();

    const st = stateOf();
    const onHighlight = st.onHighlight as (r: ThemeRecipe) => void;
    const onClose = st.onClose as () => void;
    onHighlight(MINT); // 预览 demo-mint
    onClose();         // Esc——未提交

    expect(getActiveRecipe()).toEqual({ recipeId: "demo-forest", colorwayId: "pine" });
    expect(hideMock).toHaveBeenCalledTimes(1);
  });

  it("pluginId 过滤——只列该插件配方", () => {
    registerFixture(MINT, "demo-plugin-a");
    registerFixture(FOREST); // 无归属——不进 demo-plugin-a 列表
    showThemePicker("demo-plugin-a");

    const st = stateOf();
    const items = st.items as ThemeRecipe[];
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe("demo-mint");
  });
});
