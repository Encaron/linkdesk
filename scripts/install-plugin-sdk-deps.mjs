#!/usr/bin/env node
/**
 * E6#6c：postinstall 自动装 @linkdesk/plugin-sdk 的依赖。
 *
 * 🔥 布局事实：packages/** 是嵌套工程，根 `npm install` 不装它的依赖。但 check 链新增的
 * `tsc -p packages/plugin-sdk --noEmit`（#6c 门禁）需要 packages/plugin-sdk/node_modules
 * （file: 的 contracts + vite/ajv/jszip…）——fresh clone 后不装则 #6c 红。
 * → postinstall 守卫：存在 sdk package.json 才 `npm --prefix` 安装（自动装不靠文档要求装，
 *   对齐 scripts/install-lefthook.mjs 先例）。
 *
 * 容错边界：
 *   - 非零退出码诚实 fail（= 不静默吞依赖安装失败——sdk deps 缺失会让 #6c 红，早炸早见）。
 *   - CI 跳过（CI 自己装全量，不重复）。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") process.exit(0);

const __dirname = dirname(fileURLToPath(import.meta.url));
const sdkDir = resolve(__dirname, "..", "packages", "plugin-sdk");
if (!existsSync(resolve(sdkDir, "package.json"))) process.exit(0); // sdk 目录不存在——守卫容错，不阻断 npm install

// Windows：npm 是 .cmd shim——shell:true 由 cmd.exe 重新解析（对齐 install-lefthook 同款）。
// --prefix 只装 plugin-sdk 工程；--no-audit/--no-fund 对齐 lefthook 安装的无噪风格。
const args = ["--prefix", sdkDir, "install", "--no-audit", "--no-fund"];
const result =
  process.platform === "win32"
    ? spawnSync("npm", args, { stdio: "inherit", shell: true })
    : spawnSync("npm", args, { stdio: "inherit" });
if (result.status !== 0) {
  console.error(`❌ @linkdesk/plugin-sdk 依赖安装失败（npm --prefix ${sdkDir} install）——#6c 门禁将红。`);
  process.exit(result.status ?? 1);
}
process.exit(0);
