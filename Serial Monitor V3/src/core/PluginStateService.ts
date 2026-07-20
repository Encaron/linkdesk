/**
 * 插件私有存储服务——对标 VS Code ExtensionContext.globalState / workspaceState。
 * Phase 5 盲区 4（P1）：插件需要存"上次波特率""最近打开文件"等私有数据。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §盲区4
 *
 * 底层存储：settings.json 的 pluginStates 段。
 * { "pluginStates": { "terminal": { "lastBaudRate": "115200" }, "cad": { ... } } }
 */

/* ── 类型 ── */

type PluginStateStore = Record<string, Record<string, unknown>>;

/* ── 内存缓存 ── */

let _states: PluginStateStore = {};

/* ── 文件系统依赖 ── */

let fsApi: typeof import("@tauri-apps/plugin-fs") | null = null;
let pathApi: typeof import("@tauri-apps/api/path") | null = null;
let _settingsPath: string | null = null;

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

/* ── 初始化 ── */

/** 初始化——从 settings.json 加载 pluginStates 段 */
export async function initPluginStates(): Promise<void> {
  if (!(await ensureTauri()) || !pathApi || !fsApi) {
    // 浏览器模式——localStorage
    try {
      const raw = localStorage.getItem("v3_pluginStates");
      if (raw) _states = JSON.parse(raw);
    } catch { /* ignore */ }
    return;
  }

  try {
    _settingsPath = await pathApi.join(await pathApi.appDataDir(), "settings.json");
    if (await fsApi.exists(_settingsPath)) {
      const raw = await fsApi.readTextFile(_settingsPath);
      const parsed = JSON.parse(raw);
      _states = parsed.pluginStates ?? {};
    }
  } catch { /* 文件不存在或损坏 */ }
}

/* ── 读写 ── */

/** 获取插件的全部私有状态 */
export function getPluginState(pluginId: string): Record<string, unknown> {
  return { ...(_states[pluginId] ?? {}) };
}

/** 获取插件的单个键 */
export function getPluginStateValue<T>(pluginId: string, key: string): T | undefined {
  const pluginStates = _states[pluginId];
  if (!pluginStates) return undefined;
  return pluginStates[key] as T;
}

/** 设置插件的单个键 */
export async function setPluginStateValue(
  pluginId: string,
  key: string,
  value: unknown
): Promise<void> {
  if (!_states[pluginId]) {
    _states[pluginId] = {};
  }
  _states[pluginId][key] = value;
  await _persist();
}

/** 设置插件的全部状态（替换） */
export async function setPluginState(
  pluginId: string,
  state: Record<string, unknown>
): Promise<void> {
  _states[pluginId] = { ...state };
  await _persist();
}

/** 删除插件的状态——卸载时调用 */
export async function removePluginState(pluginId: string): Promise<void> {
  delete _states[pluginId];
  await _persist();
}

/* ── 持久化 —— 写入 settings.json 的 pluginStates 段 ── */

async function _persist(): Promise<void> {
  // 始终写 localStorage
  try {
    localStorage.setItem("v3_pluginStates", JSON.stringify(_states, null, 2));
  } catch { /* ignore */ }

  if (!(await ensureTauri()) || !fsApi || !_settingsPath) return;
  try {
    // 读→改→写 settings.json（保留其他字段）
    let settings: Record<string, unknown> = {};
    if (await fsApi.exists(_settingsPath)) {
      const raw = await fsApi.readTextFile(_settingsPath);
      settings = JSON.parse(raw);
    }
    settings.pluginStates = _states;
    const dir = _settingsPath.substring(0, _settingsPath.lastIndexOf("\\"));
    if (dir && !(await fsApi.exists(dir))) {
      await fsApi.mkdir(dir, { recursive: true });
    }
    await fsApi.writeTextFile(_settingsPath, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.warn("[PluginStateService] 写入 pluginStates 失败:", e);
  }
}

/** 清空缓存（测试用） */
export function clearPluginStates(): void {
  _states = {};
}
