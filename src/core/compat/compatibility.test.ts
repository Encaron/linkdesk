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
