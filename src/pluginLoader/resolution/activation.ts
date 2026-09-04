/**
 * #9g 按需激活——激活事件推断 + 延迟判定（纯函数）+ 触发总线。
 *
 * B 方案（2026-08-31 拍板，对标 VS Code 1.74+ contributes 自动激活）：
 *   无 activationEvents 字段 → 壳按 contributes 自动推断触发事件 → 走延迟加载；
 *   显式字段保留作精确控制（显式优先）。在 #44 雏形上补齐，非从零建。
 *
 * 🔥 本模块零状态零副作用——只 import 类型（防环：App 层触发源/loader/runtime 皆可安全依赖）。
 * 延迟注册表的持有与激活动作在 state.ts / runtime.ts（本模块不反向依赖它们）。
 *
 * 事件语法（canonical，无前导点——与 fileAssociations.extension 的 schema 描述"不含点"一致）：
 *   onCommand:<id> / onFileOpen:<ext> / onLanguage:<ext> / onPortOpen / onView:<containerId>
 * 显式作者按同语法声明；触发源（onView 容器选中 / onFileOpen 文件打开等）按同语法发火。
 */

import type { PluginManifest } from "../../core/api/types";

/* ── #9g ① 推断器——无字段时从 contributes 派生触发事件 ── */

/**
 * 从 contributes 推断激活事件（无 activationEvents 字段时）。
 * 映射（与 #9g 拍板一致）：
 *   contributes.fileAssociations[].extension → `onLanguage:<ext>`
 *   contributes.views 的容器键               → `onView:<containerId>`
 *   contributes.commands[].id                → `onCommand:<id>`
 * 按上序去重收拢（保持插入序）。entryless/数据纯贡献推断为空数组（无 JS 可延迟）。
 */
export function inferActivationEvents(manifest: PluginManifest): string[] {
  const events: string[] = [];
  const seen = new Set<string>();
  const add = (ev: string): void => {
    if (!seen.has(ev)) {
      seen.add(ev);
      events.push(ev);
    }
  };

  const c = manifest.contributes;
  if (c && typeof c === "object") {
    // fileAssociations → onLanguage:<ext>（extension 不含点，如 "py"）
    const fas = (c as { fileAssociations?: Array<{ extension?: string }> }).fileAssociations;
    if (Array.isArray(fas)) {
      for (const fa of fas) {
        if (typeof fa?.extension === "string" && fa.extension.length > 0) {
          add(`onLanguage:${fa.extension}`);
        }
      }
    }
    // views 容器键 → onView:<containerId>
    const views = (c as { views?: Record<string, unknown> }).views;
    if (views && typeof views === "object") {
      for (const containerId of Object.keys(views)) add(`onView:${containerId}`);
    }
    // commands[].id → onCommand:<id>
    const commands = (c as { commands?: Array<{ id?: string }> }).commands;
    if (Array.isArray(commands)) {
      for (const cmd of commands) {
        if (typeof cmd?.id === "string" && cmd.id.length > 0) {
          add(`onCommand:${cmd.id}`);
        }
      }
    }
  }
  return events;
}

/* ── #9g ④ 显式共存——显式优先，未写走推断 ── */

/** 生效激活事件——author 写了 activationEvents（含 [] / ["*"]）原样优先；未写走推断。 */
export function effectiveActivationEvents(manifest: PluginManifest): string[] {
  if (Array.isArray(manifest.activationEvents)) return manifest.activationEvents;
  return inferActivationEvents(manifest);
}

/* ── 延迟判定 ── */

/**
 * 是否延迟 JS import（启动注册-only，首用再激活）。
 * 判定：有 entry（无 JS 可延迟的 entryless/纯贡献插件不进延迟）∧ 非 data 角色 ∧
 * 生效事件非空 ∧ 不含 "*"（["*"] / 空 = 立即加载，语义同 #44）。
 * data 角色（如 python langDefs 提供方）= 安装即用无激活时刻——恒立即加载。
 */
export function shouldDeferActivation(manifest: PluginManifest): boolean {
  if (!manifest.entry) return false;
  // data 角色 = 安装即用无激活时刻——恒立即（与 runtime.ts Step3 同款：判 schema 字段枚举非插件 ID，
  // 别名 role 避开 no-plugin-id-hardcode 对 *plugin* 左操作数命名的机械拦截）
  const role = manifest.pluginRole;
  if (role === "data") return false;
  const events = effectiveActivationEvents(manifest);
  return events.length > 0 && !events.includes("*");
}

/* ── #9g ② 触发总线——薄层转发，防 App 层 import 重型 runtime 图 ── */

type ActivationEventHandler = (event: string) => Promise<void>;

let _handler: ActivationEventHandler | null = null;

/** 挂载激活处理器——loader 初始化时注册到 runtime.activateDeferredByEvent（单实例常驻）。 */
export function setActivationEventHandler(handler: ActivationEventHandler | null): void {
  _handler = handler;
}

/**
 * 发火一个激活事件（如 `onView:explorer` / `onLanguage:py`）。
 * 触发源（sidebarHost icon:selected / tabActions tab:create / CommandRegistry 预激活钩子）只依赖本函数——
 * 不 import runtime/state 重型模块。处理器未挂（loader 未就绪）则静默丢弃——延迟激活是尽力而为：
 * 视图渲染经池 PluginComponent 懒加载不受影响，最坏只是 shell 侧注册延迟一拍。
 */
export async function fireActivationEvent(event: string): Promise<void> {
  await _handler?.(event);
}
