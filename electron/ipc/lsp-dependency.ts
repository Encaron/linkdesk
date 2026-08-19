/**
 * E5.8#24.6：LSP spawn 运行时依赖哨兵——纯函数（无 electron import，可直接 vitest）。
 *
 * 与 #24.7 构建期门禁（scripts/ 静态扫描 spawn 字符串引用）互补：
 *   - 本模块 = 运行期最后一道物理存在防线——spawn 前查依赖文件在不在（lsp-handlers.ts 调用）；
 *   - #24.7    = CI 期第一道防线——npm run check 静态扫描，删依赖即红。
 *
 * 背景（回归 #24）：pyright 被 knip 误删（spawn 字符串引用在 knip 静态图盲区）→ spawn ENOENT →
 * invoke 仍返 channelId → client.start() 挂死 → 跳转静默消失。本哨兵把「依赖不在」在 spawn 前
 * 就显性化（invoke reject → 渲染端 toast），杜绝静默链。
 */

import * as path from "path";
import { existsSync } from "fs";

/** spawn 引用的脚本/二进制扩展名白名单——哨兵只查这些（pyright-langserver.js 等） */
const LSP_BINARY_EXT = /\.(js|mjs|cjs|cmd|exe|bat)$/i;
/** 不需物理存在的 shell 内建命令——node 启动 .js LSP 脚本（python 插件 langDef.lsp.command="node"） */
const LSP_SHELL_BUILTINS = new Set(["node", "npm", "npx", "python", "python3", "py", "bash", "sh", "cmd", "powershell", "pwsh"]);

/**
 * 检查 LSP spawn 依赖物理存在性。
 * @param command       spawn 命令（"node" / 绝对路径 / PATH 二进制 / appRoot 相对脚本）
 * @param resolvedArgs  已 resolve 的 args（ASAR 处理后的 spawn 实参——相对路径在 dev 态保持原样）
 * @param appRoot       相对路径基准（主进程 app.getAppPath()；测试传临时目录）
 * @returns 缺失的二进制/脚本路径；null = 全部就位（或属 PATH 二进制同步无法验证）
 *
 * 检查两处：
 *   - args 中的脚本/二进制文件（node_modules/pyright/dist/pyright-langserver.js 等）——回归 #24 主战场；
 *   - command 是绝对路径或 appRoot 下相对脚本 → 必须存在；PATH 二进制（clangd 等）同步无法验证 →
 *     返回 null（交给 spawn error + 渲染端 initialize 超时兜底）。
 *
 * E6 联动：搬迁后 args 变绝对路径（{userData}/plugins/<id>/node_modules/）——path.isAbsolute 分支直接命中，
 * 换基准不换机制。
 */
export function checkLspDependency(command: string, resolvedArgs: string[], appRoot: string): string | null {
  // 1. args 中的脚本/二进制文件
  for (const arg of resolvedArgs) {
    if (!LSP_BINARY_EXT.test(arg)) continue;
    const abs = path.isAbsolute(arg) ? arg : path.resolve(appRoot, arg);
    if (!existsSync(abs)) return arg;
  }

  // 2. command 本体
  if (path.isAbsolute(command)) {
    if (!existsSync(command)) return command;
  } else if (!LSP_SHELL_BUILTINS.has(command)) {
    const abs = path.resolve(appRoot, command);
    if (existsSync(abs)) {
      // appRoot 下相对脚本——已存在 ✓
    } else {
      // 非内建 + 非 appRoot 相对文件 = PATH 二进制（clangd 等）——同步无法验证，交给 spawn error + 渲染超时兜底
      console.warn(`[lsp-dependency] command "${command}" 未在 appRoot 找到——按 PATH 二进制处理，spawn 失败由渲染端 initialize 超时兜底`);
    }
  }
  return null;
}
