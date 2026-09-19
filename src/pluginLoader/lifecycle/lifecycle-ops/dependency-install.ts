/**
 * 依赖链自动装——**纯函数层**（E6#73o，设计定案 [20-依赖链自动安装设计定案.md](../../../../../docs/02-Electron架构/E6_插件生态与发布/03-插件市场/20-依赖链自动安装设计定案.md)）。
 *
 * 编排（含网络/文件 I/O）在 `install-ops.ts`——本模块只放可独立单测的判定件：
 *   - `findDependencyCycle`：祖先链栈环守卫（D2）——A→B→C→A 在安装期就 fail-loud，文案给全链，
 *     与 runtime `detectDependencyCycle` 的加载期检测同口径、更早一步；
 *   - `missingDependencies`：本层缺失依赖计算（D4）——已知（已装/挂起）跳过、本链新装的跳过。
 *
 * 🔴 **73q「子包占槽护栏」的结构说明（护栏在这里，不在运行时）**：依赖安装在父 job 已持有的
 * 槽内联进行——不建第二条 job、不进 FIFO。三个父 job 各占槽等依赖排队的经典死锁**从构造上
 * 不可能发生**；任何把依赖送进队列槽的实现都是对本护栏的破坏。
 */
import type { PluginManifest } from "../../../core/api/types";
import { getDependencyIds } from "../../resolution/dependencies";

/**
 * 祖先链环守卫——`next` 已在祖先链里（自依赖 = 链尾自指也在此列）⇒ 返回环路径文案
 * （如 "A → B → A"）；无环返回 null。
 */
export function findDependencyCycle(ancestors: string[], next: string): string | null {
  const i = ancestors.indexOf(next);
  if (i === -1) return null;
  return [...ancestors.slice(i), next].join(" → ");
}

/**
 * 本层缺失依赖——声明序（getDependencyIds 归一后的顺序，拓扑由递归自然成立）。
 * 跳过两类：① loader 已知（已装/挂起——D4，不自动启用禁用件）；② 本链刚装过的
 * （`chainInstalled`——manifestIndex 的刷新是异步广播，跨层重查会撞「刚装完还查不到」的竞态，
 * 安装期以本链账本为准，装过就是已知）。
 */
export function missingDependencies(
  manifest: PluginManifest,
  isKnown: (id: string) => boolean,
  chainInstalled: ReadonlySet<string>,
): string[] {
  return getDependencyIds(manifest).filter((dep) => !isKnown(dep) && !chainInstalled.has(dep));
}
