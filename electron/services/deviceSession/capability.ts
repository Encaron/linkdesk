/**
 * 设备 transport 能力闸（Block 3a · 安全复核 2026-11-26）——**唯一判定点**。
 *
 * 判据：
 *   · `__shell__`（宿主内部）放行；
 *   · 属主**必须是已加载插件**（⛔ 未知 id 不得开后门——旧实现 `return` 让 `ownerPluginId:"ghost"` 绕过闸）；
 *   · 已装插件未声明 `deviceTransports` ⇒ 只保留存量 `serial`；声明不含请求 transport ⇒ `ECAPABILITY`。
 *
 * 依赖注入（`isLoaded` / `transportsOf`）——纯逻辑可单测，不把 manifest loader 拖进测试。
 */

import { DEVICE_ERROR_CODES as C, codedDeviceError } from './codes.js';

export interface CapabilityDeps {
  isLoaded(pluginId: string): boolean;
  /** null = 未声明（调用方按存量策略：只 serial） */
  transportsOf(pluginId: string): string[] | null;
}

export function assertTransportCapability(owner: string, transport: string, deps: CapabilityDeps): void {
  if (owner === '__shell__') return; // 宿主内部（serial 的 legacy 无主打开）
  if (!deps.isLoaded(owner)) {
    throw codedDeviceError(
      C.CAPABILITY,
      `属主 "${owner}" 不是已加载插件——不能开设备会话`,
      '池侧必须用真实插件 id（已装/已加载）；⛔ 未知/伪造 id 不得绕过能力闸',
      { owner, transport },
    );
  }
  const declared = deps.transportsOf(owner);
  const allowed = declared ?? ['serial'];
  if (!allowed.includes(transport)) {
    throw codedDeviceError(
      C.CAPABILITY,
      `插件 "${owner}" 未声明 transport "${transport}"（已声明：${allowed.join(' / ')}）`,
      `在 plugin.json 根字段加 "deviceTransports": ["${transport}"]；未声明默认只给 serial（存量）`,
      { transport, allowed },
    );
  }
}
