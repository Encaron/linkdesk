#!/usr/bin/env node
/**
 * 刷新《AI 操作手册》的机器生成区——M3 `AI#11` 的**落盘腿**（用法：`npm run manual:build`）。
 *
 * 为什么只是一层薄壳（真正生成 + 校验的判据全在 `src/core/commands/aiManualIndex.test.ts` 头）：
 *   命令元数据的唯一真源 = 壳命令注册表，它经 `import.meta.glob` 接进 Vite 图 ⇒ **纯 node 加载不了**
 *   （实测 `(intermediate value).glob is not a function`）。所以生成只能跑在 vitest 里——
 *   本脚本的全部职责 = 「起 vitest ＋ 置 `AI_MANUAL_WRITE=1`」，跨平台（不靠 shell 的环境变量语法，
 *   `AI_MANUAL_WRITE=1 cmd` 在 cmd/PowerShell 下写法不同且会失败）。
 *
 * 退出码：vitest 的退出码原样透传（非 0 = 生成失败，**不是**生成成功但内容不变）。
 */

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VITEST = resolve(ROOT, "node_modules", "vitest", "vitest.mjs");
const SPEC = "src/core/commands/aiManualIndex.test.ts";

const r = spawnSync(process.execPath, [VITEST, "run", SPEC], {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, AI_MANUAL_WRITE: "1" },
});

if (r.error) {
  console.error(`❌ 起 vitest 失败：${r.error.message}`);
  process.exit(1);
}
process.exit(r.status ?? 1);
