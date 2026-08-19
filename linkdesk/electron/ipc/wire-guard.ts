/**
 * 运行期契约校验守卫——E5.8#22.5（接收边界断言，never-throw + log-only）。
 *
 * 用途：preload 接收边界对推流载荷做形状断言——「哪条通道拿到异形数据」可查可诊断。
 *       guard 只记录不阻断：载荷照常透传 cb(payload)，断言自身绝不影响业务路径。
 *
 * 设计：docs/02-Electron架构/E5.8_归一化基建/契约生成/04-运行期校验设计.md §5
 * 产物：contracts/runtime-shapes.ts（自动生成，validateWire 查表）
 */
import { validateWire } from '../../contracts/runtime-shapes';

/**
 * 接收边界断言——never-throw，失配 console.error 进诊断面，透传载荷（不阻断）。
 * 未注册通道 validateWire 返回 null（无断言，安全降级）。
 */
export function guardPush(channel: string, payload: unknown): void {
  const errs = validateWire(channel, payload);
  if (errs && errs.length > 0) {
    console.error(`[wire-guard] 🔴 channel=${channel} 载荷形状失配:\n  ` + errs.join('\n  '));
  }
}
