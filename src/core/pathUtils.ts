/**
 * 路径归一化工具——正反斜杠的唯一正源。
 *
 * Windows: main 进程 (Node.js) 返回反斜杠 `E:\linkdesk\src`，
 * renderer 进程 (Chromium Web APIs) 期望正斜杠 `E:/linkdesk/src`。
 * 所有跨 IPC 边界的路径、文件系统返回的路径，必须经过此函数归一化。
 *
 * 🔥 禁止手写 `replace(/\\/g, "/")` —— ESLint 规则 `no-raw-path-replace` 拦截。
 * 必须 import { normalizePath } from "@src/core/pathUtils"。
 */

/** 反斜杠 → 正斜杠。幂等——已归一化的路径调用不产生副作用。 */
export function normalizePath(fullPath: string): string {
  return fullPath.replace(/\\/g, "/");
}
