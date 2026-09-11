/**
 * SerialContext 门面——E6#87b：原 services/SerialContext.tsx（477 行）拆为同名夹。
 * 消费方 import 路径零变更（`services/SerialContext` 解析到本文件）。
 *
 * 子模块：
 *   types.ts           —— 公共类型（PortInfo / SerialFrame / SerialState / SerialActions …）
 *   store.ts           —— 🔴 模块级 mutable 单一属主（_sharedState / _openPorts / _listeners / _portListeners）
 *   status.ts          —— mergeStatus（纯函数）
 *   ipc.ts             —— _initOnce / 监听器引用计数 / closePortFromModule
 *   useSerialContext.ts—— 主 hook（state + actions）
 *   usePortStats.ts    —— useOpenPortCount / usePortStats（per-port 只读）
 *
 * 设计依据：[V3-Phase4-串口监视器插件化设计.md]
 */

export type { PortInfo, SerialFrame, HandshakeState, SerialState, SerialActions } from "./types";
export { getOpenPorts } from "./store";
export { closePortFromModule } from "./ipc";
export { useSerialContext } from "./useSerialContext";
export { useOpenPortCount, usePortStats } from "./usePortStats";
