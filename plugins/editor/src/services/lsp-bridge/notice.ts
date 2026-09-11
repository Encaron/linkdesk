/**
 * 「现在点跳转也没用」的一次性发言权（E6#73m K4，E6#87c 拆自 lsp-bridge.ts）。
 *
 * 拆出去的动机是**它只读不写容器**——判据全在 registry，本文件只负责「该不该出声」。
 */
import { type LspState, claimBlockedNotice, getLspState } from "./registry";

/**
 * 取一次发言权——返回要说的那一档，或 null（不该出声 / 本轮已说过）。
 * 只有 `starting` / `failed` 该出声：`ready` 时走的是正常跳转，`undefined` 是这个语言本来就没 LSP。
 */
export function takeBlockedNotice(languageId: string): LspState | null {
  const st = getLspState(languageId);
  if (st !== "starting" && st !== "failed") return null;
  if (!claimBlockedNotice(languageId)) return null;
  return st;
}
