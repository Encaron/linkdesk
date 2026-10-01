import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 仓根（`scripts/runtime-style-audit/*` ⇒ 上两级）。
 * 拆自 `../runtime-style-audit.mjs`（E6#0.6d 第一刀 · feature-folder）——⛔ 子模块共享这一份，
 * 别再各算一次（一把尺子一份实现）。
 */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
