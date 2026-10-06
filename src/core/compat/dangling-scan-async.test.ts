/**
 * E6#131——悬空名扫描后台化 + 缓存单测。
 *
 * 失效方向两头都是静默：worker/增量归并与同步口径不一致 ⇒ 兼容读数静默漂移（假"正常"或假"部分不适配"）；
 * 缓存失效语义错 ⇒ 永远在重扫（卡死回归）或版本更新后还读旧账（读数过期）。
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ARTIFACT_EXTS,
  createArtifactScanAccumulator,
  judgeDangling,
  scanInstalledPluginDir,
  walkFiles,
  HOST_CLASSES,
  HOST_KEYFRAMES,
} from "./dangling-scan.js";
import { normalizePath } from "../utils/path/pathUtils.js";
import { createCompatScanCache, type DanglingScanReading } from "./dangling-scan-async.js";

function fixtureDir(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "dangling-131-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content, "utf8");
  }
  return root;
}

describe("口径等价——worker 逐文件累加器 == 同步扫描（E6#131）", () => {
  it("同一目录两路结果逐字段一致（js 名站 / kf 引用 / 悬空判定）", () => {
    const dir = fixtureDir({
      "index.js": 'el.className = "ldk-badge ldk-missing-one"; el.classList.add("ldk-missing-two");',
      "views/x.js": "const q = document.querySelector('.ldk-badge');",
      "style.css": ".ldk-badge{} .editor-own{} @keyframes spin{} .x{animation: missing-kf 1s;}",
    });
    try {
      const sync = scanInstalledPluginDir(dir);
      // worker 的路径：逐文件喂累加器（同一份口径件）
      const acc = createArtifactScanAccumulator();
      for (const p of walkFiles(dir, ARTIFACT_EXTS)) {
        acc.scanFile({ name: normalizePath(p.slice(dir.length + 1)), text: readFileSync(p, "utf8") });
      }
      const judged = judgeDangling(acc.finish(), HOST_CLASSES, HOST_KEYFRAMES);
      expect(sync).not.toBeNull();
      expect(judged.dangling.map((d) => d.name).sort()).toEqual(sync!.dangling.map((d) => d.name).sort());
      expect(judged.ldkRefs).toBe(sync!.ldkRefs);
      expect(judged.dangling.map((d) => d.name).sort()).toContain("ldk-missing-one");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("缓存语义（E6#131）——同版本只扫一次 / 换版本重扫 / 落盘跨实例", () => {
  const dir = mkdtempSync(join(tmpdir(), "dangling-cache-"));
  const reading: DanglingScanReading = { dangling: [], ldkRefs: 3, uiImports: [], scanMs: 12 };

  it("同版本两次 get ⇒ worker 只跑一次；版本变 ⇒ 重扫", async () => {
    let spawnCount = 0;
    const cacheFile = join(dir, "cache.json");
    const cache = createCompatScanCache({
      cacheFile,
      spawnWorkerScan: async () => { spawnCount++; return { ...reading }; },
      syncFallback: () => null,
    });
    const r1 = await cache.get("demo-a", dir, "1.0.0");
    const r2 = await cache.get("demo-a", dir, "1.0.0");
    expect(spawnCount).toBe(1);
    expect(r1).toEqual(reading);
    expect(r2).toEqual(reading);
    await cache.get("demo-a", dir, "1.0.1");
    expect(spawnCount).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("worker 不可用 ⇒ 同步兜底一次并入账；账落盘 ⇒ 新实例零扫描（开机秒回）", async () => {
    const base = mkdtempSync(join(tmpdir(), "dangling-disk-"));
    try {
      const cacheFile = join(base, "compat-dangling-cache.json");
      let spawnCount = 0, fallbackCount = 0;
      const mk = () => createCompatScanCache({
        cacheFile,
        spawnWorkerScan: async () => { spawnCount++; return null; }, // 模拟 worker 起不来
        syncFallback: () => { fallbackCount++; return { dangling: [{ name: "ldk-x", via: "js-classname", file: "i.js", line: 1 }], ldkRefs: 1, uiImports: ["Badge"] }; },
      });
      const c1 = mk();
      const r = await c1.get("demo-b", join(base, "pkg"), "2.0.0");
      expect(r?.dangling[0]?.name).toBe("ldk-x");
      expect(r?.uiImports).toEqual(["Badge"]); // 同步兜底也要带 uiImports（G4 实际地板的输入）
      expect(fallbackCount).toBe(1);
      const c2 = mk(); // 新实例 = 重启后的壳
      await c2.get("demo-b", join(base, "pkg"), "2.0.0");
      expect(spawnCount).toBe(1);
      expect(fallbackCount).toBe(1); // 落盘账命中，零重扫
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("两路全失败 ⇒ 不缓存（下次重试），读数落 unknown 由 compute 端处理", async () => {
    const base = mkdtempSync(join(tmpdir(), "dangling-fail-"));
    try {
      let spawnCount = 0;
      const cache = createCompatScanCache({
        cacheFile: join(base, "cache.json"),
        spawnWorkerScan: async () => { spawnCount++; return null; },
        syncFallback: () => null,
      });
      await cache.get("demo-c", join(base, "pkg"), "1.0.0");
      await cache.get("demo-c", join(base, "pkg"), "1.0.0");
      expect(spawnCount).toBe(2);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });

  it("G4：旧账没有 uiImports ⇒ 作废重扫（⛔ 不把「没扫过 ui」当「没消费 ui」）", async () => {
    const base = mkdtempSync(join(tmpdir(), "dangling-g4-"));
    try {
      const cacheFile = join(base, "compat-dangling-cache.json");
      // G4 之前形状的落盘账（无 uiImports）——老版本壳写的
      writeFileSync(
        cacheFile,
        JSON.stringify({ "demo-old@1.0.0": { dangling: [], ldkRefs: 0, scanMs: 5 } }),
        "utf8",
      );
      let spawnCount = 0;
      const cache = createCompatScanCache({
        cacheFile,
        spawnWorkerScan: async () => { spawnCount++; return { dangling: [], ldkRefs: 0, uiImports: ["PluginCard"], scanMs: 6 }; },
        syncFallback: () => null,
      });
      const r = await cache.get("demo-old", join(base, "pkg"), "1.0.0");
      expect(spawnCount).toBe(1); // 旧账被作废，重扫了一次
      expect(r?.uiImports).toEqual(["PluginCard"]);
      const r2 = await cache.get("demo-old", join(base, "pkg"), "1.0.0");
      expect(spawnCount).toBe(1); // 新账（带 uiImports）正常命中，不反复重扫
      expect(r2?.uiImports).toEqual(["PluginCard"]);
    } finally {
      rmSync(base, { recursive: true, force: true });
    }
  });
});
