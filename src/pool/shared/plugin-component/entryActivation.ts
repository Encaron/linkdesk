/**
 * E6#62e 池侧 on-command 激活——覆盖「无视图可开、entry 从未被视图挂载 import」的纯命令插件缺口。
 *
 * 背景：命令两半架构下，壳只持占位元数据（contributes.commands），池注册表 = 执行真相源。
 * 但真实插件大多在视图 mount 时才 registerCommand——某插件的命令若从未被任何视图挂载触发，
 * 该插件的 entry JS 就从未被池 import → 其命令 handler 永不注册 → executeRequest 转发桥恒 miss。
 * 缺口对象 = 纯命令插件（无 openable surface / 表面从不开）。#62e 裁决 = 建池侧 on-command 激活：
 * 命令 miss → preload 回调本模块 → resolvePluginViewLoader 按 URL import 属主插件 entry →
 * entry 顶层副作用（命令注册）随 import 执行 → preload 重试一次。
 *
 * 🔥 依赖链复用：resolvePluginViewLoader 是池唯一 entry/view URL import 实现（PluginComponent、
 * PluginDetailViewHost、本模块共用同一条加载链——两侧 URL 形态判定必须一致）。import() 模块缓存
 * 幂等：重复 miss 重复回调，二次 import 零重新执行，仅查缓存。
 *
 * 作者契约（文档 02-插件生命周期 §五）：命令 handler 要在 **entry 顶层** 注册（无视图可开的
 * 纯命令插件 = entry 顶层注册；视图插件已有视图 mount 轨）。在视图组件内注册的命令仍只随视图
 * 挂载激活——不在本机制覆盖范围（inherent：无视图 = 无法先有视图再注册）。
 *
 * ⚠️ resolvePluginViewLoader 内部吞 import 错误（返回 null module 而非 reject）——本模块如实把
 * 错误留给其自身 console.error + preload 重试后仍 miss → 走标准「命令未在池内注册」reject。返回
 * true 仅表示「尝试了 entry import」，非「handler 必已注册」（false 表示连 loader 都没有——纯浏览
 * 器 dev-host 无 plugins API 即此态，on-command 激活 no-op）。
 */
import { resolvePluginViewLoader } from "./PluginComponent";

export async function activatePluginEntryForCommands(pluginId: string): Promise<boolean> {
  const loader = resolvePluginViewLoader(pluginId);
  if (!loader) return false;
  await loader();
  return true;
}
