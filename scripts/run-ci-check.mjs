#!/usr/bin/env node
/**
 * check:ci —— **CI 口径全链演练**（2026-10-06 立；v0.2.50 发版两跤换来的判据）。
 *
 * CI runner 上没有插件容器（`E:/linkdesk-plugins` 是本机邻居仓、与壳仓只是同盘邻居），
 * 门禁的判定宇宙与本地不同：v0.2.50 当日实证——R1/R3 例外账本的「过期例外」核对在
 * 容器缺席时假红（命中宇宙为空 ⇒ 任何例外都显得「一条没放行」，见各腿头注 judgeStale）。
 * ⇒ **本地全量绿 ≠ CI 绿**：打 tag 前必跑本件，把 CI 那一遍在本地先跑掉。
 *
 * 做法：把 `LINKDESK_PLUGIN_CONTAINER` 指到一个**保证不存在**的路径（`.git/check-ci/…`，
 * `.git` 在任何 clone 都在、其下该子目录没有 ⇒ 与 CI 的「容器缺席」同态），再原样跑
 * `npm run check`。本件只是 env 包装器——⛔ 故意不叫 `check-*.mjs`：它是跑法不是门禁，
 * 不进 `check-gate-health` 的域。
 *
 * 用法：
 *   npm run check:ci                      # 全链演练（时长 ≈ npm run check）
 *   node scripts/run-ci-check.mjs --probe # 只验证 env 注入路径生效，不跑链
 */

import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(join(fileURLToPath(import.meta.url), "..", ".."));
const FAKE_CONTAINER = join(ROOT, ".git", "check-ci", "empty-container");

if (process.argv.includes("--probe")) {
  const probe = spawnSync(
    process.execPath,
    ["-e", "console.log('probe LINKDESK_PLUGIN_CONTAINER =', process.env.LINKDESK_PLUGIN_CONTAINER)"],
    { env: { ...process.env, LINKDESK_PLUGIN_CONTAINER: FAKE_CONTAINER }, encoding: "utf8" },
  );
  process.stdout.write(probe.stdout);
  process.exit(probe.status ?? 1);
}

process.stdout.write(
  `[check:ci] CI 口径演练：LINKDESK_PLUGIN_CONTAINER=${FAKE_CONTAINER}（保证不存在 ⇒ 与 CI 同态）\n` +
    `[check:ci] 即「没有插件容器」的机器上跑整条 npm run check——打 tag 前必跑（发布清单 §一）。\n\n`,
);
const r = spawnSync("npm run check", {
  cwd: ROOT,
  env: { ...process.env, LINKDESK_PLUGIN_CONTAINER: FAKE_CONTAINER },
  stdio: "inherit",
  // Windows 上 npm 只能经 shell 启动（check-scaffold 同款；整条命令串＝固定字面量，无外部输入）
  shell: true,
});
process.exit(r.status ?? 1);
