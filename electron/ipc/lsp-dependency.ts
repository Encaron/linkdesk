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
 *
 * E6#15k：args 注册处已绝对化，spawn 侧纯透传绝对 args（E5#114d ASAR 搬运安全网已删）。本函数的
 * baseDir 只作「非绝对参数」的回退基准——主进程传 = 该语言插件根（lsp.args 以插件根目录为基准解析
 * 的同一 pluginDir，见 lsp-handlers.lspSpawnDirFor）。绝对 args 命中 path.isAbsolute 直接查，不碰基准。
 */

import * as path from "path";
import { existsSync } from "fs";

/** spawn 引用的脚本/二进制扩展名白名单——哨兵只查这些（pyright-langserver.js 等） */
const LSP_BINARY_EXT = /\.(js|mjs|cjs|cmd|exe|bat)$/i;
/** 不需物理存在的 shell 内建命令——node 启动 .js LSP 脚本（python 插件 langDef.lsp.command="node"） */
const LSP_SHELL_BUILTINS = new Set(["node", "npm", "npx", "python", "python3", "py", "bash", "sh", "cmd", "powershell", "pwsh"]);

/**
 * 检查 LSP spawn 依赖物理存在性。
 * @param command       spawn 命令（"node" / 绝对路径 / PATH 二进制 / baseDir 相对脚本）
 * @param resolvedArgs  已绝对化的 spawn 实参（注册处换算，见 lsp-arg-resolve.ts；纯透传无 ASAR 处理）
 * @param baseDir       非绝对参数的回退基准（主进程 = 语言插件根 pluginDir；测试传临时目录）
 * @returns 缺失的二进制/脚本路径；null = 全部就位（或属 PATH 二进制同步无法验证）
 *
 * 检查两处：
 *   - args 中的脚本/二进制文件（node_modules/pyright/dist/pyright-langserver.js 等）——回归 #24 主战场；
 *   - command 是绝对路径或 baseDir 下相对脚本 → 必须存在；PATH 二进制（clangd 等）同步无法验证 →
 *     返回 null（交给 spawn error + 渲染端 initialize 超时兜底）。
 */
export function checkLspDependency(command: string, resolvedArgs: string[], baseDir: string): string | null {
  // 1. args 中的脚本/二进制文件
  for (const arg of resolvedArgs) {
    if (!LSP_BINARY_EXT.test(arg)) continue;
    const abs = path.isAbsolute(arg) ? arg : path.resolve(baseDir, arg);
    if (!existsSync(abs)) return arg;
  }

  // 2. command 本体
  if (path.isAbsolute(command)) {
    if (!existsSync(command)) return command;
  } else if (!LSP_SHELL_BUILTINS.has(command)) {
    const abs = path.resolve(baseDir, command);
    if (existsSync(abs)) {
      // baseDir 下相对脚本——已存在 ✓
    } else {
      // 非内建 + 非 baseDir 相对文件 = PATH 二进制（clangd 等）——同步无法验证，交给 spawn error + 渲染超时兜底
      console.warn(`[lsp-dependency] command "${command}" 未在 baseDir 找到——按 PATH 二进制处理，spawn 失败由渲染端 initialize 超时兜底`);
    }
  }
  return null;
}
