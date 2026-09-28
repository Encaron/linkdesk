/**
 * 操作级错误的构造器——**一处定义**（`whitelist.ts` 与 `sensitive.ts` 共用）。
 *
 * 为什么要单独一个文件：`sensitive.ts`（敏感动作确认回路）需要把「用户没点头」做成带 code 的错误，
 * 而 `whitelist.ts` 又要 import 它（各操作都从这道门过）——把构造器留在 `whitelist.ts` 里就成**循环
 * import**。抽出来两个模块各取各的，谁也不回头。
 *
 * 本文件只有这一件事：`coded` 的形状（`Error` + `code` 字段）是内核对外错误契约的**唯一来源**，
 * 客户端（`cli/linkdeskctl/lib/bridge-client.mjs` 的错误分类表）认的就是它。
 */

/** 带 code 的操作错误——应答 `{ ok:false, code, message }` 里的 code 就是它。 */
export function coded(code: string, message: string): Error & { code: string } {
  const e = new Error(message) as Error & { code: string };
  e.code = code;
  return e;
}
