/**
 * 配置服务——对标 VS Code IConfigurationService。
 * Phase 5 柱子 2 + 柱子 6.3：User/Workspace scope 三层合并 + settings.json 读写。
 *
 * 三层优先级（对标 VS Code）：Workspace > User > Default
 * - Default：  plugin.json 里写的 default 值
 * - User：     全局 settings.json（appDataDir）
 * - Workspace： .linkdesk/settings.json（项目级）
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §柱子2 + §6.3
 * VS Code 对标：IConfigurationService.getValue / inspect
 * VS Code 源码：src/vs/platform/configuration/common/configuration.ts
 */

import {
  getMergedSchema,
  getConfigurationDefaults,
  type InspectResult,
} from "../../registry/ConfigurationRegistry";
// E5#41：消循环依赖——applyConfiguration 通过注册模式注入，不再直接 import ConfigurationApplier
let _configApplier: ((key: string, value: unknown) => void) | null = null;
export function registerConfigApplier(fn: typeof _configApplier): void { _configApplier = fn; }
import { read, write, getFilePath } from "./StorageService";
import { exists, readFile, writeFile, createDir, joinPath, appDataDir } from "../files/FileService";
import { deepEqual } from "../../utils/deepEqual"; // E5.8 bug 修复：diff 浅比较→深比较（settings.json 回写循环）

/* ── 三层缓存 ── */

let _userSettings: Record<string, unknown> = {};
let _workspaceSettings: Record<string, unknown> = {};
let _workspaceRoot: string | null = null;
let _initialized = false;
/** initConfigurationService 的进行中 Promise——StrictMode 双重 effect 时第二次调用等第一次完成 */
let _initPromise: Promise<void> | null = null;

/* ── 监听器 ── */

type ChangeListener = (key: string, value: unknown, scope: "user" | "workspace") => void;
const _changeListeners = new Set<ChangeListener>();

/* ── 初始化 ── */

/**
 * 初始化配置服务——App 启动时调用一次。
 * 加载 settings.json（User scope）。Workspace scope 等 WorkspaceService setWorkspaceRoot 后加载。
 */
export async function initConfigurationService(): Promise<void> {
  // 🔥 #59c fix：和 initPluginLoader 同样模式——return 进行中 Promise 防 StrictMode 竞态
  if (_initialized) return _initPromise ?? Promise.resolve();
  _initialized = true;

  return (_initPromise = (async () => {
  // Phase 5f：统一走 StorageService（不再自研 ensureTauri + fsApi + pathApi）
  const saved = await read<Record<string, unknown>>("settings");
  if (saved) _userSettings = saved;

  // 🔥 自愈（E5.8 bug 修复配套）：崩溃残留空 settings.json——localStorage 有数据但文件空/损坏 → 写回文件。
  // 否则编辑器"以 JSON 打开"看到空白文件，误以为设置丢失（write 双写 localStorage 幂等同数据，无害）。
  if (_userSettings && Object.keys(_userSettings).length > 0) {
    const filePath = await getFilePath("settings");
    if (!filePath) return; // 非 Electron 环境——无文件路径
    const raw = await readFile(filePath);
    if (!raw.trim()) await write("settings", _userSettings);
  }
  })());
}

/* ── settings.json 文件变更生效闭环（E5.8#0d.5）── */

/** 纯函数——计算 next 相对 current 的变更 key 列表（value = next[key]；被删 key 的 value 为 undefined）。可单测。 */
export function diffUserSettings(
  current: Record<string, unknown>,
  next: Record<string, unknown>,
): Array<{ key: string; value: unknown }> {
  const changed: Array<{ key: string; value: unknown }> = [];
  const allKeys = new Set([...Object.keys(current), ...Object.keys(next)]);
  for (const key of allKeys) {
    // 🔥 深比较——对象/数组值每次 JSON 重新解析引用不同，浅比较 `===` 恒判"变更"→回写无限循环（800MB 冻结）
    if (key in current && key in next && deepEqual(current[key], next[key])) continue;
    changed.push({ key, value: key in next ? next[key] : undefined });
  }
  return changed;
}

/**
 * 重读 settings.json 文件并应用到内存——外部编辑（编辑器标签页保存）后即时生效。
 * 直读文件不走 StorageService.read（其优先 localStorage——外部写入后壳侧 localStorage 陈旧）。
 * 零变更则零通知（防自写自触发循环）；非法 JSON 不覆盖内存（等下一次保存）。
 */
export async function reloadUserSettings(): Promise<void> {
  const filePath = await getFilePath("settings");
  if (!filePath) return; // 非 Electron 环境（npm run dev 浏览器模式）

  let raw: string;
  try {
    raw = await readFile(filePath);
  } catch {
    return; // 文件不存在/读失败——保持内存现状
  }

  let next: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return; // 非法 JSON——不覆盖内存
    next = parsed as Record<string, unknown>;
  } catch {
    return;
  }

  const changed = diffUserSettings(_userSettings, next);
  if (changed.length === 0) return; // 零变更零通知——防自写自触发循环

  for (const { key, value } of changed) {
    if (key in next) _userSettings[key] = value;
    else delete _userSettings[key];
  }

  for (const { key } of changed) {
    // 被删 key 广播生效值（回落到 default/workspace）——消费方收到可直接用
    const value = key in next ? next[key] : getConfigurationValue<unknown>(key);
    for (const fn of _changeListeners) {
      try { fn(key, value, "user"); } catch { /* 静默——避免一个 listener 崩溃阻塞其他 */ }
    }
    _configApplier?.(key, value);
  }

  // 双写同步 localStorage——StorageService.write 同时写文件 + localStorage（F5/重启安全，防读到旧配置）
  await write("settings", _userSettings);
}

let _settingsWatcherStarted = false;
let _reloadDebounceTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 挂 settings.json 文件监听——外部编辑（编辑器标签页保存）→ 重读生效。App mount 前调用一次。
 * 幂等（防 StrictMode 双重调用）；非 Electron 环境静默跳过。
 *
 * E5.8#59（审计#7）：去抖——壳自写持久化（set/batch 写文件）会连发 watcher 事件，
 * 立即 reload 会读到「上一写尚未落盘」的中间态文件 → 与已同步更新的内存产生假 diff →
 * 对每个「被删 key」重复调 _configApplier → 复位路径 6 覆盖 key 各多广播 1 次 theme:changed（7 连发）。
 * 去抖合并自写突发（P1+P2）→ 事件停息后读到的文件 = 内存 → diff 空 → 零重放；
 * 外部编辑（编辑器保存 settings.json）仍生效，仅延迟 ~80ms。
 */
export async function initUserSettingsWatcher(): Promise<void> {
  if (_settingsWatcherStarted) return;
  _settingsWatcherStarted = true;

  const watcher = window.linkdesk?.filesystem?.watch;
  if (!watcher) return; // 非 Electron 环境——无 window.linkdesk

  try {
    const dir = await appDataDir();
    await watcher(dir, (e: { path: string; type: string }) => {
      if (e.type === "deleted") return;
      const basename = String(e.path).split(/[\\/]/).pop();
      if (basename !== "settings.json") return;
      clearTimeout(_reloadDebounceTimer);
      _reloadDebounceTimer = setTimeout(() => { void reloadUserSettings(); }, 80);
    });
  } catch (e) {
    // watcher 启动失败不阻塞 mount——降级为"保存后重启生效"（现状）
    console.warn("[ConfigurationService] settings.json watcher 启动失败:", e);
  }
}

/* ── 读取：三层合并 ── */

/**
 * 获取配置值——自动 Workspace > User > configurationDefaults > Default 合并。
 * VS Code 对标：IConfigurationService.getValue<T>(key)
 */
export function getConfigurationValue<T>(key: string): T {
  // 1. Workspace scope（最高优先级）
  if (key in _workspaceSettings) {
    const v = _validateEnum(key, _workspaceSettings[key], "workspace");
    if (v !== undefined) return v as T;
  }

  // 2. User scope
  if (key in _userSettings) {
    const v = _validateEnum(key, _userSettings[key], "user");
    if (v !== undefined) return v as T;
  }

  // 3. configurationDefaults（盲区 2：弱默认值——插件建议但用户可覆盖）
  const configDefaults = getConfigurationDefaults();
  if (key in configDefaults) {
    return configDefaults[key] as T;
  }

  // 4. 插件 default（plugin.json 声明的）
  const schema = getMergedSchema();
  if (schema[key]) {
    return schema[key].default as T;
  }

  // 5. 系统 fallback（硬编码兜底）
  return getSystemFallback<T>(key);
}

/**
 * E5.8#56：判断配置是否被显式写过（presence 语义）——User/Workspace scope 存在该 key 即真。
 * 与 getConfigurationValue（合并 default 层）不同：default 值 ≠「用户写过」。
 * 消费场景：getAppearanceOverrides 玻璃 neutral 门控——glassBlur 拖到 0（关闭）/ glassOpacity 拖到 1（不透明）
 * 是用户显式意图，presence 覆盖端点值；reset 摘除 key 后回主题基线。对标 VS Code inspect().userValue。
 */
export function hasConfigurationValue(key: string): boolean {
  return key in _userSettings || key in _workspaceSettings;
}

/**
 * 检查某个 key 的完整来源——对标 VS Code IConfigurationService.inspect<T>()。
 * 返回每一层的值，让 Settings Editor 可以显示"Workspace 覆盖了 User"。
 */
export function inspectConfiguration<T>(key: string): InspectResult<T> {
  const schema = getMergedSchema();
  const prop = schema[key];

  return {
    key,
    defaultValue: (prop?.default ?? getSystemFallback(key)) as T,
    userValue: key in _userSettings ? (_userSettings[key] as T) : undefined,
    workspaceValue: key in _workspaceSettings ? (_workspaceSettings[key] as T) : undefined,
    effectiveValue: getConfigurationValue<T>(key),
  };
}

/* ── 写入 ── */

/**
 * 写入配置值——明确指定 scope。
 * VS Code 对标：ConfigurationTarget.USER / ConfigurationTarget.WORKSPACE
 */
export async function setConfigurationValue(
  key: string,
  value: unknown,
  scope: "user" | "workspace" = "user"
): Promise<void> {
  // M3：写入前 enum 验证——非法的主题 ID/语言代码等拒绝写入
  const schema = getMergedSchema();
  const prop = schema[key];
  if (prop?.enum && !prop.enum.includes(value as string)) {
    console.warn(`[ConfigurationService] "${key}: ${value}" 不在 enum [${prop.enum}] 中——拒绝写入`);
    return;
  }

  if (scope === "workspace") {
    _workspaceSettings[key] = value;
    await _persistWorkspace();
  } else {
    _userSettings[key] = value;
    await _persistUser();
  }

  // 通知监听器
  for (const fn of _changeListeners) {
    try { fn(key, value, scope); } catch (e) { console.error("[ConfigurationService] 监听器异常:", e); }
  }

  // Phase 5f：ConfigurationApplier——自动调 onApply，组件无需手动订阅
  _configApplier?.(key, value);
}

/**
 * E3f #53b：重置配置值——删除用户覆盖，回退到 default。
 * 对标 VS Code "Reset Setting"——移除 User scope 的 key，下次读取自动走 default 层。
 */
export async function resetConfigurationValue(
  key: string,
  scope: "user" | "workspace" = "user"
): Promise<void> {
  if (scope === "workspace") {
    delete _workspaceSettings[key];
    await _persistWorkspace();
  } else {
    delete _userSettings[key];
    await _persistUser();
  }

  // 取回退后的值（走 default 层）
  const effective = getConfigurationValue(key);

  // 通知监听器——SettingsView 刷新
  for (const fn of _changeListeners) {
    try { fn(key, effective, scope); } catch (e) { console.error("[ConfigurationService] 监听器异常:", e); }
  }

  // ConfigurationApplier——重置后自动调 onApply
  _configApplier?.(key, effective);
}

/* ── E5.8#59：批量写/复位——播种/复位路径广播收敛 ── */

/**
 * E5.8#59（审计#7）：批量写配置——一次动作收敛为单次持久化 + 单次 applier。
 * 播种/复位先例：appearanceMode→custom 6 覆盖连写、mixMode→mix 6 来源连写——每连 setConfigurationValue
 * 各自 await + 各触发一次 applier → N 次 applyRecipe 全量重合并 + N 次 theme:changed 广播（脱出窗多池放大中间态）。
 * 本 API：同步写内存全部 key → 单次持久化 → 逐 key 通知监听器（SettingsView 逐行刷新）→ 单次 applier（末 key 代表性）。
 * 各 key onApply 全量读生效配置（壳外观覆盖 onApply = applyThemeIfReady），末 key 触发 = 读到完整终态，一次广播即收敛。
 * enum 逐 key 校验——非法 key 跳过（行为对齐 setConfigurationValue）；全部非法则零写入零广播。
 */
export async function setConfigurationValueBatch(
  entries: Array<{ key: string; value: unknown }>,
  scope: "user" | "workspace" = "user"
): Promise<void> {
  const valid: Array<{ key: string; value: unknown }> = [];
  const schema = getMergedSchema();
  for (const { key, value } of entries) {
    const prop = schema[key];
    if (prop?.enum && !prop.enum.includes(value as string)) {
      console.warn(`[ConfigurationService] "${key}: ${value}" 不在 enum [${prop.enum}] 中——跳过`);
      continue;
    }
    valid.push({ key, value });
  }
  if (valid.length === 0) return;

  if (scope === "workspace") {
    for (const { key, value } of valid) _workspaceSettings[key] = value;
    await _persistWorkspace();
  } else {
    for (const { key, value } of valid) _userSettings[key] = value;
    await _persistUser();
  }

  for (const { key, value } of valid) {
    for (const fn of _changeListeners) {
      try { fn(key, value, scope); } catch (e) { console.error("[ConfigurationService] 监听器异常:", e); }
    }
  }

  // 收敛——单次 applier（末 key 代表性：各 onApply 全量读生效态，终态一致）
  const last = valid[valid.length - 1];
  _configApplier?.(last.key, last.value);
}

/**
 * E5.8#59（审计#7）：批量复位——删除多个用户覆盖 key → 单次持久化 + 单次 applier。
 * 对称于 setConfigurationValueBatch（appearanceMode→followTheme 6 覆盖删 / mixMode→recipe 6 来源删）。
 * 未被显式写过的 key 跳过（无删除动作零广播）；删除后按回退生效值通知监听器。
 */
export async function resetConfigurationValueBatch(
  keys: readonly string[],
  scope: "user" | "workspace" = "user"
): Promise<void> {
  const target = scope === "workspace" ? _workspaceSettings : _userSettings;
  const present = keys.filter((key) => key in target);
  if (present.length === 0) return;

  for (const key of present) delete target[key];
  if (scope === "workspace") await _persistWorkspace();
  else await _persistUser();

  for (const key of present) {
    const effective = getConfigurationValue(key);
    for (const fn of _changeListeners) {
      try { fn(key, effective, scope); } catch (e) { console.error("[ConfigurationService] 监听器异常:", e); }
    }
  }

  const last = present[present.length - 1];
  _configApplier?.(last, getConfigurationValue(last));
}

/* ── 监听变化 ── */

/** 订阅配置变化——对标 VS Code onDidChangeConfiguration */
export function onDidChangeConfiguration(fn: ChangeListener): () => void {
  _changeListeners.add(fn);
  return () => { _changeListeners.delete(fn); };
}

/* ── Workspace scope 管理 ── */

/**
 * 设置当前 workspace 根路径——Phase 6 WorkspaceService 调用。
 * Phase 5 定义接口签名，Phase 6 传参消费。
 */
export async function setWorkspaceRoot(rootPath: string | null): Promise<void> {
  _workspaceRoot = rootPath;
  if (!rootPath) {
    _workspaceSettings = {};
    return;
  }

  // E2c #19c：Workspace scope 统一走 FileService（不在 appDataDir 下，不走 StorageService）
  const wsSettingsPath = await joinPath(rootPath, ".linkdesk", "settings.json");
  try {
    if (await exists(wsSettingsPath)) {
      const raw = await readFile(wsSettingsPath);
      _workspaceSettings = JSON.parse(raw);
    } else {
      _workspaceSettings = {};
    }
  } catch {
    _workspaceSettings = {};
  }
}

/** 获取当前 workspace 根路径 */
export function getWorkspaceRoot(): string | null {
  return _workspaceRoot;
}

/* ── 获取完整 settings（JSON 编辑器用） ── */

/** 获取 User scope 的完整配置对象——对标 VS Code "Open Settings (JSON)" */
export function getUserSettings(): Record<string, unknown> {
  return { ..._userSettings };
}

/** 获取 Workspace scope 的完整配置对象 */
export function getWorkspaceSettings(): Record<string, unknown> {
  return { ..._workspaceSettings };
}

/* ── 持久化 ── */

/** User scope 持久化——Phase 5f 归一化到 StorageService */
async function _persistUser(): Promise<void> {
  await write("settings", _userSettings);
}

/**
 * Workspace scope 持久化——写 .linkdesk/settings.json。
 * E2c #19c：统一走 FileService。
 */
async function _persistWorkspace(): Promise<void> {
  if (!_workspaceRoot) return;

  try {
    const linkdeskDir = await joinPath(_workspaceRoot, ".linkdesk");
    if (!(await exists(linkdeskDir))) {
      await createDir(linkdeskDir);
    }
    const wsSettingsPath = await joinPath(linkdeskDir, "settings.json");
    await writeFile(wsSettingsPath, JSON.stringify(_workspaceSettings, null, 2));
  } catch (e) {
    console.warn("[ConfigurationService] 写入 .linkdesk/settings.json 失败:", e);
  }
}

/* ── M3：enum 验证 —— */

/** 验证 enum 值——无效时 warn + 返回 undefined，调用方 fallthrough 到默认值。不删缓存——enum 可能瞬态为空（插件重载）。 */
function _validateEnum(key: string, value: unknown, _scope: "user" | "workspace"): unknown {
  const schema = getMergedSchema();
  const prop = schema[key];
  if (!prop?.enum) return value;
  if (prop.enum.includes(value as string)) return value;

  console.warn(`[ConfigurationService] "${key}: ${value}" 不在 enum [${prop.enum}] 中——本次回退到默认值`);
  return undefined;
}

/* ── 系统兜底 ── */

/**
 * 硬编码的系统 fallback 值——对标 VS Code defaultThemeColors。
 * 当所有层都没有值时，这些值保证 UI 不崩。
 */
function getSystemFallback<T>(key: string): T {
  const fallbacks: Record<string, unknown> = {
    // E5.8#50.21：系统兜底 = 壳内置配方 id "dark"（legacy "Dark" 已随迁移归一化落盘）
    "app.theme": "dark",
    "app.language": "zh",
  };
  return (fallbacks[key] ?? undefined) as T;
}

/** 清空缓存（测试用） */
export function clearConfigurationCache(): void {
  _userSettings = {};
  _workspaceSettings = {};
  _workspaceRoot = null;
  _initialized = false;
}

/**
 * E5.6#11-fix7：跨上下文桥接——池侧 ConfigurationService 是独立实例，本地 cache 为空，listener 永远不触发。
 * 壳 IpcBridgeHandler 在配置变更时通过 IpcBridge 广播 config:changed 事件（含 key/value），
 * 池侧 preload 内置 _configCache 回放，此函数供 pool-main.tsx 桥接到本地 ConfigurationService：
 *   1. 更新 _userSettings[key]——让 getConfigurationValue 读到最新值
 *   2. 通知所有 _changeListeners——让 useConfigurationValue/subscribeToConfiguration 重渲染
 */
export function applyRemoteConfigChange(key: string, value: unknown): void {
  if (_userSettings[key] === value && key in _userSettings) return;
  _userSettings[key] = value;
  _changeListeners.forEach((fn) => {
    try { fn(key, value, "user"); } catch { /* 静默——避免一个 listener 崩溃阻塞其他 */ }
  });
}
