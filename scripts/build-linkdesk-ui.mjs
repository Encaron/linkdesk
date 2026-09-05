#!/usr/bin/env node
/**
 * E6#54c：postinstall 自动构建 @linkdesk/ui 的 dist。
 *
 * 🔥 事实：54c 起内置插件 import @linkdesk/ui → node_modules symlink → packages/linkdesk-ui/dist。
 *   dist 是 gitignored 构建产物——fresh clone 后 dist 不存在，dev/build 立即炸
 *   （"Failed to resolve import @linkdesk/ui"）。→ postinstall 守卫重建（对齐
 *   scripts/install-plugin-sdk-deps.mjs 先例：CI 跳过 + 存在性守卫）。
 *
 * 何时重建（gated，省重复 npm install 的秒级成本）：
 *   - dist/index.js 不存在（fresh clone / 手动清了 dist）
 *   - 单一源码（src/components/shared + 包 barrel）有文件比 dist/index.js 新——
 *     改共享组件后没手动 rebuild，shell 构建要用到的最新源码需进 dist。
 *
 * 容错：构建失败诚实 fail（dist 缺失会让 54c 后 dev/build/check 红，早炸早见）。
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") process.exit(0);

const HERE = dirname(fileURLToPath(import.meta.url)); // scripts/
const ROOT = resolve(HERE, "..");
const UI_PKG = resolve(ROOT, "packages", "linkdesk-ui");
const DIST_JS = resolve(UI_PKG, "dist", "index.js");
const buildScript = resolve(UI_PKG, "scripts", "build.mjs");

// UI 包目录不存在（未 clone 完整 / 未来可能移除）——守卫容错，不阻断 npm install
if (!existsSync(buildScript)) process.exit(0);

/** 递归找目录内最新 mtime（相对 ROOT 的绝对目录） */
function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = newestMtime(p);
      if (sub > newest) newest = sub;
    } else if (entry.isFile()) {
      const t = statSync(p).mtimeMs;
      if (t > newest) newest = t;
    }
  }
  return newest;
}

// 重建判据：dist 缺失 或 源码/barrel 比 dist 新
const needsBuild = !existsSync(DIST_JS) ||
  newestMtime(resolve(ROOT, "src/components/shared")) > statSync(DIST_JS).mtimeMs ||
  newestMtime(resolve(UI_PKG, "src")) > statSync(DIST_JS).mtimeMs;

if (!needsBuild) process.exit(0);

// node 是 .exe 非 .cmd shim——无需 shell:true（shell 会乱 array args 引号）；argv 直传
const result = spawnSync(process.execPath, [buildScript], { stdio: "inherit" });
if (result.status !== 0) {
  console.error(`❌ @linkdesk/ui dist 构建失败（${buildScript}）——54c 后 dev/build/check 将红。`);
  process.exit(result.status ?? 1);
}
process.exit(0);
