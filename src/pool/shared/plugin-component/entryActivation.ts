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

/**
 * E6#162（2026-09-30）**存在性闸**——属主不在盘上 ⇒ 不 import、不出声。
 *
 * 为什么必须有这道闸（实测读数）：miss 时属主有三档来源（真属主缓存 / 壳权威声明面 / 名字第一段
 * 推定，见 `electron/preload-pool/commands.ts` 的 resolvePoolCommandOwner）——**后两档会产出不是插件的
 * 字符串**：壳自己的命令住 `APP_PLUGIN_ID = "app"`（现场打点最多的那条即 app 属主的
 * `workbench.action.showOutput`——该命令已随 E6#162 退场，读数留档）；`workbench.action.*` 经名字推定
 * 得 `workbench`；宿主侧注册的 `ai-bridge`、退役身份 `update` 亦然。
 * 对这些 id 调 resolvePluginViewLoader，会拼出一条**注定 404** 的入口 URL（dev
 * `/@fs/<root>/plugins/<id>/src/index.tsx` / prod `linkdesk://<id>/src/index.tsx`，因为 resolvePath
 * 是「未命中回退拼一个未必存在的路径」语义——`electron/services/plugin-file-service.ts:198` 原话）
 * ⇒ 每次 miss 一条 `[PluginComponent] 动态加载插件 "X" 失败`。实测该形态占
 * `protocol-debug.log` 的 25.6%（**33,550 行 / 5.84 MB**，日志总量 211,605 行 / 22.79 MB）。分号点名：
 * `ai-bridge` **32,414**（全部集中在 2026-09-29T00:46→09-30T02:17 一个 25.5 小时窗口，≈21 行/分；
 * 触发点 = **设置插件表面加载时执行宿主注册的 `ai-bridge` 状态命令**——现场逐行：`200 OK —
 * settings/index.bundle.js` 紧接 `404 NOT FOUND — ai-bridge/src/index.tsx`，同刻三条一模一样的 error）、
 * `app` 571、`update` 165、`workbench` 98、`core` 30 —— 五个 id 在这份安装里都没有对应插件目录，
 * 即**每一次 miss 都白打一条 error**。闸后：不在盘上 ⇒ 返回 false ⇒ 照旧落 fallback（交壳执行）。
 *
 * 判据来源＝`resolveEntry().root`（E6#7 / E6#78：未命中恒 `{root:null}`），**不是**新增名单——
 * 仓内 `HOST_PSEUDO_PLUGIN_IDS` 只覆盖 app/appearance（update 已退役），`workbench`/`ai-bridge`
 * 这类「壳侧注册但不在清单里」的 id 会漏网；「在不在盘上」才是普适判据，且它已是 resolveEntry 的
 * 现成语义（不新增 API、不新增硬编码名单——硬约束 6/10）。
 *
 * API 缺失（老壳 preload 无 resolveEntry）⇒ 不设闸，保持 #62e 原语义（兼容档）。
 */
export async function activatePluginEntryForCommands(pluginId: string): Promise<boolean> {
  const plugins = window.linkdesk?.plugins;
  const resolveEntry = plugins?.resolveEntry;
  if (typeof resolveEntry === "function") {
    try {
      const info = await resolveEntry(pluginId);
      if (!info?.root) return false;
    } catch {
      // 非法 pluginId（对象/空串——#37f 的 `[object Object]` 族）与 IPC 失败同归此路：
      // 无可加载入口，静默放弃（load 侧由 PluginComponent 的既有守卫负责出声）。
      return false;
    }
  }
  const loader = resolvePluginViewLoader(pluginId);
  if (!loader) return false;
  await loader();
  return true;
}
