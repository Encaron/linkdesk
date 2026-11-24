/**
 * 敏感动作统一确认回路（M4 `AI#29`）——「AI 能发起，但**敏感动作要用户点头**」的**一道门**。
 *
 * 判据（出处：`docs/04-软件更新/已落地/AI友好化-全自动操作/AI-执行清单.md` `AI#29`）
 *
 *   「把『AI 能发起、但敏感动作要用户点头』落成**一致机制**」＋既有先例 =「**装 = 问一声**」
 *   （[01-设计.md §八 追问场景②]：装插件 = 运行陌生代码 ⇒ AI 可发起、用户点头才落地）。
 *
 * 🔴 本文件只负责**问**（`askUser`）；**哪些动作要问**归 `policy/risk.ts` 的 R3 登记，
 *   **要不要放行**归 `policy/decide.ts`。三道口以前是两张静态名单（`ASK_FIRST_*`），
 *   现已并入风险表——⛔ 不要再建第二份名单（判红见 `scripts/check-ai-policy.mjs` P1）。
 *
 * ## ⛔ 三条边界（越了这道门就白修）
 *
 *   ① **确认面归用户**：本模块**只问、不答**；AI 通道的操作表里**没有任何应答操作**
 *      （负控在 `sensitive.test.ts`）——否则 AI 自己点同意，这道门就是装饰。
 *      用户侧的答复路径**不是唯一鼠标路径**：确认框是池 `DialogHost`，**Enter = 确认 / Esc = 取消**
 *      （`src/pool/floating/dialog/DialogHost.tsx`），键盘全程够得着。
 *   ② **没点头 = 不做，且报出来**：未确认抛 `EUSERDENIED`（⛔ **不是** `ok:true` + `{installed:false}`
 *      这类「账面无错、实际没做」的形状——那正是会话 8 记下的瑕疵：客户端会把「没装」当「装好了」）。
 *   ③ **拿不到答复也算没点头**（fail-closed）：壳无应答 ⇒ `ESHELLTIMEOUT` 上抛，动作**不执行**。
 *
 * ## 客户端的配套（⛔ 少一样都不成立）
 *
 *   「等用户点头」以**分钟**计，而 CLI/MCP 的默认超时是**秒**级 ⇒ 若客户端先超时，AI 会以为
 *   「失败」、用户随后一点头动作又真的执行了（**最坏的形态**：口头失败、实际发生）。
 *   故 `exec`/`install`/`notifyAction` 三条在 CLI/MCP 侧都给「等点头」的预算（见各自实现）。
 */

import { IPC } from '../../ipc/channels.js';
import { coded } from './errors.js';
import type { DialogI18nText } from '../../../src/core/types/ipc/dialogs';
import type { AiConfirmCardPayload } from '../../../src/core/types/ipc/aiConfirm';

/** 内核侧等用户点头的预算——人可能在走开，10 分钟不算长 */
export const ASK_TIMEOUT_MS = 600_000;

/** 未点头的机读 code（客户端按 code 分类；⛔ 不是 EERROR，更不是成功） */
export const USER_DENIED = 'EUSERDENIED';

/**
 * 确认框正文——**只给 i18n key 与参数**（⛔ 不在这里拼成品句子）。
 * 主进程没有 i18n 实例；成品中文句会让英文界面整段中文，且静态审计看不见（根本没走 t()）。
 * 渲染侧 `IpcBridgeHandler/ui.ts` 的 `resolveDialogText` 负责翻译——「谁能翻译，谁拼句子」。
 * 纯函数：自测直接打它，不必起对话框。
 */
export function confirmPrompt(what: string, subject: string): DialogI18nText {
  return {
    key: 'AI 请求{{what}}：\n{{subject}}\n\n允许吗？（不点 = 不执行）',
    params: { what, subject },
    // what 是动作名（i18n key）；subject 是路径 / 插件 id / 用户数据——原样显示
    keyParams: ['what'],
  };
}

/** 未点头的错误——`EUSERDENIED`（机读）＋ 一句人读原因（含「没点头就不做」的承诺） */
export function userDenied(what: string, subject: string): Error & { code: string } {
  return coded(USER_DENIED, `用户未确认「${what}」（${subject}）——没点头就不执行`);
}

/** 本模块只用到 ctx 的这一个能力（结构型——不 import `whitelist.ts`，避免循环依赖） */
export interface AskContext {
  shellRequest(channel: string, args: unknown[], timeoutMs?: number): Promise<unknown>;
  /**
   * 相位标记（AI#60，**可选**）：问话期间让内核记「这条请求正在等人点头」。客户端超时后回读相位，
   * 才不会把「软件里弹着框、人在犹豫」误报成「对面卡住了」——后者会让 AI 重试，而用户随后一点头，
   * 同一个动作就做了两遍（**最坏的形态**：AI 以为失败、事情真的发生了两次）。
   * 字面量与 `whitelist.ts` 的 `BridgePhase` 同源，⛔ 不 import 它（成环）。
   */
  phase?(phase: 'op' | 'shell' | 'ask-user', what?: string | null): void;
}

/**
 * 🔴 **统一确认回路**——AI 侧唯一的弹框出口。
 *
 * 壳侧落到既有 `dialog:confirm` 通道（`DialogService.confirm` → 池 `DialogHost`），**零新 IPC**。
 * 抛错即「没得到点头」，两种情况都**不执行**动作（fail-closed）：
 *   · `EUSERDENIED`——用户明确取消/关掉了框；
 *   · `ESHELLTIMEOUT`——壳没应答（拿不到答复 ≠ 得到同意）。
 */
export async function askUser(
  ctx: AskContext,
  what: string,
  subject: string | DialogI18nText | AiConfirmCardPayload,
): Promise<void> {
  // 进相位（AI#60）：从这一刻起「在等用户点头」就是事实——期间那条确认框请求**不许**把相位
  // 改写成 `shell`（改写规则在内核：`index.ts` 的 `opContextFor`）。人可能在走开，这段时间以分钟计。
  ctx.phase?.('ask-user', what);
  // 三种正文：普通动作套统一话术 / 已带 key 的完整正文 / 结构化确认卡（统一卡片槽）
  const isCard =
    typeof subject === 'object' && subject !== null && 'kind' in subject && 'target' in subject;
  const prompt = isCard
    ? { hostView: 'ai-confirm' as const, payload: subject as AiConfirmCardPayload }
    : typeof subject === 'string'
      ? confirmPrompt(what, subject)
      : subject;
  try {
    const confirmed = await ctx.shellRequest(IPC.dialog.confirm, [prompt], ASK_TIMEOUT_MS);
    // EUSERDENIED 是给 AI 的机读错误：结构化正文/卡片用其 key 作人读标识
    if (confirmed !== true) {
      const label = typeof subject === 'string' ? subject : 'titleKey' in subject ? subject.titleKey : subject.key;
      throw userDenied(what, label);
    }
  } finally {
    // 出相位：问完了（点头 / 没点头 / 壳超时）——回到「在办」，后续真请求会再标 `shell`
    ctx.phase?.('op');
  }
}
