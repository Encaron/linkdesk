/**
 * 悬空名扫描的**后台 worker 入口**（`E6#131` · 2026-09-19）。
 *
 * 为什么存在：兼容读数（E6#117）要扫已装插件的**全部产物源码**，编辑器这类大包 37.6MB 能扫
 * 十几秒——同步跑在主进程 = 整窗幽灵卡死（实测见清单 E6#131 行）。本 worker 把扫描挪出主线程：
 * **逐文件**读、扫完即丢文本（几百 MB 的包内存也只留派生小集），归并用
 * `createArtifactScanAccumulator()`——与同步入口**同一份口径**，两路结果一致由构造保证。
 *
 * 协议：收 `{ dir }` → 回 `{ dangling, ldkRefs, scanMs }` 或 `{ error }`。
 * 只读、无副作用；单文件读不动 ⇒ 整体 error（与同步口径「读数缺失不猜」一致）。
 */
import { parentPort } from "node:worker_threads";
import { readFileSync } from "node:fs";
import { normalizePath } from "../utils/path/pathUtils.js";
import { ARTIFACT_EXTS, createArtifactScanAccumulator, judgeDangling, HOST_CLASSES, HOST_KEYFRAMES, walkFiles } from "./dangling-scan.js";

if (parentPort) {
  parentPort.on("message", (msg: { dir?: string }) => {
    const dir = msg?.dir;
    if (typeof dir !== "string" || !dir) {
      parentPort!.postMessage({ error: "missing dir" });
      return;
    }
    const t0 = Date.now();
    try {
      const files = walkFiles(dir, ARTIFACT_EXTS);
      const acc = createArtifactScanAccumulator();
      for (const p of files) {
        // 逐文件读、扫完即丢——内存只留派生小集（大包友好）
        acc.scanFile({ name: normalizePath(p.slice(dir.length + 1)), text: readFileSync(p, "utf8") });
      }
      const judged = judgeDangling(acc.finish(), HOST_CLASSES, HOST_KEYFRAMES);
      parentPort!.postMessage({ dangling: judged.dangling, ldkRefs: judged.ldkRefs, scanMs: Date.now() - t0 });
    } catch (e) {
      parentPort!.postMessage({ error: e instanceof Error ? e.message : String(e) });
    }
  });
}
