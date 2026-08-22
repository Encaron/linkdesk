/**
 * E5.8#46.12 Step2：聚焦池窗解析——壳→池 UI 推流（QuickPick/Toast/Dialog/FloatingPanel）默认目标窗决策。
 * 纯函数（零 Electron 依赖，独立单测）——windowManager.getFocusedWindowId 消费：
 *   聚焦窗仍存注册表 → 该窗；未聚焦（null）/ 聚焦窗已销毁（迟到推流不落空窗）→ 主池。
 */
export function resolveFocusedWindowId(focused: string | null, existing: ReadonlySet<string>): string {
  return focused && existing.has(focused) ? focused : 'main';
}
