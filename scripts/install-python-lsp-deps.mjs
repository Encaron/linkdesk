#!/usr/bin/env node
/**
 * E6#15e：postinstall 自动装 python 插件的 LSP 运行时依赖（pyright）。
 *
 * 🔥 布局事实：plugins/* 是嵌套工程，根 `npm install` 不装它的依赖。但 #15e 后 pyright 随 python
 * 插件自走——落 plugins/python/node_modules（打包器按 plugin.json langDefs.lsp.args 引用把
 * node_modules/pyright 拷进 .linkdesk-plugin zip，见 packages/plugin-sdk/src/vite-config.ts
 * includeLspRuntimePackages）。同时壳侧 pyright 已删（根 devDep + electron-builder extraResources 双删），
 * check 链 `check-lsp-deps.mjs` 以「每插件 plugin.json 所在目录」为基准 existsSync 校验 pyright 物理存在
 * （E5.8#24 回归防复发哨兵）——fresh clone 后不装则 npm run check 红。
 * → postinstall 守卫：存在 python package.json 才 `npm --prefix` 安装（自动装不靠文档要求装，
 *   对齐 scripts/install-plugin-sdk-deps.mjs 先例）。
 *
 * 容错边界：
 *   - 非零退出码诚实 fail（= 不静默吞依赖安装失败——pyright 缺失会让 check-lsp-deps 红，早炸早见）。
 *   - CI 跳过（CI 自己装全量，不重复）。
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") process.exit(0);

const __dirname = dirname(fileURLToPath(import.meta.url));
const pyDir = resolve(__dirname, "..", "plugins", "python");
if (!existsSync(resolve(pyDir, "package.json"))) process.exit(0); // python 插件目录不存在——守卫容错，不阻断 npm install

// Windows：npm 是 .cmd shim——shell:true 由 cmd.exe 重新解析（对齐 install-plugin-sdk-deps 同款）。
// --prefix 只装 python 插件工程；--no-audit/--no-fund 对齐无噪风格。幂等：已装且 lockfile 未动时 npm 快速空跑。
const args = ["--prefix", pyDir, "install", "--no-audit", "--no-fund"];
const result =
  process.platform === "win32"
    ? spawnSync("npm", args, { stdio: "inherit", shell: true })
    : spawnSync("npm", args, { stdio: "inherit" });
if (result.status !== 0) {
  console.error(`❌ python 插件 pyright 依赖安装失败（npm --prefix ${pyDir} install）——check-lsp-deps 将红。`);
  process.exit(result.status ?? 1);
}
process.exit(0);
