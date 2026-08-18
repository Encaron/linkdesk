/**
 * 插件加载运行时层——加载管线 + 依赖检查 + 延迟激活。
 * E5.8#0d.10-1d：自 loader.ts 拆出——loadPlugin 中枢（glob/IPC 统一入口）。
 * 依赖方向：runtime → contributions（模块解析/数据加载/枚举同步），反向不成立——防环。
 * 生命周期操作（disable/enable/uninstall/install）不在此——见 lifecycle-ops.ts。
 */

import type { PluginManifest } from "../core/api/types";
import { registerViewPlugin } from "./viewRegistry";
import { registerTheme, findTheme } from "../core/services/ui/ThemeEngine";
import type { ThemeContribution } from "../core/api/types";
import { pushToast, TOAST_TTL_ERROR } from "../core/services/ui/NotificationService";
import { reportError } from "../core/services/bootstrap/ErrorService";
// Phase 5h 行为归一化：副作用（iconOrder/toast/config/tab）集中到 lifecycle.ts 消费端
import { PluginLifecycle, onPluginLifecycleChange, type PluginInstallEvent } from "./lifecycle";
import { versionGte } from "../core/utils/plugin/semverUtils";
import {
  pluginsApi,
  log,
  errMsg,
  pluginManifests,
  loadedPluginIds,
  _loadingPromises,
  _deferredPlugins,
  extractPluginId,
  cachePluginMetadata,
  getDisabledList,
} from "./state";
import { normalizeManifest, type OldFormatManifest } from "./manifest";
import {
  parseContributions,
  resolveRuntimePluginRoot,
  runtimeEntryPath,
  resolveViewModule,
  loadPluginComponent,
  fetchPluginDataFile,
  loadThemeContributionData,
  loadLanguageContributionData,
  loadPluginI18nData,
  extractThemeColors,
  syncAppThemeEnum,
  syncAppLanguageEnum,
} from "./contributions";

/* ── 当前应用版本（从 package.json 读取） ── */

/** TODO Phase 6：从 package.json 动态读取（需要 Vite define 或 import.meta.env）。
 *  当前硬编码——发版前手动更新此行。B10 fix：注释说明实际情况。 */
function getAppVersion(): string {
  return "3.0.0";
}

/* ── E5#12：加载管线唯一入口——所有插件（view/data/theme/language）走这里 ── */

/**
 * 插件加载管线——loadPlugin 唯一入口——glob + IPC 统一。
 *
 * 流程：normalizeManifest → parseContributions → 推导 pluginRole → loadPluginComponent
 * 不 import IconBar/SidePanel/TabBar——加载管线不知道 UI 的存在。
 */
async function loadPluginLifecycle(
  pluginId: string,
  manifest: PluginManifest,
  opts?: { skipView?: boolean; pluginRoot?: string },
): Promise<void> {
  // Step 1: 旧格式归一化（纯函数，不 mutate）
  const contributes = normalizeManifest(manifest);

  // Step 2: 解析 contributes → 分发到各 Registry（出错不阻塞其他插件）
  if (contributes) {
    try { await parseContributions(pluginId, contributes, opts?.pluginRoot); }
    catch (e) { console.error(`[loader] parseContributions 失败: ${pluginId}`, e); }
  }

  // Step 3: 旧格式 file 字段——异步 fetch JSON，按 type 分配到 themes/languages
  if (!manifest.contributes?.themes && !manifest.contributes?.languages) {
    const old = manifest as Partial<OldFormatManifest>;
    if (typeof old.file === "string") {
      try {
        const data = await fetchPluginDataFile(pluginId, old.file);
        if (data) {
          const fileCtrb: Record<string, unknown> = {};
          if (data.type === "dark" || data.type === "light") {
            fileCtrb.themes = [{ label: manifest.name, path: old.file, uiTheme: data.type }];
          } else {
            fileCtrb.languages = [{ label: manifest.name, code: old.file.replace(/\.json$/, ""), path: old.file }];
          }
          await parseContributions(pluginId, fileCtrb);
        }
      } catch { /* file 加载失败不阻塞 */ }
    }
  }

  // Step 4: 视图组件加载已归一化到 loadPlugin()——此处不再重复。
  // loadPlugin 根据 isRuntime 决定走 glob loadPluginComponent 或动态 import，
  // loadPluginLifecycle 只负责 manifest 解析 + contributes 分发。
}

/* ── #45：extensionDependencies 检查 ── */

/**
 * 检查插件的 extensionDependencies——所有依赖必须已安装且未被禁用。
 * 共享函数——loadPlugin 和 loadPlugin 已合并处理。
 * @returns true = 依赖满足或无需依赖，false = 缺失（已 toast）
 */
function _checkDependencies(pluginId: string, manifest: PluginManifest): boolean {
  if (!manifest.extensionDependencies?.length) return true;

  const disabled = getDisabledList();
  const installed = new Set<string>();
  for (const k of Object.keys(pluginManifests)) installed.add(extractPluginId(k));
  for (const [id] of _deferredPlugins) installed.add(id);
  for (const id of loadedPluginIds) installed.add(id);

  const missing = manifest.extensionDependencies.filter(
    (dep) => dep !== pluginId && (!installed.has(dep) || disabled.includes(dep)),
  );
  if (missing.length === 0) return true;

  const reason = missing.map((d) => `"${d}"`).join("、");
  pushToast({
    message: `插件 "${manifest.name}" 缺少依赖: ${reason}——已跳过`,
    ttl: TOAST_TTL_ERROR,
  });
  console.warn(`[pluginLoader] 依赖缺失 — "${pluginId}" 需要 ${reason}`);
  return false;
}

/**
 * 插件加载唯一入口。
 * 🔥 E5 归一化：合并运行时路径——glob 内走 Vite 模块，glob 外走 IPC 运行时加载。
 * 调用方不再自己判断"该走哪条路"——一条 loadPlugin 全覆盖。
 */
async function loadPlugin(
  pluginId: string,
  reason: PluginInstallEvent["reason"] = "startup",
  opts?: { skipView?: boolean },
): Promise<void> {
  if (loadedPluginIds.has(pluginId)) return;
  // 🔥 硬约束 13：竞态守卫——两次 concurrent 调用 → 第二次等第一次的 Promise
  if (_loadingPromises.has(pluginId)) { await _loadingPromises.get(pluginId)!; return; }

  const manifestKey = Object.keys(pluginManifests).find(
    (k) => extractPluginId(k) === pluginId
  );
  const isRuntime = !manifestKey;

  const promise = (async () => {
  // ═══ Step 1: 加载 manifest ═══
  let manifest: PluginManifest;
  if (isRuntime) {
    try {
      const raw = await pluginsApi().readManifest(pluginId);
      manifest = JSON.parse(raw);
    } catch (e) {
      console.warn(`[pluginLoader] 运行时插件 "${pluginId}" 读取 plugin.json 失败: ${errMsg(e)}`);
      return;
    }
  } else {
    try {
      manifest = pluginManifests[manifestKey];
    } catch {
      pushToast({ message: `插件 "${pluginId}" 的 plugin.json 格式错误，已跳过` });
      console.warn(`[pluginLoader] plugin.json 格式错误 — "${pluginId}"`);
      return;
    }
  }

  // ═══ Step 2: 版本 + 依赖检查（共享） ═══
  if (manifest.minAppVersion) {
    const appVer = getAppVersion();
    if (!versionGte(appVer, manifest.minAppVersion)) {
      pushToast({
        message: `插件 "${manifest.name}" 需要应用版本 ≥${manifest.minAppVersion}（当前 ${appVer}），已跳过`,
        ttl: TOAST_TTL_ERROR,
      });
      return;
    }
  }
  if (!_checkDependencies(pluginId, manifest)) return;

  // B2 fix: 缓存元数据——glob 外的插件也入缓存，卸载后仍可浏览详情
  cachePluginMetadata(pluginId, manifest, "installed");

  // ═══ Step 3: 加载 JS 入口 + statusBar ═══
  let viewComponent: React.ComponentType<{ isActive: boolean }> | undefined;
  let statusBarComponent: React.ComponentType | undefined;
  let runtimePluginRoot: string | undefined;

  if (isRuntime) {
    // ── 运行时：动态 import（/fs/ 或 linkdesk://）──
    // E5.7 生命周期契约：pluginRoot 不绑 entry——entryless 插件（纯 views/commands 贡献）
    // 重装后 views 注册兜底（parseContributions）同样依赖它做动态 import。
    try {
      runtimePluginRoot = await resolveRuntimePluginRoot(pluginId);
    } catch (e) {
      console.warn(`[pluginLoader] 运行时插件 "${pluginId}" 根目录解析失败:`, e);
      // pluginRoot 保持 undefined——views 注册走 ❌ 分支诚实降级
    }
    const entryPath = runtimeEntryPath(manifest, pluginId, import.meta.env.DEV);
    if (entryPath) {
      try {
        if (!runtimePluginRoot) throw new Error("根目录解析失败");
        const module = await resolveViewModule(pluginId, entryPath, runtimePluginRoot);
        viewComponent = module?.default;
        if (!viewComponent) {
          console.warn(`[pluginLoader] 运行时插件 "${pluginId}" 未导出 default 组件`);
        }

        // statusBar——尝试多条路径
        const statusBarPaths = [
          "statusBar.tsx",
          "src/statusBar.tsx",
          "src/components/statusBar.tsx",
        ];
        for (const p of statusBarPaths) {
          try {
            const sbm = await import(/* @vite-ignore */ `${runtimePluginRoot}/${p}`);
            statusBarComponent = sbm.default;
            break;
          } catch { /* 路径不存在——继续试下一条 */ }
        }
      } catch (e) {
        console.warn(`[pluginLoader] 运行时插件 "${pluginId}" 加载 JS 失败: ${errMsg(e)}`);
        pushToast({
          message: `插件 "${manifest.name}" 加载失败——可能未构建。运行 npm run build:plugins`,
          source: pluginId,
          severity: "warning",
          ttl: TOAST_TTL_ERROR,
        });
        // 不阻断——没有视图组件仍可贡献 commands/menus/configuration
      }
    }
  } else {
    // ── glob 内：走 loadPluginComponent ──
    const role = manifest.pluginRole ?? (!manifest.entry && (normalizeManifest(manifest) || manifest.contributes) ? "data" : undefined);
    if (role !== "data" && manifest.entry && !opts?.skipView) {
      try { await loadPluginComponent(pluginId, manifest); }
      catch (e) { console.error(`[loader] 加载视图组件失败: ${pluginId}`, e); }
    }
  }

  // ═══ Step 4: 注册视图（运行时）/ loadPluginComponent 已注册（glob） ═══
  if (isRuntime && viewComponent) {
    registerViewPlugin({
      pluginId,
      manifest,
      component: viewComponent,
      statusBarComponent,
    });
    log.appendLine(`[OK] 运行时视图插件 "${manifest.name}" (${pluginId}) 已注册`);
  }

  // ═══ Step 5: 解析 contributes → 分发各 Registry ═══
  await loadPluginLifecycle(pluginId, manifest, {
    skipView: isRuntime ? true : opts?.skipView,
    pluginRoot: runtimePluginRoot,
  });

  // ═══ Step 6: 主题/语言数据异步加载 ═══
  if (manifest.contributes?.themes) {
    await loadThemeContributionData(pluginId, manifest);
    // 运行时：glob 外的插件需 fetch 主题颜色数据
    if (isRuntime) {
      const themeList = manifest.contributes.themes as ThemeContribution[];
      for (const tc of themeList) {
        if (findTheme(tc.label)) continue;
        try {
          const url = `${await resolveRuntimePluginRoot(pluginId)}/${tc.path}`;
          const response = await fetch(url);
          if (!response.ok) continue;
          const data = await response.json();
          const themeType = (data.type as "dark" | "light") ?? tc.uiTheme;
          const colors = extractThemeColors(data);
          registerTheme({ name: tc.label, type: themeType as "dark" | "light", colors }, pluginId);
        } catch { /* 静默 */ }
      }
    }
  }
  if (manifest.contributes?.languages) {
    await loadLanguageContributionData(pluginId, manifest);
  }
  if (manifest.contributes?.i18n) {
    await loadPluginI18nData(pluginId, manifest);
  }

  // ═══ Step 7: 收尾 ═══
  applyPostLoadSteps(pluginId, manifest, reason);
  })();
  _loadingPromises.set(pluginId, promise);
  try { await promise; }
  finally { _loadingPromises.delete(pluginId); }
}

/**
 * 加载后收敛步骤——loadPlugin 和 loadPlugin 内部统一处理。
 * 🔥 这不是消重复——是堵缝。已归一化——loadPlugin 同时覆盖 glob 和运行时。
 * 🔥 E5 归一化：loadPlugin 单一路径，不再有遗漏。
 * 新增能力只需改 loadPlugin 一处。
 * 同类 bug：Bug 3（runtime 无侧栏）、L6（runtime 无主题颜色）、#34 bug 6（重装不显示）。
 */
function applyPostLoadSteps(pluginId: string, manifest: PluginManifest, reason: PluginInstallEvent["reason"]): void {
  loadedPluginIds.add(pluginId);
  syncAppThemeEnum();
  syncAppLanguageEnum();
  PluginLifecycle.onDidInstall.fire({ pluginId, manifest, reason });
}

/* ── #44：延迟激活——activationEvents 插件按需 import ── */

/**
 * 激活之前延迟加载的插件——import JS → registerViewPlugin → fire onDidInstall。
 * 调用时机：onCommand 执行前 / onFileOpen / onPortOpen 等触发源。
 */
async function activatePlugin(pluginId: string): Promise<boolean> {
  const manifest = _deferredPlugins.get(pluginId);
  if (!manifest) return false; // 不是延迟插件——可能已激活或不存在

  try {
    await loadPluginComponent(pluginId, manifest);
    _deferredPlugins.delete(pluginId);
    // 不调 applyPostLoadSteps——loadedPluginIds 已有、onDidInstall 已发过（startup 静默）、
    // 图标排序已正确。只需通知 UI 刷新（例如图标从灰变亮）
    syncAppThemeEnum();
    syncAppLanguageEnum();
    onPluginLifecycleChange.fire();
    console.log(`[pluginLoader] ⚡ 延迟激活 "${pluginId}"`);
    log.appendLine(`⚡ 延迟激活 "${pluginId}"`);
    return true;
  } catch (e) {
    reportError({ message: `插件 "${manifest.name ?? pluginId}" 激活失败: ${errMsg(e)}`, source: pluginId, error: e });
    return false;
  }
}

/** 根据 commandId 查找所属的延迟插件——executeCommand 预激活用 */
function findDeferredByCommand(commandId: string): string | undefined {
  for (const [pluginId, manifest] of _deferredPlugins) {
    const events = manifest.activationEvents ?? [];
    for (const ev of events) {
      if (ev === `onCommand:${commandId}` || ev === "*") return pluginId;
    }
  }
  return undefined;
}

export { loadPlugin, activatePlugin, findDeferredByCommand };
