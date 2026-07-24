/**
 * 快捷键注册表——对标 VS Code KeybindingService。
 * Phase 5 柱子 6.2：插件声明 contributes.keybindings → 全局键盘事件分发。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §6.2
 * VS Code 对标：IKeybindingService + keybindings.json
 * VS Code 源码：src/vs/platform/keybinding/common/keybinding.ts
 *
 * 优先级：用户 keybindings.json > 插件 declaration > 内置默认
 *
 * ═══════════════════════════════════════════════════════════════
 * 职责分工（Phase 5c 定规）：
 *
 * App.tsx capture handler  →  壳级快捷键（Ctrl+,, Ctrl+Shift+P 等）
 *   - 始终可用，不依赖上下文
 *   - matched 时调用 stopImmediatePropagation——阻止本 Registry 重复触发
 *
 * KeybindingRegistry        →  插件快捷键（contributes.keybindings）
 *   - 带 when 条件，上下文敏感
 *   - 只在 App.tsx handler 未匹配时触发（它调用 stopImmediatePropagation）
 *
 * 两个 handler 都在 capture phase。App.tsx 先注册（render 阶段 useEffect），
 * 本 Registry 后注册（startup useEffect 内 mountGlobalKeybindings）→ App.tsx 优先。
 *
 * ⚠️ 顺序依赖：如果未来有工具/服务需要在 App.tsx 之前拦截所有按键，
 * 它必须在 render 阶段注册（早于 App.tsx useEffect）。
 * 不要依赖"恰好先注册"的隐性顺序——每个 handler 必须用 stopImmediatePropagation
 * 显式声明"我处理了这个键，别人不要管"。
 * ═══════════════════════════════════════════════════════════════
 */

import { ContextKeyService } from "./ContextKeyService";
import { executeCommand } from "./CommandRegistry";

/* ── 类型 ── */

export interface Keybinding {
  /** 命令 ID */
  command: string;
  /** 快捷键字符串——如 "ctrl+k" / "ctrl+shift+b" */
  key: string;
  /** context key when 条件 */
  when?: string;
  /** 来源：user / plugin / builtin——同 key 时 user 优先 */
  source: "user" | "plugin" | "builtin";
  /** 插件 ID——卸载时精确匹配（B3 fix：原实现 source === "plugin" 会误删所有插件快捷键） */
  pluginId?: string;
}

/* ── 规范化 ── */

/**
 * 规范化快捷键字符串 → 可比较的形式。
 * "Ctrl+K" → "ctrl+k", "CTRL+SHIFT+B" → "ctrl+shift+b"
 */
function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .split("+")
    .map((k) => k.trim())
    .sort((a, b) => {
      // modifiers first: ctrl > shift > alt > meta
      const order = ["ctrl", "shift", "alt", "meta"];
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    })
    .join("+");
}

/**
 * KeyboardEvent → 规范化快捷键字符串。
 * 对标 VS Code 的键盘事件到 keybinding 的映射。
 */
function keyboardEventToKeyString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("ctrl");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  if (e.metaKey) parts.push("meta");

  // 特殊键映射
  const keyMap: Record<string, string> = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    Escape: "escape", Enter: "enter", Tab: "tab", Backspace: "backspace",
    Delete: "delete", Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown",
    " ": "space",
  };

  const key = keyMap[e.key] ?? e.key.toLowerCase();
  // 不把 modifier 键自己注册为快捷键
  if (["control", "shift", "alt", "meta"].includes(key)) return "";

  parts.push(key);
  return parts.sort((a, b) => {
    const order = ["ctrl", "shift", "alt", "meta"];
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  }).join("+");
}

/* ── Chord 状态机（E2c #16）── */

interface ChordState {
  isPending: boolean;
  firstKey: string;
  timer: ReturnType<typeof setTimeout> | null;
}

const _chordState: ChordState = {
  isPending: false,
  firstKey: "",
  timer: null,
};

/** 检查 key 是否是 chord 的第一键——有已注册的 binding 以此 key 开头 */
function isChordPrefix(normalizedKey: string): boolean {
  return _bindings.some((b) => b.key.startsWith(normalizedKey + " "));
}

/** 重置 chord 状态——超时或第二键不匹配时调用 */
function resetChord(): void {
  if (_chordState.timer) {
    clearTimeout(_chordState.timer);
  }
  _chordState.isPending = false;
  _chordState.firstKey = "";
  _chordState.timer = null;
}

/* ── Registry ── */

const _bindings: Keybinding[] = [];

/** 注册快捷键——插件加载时 / 用户 keybindings.json 加载时调用 */
export function registerKeybinding(binding: Keybinding): void {
  const normalized = { ...binding, key: normalizeKey(binding.key) };

  // 同 key → 优先级：user > plugin > builtin
  const existingIdx = _bindings.findIndex((b) => b.key === normalized.key);
  if (existingIdx !== -1) {
    const existing = _bindings[existingIdx];
    const priorityOrder = { user: 3, plugin: 2, builtin: 1 };
    if (priorityOrder[normalized.source] > priorityOrder[existing.source]) {
      _bindings[existingIdx] = normalized;
    }
    // 否则保留已有（已有优先级更高）
    return;
  }

  _bindings.push(normalized);
}

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

/** 使用指定快捷键 */
export function findKeybindingForCommand(commandId: string): Keybinding | undefined {
  return _bindings.find((b) => b.command === commandId);
}

/* ── 全局键盘事件处理 ── */

/**
 * 全局 keydown 处理器——对标 VS Code 的键盘事件分发。
 * 挂到 window 上，App 启动时调用一次。
 *
 * E2c #16：支持 chord（双键序列）——如 Ctrl+K Ctrl+S。
 */
export function handleKeyEvent(e: KeyboardEvent): boolean {
  const keyString = keyboardEventToKeyString(e);
  if (!keyString) return false; // modifier 键自己

  // ── Chord 第二键 ──
  if (_chordState.isPending) {
    resetChord(); // 清除 timer（already set）
    const fullChord = `${_chordState.firstKey} ${keyString}`;

    // 检查完整 chord 是否匹配
    for (let i = _bindings.length - 1; i >= 0; i--) {
      const binding = _bindings[i];
      if (binding.key === fullChord) {
        if (!ContextKeyService.matches(binding.when)) continue;
        e.preventDefault();
        e.stopImmediatePropagation();
        executeCommand(binding.command);
        return true;
      }
    }
    // chord 第二键不匹配 → 不消费事件
    return false;
  }

  // ── Chord 第一键：检查此 key 是否有子 chord ──
  if (isChordPrefix(keyString)) {
    _chordState.isPending = true;
    _chordState.firstKey = keyString;
    _chordState.timer = setTimeout(resetChord, 2000); // 2s 无第二键 → 取消
    e.preventDefault();
    return true; // 消费了事件——等待第二键
  }

  // ── 单键匹配 ──
  for (let i = _bindings.length - 1; i >= 0; i--) {
    const binding = _bindings[i];
    if (binding.key === keyString) {
      if (!ContextKeyService.matches(binding.when)) continue;
      e.preventDefault();
      e.stopImmediatePropagation();
      executeCommand(binding.command);
      return true;
    }
  }

  return false;
}

/**
 * 挂载全局键盘监听——App 启动时调用一次（在 App.tsx 壳级 handler 之后注册）。
 *
 * 只处理插件声明的 contributes.keybindings。壳级快捷键由 App.tsx 的
 * capture handler 拦截——它匹配后调用 stopImmediatePropagation，
 * 本 handler 不会收到。
 *
 * 返回 disposable 函数（测试/热重载用）。
 */
export function mountGlobalKeybindings(): () => void {
  const handler = (e: KeyboardEvent) => {
    handleKeyEvent(e);
  };
  window.addEventListener("keydown", handler, true); // capture phase——先于浏览器处理
  return () => {
    window.removeEventListener("keydown", handler, true);
  };
}

/** 清空注册表（测试用） */
export function clearKeybindings(): void {
  _bindings.length = 0;
  resetChord();
}
