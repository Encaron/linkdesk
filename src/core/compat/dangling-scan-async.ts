/**
 * 悬空名扫描的**后台化 + 缓存层**（`E6#131` · 2026-09-19）。
 *
 * ── 病根（真机剖面实证，见清单 E6#131 行）──
 * 兼容读数（E6#117）曾把 `scanInstalledPluginDir` **同步**跑在主进程，且每次详情页打开都重扫：
 * 编辑器包 37.6MB ⇒ 主进程事件循环冻结 ~14s ⇒ 整窗幽灵卡死（灰窗＋转圈），详情页重挂载又
 * 重触发 ⇒ 卡死循环；标签持久化 ⇒ 每次开机都卡。
 *
 * ── 修法（两层，治根也治"第一次"）──
 * ① **worker 后台扫**：扫描挪进 `dangling-scan.worker.ts`（逐文件读、扫完即丢），主进程零阻塞；
 *    归并用 `createArtifactScanAccumulator()` 与同步入口同源，两路结果一致由构造保证。
 * ② **指纹缓存**：读数按 `插件id@版本` 记账（内存 + 落盘 `{userData}/compat-dangling-cache.json`）——
 *    同版本永远只扫一次；更新换版本 ⇒ 后台重扫一次。版本即钥匙的可靠性由既有门禁背书
 *    （内容变更必 bump 版本）。worker 不可用 ⇒ 同步兜底一次并入账（最坏 = 旧行为一次/版本）。
 *
 * ⚠️ 扫描失败（读不了盘）**不缓存**——下次再试；⛔ 不把"读数缺失"记成"读数为零"。
 */
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { DanglingName } from "./dangling-scan.js";
import { scanInstalledPluginDir } from "./dangling-scan.js";

/** 一次扫描的读数（缓存记账与 worker 回报共用同一形状） */
export interface DanglingScanReading {
  dangling: DanglingName[];
  ldkRefs: number;
  /** 本次扫描耗时（毫秒）——超 1s 打慢读数告警（性能护栏读数） */
  scanMs: number;
}

export interface CompatScanCacheDeps {
  /** 后台 worker 扫描（不可用/异常返 null）——注入以便单测不真开 worker */
  spawnWorkerScan: (dir: string) => Promise<DanglingScanReading | null>;
  /** 同步兜底（worker 不可用时的旧行为，一次/版本并入账） */
  syncFallback: (dir: string) => { dangling: DanglingName[]; ldkRefs: number } | null;
  /** 落盘账文件（{userData}/compat-dangling-cache.json） */
  cacheFile: string;
  readCacheFile?: (file: string) => string | null;
  writeCacheFile?: (file: string, data: string) => void;
}

export interface CompatScanCache {
  get: (pluginId: string, dir: string, version: string | null) => Promise<DanglingScanReading | null>;
  /** 测试/诊断面：当前内存账条数 */
  size: () => number;
}

export function createCompatScanCache(deps: CompatScanCacheDeps): CompatScanCache {
  const mem = new Map<string, DanglingScanReading | null>();
  const inflight = new Map<string, Promise<DanglingScanReading | null>>();
  const disk: Record<string, DanglingScanReading> = {};
  let diskLoaded = false;
  const readImpl = deps.readCacheFile ?? ((file: string) => { try { return readFileSync(file, "utf8"); } catch { return null; } });
  const writeImpl = deps.writeCacheFile ?? ((file: string, data: string) => { writeFileSync(file, data, "utf8"); });

  function loadDisk(): void {
    if (diskLoaded) return;
    diskLoaded = true;
    const raw = deps.readCacheFile ? deps.readCacheFile(deps.cacheFile) : readImpl(deps.cacheFile);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, DanglingScanReading>;
      for (const [k, v] of Object.entries(parsed)) {
        if (v && Array.isArray(v.dangling) && typeof v.scanMs === "number") disk[k] = v;
      }
    } catch { /* 账坏了 = 没有账，重扫重建（不猜） */ }
  }

  function persist(): void {
    try { writeImpl(deps.cacheFile, JSON.stringify(disk)); } catch { /* 落盘失败非致命——内存账仍在 */ }
  }

  async function get(pluginId: string, dir: string, version: string | null): Promise<DanglingScanReading | null> {
    let key = `${pluginId}@${version ?? ""}`;
    if (!version) {
      try { key = `${pluginId}@mtime:${statSync(dir).mtimeMs}`; } catch { return null; }
    }
    loadDisk();
    if (mem.has(key)) return mem.get(key)!;
    if (key in disk) {
      const v = disk[key];
      mem.set(key, v);
      return v;
    }
    const inflightP = inflight.get(key);
    if (inflightP) return inflightP;
    const p = (async (): Promise<DanglingScanReading | null> => {
      let r: DanglingScanReading | null = null;
      try { r = await deps.spawnWorkerScan(dir); } catch { r = null; }
      if (!r) {
        const t0 = Date.now();
        const s = deps.syncFallback(dir);
        r = s ? { ...s, scanMs: Date.now() - t0 } : null;
        if (r) console.warn(`[compat] 悬空名 worker 扫描不可用，已同步兜底（${r.scanMs}ms）——${pluginId}`);
      }
      if (r) {
        if (r.scanMs > 1000) console.warn(`[compat] 悬空名扫描偏慢（性能护栏读数）：${pluginId} ${r.scanMs}ms`);
        mem.set(key, r);
        disk[key] = r;
        persist();
      }
      return r;
    })();
    inflight.set(key, p);
    try {
      return await p;
    } finally {
      inflight.delete(key);
    }
  }

  return { get, size: () => mem.size };
}

/* ── 壳内单例（主进程专用） ── */

let singleton: CompatScanCache | null = null;
let singletonCacheFile = "";

/** 取壳内单例（cacheFile 首次传入后固定——handler 每次传同一 userData 路径） */
export function getCompatScanCache(cacheFile: string): CompatScanCache {
  if (singleton && singletonCacheFile === cacheFile) return singleton;
  singleton = createCompatScanCache({
    cacheFile,
    spawnWorkerScan: (dir) =>
      new Promise<DanglingScanReading | null>((resolve) => {
        let w: Worker;
        try {
          w = new Worker(join(__dirname, "dangling-scan.worker.js"));
        } catch {
          resolve(null); // worker 起不来（asar 路径等）⇒ 走同步兜底
          return;
        }
        const timer = setTimeout(() => { w.terminate(); resolve(null); }, 180_000); // 大包兜底超时（worker 里不堵主进程，超时只为了断尾巴）
        w.on("message", (r: DanglingScanReading | { error: string }) => {
          clearTimeout(timer);
          void w.terminate();
          resolve(r && !("error" in r) ? r : null);
        });
        w.on("error", () => { clearTimeout(timer); resolve(null); });
        w.postMessage({ dir });
      }),
    syncFallback: (dir) => scanInstalledPluginDir(dir),
  });
  singletonCacheFile = cacheFile;
  return singleton;
}
