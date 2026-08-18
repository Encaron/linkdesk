/**
 * 插件加载器。
 * Phase 4：Vite 构建时独立打包 + import() 运行时加载。
 * 设计依据：[[phase4-design-decisions]] 第 1-3 条。
 *
 * 加载时机：App 启动 initPrefs() 完成后调用 initPluginLoader()。
 * 加载顺序：先源码自带 → 再外部安装 → 错误不阻断。
 *
 * P1-4：theme/language 注册（ThemeEngine + i18next）
 * P1-5：文件监听（轮询 list_plugin_dirs）
 * P1-6：7 种错误处理 + minAppVersion 版本检查 + 同名去重
 * Phase 4.3：安装/卸载/禁用/启用完整生命周期
 *
 * 🔒 E3j #72-#73：IPC 时序保护——loader 中的四条高风险路径已覆盖：
 *   - 插件加载/卸载 → plugins:call 走 #72 请求队列（FIFO 串行）
 *   - 主题切换       → bridge:broadcast 走 #27 push 队列（顺序交付）
 *   - 语言切换       → bridge:broadcast 走 #27 push 队列（顺序交付）
 *   - 生命周期事件   → shell Emitter 同步触发（不经过 IPC）
 *   本文件不直接调用 ipcRenderer.invoke——走 window.linkdesk 桥接层，
 *   主进程自动排队，loader 代码无需感知队列存在。
 */

import type { PluginManifest } from "../core/api/types";
import { unregisterViewPlugin } from "./viewRegistry";
import { getAvailableThemes } from "../core/services/ui/ThemeEngine";
import { ThemeRegistry } from "../core/registry/appearance/ThemeRegistry";
import { LanguageRegistry } from "../core/registry/languages/LanguageRegistry";
import { pushToast, TOAST_TTL_ERROR, TOAST_TTL_SUCCESS } from "../core/services/ui/NotificationService";
import { reportError } from "../core/services/bootstrap/ErrorService";
// Phase 5f：PreferenceService 双写已清除——PluginStateService/ConfigurationService 是唯一真源
// Phase 5：插件状态管理迁移到 PluginStateService
import { setPluginStateValue, APP_PLUGIN_ID } from "../core/services/plugins/PluginStateService";
// Phase 5h 行为归一化：副作用（iconOrder/toast/config/tab）集中到 lifecycle.ts 消费端
import { PluginLifecycle, initLifecycleConsumers } from "./lifecycle";
import { getConfigurationValue, setConfigurationValue } from "../core/services/configuration/ConfigurationService";
import i18n from "../i18n";
import {
  linkdesk,
  pluginsApi,
  log,
  errMsg,
  pluginManifests,
  loadedPluginIds,
  _deferredPlugins,
  extractPluginId,
  getMetadataCache,
  cachePluginMetadata,
  getDisabledList,
  saveDisabledList,
  getLoadedManifest,
} from "./state";
import type { CachedPluginMeta } from "./state";
import { validateInstallManifest, resolveVersionConflict } from "./manifest";
export { validateInstallManifest, resolveVersionConflict } from "./manifest";
import { syncAppThemeEnum, syncAppLanguageEnum } from "./contributions";
export { runtimeEntryPath, parseContributions } from "./contributions";
import { loadPlugin, activatePlugin, findDeferredByCommand } from "./runtime";

/* ── 初始化 ── */

let _initialized = false;
/** initPluginLoader 的进行中 Promise——StrictMode 双重 effect 时第二次调用等第一次完成 */
let _loadingPromise: Promise<void> | null = null;

export async function initPluginLoader(): Promise<void> {
  // 🔥 #59c fix：StrictMode 双重 effect 第二次调用时等第一次 Promise 完成
  if (_initialized) return _loadingPromise ?? Promise.resolve();
  _initialized = true;

  return (_loadingPromise = (async () => {
  // Phase 5h 行为归一化：注册 lifecycle 消费端（iconOrder/toast/config/tab——只注册一次）
  initLifecycleConsumers();

  // #44：注册命令预激活钩子——CommandRegistry 执行命令前检查是否需要先激活延迟插件
  // 🔥 必须 await——否则钩子在 initPluginLoader 返回后才挂上，用户首次命令执行时钩子未就绪
  const { setPreActivateHook } = await import("../core/registry/commands/CommandRegistry");
  setPreActivateHook(async (commandId: string) => {
    const pluginId = findDeferredByCommand(commandId);
    if (pluginId) await activatePlugin(pluginId);
  });

  const errors: string[] = [];
  const disabled = getDisabledList();

  // 1. 收集所有已安装插件（从 import.meta.glob 的 plugin.json 键）
  const installed = new Set<string>();
  for (const path of Object.keys(pluginManifests)) {
    installed.add(extractPluginId(path));
  }

  // 2. 对标 VS Code：运行时扫描文件系统，过滤掉已卸载的插件
  //    import.meta.glob 是构建时打包的——文件被 Rust 移走后 glob 仍保留旧路径。
  //    VS Code 的做法是启动时 scan extensions 目录，目录里没有的自然不加载。
  let fsInstalled = new Set<string>();
  try {
    const dirs = await pluginsApi().listDirs();
    fsInstalled = new Set(dirs);
  } catch {
    // 非 Tauri 环境（npm run dev 浏览器模式）——无 invoke，回退到 glob 全量加载
  }

  // 3. 加载每个插件（跳过禁用 + 跳过文件系统不存在的）
  console.log(`[pluginLoader] pluginManifests keys: ${Object.keys(pluginManifests).length}, installed: ${[...installed].join(', ')}`);
  for (const pluginId of installed) {
    if (disabled.includes(pluginId)) {
      log.appendLine(`插件 "${pluginId}" 已禁用——跳过`);
      // B2 fix: 种子缓存——禁用插件元数据从 glob 入缓存，marketplace 不依赖文件系统
      const dKey = Object.keys(pluginManifests).find((k) => extractPluginId(k) === pluginId);
      if (dKey) {
        cachePluginMetadata(pluginId, pluginManifests[dKey], "disabled");
      }
      continue;
    }
    if (fsInstalled.size > 0 && !fsInstalled.has(pluginId)) {
      log.appendLine(`插件 "${pluginId}" 已卸载（文件系统不存在）——跳过`);
      // B2 fix: 种子缓存——已卸载的glob 中的插件元数据入缓存（F5 后仍可浏览详情）
      const uKey = Object.keys(pluginManifests).find((k) => extractPluginId(k) === pluginId);
      if (uKey) {
        cachePluginMetadata(pluginId, pluginManifests[uKey], "uninstalled");
      }
      continue;
    }
    try {
      // #44：activationEvents——非 "*" 时延迟 JS import，只注册 manifest
      const mKey = Object.keys(pluginManifests).find((k) => extractPluginId(k) === pluginId);
      const manifest = mKey ? pluginManifests[mKey] : null;
      const defer = manifest && manifest.activationEvents?.length
        && !manifest.activationEvents.includes("*");
      await loadPlugin(pluginId, "startup", { skipView: !!defer });
      if (defer && manifest) _deferredPlugins.set(pluginId, manifest);
    } catch (e) {
      errors.push(`${pluginId}: ${errMsg(e)}`);
    }
  }

  // 4. Phase 5h：加载glob 外的插件（文件系统存在但不在 glob 中的）
  for (const pluginId of fsInstalled) {
    if (installed.has(pluginId)) continue;  // 已在 glob 中加载
    if (disabled.includes(pluginId)) continue;
    try {
      await loadPlugin(pluginId, "startup");
    } catch (e) {
      errors.push(`${pluginId} (runtime): ${errMsg(e)}`);
    }
  }

  // 5. 错误汇总
  if (errors.length > 0) {
    console.warn("[pluginLoader] 以下插件加载失败:", errors);
    pushToast({
      message: `${errors.length} 个插件加载失败`,
      ttl: TOAST_TTL_ERROR,
    });
  }

  // 6. 清理僵尸缓存——status="installed" 但未真正加载的条目（插件目录已删除）
  const cache = getMetadataCache();
  let staleCount = 0;
  for (const [id, meta] of Object.entries(cache)) {
    if (meta.status === "installed" && !loadedPluginIds.has(id)) {
      delete cache[id];
      staleCount++;
    }
  }
  if (staleCount > 0) {
    try {
      setPluginStateValue(APP_PLUGIN_ID, "pluginMetadataCache", cache);
      log.appendLine(`🧹 清理 ${staleCount} 条僵尸缓存`);
    } catch { /* 非关键路径 */ }
  }

  // 7. E5.6#16.7k——扫描 .disabled/ 目录，缓存已卸载插件元数据
  //    .disabled/ 不在 import.meta.glob 和 listPluginDirs() 的扫描范围内，
  //    必须单独扫描才能让 marketplace 的"待安装"区域显示这些插件。
  try {
    const disabledDirs: string[] = await pluginsApi().listDisabledDirs();
    for (const pluginId of disabledDirs) {
      // 不覆盖已安装插件的缓存
      if (loadedPluginIds.has(pluginId)) continue;
      if (installed.has(pluginId)) continue;
      try {
        const raw = await pluginsApi().readManifest(pluginId);
        const manifest = JSON.parse(raw);
        cachePluginMetadata(pluginId, manifest, "uninstalled");
        log.appendLine(`📦 已卸载插件入缓存: ${pluginId}`);
      } catch (e) {
        log.appendLine(`⚠️ 已卸载插件 "${pluginId}" 元数据读取失败: ${errMsg(e)}`);
      }
    }
  } catch { /* 非 Electron 环境（npm run dev 浏览器模式）——listDisabledDirs 不可用 */ }
  })());
}

/* ═══════════════════════════════════════════════════════════
   Phase 4.3 生命周期 API——安装/卸载/禁用/启用
   ═══════════════════════════════════════════════════════════ */

/**
 * 禁用插件：标记到 prefs.disabledPlugins + 从 viewRegistry 移除。
 * 插件文件保留在 plugins/ 目录，下次启动跳过。
 * 对标 VS Code "Disable Extension"。
 */
export async function disablePlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const manifest = getLoadedManifest(pluginId);
    if (!manifest) {
      return { success: false, error: `插件 "${pluginId}" 未找到` };
    }
    if (manifest.core) {
      return { success: false, error: `核心插件 "${pluginId}" 不可禁用` };
    }

    const list = getDisabledList();
    if (!list.includes(pluginId)) {
      list.push(pluginId);
      await saveDisabledList(list);
    }
    // Phase 5h 行为归一化：lifecycle 消费端处理 config 清理 + tab 关闭 + iconOrder(保留) + toast
    const displayName = manifest.name;
    // B2 fix: 标记为已禁用（缓存保留——marketplace 仍可浏览详情）
    cachePluginMetadata(pluginId, manifest, "disabled");
    // revert 必须在 onWillUninstall 之前——onWillUninstall 注销主题/语言后 revert 找不到归属
    await revertThemeIfCurrent(pluginId);
    await revertLanguageIfCurrent(pluginId);
    PluginLifecycle.onWillUninstall.fire({ pluginId, reason: "disable", displayName });
    // 仅视图插件需要注销组件注册
    if (getViewPlugin(pluginId)) unregisterViewPlugin(pluginId);
    loadedPluginIds.delete(pluginId);
    _deferredPlugins.delete(pluginId);
    PluginLifecycle.onDidUninstall.fire({ pluginId, reason: "disable", displayName });
    syncAppThemeEnum();
    syncAppLanguageEnum();
    log.appendLine(`🔒 已禁用 "${pluginId}"`);
    return { success: true };
  } catch (e) {
    return { success: false, error: errMsg(e) };
  }
}

/**
 * 启用插件：从 prefs.disabledPlugins 移除 + 重新加载。
 * 对标 VS Code "Enable Extension"。
 * 注意：.tsx 视图插件启用后需重启生效（无法运行时动态 import）。
 */
export async function enablePlugin(pluginId: string): Promise<{ success: boolean; error?: string; needRestart?: boolean }> {
  try {
    const list = getDisabledList();
    const idx = list.indexOf(pluginId);
    if (idx !== -1) {
      list.splice(idx, 1);
      await saveDisabledList(list);
    }

    // 尝试重新加载——对于 .json 插件（theme/language）即时生效
    // 对于 .tsx 视图插件，import.meta.glob 是构建时解析的，无法运行时动态注入
    // 此时返回 needRestart: true
    const manifestKey = Object.keys(pluginManifests).find(
      (k) => extractPluginId(k) === pluginId
    );

    if (manifestKey) {
      const manifest = pluginManifests[manifestKey];
      // .json 插件（theme/language/file）——即时生效
      if ((manifest.themes || manifest.languages || (!manifest.entry && manifest.file))) {
        await loadPlugin(pluginId, "enable");
        log.appendLine(`🔓 已启用 "${pluginId}"`);
        return { success: true };
      }
      // 视图插件——loadPlugin(reason:'enable') → lifecycle 消费端处理 iconOrder(保持原位) + toast
      await loadPlugin(pluginId, "enable");
      log.appendLine(`[OK] 已启用 "${pluginId}"（即时生效）`);
      return { success: true };
    }

    return { success: true, needRestart: true };
  } catch (e) {
    return { success: false, error: errMsg(e) };
  }
}

/**
 * 卸载插件：Rust 端移到 .disabled/ → 从 viewRegistry 移除 → 持久化。
 * 如果插件之前被禁用，从禁用列表清理（卸载优先级高于禁用）。
 * core 插件不可卸载。
 */
export async function uninstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const manifest = getLoadedManifest(pluginId);
    if (!manifest) {
      return { success: false, error: `插件 "${pluginId}" 未找到` };
    }
    if (manifest.core) {
      return { success: false, error: `核心插件 "${pluginId}" 不可卸载` };
    }

    // Phase 5h 行为归一化：lifecycle 消费端处理 config 清理 + iconOrder(移除) + tab 关闭
    const displayName = manifest.name;

    // E5#32：文件操作走 linkdesk.filesystem——bridge 为唯一入口，不再走 plugins:uninstall 直接 IPC
    const src = await pluginsApi().resolvePath(pluginId);
    const env = await linkdesk().env.get();
    const disabledDir = `${env.appPluginsDir}/.disabled`;
    const dest = `${disabledDir}/${pluginId}`;
    await linkdesk().filesystem.createDir(disabledDir);
    if (await linkdesk().filesystem.exists(dest)) {
      await linkdesk().filesystem.remove(dest);
    }
    await linkdesk().filesystem.copy(src, dest);
    await linkdesk().filesystem.remove(src);

    // Rust 成功 → 前端更新
    cachePluginMetadata(pluginId, manifest, "uninstalled");
    // revert 必须在 onWillUninstall 之前——onWillUninstall 注销主题/语言后 revert 找不到归属
    await revertThemeIfCurrent(pluginId);
    await revertLanguageIfCurrent(pluginId);
    PluginLifecycle.onWillUninstall.fire({ pluginId, reason: "uninstall", displayName });

    // 如果插件之前被禁用过，清理禁用列表——卸载优先级高于禁用
    const list = getDisabledList();
    const idx = list.indexOf(pluginId);
    if (idx !== -1) {
      list.splice(idx, 1);
      await saveDisabledList(list);
    }

    // 前端：移除注册（仅视图插件需要）
    if (getViewPlugin(pluginId)) unregisterViewPlugin(pluginId);
    loadedPluginIds.delete(pluginId);
    _deferredPlugins.delete(pluginId);
    PluginLifecycle.onDidUninstall.fire({ pluginId, reason: "uninstall", displayName });
    syncAppThemeEnum();
    syncAppLanguageEnum();
    log.appendLine(`🗑 已卸载 "${pluginId}"`);
    pushToast({ message: `已卸载：${displayName}`, source: pluginId, ttl: TOAST_TTL_SUCCESS, severity: "info" });
    // E5.7#48：主进程静态声明三表（LangDef/Protocol/FileAssociation）重扫——唯一写入方在主进程
    window.linkdesk?.pluginManager?.notifyManifestChanged?.();
    return { success: true };
  } catch (e) {
    const msg = errMsg(e);
    console.error(`[pluginLoader] 卸载 "${pluginId}" 失败:`, msg);
    reportError({ message: `插件 "${pluginId}" 卸载失败: ${msg}`, source: pluginId, error: e });
    return { success: false, error: msg };
  }
}

/**
 * 卸载插件的唯一入口——带确认弹窗 + 错误反馈。
 * 两个 UI 入口（齿轮菜单 + 详情页）都调此函数，确保行为一致。
 */
export async function performUninstall(pluginId: string): Promise<boolean> {
  const { showConfirm } = await import("../core/services/ui/DialogService");
  const manifest = getLoadedManifest(pluginId);
  const name = manifest?.name ?? pluginId;
  const confirmed = await showConfirm(
    i18n.t("确定要卸载") + ` "${name}"？` + i18n.t("此操作可撤销（文件保留在 .disabled/ 目录）。")
  );
  if (!confirmed) return false;
  const r = await uninstallPlugin(pluginId);
  return r.success;
}

/**
 * 安装插件：Electron 端复制到 plugins/user/ → 热加载。
 * 仅对 theme/language 插件即时生效；view 插件提示重启。
 *
 * E5.7#81 包装（校验 / 版本处理 / 进度）：
 *   - 校验前置：manifest 先读先验，不合法在复制前失败（原实现只在消毒时 parse——
 *     malformed JSON 会先复制出半装目录再报错）；安装目录名 = manifest.pluginId
 *     （不再用源目录 basename——目录名 ≠ pluginId 是潜伏错位，resolvePath 按 id 找目录）；
 *   - 版本处理：目标已存在时读盘比对版本——同版/旧版拒绝并给出双方版本号，新版提示
 *     先卸载再装（不覆盖：Windows 文件锁，卸载 cp+rm 教训；真升级流程归 E6 PluginUpdateService）；
 *   - 进度事件：plugin:installProgress { stage: validating/copying/loading/done/error } 广播到池
 *     （marketplace 安装按钮实时阶段文案）。
 */
export async function installPlugin(sourcePath: string): Promise<{ success: boolean; pluginId?: string; version?: string; needRestart?: boolean; error?: string }> {
  // 进度广播——壳 events.emit → 主进程 → 池（见 IpcBridge.onPluginEmit 广播）
  const emitProgress = (stage: string, pluginId?: string, message?: string) => {
    window.linkdesk?.events?.emit("plugin:installProgress", { stage, pluginId, message });
  };

  emitProgress("validating");
  try {
    // E5#32：文件操作走 linkdesk.filesystem——bridge 为唯一入口
    const manifestPath = `${sourcePath}/plugin.json`;
    if (!(await linkdesk().filesystem.exists(manifestPath))) {
      throw new Error(`不是有效插件（缺少 plugin.json）`);
    }
    let parsedManifest: unknown;
    try {
      parsedManifest = JSON.parse(await linkdesk().filesystem.readTextFile(manifestPath));
    } catch (e) {
      throw new Error(`plugin.json 格式错误: ${errMsg(e)}`);
    }
    const sourceDirName = sourcePath.split(/[\\/]/).pop() || sourcePath;
    const { pluginId, version, name } = validateInstallManifest(parsedManifest, sourceDirName);

    const env = await linkdesk().env.get();
    const destDir = `${env.appPluginsDir}/user/${pluginId}`;

    // E5.7#81 版本处理：目标已存在 → 读盘比对（未安装则跳过）
    let installed: { version: string | null } | null = null;
    if (await linkdesk().filesystem.exists(destDir)) {
      installed = { version: null };
      try {
        const iv = JSON.parse(await linkdesk().filesystem.readTextFile(`${destDir}/plugin.json`));
        if (typeof iv?.version === "string") installed = { version: iv.version };
      } catch { /* 读不到版本信息 → 保守拒绝（见 resolveVersionConflict null 分支） */ }
      const conflict = resolveVersionConflict(installed, version);
      if (conflict) throw new Error(`${name}: ${conflict}`);
    }

    emitProgress("copying", pluginId);
    await linkdesk().filesystem.copy(sourcePath, destDir);
    // 消毒 manifest——安装后强制 distribution=user, core=false
    const destManifest = `${destDir}/plugin.json`;
    const raw = await linkdesk().filesystem.readTextFile(destManifest);
    const manifest = JSON.parse(raw);
    if (manifest.distribution !== "user" || manifest.core === true) {
      manifest.distribution = "user";
      manifest.core = false;
      await linkdesk().filesystem.writeTextFile(destManifest, JSON.stringify(manifest, null, 2));
    }

    // E5.7#48：文件已落盘——通知主进程重扫三表（无论下方 loadPlugin 是否成功）
    window.linkdesk?.pluginManager?.notifyManifestChanged?.();

    // E5 归一化：loadPlugin 统一处理 glob 内/外——不再分支判断
    emitProgress("loading", pluginId);
    try {
      await loadPlugin(pluginId, "install");
      pushToast({ message: `已安装：${name} v${version}`, source: pluginId, ttl: TOAST_TTL_SUCCESS, severity: "info" });
      emitProgress("done", pluginId);
      return { success: true, pluginId, version };
    } catch {
      pushToast({
        message: `已安装：${name}。运行 npm run build:plugins 后生效。`,
        source: pluginId,
        severity: "info",
        ttl: 0,
        actions: [
          { label: "立即重启", isPrimary: true, onClick: () => window.location.reload() },
        ],
      });
      emitProgress("done", pluginId);
      return { success: true, pluginId, version, needRestart: true };
    }
  } catch (e) {
    const msg = errMsg(e);
    emitProgress("error", undefined, msg);
    return { success: false, error: msg };
  }
}

/** 判断插件是否被禁用 */
export function isPluginDisabled(pluginId: string): boolean {
  return getDisabledList().includes(pluginId);
}

// E5#43：接口反转——loader 注册自己到 IpcBridgeHandler，核心不再直接 import loader
import { setPluginAPI } from "../core/services/plugins/IpcBridgeHandler";
setPluginAPI({
  enablePlugin,
  disablePlugin,
  installPlugin,
  uninstallPlugin,
  reinstallPlugin,
  getDisabledPluginInfo,
  getUninstalledPluginInfo,
  isPluginDisabled,
  getLoadedPluginManifests,
});

/**
 * 获取插件在元数据缓存中的状态。
 * 返回值优先级高于 isPluginDisabled——缓存 "uninstalled" 的插件即使残留
 * 在禁用列表中，也应视为已卸载（可重新安装，而非启用）。
 */
export function getPluginCachedStatus(pluginId: string): CachedPluginMeta["status"] | undefined {
  return getMetadataCache()[pluginId]?.status;
}

/** 获取插件完整缓存元数据——PluginDetailPoolView 卸载后重建详情页用（G14 fix v2） */
export function getPluginCachedMeta(pluginId: string): CachedPluginMeta | undefined {
  return getMetadataCache()[pluginId];
}

/** 获取所有已加载插件的 manifest（含非视图插件 + 运行时加载的插件） */
export function getLoadedPluginManifests(): Array<{ pluginId: string; manifest: PluginManifest }> {
  const result: Array<{ pluginId: string; manifest: PluginManifest }> = [];
  const seen = new Set<string>();

  // 1. Vite glob 中的插件（构建时扫描）
  for (const [path, manifest] of Object.entries(pluginManifests)) {
    const pluginId = extractPluginId(path);
    if (loadedPluginIds.has(pluginId)) {
      result.push({ pluginId, manifest });
      seen.add(pluginId);
    }
  }

  // 2. 运行时加载的插件（loadPlugin 缓存了完整 manifest——仅 loadedPluginIds 中有的，防僵尸缓存）
  const cache = getMetadataCache();
  for (const [pluginId, meta] of Object.entries(cache)) {
    if (meta.status === "installed" && meta.manifest && !seen.has(pluginId) && loadedPluginIds.has(pluginId)) {
      result.push({ pluginId, manifest: meta.manifest });
    }
  }

  return result;
}

/** 当前语言是否来自此插件——卸载/禁用当前语言时自动回退（对标 revertThemeIfCurrent） */
async function revertLanguageIfCurrent(pluginId: string): Promise<void> {
  try {
    const currentLang = getConfigurationValue<string>("app.language") ?? "zh";
    const lang = LanguageRegistry.get(currentLang);
    if (!lang || lang.pluginId !== pluginId) return;

    // 当前语言来自被卸载/禁用的插件 → 找替代
    const languages = LanguageRegistry.getAll();
    const fallback = languages.length > 0
      ? (languages.find(l => l.id === "zh")?.id ?? languages[0].id)
      : "zh";
    await setConfigurationValue("app.language", fallback, "user");
  } catch { /* 非关键路径 */ }
}

/** 当前主题是否来自此插件——卸载/禁用当前主题时自动回退 */
async function revertThemeIfCurrent(pluginId: string): Promise<void> {
  try {
    const currentTheme = getConfigurationValue<string>("app.theme");
    const theme = ThemeRegistry.get(currentTheme ?? "");
    if (!theme || theme.pluginId !== pluginId) return;

    // 当前主题来自被卸载/禁用的插件 → 找替代
    const available = getAvailableThemes();
    if (available.length > 0) {
      await setConfigurationValue("app.theme", available[0], "user");
    }
    // 无可用主题 → 保持当前 CSS（index.css :root 为兜底），设定下次启动的默认值
  } catch { /* 非关键路径 */ }
}

/** 是否已初始化 */
export function isPluginLoaderReady(): boolean {
  return _initialized;
}

/** 获取禁用插件的基本信息（在 plugins/.disabled/ 下）*/
export function getDisabledPluginInfo(): Array<{ pluginId: string; name: string; description?: string; version?: string }> {
  // B2 fix: 优先从缓存读——支持glob 外的插件（glob 中无清单）
  const cache = getMetadataCache();
  const disabled = getDisabledList();
  const result: Array<{ pluginId: string; name: string; description?: string; version?: string }> = [];
  for (const pluginId of disabled) {
    const cached = cache[pluginId];
    if (cached) {
      result.push({ pluginId, name: cached.name, description: cached.description, version: cached.version });
      continue;
    }
    // 兜底：glob 中的插件从 glob 读（initPluginLoader 已将种子写入缓存，此分支仅用于缓存未就绪的极端情况）
    const manifestKey = Object.keys(pluginManifests).find(
      (k) => extractPluginId(k) === pluginId
    );
    if (manifestKey) {
      const m = pluginManifests[manifestKey];
      result.push({
        pluginId,
        name: m.name || pluginId,
        description: m.description,
        version: m.version,
      });
    }
  }
  return result;
}

/** 获取已卸载插件列表（B2 fix：从元数据缓存读，不依赖文件系统——插件目录已被移走）*/
export async function getUninstalledPluginInfo(): Promise<Array<{ pluginId: string; name: string; description?: string; version?: string }>> {
  // B2 fix: 从缓存读——不依赖 Rust 目录扫描（目录已被移走）也不依赖 globally（glob 外的插件不存在于此）
  const cache = getMetadataCache();
  const result: Array<{ pluginId: string; name: string; description?: string; version?: string }> = [];
  for (const [, meta] of Object.entries(cache)) {
    if (meta.status === "uninstalled") {
      result.push({ pluginId: meta.pluginId, name: meta.name, description: meta.description, version: meta.version });
    }
  }
  return result;
}

/**
 * 重新安装已卸载的插件：从 .disabled/ 移回 plugins/。
 * 对标 VS Code：扩展卸载后文件仍在本地，可一键重新安装。
 * 移回后需全页刷新——Vite dev server 的 import.meta.glob 在启动时扫描，需重扫才能识别移回的插件。
 */
export async function reinstallPlugin(pluginId: string): Promise<{ success: boolean; error?: string }> {
  try {
    // E5#32：文件操作走 linkdesk.filesystem——bridge 为唯一入口
    const env = await linkdesk().env.get();
    const src = `${env.appPluginsDir}/.disabled/${pluginId}`;
    const dest = `${env.appPluginsDir}/user/${pluginId}`;
    if (!(await linkdesk().filesystem.exists(src))) {
      throw new Error(`已卸载的插件 "${pluginId}" 未找到`);
    }
    if (await linkdesk().filesystem.exists(dest)) {
      throw new Error(`插件 "${pluginId}" 已存在`);
    }
    await linkdesk().filesystem.copy(src, dest);
    await linkdesk().filesystem.remove(src);

    // E5 归一化：loadPlugin 统一处理 glob 内/外——不再分支判断
    await loadPlugin(pluginId, "reinstall");
    // E5.7#48：主进程三表重扫
    window.linkdesk?.pluginManager?.notifyManifestChanged?.();
    return { success: true };
  } catch (e) {
    return { success: false, error: errMsg(e) };
  }
}

/* ── 获取 viewPlugin（从 registry，导出给外部使用） ── */
import { getViewPlugin } from "./viewRegistry";

/* ═══════════════════════════════════════════════════════════
   P1-5 文件监听 —— 轮询检测新插件
   ═══════════════════════════════════════════════════════════ */

let _watchInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Phase 5h：文件监听——轮询检测新插件目录。
 * 每 2 秒调用 Rust `list_plugin_dirs`。
 * - glob 中的插件（在 import.meta.glob 中）→ loadPlugin（Vite chunk）
 * - glob 外的插件（不在 glob 中）→ loadPlugin（运行时 IPC 路径）
 */
export function startPluginWatcher(): void {
  if (_watchInterval) return;

  _watchInterval = setInterval(async () => {
    try {
      const dirs = await pluginsApi().listDirs();
      for (const dir of dirs) {
        if (loadedPluginIds.has(dir)) continue;
        if (getDisabledList().includes(dir)) continue;

        const manifestKey = Object.keys(pluginManifests).find(
          (k) => extractPluginId(k) === dir
        );
        if (manifestKey) {
          // 已在 Vite glob 中——直接 loadPlugin
          await loadPlugin(dir, "startup");
          log.appendLine(`文件监听发现新插件 "${dir}"——已即时加载`);
        } else {
          await loadPlugin(dir, "install");
        }
      }

      // G16：反向检测——已加载但文件系统已删除 → 自动卸载
      const fsSet = new Set(dirs);
      for (const id of [...loadedPluginIds]) {
        if (!fsSet.has(id) && !getDisabledList().includes(id)) {
          log.appendLine(`插件 "${id}" 目录已手动删除——自动移除注册`);
          unregisterViewPlugin(id);
          loadedPluginIds.delete(id);
          PluginLifecycle.onWillUninstall.fire({ pluginId: id, reason: "uninstall", displayName: id });
          PluginLifecycle.onDidUninstall.fire({ pluginId: id, reason: "uninstall", displayName: id });
        }
      }
    } catch {
      // 静默——polling 失败不影响运行
    }
  }, 2000);

  log.appendLine("文件监听已启动（2s 轮询，Phase 5h）");
}

/** 停止文件监听 */
export function stopPluginWatcher(): void {
  if (_watchInterval) {
    clearInterval(_watchInterval);
    _watchInterval = null;
  }
}

// 导出供 vitest——防止新增贡献类型时漏加 revert（主题/语言/图标主题…）
export { revertThemeIfCurrent, revertLanguageIfCurrent };
