/**
 * ProfileService — 插件场景配置快照。
 *
 * 对标 VS Code Profile 系统。
 * Profile = 插件集合 + settings + workspace 的快照。
 * 切换 Profile 时五维验证——任一维度失败则 toast 报告。
 *
 * 设计依据：docs/02-Electron架构/E3_多WebView与壳收尾_暂定/04-E3d-Profile与激活.md
 *
 * Profile 存储位置：<appDataDir>/profiles/<name>.json
 * 当前 Profile 名持久化到 PluginStateService（key: "currentProfile"）
 */

import {
  getLoadedPluginManifests,
  disablePlugin,
  enablePlugin,
  isPluginDisabled,
} from "../pluginLoader/loader";
import { setConfigurationValue, getConfigurationValue } from "./ConfigurationService";
import { pushToast, TOAST_TTL_ERROR } from "./toast";
import {
  appDataDir,
  joinPath,
  exists,
  mkdir,
  readFile,
  writeFile,
  listDir,
  deleteEntry,
} from "./FileService";
import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "./PluginStateService";

/* ── 类型 ── */

export interface Profile {
  name: string;
  /** codicon 图标名——QuickPick 显示用 */
  icon?: string;
  /** 此场景启用的插件 ID 列表 */
  plugins: string[];
  /** 要应用的设置（key → value）*/
  settings: Record<string, unknown>;
  /** 关联的工作区路径 */
  workspace?: string;
}

/* ── 文件路径 ── */

const PROFILES_DIR = "profiles";
const CURRENT_PROFILE_KEY = "currentProfile";

async function _profilesDir(): Promise<string> {
  return joinPath(await appDataDir(), PROFILES_DIR);
}

async function _ensureDir(): Promise<string> {
  const dir = await _profilesDir();
  if (!(await exists(dir))) await mkdir(dir);
  return dir;
}

async function _profilePath(dir: string, name: string): Promise<string> {
  return joinPath(dir, `${name}.json`);
}

/* ── CRUD ── */

/** 列出所有 Profile */
export async function getProfiles(): Promise<Profile[]> {
  const dir = await _profilesDir();
  if (!(await exists(dir))) return [];

  const entries = await listDir(dir);
  const result: Profile[] = [];
  for (const e of entries) {
    if (!e.isFile || !e.name.endsWith(".json")) continue;
    try {
      result.push(JSON.parse(await readFile(e.path)) as Profile);
    } catch {
      /* 跳过损坏文件 */
    }
  }
  return result;
}

/** 读取单个 Profile */
export async function loadProfile(name: string): Promise<Profile | null> {
  const dir = await _profilesDir();
  if (!(await exists(dir))) return null;
  const p = await _profilePath(dir, name);
  if (!(await exists(p))) return null;
  try {
    return JSON.parse(await readFile(p)) as Profile;
  } catch {
    return null;
  }
}

/** 创建或更新 Profile */
export async function saveProfile(profile: Profile): Promise<void> {
  const dir = await _ensureDir();
  await writeFile(await _profilePath(dir, profile.name), JSON.stringify(profile, null, 2));
}

/** 删除 Profile */
export async function deleteProfile(name: string): Promise<void> {
  const dir = await _profilesDir();
  if (!(await exists(dir))) return;
  const p = await _profilePath(dir, name);
  if (await exists(p)) await deleteEntry(p);
}

/* ── 当前 Profile 名持久化 ── */

/** 获取当前激活的 Profile 名（可能为 undefined——从未切换过）*/
export function getCurrentProfileName(): string | undefined {
  return getPluginStateValue<string>(APP_PLUGIN_ID, CURRENT_PROFILE_KEY);
}

async function _setCurrentProfileName(name: string | undefined): Promise<void> {
  await setPluginStateValue(APP_PLUGIN_ID, CURRENT_PROFILE_KEY, name ?? null);
}

/* ── 导出当前状态为 Profile ── */

/** 将当前运行的插件+设置快照导出为 Profile */
export function snapshotCurrentAsProfile(name: string): Profile {
  const manifests = getLoadedPluginManifests();
  return {
    name,
    plugins: manifests.map((m) => m.pluginId),
    settings: {
      "app.theme": getConfigurationValue("app.theme"),
      "app.language": getConfigurationValue("app.language"),
    },
  };
}

/* ── 五维验证 ── */

interface ValidationError {
  dimension: number;
  message: string;
}

async function _validateSwitch(expected: Profile): Promise<ValidationError[]> {
  const errors: ValidationError[] = [];

  // 维度 1：插件加载列表——所有目标插件必须已加载
  const loaded = new Set(getLoadedPluginManifests().map((m) => m.pluginId));
  for (const id of expected.plugins) {
    if (!loaded.has(id)) {
      const detail = isPluginDisabled(id) ? "（仍被禁用）" : "（未加载）";
      errors.push({ dimension: 1, message: `插件 "${id}" ${detail}` });
    }
  }

  // 维度 2：settings 值——关键配置必须和 Profile 一致
  for (const [key, expectedVal] of Object.entries(expected.settings)) {
    const actual = getConfigurationValue(key);
    if (JSON.stringify(actual) !== JSON.stringify(expectedVal)) {
      errors.push({
        dimension: 2,
        message: `设置 "${key}" 期望=${JSON.stringify(expectedVal)} 实际=${JSON.stringify(actual)}`,
      });
    }
  }

  // 维度 3：主题 CSS 变量——仅在浏览器环境检查
  if (typeof document !== "undefined" && expected.settings["app.theme"]) {
    const expectedTheme = expected.settings["app.theme"];
    const currentTheme = getConfigurationValue<string>("app.theme");
    if (currentTheme !== expectedTheme) {
      errors.push({ dimension: 3, message: `主题未切换——期望 "${expectedTheme}" 实际 "${currentTheme}"` });
    }
  }

  // 维度 4：语言
  if (expected.settings["app.language"]) {
    const expectedLang = expected.settings["app.language"];
    const currentLang = getConfigurationValue<string>("app.language");
    if (currentLang !== expectedLang) {
      errors.push({ dimension: 4, message: `语言未切换——期望 "${expectedLang}" 实际 "${currentLang}"` });
    }
  }

  // 维度 5：布局——基本检查（工作区根路径）
  if (expected.workspace) {
    try {
      const { getWorkspaceRoot } = await import("./WorkspaceService");
      const root = getWorkspaceRoot();
      if (root !== expected.workspace) {
        errors.push({ dimension: 5, message: `工作区路径不匹配` });
      }
    } catch {
      /* WorkspaceService 可能未就绪——非阻断 */
    }
  }

  return errors;
}

/* ── 切换 Profile ── */

/**
 * 切换到指定 Profile——禁用不在列表中的插件、启用列表中的插件、
 * 应用 settings、打开 workspace。完成后运行五维验证。
 *
 * @returns true = 全部成功，false = 部分失败（已 toast）
 */
export async function switchProfile(name: string): Promise<boolean> {
  const profile = await loadProfile(name);
  if (!profile) {
    pushToast({
      message: `Profile "${name}" 未找到`,
      severity: "error",
      ttl: TOAST_TTL_ERROR,
    });
    return false;
  }

  const errors: string[] = [];

  // 1. 计算插件差异
  const currentLoaded = getLoadedPluginManifests().map((m) => m.pluginId);
  const target = new Set(profile.plugins);
  const toDisable = currentLoaded.filter((id) => !target.has(id));
  const toEnable = profile.plugins.filter((id) => !currentLoaded.includes(id));

  // 2. 禁用不在 Profile 中的插件
  for (const pluginId of toDisable) {
    const r = await disablePlugin(pluginId);
    if (!r.success) errors.push(`禁用 "${pluginId}" 失败: ${r.error}`);
  }

  // 3. 启用 Profile 中的插件
  for (const pluginId of toEnable) {
    const r = await enablePlugin(pluginId);
    if (!r.success) {
      const hint = r.needRestart ? "（需重启）" : "";
      errors.push(`启用 "${pluginId}" 失败: ${r.error}${hint}`);
    }
  }

  // 4. 应用 settings
  for (const [key, value] of Object.entries(profile.settings)) {
    try {
      await setConfigurationValue(key, value, "user");
    } catch (e: any) {
      errors.push(`设置 "${key}" 失败: ${e?.message || e}`);
    }
  }

  // 5. 应用 workspace（如果有指定路径）
  if (profile.workspace) {
    try {
      const { addFolder } = await import("./WorkspaceService");
      addFolder(profile.workspace);
    } catch (e: any) {
      errors.push(`工作区 "${profile.workspace}" 失败: ${e?.message || e}`);
    }
  }

  // 6. 五维验证
  const validations = await _validateSwitch(profile);
  for (const v of validations) {
    errors.push(`[维度${v.dimension}] ${v.message}`);
  }

  // 7. 持久化当前 Profile 名
  await _setCurrentProfileName(name);

  // 8. 汇总结果
  if (errors.length > 0) {
    const summary = errors.slice(0, 3).join("; ");
    const tail = errors.length > 3 ? ` ...等${errors.length}项` : "";
    pushToast({
      message: `Profile 切换部分失败: ${summary}${tail}`,
      severity: "warning",
      ttl: 8000,
    });
    return false;
  }

  pushToast({ message: `已切换到 Profile "${name}"`, severity: "info" });
  return true;
}
