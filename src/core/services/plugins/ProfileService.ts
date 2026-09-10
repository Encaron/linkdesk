/**
 * ProfileService — 插件场景配置快照。
 *
 * 对标 VS Code Profile 系统。
 * Profile = 插件集合 + settings + workspace 的快照。
 * 切换 Profile 时五维验证——任一维度失败则回退 + toast 报告。
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
} from "../../../pluginLoader/loader";
import i18n from "../../../i18n"; // E6#73h（D3）：用户可见文案走 i18n（硬约束 2）
import { setConfigurationValue, getConfigurationValue, getUserSettings } from "../configuration/ConfigurationService";
import { pushToast, TOAST_TTL_ERROR } from "../ui/NotificationService";
import { deepEqual } from "../../utils/deepEqual"; // E5.8 归一化：JSON.stringify 深比较捷径统一走共享工具
import { normalizeThemeValue } from "../ui/ThemeEngine"; // E5.8#50.21：快照导出/校验前旧值归一化
import {
  appDataDir,
  joinPath,
  exists,
  createDir,
  readFile,
  writeFile,
  listDir,
  remove,
} from "../files/FileService";
import { getPluginStateValue, setPluginStateValue, APP_PLUGIN_ID } from "./PluginStateService";
import { Emitter } from "../../react/events/CoreEvents";
import { getWorkspaceRoot } from "../layout/WorkspaceService";

/* ── 事件 ── */

/** Profile 切换完成——对标 VS Code onDidChangeProfile */
export const onDidChangeProfile = new Emitter<{ name: string }>();

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

/** 切换前的运行时快照——失败时回退用 */
interface RuntimeSnapshot {
  plugins: string[];
  settings: Record<string, unknown>;
  /** 切换前的工作区根路径——回退时恢复 */
  workspaceRoot: string | null;
}

/* ── 文件路径 ── */

const PROFILES_DIR = "profiles";
const CURRENT_PROFILE_KEY = "currentProfile";

async function _profilesDir(): Promise<string> {
  return joinPath(await appDataDir(), PROFILES_DIR);
}

async function _ensureDir(): Promise<string> {
  const dir = await _profilesDir();
  if (!(await exists(dir))) await createDir(dir);
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
  if (await exists(p)) await remove(p);
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
      // E5.8#50.21：快照导出前归一化——legacy "Dark"/"Light" 不落盘，profile 恒存配方 id
      "app.theme": normalizeThemeValue(getConfigurationValue<string>("app.theme")),
      "app.language": getConfigurationValue("app.language"),
    },
  };
}

/* ── 运行时快照——回退用 ── */

function _captureSnapshot(): RuntimeSnapshot {
  return {
    plugins: getLoadedPluginManifests().map((m) => m.pluginId),
    settings: getUserSettings(),
    workspaceRoot: getWorkspaceRoot() ?? null,
  };
}

async function _restoreSnapshot(prev: RuntimeSnapshot): Promise<string[]> {
  const errors: string[] = [];
  const current = new Set(getLoadedPluginManifests().map((m) => m.pluginId));
  const prevSet = new Set(prev.plugins);

  // 恢复插件列表
  for (const id of prev.plugins) {
    if (!current.has(id)) {
      const r = await enablePlugin(id);
      if (!r.success) errors.push(`回退——启用 "${id}" 失败: ${r.error}`);
    }
  }
  for (const id of current) {
    if (!prevSet.has(id)) {
      const r = await disablePlugin(id);
      if (!r.success) errors.push(`回退——禁用 "${id}" 失败: ${r.error}`);
    }
  }

  // 恢复 settings
  for (const [key, value] of Object.entries(prev.settings)) {
    try {
      await setConfigurationValue(key, value, "user");
    } catch (e) {
      errors.push(`回退——设置 "${key}" 失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 恢复 workspace——如果 Profile 切换改了工作区，回退到旧路径
  if (prev.workspaceRoot && getWorkspaceRoot() !== prev.workspaceRoot) {
    try {
      const { addFolder } = await import("../layout/WorkspaceService");
      addFolder(prev.workspaceRoot);
    } catch (e) {
      errors.push(`回退——工作区恢复失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return errors;
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

  // 维度 2：settings 值——关键配置必须和 Profile 一致（app.theme 两侧归一化——旧 profile "Dark" vs 现值 "dark" 判等）
  for (const [key, expectedVal] of Object.entries(expected.settings)) {
    const actual = getConfigurationValue(key);
    const isTheme = key === "app.theme";
    const actualCmp = isTheme ? normalizeThemeValue(String(actual)) : actual;
    const expectedCmp = isTheme ? normalizeThemeValue(String(expectedVal)) : expectedVal;
    if (!deepEqual(actualCmp, expectedCmp)) {
      errors.push({
        dimension: 2,
        message: `设置 "${key}" 期望=${JSON.stringify(expectedVal)} 实际=${JSON.stringify(actual)}`,
      });
    }
  }

  // 维度 3：主题 CSS 变量——对标设计文档，检查 body 上的实际 CSS 变量值
  if (typeof document !== "undefined" && expected.settings["app.theme"]) {
    const bg = getComputedStyle(document.body).getPropertyValue("--bg").trim();
    if (!bg) {
      errors.push({ dimension: 3, message: "主题 CSS 变量 --bg 未设置——主题可能未正确应用" });
    }
  }

  // 维度 4：语言——检查 i18next 实际当前语言
  if (expected.settings["app.language"]) {
    try {
      const { default: i18n } = await import("../../../i18n");
      const currentLang = i18n.language;
      const expectedLang = expected.settings["app.language"];
      if (currentLang !== expectedLang) {
        errors.push({ dimension: 4, message: `语言未切换——期望 "${expectedLang}" 实际 "${currentLang}"` });
      }
    } catch {
      /* i18n 模块不可用——跳过 */
    }
  }

  // 维度 5：布局——检查工作区根路径
  if (expected.workspace) {
    const root = getWorkspaceRoot();
    if (root !== expected.workspace) {
      errors.push({ dimension: 5, message: `工作区路径不匹配——期望 "${expected.workspace}" 实际 "${root ?? "无"}"` });
    }
  }

  return errors;
}

/* ── 切换 Profile ── */

/**
 * 切换到指定 Profile——禁用不在列表中的插件、启用列表中的插件、
 * 应用 settings、打开 workspace。完成后运行五维验证。
 * 任一维度失败 → 回退到切换前状态 + toast 报告。
 *
 * @returns true = 全部成功，false = 部分失败（已回退 + toast）
 */
export async function switchProfile(name: string): Promise<boolean> {
  const profile = await loadProfile(name);
  if (!profile) {
    // E6#73h（D3/D4）：原文案 `Profile "x" 未找到`——「Profile」是内部词，用户看不到这个名字。
    // 与下面两条失败句统一口径，改称「配置方案」；整句走 i18n。
    pushToast({
      message: i18n.t("找不到配置方案「{{name}}」", { name }),
      severity: "error",
      ttl: TOAST_TTL_ERROR,
    });
    return false;
  }

  // 🔥 保存切换前快照——失败时回退
  const snapshot = _captureSnapshot();
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
    } catch (e) {
      errors.push(`设置 "${key}" 失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 5. 应用 workspace（如果有指定路径）
  if (profile.workspace) {
    try {
      const { addFolder } = await import("../layout/WorkspaceService");
      addFolder(profile.workspace);
    } catch (e) {
      errors.push(`工作区 "${profile.workspace}" 失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // 6. 五维验证
  const validations = await _validateSwitch(profile);
  for (const v of validations) {
    errors.push(`[维度${v.dimension}] ${v.message}`);
  }

  // 7. 失败 → 回退到切换前状态
  if (errors.length > 0) {
    const rollbackErrors = await _restoreSnapshot(snapshot);
    // E6#73h（D3/D4）：技术细节（哪一项、期望值/实际值）只进 console——用户看的是**结论句 + 下一步**。
    // 原样甩出去是一串「[维度2] 设置 "app.theme" 期望="dark" 实际="light"」，不读代码的人既看不懂
    // 也不知道该干什么（18 档 D4）。「Profile」这个内部词也从用户可见文案里去掉，改说「配置方案」。
    console.warn("[Profile] 切换失败详情:", errors);
    if (rollbackErrors.length > 0) console.warn("[Profile] 回退失败详情:", rollbackErrors);
    pushToast({
      message: rollbackErrors.length === 0
        ? i18n.t("配置方案切换失败——已退回原来的设置")
        : i18n.t("配置方案切换失败——已退回原来的设置，但有部分没能还原，请手动检查"),
      severity: "warning",
      ttl: TOAST_TTL_ERROR,
    });
    return false;
  }

  // 8. 成功 → 持久化当前 Profile 名 + 广播事件
  await _setCurrentProfileName(name);
  onDidChangeProfile.fire({ name });

  pushToast({ message: i18n.t("已切换到配置方案「{{name}}」", { name }), severity: "info" });
  return true;
}
