/**
 * 兼容读数状态算法单测（E6#117）——判据③/③b/⑤/⑥ 的机械面。
 *
 * 形状照格 1/格 2 的 `--self-test` 先例：正控（四类可判状态各一只桩）＋ 负控三条
 * （缺输入不崩 / 悬空读数缺失不许判 drifted / 未装插件照样出读数）。
 * fixture 一律虚构值（`demo-*`）；真产物层的口径对账由 dangling-scan.test.ts 承载。
 */
import { describe, expect, it } from "vitest";
import { computeCompatibilityReading, normalizeDay, type CompatHostContext } from "./compatibility.js";

const CTX = (over: Partial<CompatHostContext> = {}): CompatHostContext => ({
  shellVersion: "0.2.12",
  shellBuiltAtRaw: "2026-09-12T08:00:00.000Z",
  locatePluginDir: () => null,
  ...over,
});

/** 桩扫描：给目录定位返回指定悬空名（null ⇒ 模拟读不出） */
const scan = (names: string[] | null) => (_dir: string) =>
  names === null ? null : { dangling: names.map((name) => ({ name })) };

describe("normalizeDay（两个真日期比大小前的归一化）", () => {
  it("ISO 时间戳取日期段；占位/垃圾/空 ⇒ null", () => {
    expect(normalizeDay("2026-08-14T03:00:00.000Z")).toBe("2026-08-14");
    expect(normalizeDay("2026-09-12")).toBe("2026-09-12");
    expect(normalizeDay("—")).toBeNull();
    expect(normalizeDay("")).toBeNull();
    expect(normalizeDay(undefined)).toBeNull();
  });
});

describe("状态算法——四类可判状态（正控，判据③）", () => {
  it("incompatible：minAppVersion 高于当前壳（既有硬机制的读出）", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "9.9.9", publishedAt: "2026-01-01T00:00:00.000Z" },
      CTX({ locatePluginDir: () => "C:/demo/dir", scanDangling: scan([]) }),
    );
    expect(r.state).toBe("incompatible");
    expect(r.minAppSatisfied).toBe(false);
  });

  it("drifted：悬空 > 0（插件还在喊宿主已经没有的名字）", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.0", publishedAt: "2026-01-01T00:00:00.000Z" },
      CTX({ locatePluginDir: () => "C:/demo/dir", scanDangling: scan(["ldk-demo-ghost"]) }),
    );
    expect(r.state).toBe("drifted");
    expect(r.dangling).toEqual({ count: 1, names: ["ldk-demo-ghost"] });
  });

  it("current：悬空 0 ＋ minApp 满足 ＋ 发版日 ≥ 壳构建日", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.0", publishedAt: "2026-09-12T00:00:00.000Z" },
      CTX({ locatePluginDir: () => "C:/demo/dir", scanDangling: scan([]) }),
    );
    expect(r.state).toBe("current");
  });

  it("compatible：悬空 0 ＋ minApp 满足 ＋ 发版日 < 壳构建日", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.0", publishedAt: "2026-01-01T00:00:00.000Z" },
      CTX({ locatePluginDir: () => "C:/demo/dir", scanDangling: scan([]) }),
    );
    expect(r.state).toBe("compatible");
  });

  it("compatible（保守档）：任一日期缺失 ⇒ 落 compatible（dev 壳日期 '—' 同此），⛔ 不落 unknown", () => {
    const r1 = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.0", publishedAt: null },
      CTX({ locatePluginDir: () => "C:/demo/dir", scanDangling: scan([]) }),
    );
    expect(r1.state).toBe("compatible");
    const r2 = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.0", publishedAt: "2026-01-01T00:00:00.000Z" },
      CTX({ shellBuiltAtRaw: "—", locatePluginDir: () => "C:/demo/dir", scanDangling: scan([]) }),
    );
    expect(r2.state).toBe("compatible");
    expect(r2.shellBuiltAt).toBeNull();
  });
});

describe("状态算法——负控三条（判据⑥）", () => {
  it("负控 1：输入缺失（无 catalog / 无 minAppVersion）⇒ null 填项 ＋ unknown，不崩不误判", () => {
    const r = computeCompatibilityReading({ pluginId: "demo-plugin" }, CTX());
    expect(r.state).toBe("unknown"); // 未装 ⇒ 悬空读数拿不到
    expect(r.dangling).toBeNull();
    expect(r.minAppVersion).toBeNull();
    expect(r.minAppSatisfied).toBeNull();
    expect(r.lastUpdate).toBeNull();
    expect(r.unknown.length).toBeGreaterThan(0);
  });

  it("负控 2：悬空读数缺失 ⇒ unknown，⛔ 不因此变 drifted（缺数据 ≠ 有问题）", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.0", publishedAt: "2026-01-01T00:00:00.000Z" },
      CTX({ locatePluginDir: () => "C:/demo/missing-dir", scanDangling: () => null }),
    );
    expect(r.state).toBe("unknown");
    expect(r.dangling).toBeNull();
  });

  it("负控 3：插件未装（只有 catalog 条目）＋ minAppVersion 高于壳 ⇒ 照样出 incompatible 读数", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-uninstalled", minAppVersion: "99.0.0" },
      CTX(), // locatePluginDir 恒 null = 盘上没有
    );
    expect(r.state).toBe("incompatible");
    expect(r.dangling).toBeNull();
    expect(r.shellVersion).toBe("0.2.12");
  });
});

/**
 * G4（「插件最低壳版本门禁」）——实际地板：读数判据由「声明」扩为 max(声明, 实际)。
 * 账本读数（UI_SURFACE_LEDGER，scripts/ui-surface.json 的投影）：Badge/InlineInput = 0.2.13、
 * HintTip = 0.2.20、useStatusPolling = 0.2.40、PluginCard = 0.2.48。
 * type-only（负控 2）在本腿是结构性豁免：产物是编译后 JS，`import type` 不存在；
 * 产物层的形态采集正负控见 dangling-scan.test.ts 的 G4 组。
 */
describe("G4 读数腿——生效地板 = max(声明, 实际)", () => {
  /** 桩扫描：悬空名 ＋ ui 具名导入一把给 */
  const scanUi = (names: string[], uiImports: string[]) => (_dir: string) => ({
    dangling: names.map((name) => ({ name })),
    uiImports,
  });

  it("正控（本事故形状）：声明 0.2.32、产物导入 PluginCard（since 0.2.48）⇒ 0.2.41 判 incompatible，minAppVersion 是算出来的 0.2.48", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.32", publishedAt: "2026-01-01T00:00:00.000Z" },
      CTX({ shellVersion: "0.2.41", locatePluginDir: () => "C:/demo/dir", scanDangling: scanUi([], ["Badge", "PluginCard"]) }),
    );
    expect(r.state).toBe("incompatible");
    expect(r.minAppVersion).toBe("0.2.48"); // ⛔ 不是声明里那个 0.2.32——读数不再照抄 manifest
    expect(r.minAppSatisfied).toBe(false);
  });

  it("正控 b：四栏都查（hooks/helpers/types 一个面）——useStatusPolling 的 since 抬地板", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.32", publishedAt: "2026-01-01T00:00:00.000Z" },
      CTX({ shellVersion: "0.2.41", locatePluginDir: () => "C:/demo/dir", scanDangling: scanUi([], ["useStatusPolling"]) }),
    );
    expect(r.minAppVersion).toBe("0.2.40");
    expect(r.minAppSatisfied).toBe(true); // 0.2.41 ≥ 0.2.40
  });

  it("负控 1：完全不消费 @linkdesk/ui ⇒ 只看声明（零影响）", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.0", publishedAt: "2026-01-01T00:00:00.000Z" },
      CTX({ locatePluginDir: () => "C:/demo/dir", scanDangling: scanUi([], []) }),
    );
    expect(r.minAppVersion).toBe("0.2.0");
    expect(r.minAppSatisfied).toBe(true);
    expect(r.state).toBe("compatible");
  });

  it("负控 3：消费的全部导出 since ≤ 声明 ⇒ 维持声明（只抬不降，不是见 ui 就抬）", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.20", publishedAt: "2026-01-01T00:00:00.000Z" },
      CTX({ shellVersion: "0.2.20", locatePluginDir: () => "C:/demo/dir", scanDangling: scanUi([], ["Badge", "HintTip"]) }),
    );
    expect(r.minAppVersion).toBe("0.2.20"); // HintTip 0.2.20 == 声明，Badge 0.2.13 更低 ⇒ 不抬
    expect(r.minAppSatisfied).toBe(true);
  });

  it("负控 4：产物读不到（扫描 null）⇒ 退化成只有声明地板，⛔ 不判坏消息", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.0", publishedAt: "2026-01-01T00:00:00.000Z" },
      CTX({ locatePluginDir: () => "C:/demo/dir", scanDangling: () => null }),
    );
    expect(r.minAppVersion).toBe("0.2.0"); // 没有实际地板可加
    expect(r.minAppSatisfied).toBe(true);
    expect(r.unknown).not.toContain(expect.stringContaining("uiImport"));
  });

  it("负控 5：日期缺失仍落 compatible（⛔ 不落 unknown）——G4 抬地板不改变日期口径", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.20", publishedAt: null },
      CTX({ shellVersion: "0.2.20", locatePluginDir: () => "C:/demo/dir", scanDangling: scanUi([], ["Badge"]) }),
    );
    expect(r.state).toBe("compatible");
  });

  it("负控 6：壳版本 == 实际地板 ⇒ 满足（versionGte 边界，≤ 不算越界）", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.32", publishedAt: "2026-01-01T00:00:00.000Z" },
      CTX({ shellVersion: "0.2.48", locatePluginDir: () => "C:/demo/dir", scanDangling: scanUi([], ["PluginCard"]) }),
    );
    expect(r.minAppVersion).toBe("0.2.48");
    expect(r.minAppSatisfied).toBe(true);
    expect(r.state).toBe("compatible");
  });

  it("fail-closed：账本查不到的名字（本壳 vendor ui 没有的导出）⇒ 按不满足，⛔ 不许落「正常/兼容」", () => {
    const r = computeCompatibilityReading(
      { pluginId: "demo-plugin", minAppVersion: "0.2.13", publishedAt: "2026-01-01T00:00:00.000Z" },
      CTX({ shellVersion: "9.9.9", locatePluginDir: () => "C:/demo/dir", scanDangling: scanUi([], ["BrandFutureComponent"]) }),
    );
    expect(r.state).toBe("incompatible");
    expect(r.minAppSatisfied).toBe(false);
    expect(r.unknown).toContain("uiImport:notInLedger:BrandFutureComponent");
  });
});
