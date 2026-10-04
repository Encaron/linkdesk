/**
 * KeybindingRegistry 注册表域——自 KeybindingRegistry.ts 拆出（E5.8#0d.10-8b）。
 * _bindings 属主：注册/查询/去重/冲突仲裁（KeybindingResolver 同域直读 _bindings 免导出私有态）+ isChordPrefix/clearUserKeybindings/getKeybindingSyncData。
 * 依赖方向：registry → normalization + CoreEvents + types；无反向。
 */

import { CoreEvents } from "../../../react/events/CoreEvents";
import { ContextKeyService } from "../ContextKeyService";
import { normalizeKey } from "../../../utils/keybindingNormalization";
import { trackRegistration } from "../../registrationTracker"; // E5.8#10：register 返 disposer——卸载自动逆序回滚
import type { Keybinding, KeybindingConflict } from "./types";

export const _bindings: Keybinding[] = [];

/**
 * 被用户**清空**的命令名册——「这条命令不要键」（对标 VS Code `keybindings.json` 里的负命令）。
 *
 * 🔴 为什么非有不可：「恢复为默认」只删 `source === "user"` 的覆盖，作者（builtin/plugin）
 * 声明的键会立刻顶上来——对**作者声明过键**的命令，那是「回退」不是「清空」，用户无法让命令彻底无键。
 * 而内置/插件声明每次启动都会重新注册，光删内存里的绑定活不过一次重启 ⇒ 需要一份**抑制名册**：
 * 名册里的命令，非 user 来源的注册一律不落地（`registerKeybinding` 顶部守卫）；
 * 用户重新绑定（source === "user"）或「恢复为默认」都会把它从名册里摘掉（抑制解除）。
 * 持久化形状见 `persistence.ts`——用户文件里写成 `{ command, key: "" }`。
 */
const _unboundCommands = new Set<string>();

/** 该命令是否被用户显式清空（抑制中） */
export function isCommandUnbound(commandId: string): boolean {
  return _unboundCommands.has(commandId);
}

/** 被清空的命令名册——持久化侧用它写出 `key: ""` 标记条目 */
export function getUnboundCommands(): string[] {
  return [..._unboundCommands];
}

/** 检查 key 是否是 chord 的第一键——有已注册的 binding 以此 key 开头 */
export function isChordPrefix(normalizedKey: string): boolean {
  return _bindings.some((b) => b.key.startsWith(normalizedKey + " "));
}

/** 清除所有用户快捷键（source === "user"）——重载 keybindings.json 前调用。
 *  连**抑制名册**一起清（它也是用户态）：调用方随后按文件内容重新施加。 */
export function clearUserKeybindings(): void {
  for (let i = _bindings.length - 1; i >= 0; i--) {
    if (_bindings[i].source === "user") {
      _bindings.splice(i, 1);
    }
  }
  _unboundCommands.clear();
}

/** 清空注册表（测试/clearKeybindings 用）——dispatch 组合清理调用 */
export function clearBindings(): void {
  _bindings.length = 0;
}

/** 注册快捷键——插件加载时 / 用户 keybindings.json 加载时调用。
 *  E2c #17a：允许多个 binding 映射到同一个 key（冲突由 Resolver 在 dispatch 时仲裁）。
 *  E3f #59：同命令同 key 去重——防止 builtin+user 重复注册导致冲突红字。
 *
 *  E5.8#10 返 disposer：删除"这一条"（按引用 splice）+ 重发刷新事件。
 *  去重分支（同命令同 key）→ 未新增条目，返 no-op。
 *  有 pluginId（插件声明）→ 登记进追踪器（卸载自动逆序回滚）；
 *  无 pluginId（builtin/user 快捷键——非插件域）→ 不追踪，返回裸 disposer。 */
export function registerKeybinding(binding: Keybinding): () => void {
  // 🔴 被用户清空的命令：非 user 来源（builtin/plugin）一律不落地——抑制名册的守卫点。
  //    用户自己重新绑定 ⇒ 立刻解除抑制（用户刚表达的意愿优先于之前的清空）。
  if (binding.source === "user") {
    _unboundCommands.delete(binding.command);
  } else if (_unboundCommands.has(binding.command)) {
    return () => {};
  }
  const normKey = normalizeKey(binding.key);
  if (_bindings.some((b) => b.command === binding.command && b.key === normKey)) return () => {};
  const entry = { ...binding, key: normKey };
  _bindings.push(entry);
  CoreEvents.onDidChangeKeybindings.fire(); // E3f #59-B：通知 UI 刷新

  const dispose = (): void => {
    const idx = _bindings.indexOf(entry);
    if (idx !== -1) {
      _bindings.splice(idx, 1);
      CoreEvents.onDidChangeKeybindings.fire(); // E3f #59-B
    }
  };
  return binding.pluginId ? trackRegistration(binding.pluginId, dispose) : dispose;
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

/** E3f #59-G：重置为默认——只删 user 绑定，保留 builtin/plugin。
 *  ⚠️ 与 `clearKeybindingForCommand` 的区别就在这一行：作者声明过键的命令，重置后**那个键会顶回来**
 *  （＝回退，不是清空）；同时把该命令从抑制名册摘掉——「恢复为默认」就是「不抑制作者默认」。 */
export function resetKeybindingToDefault(commandId: string): void {
  let removed = false;
  for (let i = _bindings.length - 1; i >= 0; i--) {
    if (_bindings[i].command === commandId && _bindings[i].source === "user") {
      _bindings.splice(i, 1);
      removed = true;
    }
  }
  const lifted = _unboundCommands.delete(commandId);
  if (removed || lifted) CoreEvents.onDidChangeKeybindings.fire();
}

/**
 * 清空某命令的绑定——「这条命令不要键」。
 *
 * 与 `removeKeybindingForCommand` 的区别（**别混用**）：
 *  · `removeKeybindingForCommand` = **只删内存里现存的那几条**，给「改绑先清再建」用——
 *    作者声明还在，重启后照样注册回来；
 *  · 本函数 = 删现存**全部**（不限 source）＋ 把命令记进**抑制名册**，此后 builtin/plugin 的注册一律被
 *    `registerKeybinding` 顶掉 ⇒ **重启后仍然无键**，直到用户重新绑定或「恢复为默认」。
 *
 * 无键命令的键位显示：注册表里查不到绑定 ⇒ 快捷键页那行落到占位符 `—`（与「从未绑定过」同相）。
 */
export function clearKeybindingForCommand(commandId: string): void {
  for (let i = _bindings.length - 1; i >= 0; i--) {
    if (_bindings[i].command === commandId) {
      _bindings.splice(i, 1);
    }
  }
  _unboundCommands.add(commandId);
  CoreEvents.onDidChangeKeybindings.fire(); // 即便没有可删的绑定，抑制态本身也变了（UI 要刷新）
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

/* ── 用户文件形状（纯映射，零 IO）——persistence 只负责读写 ── */

/** `keybindings.json` 的一条——`key: ""` ＝ **清空标记**（这条命令不要键，见 `clearKeybindingForCommand`） */
export interface UserKeybindingEntry {
  command: string;
  key: string;
  when?: string;
}

/** 注册表 → 用户文件内容（纯函数）。
 *  清空标记**排在末尾**：同名命令若既有用户绑定又有标记，加载侧「后写者生效」⇒ 往返稳定。 */
export function buildUserKeybindingsFile(): UserKeybindingEntry[] {
  const entries: UserKeybindingEntry[] = [];
  for (const b of _bindings) {
    if (b.source !== "user") continue;
    const entry: UserKeybindingEntry = { command: b.command, key: b.key };
    if (b.when) entry.when = b.when;
    entries.push(entry);
  }
  for (const command of _unboundCommands) entries.push({ command, key: "" });
  return entries;
}

/** 用户文件内容 → 注册表（纯函数）——**先清用户态再重建**（用户覆盖优先级由 `registerKeybinding` 保证）。
 *  空 `key` ⇒ 清空标记；`key` 不是字符串（形状不对）或缺 `command` ⇒ **跳过**（⛔ 不当成清空——别把坏条目
 *  升级成一条用户没表达过的决定）。 */
export function applyUserKeybindingsFile(entries: UserKeybindingEntry[]): void {
  clearUserKeybindings();
  for (const kb of entries) {
    if (!kb || typeof kb.command !== "string" || kb.command === "") continue;
    if (typeof kb.key !== "string") continue;
    if (kb.key === "") { clearKeybindingForCommand(kb.command); continue; }
    registerKeybinding({ command: kb.command, key: kb.key, when: kb.when, source: "user" });
  }
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
