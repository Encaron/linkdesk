#!/usr/bin/env node
/**
 * E5.8#3：postinstall 自动装 lefthook——对标 dsh `scripts/install-lefthook.mjs`（自动装不靠文档要求装）。
 * dsh 版为多 worktree monorepo 做 worktree-local hooks + 所有权标记 + 安装锁；
 * linkdesk 单 repo 单 worktree——只需 `lefthook install`，保留 dsh 两点：CI 跳过 + `--force` 幂等覆盖。
 *
 * 🔥 monorepo 布局关键（本仓库）：git root = 仓库根（E:/linkdesk），package.json 在 linkdesk/ 子目录。
 * lefthook 固定从 git root 加载 lefthook.yml——所以：
 *   1) install 必须带 LEFTHOOK_CONFIG=linkdesk/lefthook.yml，否则会在 git root 生成一份全注释默认模板，
 *      且按模板（无 pre-commit/pre-push 阶段）只装 prepare-commit-msg 一个 hook。
 *   2) git 触发 hook 时 lefthook 进程不携带该 env——必须把 export 注入到生成的 hook 脚本里（幂等补丁），
 *      否则 git commit/push 时 lefthook 读到 git root 的空配置，jobs 静默不跑。
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// CI 不装——CI 自己跑门禁，不依赖本地 hook
if (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true") process.exit(0);

const root = process.cwd();
const bin = join(root, "node_modules", ".bin", process.platform === "win32" ? "lefthook.cmd" : "lefthook");
if (!existsSync(bin)) process.exit(0); // lefthook 未安装（如 --no-dev）——postinstall 容错，不阻断 npm install

// git root（package.json 目录的 .git 归属地）——用 git 问，不假设 `..`
const gitRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8" });
if (gitRoot.status !== 0) process.exit(0); // 不在 git repo（如 npm 包被复制出去）——不装 hook
const repoRoot = gitRoot.stdout.trim().replace(/\\/g, "/");

// 相对 git root 的真实配置路径
const configRel = "linkdesk/lefthook.yml";
const env = { ...process.env, LEFTHOOK_CONFIG: configRel };

// Windows：Node 拒绝直接 spawn .cmd shim——引号路径 + shell:true 由 cmd.exe 重新解析（dsh runLefthook 同款）
const result =
  process.platform === "win32"
    ? spawnSync(`"${bin}"`, ["install", "--force"], { stdio: "inherit", shell: true, env })
    : spawnSync(bin, ["install", "--force"], { stdio: "inherit", env });
if (result.status !== 0) process.exit(result.status ?? 1);

// hook 脚本补丁：把 LEFTHOOK_CONFIG export 注入 lefthook 生成的每个 hook（幂等——已有标记则跳过）。
// 必须注入在 `call_lefthook` 调用之前（hook 脚本顶层即可，call_lefthook 内部 fork 的 lefthook 进程继承 env）。
const injection = [
  "",
  "# E5.8#3 monorepo 补丁：git root=仓库根、项目在 linkdesk/——lefthook 从 git root 找配置，必须指到真实配置",
  "# （真实配置与 package.json 同目录：linkdesk/lefthook.yml；lefthook 相对 git root 解析本值）",
  'export LEFTHOOK_CONFIG="linkdesk/lefthook.yml"',
  "",
].join("\n");

let patched = 0;
for (const hook of ["pre-commit", "prepare-commit-msg", "pre-push"]) {
  const file = join(repoRoot, ".git", "hooks", hook);
  if (!existsSync(file)) continue;
  const content = readFileSync(file, "utf8");
  if (content.includes("LEFTHOOK_CONFIG")) continue; // 幂等：已注入过则跳过
  writeFileSync(file, content.replace("#!/bin/sh\n", `#!/bin/sh\n${injection}\n`));
  patched++;
}
console.log(`sync hooks: ✔️ (LEFTHOOK_CONFIG injected into ${patched} hook file(s))`);
process.exit(0);
