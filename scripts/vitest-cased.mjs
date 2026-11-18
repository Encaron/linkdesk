/**
 * vitest 启动包装——盘符大小写归一（2026-11-18 实测钉案）。
 *
 * 病灶：Windows 上若 cwd 盘符为**小写**（如 AI 工具会话的 `e:\linkdesk`），Node ESM 会把
 * `E:/…/@vitest/runner/…` 与 `e:/…/@vitest/runner/…` 视为**两个模块**——worker 引导把 runner
 * 状态注入大写实例，测试文件经 vite-node 解析到小写实例 ⇒ `describe` 读 `runner.config` 抛
 * 「Cannot read properties of undefined (reading 'config')」⇒ 全部测试文件收集失败。
 * 同理风险面：任何「worker native 导入链」与「vite-node 解析链」盘符大小写不一致的场景。
 *
 * 修法：入口与 cwd 双双归一成**大写盘符**再拉起 vitest（实测大写 cwd ＝绿）。
 * 用法：`node scripts/vitest-cased.mjs run <其余参数原样透传>`（npm run check 的 vitest 腿走这里）。
 */
import { spawn } from "node:child_process";
import path from "node:path";

const up = (p) => p.replace(/^(.):/, (m, d) => d.toUpperCase() + ":");
const cwdUp = up(process.cwd());
const entryUp = up(path.resolve(cwdUp, "node_modules/vitest/vitest.mjs"));


const child = spawn(process.execPath, [entryUp, ...process.argv.slice(2)], {
  cwd: cwdUp,
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
