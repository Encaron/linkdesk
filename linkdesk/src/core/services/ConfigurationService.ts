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
} from "../registry/ConfigurationRegistry";
// E5#41：消循环依赖——applyConfiguration 通过注册模式注入，不再直接 import ConfigurationApplier
let _configApplier: ((key: string, value: unknown) => void) | null = null;
export function registerConfigApplier(fn: typeof _configApplier): void { _configApplier = fn; }
import { read, write } from "./StorageService";
import { exists, readFile, writeFile, createDir, joinPath } from "./FileService";

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
  })());
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
    "app.theme": "Dark",
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
