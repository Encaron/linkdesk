/**
 * KeybindingRegistry 注册表域——自 KeybindingRegistry.ts 拆出（E5.8#0d.10-8b）。
 * _bindings 属主：注册/查询/去重/冲突仲裁（KeybindingResolver 同域直读 _bindings 免导出私有态）+ isChordPrefix/clearUserKeybindings/getKeybindingSyncData。
 * 依赖方向：registry → normalization + CoreEvents + types；无反向。
 */

import { CoreEvents } from "../../../react/events/CoreEvents";
import { ContextKeyService } from "../ContextKeyService";
import { normalizeKey } from "./normalization";
import type { Keybinding, KeybindingConflict } from "./types";

export const _bindings: Keybinding[] = [];

/** 检查 key 是否是 chord 的第一键——有已注册的 binding 以此 key 开头 */
export function isChordPrefix(normalizedKey: string): boolean {
  return _bindings.some((b) => b.key.startsWith(normalizedKey + " "));
}

/** 清除所有用户快捷键（source === "user"）——重载 keybindings.json 前调用 */
export function clearUserKeybindings(): void {
  for (let i = _bindings.length - 1; i >= 0; i--) {
    if (_bindings[i].source === "user") {
      _bindings.splice(i, 1);
    }
  }
}

/** 清空注册表（测试/clearKeybindings 用）——dispatch 组合清理调用 */
export function clearBindings(): void {
  _bindings.length = 0;
}

/** 注册快捷键——插件加载时 / 用户 keybindings.json 加载时调用。
 *  E2c #17a：允许多个 binding 映射到同一个 key（冲突由 Resolver 在 dispatch 时仲裁）。
 *  E3f #59：同命令同 key 去重——防止 builtin+user 重复注册导致冲突红字。 */
export function registerKeybinding(binding: Keybinding): void {
  const normKey = normalizeKey(binding.key);
  if (_bindings.some((b) => b.command === binding.command && b.key === normKey)) return;
  _bindings.push({ ...binding, key: normKey });
  CoreEvents.onDidChangeKeybindings.fire(); // E3f #59-B：通知 UI 刷新
}

/** 移除指定命令的全部快捷键绑定——不限 source。E3f #59-E 归一化：改绑时先清再建。 */
export function removeKeybindingForCommand(commandId: string): void {
  for (let i = _bindings.length - 1; i >= 0; i--) {
    if (_bindings[i].command === commandId) {
      _bindings.splice(i, 1);
    }
  }
  CoreEvents.onDidChangeKeybindings.fire(); // E3f #59-B
}

/** E3f #59-G：重置为默认——只删 user 绑定，保留 builtin/plugin。 */
export function resetKeybindingToDefault(commandId: string): void {
  let removed = false;
  for (let i = _bindings.length - 1; i >= 0; i--) {
    if (_bindings[i].command === commandId && _bindings[i].source === "user") {
      _bindings.splice(i, 1);
      removed = true;
    }
  }
  if (removed) CoreEvents.onDidChangeKeybindings.fire();
}

/**
 * 快捷键冲突检测 + 优先级仲裁。
 * 对标 VS Code KeybindingResolver——分离注册层与 dispatch 层：
 * - registerKeybinding 只管"有哪些声明"
 * - Resolver 在按键时根据 when 条件 + source 优先级决定谁生效
 *
 * VS Code 源码：src/vs/platform/keybinding/common/keybindingResolver.ts
 */
class KeybindingResolver {
  /**
   * 检测所有冲突——同一 key 有 ≥2 个 binding。
   * E3f 快捷键 UI 用它高亮冲突行。
   */
  detectConflicts(): KeybindingConflict[] {
    const byKey = new Map<string, Keybinding[]>();
    for (const b of _bindings) {
      const list = byKey.get(b.key);
      if (list) list.push(b);
      else byKey.set(b.key, [b]);
    }
    return [...byKey.values()]
      .filter((list) => list.length > 1)
      // 同命令同 key 不算冲突——只报不同命令抢同一键
      .filter((list) => new Set(list.map((b) => b.command)).size > 1)
      // 🔥 when 互斥检测：全部有 when 且各不相同 → 不同上下文 → 不算冲突
      .filter((list) => {
        const whens = list.map((b) => b.when ?? "");
        // 有无条件绑定（无 when）→ 确实冲突——全局绑定与上下文绑定竞争
        const globals = whens.filter((w) => w === "").length;
        const contextuals = whens.filter((w) => w !== "");
        if (globals > 1) return true;
        if (globals === 1 && contextuals.length >= 1) return false;
        return new Set(contextuals).size !== contextuals.length;
      })
      .map((bindings) => ({ key: bindings[0].key, bindings }));
  }

  /**
   * 仲裁单个 key——按 when 条件匹配度 → source 优先级 → 注册顺序排序。
   * 返回最优 binding；无匹配时返回 undefined。
   */
  resolve(key: string): Keybinding | undefined {
    const candidates = _bindings.filter((b) => b.key === key);
    if (candidates.length === 0) return undefined;

    const sorted = [...candidates].sort((a, b) => {
      // 1. when 条件匹配者优先——有 when 且不满足 → 排后面
      const aMatch = a.when ? ContextKeyService.matches(a.when) : true;
      const bMatch = b.when ? ContextKeyService.matches(b.when) : true;
      if (aMatch !== bMatch) return aMatch ? -1 : 1;

      // 2. source 优先级：user > plugin > builtin
      const priority = { user: 3, plugin: 2, builtin: 1 };
      if (priority[a.source] !== priority[b.source]) {
        return priority[b.source] - priority[a.source];
      }

      // 3. 同优先级 → 后注册者生效（_bindings 索引更大 = 更晚注册）
      return _bindings.indexOf(b) - _bindings.indexOf(a);
    });

    const winner = sorted[0];
    if (winner.when && !ContextKeyService.matches(winner.when)) return undefined;
    return winner;
  }

  /** E3f 快捷键 UI 消费——获取所有冲突 */
  getConflictingBindings(): KeybindingConflict[] {
    return this.detectConflicts();
  }
}

export const keybindingResolver = new KeybindingResolver();

/** 注销插件的全部快捷键——卸载时调用 */
export function unregisterPluginKeybindings(pluginId: string): void {
  for (let i = _bindings.length - 1; i >= 0; i--) {
    if (_bindings[i].pluginId === pluginId) {
      _bindings.splice(i, 1);
    }
  }
}

/** 获取所有快捷键 */
export function getKeybindings(): Keybinding[] {
  return [..._bindings];
}

/** 获取指定命令的快捷键——优先返回最高优先级绑定（user > plugin > builtin） */
export function findKeybindingForCommand(commandId: string): Keybinding | undefined {
  const candidates = _bindings.filter((b) => b.command === commandId);
  if (candidates.length === 0) return undefined;
  const priority = { user: 3, plugin: 2, builtin: 1 };
  return candidates.sort((a, b) => priority[b.source] - priority[a.source])[0];
}

/** E5.5#7-p7：构建同步到主进程的快捷键数据 */
export function getKeybindingSyncData(): { shortcuts: string[]; chordPrefixes: string[]; chordCombos: string[] } {
  const shortcuts: string[] = [];
  const chordPrefixes = new Set<string>();
  const chordCombos = new Set<string>();

  for (const b of _bindings) {
    const spaceIdx = b.key.indexOf(" ");
    if (spaceIdx === -1) {
      shortcuts.push(b.key);
    } else {
      const first = b.key.slice(0, spaceIdx);
      chordPrefixes.add(first);
      chordCombos.add(b.key);
    }
  }

  return {
    shortcuts,
    chordPrefixes: [...chordPrefixes],
    chordCombos: [...chordCombos],
  };
}
