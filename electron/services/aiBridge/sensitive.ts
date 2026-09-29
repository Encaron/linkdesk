/**
 * 敏感动作统一确认回路（M4 `AI#29`）——「AI 能发起，但**敏感动作要用户点头**」的**一道门**。
 *
 * ## 判据（出处：`docs/04-软件更新/待抉择池/AI友好化-全自动操作/AI-执行清单.md` `AI#29`）
 *
 *   「把『AI 能发起、但敏感动作要用户点头』落成**一致机制**」＋既有先例 =「**装 = 问一声**」
 *   （[01-设计.md §八 追问场景②]：装插件 = 运行陌生代码 ⇒ AI 可发起、用户点头才落地）。
 *
 * ## 🔴 为什么必须是**一道门**，而不是各操作各弹一个框
 *
 *   本格之前：`install` 一直在弹（`AI#32` 起），`exec` **一次都不弹**——而 `exec` 是**任意壳命令
 *   的总门**：经它调 `update.openUpdateFlow`，状态是「已下载」时**直接重启并装**新版本程序本体，
 *   全程没有一声询问。⇒ 同一个语义（换掉正在跑的代码），从甲门进来问、从乙门进来不问——
 *   这不是「策略不同」，是**漏门**。收成一条腿：**凡到得了敏感动作的入口，都从 `askUser()` 过**。
 *
 * ## 谁在名单上（静态、可在 `describe` 自述里读到）
 *
 *   · 入选判据：① **不可回退 / 动程序本体**（装更新 = 换掉正在跑的代码）；
 *     ② **跑陌生代码**（装插件）。
 *   · ⛔ **不入选**：可撤销的界面动作（关标签 / 切布局 / 改设置）——把确认框撒得到处都是，
 *     只会训练用户闭眼点「同意」，真正要紧的那一两次就被淹没。**门要稀，才有人抬头看。**
 *   · 粒度 = **首版「一个总开关 ＋ 白名单整组」，不逐项设闸**（2026-09-16 用户拍板，
 *     [01-设计.md]:243）⇒ 本名单**不配设置项**，改名单 = 改代码。
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

/** 内核侧等用户点头的预算——人可能在走开，10 分钟不算长 */
export const ASK_TIMEOUT_MS = 600_000;

/** 未点头的机读 code（客户端按 code 分类；⛔ 不是 EERROR，更不是成功） */
export const USER_DENIED = 'EUSERDENIED';

/**
 * 「要问一声」的壳命令——按**命令 id** 判（不按调用方、不按参数）。
 * `what` / `why` 都进确认框正文：用户看到的是「AI 想干什么、为什么要问」，不是一个裸 id。
 */
export interface AskFirstRule {
  /** 命令 id 或操作名——即键 */
  id: string;
  /** 这是什么动作（人读，进确认框） */
  what: string;
  /** 为什么要问一声（人读，进确认框） */
  why: string;
}

/** 名单：要问一声的**壳命令**（`exec` / `notifyAction` 两条路都按它判） */
export const ASK_FIRST_COMMANDS: AskFirstRule[] = [
  {
    id: 'update.openUpdateFlow',
    what: '处理主软件更新（有新版本会先下载，下载完**重启并装**）',
    why: '装更新 = 换掉正在跑的程序本体，不可回退',
  },
];

/** 名单：要问一声的**内核操作**（`install` 装的是陌生代码） */
export const ASK_FIRST_OPS: AskFirstRule[] = [
  {
    id: 'install',
    what: '安装插件',
    why: '插件 = 陌生代码，装上就会运行',
  },
];

/** 命令要不要先问一声——`null` = 不用问（普通命令，行为与从前一致） */
export function askFirstRuleForCommand(commandId: string): AskFirstRule | null {
  return ASK_FIRST_COMMANDS.find((r) => r.id === commandId) ?? null;
}

/** 操作要不要先问一声（op 粒度；`exec`/`notifyAction` 的敏感性由**目标命令**决定，不在这里） */
export function askFirstRuleForOp(op: string): AskFirstRule | null {
  return ASK_FIRST_OPS.find((r) => r.id === op) ?? null;
}

/**
 * `describe` 的自述字段——**从上面两张表派生**（⛔ 不手抄第二份）。
 * 用途：AI 在**动手之前**就知道哪些动作会停下来等人；客户端据此决定等待预算。
 */
export function askFirstCatalog(): { note: string; ops: AskFirstRule[]; commands: AskFirstRule[] } {
  return {
    note: '以下动作会先在软件里弹确认框、等用户点头；用户不点头 = EUSERDENIED，动作不执行（装 = 问一声，AI#29）',
    ops: ASK_FIRST_OPS.map((r) => ({ ...r })),
    commands: ASK_FIRST_COMMANDS.map((r) => ({ ...r })),
  };
}

/**
 * 确认框正文——**统一话术**（三个入口问出来的是同一个形状）。
 * 纯函数：自测直接打它，不必起对话框。
 */
export function confirmPrompt(what: string, subject: string): string {
  return `AI 请求${what}：\n${subject}\n\n允许吗？（不点 = 不执行）`;
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
export async function askUser(ctx: AskContext, what: string, subject: string): Promise<void> {
  // 进相位（AI#60）：从这一刻起「在等用户点头」就是事实——期间那条确认框请求**不许**把相位
  // 改写成 `shell`（改写规则在内核：`index.ts` 的 `opContextFor`）。人可能在走开，这段时间以分钟计。
  ctx.phase?.('ask-user', what);
  try {
    const confirmed = await ctx.shellRequest(IPC.dialog.confirm, [confirmPrompt(what, subject)], ASK_TIMEOUT_MS);
    if (confirmed !== true) throw userDenied(what, subject);
  } finally {
    // 出相位：问完了（点头 / 没点头 / 壳超时）——回到「在办」，后续真请求会再标 `shell`
    ctx.phase?.('op');
  }
}
