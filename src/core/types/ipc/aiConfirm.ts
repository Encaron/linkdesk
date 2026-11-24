/**
 * AI 确认卡载荷——**类型的家在共享件**（`src/components/shared/ai-confirm/types.ts`）。
 *
 * 为什么不在 core 定义：`@linkdesk/ui` 的声明构建 rootDir = `src/components/shared`，
 * 卡组件若 import core 类型会 TS6059（core 不在 rootDir 下）。共享件是载荷的第一消费者，
 * 类型随组件走；本文件只给主进程/渲染侧一个稳定的 core 入口（类型 re-export + 槽位常量）。
 */

export type {
  AiConfirmCardPayload,
  AiConfirmDialogRequest,
} from "../../../components/shared/ai-confirm/types";
export { AI_CONFIRM_HOST_VIEW } from "../../../components/shared/ai-confirm/types";
