/**
 * 提权回路——AI 唯一能「请求升档」的通道：**只问，不答**（批准权永远在用户手里）。
 *
 * 规格：`01-设计/02-执行闸与防自提权.md` §四
 *
 * 流程：
 *   1. AI 调 `requestElevation` → 主进程弹**提权请求框**（复用 `askUser` 的唯一弹框出口）；
 *   2. 框内写清：当前档 → 目标档、原因、将获得什么、「批准后常驻，直到你在设置里关掉」（D2）；
 *   3. 用户点「允许」→ **由这里**（主进程 handler）经壳命令 `aiPolicy.setMode` 写档位
 *      （`source:"user"` / `via:"elevation"`）；⛔ AI 没有任何「批准」op 可调；
 *   4. 用户点「暂不」→ `{ granted:false, code:EUSERDENIED }`，档位不变；
 *   5. 无人应答 → `ESHELLTIMEOUT` 上抛（没点头 = 不做）。
 *
 * 边界：⛔ 本模块不写 settings.json（写点只有壳侧 `aiPolicy.setMode` 一处）；
 *       ⛔ 不接受「降档」请求（降档不需要 AI 请求——用户随时能改）。
 */

import { IPC } from "../../../ipc/channels.js";
import { coded } from "../errors.js";
import { askUser, ASK_TIMEOUT_MS, USER_DENIED, type AskContext } from "../sensitive.js";
import { isPolicyMode, modeRank, POLICY_MODE_LABEL, type PolicyMode } from "./modes.js";
import { getPolicySnapshot } from "./policyState.js";

/**
 * 批准后写档位用的壳命令 id。
 * 🔴 这条命令标 `userOnly: true`（AI 正门够不着）；这里能调是因为**调用方是用户点「允许」的
 *    handler**，不是 AI 的 `exec`——这正是「批准动作不经命令面」的落地形态。
 */
export const POLICY_SET_MODE_COMMAND = "aiPolicy.setMode";

export interface ElevationRequest {
  mode: unknown;
  reason: unknown;
  /** 预留：命令/风险级范围（本批不实现，形状先留） */
  scope?: unknown;
}

export interface ElevationResult {
  granted: boolean;
  /** 批准后的目标档（拒绝时缺省） */
  mode?: PolicyMode;
  /** 拒绝时的机读 code（`EUSERDENIED`）；超时走 `ESHELLTIMEOUT` 上抛，不在此返回 */
  code?: string;
}

/** 提权框正文（纯函数——单测直接打，不必起对话框） */
export function elevationPrompt(
  current: PolicyMode,
  target: PolicyMode,
  reason: string,
): string {
  const grant =
    target === "full"
      ? "允许后，AI 的所有操作都不再询问，直到你在设置里改回来。"
      : target === "auto"
        ? "允许后，AI 可以自己完成日常修改；装更新、删数据这类操作仍会先问你。"
        : "允许后，AI 会在每一步修改前先问你。";
  return [
    `AI 想从「${POLICY_MODE_LABEL[current]}」升到「${POLICY_MODE_LABEL[target]}」。`,
    `原因：${reason}`,
    "",
    grant,
    "这个设置会一直有效，直到你在设置里改回来。",
  ].join("\n");
}

/**
 * 请求提权（op `requestElevation` 的实现）。
 *
 * ⚠️ 本流程**不受 `decide` 约束**：它不改状态、只弹框问人；若按 R3 走 `read` 档会被直接拒，
 *    AI 就永远没有「说明理由并请求」的路（错误码 `EPOLICYDENIED` 的文案正是引导它来这）。
 *    真正的闸 = 用户点不点「允许」。
 */
export async function requestElevationFlow(
  ctx: AskContext,
  req: ElevationRequest,
): Promise<ElevationResult> {
  const target = req.mode;
  if (!isPolicyMode(target)) {
    throw coded("EARGS", "requestElevation 需要 mode（read|ask|auto|full）");
  }
  const reason = typeof req.reason === "string" ? req.reason.trim() : "";
  if (!reason) throw coded("EARGS", "requestElevation 需要 reason（为什么需要更高权限——这句话会显示给用户）");

  const snapshot = getPolicySnapshot();
  const current: PolicyMode = snapshot.mode;
  if (modeRank(target) < modeRank(current)) {
    throw coded("EARGS", `只能请求提高权限：当前「${POLICY_MODE_LABEL[current]}」，请求的「${POLICY_MODE_LABEL[target]}」更低`);
  }
  if (target === current) return { granted: true, mode: current };

  try {
    await askUser(ctx, "提高权限", elevationPrompt(current, target, reason));
    if (target === "full") {
      // D8：升到完全访问 = 二次确认（第一次说明后果，第二次确认常驻事实）
      await askUser(ctx, "确认开启完全访问", "确认后 AI 的所有操作都不再询问，直到你在设置里改回来。确定开启吗？");
    }
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === USER_DENIED) return { granted: false, code: USER_DENIED };
    throw e; // ESHELLTIMEOUT 等：如实上抛（没点头 = 没发生）
  }

  // 批准 = 写档位（用户动作；⛔ 不经 AI 可调的命令面）
  await ctx.shellRequest(
    IPC.commands.execute,
    [POLICY_SET_MODE_COMMAND, undefined, target, { via: "elevation", source: "user" }],
    ASK_TIMEOUT_MS,
  );
  return { granted: true, mode: target };
}
