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
} from "./ConfigurationRegistry";

/* ── 文件系统依赖（延迟注入——对标 PreferenceService 模式） ── */

let fsApi: typeof import("@tauri-apps/plugin-fs") | null = null;
let pathApi: typeof import("@tauri-apps/api/path") | null = null;

async function ensureTauri(): Promise<boolean> {
  if (!(window as any).__TAURI__) return false;
  if (fsApi && pathApi) return true;
  try {
    fsApi = await import("@tauri-apps/plugin-fs");
    pathApi = await import("@tauri-apps/api/path");
    return true;
  } catch {
    return false;
  }
}

/* ── 三层缓存 ── */

let _userSettings: Record<string, unknown> = {};
let _workspaceSettings: Record<string, unknown> = {};
let _workspaceRoot: string | null = null;
let _settingsPath: string | null = null;
let _initialized = false;

/* ── 监听器 ── */

type ChangeListener = (key: string, value: unknown, scope: "user" | "workspace") => void;
const _changeListeners = new Set<ChangeListener>();

/* ── 初始化 ── */

/**
 * 初始化配置服务——App 启动时调用一次。
 * 加载 settings.json（User scope）。Workspace scope 等 WorkspaceService setWorkspaceRoot 后加载。
 */
export async function initConfigurationService(): Promise<void> {
  if (_initialized) return;
  _initialized = true;

  const isTauri = await ensureTauri();

  if (isTauri && pathApi) {
    _settingsPath = await pathApi.join(await pathApi.appDataDir(), "settings.json");
  }

  // 加载 User scope settings.json
  if (isTauri && fsApi && _settingsPath) {
    try {
      if (await fsApi.exists(_settingsPath)) {
        const raw = await fsApi.readTextFile(_settingsPath);
        _userSettings = JSON.parse(raw);
      }
    } catch {
      console.warn("[ConfigurationService] settings.json 读取失败，使用默认值");
    }
  } else {
    // 浏览器模式——localStorage
    try {
      const raw = localStorage.getItem("v3_settings");
      if (raw) _userSettings = JSON.parse(raw);
    } catch { /* ignore */ }
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
    return _workspaceSettings[key] as T;
  }

  // 2. User scope
  if (key in _userSettings) {
    return _userSettings[key] as T;
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
  if (scope === "workspace") {
    _workspaceSettings[key] = value;
    await _persistWorkspace();
  } else {
    _userSettings[key] = value;
    await _persistUser();
  }

  // 通知监听器
  for (const fn of _changeListeners) {
    try { fn(key, value, scope); } catch { /* 监听器异常不阻断 */ }
  }
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

  // 加载 .linkdesk/settings.json
  if (await ensureTauri() && fsApi && pathApi) {
    const wsSettingsPath = await pathApi.join(rootPath, ".linkdesk", "settings.json");
    try {
      if (await fsApi.exists(wsSettingsPath)) {
        const raw = await fsApi.readTextFile(wsSettingsPath);
        _workspaceSettings = JSON.parse(raw);
      } else {
        _workspaceSettings = {};
      }
    } catch {
      _workspaceSettings = {};
    }
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

async function _persistUser(): Promise<void> {
  // 始终写 localStorage
  try {
    localStorage.setItem("v3_settings", JSON.stringify(_userSettings, null, 2));
  } catch { /* ignore */ }

  // Tauri 环境写文件
  if (!(await ensureTauri()) || !fsApi || !_settingsPath) return;
  try {
    const dir = _settingsPath.substring(0, _settingsPath.lastIndexOf("\\"));
    if (dir && !(await fsApi.exists(dir))) {
      await fsApi.mkdir(dir, { recursive: true });
    }
    await fsApi.writeTextFile(_settingsPath, JSON.stringify(_userSettings, null, 2));
  } catch (e) {
    console.warn("[ConfigurationService] 写入 settings.json 失败:", e);
  }
}

async function _persistWorkspace(): Promise<void> {
  if (!_workspaceRoot) return;
  if (!(await ensureTauri()) || !fsApi || !pathApi) return;
  try {
    const linkdeskDir = await pathApi.join(_workspaceRoot, ".linkdesk");
    if (!(await fsApi.exists(linkdeskDir))) {
      await fsApi.mkdir(linkdeskDir, { recursive: true });
    }
    const wsSettingsPath = await pathApi.join(linkdeskDir, "settings.json");
    await fsApi.writeTextFile(wsSettingsPath, JSON.stringify(_workspaceSettings, null, 2));
  } catch (e) {
    console.warn("[ConfigurationService] 写入 .linkdesk/settings.json 失败:", e);
  }
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
    "terminal.timestampFormat": "HH:mm:ss:fff",
    "terminal.showEcho": true,
    "terminal.showLineNumbers": true,
    "terminal.separateSystemLog": true,
    "terminal.lineEnding": "\r\n",
    "terminal.autoRepeat": false,
    "terminal.repeatInterval": 1000,
    "terminal.autoClear": false,
    "terminal.receiveMode": "text",
    "terminal.receiveCoding": "UTF-8",
    "terminal.sendMode": "text",
    "terminal.sendCoding": "UTF-8",
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
