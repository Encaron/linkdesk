/**
 * AI 确认卡的**宿主适配层**（池 · hostView = `ai-confirm`）。
 *
 * 视觉本体住 `@linkdesk/ui` 的共享件 `src/components/shared/ai-confirm/AiConfirmCard`——
 * 这里只把 `dialogHost.confirm/cancel` 接上，⛔ 不写任何布局/文案。
 * 这样市场/设置/第三方拿到的是同一份可复用呈现，而不是壳内私有卡。
 */

import AiConfirmCard from "../../../components/shared/ai-confirm/AiConfirmCard";

const host = () => window.linkdesk?.dialogHost;

export default function AiConfirmHostView({ payload }: { payload?: unknown }) {
  return (
    <AiConfirmCard
      payload={payload}
      onConfirm={() => host()?.confirm()}
      onCancel={() => host()?.cancel()}
    />
  );
}
