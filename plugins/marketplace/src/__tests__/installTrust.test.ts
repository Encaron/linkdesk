/**
 * installTrust 单测——E6#71k 安装信任门（「每来源一次」）。
 * 覆盖三块：① 纯判定 decideTrust 判序（官方 → http → 换来源 → 已信任 → 首次）
 *          ② 读守卫生效（缺 configuration 面 / 抛 / 形状不对 → 空表 = 未知即未信任，ⓐ 反漏洞方向）
 *          ③ 写串行化（并发「读—改—写」不丢写）+ 增删幂等
 * fixture 全虚构（硬约束 21）：来源名/插件 id 用明显虚构值（demo-*、example.invalid）。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  decideTrust,
  isHttpSourceUrl,
  readTrustedSources,
  readInstalledFrom,
  rememberSource,
  forgetSource,
  rememberInstalledFrom,
  trustDecisionFor,
  TRUSTED_SOURCES_KEY,
  INSTALLED_FROM_KEY,
} from "../services/installTrust";

/* ── window.linkdesk 替身：只给 configuration 面（本模块唯一依赖） ── */

/** 内存配置替身——get/set 都是 async（await 让出微任务 → 并发写真的会交错） */
function stubConfiguration(seed: Record<string, unknown> = {}) {
  const map = new Map<string, unknown>(Object.entries(seed));
  const get = vi.fn(async (key: string) => map.get(key));
  const set = vi.fn(async (key: string, value: unknown) => {
    map.set(key, value);
  });
  Object.defineProperty(window, "linkdesk", {
    value: { configuration: { get, set } },
    configurable: true,
  });
  return { get, set, map };
}

/** 装在 entry 上的最小判定入参（trustDecisionFor 只需这四个字段） */
const entry = (over: Partial<Parameters<typeof decideTrust>[0]> = {}) => ({
  trusted: [] as readonly string[],
  installedFrom: {} as Readonly<Record<string, string>>,
  pluginId: "demo-gizmo",
  ...over,
});

beforeEach(() => {
  Reflect.deleteProperty(window, "linkdesk");
});
afterEach(() => {
  Reflect.deleteProperty(window, "linkdesk");
});

/* ═══ ① 纯判定 ═══ */

describe("isHttpSourceUrl（明文源判定）", () => {
  it("http:// → true（大小写/空白不敏感）", () => {
    expect(isHttpSourceUrl("http://example.invalid/x")).toBe(true);
    expect(isHttpSourceUrl("  HTTP://example.invalid/x  ")).toBe(true);
  });

  it("https:// / 缺省 / 非串 → false（missing ≠ http，走各自分支）", () => {
    expect(isHttpSourceUrl("https://example.invalid/x")).toBe(false);
    expect(isHttpSourceUrl(undefined)).toBe(false);
    expect(isHttpSourceUrl("")).toBe(false);
  });
});

describe("decideTrust（判序钉死：官方 → http → 换来源 → 已信任 → 首次）", () => {
  it("官方源 → 不弹（平台自策展前提，remember 无意义恒 false）", () => {
    expect(decideTrust(entry({ official: true }))).toEqual({
      prompt: false,
      reason: "official",
      remember: false,
    });
  });

  it("官方优先于一切——即便同时是 http、且来源与台账不符", () => {
    expect(
      decideTrust(
        entry({ official: true, sourceUrl: "http://example.invalid/a", sourceName: "demo-owner/demo-repo" }),
      ).reason,
    ).toBe("official");
  });

  it("http 明文源 → 弹且**不记忆**（可 MITM，§五 J.2③）——即便该来源已在信任表", () => {
    expect(
      decideTrust(
        entry({
          sourceUrl: "http://example.invalid/a",
          sourceName: "demo-owner/demo-repo",
          trusted: ["demo-owner/demo-repo"],
        }),
      ),
    ).toEqual({ prompt: true, reason: "http", remember: false });
  });

  it("同 id 换了来源 → 弹且**压过已信任**（§五 J.2②：信任的单位是来源不是 id）", () => {
    expect(
      decideTrust(
        entry({
          sourceName: "demo-owner/demo-new",
          trusted: ["demo-owner/demo-new"], // 新来源其实已在信任表
          installedFrom: { "demo-gizmo": "demo-owner/demo-old" }, // 但上次装它的是别人
        }),
      ),
    ).toEqual({ prompt: true, reason: "source-changed", remember: true });
  });

  it("已信任来源 + 台账一致 → 不弹（这就是「每来源一次」的省下来的那一半）", () => {
    expect(
      decideTrust(
        entry({
          sourceName: "demo-owner/demo-repo",
          trusted: ["demo-owner/demo-repo"],
          installedFrom: { "demo-gizmo": "demo-owner/demo-repo" },
        }),
      ),
    ).toEqual({ prompt: false, reason: "trusted", remember: false });
  });

  it("首次（无台账无信任）→ 弹且记忆", () => {
    expect(decideTrust(entry({ sourceName: "demo-owner/demo-repo" }))).toEqual({
      prompt: true,
      reason: "first-time",
      remember: true,
    });
  });

  it("ⓐ 来源名缺失（条目无来源信息）→ 落「首次」弹卡——未知即未信任", () => {
    expect(decideTrust(entry({ sourceName: undefined })).prompt).toBe(true);
  });

  it("台账有旧来源但本轮无来源名 → 不误判「换来源」（保守落首次弹卡）", () => {
    const v = decideTrust(entry({ sourceName: undefined, installedFrom: { "demo-gizmo": "demo-owner/demo-old" } }));
    expect(v.reason).toBe("first-time");
  });
});

/* ═══ ② 读守卫 ═══ */

describe("读守卫（失败一律空表——ⓐ 未知即未信任）", () => {
  it("缺 configuration 面（老 preload / 预览面）→ 空表，不抛", async () => {
    expect(await readTrustedSources()).toEqual([]);
    expect(await readInstalledFrom()).toEqual({});
  });

  it("get 抛异常 → 空表，不抛", async () => {
    Object.defineProperty(window, "linkdesk", {
      value: {
        configuration: {
          get: vi.fn(async () => {
            throw new Error("ipc down");
          }),
        },
      },
      configurable: true,
    });
    expect(await readTrustedSources()).toEqual([]);
    expect(await readInstalledFrom()).toEqual({});
  });

  it("形状不对（信任表存了非数组 / 台账存了数组）→ 空表（不信脏数据）", async () => {
    stubConfiguration({ [TRUSTED_SOURCES_KEY]: "demo-owner/demo-repo", [INSTALLED_FROM_KEY]: ["demo-gizmo"] });
    expect(await readTrustedSources()).toEqual([]);
    expect(await readInstalledFrom()).toEqual({});
  });

  it("信任表过滤非串/空串项；台账过滤非串/空串值", async () => {
    stubConfiguration({
      [TRUSTED_SOURCES_KEY]: ["demo-owner/demo-repo", "", 7, null, "demo-owner/demo-other"],
      [INSTALLED_FROM_KEY]: { "demo-gizmo": "demo-owner/demo-repo", "demo-null": null, "": "x" },
    });
    expect(await readTrustedSources()).toEqual(["demo-owner/demo-repo", "demo-owner/demo-other"]);
    expect(await readInstalledFrom()).toEqual({ "demo-gizmo": "demo-owner/demo-repo" });
  });
});

/* ═══ ③ 写 + 串行化 ═══ */

describe("rememberSource / forgetSource（增删幂等）", () => {
  it("首个来源 → 写表；再次同源 → 幂等零写", async () => {
    const { set } = stubConfiguration();
    await rememberSource("demo-owner/demo-repo");
    expect(set).toHaveBeenCalledTimes(1);
    await rememberSource("demo-owner/demo-repo");
    expect(set).toHaveBeenCalledTimes(1); // 已在表内 → 不重复写
    expect(await readTrustedSources()).toEqual(["demo-owner/demo-repo"]);
  });

  it("空/缺来源名 → no-op 零写（无来源可记）", async () => {
    const { set } = stubConfiguration();
    await rememberSource(undefined);
    await rememberSource("   ");
    expect(set).not.toHaveBeenCalled();
  });

  it("撤销 → 移除该来源；不在表内 → no-op 零写（幂等）", async () => {
    stubConfiguration({ [TRUSTED_SOURCES_KEY]: ["demo-owner/demo-repo", "demo-owner/demo-other"] });
    await forgetSource("demo-owner/demo-repo");
    expect(await readTrustedSources()).toEqual(["demo-owner/demo-other"]);
    const { set } = stubConfiguration({ [TRUSTED_SOURCES_KEY]: ["demo-owner/demo-other"] });
    await forgetSource("demo-owner/never-trusted");
    expect(set).not.toHaveBeenCalled();
  });

  it("撤销只删目标——其余信任来源保留", async () => {
    stubConfiguration({
      [TRUSTED_SOURCES_KEY]: ["demo-a/one", "demo-b/two", "demo-c/three"],
    });
    await forgetSource("demo-b/two");
    expect(await readTrustedSources()).toEqual(["demo-a/one", "demo-c/three"]);
  });

  it("并发「读—改—写」不丢写（写串行化——连装多个来源的真实场景）", async () => {
    const { set } = stubConfiguration();
    await Promise.all([
      rememberSource("demo-a/one"),
      rememberSource("demo-b/two"),
      rememberSource("demo-c/three"),
    ]);
    expect(await readTrustedSources()).toEqual(["demo-a/one", "demo-b/two", "demo-c/three"]);
    expect(set).toHaveBeenCalledTimes(3);
  });

  it("并发增删同一来源交错 → 终态确定（串行化后按序落）", async () => {
    stubConfiguration({ [TRUSTED_SOURCES_KEY]: ["demo-a/one"] });
    await Promise.all([forgetSource("demo-a/one"), rememberSource("demo-a/one")]);
    expect(await readTrustedSources()).toEqual(["demo-a/one"]);
  });
});

describe("rememberInstalledFrom（台账——§五 J.2② 换来源判据）", () => {
  it("成功后记 id → 来源；同值幂等零写", async () => {
    const { set } = stubConfiguration();
    await rememberInstalledFrom("demo-gizmo", "demo-owner/demo-repo");
    expect(set).toHaveBeenCalledTimes(1);
    await rememberInstalledFrom("demo-gizmo", "demo-owner/demo-repo");
    expect(set).toHaveBeenCalledTimes(1);
    expect(await readInstalledFrom()).toEqual({ "demo-gizmo": "demo-owner/demo-repo" });
  });

  it("换来源 → 覆盖该 id（其余 id 台账保留）", async () => {
    stubConfiguration({ [INSTALLED_FROM_KEY]: { "demo-gizmo": "demo-owner/demo-old", "demo-other": "demo-x/y" } });
    await rememberInstalledFrom("demo-gizmo", "demo-owner/demo-new");
    expect(await readInstalledFrom()).toEqual({
      "demo-gizmo": "demo-owner/demo-new",
      "demo-other": "demo-x/y",
    });
  });

  it("缺 id / 缺来源名 → no-op 零写（无信息可记）", async () => {
    const { set } = stubConfiguration();
    await rememberInstalledFrom("", "demo-owner/demo-repo");
    await rememberInstalledFrom("demo-gizmo", undefined);
    expect(set).not.toHaveBeenCalled();
  });
});

/* ═══ 组合：trustDecisionFor（读表 + 台账 → 判定） ═══ */

describe("trustDecisionFor（读 IO 与纯判定的接线）", () => {
  it("官方源条目 → 不弹，即便配置面整个缺席", async () => {
    expect((await trustDecisionFor({ id: "demo-gizmo", official: true })).prompt).toBe(false);
  });

  it("已信任来源 + 台账一致 → 不弹", async () => {
    stubConfiguration({
      [TRUSTED_SOURCES_KEY]: ["demo-owner/demo-repo"],
      [INSTALLED_FROM_KEY]: { "demo-gizmo": "demo-owner/demo-repo" },
    });
    const v = await trustDecisionFor({
      id: "demo-gizmo",
      sourceName: "demo-owner/demo-repo",
      sourceUrl: "https://example.invalid/demo-owner/demo-repo",
    });
    expect(v).toEqual({ prompt: false, reason: "trusted", remember: false });
  });

  it("全新第三方来源 → 弹且记忆（确认后写表）", async () => {
    stubConfiguration();
    const v = await trustDecisionFor({
      id: "demo-gizmo",
      sourceName: "demo-owner/demo-repo",
      sourceUrl: "https://example.invalid/demo-owner/demo-repo",
    });
    expect(v).toEqual({ prompt: true, reason: "first-time", remember: true });
    await rememberSource("demo-owner/demo-repo");
    expect((await trustDecisionFor({
      id: "demo-gizmo",
      sourceName: "demo-owner/demo-repo",
      sourceUrl: "https://example.invalid/demo-owner/demo-repo",
    })).prompt).toBe(false); // 第二次同一来源不再问
  });
});
