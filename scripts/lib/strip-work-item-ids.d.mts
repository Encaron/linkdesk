/**
 * `strip-work-item-ids.mjs` 的类型声明。
 *
 * 为什么要有这个文件：`scripts/` 不在 `tsconfig.json` 的 `include`（只有 `src`）里，
 * 而 `src/` 下的消费者（`src/core/commands/aiManualIndex.test.ts`，手册生成区）需要 import 这个
 * 共享剥离器——`moduleResolution: bundler` 下 `.mjs` 没有声明文件就是 TS7016。
 * ⛔ 本文件只声明形状，**不含任何判定逻辑**（判定只此一份，在 `strip-work-item-ids.mjs` 里）。
 */
export const WORK_ITEM_RE: RegExp;
export function stripWorkItemIdsInLine(line: string): string;
export function stripWorkItemIds(
  text: string,
  opts?: { onlyCommentLines?: boolean },
): { text: string; hits: number };
