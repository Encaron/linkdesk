/**
 * 插件依赖编排——纯函数层（E5.8#14）。
 *
 * 职责：requires 解析（合并 extensionDependencies 兼容）、依赖缺失判定、图级环检测、
 *       活跃消费方发现、挂起原因文案（E5.8#15）。
 * 纯函数原则：不持有可变状态、不 import runtime.ts（防环）——只依赖 state.ts 只读面
 * （loadedPluginIds——"依赖已激活"是唯一就绪判定源；getLoadedManifest——已加载插件的 manifest 面）。
 * 可变编排（挂起注册表 _pendingPlugins + sweep 补载 + 连带卸载）在 runtime.ts/loadState.ts——本模块可独立单测。
 *
 * 语义（设计支柱 3 + 审视立案）：
 *   - requires = 插件级激活顺序依赖（string[] 按 pluginId），依赖须先激活本插件再激活；
 *   - 就绪 = 依赖在 loadedPluginIds（ACTIVE）；禁用/未装/加载失败 → 未就绪 → 缺失；
 *   - 环 = 自环 + 传递环（A→B→C→A）图级检测 fail-loud，非两两对；
 *   - 命名边界：requires（插件级）vs ConfigurationRegistry dependsOn（配置项级）——#13 成文。
 *   - 连带卸载（#15）：依赖消失 → 消费方连带降级 PENDING——findActiveConsumers 是发现源。
 */

import type { PluginManifest } from "../core/api/types";
import { loadedPluginIds, getLoadedManifest } from "./state";

/** 依赖声明——requires 为主，extensionDependencies 向后兼容（@deprecated #13，归并 requires）。
 *  两源并集 + 去重，顺序稳定（requires 在前）——一个依赖只有 requires 一种声明（设计支柱 3）。 */
export function getDependencyIds(manifest: PluginManifest): string[] {
  const requires = manifest.requires ?? [];
  const legacy = manifest.extensionDependencies ?? [];
  return [...new Set([...requires, ...legacy])];
}

/** 缺失依赖——依赖须已激活（loadedPluginIds，激活顺序依赖语义）才不算缺失。
 *  自依赖排除（交给环检测 fail-loud）；禁用/未装/加载失败的依赖都在 loadedPluginIds 之外 → 缺失。 */
export function findMissingDeps(pluginId: string, manifest: PluginManifest): string[] {
  return getDependencyIds(manifest).filter((dep) => dep !== pluginId && !loadedPluginIds.has(dep));
}

/** 图级环检测——自环 + 传递环全查（A→B→C→A），非两两对。
 *  沿 requires 传递闭包 DFS，回到起点 = 环；未知插件（getManifest undefined）= 死胡同（缺失依赖非环）。
 *  返回环路径字符串（如 "A → B → A"）或 null。
 *  getManifest 由调用方注入（runtime 已知 manifest 面：glob + deferred + pending）——纯函数可独立单测。
 *  收敛：已在 seen 的节点跳过——防无限递归；每个环节点被 dep-check 时走闭包必达起点（#14 分析成文）。 */
export function detectDependencyCycle(
  pluginId: string,
  manifest: PluginManifest,
  getManifest: (id: string) => PluginManifest | undefined,
): string | null {
  const seen = new Set<string>([pluginId]);

  function walk(id: string, path: string[]): string | null {
    const m = getManifest(id);
    if (!m) return null; // 未知插件——死胡同（可能是缺失依赖，非环）
    for (const dep of getDependencyIds(m)) {
      if (dep === pluginId) return [...path, dep].join(" → ");
      if (seen.has(dep)) continue;
      seen.add(dep);
      const r = walk(dep, [...path, dep]);
      if (r) return r;
    }
    return null;
  }

  for (const dep of getDependencyIds(manifest)) {
    if (dep === pluginId) return `${pluginId} → ${pluginId}`; // 自环
    seen.add(dep);
    const r = walk(dep, [pluginId, dep]);
    if (r) return r;
  }
  return null;
}

/** 挂起原因文案——缺依赖挂起的统一格式（E5.8#15，parkForDependencies + orphanPlugin 共用单源）。
 *  "等待依赖: " + 引号分隔 pluginId 列表——marketplace/#15.5 直接展示。 */
export function formatPendingReason(missing: string[]): string {
  return `等待依赖: ${missing.map((d) => `"${d}"`).join("、")}`;
}

/** 活跃消费方——loadedPluginIds 中依赖声明含 depId 的插件（连带卸载发现源，#15）。
 *  只查活跃集：挂起中的消费方已在 PENDING 等依赖回归，无需连带动作（卸载也动不了它们）。
 *  getLoadedManifest 覆盖 view/glob 非视图/运行时三类已加载插件——loadedPluginIds 全量可查。
 *  排除自依赖：自环已在加载时 fail-loud，loadedPluginIds 中不可能存在 requires 自身的插件。 */
export function findActiveConsumers(depId: string): string[] {
  const result: string[] = [];
  for (const id of loadedPluginIds) {
    const manifest = getLoadedManifest(id);
    if (manifest && getDependencyIds(manifest).includes(depId)) {
      result.push(id);
    }
  }
  return result;
}
