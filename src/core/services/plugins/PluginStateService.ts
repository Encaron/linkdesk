/**
 * 插件私有存储服务——对标 VS Code ExtensionContext.globalState / workspaceState。
 * Phase 5 盲区 4（P1）：插件需要存"上次波特率""最近打开文件"等私有数据。
 *
 * 设计依据：docs/phase5_应用基础设施/V3-Phase5-设计.md §盲区4
 *
 * Phase 5f：文件分离——独立 `plugin-states.json`（不再和 ConfigurationService 共用 settings.json）。
 * 持久化归一化到 StorageService（read/write）。
 *
 * 数据结构：
 *   { "terminal": { "lastBaudRate": "115200" }, "app": { "iconOrder": [...] }, ... }
 */

import { read, write } from "../configuration/StorageService";

/** 壳级 pluginId——对标 VS Code 内置命令来源。B7 fix：统一常量替代 10+ 处 "app" 硬编码 */
export const APP_PLUGIN_ID = "app";

/* ── 类型 ── */

type PluginStateStore = Record<string, Record<string, unknown>>;

/* ── 内存缓存 ── */

let _states: PluginStateStore = {};

/* ── 初始化 ── */

/** 初始化——从 plugin-states.json 加载 */
export async function initPluginStates(): Promise<void> {
  const saved = await read<PluginStateStore>("plugin-states");
  if (saved) _states = saved;
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
  setPluginStateValueSync(pluginId, key, value);
  await _persist();
}

/**
 * Phase 5h/B77：同步更新插件状态的内存缓存（不等待持久化）。
 * 用于必须在 React 渲染前更新的场景——见 [[b77-iconorder-not-updated-on-reinstall]]。
 */
export function setPluginStateValueSync(
  pluginId: string,
  key: string,
  value: unknown
): void {
  if (!_states[pluginId]) {
    _states[pluginId] = {};
  }
  _states[pluginId][key] = value;
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

/* ── 持久化 —— Phase 5f 独立文件 plugin-states.json ── */

async function _persist(): Promise<void> {
  await write("plugin-states", _states);
}

/** 清空缓存（测试用） */
export function clearPluginStates(): void {
  _states = {};
}
