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
import { executeCommand, hasHandler } from "./CommandRegistry";
import { readFile, writeFile, exists, watch, appDataDir, joinPath } from "../services/FileService";
import { normalizePath } from "../utils/pathUtils";
import { CoreEvents, CUSTOM_EVENTS } from "../react/CoreEvents";

/** E5#102c: chord 第二键等待超时（ms） */
const CHORD_TIMEOUT = 2000;

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
  /** E3f #59-F：执行时透传给 executeCommand 的额外参数 */
  args?: unknown[];
}

/** 快捷键冲突——E2c #17a：≥2 个 binding 映射到同一个 key */
export interface KeybindingConflict {
  key: string;
  bindings: Keybinding[];
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

/** E5.5#7-p8：主进程↔壳键盘事件纯数据形状——不依赖 KeyboardEvent DOM 对象 */
export interface KeyboardInput {
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  key: string;
  code: string;
}

/** 特殊键映射——KeyboardEvent.key → 规范化短名 */
const KEY_MAP: Record<string, string> = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  Escape: "escape", Enter: "enter", Tab: "tab", Backspace: "backspace",
  Delete: "delete", Home: "home", End: "end", PageUp: "pageup", PageDown: "pagedown",
  " ": "space",
};

const MODIFIER_KEYS = new Set(["control", "shift", "alt", "meta"]);
const MODIFIER_ORDER = ["ctrl", "shift", "alt", "meta"];

/** 纯数据 → 规范化快捷键字符串——主进程和壳侧共用 */
export function keyboardInputToKeyString(input: KeyboardInput): string {
  const parts: string[] = [];
  if (input.ctrlKey) parts.push("ctrl");
  if (input.shiftKey) parts.push("shift");
  if (input.altKey) parts.push("alt");
  if (input.metaKey) parts.push("meta");

  if (!input.key) return "";
  let key = KEY_MAP[input.key] ?? input.key.toLowerCase();
  // E5.7#79：物理键归一化——"+" 是 "=" 的上档字符（US 布局），Ctrl+Shift+=（= Ctrl+加号）
  // 与 Ctrl+= 同物理键。"+" 在键位串中是分隔符（normalizeKey 无法表达）——按键侧归一化为 "="。
  if (key === "+") key = "=";
  if (MODIFIER_KEYS.has(key)) return "";

  parts.push(key);
  return parts.sort((a, b) => {
    const ai = MODIFIER_ORDER.indexOf(a);
    const bi = MODIFIER_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  }).join("+");
}

/**
 * KeyboardEvent → 规范化快捷键字符串。
 * 对标 VS Code 的键盘事件到 keybinding 的映射。
 */
export function keyboardEventToKeyString(e: KeyboardEvent): string {
  return keyboardInputToKeyString({
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    key: e.key,
    code: e.code,
  });
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

/** 重置 chord 状态——超时/第二键匹配/不匹配时调用。顺带通知状态栏清除提示。 */
function resetChord(): void {
  if (_chordState.timer) {
    clearTimeout(_chordState.timer);
  }
  const wasPending = _chordState.isPending;
  _chordState.isPending = false;
  _chordState.firstKey = "";
  _chordState.timer = null;
  if (wasPending) {
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.CHORD_CHANGED, {
      detail: { isPending: false },
    }));
  }
}

/* ── User keybindings.json 持久化（E2c #17）── */

const KEYBINDINGS_FILENAME = "keybindings.json";

/** 快捷键文件完整路径——appDataDir + keybindings.json */
let _keybindingsPath: string | null = null;

async function getKeybindingsPath(): Promise<string | null> {
  if (_keybindingsPath) return _keybindingsPath;
  const dir = await appDataDir();
  if (!dir) return null;
  _keybindingsPath = await joinPath(dir, KEYBINDINGS_FILENAME);
  return _keybindingsPath;
}

/** 清除所有用户快捷键（source === "user"）——重载 keybindings.json 前调用 */
function clearUserKeybindings(): void {
  for (let i = _bindings.length - 1; i >= 0; i--) {
    if (_bindings[i].source === "user") {
      _bindings.splice(i, 1);
    }
  }
}

/**
 * 加载用户自定义快捷键——对标 VS Code keybindings.json。
 * 启动时调用一次；runtime 文件变动时 watch 自动重载。
 *
 * 不存在文件 → 用出厂默认（静默跳过）。
 * JSON 格式：`[{ "command": "...", "key": "...", "when?": "..." }]`
 */
async function loadUserKeybindings(): Promise<void> {
  const filePath = await getKeybindingsPath();
  if (!filePath) return;

  const fileExists = await exists(filePath);
  if (!fileExists) return;

  try {
    const raw = await readFile(filePath);
    const userBindings = JSON.parse(raw) as Array<{ command: string; key: string; when?: string }>;

    // 清除旧用户绑定 → 重新注册（用户覆盖出厂优先级由 registerKeybinding 保证）
    clearUserKeybindings();
    for (const kb of userBindings) {
      registerKeybinding({ command: kb.command, key: kb.key, when: kb.when, source: "user" });
    }
  } catch (e) {
    console.warn("[KeybindingRegistry] 读取 keybindings.json 失败:", e);
  }
}

/**
 * 保存用户快捷键到 keybindings.json——"Open Keybindings Settings" 命令调用。
 * 返回文件路径（null = Electron 环境不可用）。
 */
export async function saveUserKeybindings(): Promise<string | null> {
  const filePath = await getKeybindingsPath();
  if (!filePath) return null;

  const userBindings = _bindings
    .filter((b) => b.source === "user")
    .map((b) => {
      const entry: { command: string; key: string; when?: string } = { command: b.command, key: b.key };
      if (b.when) entry.when = b.when;
      return entry;
    });

  await writeFile(filePath, JSON.stringify(userBindings, null, 2));
  return filePath;
}

let _keybindingsWatcherUnsub: (() => void) | null = null;

/**
 * 监听 keybindings.json 文件变化——对标 VS Code 热更新。
 * 文件变动 → 300ms 防抖 → 重新加载 → fire onDidChangeKeybindings。
 * 文件被删除 → 清除用户绑定 → 回退出厂默认。
 */
async function watchUserKeybindings(): Promise<void> {
  if (_keybindingsWatcherUnsub) return; // 已监听

  const dir = await appDataDir();
  if (!dir) return;

  const filePath = await getKeybindingsPath();
  if (!filePath) return;

  let debounce: ReturnType<typeof setTimeout> | null = null;
  _keybindingsWatcherUnsub = await watch(dir, (event) => {
    // 只关心 keybindings.json
    const name = normalizePath(event.path).split("/").pop();
    if (name !== KEYBINDINGS_FILENAME) return;

    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const stillExists = await exists(filePath);
      if (!stillExists) {
        clearUserKeybindings();
        CoreEvents.onDidChangeKeybindings.fire();
        return;
      }
      await loadUserKeybindings();
      CoreEvents.onDidChangeKeybindings.fire();
    }, 300);
  });
}

/* ── 公开入口——App.tsx 启动时调用 ── */

/**
 * 初始化用户快捷键——加载 keybindings.json + 启动文件监听。
 * 对标 VS Code：keybindings.json 读写 + watch 热更新。
 * 在 mountGlobalKeybindings() 之后调用。
 */
export async function initUserKeybindings(): Promise<void> {
  await loadUserKeybindings();
  await watchUserKeybindings();
}

/**
 * 打开快捷键设置——通知 SettingsView 切换到快捷键 tab。
 * E3f #59：opts.query 非空时搜索框预填该命令名。
 * "workbench.action.openKeybindingsSettings" 命令的 handler。
 */
export async function openKeybindingsSettings(opts?: { query?: string }): Promise<void> {
  // 确保 keybindings.json 存在
  const filePath = await saveUserKeybindings();
  if (!filePath) {
    const dir = await appDataDir();
    if (dir) {
      const p = await joinPath(dir, KEYBINDINGS_FILENAME);
      await writeFile(p, "[]\n");
    }
  }
  // E3f #59-A：先打开设置标签页，等 mount 后再切换快捷键 tab
  window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.OPEN_SETTINGS));
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.OPEN_KEYBINDINGS_SETTINGS, {
      detail: { query: opts?.query },
    }));
  }, 100);
}

/* ── Registry ── */

const _bindings: Keybinding[] = [];

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

/* ── KeybindingResolver（E2c #17a）── */

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

/* ── 全局键盘事件处理 ── */

/** E3f #59-D：行内编辑活跃时阻止全局快捷键分发——防止 chord 状态机冲突 */
let _captureActive = false;
export function setKeybindingCaptureActive(active: boolean): void { _captureActive = active; }

/**
 * 🔥 检测当前聚焦元素是否为可编辑元素（input/textarea/select/contentEditable）。
 * 若是，快捷键分发应放行——让浏览器原生处理 Ctrl+C/V/A/Z 等。
 * 一劳永逸：新组件加原生 input 不需要手动设任何东西。
 */
export function isEditableElementFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select"
    || (el as HTMLElement).isContentEditable;
}

/**
 * 全局 keydown 处理器——对标 VS Code 的键盘事件分发。
 * 挂到 window 上，App 启动时调用一次。
 *
 * E2c #16：支持 chord（双键序列）——如 Ctrl+K Ctrl+S。
 */
export function handleKeyEvent(e: KeyboardEvent): boolean {
  if (_captureActive) return false; // E3f #59-D：行内编辑优先
  // 🔥 DOM 直检——不依赖组件手动设 context key，永不遗漏
  if (isEditableElementFocused()) return false;
  const keyString = keyboardEventToKeyString(e);
  if (!keyString) return false; // modifier 键自己

  // ── Chord 第二键 ──
  if (_chordState.isPending) {
    // 忽略重复的同一按键——键盘重复（key repeat）会发送相同的 keydown
    if (keyString === _chordState.firstKey) return true;
    const firstKey = _chordState.firstKey; // 保存——resetChord 会清掉
    resetChord(); // 清除 timer + 清除状态栏提示
    const fullChord = `${firstKey} ${keyString}`;

    const winner = keybindingResolver.resolve(fullChord);
    if (winner && hasHandler(winner.command)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      executeCommand(winner.command, undefined, ...(winner.args ?? []));
      return true;
    }
    // chord 第二键不匹配 → 通知状态栏显示错误提示（对标 VS Code）
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.CHORD_CHANGED, {
      detail: { isPending: false, failedKey: keyString, firstKey },
    }));
    return false;
  }

  // ── Chord 第一键：检查此 key 是否有子 chord ──
  if (isChordPrefix(keyString)) {
    _chordState.isPending = true;
    _chordState.firstKey = keyString;
    _chordState.timer = setTimeout(resetChord, CHORD_TIMEOUT); // 2s 无第二键 → 取消
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.CHORD_CHANGED, {
      detail: { isPending: true, firstKey: keyString },
    }));
    e.preventDefault();
    return true; // 消费了事件——等待第二键
  }

  // ── 单键匹配——Resolver 仲裁（E2c #17a） ──
  const winner = keybindingResolver.resolve(keyString);
  if (winner && hasHandler(winner.command)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    executeCommand(winner.command, undefined, ...(winner.args ?? []));
    return true;
  }

  return false;
}

/**
 * E5.5#7-p8：主进程转发的键盘事件处理——纯数据输入，无 DOM event。
 * 逻辑与 handleKeyEvent 一致，但不调用 preventDefault/stopImmediatePropagation（无 event 对象）。
 * 返回 true 表示壳消费了此按键（应已 preventDefault 在主进程侧）。
 */
export function handleKeyInput(input: KeyboardInput): boolean {
  if (_captureActive) return false;
  if (isEditableElementFocused()) return false;
  const keyString = keyboardInputToKeyString(input);
  if (!keyString) return false;

  // ── Chord 第二键 ──
  if (_chordState.isPending) {
    if (keyString === _chordState.firstKey) return true;
    const firstKey = _chordState.firstKey;
    resetChord();
    const fullChord = `${firstKey} ${keyString}`;
    const winner = keybindingResolver.resolve(fullChord);
    if (winner && hasHandler(winner.command)) {
      executeCommand(winner.command, undefined, ...(winner.args ?? []));
      return true;
    }
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.CHORD_CHANGED, {
      detail: { isPending: false, failedKey: keyString, firstKey },
    }));
    return false;
  }

  // ── Chord 第一键 ──
  if (isChordPrefix(keyString)) {
    _chordState.isPending = true;
    _chordState.firstKey = keyString;
    _chordState.timer = setTimeout(resetChord, CHORD_TIMEOUT);
    window.dispatchEvent(new CustomEvent(CUSTOM_EVENTS.CHORD_CHANGED, {
      detail: { isPending: true, firstKey: keyString },
    }));
    return true;
  }

  // ── 单键匹配 ──
  const winner = keybindingResolver.resolve(keyString);
  if (winner && hasHandler(winner.command)) {
    executeCommand(winner.command, undefined, ...(winner.args ?? []));
    return true;
  }

  return false;
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

  // E5.5#7-p7：接收主进程 before-input-event 转发的快捷键
  const linkdesk = (window as any).linkdesk;
  let forwardCleanup: (() => void) | null = null;
  if (linkdesk?.keybindings?.onForwardedEvent) {
    forwardCleanup = linkdesk.keybindings.onForwardedEvent((input: KeyboardInput) => {
      handleKeyInput(input);
    });
  }

  // E5.5#7-p7：同步快捷键表到主进程（异步——keybindings 可能尚未全部注册）
  const doSync = () => {
    if (linkdesk?.keybindings?.syncToMainProcess) {
      linkdesk.keybindings.syncToMainProcess(getKeybindingSyncData());
    }
  };
  // 首次同步——稍延迟，等插件 keybindings 注册完毕
  setTimeout(doSync, 0);
  // 快捷键变更时重同步
  const _onChangeCleanup = CoreEvents.onDidChangeKeybindings.event(doSync);

  return () => {
    window.removeEventListener("keydown", handler, true);
    if (forwardCleanup) forwardCleanup();
    if (_onChangeCleanup) _onChangeCleanup();
  };
}

/** 清空注册表（测试用） */
export function clearKeybindings(): void {
  _bindings.length = 0;
  _keybindingsPath = null;
  if (_keybindingsWatcherUnsub) {
    _keybindingsWatcherUnsub();
    _keybindingsWatcherUnsub = null;
  }
  resetChord();
}
