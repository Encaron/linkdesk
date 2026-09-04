/**
 * 插件加载运行时层——加载管线 + 依赖编排 + 延迟激活。
 * E5.8#0d.10-1d：自 loader.ts 拆出——loadPlugin 中枢（glob/IPC 统一入口）。
 * 依赖方向：runtime → contributions/dependencies（纯函数，反向不成立）——防环。
 * E5.8#14：依赖编排——dep-check（环 fail / 缺 park）+ 挂起注册表 + sweep 补载（拓扑序激活）；
 *   纯逻辑在 dependencies.ts，本模块持可变编排（_pendingPlugins 由 state.ts 共享真源）。
 * 生命周期操作（disable/enable/uninstall/install）不在此——见 lifecycle-ops.ts。
 */

import i18n from "../../i18n"; // E5.8#37.9：markLoadFailed 失败原因壳 t() 解析（诊断文案也是用户可见文本）
import type { PluginManifest } from "../../core/api/types";
import { registerViewPlugin } from "../contributions/viewRegistry";
import { registerTheme, findTheme } from "../../core/services/ui/ThemeEngine";
import type { ThemeContribution } from "../../core/api/types";
import { pushToast, TOAST_TTL_ERROR } from "../../core/services/ui/NotificationService";
import { reportError } from "../../core/services/bootstrap/ErrorService";
// Phase 5h 行为归一化：副作用（iconOrder/toast/config/tab）集中到 lifecycle.ts 消费端
import { PluginLifecycle, onPluginLifecycleChange, type PluginInstallEvent } from "../lifecycle/lifecycle";
// E5.8#11：状态机——loading/failed/active 迁移 + 失败原因记录（诊断面）
// E5.8#14：parkPending——缺依赖挂起（loading→pending + pendingReason）
// E5.8#15：orphanPlugin——依赖消失连带卸载（加载完成复核用）
import { markLoadStarted, markLoadSuccess, markLoadFailed, parkPending, orphanPlugin } from "./loadState";
// E5.8#14：#14 依赖编排纯函数（requires 解析 / 缺失判定 / 图级环检测）
// E5.8#15：formatPendingReason——挂起原因文案单源（park + orphan 共用）
import { findMissingDeps, detectDependencyCycle, formatPendingReason } from "./dependencies";
import { versionGte } from "../../core/utils/plugin/semverUtils";
import {
  pluginsApi,
  log,
  errMsg,
  pluginManifestRaw,
  loadedPluginIds,
  _loadingPromises,
  _deferredPlugins,
  _pendingPlugins,
  extractPluginId,
  cachePluginMetadata,
  getDisabledList,
  getLoadedManifest,
  getManifestById,
  isBundlePlugin, // E6#7（1.2-4）：目录含 index.bundle.js → runtimeEntryPath 传 bundle 分支
} from "./state";
import { normalizeManifest, hasSidebarContainers, type OldFormatManifest } from "../discovery/manifest";
import { effectiveActivationEvents } from "./activation"; // #9g：延迟匹配按「显式 ?? 推断」生效事件
import { parseManifestJson } from "../jsonc"; // E6#55：作者 plugin.json JSONC——唯一解析入口
import {
  parseContributions,
  resolveRuntimePluginRoot,
  runtimeEntryPath,
  resolveViewModule,
  loadPluginComponent,
  fetchPluginDataFile,
  loadThemeContributionData,
  loadIconThemeContributionData,
  loadLanguageContributionData,
  loadPluginI18nData,
  extractThemeColors,
  syncAppThemeEnum,
  syncAppLanguageEnum,
  syncIconThemeEnum,
} from "../contributions/contributions";

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

/* ── E5.8#14：依赖编排——环 fail / 缺 park / 就绪 sweep（拓扑序激活） ── */

/** 已知 manifest 面——环检测走闭包的数据源（发现索引 + 延迟 + 挂起）。
 *  E6#9c：manifestIndex（readAllManifests 水合，glob + 运行时全覆盖）单一真源；
 *  延迟/挂起留兜底（环 = 相互依赖未就绪，必有挂起方，#14 分析成文）。 */
function getKnownManifest(pluginId: string): PluginManifest | undefined {
  return getManifestById(pluginId) ?? _deferredPlugins.get(pluginId) ?? _pendingPlugins.get(pluginId);
}

/** 缺依赖挂起——PENDING + pendingReason + 挂起注册表（manifest 留存供 sweep 重查）。
 *  不弹 toast——瞬态等待（#15.5 marketplace PENDING 面 + 启动挂起诊断日志负责用户可见）。 */
function parkForDependencies(pluginId: string, manifest: PluginManifest, missing: string[]): void {
  const reason = formatPendingReason(missing);
  _pendingPlugins.set(pluginId, manifest);
  parkPending(pluginId, reason);
  log.appendLine(`⏸ 插件 "${manifest.name ?? pluginId}" 缺依赖挂起——${reason}`);
}

/**
 * 扫描挂起队列——依赖就绪的插件补载（拓扑序激活的引擎：扫描序不再影响激活顺序）。
 * 触发点 = 每次 loadPlugin 完成（install/enable/reinstall 都走 loadPlugin → 自动覆盖）。
 * 不 export——零外部消费方（knip 实锤）；内部 loadPlugin 完成点自动触发。
 * 收敛：每轮 while 至少激活一个挂起插件才继续；环已在 dep-check fail-loud → 挂起互锁不会发生。
 * guard 兜底（1000）防极端竞态（sweep await 期间依赖被卸载）死循环。
 * E5.8#15：用户显式禁用优先——被禁用的消费插件不被依赖出现事件自动激活（禁用意图优先于依赖编排，
 * 否则被禁用插件"复活" = 体感无差破坏）。删除其挂起登记——重新启用时 enablePlugin 走 loadPlugin 重查。
 */
async function sweepPendingDependencies(): Promise<void> {
  let progressed = true;
  let guard = 0;
  while (progressed && guard++ < 1000) {
    progressed = false;
    for (const [id, manifest] of [..._pendingPlugins]) {
      if (loadedPluginIds.has(id)) { _pendingPlugins.delete(id); continue; } // 已激活——清理僵尸登记
      if (getDisabledList().includes(id)) { _pendingPlugins.delete(id); continue; } // 禁用优先——不自动激活
      if (findMissingDeps(id, manifest).length > 0) continue; // 依赖仍未就绪
      _pendingPlugins.delete(id);
      await loadPlugin(id, "startup");
      progressed = true;
    }
  }
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

  const manifestKey = Object.keys(pluginManifestRaw).find(
    (k) => extractPluginId(k) === pluginId
  );
  const isRuntime = !manifestKey;

  const promise = (async () => {
  // E5.8#11：状态机——loading（加载开始）
  markLoadStarted(pluginId);
  // ═══ Step 1: 加载 manifest ═══
  let manifest: PluginManifest;
  if (isRuntime) {
    try {
      const raw = await pluginsApi().readManifest(pluginId);
      manifest = parseManifestJson(raw);
    } catch (e) {
      console.warn(`[pluginLoader] 运行时插件 "${pluginId}" 读取 plugin.json 失败: ${errMsg(e)}`);
      markLoadFailed(pluginId, `plugin.json 读取失败: ${errMsg(e)}`);
      return;
    }
  } else {
    // E6#9c：manifest 内容走 manifestIndex（plugins:readAllManifests 水合——listAll 已同扫一致）；
    // glob 内容仅作未水合兜底（独立单测/极端时序），两源同盘同内容。
    try {
      manifest = getManifestById(pluginId) ?? parseManifestJson(pluginManifestRaw[manifestKey]);
    } catch {
      pushToast({ message: `插件 "${pluginId}" 的 plugin.json 格式错误，已跳过` });
      console.warn(`[pluginLoader] plugin.json 格式错误 — "${pluginId}"`);
      markLoadFailed(pluginId, i18n.t("plugin.json 格式错误"));
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
      markLoadFailed(pluginId, `需要应用版本 ≥${manifest.minAppVersion}（当前 ${appVer}）`);
      return;
    }
  }
  // E5.8#14：依赖编排——环检测 fail-loud（自环 + 传递环）；缺依赖挂起 PENDING（等待，非失败）
  const cycle = detectDependencyCycle(pluginId, manifest, getKnownManifest);
  if (cycle !== null) {
    pushToast({
      message: `插件 "${manifest.name}" 依赖环: ${cycle}——已跳过`,
      ttl: TOAST_TTL_ERROR,
    });
    console.warn(`[pluginLoader] 依赖环 — "${pluginId}" ${cycle}`);
    markLoadFailed(pluginId, `依赖环: ${cycle}`);
    return;
  }
  const missing = findMissingDeps(pluginId, manifest);
  if (missing.length > 0) {
    parkForDependencies(pluginId, manifest, missing);
    return;
  }

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
    // #9g 按需激活：延迟加载（skipView）时跳过 JS import——只解析根（Step5 pluginRoot 依赖），
    // entry 在 activatePlugin 首次触发事件时才 import（启动注册-only，对标 VS Code 延迟激活）。
    // E6#7：bundle 插件入口恒 index.bundle.js（isBundlePlugin 从启动发现水合）
    const entryPath = opts?.skipView ? undefined : runtimeEntryPath(manifest, pluginId, import.meta.env.DEV, { bundle: isBundlePlugin(pluginId) });
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
  } else if (!manifest.entry && hasSidebarContainers(manifest)) {
    // 🔥 E5.8#37.9.2.3：entryless 视图插件也进 viewRegistry——修复图标栏数据源缺口。
    // 此前 getViewPlugins() 只含 entry 插件 → entryless 插件声明 appearsIn.iconBar 被静默丢弃
    // （panel-demo/demo-en 未加 entry 前的真实现象）。组件由 ViewContainerService 经
    // contributes.views[].render 加载，本注册表只作元数据/图标入口（component 为零，可选项）。
    // 运行时与 glob 两路共用此分支（entryless 运行时插件同样能渲染 views）。
    registerViewPlugin({ pluginId, manifest });
    log.appendLine(`[OK] entryless 视图插件 "${manifest.name}" (${pluginId}) 已注册（图标栏入口）`);
  } else if (opts?.skipView && manifest.entry) {
    // #9g 按需激活：延迟 entry 插件注册 component-less 占位（component 可选项——渲染不读本字段，
    // 池 PluginComponent 独立 glob 解析）。保图标栏/侧栏容器/标签身份（tabBehavior/identityField）等
    // 声明驱动的 UI 表面在启动期照常可见；JS 首用（onView/onFileOpen/onCommand 等）再激活升级成
    // componentful（registerViewPlugin 同版本 stub→实 升级）。对标 VS Code：manifest 贡献启动可见，
    // extension 代码激活才跑。
    registerViewPlugin({ pluginId, manifest });
    log.appendLine(`[OK] 延迟激活插件 "${manifest.name}" (${pluginId}) 注册元数据——JS 首用再 import`);
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
  if (manifest.contributes?.iconThemes) {
    await loadIconThemeContributionData(pluginId, manifest);
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
  // E5.8#15：加载完成复核——依赖在加载期间被卸载的竞态收敛（unloadPlugin 连带只查 loadedPluginIds，
  // 加载中插件不在其内 → 错过）。插件已激活但依赖已消失 → 连带降级挂起（等依赖回归自动补载），
  // 维持"ACTIVE 插件依赖必全"不变式——对齐状态机"卸载必须总能完成"的收敛精神。
  const loadedManifest = getLoadedManifest(pluginId);
  const raceMissing = loadedManifest && loadedPluginIds.has(pluginId)
    ? findMissingDeps(pluginId, loadedManifest)
    : [];
  if (raceMissing.length > 0) {
    orphanPlugin(pluginId, raceMissing);
  }
  // E5.8#14：依赖编排——每加载完成一个插件，扫描挂起队列，依赖就绪者补载（拓扑序激活，扫描序不再影响激活）
  await sweepPendingDependencies();
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
  // E5.8#11：状态机——active（注册全量生效）在 onDidInstall 之前迁移（L6b：事件只在合法迁移后发）
  markLoadSuccess(pluginId);
  syncAppThemeEnum();
  syncAppLanguageEnum();
  syncIconThemeEnum();
  PluginLifecycle.onDidInstall.fire({ pluginId, manifest, reason });
}

/* ── #44 + #9g：延迟激活——activationEvents 插件按需 import ── */

/**
 * 激活之前延迟加载的插件——import JS → 注册表占位升级 componentful。
 * glob 内 = loadPluginComponent（含 statusBar glob）；glob 外（运行时/市场安装）=
 * resolvePluginRoot + import entry + statusBar 探路径（镜像 loadPlugin Step3 加载语义）。
 * 激活即注册表升级（同版本 component-less 占位 → 实组件——registerViewPlugin 允许 stub 升级）。
 * 不调 applyPostLoadSteps——loadedPluginIds 已有、onDidInstall 已发过（startup 静默），只通知 UI 刷新。
 */
/** 激活中插件集——并发事件防双跑（await import 完成前 delete 未发生，两次背靠背命中会双 import）。
 *  #9g 验证「激活过不重载」：首跑成功出 _deferredPlugins + 出 _activating；次跑见 manifest 空即 no-op。 */
const _activating = new Set<string>();

async function activatePlugin(pluginId: string): Promise<boolean> {
  const manifest = _deferredPlugins.get(pluginId);
  if (!manifest) return false; // 不是延迟插件——可能已激活或不存在
  if (_activating.has(pluginId)) return false; // 已在激活中——并发事件让首跑完成，语义一致

  _activating.add(pluginId);
  try {
    if (Object.keys(pluginManifestRaw).some((k) => extractPluginId(k) === pluginId)) {
      // glob 内（dev/源码内置）——loadPluginComponent 内 registerViewPlugin 升级占位
      await loadPluginComponent(pluginId, manifest);
    } else {
      // 运行时（打包/市场安装）——glob 模块表无此插件，走根解析 + 动态 import。
      // 与 Step3 运行时分支加载语义一致；差异 = 激活失败即抛上报（用户触发的激活不应静默降级）。
      const runtimePluginRoot = await resolveRuntimePluginRoot(pluginId);
      // E6#7：bundle 插件入口恒 index.bundle.js（同 Step3 分支）
      const entryPath = runtimeEntryPath(manifest, pluginId, import.meta.env.DEV, { bundle: isBundlePlugin(pluginId) });
      let viewComponent: React.ComponentType<{ isActive: boolean }> | undefined;
      let statusBarComponent: React.ComponentType | undefined;
      if (entryPath && runtimePluginRoot) {
        const module = await resolveViewModule(pluginId, entryPath, runtimePluginRoot);
        viewComponent = module?.default;
        if (module && !viewComponent) {
          console.warn(`[pluginLoader] 运行时插件 "${pluginId}" 未导出 default 组件`);
        }
        for (const p of ["statusBar.tsx", "src/statusBar.tsx", "src/components/statusBar.tsx"]) {
          try {
            const sbm = await import(/* @vite-ignore */ `${runtimePluginRoot}/${p}`);
            statusBarComponent = sbm.default;
            break;
          } catch { /* 路径不存在——继续试下一条 */ }
        }
      }
      registerViewPlugin({ pluginId, manifest, component: viewComponent, statusBarComponent });
    }
    _deferredPlugins.delete(pluginId);
    // 图标/枚举刷新（startup 已静默，此刻才需通知 UI 拾起激活态）
    syncAppThemeEnum();
    syncAppLanguageEnum();
    syncIconThemeEnum();
    onPluginLifecycleChange.fire();
    console.log(`[pluginLoader] ⚡ 延迟激活 "${pluginId}"`);
    log.appendLine(`⚡ 延迟激活 "${pluginId}"`);
    return true;
  } catch (e) {
    reportError({ message: `插件 "${manifest.name ?? pluginId}" 激活失败: ${errMsg(e)}`, source: pluginId, error: e });
    return false;
  } finally {
    _activating.delete(pluginId);
  }
}

/**
 * #9g ② 事件路由器——发火事件命中任一延迟插件的生效事件（显式 ?? 推断）即激活。
 * 触发源统一经 activation.fireActivationEvent 发火；loader 初始化把本函数挂成总线常驻处理器。
 * 幂等：#44 语义——激活成功即出 _deferredPlugins，二次命中为 no-op（激活过不重载）。
 * 遍历用快照——activatePlugin 会 delete 当前键（边遍历边删安全）。
 */
async function activateDeferredByEvent(event: string): Promise<void> {
  for (const [pluginId, manifest] of [..._deferredPlugins]) {
    const events = effectiveActivationEvents(manifest);
    if (events.some((ev) => ev === event || ev === "*")) {
      await activatePlugin(pluginId);
    }
  }
}

export { loadPlugin, activateDeferredByEvent };
