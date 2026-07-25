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
import { readFile, writeFile, exists, watchFile, appDataDir, joinPath } from "./FileService";
import { CoreEvents } from "./CoreEvents";

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
async function saveUserKeybindings(): Promise<string | null> {
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
  _keybindingsWatcherUnsub = await watchFile(dir, (event) => {
    // 只关心 keybindings.json
    const name = event.path.replace(/\\/g, "/").split("/").pop();
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
 * 打开快捷键设置文件——确保文件存在，返回路径供外部编辑器打开。
 * "workbench.action.openKeybindingsSettings" 命令的 handler。
 */
export async function openKeybindingsSettings(): Promise<string | null> {
  const filePath = await saveUserKeybindings();
  // 首次打开：文件尚不存在时 saveUserKeybindings 会写入空数组 `[]`，保证文件已创建
  if (!filePath) {
    // 兜底：文件还没创建过 → 写一个空数组进去
    const dir = await appDataDir();
    if (dir) {
      const p = await joinPath(dir, KEYBINDINGS_FILENAME);
      await writeFile(p, "[]\n");
      return p;
    }
  }
  return filePath;
}

/* ── Registry ── */

const _bindings: Keybinding[] = [];

/** 注册快捷键——插件加载时 / 用户 keybindings.json 加载时调用。
 *  E2c #17a：允许多个 binding 映射到同一个 key（冲突由 Resolver 在 dispatch 时仲裁）。 */
export function registerKeybinding(binding: Keybinding): void {
  _bindings.push({ ...binding, key: normalizeKey(binding.key) });
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
    resetChord(); // 清除 timer
    const fullChord = `${_chordState.firstKey} ${keyString}`;

    const winner = keybindingResolver.resolve(fullChord);
    if (winner) {
      e.preventDefault();
      e.stopImmediatePropagation();
      executeCommand(winner.command);
      return true;
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

  // ── 单键匹配——Resolver 仲裁（E2c #17a） ──
  const winner = keybindingResolver.resolve(keyString);
  if (winner) {
    e.preventDefault();
    e.stopImmediatePropagation();
    executeCommand(winner.command);
    return true;
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
  _keybindingsPath = null;
  if (_keybindingsWatcherUnsub) {
    _keybindingsWatcherUnsub();
    _keybindingsWatcherUnsub = null;
  }
  resetChord();
}
